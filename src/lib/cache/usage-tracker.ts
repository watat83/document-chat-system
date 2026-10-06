import { prisma } from '@/lib/db';

export interface UsageEvent {
  userId: string;
  organizationId?: string;
  type: 'cache_hit' | 'cache_miss' | 'api_call';
  resourceId: string;
  resourceType?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  responseTime?: number;
  statusCode?: number;
}

export interface UsageStats {
  totalCacheHits: number;
  totalCacheMisses: number;
  totalApiCalls: number;
  cacheHitRate: number;
}

class UsageTracker {
  private costPerApiCall = 0.01; // $0.01 per API call
  private costPerCacheHit = 0.001; // $0.001 per cache hit (much cheaper)

  async trackCacheHit(userId: string, resource: string, organizationId?: string): Promise<void> {
    if (!organizationId) {
      console.warn('Cannot track cache hit: organizationId is required');
      return;
    }

    const event: UsageEvent = {
      userId,
      organizationId,
      type: 'cache_hit',
      resourceId: resource,
      resourceType: 'cache',
    };

    await this.recordUsage(event);
  }

  async trackCacheMiss(userId: string, resource: string, organizationId?: string): Promise<void> {
    if (!organizationId) {
      console.warn('Cannot track cache miss: organizationId is required');
      return;
    }

    const event: UsageEvent = {
      userId,
      organizationId,
      type: 'cache_miss',
      resourceId: resource,
      resourceType: 'cache',
    };

    await this.recordUsage(event);
  }

  async trackApiCall(
    userId: string,
    resource: string,
    cost?: number,
    organizationId?: string,
    metadata?: any
  ): Promise<void> {
    const event: UsageEvent = {
      userId,
      organizationId,
      type: 'api_call',
      resourceId: resource,
      resourceType: 'api',
      metadata: { ...metadata, cost: cost ?? this.costPerApiCall },
    };

    await this.recordUsage(event);
  }

  private async recordUsage(event: UsageEvent): Promise<void> {
    try {
      // Skip recording if organizationId is missing (required by schema)
      if (!event.organizationId) {
        console.warn('Skipping usage recording: organizationId is required but missing');
        return;
      }

      // Record in database
      await prisma.usageEvent.create({
        data: {
          userId: event.userId,
          organizationId: event.organizationId!,
          type: event.type,
          resourceId: event.resourceId,
          resourceType: event.resourceType,
          metadata: event.metadata,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          endpoint: event.endpoint,
          method: event.method,
          responseTime: event.responseTime,
          statusCode: event.statusCode,
        },
      });

      // Note: Usage tracking for cache events is for analytics only
      // Cost tracking is handled by the main usage tracking system
    } catch (error) {
      console.error('Failed to record usage:', error);
      // Don't throw - usage tracking shouldn't break the application
    }
  }

  async getUserUsageStats(userId: string, startDate?: Date, endDate?: Date, organizationId?: string): Promise<UsageStats> {
    const whereClause = {
      userId, organizationId,
      createdAt: {
        gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
        lte: endDate || new Date(),
      },
    };

    const [cacheHits, cacheMisses, apiCalls] = await Promise.all([
      prisma.usageEvent.count({
        where: { ...whereClause, type: 'cache_hit' },
      }),
      prisma.usageEvent.count({
        where: { ...whereClause, type: 'cache_miss' },
      }),
      prisma.usageEvent.count({
        where: { ...whereClause, type: 'api_call' },
      }),
    ]);

    const totalCacheHits = cacheHits;
    const totalCacheMisses = cacheMisses;
    const totalApiCalls = apiCalls;

    const totalRequests = totalCacheHits + totalCacheMisses + totalApiCalls;
    const cacheHitRate = totalRequests > 0 ? (totalCacheHits / totalRequests) * 100 : 0;

    return {
      totalCacheHits,
      totalCacheMisses,
      totalApiCalls,
      cacheHitRate,
    };
  }

  async getTopResourcesByUsage(userId: string, organizationId: string, limit: number, startDate?: Date, endDate?: Date) {
    return prisma.usageEvent.groupBy({ by: ['resourceId', 'resourceType'],
      where: { userId, organizationId, createdAt: { gte: startDate || new Date(Date.now() - 30 * 86400000), lte: endDate || new Date() } },
      _count: { _all: true }, orderBy: { _count: { resourceId: 'desc' } }, take: limit });
  }
  // Note: Additional methods removed to avoid field compatibility issues
  // The cache tracking functionality is focused on basic hit/miss analytics
}

export const usageTracker = new UsageTracker();
export default usageTracker;
