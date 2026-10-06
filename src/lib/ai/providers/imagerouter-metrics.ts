/**
 * ImageRouter Metrics Collector
 *
 * Comprehensive metrics collection and analysis for ImageRouter integration.
 * Tracks performance, costs, usage patterns, and provides optimization insights.
 */

import { cacheManager } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/cache/config';
import {
  ImageRouterMetrics,
  ImageRouterModelPerformance,
  ImageRouterError
} from '../interfaces/imagerouter-types';

export interface MetricsConfig {
  enableDetailedTracking: boolean;
  aggregationWindow: number; // milliseconds
  retentionPeriod: number; // milliseconds
  alertThresholds: {
    errorRate: number;
    latency: number;
    costPerRequest: number;
  };
}

export interface AggregatedMetrics {
  timeWindow: {
    start: string;
    end: string;
    duration: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    errorRate: number;
  };
  performance: {
    averageLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    throughputPerMinute: number;
  };
  costs: {
    totalCost: number;
    averageCostPerRequest: number;
    costPerSuccessfulRequest: number;
    projectedMonthlyCost: number;
  };
  models: {
    [modelId: string]: {
      usage: number;
      successRate: number;
      averageLatency: number;
      averageCost: number;
      errorTypes: { [errorType: string]: number };
    };
  };
  mediaTypes: {
    image: { requests: number; successRate: number; averageCost: number };
    video: { requests: number; successRate: number; averageCost: number };
    edit: { requests: number; successRate: number; averageCost: number };
  };
  errors: {
    byType: { [errorType: string]: number };
    byModel: { [modelId: string]: number };
    byTime: { [hour: string]: number };
    patterns: ErrorPattern[];
  };
  quality: {
    averageQualityScore: number;
    qualityByModel: { [modelId: string]: number };
    userSatisfactionScore: number;
  };
  optimization: {
    recommendations: OptimizationRecommendation[];
    potentialSavings: number;
    performanceImprovements: PerformanceImprovement[];
  };
}

export interface ErrorPattern {
  type: string;
  frequency: number;
  affectedModels: string[];
  timePattern: 'peak' | 'off-peak' | 'random';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestedActions: string[];
}

export interface OptimizationRecommendation {
  type: 'cost' | 'performance' | 'quality';
  priority: 'low' | 'medium' | 'high';
  description: string;
  potentialImpact: string;
  implementationEffort: 'low' | 'medium' | 'high';
  estimatedSavings?: number;
  estimatedImprovement?: string;
}

export interface PerformanceImprovement {
  area: 'latency' | 'throughput' | 'success_rate';
  currentValue: number;
  targetValue: number;
  improvement: string;
  actions: string[];
}

export interface MetricsEvent {
  timestamp: string;
  type: 'request' | 'success' | 'error' | 'cost' | 'quality';
  data: {
    model?: string;
    mediaType?: 'image' | 'video' | 'edit';
    latency?: number;
    cost?: number;
    error?: string;
    qualityScore?: number;
    requestId?: string;
    organizationId?: string;
    [key: string]: any;
  };
}

export class ImageRouterMetricsCollector {
  private config: MetricsConfig;
  private events: MetricsEvent[] = [];
  private readonly MAX_EVENTS_IN_MEMORY = 10000;

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = {
      enableDetailedTracking: true,
      aggregationWindow: 3600000, // 1 hour
      retentionPeriod: 2592000000, // 30 days
      alertThresholds: {
        errorRate: 0.05, // 5%
        latency: 30000, // 30 seconds
        costPerRequest: 0.50 // $0.50
      },
      ...config
    };
  }

  /**
   * Record a metrics event
   */
  async recordEvent(event: Omit<MetricsEvent, 'timestamp'>): Promise<void> {
    const timestampedEvent: MetricsEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    // Add to in-memory storage
    this.events.push(timestampedEvent);

    // Maintain memory limit
    if (this.events.length > this.MAX_EVENTS_IN_MEMORY) {
      this.events = this.events.slice(-this.MAX_EVENTS_IN_MEMORY);
    }

    // Cache for persistence
    if (this.config.enableDetailedTracking) {
      await this.persistEvent(timestampedEvent);
    }

    // Check for alerts
    await this.checkAlertThresholds(timestampedEvent);
  }

  /**
   * Record a request start
   */
  async recordRequest(data: {
    requestId: string;
    model: string;
    mediaType: 'image' | 'video' | 'edit';
    organizationId?: string;
    prompt?: string;
  }): Promise<void> {
    await this.recordEvent({
      type: 'request',
      data
    });
  }

  /**
   * Record a successful completion
   */
  async recordSuccess(data: {
    requestId: string;
    model: string;
    mediaType: 'image' | 'video' | 'edit';
    latency: number;
    cost: number;
    qualityScore?: number;
    organizationId?: string;
  }): Promise<void> {
    await this.recordEvent({
      type: 'success',
      data
    });
  }

  /**
   * Record an error
   */
  async recordError(data: {
    requestId: string;
    model: string;
    mediaType: 'image' | 'video' | 'edit';
    error: string;
    errorType: string;
    latency: number;
    organizationId?: string;
  }): Promise<void> {
    await this.recordEvent({
      type: 'error',
      data
    });
  }

  /**
   * Record cost information
   */
  async recordCost(data: {
    requestId: string;
    model: string;
    mediaType: 'image' | 'video' | 'edit';
    cost: number;
    tokens?: number;
    organizationId?: string;
  }): Promise<void> {
    await this.recordEvent({
      type: 'cost',
      data
    });
  }

  /**
   * Record quality assessment
   */
  async recordQuality(data: {
    requestId: string;
    model: string;
    mediaType: 'image' | 'video' | 'edit';
    qualityScore: number;
    userRating?: number;
    organizationId?: string;
  }): Promise<void> {
    await this.recordEvent({
      type: 'quality',
      data
    });
  }

  /**
   * Get aggregated metrics for a time window
   */
  async getAggregatedMetrics(
    startTime?: Date,
    endTime?: Date
  ): Promise<AggregatedMetrics> {
    const end = endTime || new Date();
    const start = startTime || new Date(end.getTime() - this.config.aggregationWindow);

    const cacheKey = `imagerouter:metrics:aggregated:${start.getTime()}-${end.getTime()}`;

    // Try cache first
    const cached = await cacheManager.get<AggregatedMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    // Filter events to time window
    const windowEvents = this.events.filter(event => {
      const eventTime = new Date(event.timestamp);
      return eventTime >= start && eventTime <= end;
    });

    const metrics = await this.aggregateEvents(windowEvents, start, end);

    // Cache for 5 minutes
    await cacheManager.set(cacheKey, metrics, CACHE_TTL.SHORT);

    return metrics;
  }

  /**
   * Get real-time metrics
   */
  async getRealTimeMetrics(): Promise<{
    currentRequests: number;
    requestsPerMinute: number;
    averageLatency: number;
    errorRate: number;
    currentCostPerHour: number;
  }> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    const oneHourAgo = new Date(now.getTime() - 3600000);

    const recentEvents = this.events.filter(event =>
      new Date(event.timestamp) >= oneMinuteAgo
    );

    const hourlyEvents = this.events.filter(event =>
      new Date(event.timestamp) >= oneHourAgo
    );

    const requestEvents = recentEvents.filter(e => e.type === 'request');
    const successEvents = recentEvents.filter(e => e.type === 'success');
    const errorEvents = recentEvents.filter(e => e.type === 'error');
    const costEvents = hourlyEvents.filter(e => e.type === 'cost');

    const totalRequests = requestEvents.length + successEvents.length + errorEvents.length;
    const totalResponses = successEvents.length + errorEvents.length;

    return {
      currentRequests: requestEvents.length,
      requestsPerMinute: totalRequests,
      averageLatency: totalResponses > 0
        ? successEvents.reduce((sum, e) => sum + (e.data.latency || 0), 0) / successEvents.length
        : 0,
      errorRate: totalResponses > 0 ? errorEvents.length / totalResponses : 0,
      currentCostPerHour: costEvents.reduce((sum, e) => sum + (e.data.cost || 0), 0)
    };
  }

  /**
   * Get model performance comparison
   */
  async getModelPerformanceComparison(): Promise<{
    [modelId: string]: ImageRouterModelPerformance;
  }> {
    const cacheKey = 'imagerouter:metrics:model-performance';

    const cached = await cacheManager.get<{[modelId: string]: ImageRouterModelPerformance}>(cacheKey);
    if (cached) {
      return cached;
    }

    const modelPerformance: {[modelId: string]: ImageRouterModelPerformance} = {};
    const modelEvents = this.groupEventsByModel();

    for (const [modelId, events] of Object.entries(modelEvents)) {
      const successEvents = events.filter(e => e.type === 'success');
      const errorEvents = events.filter(e => e.type === 'error');
      const costEvents = events.filter(e => e.type === 'cost');
      const qualityEvents = events.filter(e => e.type === 'quality');

      const totalRequests = successEvents.length + errorEvents.length;

      if (totalRequests > 0) {
        modelPerformance[modelId] = {
          modelId,
          averageLatency: successEvents.length > 0
            ? successEvents.reduce((sum, e) => sum + (e.data.latency || 0), 0) / successEvents.length
            : 0,
          successRate: successEvents.length / totalRequests,
          averageCost: costEvents.length > 0
            ? costEvents.reduce((sum, e) => sum + (e.data.cost || 0), 0) / costEvents.length
            : 0,
          qualityScore: qualityEvents.length > 0
            ? qualityEvents.reduce((sum, e) => sum + (e.data.qualityScore || 0), 0) / qualityEvents.length
            : 0.8,
          sampleSize: totalRequests,
          lastUpdated: new Date().toISOString(),
          features: [],
          tier: this.calculateModelTier(modelId, successEvents, errorEvents)
        };
      }
    }

    await cacheManager.set(cacheKey, modelPerformance, CACHE_TTL.MEDIUM);
    return modelPerformance;
  }

  /**
   * Get optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
    const metrics = await this.getAggregatedMetrics();
    const recommendations: OptimizationRecommendation[] = [];

    // Cost optimization recommendations
    if (metrics.costs.averageCostPerRequest > this.config.alertThresholds.costPerRequest) {
      recommendations.push({
        type: 'cost',
        priority: 'high',
        description: 'Average cost per request is above threshold',
        potentialImpact: `Potential savings of $${(metrics.costs.averageCostPerRequest - this.config.alertThresholds.costPerRequest) * metrics.requests.total} per period`,
        implementationEffort: 'medium',
        estimatedSavings: (metrics.costs.averageCostPerRequest - this.config.alertThresholds.costPerRequest) * metrics.requests.total
      });
    }

    // Performance optimization recommendations
    if (metrics.performance.averageLatency > this.config.alertThresholds.latency) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        description: 'Average latency is above acceptable threshold',
        potentialImpact: `Reduce latency by ${((metrics.performance.averageLatency - this.config.alertThresholds.latency) / 1000).toFixed(1)}s`,
        implementationEffort: 'medium',
        estimatedImprovement: `${((this.config.alertThresholds.latency / metrics.performance.averageLatency - 1) * 100).toFixed(1)}% latency improvement`
      });
    }

    // Quality optimization recommendations
    if (metrics.quality.averageQualityScore < 0.8) {
      recommendations.push({
        type: 'quality',
        priority: 'medium',
        description: 'Quality scores are below optimal range',
        potentialImpact: 'Improve user satisfaction and reduce regeneration requests',
        implementationEffort: 'low',
        estimatedImprovement: `${((0.8 - metrics.quality.averageQualityScore) * 100).toFixed(1)}% quality improvement potential`
      });
    }

    // Model-specific recommendations
    const modelPerformance = await this.getModelPerformanceComparison();
    for (const [modelId, perf] of Object.entries(modelPerformance)) {
      if (perf.successRate < 0.95 && perf.sampleSize >= 10) {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          description: `Model ${modelId} has low success rate (${(perf.successRate * 100).toFixed(1)}%)`,
          potentialImpact: 'Reduce errors and improve reliability',
          implementationEffort: 'low'
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Export metrics data
   */
  async exportMetrics(format: 'json' | 'csv' = 'json'): Promise<string> {
    const metrics = await this.getAggregatedMetrics();

    if (format === 'csv') {
      return this.convertToCSV(metrics);
    }

    return JSON.stringify(metrics, null, 2);
  }

  /**
   * Clear old metrics data
   */
  async clearOldMetrics(maxAge?: number): Promise<void> {
    const cutoffTime = new Date(Date.now() - (maxAge || this.config.retentionPeriod));

    this.events = this.events.filter(event =>
      new Date(event.timestamp) > cutoffTime
    );

    // Clear cached data
    const keys = await this.getCachedMetricsKeys();
    for (const key of keys) {
      await cacheManager.delete(key);
    }
  }

  // Private helper methods

  private async persistEvent(event: MetricsEvent): Promise<void> {
    const key = `imagerouter:metrics:event:${event.timestamp}:${Math.random().toString(36).substr(2, 9)}`;
    await cacheManager.set(key, event, this.config.retentionPeriod / 1000);
  }

  private async checkAlertThresholds(event: MetricsEvent): Promise<void> {
    // Implement alert logic based on thresholds
    if (event.type === 'error') {
      const recentErrorRate = await this.calculateRecentErrorRate();
      if (recentErrorRate > this.config.alertThresholds.errorRate) {
        console.warn(`ImageRouter error rate alert: ${(recentErrorRate * 100).toFixed(1)}% > ${(this.config.alertThresholds.errorRate * 100).toFixed(1)}%`);
      }
    }

    if (event.type === 'success' && event.data.latency && event.data.latency > this.config.alertThresholds.latency) {
      console.warn(`ImageRouter latency alert: ${event.data.latency}ms > ${this.config.alertThresholds.latency}ms for model ${event.data.model}`);
    }

    if (event.type === 'cost' && event.data.cost && event.data.cost > this.config.alertThresholds.costPerRequest) {
      console.warn(`ImageRouter cost alert: $${event.data.cost} > $${this.config.alertThresholds.costPerRequest} for model ${event.data.model}`);
    }
  }

  private async calculateRecentErrorRate(): Promise<number> {
    const fifteenMinutesAgo = new Date(Date.now() - 900000);
    const recentEvents = this.events.filter(event =>
      new Date(event.timestamp) >= fifteenMinutesAgo &&
      (event.type === 'success' || event.type === 'error')
    );

    if (recentEvents.length === 0) return 0;

    const errorEvents = recentEvents.filter(e => e.type === 'error');
    return errorEvents.length / recentEvents.length;
  }

  private async aggregateEvents(
    events: MetricsEvent[],
    start: Date,
    end: Date
  ): Promise<AggregatedMetrics> {
    const requestEvents = events.filter(e => e.type === 'request');
    const successEvents = events.filter(e => e.type === 'success');
    const errorEvents = events.filter(e => e.type === 'error');
    const costEvents = events.filter(e => e.type === 'cost');
    const qualityEvents = events.filter(e => e.type === 'quality');

    const totalRequests = requestEvents.length + successEvents.length + errorEvents.length;
    const successfulRequests = successEvents.length;
    const failedRequests = errorEvents.length;

    // Calculate latency percentiles
    const latencies = successEvents
      .map(e => e.data.latency)
      .filter(l => l !== undefined)
      .sort((a, b) => a - b);

    const getPercentile = (arr: number[], percentile: number) => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((percentile / 100) * arr.length) - 1;
      return arr[Math.max(0, index)];
    };

    // Calculate costs
    const costs = costEvents.map(e => e.data.cost).filter(c => c !== undefined);
    const totalCost = costs.reduce((sum, cost) => sum + cost, 0);

    // Group by model
    const modelMetrics: { [modelId: string]: any } = {};
    const modelEvents = this.groupEventsByModel(events);

    for (const [modelId, modelEventList] of Object.entries(modelEvents)) {
      const modelSuccessEvents = modelEventList.filter(e => e.type === 'success');
      const modelErrorEvents = modelEventList.filter(e => e.type === 'error');
      const modelCostEvents = modelEventList.filter(e => e.type === 'cost');

      const modelTotalRequests = modelSuccessEvents.length + modelErrorEvents.length;

      if (modelTotalRequests > 0) {
        modelMetrics[modelId] = {
          usage: modelTotalRequests,
          successRate: modelSuccessEvents.length / modelTotalRequests,
          averageLatency: modelSuccessEvents.length > 0
            ? modelSuccessEvents.reduce((sum, e) => sum + (e.data.latency || 0), 0) / modelSuccessEvents.length
            : 0,
          averageCost: modelCostEvents.length > 0
            ? modelCostEvents.reduce((sum, e) => sum + (e.data.cost || 0), 0) / modelCostEvents.length
            : 0,
          errorTypes: this.groupErrorsByType(modelErrorEvents)
        };
      }
    }

    // Group by media type
    const mediaTypeMetrics = {
      image: this.calculateMediaTypeMetrics(events, 'image'),
      video: this.calculateMediaTypeMetrics(events, 'video'),
      edit: this.calculateMediaTypeMetrics(events, 'edit')
    };

    // Calculate quality metrics
    const qualityScores = qualityEvents.map(e => e.data.qualityScore).filter(q => q !== undefined);
    const averageQualityScore = qualityScores.length > 0
      ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length
      : 0.8;

    // Error analysis
    const errorPatterns = await this.analyzeErrorPatterns(errorEvents);

    // Optimization recommendations
    const recommendations = await this.generateRecommendations(
      { totalRequests, successfulRequests, failedRequests },
      { averageLatency: latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0 },
      { totalCost, averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0 }
    );

    return {
      timeWindow: {
        start: start.toISOString(),
        end: end.toISOString(),
        duration: end.getTime() - start.getTime()
      },
      requests: {
        total: totalRequests,
        successful: successfulRequests,
        failed: failedRequests,
        successRate: totalRequests > 0 ? successfulRequests / totalRequests : 0,
        errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0
      },
      performance: {
        averageLatency: latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0,
        p50Latency: getPercentile(latencies, 50),
        p95Latency: getPercentile(latencies, 95),
        p99Latency: getPercentile(latencies, 99),
        throughputPerMinute: totalRequests / ((end.getTime() - start.getTime()) / 60000)
      },
      costs: {
        totalCost,
        averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
        costPerSuccessfulRequest: successfulRequests > 0 ? totalCost / successfulRequests : 0,
        projectedMonthlyCost: (totalCost / ((end.getTime() - start.getTime()) / 1000)) * (30 * 24 * 3600)
      },
      models: modelMetrics,
      mediaTypes: mediaTypeMetrics,
      errors: {
        byType: this.groupErrorsByType(errorEvents),
        byModel: this.groupErrorsByModel(errorEvents),
        byTime: this.groupErrorsByTime(errorEvents),
        patterns: errorPatterns
      },
      quality: {
        averageQualityScore,
        qualityByModel: this.calculateQualityByModel(qualityEvents),
        userSatisfactionScore: averageQualityScore * 0.9 // Approximation
      },
      optimization: {
        recommendations,
        potentialSavings: recommendations
          .filter(r => r.estimatedSavings)
          .reduce((sum, r) => sum + (r.estimatedSavings || 0), 0),
        performanceImprovements: []
      }
    };
  }

  private groupEventsByModel(events?: MetricsEvent[]): { [modelId: string]: MetricsEvent[] } {
    const eventsToGroup = events || this.events;
    const grouped: { [modelId: string]: MetricsEvent[] } = {};

    for (const event of eventsToGroup) {
      const model = event.data.model || 'unknown';
      if (!grouped[model]) {
        grouped[model] = [];
      }
      grouped[model].push(event);
    }

    return grouped;
  }

  private groupErrorsByType(errorEvents: MetricsEvent[]): { [errorType: string]: number } {
    const grouped: { [errorType: string]: number } = {};

    for (const event of errorEvents) {
      const errorType = event.data.errorType || 'unknown';
      grouped[errorType] = (grouped[errorType] || 0) + 1;
    }

    return grouped;
  }

  private groupErrorsByModel(errorEvents: MetricsEvent[]): { [modelId: string]: number } {
    const grouped: { [modelId: string]: number } = {};

    for (const event of errorEvents) {
      const model = event.data.model || 'unknown';
      grouped[model] = (grouped[model] || 0) + 1;
    }

    return grouped;
  }

  private groupErrorsByTime(errorEvents: MetricsEvent[]): { [hour: string]: number } {
    const grouped: { [hour: string]: number } = {};

    for (const event of errorEvents) {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13);
      grouped[hour] = (grouped[hour] || 0) + 1;
    }

    return grouped;
  }

  private calculateMediaTypeMetrics(events: MetricsEvent[], mediaType: string) {
    const relevantEvents = events.filter(e => e.data.mediaType === mediaType);
    const successEvents = relevantEvents.filter(e => e.type === 'success');
    const errorEvents = relevantEvents.filter(e => e.type === 'error');
    const costEvents = relevantEvents.filter(e => e.type === 'cost');

    const totalRequests = successEvents.length + errorEvents.length;

    return {
      requests: totalRequests,
      successRate: totalRequests > 0 ? successEvents.length / totalRequests : 0,
      averageCost: costEvents.length > 0
        ? costEvents.reduce((sum, e) => sum + (e.data.cost || 0), 0) / costEvents.length
        : 0
    };
  }

  private calculateQualityByModel(qualityEvents: MetricsEvent[]): { [modelId: string]: number } {
    const grouped: { [modelId: string]: { sum: number; count: number } } = {};

    for (const event of qualityEvents) {
      const model = event.data.model || 'unknown';
      const score = event.data.qualityScore || 0;

      if (!grouped[model]) {
        grouped[model] = { sum: 0, count: 0 };
      }

      grouped[model].sum += score;
      grouped[model].count += 1;
    }

    const result: { [modelId: string]: number } = {};
    for (const [model, data] of Object.entries(grouped)) {
      result[model] = data.count > 0 ? data.sum / data.count : 0;
    }

    return result;
  }

  private async analyzeErrorPatterns(errorEvents: MetricsEvent[]): Promise<ErrorPattern[]> {
    // Simplified error pattern analysis
    const patterns: ErrorPattern[] = [];
    const errorTypes = this.groupErrorsByType(errorEvents);

    for (const [errorType, frequency] of Object.entries(errorTypes)) {
      if (frequency >= 3) { // Only report patterns with significant frequency
        patterns.push({
          type: errorType,
          frequency,
          affectedModels: [...new Set(errorEvents
            .filter(e => e.data.errorType === errorType)
            .map(e => e.data.model || 'unknown'))],
          timePattern: 'random', // Simplified
          severity: frequency > 10 ? 'high' : frequency > 5 ? 'medium' : 'low',
          description: `${errorType} errors occurring ${frequency} times`,
          suggestedActions: [`Investigate ${errorType} error root cause`, 'Review affected models']
        });
      }
    }

    return patterns;
  }

  private async generateRecommendations(
    requests: { totalRequests: number; successfulRequests: number; failedRequests: number },
    performance: { averageLatency: number },
    costs: { totalCost: number; averageCostPerRequest: number }
  ): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];

    // Error rate recommendation
    if (requests.totalRequests > 0) {
      const errorRate = requests.failedRequests / requests.totalRequests;
      if (errorRate > 0.05) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          description: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
          potentialImpact: 'Improve reliability and user experience',
          implementationEffort: 'medium'
        });
      }
    }

    return recommendations;
  }

  private calculateModelTier(
    modelId: string,
    successEvents: MetricsEvent[],
    errorEvents: MetricsEvent[]
  ): 'fast' | 'balanced' | 'powerful' {
    const avgLatency = successEvents.length > 0
      ? successEvents.reduce((sum, e) => sum + (e.data.latency || 0), 0) / successEvents.length
      : 0;

    if (avgLatency < 10000) return 'fast';
    if (avgLatency > 30000) return 'powerful';
    return 'balanced';
  }

  private convertToCSV(metrics: AggregatedMetrics): string {
    // Simplified CSV conversion
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Requests', metrics.requests.total.toString()],
      ['Success Rate', `${(metrics.requests.successRate * 100).toFixed(2)}%`],
      ['Average Latency', `${metrics.performance.averageLatency.toFixed(0)}ms`],
      ['Total Cost', `$${metrics.costs.totalCost.toFixed(4)}`],
      ['Average Cost Per Request', `$${metrics.costs.averageCostPerRequest.toFixed(4)}`]
    ];

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private async getCachedMetricsKeys(): Promise<string[]> {
    // This would need to be implemented based on your cache manager's capabilities
    return [];
  }
}

// Singleton instance
export const imageRouterMetrics = new ImageRouterMetricsCollector();
