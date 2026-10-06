import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { redis, isRedisConfigured } from '@/lib/redis'
import { logRateLimitExceeded } from '@/lib/security-monitoring'
import { rateLimit, app } from '@/lib/config/env';

interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Maximum requests per window
  message?: string      // Custom error message
  keyGenerator?: (request: NextRequest) => string // Custom key generator
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetTime: Date
  error?: string
}

// Default configurations for different endpoints
export const rateLimitConfigs = {
  // Aggressive limits for expensive operations
  matchScores: {
    windowMs: rateLimit.matchScores.window,
    maxRequests: app.nodeEnv === 'development' ? 100 : rateLimit.matchScores.max,
    message: 'Too many match score calculations. Please wait before trying again.'
  },

  // Moderate limits for search operations
  search: {
    windowMs: rateLimit.search.window,
    maxRequests: app.nodeEnv === 'development' ? 200 : rateLimit.search.max,
    message: 'Too many search requests. Please wait before trying again.'
  },

  // Standard limits for CRUD operations
  api: {
    windowMs: rateLimit.api.window,
    maxRequests: app.nodeEnv === 'development' ? 1000 : rateLimit.api.max,
    message: 'Too many API requests. Please wait before trying again.'
  },

  // Strict limits for AI operations
  ai: {
    windowMs: rateLimit.ai.window,
    maxRequests: app.nodeEnv === 'development' ? 100 : rateLimit.ai.max,
    message: 'Too many AI requests. Please wait before trying again.'
  },

  // File upload limits
  upload: {
    windowMs: rateLimit.upload.window,
    maxRequests: app.nodeEnv === 'development' ? 50 : rateLimit.upload.max,
    message: 'Too many file uploads. Please wait before trying again.'
  },

  // Strict limits for authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000,   // 15 minutes
    maxRequests: app.nodeEnv === 'development' ? 200 : 20,
    message: 'Too many authentication attempts. Please wait before trying again.'
  },

  // Stricter limits for organization management
  orgManagement: {
    windowMs: 60 * 60 * 1000,   // 1 hour
    maxRequests: 10,             // 10 requests per hour
    message: 'Too many organization management requests. Please wait before trying again.'
  }
} as const

// Generate rate limit key based on IP and user ID
async function generateKey(request: NextRequest, prefix: string): Promise<string> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
            request.headers.get('x-real-ip') ||
            request.headers.get('cf-connecting-ip') ||
            'unknown'

  // Try to get user ID from authorization header or request
  const { userId } = await auth()

  // Combine IP and user ID for more accurate rate limiting
  return `rate_limit:${prefix}:${ip}:${userId}`
}

// Main rate limiting function
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  prefix: string = 'api'
): Promise<RateLimitResult> {
  // Skip rate limiting in development environment
  if (app.nodeEnv === 'development') {
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: new Date(Date.now() + config.windowMs)
    }
  }

  try {
    if (!isRedisConfigured) throw new Error('Redis enforcement is not configured');
    const key = config.keyGenerator ?
                config.keyGenerator(request) :
                await generateKey(request, prefix)

    const window = Math.floor(Date.now() / config.windowMs)
    const windowKey = `${key}:${window}`

    // Get current count for this window
    const current = await redis.incr(windowKey)

    // Set expiration for this window key
    if (current === 1) {
      await redis.expire(windowKey, Math.ceil(config.windowMs / 1000))
    }

    const remaining = Math.max(0, config.maxRequests - current)
    const resetTime = new Date((window + 1) * config.windowMs)

    if (current > config.maxRequests) {
      // Log rate limit exceeded event for security monitoring
      try {
        // We need the request object to log properly, but it's not available here
        // This will be logged in the middleware or API route handler
      } catch (error) {
        console.error('Error logging rate limit event:', error)
      }

      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        resetTime,
        error: config.message || 'Rate limit exceeded'
      }
    }

    return {
      success: true,
      limit: config.maxRequests,
      remaining,
      resetTime
    }

  } catch (error) {
    console.error('Rate limiting error:', error)
    // Reject work when enforcement is unavailable in production.
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime: new Date(Date.now() + config.windowMs),
      error: 'Rate limit service unavailable'
    }
  }
}

// Middleware wrapper for rate limiting
export function withRateLimit(
  config: RateLimitConfig,
  prefix: string = 'api'
) {
  return async function rateLimitMiddleware(
    request: NextRequest,
    handler: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const result = await checkRateLimit(request, config, prefix)

    if (!result.success) {
      const response = NextResponse.json(
        {
          success: false,
          error: result.error || 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          rateLimit: {
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime.toISOString()
          }
        },
        { status: 429 }
      )

      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', result.limit.toString())
      response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
      response.headers.set('X-RateLimit-Reset', result.resetTime.toISOString())
      response.headers.set('Retry-After', Math.ceil(config.windowMs / 1000).toString())

      return response
    }

    // Execute the handler
    const response = await handler()

    // Add rate limit headers to successful responses
    response.headers.set('X-RateLimit-Limit', result.limit.toString())
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
    response.headers.set('X-RateLimit-Reset', result.resetTime.toISOString())

    return response
  }
}

// Helper function for IP-based rate limiting (for public endpoints)
export async function checkIPRateLimit(
  request: NextRequest,
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000
): Promise<RateLimitResult> {
  const config: RateLimitConfig = {
    windowMs,
    maxRequests,
    message: 'Too many requests from this IP address',
    keyGenerator: (req) => {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                req.headers.get('x-real-ip') ||
                req.headers.get('cf-connecting-ip') ||
                'unknown'
      return `rate_limit:ip:${ip}`
    }
  }

  return checkRateLimit(request, config, 'ip')
}

// Helper function for user-based rate limiting
export async function checkUserRateLimit(
  request: NextRequest,
  userId: string,
  maxRequests: number = 60,
  windowMs: number = 15 * 60 * 1000
): Promise<RateLimitResult> {
  const config: RateLimitConfig = {
    windowMs,
    maxRequests,
    message: 'Too many requests from this user account',
    keyGenerator: () => `rate_limit:user:${userId}`
  }

  return checkRateLimit(request, config, 'user')
}

// Helper to get remaining rate limit for a user
// Default export for convenience
export { checkRateLimit as rateLimit }

export async function getRateLimitStatus(
  userId: string,
  prefix: string = 'api',
  windowMs: number = 15 * 60 * 1000
): Promise<{ remaining: number; resetTime: Date } | null> {
  try {
    const window = Math.floor(Date.now() / windowMs)
    const key = `rate_limit:${prefix}:${userId}:${window}`

    const current = await redis.get<number>(key)
    const resetTime = new Date((window + 1) * windowMs)

    if (!current) {
      return { remaining: 100, resetTime } // Default limit
    }

    const remaining = Math.max(0, 100 - Number(current))
    return { remaining, resetTime }

  } catch (error) {
    console.error('Error getting rate limit status:', error)
    return null
  }
}
