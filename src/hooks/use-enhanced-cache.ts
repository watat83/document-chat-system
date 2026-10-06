'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { enhancedCacheManager, EnhancedCacheOptions, EnhancedCacheResult } from '@/lib/cache/enhanced-cache-manager'
import { useGlobalError } from '@/contexts/global-error-context'
import { useErrorHandler } from '@/hooks/use-error-handler'
import { useCircuitBreaker } from '@/hooks/use-circuit-breaker'
import { useNotifications } from '@/contexts/notification-context'

// Hook state for cache operations
interface CacheHookState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  cached: boolean
  performance: {
    duration: number
    cacheHit: boolean
    source: 'cache' | 'network' | 'fallback'
    retryCount: number
  } | null
  warnings: string[]
  degraded: boolean
}

// Hook options extending enhanced cache options
interface UseCacheOptions<T> extends EnhancedCacheOptions {
  // React-specific options
  enabled?: boolean
  refreshInterval?: number
  onSuccess?: (data: T, cached: boolean) => void
  onError?: (error: Error) => void
  onWarning?: (warnings: string[]) => void
  
  // Dependency tracking
  deps?: any[]
  
  // Advanced options
  suspense?: boolean
  keepPreviousData?: boolean
  refetchOnMount?: boolean
  refetchOnWindowFocus?: boolean
}

/**
 * Enhanced Cache Hook
 * 
 * Provides comprehensive caching with error handling, user notifications,
 * and integration with the global error context.
 */
export function useEnhancedCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCacheOptions<T> = {}
): CacheHookState<T> & {
  refetch: () => Promise<void>
  invalidate: () => Promise<void>
  updateCache: (data: T) => Promise<void>
  getHealthMetrics: () => any
} {
  const {
    enabled = true,
    refreshInterval,
    onSuccess,
    onError,
    onWarning,
    deps = [],
    keepPreviousData = false,
    refetchOnMount = true,
    refetchOnWindowFocus = false,
    showErrorToUser = true,
    showLoadingToUser = true,
    circuitBreakerKey,
    ...cacheOptions
  } = options

  // State management
  const [state, setState] = useState<CacheHookState<T>>({
    data: null,
    loading: false,
    error: null,
    cached: false,
    performance: null,
    warnings: [],
    degraded: false
  })

  // Hooks
  const { addError } = useGlobalError()
  const { handleError } = useErrorHandler({ showNotifications: showErrorToUser })
  const { info: showInfo, warning: showWarning, error: showErrorNotification } = useNotifications()
  const circuitBreaker = useCircuitBreaker(
    circuitBreakerKey || `cache:${key}`,
    {
      failureThreshold: 5,
      resetTimeout: 60000,
      showNotifications: showErrorToUser
    }
  )

  // Refs
  const isMountedRef = useRef(true)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastFetchTimeRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    
    return () => {
      isMountedRef.current = false
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [])

  /**
   * Execute cache operation with comprehensive error handling
   */
  const executeCacheOperation = useCallback(async function executeCacheOperation(forceRefresh = false): Promise<void> {
    if (!enabled || !isMountedRef.current) {
      return
    }

    // Check circuit breaker
    if (circuitBreaker.isOpen && !forceRefresh) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: new Error('Service temporarily unavailable due to repeated failures'),
        degraded: true
      }))
      return
    }

    // Don't start new request if one is already in progress
    if (state.loading && !forceRefresh) {
      return
    }

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      warnings: [],
      degraded: false
    }))

    try {
      const result: EnhancedCacheResult<T> = await enhancedCacheManager.withCache(
        key,
        fetcher,
        {
          ...cacheOptions,
          showErrorToUser,
          showLoadingToUser,
          backgroundRefresh: !forceRefresh && state.data !== null,
          staleWhileRevalidate: keepPreviousData,
          circuitBreakerKey: circuitBreaker.isOpen ? undefined : circuitBreakerKey
        }
      )

      if (!isMountedRef.current) return

      // Record success for circuit breaker
      circuitBreaker.recordSuccess()

      // Update state
      setState(prev => ({
        ...prev,
        data: result.data,
        loading: false,
        cached: result.cached,
        performance: result.performance,
        warnings: result.warnings || [],
        degraded: result.degraded || false,
        error: null
      }))

      // Handle warnings
      if (result.warnings && result.warnings.length > 0) {
        onWarning?.(result.warnings)
        
        if (showErrorToUser && result.degraded) {
          showWarning(
            'Performance Notice',
            'Data loaded with degraded performance. Some information may be cached.',
            { duration: 5000 }
          )
        }
      }

      // Handle errors (non-fatal)
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          addError(error)
        })
      }

      // Success callback
      onSuccess?.(result.data, result.cached)
      
      lastFetchTimeRef.current = Date.now()

    } catch (error) {
      if (!isMountedRef.current) return

      const err = error as Error
      
      // Record failure for circuit breaker
      circuitBreaker.recordFailure()

      // Create enhanced error and add to global context
      const enhancedError = handleError(err, {
        feature: 'Cache System',
        metadata: { cacheKey: key, operation: 'fetch' }
      })
      
      addError(enhancedError)

      // Update state
      setState(prev => ({
        ...prev,
        loading: false,
        error: err,
        degraded: true,
        data: keepPreviousData ? prev.data : null
      }))

      // Error callback
      onError?.(err)

      // User notification (if not handled by circuit breaker)
      if (showErrorToUser && !circuitBreaker.isOpen) {
        showErrorNotification(
          'Data Loading Failed',
          options.userFriendlyErrorMessage || 'Unable to load data. Please try again.',
          {
            persistent: true,
            action: {
              label: 'Retry',
              onClick: () => executeCacheOperation(true)
            }
          }
        )
      }
    }
  }, [
    enabled,
    key,
    fetcher,
    cacheOptions,
    showErrorToUser,
    showLoadingToUser,
    keepPreviousData,
    circuitBreakerKey,
    circuitBreaker,
    state.loading,
    state.data,
    addError,
    handleError,
    onSuccess,
    onError,
    onWarning,
    showWarning,
    showErrorNotification,
    options.userFriendlyErrorMessage
  ])

  /**
   * Refetch data manually
   */
  const refetch = useCallback(async (): Promise<void> => {
    await executeCacheOperation(true)
  }, [executeCacheOperation])

  /**
   * Invalidate cache and refetch
   */
  const invalidate = useCallback(async (): Promise<void> => {
    await enhancedCacheManager.invalidate(key, cacheOptions)
    await executeCacheOperation(true)
  }, [key, cacheOptions, executeCacheOperation])

  /**
   * Update cache with new data
   */
  const updateCache = useCallback(async (data: T): Promise<void> => {
    await enhancedCacheManager.set(key, data, cacheOptions)
    setState(prev => ({
      ...prev,
      data,
      cached: true,
      error: null
    }))
  }, [key, cacheOptions])

  /**
   * Get cache health metrics
   */
  const getHealthMetrics = useCallback(() => {
    return enhancedCacheManager.getHealthMetrics()
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    if (refetchOnMount && enabled) {
      executeCacheOperation()
    }
  }, [refetchOnMount, enabled]) // Intentionally minimal deps

  // Refetch when dependencies change
  useEffect(() => {
    if (enabled && deps.length > 0) {
      // Debounce dependency changes
      const timer = setTimeout(() => {
        executeCacheOperation()
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [enabled, ...deps])

  // Set up refresh interval
  useEffect(() => {
    if (refreshInterval && enabled && refreshInterval > 0) {
      refreshTimerRef.current = setInterval(() => {
        if (!state.loading) {
          executeCacheOperation()
        }
      }, refreshInterval)

      return () => {
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current)
        }
      }
    }
  }, [refreshInterval, enabled, state.loading, executeCacheOperation])

  // Window focus refetch
  useEffect(() => {
    if (!refetchOnWindowFocus || !enabled) return

    const handleFocus = () => {
      // Only refetch if data is older than 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      if (lastFetchTimeRef.current < fiveMinutesAgo) {
        executeCacheOperation()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refetchOnWindowFocus, enabled, executeCacheOperation])

  return {
    ...state,
    refetch,
    invalidate,
    updateCache,
    getHealthMetrics
  }
}

/**
 * Simple cache hook for basic use cases
 */
export function useSimpleCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: Partial<UseCacheOptions<T>> = {}
) {
  const { data, loading, error, refetch } = useEnhancedCache(key, fetcher, {
    silentFail: true,
    showErrorToUser: false,
    showLoadingToUser: false,
    ...options
  })

  return { data, loading, error, refetch }
}

/**
 * Cache hook with automatic invalidation based on tags
 */
export function useTaggedCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  tags: string[],
  options: Partial<UseCacheOptions<T>> = {}
) {
  return useEnhancedCache(key, fetcher, {
    ...options,
    tags,
    // Automatic invalidation could be implemented here
  })
}

/**
 * Hook for monitoring cache health across the application
 */
export function useCacheHealth() {
  const [health, setHealth] = useState(enhancedCacheManager.getHealthMetrics())

  useEffect(() => {
    const updateHealth = () => {
      setHealth(enhancedCacheManager.getHealthMetrics())
    }

    const interval = setInterval(updateHealth, 5000) // Update every 5 seconds
    return () => clearInterval(interval)
  }, [])

  return health
}