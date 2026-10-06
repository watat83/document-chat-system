/**
 * AIServiceManager Unit Tests
 *
 * Comprehensive unit tests for the AIServiceManager class covering:
 * - Singleton pattern implementation
 * - Provider registration and management
 * - Request routing and fallback logic
 * - Circuit breaker functionality
 * - Metrics collection and monitoring
 * - Configuration management
 * - Error handling and resilience
 * - Integration with all supported providers
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AIServiceManager } from '../ai-service-manager';
import {
  UnifiedCompletionRequest,
  UnifiedEmbeddingRequest,
  UnifiedCompletionResponse,
  UnifiedEmbeddingResponse,
  UnifiedStreamRequest,
  AIServiceConfig,
  AIMetrics,
  ProviderConfig,
  TaskType
} from '../interfaces/types';
import { AIProviderRegistry } from '../registry/provider-registry';
import { AIRequestRouter } from '../routing/request-router';
import { CircuitBreakerManager } from '../circuit-breaker/circuit-breaker';
import { AIFallbackStrategy } from '../fallback/fallback-strategy';
import { AIConfiguration } from '../config/ai-config';
import { AIMetricsIntegration } from '../monitoring/ai-metrics-integration';
import MiddlewareManager from '../middleware';

// Mock all dependencies
jest.mock('@/lib/config/env', () => ({
  ...jest.requireActual('@/lib/config/env'),
  ai: { openrouterApiKey: '', openaiApiKey: '', anthropicApiKey: '', openrouterAppName: 'TestApp', openrouterSiteUrl: 'https://test.com', openrouterSmartRouting: true, openrouterCostOptimization: 'balanced' },
  imageRouter: { apiKey: '' },
}));
jest.mock('../providers/openai-adapter');
jest.mock('../providers/anthropic-adapter');
jest.mock('../providers/smart-openrouter-adapter');
jest.mock('../providers/vercel-ai-adapter');
jest.mock('../registry/provider-registry');
jest.mock('../routing/request-router');
jest.mock('../circuit-breaker/circuit-breaker');
jest.mock('../fallback/fallback-strategy');
jest.mock('../config/ai-config');
jest.mock('../monitoring/ai-metrics-integration');
jest.mock('../middleware');
jest.mock('../middleware/built-in');

import { OpenAIAdapter } from '../providers/openai-adapter';
import { AnthropicAdapter } from '../providers/anthropic-adapter';
import { SmartOpenRouterAdapter } from '../providers/smart-openrouter-adapter';
import { VercelAIAdapter } from '../providers/vercel-ai-adapter';

// Mock implementations
const MockOpenAIAdapter = OpenAIAdapter as jest.MockedClass<typeof OpenAIAdapter>;
const MockAnthropicAdapter = AnthropicAdapter as jest.MockedClass<typeof AnthropicAdapter>;
const MockSmartOpenRouterAdapter = SmartOpenRouterAdapter as jest.MockedClass<typeof SmartOpenRouterAdapter>;
const MockVercelAIAdapter = VercelAIAdapter as jest.MockedClass<typeof VercelAIAdapter>;

describe('AIServiceManager Unit Tests', () => {
  let aiServiceManager: AIServiceManager;
  let mockRegistry: jest.Mocked<AIProviderRegistry>;
  let mockRouter: jest.Mocked<AIRequestRouter>;
  let mockCircuitBreaker: jest.Mocked<CircuitBreakerManager>;
  let mockFallbackStrategy: jest.Mocked<AIFallbackStrategy>;
  let mockAIConfig: jest.Mocked<AIConfiguration>;
  let mockMetricsIntegration: jest.Mocked<AIMetricsIntegration>;
  let mockMiddlewareManager: jest.Mocked<MiddlewareManager>;

  beforeEach(() => {
    delete process.env.AI_ENABLE_DEMO_PROVIDER;
    // Clear singleton instance
    (AIServiceManager as any).instance = null;

    // Setup mock implementations
    mockRegistry = {
      register: jest.fn(),
      getProvider: jest.fn(),
      getAvailableProviders: jest.fn(),
      getProviderStatus: jest.fn(),
      destroy: jest.fn()
    } as any;

    mockRouter = {
      route: jest.fn(),
      updateRouting: jest.fn(),
      getRoutingDecision: jest.fn()
    } as any;

    mockCircuitBreaker = {
      isProviderAvailable: jest.fn(),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      resetProvider: jest.fn(),
      forceOpenProvider: jest.fn(),
      forceCloseProvider: jest.fn(),
      getAllProviderMetrics: jest.fn(),
      getProviderStatus: jest.fn()
    } as any;

    mockFallbackStrategy = {
      executeCompletionWithFallback: jest.fn(),
      executeEmbeddingWithFallback: jest.fn(),
      executeStreamWithFallback: jest.fn(),
      getSystemStatus: jest.fn()
    } as any;

    mockAIConfig = {
      getProviderConfig: jest.fn(),
      getServiceConfig: jest.fn(),
      isProviderConfigured: jest.fn(),
      getConfiguredProviders: jest.fn(),
      validateConfiguration: jest.fn(),
      getFallbackConfig: jest.fn(),
      getCircuitBreakerConfig: jest.fn(),
      isVercelEnabled: jest.fn(),
      getVercelConfig: jest.fn(),
      getInstance: jest.fn(),
      updateServiceConfig: jest.fn(),
      reload: jest.fn()
    } as any;

    mockMetricsIntegration = {
      recordAIUsage: jest.fn(),
      getProviderMetrics: jest.fn(),
      getSystemHealth: jest.fn(),
      getCostAnalytics: jest.fn(),
      getUsageReport: jest.fn()
    } as any;

    mockMiddlewareManager = {
      register: jest.fn(),
      processRequest: jest.fn(),
      processResponse: jest.fn()
    } as any;

    // Mock static getInstance method
    (AIConfiguration.getInstance as jest.Mock).mockReturnValue(mockAIConfig);

    // Mock constructor dependencies
    (AIProviderRegistry as any).mockImplementation(() => mockRegistry);
    (AIRequestRouter as any).mockImplementation(() => mockRouter);
    (CircuitBreakerManager as any).mockImplementation(() => mockCircuitBreaker);
    (AIFallbackStrategy as any).mockImplementation(() => mockFallbackStrategy);
    (AIMetricsIntegration as any).mockImplementation(() => mockMetricsIntegration);
    (MiddlewareManager as any).mockImplementation(() => mockMiddlewareManager);

    // Setup default mock configurations
    mockAIConfig.getServiceConfig.mockReturnValue({
      enabled: true,
      maxConcurrentRequests: 100,
      defaultTimeout: 30000,
      retryAttempts: 3,
      circuitBreakerConfig: {
        failureThreshold: 5,
        recoveryTimeout: 60000,
        monitoringWindow: 300000
      },
      fallbackConfig: {
        maxAttempts: 3,
        backoffMultiplier: 2,
        initialBackoffMs: 1000
      }
    });

    mockAIConfig.getFallbackConfig.mockReturnValue({
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialBackoffMs: 1000,
      enableRetries: true,
      retryableErrors: ['RateLimitError', 'NetworkError', 'TimeoutError']
    });

    mockAIConfig.getCircuitBreakerConfig.mockReturnValue({
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringWindow: 300000
    });

    mockAIConfig.isVercelEnabled.mockReturnValue(false);
    mockAIConfig.getVercelConfig.mockReturnValue({
      enabled: false,
      useFor: [],
      fallbackToOurSystem: true
    });

    // Mock middleware processing
    mockMiddlewareManager.processRequest.mockResolvedValue({
      request: {} as any,
      provider: 'auto',
      model: 'fast',
      operation: 'completion',
      startTime: new Date(),
      metadata: {}
    });

    // Create service manager instance
    aiServiceManager = new AIServiceManager({
      enableFallback: true,
      enableCircuitBreaker: true,
      enableCaching: true,
      defaultTimeout: 30000,
      maxConcurrentRequests: 100
    });
  });

  afterEach(async () => {
    await aiServiceManager.initialize();
    aiServiceManager.destroy();
    jest.resetAllMocks();
    // Clear singleton instance
    (AIServiceManager as any).instance = null;
  });

  describe('Singleton Pattern', () => {
    it('should create singleton instance', () => {
      const instance1 = AIServiceManager.getInstance();
      const instance2 = AIServiceManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(AIServiceManager);
    });

    it('should use provided configuration on first call', () => {
      const config: AIServiceConfig = {
        enableFallback: false,
        enableCircuitBreaker: false,
        enableCaching: false,
        defaultTimeout: 60000,
        maxConcurrentRequests: 50
      };

      const instance = AIServiceManager.getInstance(config);
      expect(instance).toBeInstanceOf(AIServiceManager);
    });

    it('should ignore configuration on subsequent calls', () => {
      const config1: AIServiceConfig = { enableFallback: true };
      const config2: AIServiceConfig = { enableFallback: false };

      const instance1 = AIServiceManager.getInstance(config1);
      const instance2 = AIServiceManager.getInstance(config2);

      expect(instance1).toBe(instance2);
    });
  });

  describe('Provider Registration', () => {
    it('should register provider successfully', () => {
      const mockAdapter = {
        getName: () => 'test-provider',
        initialize: jest.fn(),
        generateCompletion: jest.fn(),
        generateEmbedding: jest.fn(),
        streamCompletion: jest.fn()
      } as any;

      const config: ProviderConfig = {
        enabled: true,
        priority: 10,
        maxConcurrentRequests: 50
      };

      aiServiceManager.registerProvider('test-provider', mockAdapter, config);

      expect(mockRegistry.register).toHaveBeenCalledWith('test-provider', mockAdapter, config);
    });

    it('should get available providers', () => {
      const providers = ['openai', 'anthropic', 'openrouter'];
      mockRegistry.getAvailableProviders.mockReturnValue(providers);

      const result = aiServiceManager.getAvailableProviders();

      expect(result).toEqual(providers);
      expect(mockRegistry.getAvailableProviders).toHaveBeenCalled();
    });

    it('should get provider status', () => {
      const status = { enabled: true, healthy: true, lastHealthCheck: new Date() };
      mockRegistry.getProviderStatus.mockReturnValue(status);

      const result = aiServiceManager.getProviderStatus('openai');

      expect(result).toEqual(status);
      expect(mockRegistry.getProviderStatus).toHaveBeenCalledWith('openai');
    });
  });

  describe('Provider Initialization', () => {
    beforeEach(() => {
      // Mock environment variables
      process.env.OPENAI_API_KEY = 'sk-test-openai-key';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
    });

    afterEach(() => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
    });

    it('should initialize OpenAI provider when API key is available', async () => {
      mockAIConfig.getProviderConfig.mockImplementation((provider) => {
        if (provider === 'openai') {
          return { apiKey: 'sk-test-openai-key' };
        }
        return null;
      });

      MockOpenAIAdapter.mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        getName: () => 'openai',
        getCapabilities: () => ({ maxTokens: 128000 })
      } as any));

      await aiServiceManager.initializeDefaultProviders();

      expect(MockOpenAIAdapter).toHaveBeenCalledWith({
        apiKey: 'sk-test-openai-key',
        organizationId: undefined,
        maxRetries: 3,
        timeout: 30000
      });

      expect(mockRegistry.register).toHaveBeenCalledWith('openai', expect.any(Object), {
        enabled: true,
        priority: 9,
        maxConcurrentRequests: 50,
        healthCheckInterval: 60000
      });
    });

    it('should initialize Anthropic provider when API key is available', async () => {
      mockAIConfig.getProviderConfig.mockImplementation((provider) => {
        if (provider === 'anthropic') {
          return { apiKey: 'sk-ant-test-key' };
        }
        return null;
      });

      MockAnthropicAdapter.mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        getName: () => 'anthropic',
        getCapabilities: () => ({ maxTokens: 200000 })
      } as any));

      await aiServiceManager.initializeDefaultProviders();

      expect(MockAnthropicAdapter).toHaveBeenCalledWith({
        apiKey: 'sk-ant-test-key',
        maxRetries: 3,
        timeout: 30000
      });

      expect(mockRegistry.register).toHaveBeenCalledWith('anthropic', expect.any(Object), {
        enabled: true,
        priority: 8,
        maxConcurrentRequests: 50,
        healthCheckInterval: 60000
      });
    });

    it('should initialize OpenRouter provider when API key is available', async () => {
      mockAIConfig.getProviderConfig.mockImplementation((provider) => {
        if (provider === 'openrouter') {
          return {
            apiKey: 'sk-or-test-key',
            appName: 'TestApp',
            siteUrl: 'https://test.com'
          };
        }
        return null;
      });

      const mockOpenRouterAdapter = {
        initialize: jest.fn().mockResolvedValue(undefined),
        getName: () => 'openrouter',
        getCapabilities: () => ({ maxTokens: 128000 })
      };

      MockSmartOpenRouterAdapter.mockImplementation(() => mockOpenRouterAdapter as any);

      await aiServiceManager.initializeDefaultProviders();

      expect(MockSmartOpenRouterAdapter).toHaveBeenCalledWith({
        apiKey: 'sk-or-test-key',
        appName: 'TestApp',
        siteUrl: 'https://test.com',
        enableSmartRouting: true,
        costOptimization: 'balanced',
        maxRetries: 3,
        timeout: 30000
      });

      expect(mockOpenRouterAdapter.initialize).toHaveBeenCalled();
    });

    it('should handle provider initialization failures gracefully', async () => {
      mockAIConfig.getProviderConfig.mockImplementation((provider) => {
        if (provider === 'openai') {
          return { apiKey: 'sk-test-openai-key' };
        }
        return null;
      });

      MockOpenAIAdapter.mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      // Should not throw error
      await expect(aiServiceManager.initializeDefaultProviders()).resolves.not.toThrow();
    });

    it('does not register demo providers without an explicit opt-in', async () => {
      await aiServiceManager.initializeDefaultProviders();
      expect(mockRegistry.register.mock.calls.some(([name]) => name === 'mock-demo' || name === 'demo')).toBe(false);
    });
  });

  describe('Completion Generation', () => {
    let mockRequest: UnifiedCompletionRequest;
    let mockResponse: UnifiedCompletionResponse;

    beforeEach(() => {
      mockRequest = {
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        model: 'fast',
        metadata: {
          organizationId: 'org-123',
          userId: 'user-456'
        }
      };

      mockResponse = {
        id: 'comp-123',
        content: 'I am doing well, thank you!',
        model: 'gpt-3.5-turbo',
        usage: {
          promptTokens: 10,
          completionTokens: 8,
          totalTokens: 18
        },
        metadata: {
          provider: 'openai',
          finishReason: 'stop',
          organizationId: 'org-123',
          userId: 'user-456'
        }
      };
    });

    it('should generate completion with fallback enabled', async () => {
      const fallbackResult = {
        result: mockResponse,
        successfulProvider: 'openai',
        totalLatency: 1500,
        attemptsUsed: 1
      };

      mockFallbackStrategy.executeCompletionWithFallback.mockResolvedValue(fallbackResult);

      const result = await aiServiceManager.generateCompletion(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockFallbackStrategy.executeCompletionWithFallback).toHaveBeenCalledWith(mockRequest);
    });

    it('should generate completion with direct routing when fallback disabled', async () => {
      // Create new instance without fallback
      const serviceManager = new AIServiceManager({
        enableFallback: false,
        enableCircuitBreaker: true,
        enableCaching: true,
        defaultTimeout: 30000,
        maxConcurrentRequests: 100
      });

      const mockAdapter = {
        generateCompletion: jest.fn().mockResolvedValue(mockResponse)
      };

      const routingResult = {
        adapter: mockAdapter,
        selectedProvider: 'openai',
        estimatedCost: 0.002,
        confidence: 0.95
      };

      mockRouter.route.mockResolvedValue(routingResult);

      const result = await serviceManager.generateCompletion(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockRouter.route).toHaveBeenCalledWith({
        model: 'fast',
        taskType: 'simple_qa',
        complexity: 'medium',
        messages: mockRequest.messages
      });
      expect(mockAdapter.generateCompletion).toHaveBeenCalledWith(mockRequest);
    });

    it('should handle completion generation errors', async () => {
      const error = new Error('API Error');
      mockFallbackStrategy.executeCompletionWithFallback.mockRejectedValue(error);

      await expect(aiServiceManager.generateCompletion(mockRequest)).rejects.toThrow('API Error');
    });

    it('should record metrics for successful completion', async () => {
      const fallbackResult = {
        result: mockResponse,
        successfulProvider: 'openai',
        totalLatency: 1500,
        attemptsUsed: 1
      };

      mockFallbackStrategy.executeCompletionWithFallback.mockResolvedValue(fallbackResult);

      await aiServiceManager.generateCompletion(mockRequest);

      // Check that metrics were recorded
      const metrics = aiServiceManager.getRequestMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0]).toEqual(expect.objectContaining({
        provider: 'openai',
        model: 'fast',
        operation: 'completion',
        success: true
      }));
    });

    it('should record metrics for failed completion', async () => {
      const error = new Error('API Error');
      mockFallbackStrategy.executeCompletionWithFallback.mockRejectedValue(error);

      await expect(aiServiceManager.generateCompletion(mockRequest)).rejects.toThrow();

      const metrics = aiServiceManager.getRequestMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0]).toEqual(expect.objectContaining({
        provider: 'unknown',
        model: 'fast',
        operation: 'completion',
        success: false,
        error: 'API Error'
      }));
    });
  });

  describe('Embedding Generation', () => {
    let mockRequest: UnifiedEmbeddingRequest;
    let mockResponse: UnifiedEmbeddingResponse;

    beforeEach(() => {
      mockRequest = {
        text: 'Government contract opportunity',
        model: 'embedding-small',
        metadata: {
          organizationId: 'org-123',
          userId: 'user-456'
        }
      };

      mockResponse = {
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        usage: {
          promptTokens: 5,
          totalTokens: 5
        },
        metadata: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          organizationId: 'org-123',
          userId: 'user-456'
        }
      };
    });

    it('should generate embedding with fallback enabled', async () => {
      const fallbackResult = {
        result: mockResponse,
        successfulProvider: 'openai',
        totalLatency: 800,
        attemptsUsed: 1
      };

      mockFallbackStrategy.executeEmbeddingWithFallback.mockResolvedValue(fallbackResult);

      const result = await aiServiceManager.generateEmbedding(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockFallbackStrategy.executeEmbeddingWithFallback).toHaveBeenCalledWith(mockRequest);
    });

    it('should generate embedding with direct routing when fallback disabled', async () => {
      const serviceManager = new AIServiceManager({
        enableFallback: false,
        enableCircuitBreaker: true,
        enableCaching: true,
        defaultTimeout: 30000,
        maxConcurrentRequests: 100
      });

      const mockAdapter = {
        generateEmbedding: jest.fn().mockResolvedValue(mockResponse)
      };

      const routingResult = {
        adapter: mockAdapter,
        selectedProvider: 'openai',
        estimatedCost: 0.001,
        confidence: 0.95
      };

      mockRouter.route.mockResolvedValue(routingResult);

      const result = await serviceManager.generateEmbedding(mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockAdapter.generateEmbedding).toHaveBeenCalledWith(mockRequest);
    });

    it('should handle embedding generation errors', async () => {
      const error = new Error('Embedding Error');
      mockFallbackStrategy.executeEmbeddingWithFallback.mockRejectedValue(error);

      await expect(aiServiceManager.generateEmbedding(mockRequest)).rejects.toThrow('Embedding Error');
    });
  });

  describe('Streaming Completion', () => {
    let mockRequest: UnifiedStreamRequest;

    beforeEach(() => {
      mockRequest = {
        messages: [{ role: 'user', content: 'Tell me a story' }],
        model: 'balanced',
        metadata: {
          organizationId: 'org-123',
          userId: 'user-456'
        }
      };
    });

    it('should stream completion with fallback enabled', async () => {
      const mockStream = (async function* () {
        yield { content: 'Once', metadata: { provider: 'openai' } };
        yield { content: ' upon', metadata: { provider: 'openai' } };
        yield { content: ' a time', metadata: { provider: 'openai' } };
      })();

      mockFallbackStrategy.executeStreamWithFallback.mockReturnValue(mockStream);

      const stream = aiServiceManager.streamCompletion(mockRequest);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0].content).toBe('Once');
      expect(mockFallbackStrategy.executeStreamWithFallback).toHaveBeenCalledWith(mockRequest);
    });

    it('should stream completion with direct routing when fallback disabled', async () => {
      const serviceManager = new AIServiceManager({
        enableFallback: false,
        enableCircuitBreaker: true,
        enableCaching: true,
        defaultTimeout: 30000,
        maxConcurrentRequests: 100
      });

      const mockStream = (async function* () {
        yield { content: 'Hello', metadata: { provider: 'openai' } };
        yield { content: ' world', metadata: { provider: 'openai' } };
      })();

      const mockAdapter = {
        streamCompletion: jest.fn().mockReturnValue(mockStream)
      };

      const routingResult = {
        adapter: mockAdapter,
        selectedProvider: 'openai',
        estimatedCost: 0.003,
        confidence: 0.95
      };

      mockRouter.route.mockResolvedValue(routingResult);

      const stream = serviceManager.streamCompletion(mockRequest);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(mockAdapter.streamCompletion).toHaveBeenCalledWith(mockRequest);
    });
  });

  describe('Health Monitoring', () => {
    it('should provide comprehensive health status', async () => {
      const providers = ['openai', 'anthropic', 'openrouter'];
      mockRegistry.getAvailableProviders.mockReturnValue(providers);

      mockRegistry.getProviderStatus.mockImplementation((provider) => ({
        healthy: provider !== 'anthropic', // Simulate anthropic being unhealthy
        enabled: true,
        lastHealthCheck: new Date()
      }));

      const health = await aiServiceManager.healthCheck();

      expect(health).toEqual({
        status: 'degraded', // Not all providers are healthy
        providers: {
          openai: { status: 'available', latency: 0, errorRate: 0, lastCheck: expect.any(Date) },
          anthropic: { status: 'unavailable', latency: 0, errorRate: 0, lastCheck: expect.any(Date) },
          openrouter: { status: 'available', latency: 0, errorRate: 0, lastCheck: expect.any(Date) }
        },
        timestamp: expect.any(Date),
        uptime: expect.any(Number)
      });
    });

    it('should report healthy status when all providers are available', async () => {
      const providers = ['openai', 'anthropic'];
      mockRegistry.getAvailableProviders.mockReturnValue(providers);

      mockRegistry.getProviderStatus.mockReturnValue({
        healthy: true,
        enabled: true,
        lastHealthCheck: new Date()
      });

      const health = await aiServiceManager.healthCheck();

      expect(health.status).toBe('healthy');
    });
  });

  describe('Metrics and Analytics', () => {
    it('should provide comprehensive service metrics', async () => {
      // Pre-populate with some test metrics
      const testMetrics: AIMetrics[] = [
        {
          provider: 'openai',
          model: 'fast',
          operation: 'completion',
          latency: 1000,
          tokenCount: { prompt: 10, completion: 5, total: 15 },
          cost: 0.001,
          success: true,
          metadata: { taskType: 'simple_qa' }
        },
        {
          provider: 'openai',
          model: 'fast',
          operation: 'completion',
          latency: 1500,
          tokenCount: { prompt: 20, completion: 10, total: 30 },
          cost: 0.002,
          success: true,
          metadata: { taskType: 'simple_qa' }
        }
      ];

      // Add test metrics to service manager
      testMetrics.forEach(metric => (aiServiceManager as any).metrics.push(metric));

      const metrics = await aiServiceManager.getMetrics();

      expect(metrics).toEqual(expect.objectContaining({
        averageLatency: 1250, // (1000 + 1500) / 2
        successRate: 1.0, // 100% success
        errorRate: 0.0, // 0% errors
        totalCost: 0.003, // 0.001 + 0.002
        startTime: expect.any(Date),
        endTime: expect.any(Date)
      }));
    });

    it('should calculate percentile latencies correctly', async () => {
      // Create test data with known latency distribution
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      const testMetrics = latencies.map(latency => ({
        provider: 'openai',
        model: 'fast',
        operation: 'completion',
        latency,
        tokenCount: { prompt: 10, completion: 5, total: 15 },
        cost: 0.001,
        success: true,
        metadata: { taskType: 'simple_qa' }
      }));

      testMetrics.forEach(metric => (aiServiceManager as any).metrics.push(metric));

      const metrics = await aiServiceManager.getMetrics();

      expect(metrics.p95Latency).toBe(1000); // 95th percentile
      expect(metrics.p99Latency).toBe(1000); // 99th percentile
    });

    it('should clear metrics', () => {
      // Add some test metrics
      (aiServiceManager as any).metrics.push({
        provider: 'openai',
        model: 'fast',
        operation: 'completion',
        latency: 1000,
        tokenCount: { prompt: 10, completion: 5, total: 15 },
        cost: 0.001,
        success: true,
        metadata: { taskType: 'simple_qa' }
      });

      expect(aiServiceManager.getRequestMetrics()).toHaveLength(1);

      aiServiceManager.clearMetrics();

      expect(aiServiceManager.getRequestMetrics()).toHaveLength(0);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should get circuit breaker status', () => {
      const circuitBreakerStatus = {
        openai: { state: 'closed', failures: 0, lastFailure: null },
        anthropic: { state: 'open', failures: 5, lastFailure: new Date() }
      };

      mockCircuitBreaker.getAllProviderMetrics.mockReturnValue(circuitBreakerStatus);

      const status = aiServiceManager.getCircuitBreakerStatus();

      expect(status).toEqual(circuitBreakerStatus);
    });

    it('should reset provider circuit breaker', () => {
      mockCircuitBreaker.resetProvider.mockReturnValue(true);

      const result = aiServiceManager.resetProvider('openai');

      expect(result).toBe(true);
      expect(mockCircuitBreaker.resetProvider).toHaveBeenCalledWith('openai');
    });

    it('should force provider status', () => {
      mockCircuitBreaker.forceOpenProvider.mockReturnValue(true);
      mockCircuitBreaker.forceCloseProvider.mockReturnValue(true);

      const openResult = aiServiceManager.forceProviderStatus('openai', 'open');
      const closeResult = aiServiceManager.forceProviderStatus('openai', 'close');

      expect(openResult).toBe(true);
      expect(closeResult).toBe(true);
      expect(mockCircuitBreaker.forceOpenProvider).toHaveBeenCalledWith('openai');
      expect(mockCircuitBreaker.forceCloseProvider).toHaveBeenCalledWith('openai');
    });
  });

  describe('Configuration Management', () => {
    it('should get current configuration', () => {
      const config = {
        enabled: true,
        maxConcurrentRequests: 100,
        defaultTimeout: 30000
      };

      mockAIConfig.getServiceConfig.mockReturnValue(config);

      const result = aiServiceManager.getConfiguration();

      expect(result).toEqual(config);
    });

    it('should update configuration', () => {
      const updates = {
        maxConcurrentRequests: 200,
        defaultTimeout: 60000
      };

      aiServiceManager.updateConfiguration(updates);

      expect(mockAIConfig.updateServiceConfig).toHaveBeenCalledWith(updates);
    });

    it('should validate configuration', () => {
      const validation = {
        valid: true,
        errors: []
      };

      mockAIConfig.validateConfiguration.mockReturnValue(validation);

      const result = aiServiceManager.validateConfiguration();

      expect(result).toEqual(validation);
    });

    it('should reload configuration', () => {
      aiServiceManager.reloadConfiguration();

      expect(mockAIConfig.reload).toHaveBeenCalled();
    });

    it('should check if provider is configured', () => {
      mockAIConfig.isProviderConfigured.mockReturnValue(true);

      const result = aiServiceManager.isProviderConfigured('openai');

      expect(result).toBe(true);
      expect(mockAIConfig.isProviderConfigured).toHaveBeenCalledWith('openai');
    });

    it('should get configured providers', () => {
      const providers = ['openai', 'anthropic'];
      mockAIConfig.getConfiguredProviders.mockReturnValue(providers);

      const result = aiServiceManager.getConfiguredProviders();

      expect(result).toEqual(providers);
    });
  });

  describe('OpenRouter Integration', () => {
    let mockOpenRouterAdapter: jest.Mocked<SmartOpenRouterAdapter>;

    beforeEach(() => {
      mockOpenRouterAdapter = {
        getName: jest.fn().mockReturnValue('openrouter'),
        getHealthMetrics: jest.fn(),
        getCostOptimizationInsights: jest.fn(),
        getProviderPerformanceComparison: jest.fn()
      } as any;

      Object.setPrototypeOf(mockOpenRouterAdapter, SmartOpenRouterAdapter.prototype);
      mockRegistry.getProvider.mockImplementation((name) => {
        if (name === 'openrouter') {
          return mockOpenRouterAdapter;
        }
        return null;
      });
    });

    it('should get OpenRouter adapter', () => {
      const adapter = aiServiceManager.getOpenRouterAdapter();

      expect(adapter).toBe(mockOpenRouterAdapter);
    });

    it('should get OpenRouter health metrics', async () => {
      const healthMetrics = {
        status: 'healthy',
        availableProviders: ['openai', 'anthropic'],
        latency: 150
      };

      mockOpenRouterAdapter.getHealthMetrics.mockResolvedValue(healthMetrics);

      const result = await aiServiceManager.getOpenRouterHealth();

      expect(result).toEqual(healthMetrics);
    });

    it('should handle OpenRouter health check errors', async () => {
      mockOpenRouterAdapter.getHealthMetrics.mockRejectedValue(new Error('Health check failed'));

      const result = await aiServiceManager.getOpenRouterHealth();

      expect(result).toEqual({
        status: 'error',
        reason: 'Failed to fetch OpenRouter health metrics',
        error: 'Health check failed'
      });
    });

    it('should get cost optimization insights', async () => {
      const insights = {
        potentialSavings: 0.25,
        recommendedProviders: ['openai', 'anthropic'],
        inefficientRoutes: []
      };

      mockOpenRouterAdapter.getCostOptimizationInsights.mockResolvedValue(insights);

      const result = await aiServiceManager.getOpenRouterCostInsights('org-123');

      expect(result).toEqual(insights);
      expect(mockOpenRouterAdapter.getCostOptimizationInsights).toHaveBeenCalledWith('org-123');
    });

    it('should get provider performance comparison', async () => {
      const comparison = {
        providers: [
          { name: 'openai', avgLatency: 800, costPer1k: 0.002 },
          { name: 'anthropic', avgLatency: 900, costPer1k: 0.003 }
        ],
        recommendations: ['Use OpenAI for cost-sensitive tasks']
      };

      mockOpenRouterAdapter.getProviderPerformanceComparison.mockResolvedValue(comparison);

      const result = await aiServiceManager.getOpenRouterProviderComparison('org-123');

      expect(result).toEqual(comparison);
    });

    it('should get OpenRouter status', () => {
      const providerStatus = {
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 100,
        lastHealthCheck: new Date()
      };

      mockRegistry.getProviderStatus.mockReturnValue(providerStatus);

      const status = aiServiceManager.getOpenRouterStatus();

      expect(status).toEqual({
        isAvailable: true,
        isEnabled: true,
        config: {
          priority: 5,
          maxConcurrentRequests: 100,
          healthCheckInterval: undefined
        },
        lastHealthCheck: providerStatus.lastHealthCheck
      });
    });

    it('should handle missing OpenRouter adapter', () => {
      mockRegistry.getProvider.mockReturnValue(null);

      const adapter = aiServiceManager.getOpenRouterAdapter();
      const status = aiServiceManager.getOpenRouterStatus();

      expect(adapter).toBeNull();
      expect(status).toEqual({
        isAvailable: false,
        isEnabled: false,
        error: 'OpenRouter adapter not initialized'
      });
    });
  });

  describe('Vercel AI Integration', () => {
    it('should initialize Vercel AI when enabled', () => {
      mockAIConfig.isVercelEnabled.mockReturnValue(true);
      mockAIConfig.getVercelConfig.mockReturnValue({
        enabled: true,
        useFor: ['streaming', 'functions'],
        enableFunctionCalling: true,
        enableVision: true,
        fallbackToOurSystem: true,
        costLimits: { maxPerRequest: 1.0 }
      });

      const serviceManager = new AIServiceManager({
        enableVercelAI: true,
        enableFallback: true,
        enableCircuitBreaker: true,
        enableCaching: true,
        defaultTimeout: 30000,
        maxConcurrentRequests: 100
      });

      expect(MockVercelAIAdapter).toHaveBeenCalled();
    });

    it('should get Vercel optimized service', () => {
      const mockVercelAdapter = {} as any;
      (aiServiceManager as any).vercelAdapter = mockVercelAdapter;

      const result = aiServiceManager.getVercelOptimizedService();

      expect(result).toBe(mockVercelAdapter);
    });

    it('should return null when Vercel adapter not initialized', () => {
      const result = aiServiceManager.getVercelOptimizedService();

      expect(result).toBeNull();
    });
  });

  describe('Middleware Integration', () => {
    it('should initialize default middleware', () => {
      expect(mockMiddlewareManager.register).toHaveBeenCalledTimes(3); // Logging, Monitoring, CostControl
    });

    it('should get middleware manager', () => {
      const middlewareManager = aiServiceManager.getMiddlewareManager();

      expect(middlewareManager).toBe(mockMiddlewareManager);
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should destroy resources properly', () => {
      aiServiceManager.destroy();

      expect(mockRegistry.destroy).toHaveBeenCalled();
      expect(aiServiceManager.getRequestMetrics()).toHaveLength(0);
    });

    it('should handle metrics memory management', async () => {
      // Add 1100 metrics to exceed the 1000 limit
      const metrics = Array.from({ length: 1100 }, (_, i) => ({
        provider: 'openai',
        model: 'fast',
        operation: 'completion',
        latency: 1000 + i,
        tokenCount: { prompt: 10, completion: 5, total: 15 },
        cost: 0.001,
        success: true,
        metadata: { taskType: 'simple_qa' }
      }));

      // Add metrics one by one to trigger memory management
      for (const metric of metrics) {
        await (aiServiceManager as any).recordMetrics(metric);
      }

      // Should keep only the last 1000 metrics
      expect(aiServiceManager.getRequestMetrics()).toHaveLength(1000);
    });
  });
});
