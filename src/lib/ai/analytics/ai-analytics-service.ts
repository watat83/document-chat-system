import { PrismaClient } from '@prisma/client';
import { cache } from 'react';
import { generateId } from '../../utils';

const prisma = new PrismaClient();

export interface AIMetricData {
  requestId: string;
  provider: string;
  model: string;
  operation: string;
  latency: number;
  tokensInput?: number;
  tokensOutput?: number;
  totalTokens?: number;
  cost: number;
  estimatedCost?: number;
  routingDecision?: string;
  routingReason?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  errorType?: string;
  responseQuality?: number;
  userFeedback?: any;
  metadata?: any;
  organizationId: string;
  userId?: string;
}

export interface AnalyticsQuery {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
  providers?: string[];
  models?: string[];
  operations?: string[];
  onlySuccessful?: boolean;
  limit?: number;
  offset?: number;
}

export interface ProviderPerformanceMetrics {
  provider: string;
  totalRequests: number;
  successRate: number;
  avgLatency: number;
  p95Latency: number;
  totalCost: number;
  avgCost: number;
  totalTokens: number;
  avgTokens: number;
  errorRate: number;
  topErrors: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
}

export interface CostAnalysis {
  totalCost: number;
  projectedMonthlyCost: number;
  costByProvider: Array<{
    provider: string;
    cost: number;
    percentage: number;
  }>;
  costByModel: Array<{
    model: string;
    cost: number;
    percentage: number;
  }>;
  costByOperation: Array<{
    operation: string;
    cost: number;
    percentage: number;
  }>;
  costTrend: Array<{
    date: string;
    cost: number;
  }>;
  optimizationOpportunities: Array<{
    type: string;
    description: string;
    potentialSavings: number;
    impact: 'low' | 'medium' | 'high';
  }>;
}

export interface RoutingAnalysis {
  routingDecisions: Array<{
    decision: string;
    count: number;
    percentage: number;
    avgLatency: number;
    avgCost: number;
    successRate: number;
  }>;
  fallbackRate: number;
  fallbackReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  routingEfficiency: number; // How well routing decisions minimize cost while maintaining quality
  recommendations: Array<{
    type: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
  }>;
}

export interface UsagePattern {
  hourlyUsage: Array<{
    hour: number;
    requests: number;
    cost: number;
  }>;
  dailyUsage: Array<{
    date: string;
    requests: number;
    cost: number;
  }>;
  weeklyUsage: Array<{
    week: string;
    requests: number;
    cost: number;
  }>;
  peakUsageHours: number[];
  growthRate: number; // Monthly growth rate percentage
}

export interface QualityMetrics {
  avgQualityScore: number;
  qualityByProvider: Array<{
    provider: string;
    avgQuality: number;
    sampleSize: number;
  }>;
  qualityByModel: Array<{
    model: string;
    avgQuality: number;
    sampleSize: number;
  }>;
  userFeedbackSummary: {
    totalFeedback: number;
    avgRating: number;
    sentimentDistribution: {
      positive: number;
      neutral: number;
      negative: number;
    };
  };
}

export class AIAnalyticsService {
  /**
   * Record a single AI metric
   */
  async recordMetric(data: AIMetricData): Promise<void> {
    try {
      await prisma.aIMetric.create({
        data: {
          requestId: data.requestId,
          provider: data.provider,
          model: data.model,
          operation: data.operation,
          latency: data.latency,
          tokensInput: data.tokensInput,
          tokensOutput: data.tokensOutput,
          totalTokens: data.totalTokens,
          cost: data.cost,
          estimatedCost: data.estimatedCost,
          routingDecision: data.routingDecision,
          routingReason: data.routingReason,
          fallbackUsed: data.fallbackUsed || false,
          fallbackReason: data.fallbackReason,
          success: data.success,
          statusCode: data.statusCode,
          error: data.error,
          errorType: data.errorType,
          responseQuality: data.responseQuality,
          userFeedback: data.userFeedback,
          metadata: data.metadata,
          organizationId: data.organizationId,
          userId: data.userId,
        },
      });
    } catch (error) {
      console.error('Failed to record AI metric:', error);
      // Don't throw - metrics collection shouldn't break the main flow
    }
  }

  /**
   * Record multiple AI metrics in batch
   */
  async recordMetrics(metrics: AIMetricData[]): Promise<void> {
    try {
      await prisma.aIMetric.createMany({
        data: metrics.map(data => ({
          requestId: data.requestId,
          provider: data.provider,
          model: data.model,
          operation: data.operation,
          latency: data.latency,
          tokensInput: data.tokensInput,
          tokensOutput: data.tokensOutput,
          totalTokens: data.totalTokens,
          cost: data.cost,
          estimatedCost: data.estimatedCost,
          routingDecision: data.routingDecision,
          routingReason: data.routingReason,
          fallbackUsed: data.fallbackUsed || false,
          fallbackReason: data.fallbackReason,
          success: data.success,
          statusCode: data.statusCode,
          error: data.error,
          errorType: data.errorType,
          responseQuality: data.responseQuality,
          userFeedback: data.userFeedback,
          metadata: data.metadata,
          organizationId: data.organizationId,
          userId: data.userId,
        })),
      });
    } catch (error) {
      console.error('Failed to record AI metrics batch:', error);
    }
  }

  /**
   * Get provider performance metrics
   */
  async getProviderPerformanceMetrics(query: AnalyticsQuery): Promise<ProviderPerformanceMetrics[]> {
    const whereClause = this.buildWhereClause(query);

    const metrics = await prisma.aIMetric.groupBy({
      by: ['provider'],
      where: whereClause,
      _count: {
        id: true,
      },
      _avg: {
        latency: true,
        cost: true,
        totalTokens: true,
      },
      _sum: {
        cost: true,
        totalTokens: true,
      },
    });

    const result: ProviderPerformanceMetrics[] = [];

    for (const metric of metrics) {
      // Calculate success rate
      const successCount = await prisma.aIMetric.count({
        where: {
          ...whereClause,
          provider: metric.provider,
          success: true,
        },
      });

      // Calculate P95 latency
      const latencyData = await prisma.aIMetric.findMany({
        where: {
          ...whereClause,
          provider: metric.provider,
        },
        select: {
          latency: true,
        },
        orderBy: {
          latency: 'asc',
        },
      });

      const p95Index = Math.floor(latencyData.length * 0.95);
      const p95Latency = latencyData[p95Index]?.latency || 0;

      // Get top errors
      const errorCounts = await prisma.aIMetric.groupBy({
        by: ['error'],
        where: {
          ...whereClause,
          provider: metric.provider,
          success: false,
          error: { not: null },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 5,
      });

      const topErrors = errorCounts.map(error => ({
        error: error.error || 'Unknown error',
        count: error._count.id,
        percentage: (error._count.id / metric._count.id) * 100,
      }));

      result.push({
        provider: metric.provider,
        totalRequests: metric._count.id,
        successRate: (successCount / metric._count.id) * 100,
        avgLatency: metric._avg.latency || 0,
        p95Latency,
        totalCost: metric._sum.cost || 0,
        avgCost: metric._avg.cost || 0,
        totalTokens: metric._sum.totalTokens || 0,
        avgTokens: metric._avg.totalTokens || 0,
        errorRate: ((metric._count.id - successCount) / metric._count.id) * 100,
        topErrors,
      });
    }

    return result;
  }

  /**
   * Get cost analysis
   */
  async getCostAnalysis(query: AnalyticsQuery): Promise<CostAnalysis> {
    const whereClause = this.buildWhereClause(query);

    // Total cost
    const totalCostResult = await prisma.aIMetric.aggregate({
      where: whereClause,
      _sum: {
        cost: true,
      },
    });

    const totalCost = totalCostResult._sum.cost || 0;

    // Project monthly cost based on current usage
    const daysDiff = query.endDate && query.startDate
      ? Math.ceil((query.endDate.getTime() - query.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : 30;
    const projectedMonthlyCost = (totalCost / daysDiff) * 30;

    // Cost by provider
    const providerCosts = await prisma.aIMetric.groupBy({
      by: ['provider'],
      where: whereClause,
      _sum: {
        cost: true,
      },
      orderBy: {
        _sum: {
          cost: 'desc',
        },
      },
    });

    const costByProvider = providerCosts.map(item => ({
      provider: item.provider,
      cost: item._sum.cost || 0,
      percentage: ((item._sum.cost || 0) / totalCost) * 100,
    }));

    // Cost by model
    const modelCosts = await prisma.aIMetric.groupBy({
      by: ['model'],
      where: whereClause,
      _sum: {
        cost: true,
      },
      orderBy: {
        _sum: {
          cost: 'desc',
        },
      },
      take: 10,
    });

    const costByModel = modelCosts.map(item => ({
      model: item.model,
      cost: item._sum.cost || 0,
      percentage: ((item._sum.cost || 0) / totalCost) * 100,
    }));

    // Cost by operation
    const operationCosts = await prisma.aIMetric.groupBy({
      by: ['operation'],
      where: whereClause,
      _sum: {
        cost: true,
      },
      orderBy: {
        _sum: {
          cost: 'desc',
        },
      },
    });

    const costByOperation = operationCosts.map(item => ({
      operation: item.operation,
      cost: item._sum.cost || 0,
      percentage: ((item._sum.cost || 0) / totalCost) * 100,
    }));

    // Cost trend (daily)
    const costTrendData = await prisma.$queryRaw<Array<{date: string, cost: number}>>`
      SELECT
        DATE(created_at) as date,
        SUM(cost) as cost
      FROM ai_metrics
      WHERE organization_id = ${query.organizationId}
        AND created_at >= ${query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        AND created_at <= ${query.endDate || new Date()}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `;

    const costTrend = costTrendData.map(item => ({
      date: item.date,
      cost: Number(item.cost),
    }));

    // Optimization opportunities
    const optimizationOpportunities = await this.generateOptimizationOpportunities(query);

    return {
      totalCost,
      projectedMonthlyCost,
      costByProvider,
      costByModel,
      costByOperation,
      costTrend,
      optimizationOpportunities,
    };
  }

  /**
   * Get routing analysis
   */
  async getRoutingAnalysis(query: AnalyticsQuery): Promise<RoutingAnalysis> {
    const whereClause = this.buildWhereClause(query);

    // Routing decisions
    const routingData = await prisma.aIMetric.groupBy({
      by: ['routingDecision'],
      where: {
        ...whereClause,
        routingDecision: { not: null },
      },
      _count: {
        id: true,
      },
      _avg: {
        latency: true,
        cost: true,
      },
    });

    const totalRoutingDecisions = routingData.reduce((sum, item) => sum + item._count.id, 0);

    const routingDecisions = await Promise.all(
      routingData.map(async (item) => {
        const successCount = await prisma.aIMetric.count({
          where: {
            ...whereClause,
            routingDecision: item.routingDecision,
            success: true,
          },
        });

        return {
          decision: item.routingDecision || 'unknown',
          count: item._count.id,
          percentage: (item._count.id / totalRoutingDecisions) * 100,
          avgLatency: item._avg.latency || 0,
          avgCost: item._avg.cost || 0,
          successRate: (successCount / item._count.id) * 100,
        };
      })
    );

    // Fallback analysis
    const fallbackCount = await prisma.aIMetric.count({
      where: {
        ...whereClause,
        fallbackUsed: true,
      },
    });

    const totalRequests = await prisma.aIMetric.count({
      where: whereClause,
    });

    const fallbackRate = (fallbackCount / totalRequests) * 100;

    // Fallback reasons
    const fallbackReasonData = await prisma.aIMetric.groupBy({
      by: ['fallbackReason'],
      where: {
        ...whereClause,
        fallbackUsed: true,
        fallbackReason: { not: null },
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    const fallbackReasons = fallbackReasonData.map(item => ({
      reason: item.fallbackReason || 'unknown',
      count: item._count.id,
      percentage: (item._count.id / fallbackCount) * 100,
    }));

    // Calculate routing efficiency (cost-weighted success rate)
    const routingEfficiency = await this.calculateRoutingEfficiency(query);

    // Generate recommendations
    const recommendations = await this.generateRoutingRecommendations(query);

    return {
      routingDecisions,
      fallbackRate,
      fallbackReasons,
      routingEfficiency,
      recommendations,
    };
  }

  /**
   * Get usage patterns
   */
  async getUsagePatterns(query: AnalyticsQuery): Promise<UsagePattern> {
    const whereClause = this.buildWhereClause(query);

    // Hourly usage
    const hourlyData = await prisma.$queryRaw<Array<{hour: number, requests: number, cost: number}>>`
      SELECT
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as requests,
        SUM(cost) as cost
      FROM ai_metrics
      WHERE organization_id = ${query.organizationId}
        AND created_at >= ${query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        AND created_at <= ${query.endDate || new Date()}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `;

    const hourlyUsage = hourlyData.map(item => ({
      hour: Number(item.hour),
      requests: Number(item.requests),
      cost: Number(item.cost),
    }));

    // Daily usage
    const dailyData = await prisma.$queryRaw<Array<{date: string, requests: number, cost: number}>>`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as requests,
        SUM(cost) as cost
      FROM ai_metrics
      WHERE organization_id = ${query.organizationId}
        AND created_at >= ${query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        AND created_at <= ${query.endDate || new Date()}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `;

    const dailyUsage = dailyData.map(item => ({
      date: item.date,
      requests: Number(item.requests),
      cost: Number(item.cost),
    }));

    // Weekly usage
    const weeklyData = await prisma.$queryRaw<Array<{week: string, requests: number, cost: number}>>`
      SELECT
        DATE_TRUNC('week', created_at) as week,
        COUNT(*) as requests,
        SUM(cost) as cost
      FROM ai_metrics
      WHERE organization_id = ${query.organizationId}
        AND created_at >= ${query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        AND created_at <= ${query.endDate || new Date()}
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week
    `;

    const weeklyUsage = weeklyData.map(item => ({
      week: item.week,
      requests: Number(item.requests),
      cost: Number(item.cost),
    }));

    // Peak usage hours
    const peakUsageHours = hourlyUsage
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 3)
      .map(item => item.hour);

    // Calculate growth rate
    const growthRate = await this.calculateGrowthRate(query);

    return {
      hourlyUsage,
      dailyUsage,
      weeklyUsage,
      peakUsageHours,
      growthRate,
    };
  }

  /**
   * Get quality metrics
   */
  async getQualityMetrics(query: AnalyticsQuery): Promise<QualityMetrics> {
    const whereClause = this.buildWhereClause(query);

    // Average quality score
    const avgQualityResult = await prisma.aIMetric.aggregate({
      where: {
        ...whereClause,
        responseQuality: { not: null },
      },
      _avg: {
        responseQuality: true,
      },
    });

    const avgQualityScore = avgQualityResult._avg.responseQuality || 0;

    // Quality by provider
    const providerQuality = await prisma.aIMetric.groupBy({
      by: ['provider'],
      where: {
        ...whereClause,
        responseQuality: { not: null },
      },
      _avg: {
        responseQuality: true,
      },
      _count: {
        id: true,
      },
    });

    const qualityByProvider = providerQuality.map(item => ({
      provider: item.provider,
      avgQuality: item._avg.responseQuality || 0,
      sampleSize: item._count.id,
    }));

    // Quality by model
    const modelQuality = await prisma.aIMetric.groupBy({
      by: ['model'],
      where: {
        ...whereClause,
        responseQuality: { not: null },
      },
      _avg: {
        responseQuality: true,
      },
      _count: {
        id: true,
      },
    });

    const qualityByModel = modelQuality.map(item => ({
      model: item.model,
      avgQuality: item._avg.responseQuality || 0,
      sampleSize: item._count.id,
    }));

    // User feedback summary
    const feedbackData = await prisma.aIMetric.findMany({
      where: {
        ...whereClause,
        userFeedback: { not: null },
      },
      select: {
        userFeedback: true,
      },
    });

    const userFeedbackSummary = this.analyzeFeedback(feedbackData.map(item => item.userFeedback));

    return {
      avgQualityScore,
      qualityByProvider,
      qualityByModel,
      userFeedbackSummary,
    };
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardData(query: AnalyticsQuery) {
    const [
      providerMetrics,
      costAnalysis,
      routingAnalysis,
      usagePatterns,
      qualityMetrics,
    ] = await Promise.all([
      this.getProviderPerformanceMetrics(query),
      this.getCostAnalysis(query),
      this.getRoutingAnalysis(query),
      this.getUsagePatterns(query),
      this.getQualityMetrics(query),
    ]);

    // Calculate key performance indicators
    const totalRequests = providerMetrics.reduce((sum, provider) => sum + provider.totalRequests, 0);
    const totalCost = costAnalysis.totalCost;
    const avgLatency = providerMetrics.reduce((sum, provider) => sum + (provider.avgLatency * provider.totalRequests), 0) / totalRequests;
    const overallSuccessRate = providerMetrics.reduce((sum, provider) => sum + (provider.successRate * provider.totalRequests), 0) / totalRequests;

    return {
      summary: {
        totalRequests,
        totalCost,
        avgLatency,
        overallSuccessRate,
        fallbackRate: routingAnalysis.fallbackRate,
        avgQualityScore: qualityMetrics.avgQualityScore,
      },
      providerMetrics,
      costAnalysis,
      routingAnalysis,
      usagePatterns,
      qualityMetrics,
    };
  }

  /**
   * Helper methods
   */
  private buildWhereClause(query: AnalyticsQuery) {
    const where: any = {
      organizationId: query.organizationId,
    };

    if (query.startDate) {
      where.createdAt = { gte: query.startDate };
    }

    if (query.endDate) {
      where.createdAt = { ...where.createdAt, lte: query.endDate };
    }

    if (query.providers && query.providers.length > 0) {
      where.provider = { in: query.providers };
    }

    if (query.models && query.models.length > 0) {
      where.model = { in: query.models };
    }

    if (query.operations && query.operations.length > 0) {
      where.operation = { in: query.operations };
    }

    if (query.onlySuccessful) {
      where.success = true;
    }

    return where;
  }

  private async generateOptimizationOpportunities(query: AnalyticsQuery) {
    const opportunities = [];

    // Check for expensive models with low quality
    const expensiveModels = await prisma.aIMetric.groupBy({
      by: ['model'],
      where: this.buildWhereClause(query),
      _avg: {
        cost: true,
        responseQuality: true,
      },
      _count: {
        id: true,
      },
      having: {
        _count: {
          id: {
            gt: 10,
          },
        },
      },
    });

    for (const model of expensiveModels) {
      if ((model._avg.cost || 0) > 0.01 && (model._avg.responseQuality || 0) < 0.7) {
        opportunities.push({
          type: 'model_optimization',
          description: `Consider switching from ${model.model} to a more cost-effective model with similar quality`,
          potentialSavings: (model._avg.cost || 0) * model._count.id * 0.3,
          impact: 'medium' as const,
        });
      }
    }

    // Check for high fallback rates
    const fallbackRate = await this.calculateFallbackRate(query);
    if (fallbackRate > 10) {
      opportunities.push({
        type: 'fallback_optimization',
        description: 'High fallback rate detected. Consider optimizing provider selection logic',
        potentialSavings: 0,
        impact: 'high' as const,
      });
    }

    return opportunities;
  }

  private async calculateRoutingEfficiency(query: AnalyticsQuery): Promise<number> {
    // Calculate how well routing decisions balance cost and quality
    const routingData = await prisma.aIMetric.findMany({
      where: {
        ...this.buildWhereClause(query),
        routingDecision: { not: null },
      },
      select: {
        routingDecision: true,
        cost: true,
        responseQuality: true,
        success: true,
      },
    });

    if (routingData.length === 0) return 0;

    let totalScore = 0;
    for (const item of routingData) {
      const costScore = Math.max(0, 1 - (item.cost / 0.1)); // Normalize cost to 0-1 scale
      const qualityScore = item.responseQuality || 0.5;
      const successScore = item.success ? 1 : 0;

      totalScore += (costScore * 0.3 + qualityScore * 0.5 + successScore * 0.2);
    }

    return (totalScore / routingData.length) * 100;
  }

  private async generateRoutingRecommendations(query: AnalyticsQuery) {
    const recommendations = [];

    // Analyze routing patterns
    const routingData = await prisma.aIMetric.groupBy({
      by: ['routingDecision'],
      where: {
        ...this.buildWhereClause(query),
        routingDecision: { not: null },
      },
      _avg: {
        cost: true,
        latency: true,
      },
      _count: {
        id: true,
      },
    });

    // Check if too many requests are going to expensive tiers
    const expensiveRequests = routingData.filter(item => item.routingDecision === 'powerful');
    const totalRequests = routingData.reduce((sum, item) => sum + item._count.id, 0);

    if (expensiveRequests.length > 0 && (expensiveRequests[0]._count.id / totalRequests) > 0.4) {
      recommendations.push({
        type: 'routing_optimization',
        description: 'Consider routing more requests to balanced tier to reduce costs',
        impact: 'medium' as const,
      });
    }

    return recommendations;
  }

  private async calculateFallbackRate(query: AnalyticsQuery): Promise<number> {
    const fallbackCount = await prisma.aIMetric.count({
      where: {
        ...this.buildWhereClause(query),
        fallbackUsed: true,
      },
    });

    const totalCount = await prisma.aIMetric.count({
      where: this.buildWhereClause(query),
    });

    return totalCount > 0 ? (fallbackCount / totalCount) * 100 : 0;
  }

  private async calculateGrowthRate(query: AnalyticsQuery): Promise<number> {
    // Calculate monthly growth rate based on usage trends
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const currentMonthRequests = await prisma.aIMetric.count({
      where: {
        organizationId: query.organizationId,
        createdAt: {
          gte: lastMonth,
          lt: now,
        },
      },
    });

    const previousMonthRequests = await prisma.aIMetric.count({
      where: {
        organizationId: query.organizationId,
        createdAt: {
          gte: twoMonthsAgo,
          lt: lastMonth,
        },
      },
    });

    if (previousMonthRequests === 0) return 0;

    return ((currentMonthRequests - previousMonthRequests) / previousMonthRequests) * 100;
  }

  private analyzeFeedback(feedbackData: any[]) {
    const validFeedback = feedbackData.filter(item => item && typeof item === 'object');

    if (validFeedback.length === 0) {
      return {
        totalFeedback: 0,
        avgRating: 0,
        sentimentDistribution: {
          positive: 0,
          neutral: 0,
          negative: 0,
        },
      };
    }

    const ratings = validFeedback.map(item => item.rating || 0).filter(rating => rating > 0);
    const avgRating = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;

    // Simple sentiment analysis based on rating
    const positive = ratings.filter(rating => rating >= 4).length;
    const neutral = ratings.filter(rating => rating === 3).length;
    const negative = ratings.filter(rating => rating <= 2).length;

    return {
      totalFeedback: validFeedback.length,
      avgRating,
      sentimentDistribution: {
        positive: ratings.length > 0 ? (positive / ratings.length) * 100 : 0,
        neutral: ratings.length > 0 ? (neutral / ratings.length) * 100 : 0,
        negative: ratings.length > 0 ? (negative / ratings.length) * 100 : 0,
      },
    };
  }
}

// Create a cached instance
export const aiAnalyticsService = new AIAnalyticsService();

// Cache the dashboard data for performance
export const getCachedDashboardData = cache(async (query: AnalyticsQuery) => {
  return aiAnalyticsService.getDashboardData(query);
});
