import { aiAnalyticsService, AIMetricData } from './ai-analytics-service';
import { providerStatusService } from './provider-status-service';
import { alertingService } from './alerting-service';
import { costOptimizationService } from './cost-optimization-service';
import { abTestingService } from './ab-testing-service';
import { generateId } from '../../utils';

/**
 * Integration layer that connects analytics services to the AI service manager
 */
export class AnalyticsIntegration {
  private static instance: AnalyticsIntegration;
  private isInitialized = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): AnalyticsIntegration {
    if (!AnalyticsIntegration.instance) {
      AnalyticsIntegration.instance = new AnalyticsIntegration();
    }
    return AnalyticsIntegration.instance;
  }

  /**
   * Initialize the analytics integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('Initializing AI Analytics Integration...');

      // Initialize default alert rules
      await alertingService.initializeDefaultRules();

      // Initialize provider status for known providers
      const providers = ['openai', 'anthropic', 'google', 'azure', 'vercel'];
      for (const provider of providers) {
        await providerStatusService.initializeProvider(provider, {
          priority: this.getProviderPriority(provider),
          isEnabled: true,
        });
      }

      // Start monitoring
      this.startMonitoring();

      this.isInitialized = true;
      console.log('AI Analytics Integration initialized successfully');

    } catch (error) {
      console.error('Failed to initialize AI Analytics Integration:', error);
      throw error;
    }
  }

  /**
   * Record an AI request for analytics
   */
  async recordAIRequest(data: {
    requestId: string;
    organizationId: string;
    userId?: string;
    provider: string;
    model: string;
    operation: string;
    startTime: Date;
    endTime: Date;
    success: boolean;
    error?: string;
    tokensInput?: number;
    tokensOutput?: number;
    cost: number;
    routingDecision?: string;
    fallbackUsed?: boolean;
    fallbackReason?: string;
    responseQuality?: number;
    userFeedback?: any;
    metadata?: any;
  }): Promise<void> {
    try {
      const latency = data.endTime.getTime() - data.startTime.getTime();

      const metricData: AIMetricData = {
        requestId: data.requestId,
        provider: data.provider,
        model: data.model,
        operation: data.operation,
        latency,
        tokensInput: data.tokensInput,
        tokensOutput: data.tokensOutput,
        totalTokens: (data.tokensInput || 0) + (data.tokensOutput || 0),
        cost: data.cost,
        routingDecision: data.routingDecision,
        fallbackUsed: data.fallbackUsed,
        fallbackReason: data.fallbackReason,
        success: data.success,
        error: data.error,
        errorType: data.error ? this.categorizeError(data.error) : undefined,
        responseQuality: data.responseQuality,
        userFeedback: data.userFeedback,
        metadata: data.metadata,
        organizationId: data.organizationId,
        userId: data.userId,
      };

      // Record metrics
      await aiAnalyticsService.recordMetric(metricData);

      // Update provider status
      if (data.success) {
        await providerStatusService.recordProviderSuccess(data.provider, latency);
      } else {
        await providerStatusService.recordProviderFailure(data.provider, data.error || 'Unknown error');
      }

      // Check if this is part of an A/B test
      if (data.userId) {
        await this.handleABTestResult(data);
      }

    } catch (error) {
      console.error('Failed to record AI request:', error);
      // Don't throw - analytics failures shouldn't break the main flow
    }
  }

  /**
   * Get routing recommendation based on analytics
   */
  async getRoutingRecommendation(context: {
    organizationId: string;
    userId?: string;
    operation: string;
    priority: 'fast' | 'balanced' | 'powerful';
    budget?: number;
    qualityThreshold?: number;
  }): Promise<{
    provider: string;
    model: string;
    confidence: number;
    reasoningText: string;
    fallbackProviders: string[];
  }> {
    try {
      // Get provider status
      const healthyProviders = await providerStatusService.getHealthyProviders();

      if (healthyProviders.length === 0) {
        throw new Error('No healthy providers available');
      }

      // Get analytics data for decision making
      const analyticsQuery = {
        organizationId: context.organizationId,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        endDate: new Date(),
        operations: [context.operation],
      };

      const dashboardData = await aiAnalyticsService.getDashboardData(analyticsQuery);

      // Check for A/B test assignment
      if (context.userId) {
        const abTestAssignment = await this.checkABTestAssignment(context.userId, context.organizationId);
        if (abTestAssignment) {
          return {
            provider: abTestAssignment.provider,
            model: abTestAssignment.config.model || 'default',
            confidence: 0.8,
            reasoningText: `A/B test assignment: ${abTestAssignment.name}`,
            fallbackProviders: healthyProviders.slice(1, 3).map(p => p.provider),
          };
        }
      }

      // Apply routing logic based on priority
      const recommendation = this.calculateBestProvider(
        healthyProviders,
        dashboardData.providerMetrics,
        context.priority,
        context.budget,
        context.qualityThreshold
      );

      return recommendation;

    } catch (error) {
      console.error('Failed to get routing recommendation:', error);

      // Fallback to default routing
      return {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        confidence: 0.5,
        reasoningText: 'Fallback due to analytics error',
        fallbackProviders: ['anthropic', 'google'],
      };
    }
  }

  /**
   * Get real-time analytics summary
   */
  async getRealtimeAnalytics(organizationId: string): Promise<{
    totalRequests: number;
    avgLatency: number;
    successRate: number;
    totalCost: number;
    activeAlerts: number;
    healthScore: number;
    topProviders: Array<{
      provider: string;
      requests: number;
      latency: number;
      cost: number;
    }>;
  }> {
    try {
      const query = {
        organizationId,
        startDate: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        endDate: new Date(),
      };

      const [dashboardData, alertDashboard] = await Promise.all([
        aiAnalyticsService.getDashboardData(query),
        alertingService.getAlertDashboard(organizationId),
      ]);

      return {
        totalRequests: dashboardData.summary.totalRequests,
        avgLatency: dashboardData.summary.avgLatency,
        successRate: dashboardData.summary.overallSuccessRate,
        totalCost: dashboardData.summary.totalCost,
        activeAlerts: alertDashboard.summary.activeAlerts,
        healthScore: alertDashboard.healthScore,
        topProviders: dashboardData.providerMetrics.slice(0, 3).map(p => ({
          provider: p.provider,
          requests: p.totalRequests,
          latency: p.avgLatency,
          cost: p.totalCost,
        })),
      };

    } catch (error) {
      console.error('Failed to get realtime analytics:', error);

      return {
        totalRequests: 0,
        avgLatency: 0,
        successRate: 0,
        totalCost: 0,
        activeAlerts: 0,
        healthScore: 100,
        topProviders: [],
      };
    }
  }

  /**
   * Generate cost optimization recommendations
   */
  async generateCostOptimizations(organizationId: string): Promise<{
    totalSavings: number;
    recommendations: Array<{
      id: string;
      title: string;
      description: string;
      impact: string;
      savings: number;
      effort: string;
    }>;
  }> {
    try {
      const report = await costOptimizationService.generateRecommendations(organizationId);

      return {
        totalSavings: report.potentialSavings,
        recommendations: report.recommendations.slice(0, 5).map(rec => ({
          id: rec.id,
          title: rec.title,
          description: rec.description,
          impact: rec.impact,
          savings: rec.potentialSavings,
          effort: rec.implementationEffort,
        })),
      };

    } catch (error) {
      console.error('Failed to generate cost optimizations:', error);

      return {
        totalSavings: 0,
        recommendations: [],
      };
    }
  }

  /**
   * Start monitoring for alerts and performance issues
   */
  private startMonitoring(): void {
    // Run monitoring check every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      try {
        await alertingService.runMonitoringCheck();
      } catch (error) {
        console.error('Monitoring check failed:', error);
      }
    }, 5 * 60 * 1000);

    console.log('Started AI analytics monitoring');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Stopped AI analytics monitoring');
    }
  }

  /**
   * Private helper methods
   */
  private getProviderPriority(provider: string): number {
    const priorities = {
      'openai': 10,
      'anthropic': 9,
      'google': 8,
      'azure': 7,
      'vercel': 6,
    };
    return priorities[provider] || 5;
  }

  private categorizeError(error: string): string {
    if (error.includes('rate limit') || error.includes('quota')) {
      return 'rate_limit';
    }
    if (error.includes('timeout')) {
      return 'timeout';
    }
    if (error.includes('authentication') || error.includes('unauthorized')) {
      return 'auth_error';
    }
    if (error.includes('model') || error.includes('not found')) {
      return 'model_error';
    }
    return 'unknown_error';
  }

  private async handleABTestResult(data: any): Promise<void> {
    try {
      // Check if user is part of any active A/B tests
      const activeTests = await abTestingService.getActiveTests(data.userId, data.organizationId);

      for (const test of activeTests) {
        const variant = await abTestingService.assignVariant(test.id, data.userId, data.organizationId);

        if (variant && variant.provider === data.provider) {
          // Record A/B test result
          await abTestingService.recordResult({
            testId: test.id,
            variantId: variant.id,
            userId: data.userId,
            organizationId: data.organizationId,
            startTime: data.startTime,
            endTime: data.endTime,
            latency: data.endTime.getTime() - data.startTime.getTime(),
            tokensUsed: (data.tokensInput || 0) + (data.tokensOutput || 0),
            cost: data.cost,
            success: data.success,
            error: data.error,
            userFeedback: data.userFeedback,
          });
        }
      }
    } catch (error) {
      console.error('Failed to handle A/B test result:', error);
    }
  }

  private async checkABTestAssignment(userId: string, organizationId: string): Promise<any> {
    try {
      const activeTests = await abTestingService.getActiveTests(userId, organizationId);

      for (const test of activeTests) {
        const variant = await abTestingService.assignVariant(test.id, userId, organizationId);
        if (variant) {
          return variant;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to check A/B test assignment:', error);
      return null;
    }
  }

  private calculateBestProvider(
    healthyProviders: any[],
    providerMetrics: any[],
    priority: string,
    budget?: number,
    qualityThreshold?: number
  ): any {
    // Score providers based on priority
    const scoredProviders = healthyProviders.map(provider => {
      const metrics = providerMetrics.find(m => m.provider === provider.provider);

      if (!metrics) {
        return {
          provider: provider.provider,
          score: 0,
          confidence: 0.1,
        };
      }

      let score = 0;

      // Score based on priority
      switch (priority) {
        case 'fast':
          score = 1000 / (metrics.avgLatency + 100); // Prioritize low latency
          break;
        case 'balanced':
          score = (metrics.successRate / 100) * (1000 / (metrics.avgLatency + 100)) * (1 / (metrics.avgCost + 0.001));
          break;
        case 'powerful':
          score = (metrics.successRate / 100) * 100; // Prioritize reliability
          break;
      }

      // Apply budget constraint
      if (budget && metrics.avgCost > budget) {
        score *= 0.1;
      }

      // Apply quality threshold
      if (qualityThreshold && metrics.responseQuality && metrics.responseQuality < qualityThreshold) {
        score *= 0.2;
      }

      return {
        provider: provider.provider,
        score,
        confidence: Math.min(0.9, metrics.successRate / 100),
        metrics,
      };
    });

    // Sort by score
    scoredProviders.sort((a, b) => b.score - a.score);

    const best = scoredProviders[0];

    return {
      provider: best.provider,
      model: this.getDefaultModel(best.provider),
      confidence: best.confidence,
      reasoningText: `Selected based on ${priority} priority with score ${best.score.toFixed(2)}`,
      fallbackProviders: scoredProviders.slice(1, 3).map(p => p.provider),
    };
  }

  private getDefaultModel(provider: string): string {
    const models = {
      'openai': 'gpt-3.5-turbo',
      'anthropic': 'claude-3-haiku-20240307',
      'google': 'gemini-pro',
      'azure': 'gpt-35-turbo',
      'vercel': 'gpt-3.5-turbo',
    };
    return models[provider] || 'default';
  }
}

// Export singleton instance
export const analyticsIntegration = AnalyticsIntegration.getInstance();
