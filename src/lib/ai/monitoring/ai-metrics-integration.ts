import { randomUUID } from 'node:crypto';
import { AIMetrics } from '../ai-service-manager';
import { TaskType } from '../interfaces/types';

export interface AIUsageMetrics {
  organizationId: string;
  userId?: string;
  provider: string;
  model: string;
  operation: 'completion' | 'embedding' | 'stream' | 'media_generation' | 'image_generation' | 'video_generation' | 'image_edit' | 'document_processing';
  taskType: TaskType;
  tokensUsed: number;
  cost: number;
  latency: number;
  success: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
  // Media-specific fields
  mediaType?: 'image' | 'video' | 'edit';
  mediaCount?: number;
  quality?: string;
  cacheHit?: boolean;
  // Document-specific fields
  documentType?: string;
  documentSize?: number;
  extractionType?: 'summary' | 'extraction' | 'analysis' | 'qa';
  engineUsed?: string;
}

export interface AIProviderMetrics {
  provider: string;
  requestCount: number;
  successRate: number;
  averageLatency: number;
  totalCost: number;
  errorCount: number;
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

export interface AISystemHealth {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  activeProviders: number;
  totalProviders: number;
  averageResponseTime: number;
  successRate: number;
  costEfficiency: number;
  recommendations: string[];
}

export class AIMetricsIntegration {
  private metrics: AIUsageMetrics[] = [];
  private readonly MAX_STORED_METRICS = 10000;

  constructor() {
    // Using static methods from UsageTrackingService
  }

  /** Analytics persist metrics without modifying the billing usage ledger. */
  private async persistMetric(metric: AIUsageMetrics): Promise<void> {
    const { db } = await import('@/lib/db');
    const requestId = typeof metric.metadata?.requestId === 'string' ? metric.metadata.requestId : randomUUID();
    const data = {
      requestId, organizationId: metric.organizationId, userId: metric.userId,
      provider: metric.provider, model: metric.model, operation: metric.operation,
      latency: Math.max(0, Math.round(metric.latency)), totalTokens: metric.tokensUsed,
      cost: metric.cost, success: metric.success,
      metadata: JSON.parse(JSON.stringify(metric.metadata ?? {})),
    };
    await db.aIMetric.upsert({ where: { requestId }, create: data, update: {} });
  }

  async recordAIUsage(
    organizationId: string,
    userId: string | undefined,
    metrics: AIMetrics
  ): Promise<void> {
    try {


      // Store in local metrics for analytics
      const aiMetric: AIUsageMetrics = {
        organizationId,
        userId,
        provider: metrics.provider,
        model: metrics.model,
        operation: metrics.operation,
        taskType: metrics.metadata.taskType as TaskType,
        tokensUsed: metrics.tokenCount.total,
        cost: metrics.cost,
        latency: metrics.latency,
        success: metrics.success,
        timestamp: new Date(),
        metadata: metrics.metadata
      };

      this.metrics.push(aiMetric);
      await this.persistMetric(aiMetric);

      // Keep only recent metrics to prevent memory leaks
      if (this.metrics.length > this.MAX_STORED_METRICS) {
        this.metrics = this.metrics.slice(-this.MAX_STORED_METRICS);
      }

    } catch (error) {
      console.error('Failed to record AI usage metrics:', error);
    }
  }

  /**
   * Record media generation metrics (ImageRouter specific)
   */
  async recordMediaGenerationUsage(
    organizationId: string,
    userId: string | undefined,
    provider: string,
    model: string,
    operation: 'image_generation' | 'video_generation' | 'image_edit',
    mediaType: 'image' | 'video' | 'edit',
    cost: number,
    latency: number,
    success: boolean,
    metadata: {
      mediaCount?: number;
      quality?: string;
      cacheHit?: boolean;
      optimizations?: string[];
      error?: string;
      taskType?: TaskType;
    } = {}
  ): Promise<void> {
    try {


      // Store in local metrics for analytics (performance layer)
      const aiMetric: AIUsageMetrics = {
        organizationId,
        userId,
        provider,
        model,
        operation,
        taskType: metadata.taskType || 'media_generation',
        tokensUsed: 0, // Media generation doesn't use tokens, use media count instead
        cost,
        latency,
        success,
        timestamp: new Date(),
        mediaType,
        mediaCount: metadata.mediaCount || 1,
        quality: metadata.quality,
        cacheHit: metadata.cacheHit || false,
        metadata: {
          optimizations: metadata.optimizations,
          error: metadata.error,
          ...metadata
        }
      };

      this.metrics.push(aiMetric);
      await this.persistMetric(aiMetric);

      // Keep only recent metrics to prevent memory leaks
      if (this.metrics.length > this.MAX_STORED_METRICS) {
        this.metrics = this.metrics.slice(-this.MAX_STORED_METRICS);
      }

    } catch (error) {
      console.error('Failed to record media generation metrics:', error);
    }
  }

  /**
   * Record document processing metrics (OpenRouter document processing specific)
   */
  async recordDocumentProcessing(
    organizationId: string,
    userId: string | undefined,
    provider: string,
    model: string,
    operation: 'document_processing',
    extractionType: 'summary' | 'extraction' | 'analysis' | 'qa',
    cost: number,
    latency: number,
    success: boolean,
    metadata: {
      documentType?: string;
      documentSize?: number;
      engineUsed?: string;
      tokensUsed?: number;
      error?: string;
      taskType?: TaskType;
      requestId?: string;
      extractedDataLength?: number;
      cacheHit?: boolean;
    } = {}
  ): Promise<void> {
    try {


      // Store in local metrics for analytics (performance layer)
      const aiMetric: AIUsageMetrics = {
        organizationId,
        userId,
        provider,
        model,
        operation,
        taskType: metadata.taskType || 'document_processing',
        tokensUsed: metadata.tokensUsed || 0,
        cost,
        latency,
        success,
        timestamp: new Date(),
        documentType: metadata.documentType,
        documentSize: metadata.documentSize,
        extractionType,
        engineUsed: metadata.engineUsed,
        cacheHit: metadata.cacheHit || false,
        metadata: {
          requestId: metadata.requestId,
          extractedDataLength: metadata.extractedDataLength,
          error: metadata.error,
          ...metadata
        }
      };

      this.metrics.push(aiMetric);
      await this.persistMetric(aiMetric);

      // Keep only recent metrics to prevent memory leaks
      if (this.metrics.length > this.MAX_STORED_METRICS) {
        this.metrics = this.metrics.slice(-this.MAX_STORED_METRICS);
      }

    } catch (error) {
      console.error('Failed to record document processing metrics:', error);
    }
  }

  getProviderMetrics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): AIProviderMetrics[] {
    let filteredMetrics = this.metrics;

    if (organizationId) {
      filteredMetrics = filteredMetrics.filter(m => m.organizationId === organizationId);
    }

    if (timeRange) {
      filteredMetrics = filteredMetrics.filter(m =>
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const providerStats = new Map<string, {
      requests: number;
      successes: number;
      totalLatency: number;
      totalCost: number;
      errors: number;
      lastError?: { message: string; timestamp: Date };
    }>();

    filteredMetrics.forEach(metric => {
      const stats = providerStats.get(metric.provider) || {
        requests: 0,
        successes: 0,
        totalLatency: 0,
        totalCost: 0,
        errors: 0
      };

      stats.requests++;
      stats.totalLatency += metric.latency;
      stats.totalCost += metric.cost;

      if (metric.success) {
        stats.successes++;
      } else {
        stats.errors++;
        if (metric.metadata?.error) {
          stats.lastError = {
            message: metric.metadata.error,
            timestamp: metric.timestamp
          };
        }
      }

      providerStats.set(metric.provider, stats);
    });

    return Array.from(providerStats.entries()).map(([provider, stats]) => ({
      provider,
      requestCount: stats.requests,
      successRate: stats.requests > 0 ? stats.successes / stats.requests : 0,
      averageLatency: stats.requests > 0 ? stats.totalLatency / stats.requests : 0,
      totalCost: stats.totalCost,
      errorCount: stats.errors,
      lastError: stats.lastError
    }));
  }

  getSystemHealth(): AISystemHealth {
    const recentMetrics = this.metrics.filter(m =>
      Date.now() - m.timestamp.getTime() < 60000 * 60 // Last hour
    );

    if (recentMetrics.length === 0) {
      return {
        overallHealth: 'critical',
        activeProviders: 0,
        totalProviders: 0,
        averageResponseTime: 0,
        successRate: 0,
        costEfficiency: 0,
        recommendations: ['No recent AI activity detected']
      };
    }

    const providers = new Set(recentMetrics.map(m => m.provider));
    const successCount = recentMetrics.filter(m => m.success).length;
    const totalLatency = recentMetrics.reduce((sum, m) => sum + m.latency, 0);
    const averageLatency = totalLatency / recentMetrics.length;
    const successRate = successCount / recentMetrics.length;
    const totalCost = recentMetrics.reduce((sum, m) => sum + m.cost, 0);
    const totalTokens = recentMetrics.reduce((sum, m) => sum + m.tokensUsed, 0);
    const costEfficiency = totalTokens > 0 ? totalTokens / totalCost : 0;

    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const recommendations: string[] = [];

    if (successRate < 0.8) {
      overallHealth = 'critical';
      recommendations.push('High error rate detected. Check provider configurations.');
    } else if (successRate < 0.95) {
      overallHealth = 'degraded';
      recommendations.push('Elevated error rate. Monitor provider health.');
    }

    if (averageLatency > 10000) {
      overallHealth = 'degraded';
      recommendations.push('High latency detected. Consider optimizing requests.');
    }

    if (providers.size < 2) {
      recommendations.push('Consider enabling additional AI providers for redundancy.');
    }

    if (costEfficiency < 100) {
      recommendations.push('Low cost efficiency. Review model selection strategy.');
    }

    return {
      overallHealth,
      activeProviders: providers.size,
      totalProviders: providers.size, // Would need to be set from configuration
      averageResponseTime: averageLatency,
      successRate,
      costEfficiency,
      recommendations
    };
  }

  getCostAnalytics(
    organizationId?: string,
    period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): {
    totalCost: number;
    costByProvider: Record<string, number>;
    costByModel: Record<string, number>;
    costByTask: Record<string, number>;
    trend: { timestamp: Date; cost: number }[];
  } {
    let filteredMetrics = this.metrics;

    if (organizationId) {
      filteredMetrics = filteredMetrics.filter(m => m.organizationId === organizationId);
    }

    // Filter by time period
    const now = new Date();
    const periodStart = new Date();
    switch (period) {
      case 'hour':
        periodStart.setHours(now.getHours() - 1);
        break;
      case 'day':
        periodStart.setDate(now.getDate() - 1);
        break;
      case 'week':
        periodStart.setDate(now.getDate() - 7);
        break;
      case 'month':
        periodStart.setMonth(now.getMonth() - 1);
        break;
    }

    filteredMetrics = filteredMetrics.filter(m => m.timestamp >= periodStart);

    const totalCost = filteredMetrics.reduce((sum, m) => sum + m.cost, 0);

    const costByProvider: Record<string, number> = {};
    const costByModel: Record<string, number> = {};
    const costByTask: Record<string, number> = {};

    filteredMetrics.forEach(metric => {
      costByProvider[metric.provider] = (costByProvider[metric.provider] || 0) + metric.cost;
      costByModel[metric.model] = (costByModel[metric.model] || 0) + metric.cost;
      costByTask[metric.taskType] = (costByTask[metric.taskType] || 0) + metric.cost;
    });

    // Create trend data (simplified hourly buckets)
    const trendBuckets = new Map<string, number>();
    filteredMetrics.forEach(metric => {
      const hour = new Date(metric.timestamp);
      hour.setMinutes(0, 0, 0); // Round to hour
      const key = hour.toISOString();
      trendBuckets.set(key, (trendBuckets.get(key) || 0) + metric.cost);
    });

    const trend = Array.from(trendBuckets.entries())
      .map(([timestamp, cost]) => ({ timestamp: new Date(timestamp), cost }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      totalCost,
      costByProvider,
      costByModel,
      costByTask,
      trend
    };
  }

  async getUsageReport(organizationId: string, period: 'day' | 'week' | 'month' = 'month'): Promise<{
    summary: {
      totalRequests: number;
      totalCost: number;
      averageLatency: number;
      successRate: number;
    };
    breakdown: {
      byProvider: Record<string, { requests: number; cost: number }>;
      byTask: Record<string, { requests: number; cost: number }>;
      byUser: Record<string, { requests: number; cost: number }>;
    };
    trends: {
      daily: Array<{ date: string; requests: number; cost: number }>;
    };
  }> {
    try {
      // Filter metrics by organization and time period
      const now = new Date();
      const startDate = new Date();

      switch (period) {
        case 'day':
          startDate.setDate(now.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
      }

      const filteredMetrics = this.metrics.filter(m =>
        m.organizationId === organizationId &&
        m.timestamp >= startDate &&
        m.timestamp <= now
      );

      // Calculate summary
      const totalRequests = filteredMetrics.length;
      const totalCost = filteredMetrics.reduce((sum, m) => sum + m.cost, 0);
      const totalLatency = filteredMetrics.reduce((sum, m) => sum + m.latency, 0);
      const successCount = filteredMetrics.filter(m => m.success).length;

      const summary = {
        totalRequests,
        totalCost,
        averageLatency: totalRequests > 0 ? totalLatency / totalRequests : 0,
        successRate: totalRequests > 0 ? successCount / totalRequests : 0
      };

      // Create breakdowns
      const breakdown = {
        byProvider: {} as Record<string, { requests: number; cost: number }>,
        byTask: {} as Record<string, { requests: number; cost: number }>,
        byUser: {} as Record<string, { requests: number; cost: number }>
      };

      filteredMetrics.forEach(metric => {
        const provider = metric.provider;
        const taskType = metric.taskType;
        const userId = metric.userId || 'unknown';
        const cost = metric.cost;

        // By provider
        if (!breakdown.byProvider[provider]) {
          breakdown.byProvider[provider] = { requests: 0, cost: 0 };
        }
        breakdown.byProvider[provider].requests += 1;
        breakdown.byProvider[provider].cost += cost;

        // By task
        if (!breakdown.byTask[taskType]) {
          breakdown.byTask[taskType] = { requests: 0, cost: 0 };
        }
        breakdown.byTask[taskType].requests += 1;
        breakdown.byTask[taskType].cost += cost;

        // By user
        if (!breakdown.byUser[userId]) {
          breakdown.byUser[userId] = { requests: 0, cost: 0 };
        }
        breakdown.byUser[userId].requests += 1;
        breakdown.byUser[userId].cost += cost;
      });

      // Create daily trends
      const dailyBuckets = new Map<string, { requests: number; cost: number }>();
      filteredMetrics.forEach(metric => {
        const date = metric.timestamp.toISOString().split('T')[0];
        if (!dailyBuckets.has(date)) {
          dailyBuckets.set(date, { requests: 0, cost: 0 });
        }
        const bucket = dailyBuckets.get(date)!;
        bucket.requests += 1;
        bucket.cost += metric.cost;
      });

      const trends = {
        daily: Array.from(dailyBuckets.entries())
          .map(([date, data]) => ({ date, ...data }))
          .sort((a, b) => a.date.localeCompare(b.date))
      };

      return {
        summary,
        breakdown,
        trends
      };

    } catch (error) {
      console.error('Failed to generate usage report:', error);
      throw error;
    }
  }

  clearMetrics(organizationId?: string): void {
    if (organizationId) {
      this.metrics = this.metrics.filter(m => m.organizationId !== organizationId);
    } else {
      this.metrics = [];
    }
  }

  getMetricsCount(): number {
    return this.metrics.length;
  }

  /**
   * Get media generation specific analytics
   */
  getMediaGenerationAnalytics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): {
    overview: {
      totalMediaGenerated: number;
      totalCost: number;
      averageLatency: number;
      successRate: number;
      cacheHitRate: number;
    };
    byMediaType: {
      image: { count: number; cost: number; averageLatency: number };
      video: { count: number; cost: number; averageLatency: number };
      edit: { count: number; cost: number; averageLatency: number };
    };
    byQuality: Record<string, { count: number; cost: number }>;
    byModel: Record<string, { count: number; cost: number; averageLatency: number }>;
    optimizationImpact: {
      cacheHits: number;
      cacheMisses: number;
      totalOptimizations: number;
      optimizationTypes: Record<string, number>;
    };
    trends: {
      hourly: Array<{ hour: string; count: number; cost: number; cacheHitRate: number }>;
    };
  } {
    let filteredMetrics = this.metrics.filter(m =>
      m.operation.includes('generation') || m.operation.includes('edit') || m.mediaType
    );

    if (organizationId) {
      filteredMetrics = filteredMetrics.filter(m => m.organizationId === organizationId);
    }

    if (timeRange) {
      filteredMetrics = filteredMetrics.filter(m =>
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    // Overview metrics
    const totalMediaGenerated = filteredMetrics.reduce((sum, m) => sum + (m.mediaCount || 1), 0);
    const totalCost = filteredMetrics.reduce((sum, m) => sum + m.cost, 0);
    const totalLatency = filteredMetrics.reduce((sum, m) => sum + m.latency, 0);
    const successCount = filteredMetrics.filter(m => m.success).length;
    const cacheHits = filteredMetrics.filter(m => m.cacheHit).length;

    const overview = {
      totalMediaGenerated,
      totalCost,
      averageLatency: filteredMetrics.length > 0 ? totalLatency / filteredMetrics.length : 0,
      successRate: filteredMetrics.length > 0 ? successCount / filteredMetrics.length : 0,
      cacheHitRate: filteredMetrics.length > 0 ? cacheHits / filteredMetrics.length : 0
    };

    // By media type
    const mediaTypes = ['image', 'video', 'edit'] as const;
    const byMediaType = mediaTypes.reduce((acc, type) => {
      const typeMetrics = filteredMetrics.filter(m => m.mediaType === type);
      acc[type] = {
        count: typeMetrics.reduce((sum, m) => sum + (m.mediaCount || 1), 0),
        cost: typeMetrics.reduce((sum, m) => sum + m.cost, 0),
        averageLatency: typeMetrics.length > 0
          ? typeMetrics.reduce((sum, m) => sum + m.latency, 0) / typeMetrics.length
          : 0
      };
      return acc;
    }, {} as any);

    // By quality
    const byQuality: Record<string, { count: number; cost: number }> = {};
    filteredMetrics.forEach(m => {
      const quality = m.quality || 'auto';
      if (!byQuality[quality]) {
        byQuality[quality] = { count: 0, cost: 0 };
      }
      byQuality[quality].count += m.mediaCount || 1;
      byQuality[quality].cost += m.cost;
    });

    // By model
    const byModel: Record<string, { count: number; cost: number; averageLatency: number }> = {};
    const modelGroups = new Map<string, { metrics: typeof filteredMetrics; totalLatency: number }>();

    filteredMetrics.forEach(m => {
      if (!modelGroups.has(m.model)) {
        modelGroups.set(m.model, { metrics: [], totalLatency: 0 });
      }
      const group = modelGroups.get(m.model)!;
      group.metrics.push(m);
      group.totalLatency += m.latency;
    });

    modelGroups.forEach((group, model) => {
      byModel[model] = {
        count: group.metrics.reduce((sum, m) => sum + (m.mediaCount || 1), 0),
        cost: group.metrics.reduce((sum, m) => sum + m.cost, 0),
        averageLatency: group.metrics.length > 0 ? group.totalLatency / group.metrics.length : 0
      };
    });

    // Optimization impact
    const optimizationTypes: Record<string, number> = {};
    let totalOptimizations = 0;

    filteredMetrics.forEach(m => {
      if (m.metadata?.optimizations && Array.isArray(m.metadata.optimizations)) {
        m.metadata.optimizations.forEach((opt: string) => {
          optimizationTypes[opt] = (optimizationTypes[opt] || 0) + 1;
          totalOptimizations++;
        });
      }
    });

    const optimizationImpact = {
      cacheHits,
      cacheMisses: filteredMetrics.length - cacheHits,
      totalOptimizations,
      optimizationTypes
    };

    // Hourly trends
    const hourlyBuckets = new Map<string, { count: number; cost: number; total: number; cacheHits: number }>();
    filteredMetrics.forEach(m => {
      const hour = new Date(m.timestamp);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();

      if (!hourlyBuckets.has(key)) {
        hourlyBuckets.set(key, { count: 0, cost: 0, total: 0, cacheHits: 0 });
      }

      const bucket = hourlyBuckets.get(key)!;
      bucket.count += m.mediaCount || 1;
      bucket.cost += m.cost;
      bucket.total++;
      if (m.cacheHit) bucket.cacheHits++;
    });

    const trends = {
      hourly: Array.from(hourlyBuckets.entries())
        .map(([hour, data]) => ({
          hour,
          count: data.count,
          cost: data.cost,
          cacheHitRate: data.total > 0 ? data.cacheHits / data.total : 0
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour))
    };

    return {
      overview,
      byMediaType,
      byQuality,
      byModel,
      optimizationImpact,
      trends
    };
  }

  /**
   * Get document processing specific analytics
   */
  getDocumentProcessingAnalytics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): {
    overview: {
      totalDocumentsProcessed: number;
      totalCost: number;
      averageLatency: number;
      successRate: number;
      cacheHitRate: number;
      averageDocumentSize: number;
    };
    byExtractionType: {
      summary: { count: number; cost: number; averageLatency: number };
      extraction: { count: number; cost: number; averageLatency: number };
      analysis: { count: number; cost: number; averageLatency: number };
      qa: { count: number; cost: number; averageLatency: number };
    };
    byDocumentType: Record<string, { count: number; cost: number; averageLatency: number }>;
    byEngine: Record<string, { count: number; cost: number; averageLatency: number; successRate: number }>;
    performance: {
      averageTokensPerDocument: number;
      averageExtractionSize: number;
      engineEfficiency: Record<string, number>;
      optimizationImpact: {
        cacheHits: number;
        cacheMisses: number;
        costSavings: number;
      };
    };
    trends: {
      daily: Array<{ date: string; count: number; cost: number; averageLatency: number }>;
    };
  } {
    let filteredMetrics = this.metrics.filter(m =>
      m.operation === 'document_processing' || m.extractionType
    );

    if (organizationId) {
      filteredMetrics = filteredMetrics.filter(m => m.organizationId === organizationId);
    }

    if (timeRange) {
      filteredMetrics = filteredMetrics.filter(m =>
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    // Overview metrics
    const totalDocumentsProcessed = filteredMetrics.length;
    const totalCost = filteredMetrics.reduce((sum, m) => sum + m.cost, 0);
    const totalLatency = filteredMetrics.reduce((sum, m) => sum + m.latency, 0);
    const successCount = filteredMetrics.filter(m => m.success).length;
    const cacheHits = filteredMetrics.filter(m => m.cacheHit).length;
    const totalDocumentSize = filteredMetrics.reduce((sum, m) => sum + (m.documentSize || 0), 0);

    const overview = {
      totalDocumentsProcessed,
      totalCost,
      averageLatency: filteredMetrics.length > 0 ? totalLatency / filteredMetrics.length : 0,
      successRate: filteredMetrics.length > 0 ? successCount / filteredMetrics.length : 0,
      cacheHitRate: filteredMetrics.length > 0 ? cacheHits / filteredMetrics.length : 0,
      averageDocumentSize: filteredMetrics.length > 0 ? totalDocumentSize / filteredMetrics.length : 0
    };

    // By extraction type
    const extractionTypes = ['summary', 'extraction', 'analysis', 'qa'] as const;
    const byExtractionType = extractionTypes.reduce((acc, type) => {
      const typeMetrics = filteredMetrics.filter(m => m.extractionType === type);
      acc[type] = {
        count: typeMetrics.length,
        cost: typeMetrics.reduce((sum, m) => sum + m.cost, 0),
        averageLatency: typeMetrics.length > 0
          ? typeMetrics.reduce((sum, m) => sum + m.latency, 0) / typeMetrics.length
          : 0
      };
      return acc;
    }, {} as any);

    // By document type
    const byDocumentType: Record<string, { count: number; cost: number; averageLatency: number }> = {};
    const documentTypeGroups = new Map<string, typeof filteredMetrics>();

    filteredMetrics.forEach(m => {
      const docType = m.documentType || 'unknown';
      if (!documentTypeGroups.has(docType)) {
        documentTypeGroups.set(docType, []);
      }
      documentTypeGroups.get(docType)!.push(m);
    });

    documentTypeGroups.forEach((metrics, docType) => {
      byDocumentType[docType] = {
        count: metrics.length,
        cost: metrics.reduce((sum, m) => sum + m.cost, 0),
        averageLatency: metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.latency, 0) / metrics.length
          : 0
      };
    });

    // By engine
    const byEngine: Record<string, { count: number; cost: number; averageLatency: number; successRate: number }> = {};
    const engineGroups = new Map<string, typeof filteredMetrics>();

    filteredMetrics.forEach(m => {
      const engine = m.engineUsed || 'unknown';
      if (!engineGroups.has(engine)) {
        engineGroups.set(engine, []);
      }
      engineGroups.get(engine)!.push(m);
    });

    engineGroups.forEach((metrics, engine) => {
      const successCount = metrics.filter(m => m.success).length;
      byEngine[engine] = {
        count: metrics.length,
        cost: metrics.reduce((sum, m) => sum + m.cost, 0),
        averageLatency: metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.latency, 0) / metrics.length
          : 0,
        successRate: metrics.length > 0 ? successCount / metrics.length : 0
      };
    });

    // Performance metrics
    const totalTokens = filteredMetrics.reduce((sum, m) => sum + m.tokensUsed, 0);
    const totalExtractionSize = filteredMetrics.reduce((sum, m) =>
      sum + (m.metadata?.extractedDataLength || 0), 0
    );

    const engineEfficiency: Record<string, number> = {};
    engineGroups.forEach((metrics, engine) => {
      const avgLatency = metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.latency, 0) / metrics.length
        : 0;
      const avgCost = metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.cost, 0) / metrics.length
        : 0;
      // Lower is better: cost per second
      engineEfficiency[engine] = avgLatency > 0 ? avgCost / (avgLatency / 1000) : 0;
    });

    const cacheCostSavings = filteredMetrics
      .filter(m => m.cacheHit)
      .reduce((sum, m) => sum + (m.cost * 0.1), 0); // Assume 10% cost savings for cache hits

    const performance = {
      averageTokensPerDocument: filteredMetrics.length > 0 ? totalTokens / filteredMetrics.length : 0,
      averageExtractionSize: filteredMetrics.length > 0 ? totalExtractionSize / filteredMetrics.length : 0,
      engineEfficiency,
      optimizationImpact: {
        cacheHits,
        cacheMisses: filteredMetrics.length - cacheHits,
        costSavings: cacheCostSavings
      }
    };

    // Daily trends
    const dailyBuckets = new Map<string, { count: number; cost: number; totalLatency: number }>();
    filteredMetrics.forEach(m => {
      const date = m.timestamp.toISOString().split('T')[0];
      if (!dailyBuckets.has(date)) {
        dailyBuckets.set(date, { count: 0, cost: 0, totalLatency: 0 });
      }
      const bucket = dailyBuckets.get(date)!;
      bucket.count++;
      bucket.cost += m.cost;
      bucket.totalLatency += m.latency;
    });

    const trends = {
      daily: Array.from(dailyBuckets.entries())
        .map(([date, data]) => ({
          date,
          count: data.count,
          cost: data.cost,
          averageLatency: data.count > 0 ? data.totalLatency / data.count : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    };

    return {
      overview,
      byExtractionType,
      byDocumentType,
      byEngine,
      performance,
      trends
    };
  }

  /**
   * Get provider comparison including media generation providers
   */
  getEnhancedProviderComparison(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): {
    providers: Array<{
      name: string;
      type: 'text' | 'media' | 'document' | 'hybrid';
      requests: number;
      successRate: number;
      averageLatency: number;
      totalCost: number;
      costPerRequest: number;
      specialMetrics?: {
        mediaGenerated?: number;
        documentsProcessed?: number;
        cacheHitRate?: number;
        averageQuality?: string;
        averageDocumentSize?: number;
        preferredEngine?: string;
      };
    }>;
    recommendations: Array<{
      provider: string;
      recommendation: string;
      priority: 'low' | 'medium' | 'high';
      estimatedImpact: string;
    }>;
  } {
    let filteredMetrics = this.metrics;

    if (organizationId) {
      filteredMetrics = filteredMetrics.filter(m => m.organizationId === organizationId);
    }

    if (timeRange) {
      filteredMetrics = filteredMetrics.filter(m =>
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    const providerStats = new Map<string, {
      textRequests: number;
      mediaRequests: number;
      documentRequests: number;
      successes: number;
      totalLatency: number;
      totalCost: number;
      mediaGenerated: number;
      documentsProcessed: number;
      cacheHits: number;
      qualities: string[];
      documentSizes: number[];
      engines: string[];
    }>();

    filteredMetrics.forEach(metric => {
      const stats = providerStats.get(metric.provider) || {
        textRequests: 0,
        mediaRequests: 0,
        documentRequests: 0,
        successes: 0,
        totalLatency: 0,
        totalCost: 0,
        mediaGenerated: 0,
        documentsProcessed: 0,
        cacheHits: 0,
        qualities: [],
        documentSizes: [],
        engines: []
      };

      const isMediaRequest = metric.operation.includes('generation') || metric.operation.includes('edit') || metric.mediaType;
      const isDocumentRequest = metric.operation === 'document_processing' || metric.extractionType;

      if (isMediaRequest) {
        stats.mediaRequests++;
        stats.mediaGenerated += metric.mediaCount || 1;
        if (metric.cacheHit) stats.cacheHits++;
        if (metric.quality) stats.qualities.push(metric.quality);
      } else if (isDocumentRequest) {
        stats.documentRequests++;
        stats.documentsProcessed++;
        if (metric.cacheHit) stats.cacheHits++;
        if (metric.documentSize) stats.documentSizes.push(metric.documentSize);
        if (metric.engineUsed) stats.engines.push(metric.engineUsed);
      } else {
        stats.textRequests++;
      }

      stats.totalLatency += metric.latency;
      stats.totalCost += metric.cost;
      if (metric.success) stats.successes++;

      providerStats.set(metric.provider, stats);
    });

    const providers = Array.from(providerStats.entries()).map(([name, stats]) => {
      const totalRequests = stats.textRequests + stats.mediaRequests + stats.documentRequests;

      let type: 'text' | 'media' | 'document' | 'hybrid' = 'text';
      const hasText = stats.textRequests > 0;
      const hasMedia = stats.mediaRequests > 0;
      const hasDocument = stats.documentRequests > 0;

      if ((hasText && hasMedia) || (hasText && hasDocument) || (hasMedia && hasDocument) || (hasText && hasMedia && hasDocument)) {
        type = 'hybrid';
      } else if (hasMedia) {
        type = 'media';
      } else if (hasDocument) {
        type = 'document';
      }

      const provider = {
        name,
        type,
        requests: totalRequests,
        successRate: totalRequests > 0 ? stats.successes / totalRequests : 0,
        averageLatency: totalRequests > 0 ? stats.totalLatency / totalRequests : 0,
        totalCost: stats.totalCost,
        costPerRequest: totalRequests > 0 ? stats.totalCost / totalRequests : 0,
        specialMetrics: undefined as any
      };

      if (type === 'media' || type === 'document' || type === 'hybrid') {
        const totalSpecialRequests = stats.mediaRequests + stats.documentRequests;
        provider.specialMetrics = {
          mediaGenerated: stats.mediaGenerated,
          documentsProcessed: stats.documentsProcessed,
          cacheHitRate: totalSpecialRequests > 0 ? stats.cacheHits / totalSpecialRequests : 0,
          averageQuality: stats.qualities.length > 0
            ? stats.qualities.reduce((acc, q, _, arr) => arr.length === 1 ? q : acc + ', ' + q)
            : 'auto',
          averageDocumentSize: stats.documentSizes.length > 0
            ? stats.documentSizes.reduce((sum, size) => sum + size, 0) / stats.documentSizes.length
            : 0,
          preferredEngine: stats.engines.length > 0
            ? stats.engines.reduce((acc, engine, _, arr) => {
                const counts = arr.reduce((c, e) => ({ ...c, [e]: (c[e] || 0) + 1 }), {} as Record<string, number>);
                return Object.entries(counts).sort(([,a], [,b]) => b - a)[0][0];
              })
            : undefined
        };
      }

      return provider;
    });

    // Generate recommendations
    const recommendations: Array<{
      provider: string;
      recommendation: string;
      priority: 'low' | 'medium' | 'high';
      estimatedImpact: string;
    }> = [];

    providers.forEach(provider => {
      if (provider.successRate < 0.9 && provider.requests > 10) {
        recommendations.push({
          provider: provider.name,
          recommendation: `Low success rate (${(provider.successRate * 100).toFixed(1)}%). Review configuration and error patterns.`,
          priority: 'high',
          estimatedImpact: 'Improve reliability and reduce failed requests'
        });
      }

      if (provider.averageLatency > 30000) {
        recommendations.push({
          provider: provider.name,
          recommendation: 'High latency detected. Consider optimization or model selection review.',
          priority: 'medium',
          estimatedImpact: 'Reduce response times and improve user experience'
        });
      }

      if (provider.specialMetrics?.cacheHitRate && provider.specialMetrics.cacheHitRate < 0.2) {
        recommendations.push({
          provider: provider.name,
          recommendation: 'Low cache hit rate for media generation. Review caching strategy.',
          priority: 'medium',
          estimatedImpact: 'Reduce costs and improve response times'
        });
      }

      if (provider.costPerRequest > 0.5) {
        recommendations.push({
          provider: provider.name,
          recommendation: 'High cost per request. Consider model optimization or usage review.',
          priority: 'medium',
          estimatedImpact: 'Reduce operational costs'
        });
      }

      // Document processing specific recommendations
      if (provider.type === 'document' || provider.type === 'hybrid') {
        if (provider.specialMetrics?.documentsProcessed && provider.specialMetrics.documentsProcessed > 10) {
          if (provider.specialMetrics.averageDocumentSize && provider.specialMetrics.averageDocumentSize > 10 * 1024 * 1024) { // > 10MB
            recommendations.push({
              provider: provider.name,
              recommendation: 'Processing large documents. Consider optimizing document size or preprocessing.',
              priority: 'medium',
              estimatedImpact: 'Reduce processing time and costs'
            });
          }

          if (provider.specialMetrics.cacheHitRate && provider.specialMetrics.cacheHitRate < 0.1) {
            recommendations.push({
              provider: provider.name,
              recommendation: 'Low cache hit rate for document processing. Review caching strategy for repeated documents.',
              priority: 'medium',
              estimatedImpact: 'Reduce processing costs for duplicate documents'
            });
          }
        }
      }
    });

    return {
      providers: providers.sort((a, b) => b.requests - a.requests),
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })
    };
  }
}
