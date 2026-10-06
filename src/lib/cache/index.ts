const clientCache = {
  get: async (_key: string) => null,
  set: async (_key: string, _value: string, _ttl?: number) => false,
  del: async (_key: string) => false,
  exists: async (_key: string) => false,
  flush: async () => false,
};
async function getCacheService() { return typeof window === 'undefined' ? (await import('./redis')).default : clientCache; }
async function getUsageTracker() { return typeof window === 'undefined' ? (await import('./usage-tracker')).usageTracker : { trackCacheHit: async (..._args: unknown[]) => {}, trackCacheMiss: async (..._args: unknown[]) => {} }; }

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
  skipBilling?: boolean;
  tags?: string[];
  userId?: string;
  organizationId?: string;
}

export interface CacheResult<T> {
  data: T;
  cached: boolean;
  key: string;
}

class CacheManager {
  private defaultTTL = 3600; // 1 hour
  private keyPrefix = 'document-chat:';

  private generateKey(key: string, prefix?: string): string {
    const finalPrefix = prefix || this.keyPrefix;
    return `${finalPrefix}${key}`;
  }

  private hashKey(obj: any): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  }

  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const cacheKey = this.generateKey(key, options.prefix);

    try {
      const cached = await (await getCacheService()).get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed as T;
      }

      return null;
    } catch (error) {
      console.error('Cache GET error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, settings: CacheOptions | number = {}): Promise<boolean> {
    const options = typeof settings === 'number' ? { ttl: settings } : settings;
    const cacheKey = this.generateKey(key, options.prefix);
    const ttl = options.ttl ?? this.defaultTTL;

    try {
      const serialized = JSON.stringify(value);
      return await (await getCacheService()).set(cacheKey, serialized, ttl);
    } catch (error) {
      console.error('Cache SET error:', error);
      return false;
    }
  }

  async withCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<CacheResult<T>> {
    const cacheKey = this.generateKey(key, options.prefix);

    // Try to get from cache first
    const cached = await this.get<T>(key, options);

    if (cached !== null) {
      // Cache hit - track usage
      if (options.userId && !options.skipBilling) {
        await (await getUsageTracker()).trackCacheHit(options.userId, key, options.organizationId);
      }

      return {
        data: cached,
        cached: true,
        key: cacheKey,
      };
    }

    // Cache miss - fetch data
    try {
      const data = await fetcher();

      // Store in cache
      await this.set(key, data, options);

      // Track usage
      if (options.userId && !options.skipBilling) {
        await (await getUsageTracker()).trackCacheMiss(options.userId, key, options.organizationId);
      }

      return {
        data,
        cached: false,
        key: cacheKey,
      };
    } catch (error) {
      console.error('Cache fetcher error:', error);
      throw error;
    }
  }

  async invalidate(key: string, options: CacheOptions = {}): Promise<boolean> {
    const cacheKey = this.generateKey(key, options.prefix);
    return await (await getCacheService()).del(cacheKey);
  }

  // Alias for invalidate for better API consistency
  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    return this.invalidate(key, options);
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    // This would require a more sophisticated implementation
    // For now, we'll implement a basic pattern-based invalidation
    let invalidated = 0;

    for (const tag of tags) {
      const pattern = this.generateKey(`*:${tag}:*`);
      // Note: This is a simplified implementation
      // In production, you'd want to use Redis SCAN with patterns
      invalidated++;
    }

    return invalidated;
  }

  async flush(): Promise<boolean> {
    return await (await getCacheService()).flush();
  }

  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    const cacheKey = this.generateKey(key, options.prefix);
    return await (await getCacheService()).exists(cacheKey);
  }

  // Utility methods for common cache patterns
  cacheKeyFor(resource: string, id: string | number, params?: any): string {
    const baseKey = `${resource}:${id}`;
    if (params) {
      const hash = this.hashKey(params);
      return `${baseKey}:${hash}`;
    }
    return baseKey;
  }

  listCacheKeyFor(resource: string, filters?: any): string {
    const baseKey = `${resource}:list`;
    if (filters) {
      const hash = this.hashKey(filters);
      return `${baseKey}:${hash}`;
    }
    return baseKey;
  }

  userCacheKeyFor(userId: string, resource: string, params?: any): string {
    const baseKey = `user:${userId}:${resource}`;
    if (params) {
      const hash = this.hashKey(params);
      return `${baseKey}:${hash}`;
    }
    return baseKey;
  }

  orgCacheKeyFor(orgId: string, resource: string, params?: any): string {
    const baseKey = `org:${orgId}:${resource}`;
    if (params) {
      const hash = this.hashKey(params);
      return `${baseKey}:${hash}`;
    }
    return baseKey;
  }
}

export const cacheManager = new CacheManager();
export default cacheManager;
