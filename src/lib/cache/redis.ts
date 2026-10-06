import Redis from 'ioredis';
import { redis } from '@/lib/config/env';

class CacheService {
  private redis: any | null = null;
  private isConnected = false;

  constructor() {
    // Only initialize on server-side
    if (typeof window === 'undefined' && process.env.REDIS_HOST) {
      void this.initialize();
    }
  }

  private async initialize() {
    // Skip if client-side or Redis not available
    if (typeof window !== 'undefined' || !Redis || !redis) {
      return;
    }

    try {
      this.redis = new Redis({
        host: redis.host,
        port: redis.port,
        password: redis.password,
        db: redis.db,
        retryStrategy: (attempt: number) => Math.min(attempt * 100, 3000),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      this.redis.on('connect', () => {
        console.log('Redis connected successfully');
        this.isConnected = true;
      });

      this.redis.on('error', (error: Error) => {
        console.error('Redis connection error:', error);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        console.log('Redis connection closed');
        this.isConnected = false;
      });

      await this.redis.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.isConnected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected || !this.redis) {
      return null;
    }

    try {
      return await this.redis.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }

  async flush(): Promise<boolean> {
    if (!this.isConnected || !this.redis) {
      return false;
    }

    try {
      await this.redis.flushdb();
      return true;
    } catch (error) {
      console.error('Redis FLUSH error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
    }
  }

  getStatus(): { connected: boolean; redis: boolean } {
    return {
      connected: this.isConnected,
      redis: this.redis !== null,
    };
  }
}

export const cacheService = new CacheService();
export default cacheService;
