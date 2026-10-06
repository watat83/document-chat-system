import { normalizeError } from '@/lib/errors/normalize-error';
import cacheService from './redis';
import { cacheConfig } from './config';

export interface InvalidationOptions {
  patterns?: string[];
  tags?: string[];
  userId?: string;
  organizationId?: string;
  immediate?: boolean;
}

class CacheInvalidator {
  private pendingInvalidations: Set<string> = new Set();
  private batchTimer: NodeJS.Timeout | null = null;
  private batchDelay = 100; // 100ms batch delay

  async invalidateByKey(key: string): Promise<boolean> {
    const fullKey = this.addPrefix(key);
    return await cacheService.del(fullKey);
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    // Note: This is a simplified implementation
    // In production, you'd use Redis SCAN with MATCH pattern
    const fullPattern = this.addPrefix(pattern);
    const count = 0;

    // For now, we'll implement basic pattern matching
    // In real Redis, you'd use SCAN with MATCH
    console.log(`Invalidating pattern: ${fullPattern}`);

    return count;
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let totalInvalidated = 0;

    for (const tag of tags) {
      const patterns = this.getTagPatterns(tag);
      for (const pattern of patterns) {
        const count = await this.invalidateByPattern(pattern);
        totalInvalidated += count;
      }
    }

    return totalInvalidated;
  }

  async invalidateUser(userId: string): Promise<number> {
    const patterns = [
      `user:${userId}:*`,
      `*:user:${userId}:*`,
    ];

    let totalInvalidated = 0;
    for (const pattern of patterns) {
      const count = await this.invalidateByPattern(pattern);
      totalInvalidated += count;
    }

    return totalInvalidated;
  }

  async invalidateOrganization(organizationId: string): Promise<number> {
    const patterns = [
      `org:${organizationId}:*`,
      `*:org:${organizationId}:*`,
    ];

    let totalInvalidated = 0;
    for (const pattern of patterns) {
      const count = await this.invalidateByPattern(pattern);
      totalInvalidated += count;
    }

    return totalInvalidated;
  }

  // Smart invalidation based on data changes
  async invalidateOnDataChange(dataType: string, entityId: string, userId?: string): Promise<number> {
    const patterns = this.getInvalidationPatterns(dataType, entityId, userId);
    let totalInvalidated = 0;

    for (const pattern of patterns) {
      const count = await this.invalidateByPattern(pattern);
      totalInvalidated += count;
    }

    return totalInvalidated;
  }

  // Batch invalidation for performance
  invalidateAsync(key: string): void {
    this.pendingInvalidations.add(key);

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(async () => {
      await this.processBatch();
    }, this.batchDelay);
  }

  private async processBatch(): Promise<void> {
    const keys = Array.from(this.pendingInvalidations);
    this.pendingInvalidations.clear();

    if (keys.length === 0) return;

    try {
      // Batch delete keys
      const promises = keys.map(key => this.invalidateByKey(key));
      await Promise.all(promises);

      console.log(`Batch invalidated ${keys.length} cache keys`);
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Batch invalidation error:', error);
    }
  }

  private getInvalidationPatterns(dataType: string, entityId: string, userId?: string): string[] {
    const patterns: string[] = [];

    switch (dataType) {
      case 'opportunity':
        patterns.push(
          `opp:${entityId}:*`,
          `opp:list:*`,
          `search:*:opportunities:*`,
          `match:*:opp:${entityId}:*`
        );
        if (userId) {
          patterns.push(`user:${userId}:matches:*`);
        }
        break;

      case 'user_profile':
        patterns.push(
          `user:${entityId}:profile:*`,
          `user:${entityId}:preferences:*`,
          `user:${entityId}:matches:*`,
          `match:*:user:${entityId}:*`
        );
        break;

      case 'organization':
        patterns.push(
          `org:${entityId}:*`,
          `user:*:org:${entityId}:*`
        );
        break;

      case 'subscription':
        patterns.push(
          `sub:${entityId}:*`,
          `user:*:subscription:*`,
          `org:*:subscription:*`
        );
        break;

      default:
        patterns.push(`${dataType}:${entityId}:*`);
    }

    return patterns;
  }

  private getTagPatterns(tag: string): string[] {
    const predefinedPatterns = cacheConfig.invalidation.patterns;

    if (predefinedPatterns[tag as keyof typeof predefinedPatterns]) {
      return predefinedPatterns[tag as keyof typeof predefinedPatterns];
    }

    // Fallback to tag-based pattern
    return [`*:${tag}:*`, `${tag}:*`];
  }

  private addPrefix(key: string): string {
    if (key.startsWith('document-chat:')) {
      return key;
    }
    return `document-chat:${key}`;
  }

  // Health check for invalidation system
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const testKey = 'health:check:' + Date.now();
      const testValue = 'test';

      // Test set and get
      await cacheService.set(testKey, testValue, 10);
      const retrieved = await cacheService.get(testKey);

      // Test invalidation
      await this.invalidateByKey(testKey);
      const afterInvalidation = await cacheService.get(testKey);

      const healthy = retrieved === testValue && afterInvalidation === null;

      return {
        healthy,
        details: {
          setAndGet: retrieved === testValue,
          invalidation: afterInvalidation === null,
          pendingInvalidations: this.pendingInvalidations.size,
        },
      };
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      return {
        healthy: false,
        details: { error: error.message },
      };
    }
  }
}

export const cacheInvalidator = new CacheInvalidator();
export default cacheInvalidator;
