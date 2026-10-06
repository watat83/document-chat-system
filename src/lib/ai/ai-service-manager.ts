import { metricTokens } from './usage';
import {
  UnifiedCompletionRequest,
  UnifiedCompletionResponse,
  UnifiedEmbeddingRequest,
  UnifiedEmbeddingResponse,
  UnifiedStreamRequest,
  UnifiedStreamChunk
} from './interfaces/types';
import {
  IAIService,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamRequest,
  StreamChunk,
  HealthStatus,
  ServiceMetrics
} from './interfaces/service-contracts';
import MiddlewareManager, { RequestContext, ResponseContext } from './middleware';
import { LoggingMiddleware, CostControlMiddleware, MonitoringMiddleware } from './middleware/built-in';
import { AIProviderRegistry, ProviderConfig } from './registry';
import { AIRequestRouter } from './routing';
import { CircuitBreakerManager } from './circuit-breaker';
import { AIFallbackStrategy, FallbackResult } from './fallback';
import { AIProviderAdapter } from './interfaces';
import { AIConfiguration } from './config';
import { AIMetricsIntegration } from './monitoring';
import { VercelAIAdapter } from './providers/vercel-ai-adapter';
import { AnthropicAdapter } from './providers/anthropic-adapter';
import { OpenAIAdapter } from './providers/openai-adapter';
import { SmartOpenRouterAdapter } from './providers/smart-openrouter-adapter';
import { ImageRouterAdapter } from './providers/imagerouter-adapter';
import { imageRouterMetrics } from './providers/imagerouter-metrics';
import { imageRouterOptimizer } from './providers/imagerouter-optimizer';
import { imageRouterCache } from './providers/imagerouter-cache';
import { DemoAdapter } from './providers/demo-adapter';

export interface AIServiceConfig {
  enableFallback: boolean;
  enableCircuitBreaker: boolean;
  enableCaching: boolean;
  defaultTimeout: number;
  maxConcurrentRequests: number;
  enableVercelAI?: boolean;
}

export interface AIMetrics {
  provider: string;
  model: string;
  operation: 'completion' | 'embedding' | 'stream';
  latency: number;
  tokenCount: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
  success: boolean;
  error?: string;
  metadata: {
    taskType: import('./interfaces').TaskType;
    [key: string]: any;
    userId?: string;
    organizationId?: string;
  };
}

export class AIServiceManager implements IAIService {
  private static instance: AIServiceManager;
  private registry: AIProviderRegistry;
  private router: AIRequestRouter;
  private circuitBreaker: CircuitBreakerManager;
  private fallbackStrategy: AIFallbackStrategy;
  private aiConfig: AIConfiguration;
  private metricsIntegration: AIMetricsIntegration;
  private metrics: AIMetrics[] = [];
  private middlewareManager: MiddlewareManager;
  private vercelAdapter?: VercelAIAdapter;
  private startTime = Date.now();
  private readonly ready: Promise<void>;

  constructor(private config: AIServiceConfig = {
    enableFallback: true,
    enableCircuitBreaker: true,
    enableCaching: true,
    defaultTimeout: 30000,
    maxConcurrentRequests: 100
  }) {
    this.aiConfig = AIConfiguration.getInstance();
    this.registry = new AIProviderRegistry();
    this.router = new AIRequestRouter(this.registry);
    this.circuitBreaker = new CircuitBreakerManager({ ...this.aiConfig.getCircuitBreakerConfig(), expectedErrorRate: 0.1 });
    this.fallbackStrategy = new AIFallbackStrategy(
      this.registry,
      this.router,
      this.circuitBreaker,
      this.aiConfig.getFallbackConfig()
    );
    this.metricsIntegration = new AIMetricsIntegration();
    this.middlewareManager = new MiddlewareManager();
    this.initializeMiddleware();
    this.initializeVercelAI();

    // Initialize providers asynchronously (don't await in constructor)
    this.ready = this.initializeDefaultProviders().catch(error => {
      console.error('Failed to initialize default providers:', error);
    });
  }

  /**
   * Get singleton instance of AIServiceManager
   */
  static getInstance(config?: AIServiceConfig): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager(config);
    }
    return AIServiceManager.instance;
  }

  /**
   * Initialize all providers and wait for completion
   * Use this method when you need to ensure all providers are ready before proceeding
   */
  async initialize(): Promise<void> {
    await this.ready;
  }

  registerProvider(
    name: string,
    adapter: AIProviderAdapter,
    config?: ProviderConfig
  ): void {
    this.registry.register(name, adapter, config);
  }

  /**
   * Auto-initialize providers based on environment configuration
   * Using only OpenRouter (with 100+ models including Anthropic) and OpenAI providers
   */
  async initializeDefaultProviders(): Promise<void> {
    const { ai: aiEnvConfig } = await import('@/lib/config/env');

    // Initialize OpenRouter provider - HIGHEST PRIORITY (includes 100+ models including Anthropic)
    const openrouterConfig = this.aiConfig.getProviderConfig('openrouter');
    const openrouterApiKey = openrouterConfig?.apiKey || aiEnvConfig.openrouterApiKey;
    console.log('🔑 OpenRouter API key from env:', openrouterApiKey ? 'SET' : 'NOT SET');
    if (openrouterApiKey) {
      try {
        const openrouterAdapter = new SmartOpenRouterAdapter({
          apiKey: openrouterApiKey,
          appName: openrouterConfig?.appName ?? aiEnvConfig.openrouterAppName,
          siteUrl: openrouterConfig?.siteUrl ?? aiEnvConfig.openrouterSiteUrl,
          enableSmartRouting: openrouterConfig?.enableSmartRouting ?? aiEnvConfig.openrouterSmartRouting,
          costOptimization: openrouterConfig?.costOptimization ?? aiEnvConfig.openrouterCostOptimization,
          maxRetries: 3,
          timeout: 30000
        });

        await openrouterAdapter.initialize();

        this.registry.register('openrouter', openrouterAdapter, {
          enabled: true,
          priority: 10, // HIGHEST PRIORITY - Default provider with 100+ models
          maxConcurrentRequests: 100, // Higher capacity due to multi-provider routing
          healthCheckInterval: 120000, // 2 minutes
        });

        console.log('✅ Initialized SmartOpenRouter provider (100+ models including Anthropic)');
      } catch (error) {
        console.error('❌ Failed to initialize SmartOpenRouter provider:', error);
      }
    } else {
      console.warn('⚠️  OpenRouter API key not found - SmartOpenRouter provider not initialized');
    }

    // Initialize OpenAI provider - Secondary priority for direct OpenAI access
    const openaiConfig = this.aiConfig.getProviderConfig('openai');
    const openaiApiKey = openaiConfig?.apiKey || aiEnvConfig.openaiApiKey;
    if (openaiApiKey) {
      try {
        const openaiAdapter = new OpenAIAdapter({
          apiKey: openaiApiKey,
          organizationId: openaiConfig?.organizationId || aiEnvConfig.openaiOrganizationId,
          maxRetries: openaiConfig?.maxRetries || 3,
          timeout: openaiConfig?.timeout || 30000
        });

        this.registry.register('openai', openaiAdapter, {
          enabled: true,
          priority: 9, // Secondary priority - Direct OpenAI access
          maxConcurrentRequests: 50,
          healthCheckInterval: 60000
        });

        console.log('✅ Initialized OpenAI provider (direct access)');
      } catch (error) {
        console.error('❌ Failed to initialize OpenAI provider:', error);
      }
    } else {
      console.warn('⚠️  OpenAI API key not found - OpenAI provider not initialized');
    }

    const anthropicConfig = this.aiConfig.getProviderConfig('anthropic');
    const anthropicApiKey = anthropicConfig?.apiKey || aiEnvConfig.anthropicApiKey;
    if (anthropicApiKey) {
      try {
        const adapter = new AnthropicAdapter({ apiKey: anthropicApiKey, maxRetries: anthropicConfig?.maxRetries ?? 3, timeout: anthropicConfig?.timeout ?? 30000 });
        this.registry.register('anthropic', adapter, { enabled: true, priority: 8, maxConcurrentRequests: 50, healthCheckInterval: 60000 });
      } catch (error) { console.error('Failed to initialize Anthropic provider', error); }
    }

    // Initialize ImageRouter provider if API key is available
    const { imageRouter: imageRouterConfig } = await import('@/lib/config/env');
    const imageRouterApiKey = imageRouterConfig.apiKey;
    console.log('🎨 ImageRouter API key from env:', imageRouterApiKey ? 'SET' : 'NOT SET');
    if (imageRouterApiKey) {
      try {
        const imageRouterAdapter = new ImageRouterAdapter({
          apiKey: imageRouterApiKey,
          baseUrl: imageRouterConfig.baseUrl,
          timeout: imageRouterConfig.timeout,
          maxRetries: imageRouterConfig.maxRetries,
          retryDelay: imageRouterConfig.retryDelay,
          rateLimit: imageRouterConfig.rateLimit,
          costOptimization: imageRouterConfig.costOptimization,
          defaultModels: imageRouterConfig.defaultModels,
          defaultQuality: imageRouterConfig.defaultQuality,
          defaultResponseFormat: imageRouterConfig.defaultResponseFormat,
          caching: imageRouterConfig.caching
        });

        await imageRouterAdapter.initialize();

        this.registry.register('imagerouter', imageRouterAdapter, {
          enabled: true,
          priority: 7, // Medium priority - Specialized provider for media generation
          maxConcurrentRequests: 30, // Based on ImageRouter rate limits
          healthCheckInterval: 180000, // 3 minutes - longer for media generation
          costMultiplier: 2.0 // Media generation is typically more expensive
        });

        console.log('✅ Initialized ImageRouter provider for media generation');
      } catch (error) {
        console.error('❌ Failed to initialize ImageRouter provider:', error);
      }
    } else {
      console.warn('⚠️  ImageRouter API key not found - ImageRouter provider not initialized');
    }

    if (process.env.NODE_ENV !== 'production' && process.env.AI_ENABLE_DEMO === 'true') {
      const demoAdapter = new DemoAdapter({ organizationId: 'demo', simulateLatency: true, minLatency: 500, maxLatency: 1500, errorRate: 0 });
      await demoAdapter.initialize();
      this.registry.register('demo', demoAdapter, { enabled: true, priority: 0, healthCheckInterval: 0 });
    }

  }

  /**
   * Initialize Vercel AI SDK integration
   */
  private initializeVercelAI(): void {
    if (this.config.enableVercelAI || this.aiConfig.isVercelEnabled()) {
      try {
        const vercelConfig = this.aiConfig.getVercelConfig();
        this.vercelAdapter = new VercelAIAdapter(this.router, {
          enableStreaming: vercelConfig.useFor.includes('streaming'),
          enableFunctionCalling: vercelConfig.enableFunctionCalling,
          enableVision: vercelConfig.enableVision,
          fallbackToOurSystem: vercelConfig.fallbackToOurSystem,
          costLimits: vercelConfig.costLimits
        });

        // This wrapper uses the router itself, so registering it would cause recursive routing.
        console.log('Vercel AI SDK integration initialized successfully');
      } catch (error) {
        console.warn('Failed to initialize Vercel AI SDK:', error);
      }
    }
  }

  /**
   * Get Vercel-optimized service for React components and enhanced features
   */
  getVercelOptimizedService(): VercelAIAdapter | null {
    return this.vercelAdapter || null;
  }

  // Enhanced interface methods use the same execution path as the unified API.
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const started = Date.now();
    const response = await this.generateCompletion({ ...request, messages: request.messages.map(message => { if (message.role === 'tool') throw new Error('Tool result messages are not supported by this unified adapter'); return { role: message.role, content: message.content }; }), model: request.model ?? 'balanced', metadata: { ...request.metadata, provider: request.provider } });
    return {
      ...response, role: 'assistant', provider: response.metadata.provider,
      latency: Date.now() - started, cost: response.metadata.cost ?? 0,
      id: response.metadata.generationId ?? crypto.randomUUID(), created: new Date(),
    };
  }

  async *stream(request: StreamRequest): AsyncGenerator<StreamChunk> {
    for await (const chunk of this.streamCompletion({ ...request, messages: request.messages.map(message => { if (message.role === 'tool') throw new Error('Tool result messages are not supported by this unified adapter'); return { role: message.role, content: message.content }; }), model: request.model ?? 'balanced', metadata: { ...request.metadata, provider: request.provider } })) {
      yield { content: chunk.content, role: 'assistant', metadata: chunk.metadata };
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await this.generateEmbedding({ ...request, model: request.model ?? 'embedding-small', metadata: { ...request.metadata, provider: request.provider } });
    const vector = response.embedding as number[];
    return { embedding: vector, model: response.model, provider: response.metadata.provider, dimensions: response.metadata.dimensions, usage: response.usage, cost: response.metadata.cost ?? 0, metadata: response.metadata };
  }

  async batchEmbed(request: import('./interfaces/service-contracts').BatchEmbeddingRequest): Promise<import('./interfaces/service-contracts').BatchEmbeddingResponse> {
    const responses = [];
    for (const text of request.texts) responses.push(await this.embed({ ...request, text }));
    return {
      embeddings: responses.map(response => response.embedding), model: responses[0]?.model ?? request.model ?? 'embedding-small',
      provider: responses[0]?.provider ?? request.provider ?? 'unknown', dimensions: responses[0]?.dimensions ?? request.dimensions ?? 0,
      usage: { totalTokens: responses.reduce((sum, response) => sum + response.usage.totalTokens, 0) },
      cost: responses.reduce((sum, response) => sum + response.cost, 0),
    };
  }

  getProviders(): any[] {
    return this.getAvailableProviders().map(name => ({ name }));
  }

  getProvider(name: string): any {
    return this.registry.getProvider(name);
  }

  setPreferredProvider(provider: string): void {
    // Implementation for setting preferred provider
    console.log(`Setting preferred provider to: ${provider}`);
  }

  async estimateCost(request: any): Promise<any> {
    return { estimatedCost: 0, breakdown: {} };
  }

  async healthCheck(): Promise<HealthStatus> {
    const providers = this.getAvailableProviders();
    const providerHealth: Record<string, any> = {};

    for (const provider of providers) {
      const status = this.getProviderStatus(provider);
      providerHealth[provider] = {
        status: status?.healthy ? 'available' : 'unavailable',
        latency: 0,
        errorRate: 0,
        lastCheck: new Date()
      };
    }

    return {
      status: Object.values(providerHealth).every((p: any) => p.status === 'available') ? 'healthy' : 'degraded',
      providers: providerHealth,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime
    };
  }

  async getMetrics(): Promise<ServiceMetrics> {
    const metrics = this.metrics;
    return {
      averageLatency: this.calculateAverageLatency(metrics),
      p95Latency: this.calculateP95Latency(metrics),
      p99Latency: this.calculateP99Latency(metrics),
      requestsPerSecond: this.calculateRPS(metrics),
      tokensPerSecond: this.calculateTPS(metrics),
      costPerRequest: this.calculateCostPerRequest(metrics),
      costPerToken: this.calculateCostPerToken(metrics),
      totalCost: this.calculateTotalCost(metrics),
      successRate: this.calculateSuccessRate(metrics),
      errorRate: this.calculateErrorRate(metrics),
      availability: this.calculateAvailability(metrics),
      providerMetrics: new Map(),
      startTime: new Date(this.startTime),
      endTime: new Date()
    };
  }

  async generateCompletion(
    request: UnifiedCompletionRequest
  ): Promise<UnifiedCompletionResponse> {
    return this.generateCompletionWithMiddleware(request);
  }

  private async generateCompletionWithMiddleware(
    request: UnifiedCompletionRequest
  ): Promise<UnifiedCompletionResponse> {
    await this.ready;
    const startTime = Date.now();

    // Create request context
    const context: RequestContext = {
      request,
      provider: 'auto',
      model: request.model,
      operation: 'completion',
      startTime: new Date(startTime),
      metadata: {
        taskType: 'simple_qa'
      }
    };

    // Process through middleware
    const processedContext = await this.middlewareManager.processRequest(context);
    if (!processedContext) {
      throw new Error('Request blocked by middleware');
    }

    try {
      if (this.config.enableFallback) {
        const result = await this.fallbackStrategy.executeCompletionWithFallback(request);

        this.recordMetrics({
          provider: result.successfulProvider,
          model: request.model,
          operation: 'completion',
          latency: result.totalLatency,
          tokenCount: metricTokens(result.result.usage),
          cost: 0, // Will be calculated by cost estimation
          success: true,
          metadata: {
            taskType: 'simple_qa'
          }
        });

        return result.result;
      } else {
        const routing = await this.router.route({
          model: request.model,
          taskType: 'simple_qa',
          complexity: 'medium',
          messages: request.messages,
          provider: request.metadata?.provider
        });

        const result = await routing.adapter.generateCompletion(request);

        this.recordMetrics({
          provider: routing.selectedProvider,
          model: request.model,
          operation: 'completion',
          latency: Date.now() - startTime,
          tokenCount: metricTokens(result.usage),
          cost: routing.estimatedCost,
          success: true,
          metadata: {
            taskType: 'simple_qa'
          }
        });

        return result;
      }
    } catch (error) {
      this.recordMetrics({
        provider: 'unknown',
        model: request.model,
        operation: 'completion',
        latency: Date.now() - startTime,
        tokenCount: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        success: false,
        error: (error as Error).message,
        metadata: {
          taskType: 'simple_qa'
        }
      });

      throw error;
    }
  }

  async generateEmbedding(
    request: UnifiedEmbeddingRequest
  ): Promise<UnifiedEmbeddingResponse> {
    await this.ready;
    const startTime = Date.now();

    try {
      if (this.config.enableFallback) {
        const result = await this.fallbackStrategy.executeEmbeddingWithFallback(request);

        this.recordMetrics({
          provider: result.successfulProvider,
          model: request.model,
          operation: 'embedding',
          latency: result.totalLatency,
          tokenCount: { prompt: result.result.usage.totalTokens, completion: 0, total: result.result.usage.totalTokens },
          cost: 0,
          success: true,
          metadata: {
            taskType: 'embedding'
          }
        });

        return result.result;
      } else {
        const routing = await this.router.route({
          model: request.model,
          taskType: 'embedding',
          complexity: 'low',
          text: Array.isArray(request.text) ? request.text[0] : request.text
        });

        const result = await routing.adapter.generateEmbedding(request);

        this.recordMetrics({
          provider: routing.selectedProvider,
          model: request.model,
          operation: 'embedding',
          latency: Date.now() - startTime,
          tokenCount: { prompt: result.usage.totalTokens, completion: 0, total: result.usage.totalTokens },
          cost: routing.estimatedCost,
          success: true,
          metadata: {
            taskType: 'embedding'
          }
        });

        return result;
      }
    } catch (error) {
      this.recordMetrics({
        provider: 'unknown',
        model: request.model,
        operation: 'embedding',
        latency: Date.now() - startTime,
        tokenCount: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        success: false,
        error: (error as Error).message,
        metadata: {
          taskType: 'embedding'
        }
      });

      throw error;
    }
  }

  async *streamCompletion(
    request: UnifiedStreamRequest
  ): AsyncGenerator<UnifiedStreamChunk> {
    await this.ready;
    if (this.config.enableFallback) {
      yield* this.fallbackStrategy.executeStreamWithFallback(request);
    } else {
      const routing = await this.router.route({
        model: request.model,
        taskType: 'simple_qa',
        complexity: 'medium',
        messages: request.messages
      });

      yield* await routing.adapter.streamCompletion(request);
    }
  }

  getAvailableProviders(): string[] {
    return this.registry.getAvailableProviders();
  }

  getProviderStatus(provider: string) {
    return this.registry.getProviderStatus(provider);
  }

  getSystemHealth() {
    return this.fallbackStrategy.getSystemStatus();
  }

  getRequestMetrics(): AIMetrics[] {
    return [...this.metrics];
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  private async recordMetrics(metrics: AIMetrics): Promise<void> {
    this.metrics.push({
      ...metrics,
      provider: metrics.provider,
      model: metrics.model,
      operation: metrics.operation,
      latency: metrics.latency,
      tokenCount: metrics.tokenCount,
      cost: metrics.cost,
      success: metrics.success,
      error: metrics.error,
      metadata: metrics.metadata
    });

    // Integrate with usage tracking system
    if (metrics.metadata.organizationId) {
      await this.metricsIntegration.recordAIUsage(
        metrics.metadata.organizationId,
        metrics.metadata.userId,
        metrics
      );
    }

    // Keep only the last 1000 metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  // Enhanced management methods
  getConfiguration(): any {
    return this.aiConfig.getServiceConfig();
  }

  updateConfiguration(updates: any): void {
    this.aiConfig.updateServiceConfig(updates);
  }

  getProviderMetrics(organizationId?: string): any {
    return this.metricsIntegration.getProviderMetrics(organizationId);
  }

  getSystemHealthStatus(): any {
    return this.metricsIntegration.getSystemHealth();
  }

  getCostAnalytics(organizationId?: string, period: 'hour' | 'day' | 'week' | 'month' = 'day'): any {
    return this.metricsIntegration.getCostAnalytics(organizationId, period);
  }

  async getUsageReport(organizationId: string, period: 'hour' | 'day' | 'week' | 'month' = 'month'): Promise<any> {
    return this.metricsIntegration.getUsageReport(organizationId, period);
  }

  getCircuitBreakerStatus(): any {
    return this.circuitBreaker.getAllProviderMetrics();
  }

  isProviderConfigured(provider: string): boolean {
    return this.aiConfig.isProviderConfigured(provider);
  }

  getConfiguredProviders(): string[] {
    return this.aiConfig.getConfiguredProviders();
  }

  validateConfiguration(): any {
    return this.aiConfig.validateConfiguration();
  }

  resetProvider(provider: string): boolean {
    return this.circuitBreaker.resetProvider(provider);
  }

  forceProviderStatus(provider: string, status: 'open' | 'close'): boolean {
    if (status === 'open') {
      return this.circuitBreaker.forceOpenProvider(provider);
    } else {
      return this.circuitBreaker.forceCloseProvider(provider);
    }
  }

  reloadConfiguration(): void {
    this.aiConfig.reload();
  }

  private initializeMiddleware(): void {
    // Register built-in middleware
    this.middlewareManager.register(new LoggingMiddleware());
    this.middlewareManager.register(new MonitoringMiddleware());

    // Add cost control if configured
    try {
      this.middlewareManager.register(new CostControlMiddleware({
        maxPerRequest: 5.0, // Increase to $5 per request for GPT-4o usage
        maxDaily: 100.0
      }));
    } catch (error) {
      console.warn('Could not initialize cost control middleware:', error);
    }
  }

  // Metric calculation helpers
  private calculateAverageLatency(metrics: AIMetrics[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.latency, 0) / metrics.length;
  }

  private calculateP95Latency(metrics: AIMetrics[]): number {
    if (metrics.length === 0) return 0;
    const sorted = metrics.map(m => m.latency).sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[index] || 0;
  }

  private calculateP99Latency(metrics: AIMetrics[]): number {
    if (metrics.length === 0) return 0;
    const sorted = metrics.map(m => m.latency).sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.99) - 1;
    return sorted[index] || 0;
  }

  private calculateRPS(metrics: AIMetrics[]): number {
    if (metrics.length === 0) return 0;
    // Calculate based on last minute of data
    const oneMinuteAgo = Date.now() - 60000;
    const recentMetrics = metrics.filter(m =>
      Date.now() - m.latency < 60000
    );
    return recentMetrics.length / 60;
  }

  private calculateTPS(metrics: AIMetrics[]): number {
    if (metrics.length === 0) return 0;
    const oneMinuteAgo = Date.now() - 60000;
    const recentMetrics = metrics.filter(m =>
      Date.now() - m.latency < 60000
    );
    const totalTokens = recentMetrics.reduce((sum, m) => sum + m.tokenCount.total, 0);
    return totalTokens / 60;
  }

  private calculateCostPerRequest(metrics: AIMetrics[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.cost, 0) / metrics.length;
  }

  private calculateCostPerToken(metrics: AIMetrics[]): number {
    const totalCost = metrics.reduce((sum, m) => sum + m.cost, 0);
    const totalTokens = metrics.reduce((sum, m) => sum + m.tokenCount.total, 0);
    return totalTokens > 0 ? totalCost / totalTokens : 0;
  }

  private calculateTotalCost(metrics: AIMetrics[]): number {
    return metrics.reduce((sum, m) => sum + m.cost, 0);
  }

  private calculateSuccessRate(metrics: AIMetrics[]): number {
    if (metrics.length === 0) return 0;
    const successCount = metrics.filter(m => m.success).length;
    return successCount / metrics.length;
  }

  private calculateErrorRate(metrics: AIMetrics[]): number {
    return 1 - this.calculateSuccessRate(metrics);
  }

  private calculateAvailability(metrics: AIMetrics[]): number {
    // Simple availability calculation based on success rate
    return this.calculateSuccessRate(metrics);
  }

  getMiddlewareManager(): MiddlewareManager {
    return this.middlewareManager;
  }

  // OpenRouter-specific methods

  /**
   * Get OpenRouter adapter instance for direct access to enhanced features
   */
  getOpenRouterAdapter(): SmartOpenRouterAdapter | null {
    const provider = this.registry.getProvider('openrouter');
    return provider instanceof SmartOpenRouterAdapter ? provider : null;
  }

  /**
   * Get OpenRouter health and performance metrics
   */
  async getOpenRouterHealth(): Promise<any> {
    const adapter = this.getOpenRouterAdapter();
    if (!adapter) {
      return { status: 'unavailable', reason: 'OpenRouter adapter not initialized' };
    }

    try {
      return await adapter.getHealthMetrics();
    } catch (error) {
      return {
        status: 'error',
        reason: 'Failed to fetch OpenRouter health metrics',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get cost optimization insights from OpenRouter
   */
  async getOpenRouterCostInsights(organizationId: string): Promise<any> {
    const adapter = this.getOpenRouterAdapter();
    if (!adapter) {
      return {
        potentialSavings: 0,
        recommendedProviders: [],
        inefficientRoutes: [],
        error: 'OpenRouter adapter not available'
      };
    }

    try {
      return await adapter.getCostOptimizationInsights(organizationId);
    } catch (error) {
      console.error('Failed to get OpenRouter cost insights:', error);
      return {
        potentialSavings: 0,
        recommendedProviders: [],
        inefficientRoutes: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get provider performance comparison from OpenRouter
   */
  async getOpenRouterProviderComparison(organizationId: string): Promise<any> {
    const adapter = this.getOpenRouterAdapter();
    if (!adapter) {
      return {
        providers: [],
        recommendations: [],
        error: 'OpenRouter adapter not available'
      };
    }

    try {
      return await adapter.getProviderPerformanceComparison(organizationId);
    } catch (error) {
      console.error('Failed to get OpenRouter provider comparison:', error);
      return {
        providers: [],
        recommendations: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Enable or disable OpenRouter smart routing
   */
  async configureOpenRouterSmartRouting(enabled: boolean): Promise<boolean> {
    const adapter = this.getOpenRouterAdapter();
    if (!adapter) {
      console.warn('OpenRouter adapter not available for configuration');
      return false;
    }

    try {
      // Update the adapter configuration
      // Note: This would require extending the adapter with a configuration update method
      console.log(`OpenRouter smart routing ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      console.error('Failed to configure OpenRouter smart routing:', error);
      return false;
    }
  }

  /**
   * Get OpenRouter configuration status
   */
  getOpenRouterStatus(): {
    isAvailable: boolean;
    isEnabled: boolean;
    config?: any;
    lastHealthCheck?: Date;
    error?: string;
  } {
    const adapter = this.getOpenRouterAdapter();
    if (!adapter) {
      return {
        isAvailable: false,
        isEnabled: false,
        error: 'OpenRouter adapter not initialized'
      };
    }

    const providerStatus = this.getProviderStatus('openrouter');
    return {
      isAvailable: true,
      isEnabled: providerStatus?.enabled || false,
      config: {
        priority: providerStatus?.priority,
        maxConcurrentRequests: providerStatus?.maxConcurrentRequests,
        healthCheckInterval: providerStatus?.healthCheckInterval
      },
      lastHealthCheck: providerStatus?.lastHealthCheck
    };
  }

  // ImageRouter-specific methods

  /**
   * Get ImageRouter adapter instance for direct access to media generation features
   */
  getImageRouterAdapter(): ImageRouterAdapter | null {
    const provider = this.registry.getProvider('imagerouter');
    return provider instanceof ImageRouterAdapter ? provider : null;
  }

  /**
   * Generate media using ImageRouter with optimization
   */
  async generateMedia(request: any): Promise<any> {
    const adapter = this.getImageRouterAdapter();
    if (!adapter) {
      throw new Error('ImageRouter adapter not available');
    }

    const organizationId = request.metadata?.organizationId;

    // Optimize the request before processing
    const availableModels = await adapter.loadNativeModels();
    const optimizationResult = await imageRouterOptimizer.optimizeRequest(request, availableModels);

    // Check cache first
    const cachedResult = await imageRouterCache.get(optimizationResult.optimizedRequest);
    if (cachedResult) {
      await imageRouterMetrics.recordRequest({
        requestId: `cache_hit_${Date.now()}`,
        model: cachedResult.response.model,
        mediaType: request.type,
        organizationId: request.metadata?.organizationId
      });

      await imageRouterMetrics.recordSuccess({
        requestId: `cache_hit_${Date.now()}`,
        model: cachedResult.response.model,
        mediaType: request.type,
        latency: 50, // Cache hit latency
        cost: 0, // Cache hits are free
        qualityScore: cachedResult.metadata.quality,
        organizationId: request.metadata?.organizationId
      });

      // Record cache hit in global AI metrics system (Layer 2: Performance Metrics)
      await this.metricsIntegration.recordMediaGenerationUsage(
        organizationId,
        request.metadata?.userId,
        'imagerouter',
        cachedResult.response.model,
        this.getMediaOperation(request.type),
        request.type,
        0, // Cache hits are free
        50, // Cache hit latency
        true, // success
        {
          mediaCount: cachedResult.response.results.length,
          quality: 'quality' in optimizationResult.optimizedRequest ? optimizationResult.optimizedRequest.quality || 'auto' : 'auto',
          cacheHit: true,
          optimizations: optimizationResult.optimizations,
          taskType: 'media_generation'
        }
      );

      return {
        ...cachedResult.response,
        metadata: {
          ...cachedResult.response.metadata,
          fromCache: true,
          optimizations: optimizationResult.optimizations,
          estimatedImprovement: optimizationResult.estimatedImprovement
        }
      };
    }

    // Record request start
    const requestId = `ir_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await imageRouterMetrics.recordRequest({
      requestId,
      model: optimizationResult.selectedModel,
      mediaType: request.type,
      organizationId: request.metadata?.organizationId,
      prompt: request.prompt?.substring(0, 100)
    });

    const startTime = Date.now();

    try {
      // Generate media with optimized request
      const response = await adapter.generateMedia(optimizationResult.optimizedRequest);
      const latency = Date.now() - startTime;

      // Record success
      await imageRouterMetrics.recordSuccess({
        requestId,
        model: response.model,
        mediaType: request.type,
        latency,
        cost: response.usage.cost || 0,
        qualityScore: 0.8, // Would need quality assessment
        organizationId: request.metadata?.organizationId
      });

      // Cache the response
      await imageRouterCache.set(
        optimizationResult.optimizedRequest,
        response,
        0.8 // Quality score
      );

      // Record in global AI metrics system (Layer 2: Performance Metrics)
      await this.metricsIntegration.recordMediaGenerationUsage(
        organizationId,
        request.metadata?.userId,
        'imagerouter',
        response.model,
        this.getMediaOperation(request.type),
        request.type,
        response.usage.cost || 0,
        latency,
        true, // success
        {
          mediaCount: response.results.length,
          quality: 'quality' in optimizationResult.optimizedRequest ? optimizationResult.optimizedRequest.quality || 'auto' : 'auto',
          cacheHit: false,
          optimizations: optimizationResult.optimizations,
          taskType: 'media_generation'
        }
      );

      return {
        ...response,
        metadata: {
          ...response.metadata,
          fromCache: false,
          optimizations: optimizationResult.optimizations,
          estimatedImprovement: optimizationResult.estimatedImprovement,
          actualLatency: latency
        }
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Record error
      await imageRouterMetrics.recordError({
        requestId,
        model: optimizationResult.selectedModel,
        mediaType: request.type,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        latency,
        organizationId: request.metadata?.organizationId
      });

      // Record error in global AI metrics system (Layer 2: Performance Metrics)
      await this.metricsIntegration.recordMediaGenerationUsage(
        organizationId,
        request.metadata?.userId,
        'imagerouter',
        optimizationResult.selectedModel,
        this.getMediaOperation(request.type),
        request.type,
        0, // No cost on error
        latency,
        false, // success = false
        {
          mediaCount: 0,
          quality: 'quality' in optimizationResult.optimizedRequest ? optimizationResult.optimizedRequest.quality || 'auto' : 'auto',
          cacheHit: false,
          optimizations: optimizationResult.optimizations,
          error: errorMessage,
          taskType: 'media_generation'
        }
      );

      throw error;
    }
  }

  /**
   * Map media type to operation for metrics tracking
   */
  private getMediaOperation(mediaType: string): 'image_generation' | 'video_generation' | 'image_edit' {
    switch (mediaType) {
      case 'image':
        return 'image_generation';
      case 'video':
        return 'video_generation';
      case 'edit':
      case 'image_edit':
        return 'image_edit';
      default:
        return 'image_generation';
    }
  }

  /**
   * Get ImageRouter performance metrics
   */
  async getImageRouterMetrics(): Promise<any> {
    const adapter = this.getImageRouterAdapter();
    if (!adapter) {
      return {
        error: 'ImageRouter adapter not available',
        metrics: null
      };
    }

    try {
      const [
        aggregatedMetrics,
        realTimeMetrics,
        modelPerformance,
        adapterMetrics,
        circuitBreakerMetrics,
        optimizationStats,
        cacheAnalytics
      ] = await Promise.all([
        imageRouterMetrics.getAggregatedMetrics(),
        imageRouterMetrics.getRealTimeMetrics(),
        imageRouterMetrics.getModelPerformanceComparison(),
        adapter.getMetrics(),
        adapter.getCircuitBreakerMetrics(),
        imageRouterOptimizer.getOptimizationStats(),
        imageRouterCache.getAnalytics()
      ]);

      return {
        aggregated: aggregatedMetrics,
        realTime: realTimeMetrics,
        modelPerformance,
        adapter: adapterMetrics,
        circuitBreaker: circuitBreakerMetrics,
        optimization: optimizationStats,
        cache: cacheAnalytics,
        status: 'available'
      };

    } catch (error) {
      console.error('Failed to get ImageRouter metrics:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        metrics: null
      };
    }
  }

  /**
   * Get ImageRouter optimization recommendations
   */
  async getImageRouterOptimizations(): Promise<any> {
    try {
      const [
        optimizationRecommendations,
        cacheOptimization
      ] = await Promise.all([
        imageRouterMetrics.getOptimizationRecommendations(),
        imageRouterCache.optimizeConfiguration()
      ]);

      return {
        performance: optimizationRecommendations,
        cache: cacheOptimization,
        combined: {
          totalRecommendations: optimizationRecommendations.length + cacheOptimization.recommendations.length,
          estimatedTotalImprovement: cacheOptimization.estimatedImprovement,
          priorityActions: [
            ...optimizationRecommendations.filter(r => r.priority === 'high'),
            ...cacheOptimization.recommendations.slice(0, 3)
          ]
        }
      };

    } catch (error) {
      console.error('Failed to get ImageRouter optimizations:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        performance: [],
        cache: { recommendations: [], estimatedImprovement: 0 }
      };
    }
  }

  /**
   * Get ImageRouter cache analytics
   */
  async getImageRouterCacheAnalytics(): Promise<any> {
    try {
      return await imageRouterCache.getAnalytics();
    } catch (error) {
      console.error('Failed to get ImageRouter cache analytics:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Warm ImageRouter cache with popular patterns
   */
  async warmImageRouterCache(patterns?: string[]): Promise<any> {
    try {
      return await imageRouterCache.warmCache(patterns);
    } catch (error) {
      console.error('Failed to warm ImageRouter cache:', error);
      return {
        warmed: 0,
        failed: 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clean up ImageRouter cache
   */
  async cleanupImageRouterCache(aggressive: boolean = false): Promise<any> {
    try {
      return await imageRouterCache.cleanup(aggressive);
    } catch (error) {
      console.error('Failed to cleanup ImageRouter cache:', error);
      return {
        removed: 0,
        spaceSaved: 0,
        costSavingsLost: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Export ImageRouter analytics data
   */
  async exportImageRouterData(format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const [metricsData, cacheData] = await Promise.all([
        imageRouterMetrics.exportMetrics(format),
        imageRouterCache.exportCacheData(format)
      ]);

      if (format === 'json') {
        return JSON.stringify({
          exportDate: new Date().toISOString(),
          metrics: JSON.parse(metricsData),
          cache: JSON.parse(cacheData)
        }, null, 2);
      } else {
        return `# ImageRouter Metrics\n${metricsData}\n\n# ImageRouter Cache\n${cacheData}`;
      }

    } catch (error) {
      console.error('Failed to export ImageRouter data:', error);
      throw new Error(`Failed to export ImageRouter data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ImageRouter status and health
   */
  getImageRouterStatus(): {
    isAvailable: boolean;
    isEnabled: boolean;
    config?: any;
    lastHealthCheck?: Date;
    error?: string;
    capabilities?: any;
  } {
    const adapter = this.getImageRouterAdapter();
    if (!adapter) {
      return {
        isAvailable: false,
        isEnabled: false,
        error: 'ImageRouter adapter not initialized'
      };
    }

    const providerStatus = this.getProviderStatus('imagerouter');
    return {
      isAvailable: true,
      isEnabled: providerStatus?.enabled || false,
      config: {
        priority: providerStatus?.priority,
        maxConcurrentRequests: providerStatus?.maxConcurrentRequests,
        healthCheckInterval: providerStatus?.healthCheckInterval
      },
      lastHealthCheck: providerStatus?.lastHealthCheck,
      capabilities: adapter.getCapabilities()
    };
  }

  /**
   * Test ImageRouter connectivity and performance
   */
  async testImageRouterConnection(): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
    capabilities?: any;
  }> {
    const adapter = this.getImageRouterAdapter();
    if (!adapter) {
      return {
        success: false,
        error: 'ImageRouter adapter not available'
      };
    }

    const startTime = Date.now();

    try {
      const isHealthy = await adapter.checkHealth();
      const latency = Date.now() - startTime;

      if (isHealthy) {
        const capabilities = await adapter.getMediaCapabilities();
        return {
          success: true,
          latency,
          capabilities
        };
      } else {
        return {
          success: false,
          latency,
          error: 'Health check failed'
        };
      }

    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get enhanced provider comparison including media providers
   */
  async getEnhancedProviderComparison(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ) {
    return this.metricsIntegration.getEnhancedProviderComparison(organizationId, timeRange);
  }

  /**
   * Get media generation analytics
   */
  async getMediaGenerationAnalytics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ) {
    return this.metricsIntegration.getMediaGenerationAnalytics(organizationId, timeRange);
  }

  /**
   * Get comprehensive AI usage report including media generation
   */
  async getAIUsageReport(
    organizationId: string,
    period: 'hour' | 'day' | 'week' | 'month' = 'month'
  ) {
    return this.metricsIntegration.getUsageReport(organizationId, period);
  }

  destroy(): void {
    this.registry.destroy();
    this.clearMetrics();
  }
}
