import { AIMetrics } from '../ai-service-manager';
import { AIMetricsIntegration } from './ai-metrics-integration';
import { TaskType } from '../interfaces/types';

export interface OpenRouterGenerationStats {
  id: string;
  cost: number;
  latency: number;
  provider: string;
  model: string;
  tokens_prompt: number;
  tokens_completion: number;
  tokens_total: number;
  origin: string;
  streamed: boolean;
  generation_time: number;
  created_at: string;
  updated_at: string;
  routing_info?: {
    selected_provider: string;
    fallback_used: boolean;
    cost_optimization: boolean;
    latency_optimization: boolean;
  };
}

export interface OpenRouterMetrics extends AIMetrics {
  metadata: AIMetrics['metadata'] & {
    generationId?: string;
    actualProvider?: string;
    actualModel?: string;
    routingDecision?: any;
    providerConfig?: any;
    fallbackUsed?: boolean;
    costOptimization?: boolean;
    latencyOptimization?: boolean;
  };
}

/**
 * OpenRouter Metrics Collector
 *
 * Collects enhanced telemetry data from OpenRouter API responses
 * and integrates with the existing Document Chat System metrics system.
 */
export class OpenRouterMetricsCollector {
  private aiMetricsIntegration: AIMetricsIntegration;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.aiMetricsIntegration = new AIMetricsIntegration();
  }

  /**
   * Record OpenRouter request metrics with enhanced telemetry
   */
  async recordOpenRouterRequest(
    organizationId: string,
    userId: string | undefined,
    request: any,
    response: any,
    startTime: number,
    generationId?: string
  ): Promise<void> {
    try {
      const endTime = Date.now();
      const latency = endTime - startTime;

      // Extract provider information from response
      const actualProvider = this.extractProviderFromModel(response.model);

      // Build enhanced metrics object
      const metrics: OpenRouterMetrics = {
        provider: 'openrouter',
        model: response.model,
        operation: this.determineOperation(request),
        latency,
        tokenCount: {
          prompt: response.usage?.prompt_tokens ?? (this.determineOperation(request) === 'embedding' ? response.usage?.total_tokens ?? 0 : 0),
          completion: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0
        },
        cost: 0, // Will be populated from generation stats
        success: true,
        metadata: {
          taskType: request.hints?.taskType || (this.determineOperation(request) === 'embedding' ? 'embedding' : 'unknown'),
          organizationId,
          userId,
          generationId,
          actualProvider,
          actualModel: response.model,
          providerConfig: request.provider,
          requestId: response.id,
          finishReason: response.choices?.[0]?.finish_reason
        }
      };

      // Fetch detailed generation stats if available
      if (generationId) {
        try {
          const detailedStats = await this.fetchGenerationStats(generationId);
          if (detailedStats) {
            metrics.cost = detailedStats.cost;
            metrics.metadata.routingDecision = detailedStats.routing_info;
            metrics.metadata.fallbackUsed = detailedStats.routing_info?.fallback_used;
            metrics.metadata.costOptimization = detailedStats.routing_info?.cost_optimization;
            metrics.metadata.latencyOptimization = detailedStats.routing_info?.latency_optimization;
          }
        } catch (error) {
          console.warn('Failed to fetch detailed OpenRouter generation stats:', error);
          // Fallback to basic cost estimation
          metrics.cost = this.estimateCost(metrics.tokenCount, response.model);
        }
      } else {
        // Fallback to basic cost estimation
        metrics.cost = this.estimateCost(metrics.tokenCount, response.model);
      }

      // Record in existing metrics system
      await this.aiMetricsIntegration.recordAIUsage(
        organizationId,
        userId,
        metrics
      );

      // Log enhanced metrics for monitoring
      console.log(`OpenRouter metrics recorded:`, {
        provider: actualProvider,
        model: response.model,
        tokens: metrics.tokenCount.total,
        cost: metrics.cost,
        latency: latency,
        taskType: metrics.metadata.taskType,
        generationId
      });

    } catch (error) {
      console.error('Failed to record OpenRouter metrics:', error);
      // Don't throw - metrics collection shouldn't break the main flow
    }
  }

  /**
   * Record OpenRouter error metrics
   */
  async recordOpenRouterError(
    organizationId: string,
    userId: string | undefined,
    request: any,
    error: Error,
    startTime: number
  ): Promise<void> {
    try {
      const endTime = Date.now();
      const latency = endTime - startTime;

      const metrics: OpenRouterMetrics = {
        provider: 'openrouter',
        model: request.model || 'unknown',
        operation: this.determineOperation(request),
        latency,
        tokenCount: { prompt: 0, completion: 0, total: 0 },
        cost: 0,
        success: false,
        error: error.message,
        metadata: {
          taskType: request.hints?.taskType || (this.determineOperation(request) === 'embedding' ? 'embedding' : 'unknown'),
          organizationId,
          userId,
          errorType: error.constructor.name,
          providerConfig: request.provider
        }
      };

      await this.aiMetricsIntegration.recordAIUsage(
        organizationId,
        userId,
        metrics
      );

    } catch (recordError) {
      console.error('Failed to record OpenRouter error metrics:', recordError);
    }
  }

  /**
   * Fetch detailed generation statistics from OpenRouter
   */
  private async fetchGenerationStats(generationId: string): Promise<OpenRouterGenerationStats | null> {
    try {
      const response = await fetch(`${this.baseUrl}/generation?id=${generationId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenRouter generation stats API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.warn('Failed to fetch OpenRouter generation stats:', error);
      return null;
    }
  }

  /**
   * Extract provider name from OpenRouter model string
   */
  private extractProviderFromModel(model: string): string {
    if (model.includes('/')) {
      return model.split('/')[0];
    }
    return 'unknown';
  }

  /**
   * Determine operation type from request
   */
  private determineOperation(request: any): 'completion' | 'embedding' | 'stream' {
    if (request.stream) {
      return 'stream';
    }
    if (request.input) {
      return 'embedding';
    }
    return 'completion';
  }

  /**
   * Estimate cost based on tokens and model
   */
  private estimateCost(tokenCount: { prompt: number; completion: number; total: number }, model: string): number {
    // Basic cost estimation - OpenRouter provides real-time pricing
    const baseCosts: Record<string, { prompt: number; completion: number }> = {
      'openai/gpt-4o': { prompt: 0.005, completion: 0.015 },
      'openai/gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
      'anthropic/claude-3-opus': { prompt: 0.015, completion: 0.075 },
      'anthropic/claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
      'anthropic/claude-3-haiku': { prompt: 0.00025, completion: 0.00125 }
    };

    const modelCosts = baseCosts[model] || { prompt: 0.002, completion: 0.004 };

    const promptCost = (tokenCount.prompt / 1000) * modelCosts.prompt;
    const completionCost = (tokenCount.completion / 1000) * modelCosts.completion;

    return promptCost + completionCost;
  }

  /**
   * Get OpenRouter-specific analytics
   */
  async getOpenRouterAnalytics(organizationId?: string, timeRange?: string): Promise<{
    totalRequests: number;
    totalCost: number;
    averageLatency: number;
    successRate: number;
    providerBreakdown: Record<string, {
      requests: number;
      cost: number;
      latency: number;
      successRate: number;
    }>;
    costOptimizationSavings: number;
    fallbackUsageRate: number;
  }> {
    // This would typically query your metrics database
    // For now, return structure that integrates with existing analytics
    return {
      totalRequests: 0,
      totalCost: 0,
      averageLatency: 0,
      successRate: 0,
      providerBreakdown: {},
      costOptimizationSavings: 0,
      fallbackUsageRate: 0
    };
  }

  /**
   * Get cost optimization insights
   */
  async getCostOptimizationInsights(organizationId: string): Promise<{
    potentialSavings: number;
    recommendedProviders: string[];
    inefficientRoutes: Array<{
      taskType: string;
      currentCost: number;
      optimizedCost: number;
      recommendation: string;
    }>;
  }> {
    // Analyze usage patterns and provide optimization recommendations
    return {
      potentialSavings: 0,
      recommendedProviders: [],
      inefficientRoutes: []
    };
  }

  /**
   * Get provider performance comparison
   */
  async getProviderPerformanceComparison(organizationId: string): Promise<{
    providers: Array<{
      name: string;
      requests: number;
      averageLatency: number;
      successRate: number;
      averageCost: number;
      qualityScore: number;
    }>;
    recommendations: string[];
  }> {
    // Compare performance across different providers accessed via OpenRouter
    return {
      providers: [],
      recommendations: []
    };
  }

  /**
   * Health check for OpenRouter service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unavailable';
    latency: number;
    availableProviders: string[];
    errors: string[];
  }> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          status: 'unavailable',
          latency,
          availableProviders: [],
          errors: [`OpenRouter API returned ${response.status}`]
        };
      }

      const data = await response.json();
      const availableProviders: string[] = Array.isArray(data.data) ? data.data.flatMap((model: { id?: unknown }) => typeof model.id === 'string' ? [model.id.split('/')[0]] : []) : [];
      const uniqueProviders = [...new Set(availableProviders)];

      return {
        status: 'healthy',
        latency,
        availableProviders: uniqueProviders,
        errors: []
      };
    } catch (error) {
      return {
        status: 'unavailable',
        latency: Date.now() - startTime,
        availableProviders: [],
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }
}
