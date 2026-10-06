/**
 * OpenRouterMetricsCollector Unit Tests
 *
 * Tests the OpenRouter metrics collection functionality including:
 * - Request/response metrics recording
 * - Error metrics recording
 * - Generation stats fetching
 * - Cost estimation
 * - Health monitoring
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OpenRouterMetricsCollector } from '../openrouter-metrics-collector';
import { AIMetricsIntegration } from '../ai-metrics-integration';

// Mock the metrics integration
jest.mock('../ai-metrics-integration');
const mockAIMetricsIntegration = AIMetricsIntegration as jest.MockedClass<typeof AIMetricsIntegration>;

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('OpenRouterMetricsCollector', () => {
  let collector: OpenRouterMetricsCollector;
  let mockMetricsIntegration: jest.Mocked<AIMetricsIntegration>;

  beforeEach(() => {
    mockMetricsIntegration = {
      recordAIUsage: jest.fn()
    } as any;

    mockAIMetricsIntegration.mockImplementation(() => mockMetricsIntegration);

    collector = new OpenRouterMetricsCollector('sk-test-key');
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Request Metrics Recording', () => {
    it('should record successful completion request metrics', async () => {
      const request = {
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        hints: { taskType: 'simple_qa' }
      };

      const response = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'Hi there!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'openai/gpt-4o',
        generation_id: 'gen-456'
      };

      const startTime = Date.now() - 1000;

      // Mock generation stats API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'gen-456',
            cost: 0.002,
            latency: 1000,
            provider: 'openai',
            model: 'gpt-4o',
            routing_info: {
              selected_provider: 'openai',
              fallback_used: false,
              cost_optimization: true
            }
          }
        })
      } as Response);

      await collector.recordOpenRouterRequest(
        'org-123',
        'user-456',
        request,
        response,
        startTime,
        'gen-456'
      );

      expect(mockMetricsIntegration.recordAIUsage).toHaveBeenCalledWith(
        'org-123',
        'user-456',
        expect.objectContaining({
          provider: 'openrouter',
          model: 'openai/gpt-4o',
          operation: 'completion',
          cost: 0.002,
          success: true,
          tokenCount: {
            prompt: 10,
            completion: 5,
            total: 15
          },
          metadata: expect.objectContaining({
            taskType: 'simple_qa',
            actualProvider: 'openai',
            generationId: 'gen-456',
            routingDecision: expect.objectContaining({
              selected_provider: 'openai',
              fallback_used: false,
              cost_optimization: true
            })
          })
        })
      );
    });

    it('should record embedding request metrics', async () => {
      const request = {
        input: ['Text to embed'],
        model: 'openai/text-embedding-3-small'
      };

      const response = {
        data: [{ embedding: new Array(1536).fill(0.1) }],
        usage: { total_tokens: 5 },
        model: 'openai/text-embedding-3-small'
      };

      const startTime = Date.now() - 500;

      await collector.recordOpenRouterRequest(
        'org-123',
        'user-456',
        request,
        response,
        startTime
      );

      expect(mockMetricsIntegration.recordAIUsage).toHaveBeenCalledWith(
        'org-123',
        'user-456',
        expect.objectContaining({
          provider: 'openrouter',
          model: 'openai/text-embedding-3-small',
          operation: 'embedding',
          success: true,
          tokenCount: {
            prompt: 5,
            completion: 0,
            total: 5
          },
          metadata: expect.objectContaining({
            taskType: 'embedding',
            actualProvider: 'openai'
          })
        })
      );
    });

    it('should record streaming request metrics', async () => {
      const request = {
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Stream this response' }],
        stream: true
      };

      const response = {
        id: 'chatcmpl-stream-123',
        choices: [{ message: { content: 'Streaming response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        model: 'openai/gpt-4o'
      };

      const startTime = Date.now() - 2000;

      await collector.recordOpenRouterRequest(
        'org-123',
        'user-456',
        request,
        response,
        startTime
      );

      expect(mockMetricsIntegration.recordAIUsage).toHaveBeenCalledWith(
        'org-123',
        'user-456',
        expect.objectContaining({
          provider: 'openrouter',
          operation: 'stream',
          success: true
        })
      );
    });

    it('should handle missing generation stats gracefully', async () => {
      const request = {
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const response = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'Hi!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'openai/gpt-4o',
        generation_id: 'gen-456'
      };

      // Mock failed generation stats API call
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);

      const startTime = Date.now() - 1000;

      await collector.recordOpenRouterRequest(
        'org-123',
        'user-456',
        request,
        response,
        startTime,
        'gen-456'
      );

      // Should still record metrics with estimated cost
      expect(mockMetricsIntegration.recordAIUsage).toHaveBeenCalledWith(
        'org-123',
        'user-456',
        expect.objectContaining({
          provider: 'openrouter',
          success: true,
          cost: expect.any(Number) // Estimated cost
        })
      );
    });

    it('should not throw errors if metrics recording fails', async () => {
      const request = {
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const response = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'Hi!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'openai/gpt-4o'
      };

      const startTime = Date.now() - 1000;

      // Mock metrics integration to throw error
      mockMetricsIntegration.recordAIUsage.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(collector.recordOpenRouterRequest(
        'org-123',
        'user-456',
        request,
        response,
        startTime
      )).resolves.not.toThrow();
    });
  });

  describe('Error Metrics Recording', () => {
    it('should record error metrics when request fails', async () => {
      const request = {
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'This will fail' }],
        hints: { taskType: 'simple_qa' }
      };

      const error = new Error('Rate limit exceeded');
      const startTime = Date.now() - 1000;

      await collector.recordOpenRouterError(
        'org-123',
        'user-456',
        request,
        error,
        startTime
      );

      expect(mockMetricsIntegration.recordAIUsage).toHaveBeenCalledWith(
        'org-123',
        'user-456',
        expect.objectContaining({
          provider: 'openrouter',
          model: 'openai/gpt-4o',
          operation: 'completion',
          success: false,
          error: 'Rate limit exceeded',
          tokenCount: { prompt: 0, completion: 0, total: 0 },
          cost: 0,
          metadata: expect.objectContaining({
            taskType: 'simple_qa',
            errorType: 'Error'
          })
        })
      );
    });

    it('should handle error metrics recording failures gracefully', async () => {
      const request = {
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Test' }]
      };

      const error = new Error('Test error');
      const startTime = Date.now() - 1000;

      // Mock metrics integration to throw error
      mockMetricsIntegration.recordAIUsage.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(collector.recordOpenRouterError(
        'org-123',
        'user-456',
        request,
        error,
        startTime
      )).resolves.not.toThrow();
    });
  });

  describe('Generation Stats Fetching', () => {
    it('should fetch detailed generation stats', async () => {
      const mockGenerationStats = {
        id: 'gen-123',
        cost: 0.05,
        latency: 1500,
        provider: 'anthropic',
        model: 'claude-3-opus',
        tokens_prompt: 100,
        tokens_completion: 50,
        tokens_total: 150,
        routing_info: {
          selected_provider: 'anthropic',
          fallback_used: false,
          cost_optimization: true,
          latency_optimization: false
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockGenerationStats })
      } as Response);

      const stats = await (collector as any).fetchGenerationStats('gen-123');

      expect(stats).toEqual(mockGenerationStats);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/generation?id=gen-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test-key'
          })
        })
      );
    });

    it('should return null when generation stats API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);

      const stats = await (collector as any).fetchGenerationStats('gen-404');

      expect(stats).toBeNull();
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate costs for different models', () => {
      const testCases = [
        {
          model: 'openai/gpt-4o',
          tokenCount: { prompt: 100, completion: 50, total: 150 },
          expectedCost: 0.0005 + 0.00075 // 100/1000 * 0.005 + 50/1000 * 0.015
        },
        {
          model: 'openai/gpt-4o-mini',
          tokenCount: { prompt: 100, completion: 50, total: 150 },
          expectedCost: 0.000015 + 0.00003 // 100/1000 * 0.00015 + 50/1000 * 0.0006
        },
        {
          model: 'anthropic/claude-3-opus',
          tokenCount: { prompt: 100, completion: 50, total: 150 },
          expectedCost: 0.0015 + 0.00375 // 100/1000 * 0.015 + 50/1000 * 0.075
        }
      ];

      testCases.forEach(({ model, tokenCount, expectedCost }) => {
        const estimatedCost = (collector as any).estimateCost(tokenCount, model);
        expect(estimatedCost).toBeCloseTo(expectedCost, 8);
      });
    });

    it('should handle unknown models with default pricing', () => {
      const tokenCount = { prompt: 100, completion: 50, total: 150 };
      const estimatedCost = (collector as any).estimateCost(tokenCount, 'unknown/model');

      // Should use default pricing: prompt: 0.002, completion: 0.004
      const expectedCost = 0.0002 + 0.0002; // 100/1000 * 0.002 + 50/1000 * 0.004
      expect(estimatedCost).toBeCloseTo(expectedCost, 8);
    });
  });

  describe('Provider Extraction', () => {
    it('should extract provider from model string', () => {
      const testCases = [
        { model: 'openai/gpt-4o', expected: 'openai' },
        { model: 'anthropic/claude-3-opus', expected: 'anthropic' },
        { model: 'google/gemini-pro', expected: 'google' },
        { model: 'azure/gpt-4', expected: 'azure' },
        { model: 'single-model-name', expected: 'unknown' }
      ];

      testCases.forEach(({ model, expected }) => {
        const provider = (collector as any).extractProviderFromModel(model);
        expect(provider).toBe(expected);
      });
    });
  });

  describe('Operation Detection', () => {
    it('should detect streaming operations', () => {
      const request = { stream: true, messages: [] };
      const operation = (collector as any).determineOperation(request);
      expect(operation).toBe('stream');
    });

    it('should detect embedding operations', () => {
      const request = { input: ['text'], model: 'text-embedding-3-small' };
      const operation = (collector as any).determineOperation(request);
      expect(operation).toBe('embedding');
    });

    it('should detect completion operations', () => {
      const request = { messages: [{ role: 'user', content: 'Hello' }] };
      const operation = (collector as any).determineOperation(request);
      expect(operation).toBe('completion');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when API is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'openai/gpt-4o' },
            { id: 'anthropic/claude-3-opus' },
            { id: 'google/gemini-pro' }
          ]
        })
      } as Response);

      const health = await collector.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.availableProviders).toContain('openai');
      expect(health.availableProviders).toContain('anthropic');
      expect(health.availableProviders).toContain('google');
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.errors).toHaveLength(0);
    });

    it('should return unavailable status when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503
      } as Response);

      const health = await collector.healthCheck();

      expect(health.status).toBe('unavailable');
      expect(health.availableProviders).toHaveLength(0);
      expect(health.errors).toContain('OpenRouter API returned 503');
    });

    it('should return unavailable status when network error occurs', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const health = await collector.healthCheck();

      expect(health.status).toBe('unavailable');
      expect(health.availableProviders).toHaveLength(0);
      expect(health.errors).toContain('Network error');
    });
  });

  describe('Analytics Methods', () => {
    it('should return analytics structure', async () => {
      const analytics = await collector.getOpenRouterAnalytics('org-123');

      expect(analytics).toHaveProperty('totalRequests');
      expect(analytics).toHaveProperty('totalCost');
      expect(analytics).toHaveProperty('averageLatency');
      expect(analytics).toHaveProperty('successRate');
      expect(analytics).toHaveProperty('providerBreakdown');
      expect(analytics).toHaveProperty('costOptimizationSavings');
      expect(analytics).toHaveProperty('fallbackUsageRate');
    });

    it('should return cost optimization insights structure', async () => {
      const insights = await collector.getCostOptimizationInsights('org-123');

      expect(insights).toHaveProperty('potentialSavings');
      expect(insights).toHaveProperty('recommendedProviders');
      expect(insights).toHaveProperty('inefficientRoutes');
      expect(Array.isArray(insights.recommendedProviders)).toBe(true);
      expect(Array.isArray(insights.inefficientRoutes)).toBe(true);
    });

    it('should return provider performance comparison structure', async () => {
      const comparison = await collector.getProviderPerformanceComparison('org-123');

      expect(comparison).toHaveProperty('providers');
      expect(comparison).toHaveProperty('recommendations');
      expect(Array.isArray(comparison.providers)).toBe(true);
      expect(Array.isArray(comparison.recommendations)).toBe(true);
    });
  });
});
