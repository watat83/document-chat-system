import { AIRequestRouter, RoutingDecision } from './request-router';
import { AIRequest } from '../interfaces/types';
import { AIConfiguration } from '../config';
import { VercelAIAdapter } from '../providers/vercel-ai-adapter';
import { AIServiceProvider } from '../interfaces';

export interface AIFeatureFlags {
  useVercelForStreaming: boolean;
  useVercelForChat: boolean;
  useVercelForNewFeatures: boolean;
  fallbackToVercel: boolean;
  aiProviderFallback: boolean;
  defaultAiProvider: string;
  aiCostOptimization: boolean;
  aiResponseCaching: boolean;
}

export interface PerformanceMetrics {
  averageLatency: number;
  successRate: number;
  averageCost: number;
  tokensPerSecond: number;
  lastUpdated: Date;
}

export interface RoutingContext {
  organizationId: string;
  userId?: string;
  budgetRemaining?: number;
  qualityThreshold?: number;
  latencyRequirement?: number;
  complianceRequired?: boolean;
  taskComplexity: 'low' | 'medium' | 'high';
  prototype?: boolean;
}

export interface DecisionMatrix {
  operationType: Record<string, number>;
  taskComplexity: Record<string, number>;
  costSensitivity: Record<string, number>;
  performanceRequirement: Record<string, number>;
  complianceLevel: Record<string, number>;
}

export interface IntelligentRoutingDecision extends RoutingDecision {
  useVercel: boolean;
  reasoningText: string;
  confidence: number;
  fallbackChain: AIServiceProvider[];
  estimatedCost: number;
  estimatedLatency: number;
  circuitBreakerStatus?: Record<string, boolean>;
}

export class AIFeatureFlagManager {
  constructor(private organizationId: string) {}

  async getFlags(): Promise<AIFeatureFlags> {
    // This could be enhanced to check organization-specific settings
    // For now, using global configuration with enhanced flags
    const config = AIConfiguration.getInstance();
    const vercelConfig = config.getVercelConfig();

    return {
      useVercelForStreaming: vercelConfig.enabled && vercelConfig.useFor.includes('streaming'),
      useVercelForChat: vercelConfig.enabled && vercelConfig.useFor.includes('chat'),
      useVercelForNewFeatures: vercelConfig.enabled && vercelConfig.useFor.includes('prototyping'),
      fallbackToVercel: vercelConfig.fallbackToOurSystem,
      aiProviderFallback: true, // Enable provider fallback by default
      defaultAiProvider: 'openai', // Default to OpenAI
      aiCostOptimization: true, // Enable cost optimization
      aiResponseCaching: true // Enable response caching
    };
  }

  async updateFlags(flags: Partial<AIFeatureFlags>): Promise<void> {
    // In production, this would update the database/feature flag service
    // For now, just log the update
    console.log(`Updating feature flags for organization ${this.organizationId}:`, flags);
  }

  private async isEnabled(flag: string): Promise<boolean> {
    // This could check a database or feature flag service
    // For now, return configuration-based defaults
    const config = AIConfiguration.getInstance();
    return config.isVercelEnabled();
  }
}

export class HybridAIRouter extends AIRequestRouter {
  private featureFlagManager: AIFeatureFlagManager;
  private vercelAdapter?: VercelAIAdapter;
  private decisionMatrix: DecisionMatrix;
  private performanceHistory: Map<AIServiceProvider, PerformanceMetrics>;
  private circuitBreakers: Map<AIServiceProvider, {
    isOpen: boolean;
    failureCount: number;
    lastFailure: Date;
    nextRetry: Date;
  }>;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  constructor(
    registry: any,
    vercelAdapter?: VercelAIAdapter
  ) {
    super(registry);
    this.vercelAdapter = vercelAdapter;
    // Initialize with default organization - can be overridden per request
    this.featureFlagManager = new AIFeatureFlagManager('default');
    this.decisionMatrix = this.initializeDecisionMatrix();
    this.performanceHistory = new Map();
    this.circuitBreakers = new Map();
    this.initializeCircuitBreakers();
  }

  private initializeDecisionMatrix(): DecisionMatrix {
    return {
      operationType: {
        'stream': 0.8,    // Favor Vercel for streaming
        'chat': 0.7,      // Favor Vercel for chat
        'analysis': 0.3,  // Favor enterprise for analysis
        'generation': 0.5, // Balanced
        'embedding': 0.2   // Favor enterprise for embeddings
      },
      taskComplexity: {
        'low': 0.8,     // Vercel for simple tasks
        'medium': 0.5,  // Balanced
        'high': 0.2     // Enterprise for complex tasks
      },
      costSensitivity: {
        'low': 0.8,     // Can use Vercel
        'medium': 0.5,  // Balanced
        'high': 0.1     // Must use cost-optimized enterprise
      },
      performanceRequirement: {
        'low': 0.2,     // Enterprise sufficient
        'medium': 0.5,  // Balanced
        'high': 0.9     // Vercel for high performance
      },
      complianceLevel: {
        'none': 0.8,    // Can use Vercel
        'basic': 0.5,   // Balanced
        'strict': 0.0   // Must use enterprise
      }
    };
  }

  private initializeCircuitBreakers(): void {
    const providers: AIServiceProvider[] = ['openai', 'anthropic', 'google', 'azure', 'vercel'];
    providers.forEach(provider => {
      this.circuitBreakers.set(provider, {
        isOpen: false,
        failureCount: 0,
        lastFailure: new Date(0),
        nextRetry: new Date(0)
      });
    });
  }

  async route(request: AIRequest & { organizationId?: string }): Promise<IntelligentRoutingDecision> {
    const startTime = Date.now();

    try {
      // Update feature flag manager for this organization if provided
      if (request.organizationId) {
        this.featureFlagManager = new AIFeatureFlagManager(request.organizationId);
      }

      // Get feature flags for this organization
      const flags = await this.featureFlagManager.getFlags();

      // Create routing context
      const context: RoutingContext = {
        organizationId: request.organizationId || 'default',
        userId: (request as any).userId,
        budgetRemaining: (request as any).budgetRemaining,
        qualityThreshold: (request as any).qualityThreshold,
        latencyRequirement: (request as any).latencyRequirement,
        complianceRequired: (request as any).complianceRequired,
        taskComplexity: this.determineTaskComplexity(request),
        prototype: (request as any).prototype
      };

      // Make intelligent routing decision
      const intelligentDecision = await this.makeIntelligentRoutingDecision(request, context, flags);

      if (intelligentDecision.useVercel && this.vercelAdapter) {
        return {
          selectedProvider: 'vercel-enhanced',
          model: request.model || 'gpt-4o',
          adapter: this.vercelAdapter,
          estimatedCost: intelligentDecision.estimatedCost,
          estimatedLatency: intelligentDecision.estimatedLatency,
          qualityScore: 0.9,
          rationale: intelligentDecision.reasoningText,
          fallbackChain: intelligentDecision.fallbackChain.map(p => p),
          metadata: {
            system: 'vercel-enhanced',
            flags: flags,
            hybrid: true,
            confidence: intelligentDecision.confidence,
            decisionTime: Date.now() - startTime
          },
          useVercel: intelligentDecision.useVercel,
          reasoningText: intelligentDecision.reasoningText,
          confidence: intelligentDecision.confidence,
          circuitBreakerStatus: this.getCircuitBreakerStatus()
        };
      } else {
        // Use existing sophisticated routing
        const decision = await super.route(request);
        return {
          ...decision,
          metadata: {
            ...decision.metadata,
            system: 'existing',
            flags: flags,
            hybrid: true,
            vercelAvailable: !!this.vercelAdapter,
            confidence: intelligentDecision.confidence,
            decisionTime: Date.now() - startTime
          },
          useVercel: false,
          reasoningText: intelligentDecision.reasoningText,
          confidence: intelligentDecision.confidence,
          circuitBreakerStatus: this.getCircuitBreakerStatus()
        };
      }
    } catch (error) {
      console.error('Error in intelligent routing:', error);

      // Emergency fallback to existing system
      const fallbackDecision = await super.route(request);
      return {
        ...fallbackDecision,
        useVercel: false,
        reasoningText: 'Emergency fallback due to routing error',
        confidence: 0.1,
        fallbackChain: ['openai', 'anthropic'],
        circuitBreakerStatus: this.getCircuitBreakerStatus(),
        metadata: {
          ...fallbackDecision.metadata,
          system: 'emergency-fallback',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private determineTaskComplexity(request: AIRequest): 'low' | 'medium' | 'high' {
    const messageCount = request.messages?.length || 0;
    const hasSystemPrompt = request.messages?.some(m => m.role === 'system') || false;
    const hasTools = (request as any).tools?.length > 0 || false;

    if (hasTools || messageCount > 10 || request.taskType === 'complex_analysis') {
      return 'high';
    } else if (messageCount > 3 || hasSystemPrompt || request.taskType === 'document_analysis') {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private async makeIntelligentRoutingDecision(
    request: AIRequest,
    context: RoutingContext,
    flags: AIFeatureFlags
  ): Promise<IntelligentRoutingDecision> {
    // 1. Check feature flags for explicit routing preferences
    const flagScore = this.evaluateFeatureFlags(request, flags);

    // 2. Calculate decision matrix score
    const matrixScore = this.calculateMatrixScore(request, context);

    // 3. Consider performance history
    const performanceScore = this.calculatePerformanceScore();

    // 4. Apply cost optimization if enabled
    const costScore = flags.aiCostOptimization ?
      this.calculateCostScore(context) : 0.5;

    // 5. Combine scores with weights
    const finalScore = (
      flagScore * 0.4 +
      matrixScore * 0.3 +
      performanceScore * 0.2 +
      costScore * 0.1
    );

    const useVercel = finalScore > 0.5;
    const primaryProvider = useVercel ? 'vercel' : this.selectEnterpriseProvider(flags);

    // 6. Build fallback chain
    const fallbackChain = this.buildIntelligentFallbackChain(primaryProvider, flags);

    // 7. Estimate cost and latency
    const estimatedCost = this.estimateIntelligentCost(primaryProvider, request);
    const estimatedLatency = this.estimateIntelligentLatency(primaryProvider, request);

    return {
      selectedProvider: primaryProvider,
      model: request.model || 'gpt-4o',
      adapter: this.vercelAdapter,
      estimatedCost,
      estimatedLatency,
      qualityScore: 0.9,
      rationale: this.buildIntelligentReasoning(flagScore, matrixScore, performanceScore, costScore, finalScore),
      fallbackChain: fallbackChain.map(p => p),
      metadata: {},
      useVercel,
      reasoningText: this.buildIntelligentReasoning(flagScore, matrixScore, performanceScore, costScore, finalScore),
      confidence: Math.min(Math.abs(finalScore - 0.5) * 2, 1)
    };
  }

  // New intelligent routing helper methods
  private evaluateFeatureFlags(request: AIRequest, flags: AIFeatureFlags): number {
    let score = 0.5; // Default neutral

    // Explicit feature flag preferences
    if (request.operation === 'stream' && flags.useVercelForStreaming) {
      score = 0.9;
    } else if (request.taskType === 'chat' && flags.useVercelForChat) {
      score = 0.8;
    } else if ((request as any).prototype && flags.useVercelForNewFeatures) {
      score = 0.8;
    }

    // Consider fallback preferences
    if (flags.fallbackToVercel && !flags.useVercelForStreaming) {
      score = Math.max(score, 0.3);
    }

    return score;
  }

  private calculateMatrixScore(request: AIRequest, context: RoutingContext): number {
    const operationScore = this.decisionMatrix.operationType[request.operation] || 0.5;
    const complexityScore = this.decisionMatrix.taskComplexity[context.taskComplexity] || 0.5;

    const costSensitivity = context.budgetRemaining && context.budgetRemaining < 10 ? 'high' :
                           context.budgetRemaining && context.budgetRemaining < 50 ? 'medium' : 'low';
    const costScore = this.decisionMatrix.costSensitivity[costSensitivity];

    const performanceReq = context.latencyRequirement && context.latencyRequirement < 1000 ? 'high' :
                          context.latencyRequirement && context.latencyRequirement < 3000 ? 'medium' : 'low';
    const performanceScore = this.decisionMatrix.performanceRequirement[performanceReq];

    const complianceLevel = context.complianceRequired ? 'strict' : 'none';
    const complianceScore = this.decisionMatrix.complianceLevel[complianceLevel];

    return (operationScore + complexityScore + costScore + performanceScore + complianceScore) / 5;
  }

  private calculatePerformanceScore(): number {
    const vercelMetrics = this.performanceHistory.get('vercel');
    const enterpriseMetrics = this.performanceHistory.get('openai'); // Using OpenAI as enterprise baseline

    if (!vercelMetrics || !enterpriseMetrics) {
      return 0.5; // No data, neutral
    }

    // Compare key metrics
    const latencyAdvantage = enterpriseMetrics.averageLatency / vercelMetrics.averageLatency;
    const reliabilityAdvantage = vercelMetrics.successRate / enterpriseMetrics.successRate;
    const speedAdvantage = vercelMetrics.tokensPerSecond / enterpriseMetrics.tokensPerSecond;

    const performanceScore = (
      Math.min(latencyAdvantage / 2, 1) * 0.4 +
      Math.min(reliabilityAdvantage, 1) * 0.3 +
      Math.min(speedAdvantage / 2, 1) * 0.3
    );

    return Math.min(performanceScore, 1);
  }

  private calculateCostScore(context: RoutingContext): number {
    if (!context.budgetRemaining) return 0.5;

    if (context.budgetRemaining > 100) return 0.8; // Can afford Vercel
    if (context.budgetRemaining > 50) return 0.6;  // Prefer Vercel but consider cost
    if (context.budgetRemaining > 10) return 0.3;  // Prefer enterprise
    return 0.1; // Must use cheapest option
  }

  private selectEnterpriseProvider(flags: AIFeatureFlags): AIServiceProvider {
    const provider = flags.defaultAiProvider as AIServiceProvider;

    // Check if provider is available (circuit breaker open?)
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (circuitBreaker?.isOpen && Date.now() < circuitBreaker.nextRetry.getTime()) {
      // Provider is down, select alternative
      const alternatives: AIServiceProvider[] = ['openai', 'anthropic', 'google', 'azure']
        .filter(p => p !== provider && !this.isCircuitBreakerOpen(p));

      return alternatives[0] || 'openai'; // Fallback to OpenAI
    }

    return provider || 'openai';
  }

  private buildIntelligentFallbackChain(primaryProvider: AIServiceProvider, flags: AIFeatureFlags): AIServiceProvider[] {
    const chain: AIServiceProvider[] = [primaryProvider];

    if (flags.aiProviderFallback) {
      const alternatives: AIServiceProvider[] = ['openai', 'anthropic', 'google', 'azure', 'vercel']
        .filter(p => p !== primaryProvider && !this.isCircuitBreakerOpen(p));

      // Add up to 2 fallback providers
      chain.push(...alternatives.slice(0, 2));
    }

    return chain;
  }

  private estimateIntelligentCost(provider: AIServiceProvider, request: AIRequest): number {
    const baseCosts = {
      'vercel': 0.003,    // Slightly higher for enhanced features
      'openai': 0.0025,   // Baseline
      'anthropic': 0.003, // Premium model
      'google': 0.002,    // Competitive pricing
      'azure': 0.0025     // Enterprise pricing
    };

    const baseCost = baseCosts[provider] || 0.0025;
    const complexity = request.messages?.length || 1;
    const streamingMultiplier = request.stream ? 1.1 : 1.0;

    return baseCost * complexity * streamingMultiplier;
  }

  private estimateIntelligentLatency(provider: AIServiceProvider, request: AIRequest): number {
    const baseLatencies = {
      'vercel': 800,    // Optimized for speed
      'openai': 1200,   // Standard
      'anthropic': 1400, // Slightly slower
      'google': 1100,   // Good performance
      'azure': 1300     // Enterprise infrastructure
    };

    const baseLatency = baseLatencies[provider] || 1200;
    const complexity = request.messages?.length || 1;
    const streamingBonus = request.stream ? 0.7 : 1.0; // Streaming feels faster

    return baseLatency * Math.log(complexity + 1) * streamingBonus;
  }

  private buildIntelligentReasoning(
    flagScore: number,
    matrixScore: number,
    performanceScore: number,
    costScore: number,
    finalScore: number
  ): string {
    const reasons: string[] = [];

    if (flagScore > 0.7) reasons.push('Feature flags favor Vercel AI SDK');
    if (flagScore < 0.3) reasons.push('Feature flags favor enterprise system');

    if (matrixScore > 0.6) reasons.push('Operation type optimized for Vercel');
    if (matrixScore < 0.4) reasons.push('Task complexity favors enterprise system');

    if (performanceScore > 0.6) reasons.push('Performance metrics favor Vercel');
    if (performanceScore < 0.4) reasons.push('Performance metrics favor enterprise');

    if (costScore > 0.6) reasons.push('Budget allows for premium features');
    if (costScore < 0.4) reasons.push('Cost optimization required');

    const decision = finalScore > 0.5 ? 'Vercel AI SDK' : 'Enterprise system';
    const confidence = Math.round(Math.abs(finalScore - 0.5) * 200);

    return `Selected ${decision} (${confidence}% confidence). ${reasons.join(', ')}.`;
  }

  private getCircuitBreakerStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.circuitBreakers.forEach((breaker, provider) => {
      status[provider] = breaker.isOpen;
    });
    return status;
  }

  private isCircuitBreakerOpen(provider: AIServiceProvider): boolean {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return false;

    // Check if circuit breaker should be reset
    if (breaker.isOpen && Date.now() >= breaker.nextRetry.getTime()) {
      breaker.isOpen = false;
      breaker.failureCount = 0;
      console.info(`Circuit breaker reset for provider: ${provider}`);
      return false;
    }

    return breaker.isOpen;
  }

  // Legacy shouldUseVercel method for backwards compatibility
  private shouldUseVercel(request: AIRequest, flags: AIFeatureFlags): boolean {
    // Use Vercel AI SDK for:
    if (request.operation === 'stream' && flags.useVercelForStreaming) {
      return true;
    }

    if (request.taskType === 'chat' && flags.useVercelForChat) {
      return true;
    }

    if ((request as any).prototype === true && flags.useVercelForNewFeatures) {
      return true;
    }

    // Don't use Vercel for:
    if ((request as any).requiresCompliance) {
      return false;
    }

    if ((request as any).complexCostOptimization) {
      return false;
    }

    if ((request as any).organizationPolicies?.length > 0) {
      return false;
    }

    if (request.taskType === 'embedding') {
      return false; // Use our system for embeddings
    }

    if (request.taskType === 'document_analysis' || request.taskType === 'complex_analysis') {
      return false; // Use our system for complex tasks requiring sophisticated routing
    }

    return false;
  }

  private getVercelRationale(request: AIRequest): string {
    const reasons: string[] = [];

    if (request.operation === 'stream') {
      reasons.push('Optimized for streaming performance');
    }

    if (request.taskType === 'chat') {
      reasons.push('Enhanced chat experience with Vercel AI SDK');
    }

    if ((request as any).prototype === true) {
      reasons.push('Rapid prototyping mode enabled');
    }

    if (reasons.length === 0) {
      reasons.push('Default Vercel AI SDK routing');
    }

    return reasons.join(', ');
  }

  private estimateVercelCost(request: AIRequest): number {
    // Rough cost estimation for Vercel AI SDK requests
    const baseTokens = this.estimateTokens(request);
    const modelMultiplier = this.getModelCostMultiplier(request.model || 'gpt-4o');

    return (baseTokens / 1000) * modelMultiplier;
  }

  private estimateTokens(request: AIRequest): number {
    // Estimate tokens from messages or text content
    let totalText = '';

    if (request.messages) {
      totalText = request.messages.map(m => m.content).join(' ');
    } else if ((request as any).text) {
      totalText = (request as any).text;
    }

    // Rough token estimation: 1 token ≈ 4 characters
    return Math.ceil(totalText.length / 4);
  }

  private getModelCostMultiplier(model: string): number {
    // Cost per 1K tokens (rough estimates)
    const costs: Record<string, number> = {
      'gpt-4o': 0.03,
      'gpt-4o-mini': 0.00015,
      'gpt-3.5-turbo': 0.002,
      'claude-3-opus': 0.075,
      'claude-3-sonnet': 0.015,
      'claude-3-haiku': 0.0025,
      'gemini-1.5-pro': 0.0035,
      'gemini-1.5-flash': 0.00035
    };

    return costs[model] || 0.02; // Default fallback
  }

  private buildFallbackChain(request: AIRequest): string[] {
    // Build fallback chain starting with our existing system
    const fallbacks = ['existing-system'];

    // Add specific provider fallbacks based on task type
    switch (request.taskType) {
      case 'chat':
        fallbacks.push('openai', 'anthropic', 'google');
        break;
      case 'document_analysis':
        fallbacks.push('anthropic', 'openai', 'google');
        break;
      case 'embedding':
        fallbacks.push('openai', 'google');
        break;
      default:
        fallbacks.push('openai', 'anthropic', 'google');
    }

    return fallbacks;
  }

  /**
   * Update Vercel adapter reference
   */
  setVercelAdapter(adapter: VercelAIAdapter): void {
    this.vercelAdapter = adapter;
  }

  /**
   * Get current routing statistics
   */
  getRoutingStats(): {
    vercelRequests: number;
    existingRequests: number;
    totalRequests: number;
    vercelPercentage: number;
  } {
    // This would typically be tracked in a metrics system
    // For now, return placeholder data
    return {
      vercelRequests: 0,
      existingRequests: 0,
      totalRequests: 0,
      vercelPercentage: 0
    };
  }

  /**
   * Force a specific routing decision for testing
   */
  forceRouting(useVercel: boolean): void {
    // This could be used for A/B testing or debugging
    console.warn(`Forced routing to ${useVercel ? 'Vercel AI SDK' : 'existing system'}`);
  }

  // Circuit breaker management methods
  recordSuccess(provider: AIServiceProvider): void {
    const breaker = this.circuitBreakers.get(provider);
    if (breaker) {
      breaker.failureCount = 0;
      breaker.isOpen = false;
    }
  }

  recordFailure(provider: AIServiceProvider): void {
    const breaker = this.circuitBreakers.get(provider);
    if (breaker) {
      breaker.failureCount++;
      breaker.lastFailure = new Date();

      if (breaker.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
        breaker.isOpen = true;
        breaker.nextRetry = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);
        console.warn(`Circuit breaker opened for provider: ${provider}`);
      }
    }
  }

  // Performance monitoring methods
  updatePerformanceMetrics(provider: AIServiceProvider, metrics: Partial<PerformanceMetrics>): void {
    const existing = this.performanceHistory.get(provider) || {
      averageLatency: 1000,
      successRate: 0.95,
      averageCost: 0.001,
      tokensPerSecond: 30,
      lastUpdated: new Date()
    };

    const updated: PerformanceMetrics = {
      ...existing,
      ...metrics,
      lastUpdated: new Date()
    };

    this.performanceHistory.set(provider, updated);
  }

  getIntelligentRoutingStats(): {
    circuitBreakerStatus: Record<string, boolean>;
    performanceMetrics: Record<string, PerformanceMetrics>;
    decisionMatrix: DecisionMatrix;
    routingHistory: {
      vercelRequests: number;
      existingRequests: number;
      totalRequests: number;
      vercelPercentage: number;
    };
  } {
    const circuitBreakerStatus: Record<string, boolean> = {};
    this.circuitBreakers.forEach((breaker, provider) => {
      circuitBreakerStatus[provider] = breaker.isOpen;
    });

    const performanceMetrics: Record<string, PerformanceMetrics> = {};
    this.performanceHistory.forEach((metrics, provider) => {
      performanceMetrics[provider] = metrics;
    });

    return {
      circuitBreakerStatus,
      performanceMetrics,
      decisionMatrix: this.decisionMatrix,
      routingHistory: this.getRoutingStats() // Use existing method
    };
  }

  // Configuration management
  updateDecisionMatrix(updates: Partial<DecisionMatrix>): void {
    this.decisionMatrix = {
      ...this.decisionMatrix,
      ...updates
    };
  }

  // Testing utilities for Phase 4
  resetCircuitBreakers(): void {
    this.initializeCircuitBreakers();
  }

  clearPerformanceHistory(): void {
    this.performanceHistory.clear();
  }

  // Enhanced feature flag management
  async updateOrganizationFlags(organizationId: string, flags: Partial<AIFeatureFlags>): Promise<void> {
    const flagManager = new AIFeatureFlagManager(organizationId);
    await flagManager.updateFlags(flags);
  }

  // Cost vs Speed optimization method
  async optimizeForCostSpeed(
    request: AIRequest,
    costPriority: number = 0.5, // 0 = pure speed, 1 = pure cost
    context?: RoutingContext
  ): Promise<IntelligentRoutingDecision> {
    // Temporarily adjust decision matrix for cost optimization
    const originalMatrix = { ...this.decisionMatrix };

    // Adjust cost sensitivity based on priority
    this.decisionMatrix.costSensitivity = {
      'low': 0.8 - (costPriority * 0.3),
      'medium': 0.5 - (costPriority * 0.2),
      'high': 0.1 - (costPriority * 0.1)
    };

    try {
      const routingContext = context || {
        organizationId: 'optimization-test',
        taskComplexity: 'medium' as const,
        budgetRemaining: costPriority > 0.7 ? 20 : 100 // Simulate budget constraint
      };

      const flags = await this.featureFlagManager.getFlags();
      const decision = await this.makeIntelligentRoutingDecision(request, routingContext, flags);

      return decision;
    } finally {
      // Restore original matrix
      this.decisionMatrix = originalMatrix;
    }
  }
}
