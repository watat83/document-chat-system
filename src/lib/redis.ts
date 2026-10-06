import { Redis } from '@upstash/redis'
import { redis as redisConfig, app } from '@/lib/config/env'

// Check if Redis configuration is valid
const hasValidRedisConfig =
  redisConfig.url &&
  redisConfig.url !== 'your_upstash_redis_url_here' &&
  redisConfig.url.startsWith('https://') &&
  redisConfig.token &&
  redisConfig.token !== 'your_upstash_redis_token_here'

// Initialize Redis client for caching only if config is valid
// Uses Upstash Redis for serverless-compatible caching
const redis = hasValidRedisConfig
  ? new Redis({
      url: redisConfig.url,
      token: redisConfig.token,
    })
  : null

// For development without Redis, use in-memory cache fallback
class MemoryCache {
  private cache = new Map<string, { value: string; expires: number }>()

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + 24 * 60 * 60 * 1000, // Default 24 hour expiry
    })
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + seconds * 1000,
    })
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key)
    const newValue = current ? parseInt(current) + 1 : 1
    await this.set(key, newValue.toString())
    return newValue
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.cache.get(key)
    if (!item) return 0

    this.cache.set(key, {
      ...item,
      expires: Date.now() + seconds * 1000,
    })
    return 1
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0
    for (const key of keys) {
      if (this.cache.delete(key)) count++
    }
    return count
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'))
    return Array.from(this.cache.keys()).filter((key) => regex.test(key))
  }

  // Clean up expired entries periodically
  private cleanup() {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key)
      }
    }
  }
}

// Use memory cache in development if Redis is not available
let redisClient: Redis | MemoryCache

if (app.nodeEnv === 'development' && !hasValidRedisConfig) {
  console.log('Using in-memory cache for development (Redis not configured)')
  const memoryCache = new MemoryCache()

  // Clean up expired entries using configured interval
  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      ;(memoryCache as any).cleanup()
    }, redisConfig.memoryCacheCleanupInterval)
  }

  redisClient = memoryCache
} else if (hasValidRedisConfig && redis) {
  console.log('Using Upstash Redis for caching')
  redisClient = redis
} else {
  console.log('Using in-memory cache fallback (Redis unavailable)')
  const memoryCache = new MemoryCache()

  // Clean up expired entries using configured interval
  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      ;(memoryCache as any).cleanup()
    }, redisConfig.memoryCacheCleanupInterval)
  }

  redisClient = memoryCache
}

export const isRedisConfigured = Boolean(hasValidRedisConfig);
export { redisClient as redis }
