'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNotifications } from '@/contexts/notification-context'
import { ApiClient, ApiResponse, ApiRequestOptions } from '@/lib/api-client'
import { useNetworkStatus } from './use-network-status'
import { useCircuitBreaker } from './use-circuit-breaker'

// Request states
export enum RequestState {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
  RETRYING = 'retrying',
  OFFLINE = 'offline'
}

// Enhanced API options
export interface UseApiOptions<T> extends ApiRequestOptions {
  // Request configuration
  enabled?: boolean
  immediate?: boolean
  deps?: any[]
  
  // Retry configuration
  enableRetry?: boolean
  maxRetries?: number
  retryDelay?: number | ((attempt: number) => number)
  retryOn?: (error: Error, attempt: number) => boolean
  
  // Cache configuration
  cacheKey?: string
  cacheDuration?: number
  cacheInvalidate?: string[]
  staleWhileRevalidate?: boolean
  
  // Network handling
  offlineFallback?: T
  queueOfflineRequest?: boolean
  networkFirst?: boolean
  
  // Success/Error handlers
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  onRetry?: (attempt: number, error: Error) => void
  
  // Circuit breaker
  circuitBreakerKey?: string
  failureThreshold?: number
  resetTimeout?: number
  
  // Notifications
  showNotifications?: boolean
  successMessage?: string | ((data: T) => string)
  errorMessage?: string | ((error: Error) => string)
  notificationOptions?: {
    persistent?: boolean
    duration?: number
    showRetryButton?: boolean
  }
}

// API hook result
export interface UseApiResult<T> {
  data: T | null
  error: Error | null
  state: RequestState
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  isRetrying: boolean
  isOffline: boolean
  retryCount: number
  execute: (options?: Partial<UseApiOptions<T>>) => Promise<T | null>
  retry: () => Promise<T | null>
  cancel: () => void
  reset: () => void
  invalidateCache: () => void
}

// Cache storage
const cache = new Map<string, {
  data: any
  timestamp: number
  stale?: boolean
}>()

// Offline request queue
const offlineQueue: Array<{
  id: string
  url: string
  options: ApiRequestOptions
  timestamp: number
  resolve: (value: any) => void
  reject: (reason: any) => void
}> = []

/**
 * Enhanced API Hook with Network Resilience
 * 
 * Provides comprehensive network error handling with:
 * - Automatic retry with exponential backoff
 * - Network status awareness
 * - Request queuing for offline scenarios
 * - Circuit breaker pattern
 * - Smart caching with stale-while-revalidate
 * - Error correlation with notifications
 */
export function useApi<T>(
  url: string,
  defaultOptions: UseApiOptions<T> = {}
): UseApiResult<T> {
  // State management
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [state, setState] = useState<RequestState>(RequestState.IDLE)
  const [retryCount, setRetryCount] = useState(0)

  // Refs for managing async operations
  const abortControllerRef = useRef<AbortController | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)
  const currentRequestIdRef = useRef<string>('')

  // Hooks
  const { isOnline, effectiveConnection } = useNetworkStatus()
  const { success: showSuccess, error: showError } = useNotifications()
  const circuitBreaker = useCircuitBreaker(
    defaultOptions.circuitBreakerKey || url,
    {
      failureThreshold: defaultOptions.failureThreshold || 5,
      resetTimeout: defaultOptions.resetTimeout || 60000,
    }
  )

  // API client instance
  const apiClient = useRef(new ApiClient({
    retries: 0, // We handle retries ourselves
    notifyUser: false, // We handle notifications ourselves
  }))

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    
    return () => {
      isMountedRef.current = false
      cancel()
    }
  }, [])

  /**
   * Cancel ongoing request
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    cancel()
    setData(null)
    setError(null)
    setState(RequestState.IDLE)
    setRetryCount(0)
  }, [cancel])

  /**
   * Calculate retry delay
   */
  const calculateRetryDelay = useCallback((attempt: number, options: UseApiOptions<T>): number => {
    const { retryDelay = 1000 } = options
    
    if (typeof retryDelay === 'function') {
      return retryDelay(attempt)
    }
    
    // Exponential backoff with jitter
    const baseDelay = retryDelay
    const maxDelay = 30000 // 30 seconds max
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
    const jitter = Math.random() * 1000 // Up to 1 second jitter
    
    return exponentialDelay + jitter
  }, [])

  /**
   * Check if request should be retried
   */
  const shouldRetry = useCallback((error: Error, attempt: number, options: UseApiOptions<T>): boolean => {
    const {
      enableRetry = true,
      maxRetries = 3,
      retryOn,
    } = options

    if (!enableRetry || attempt >= maxRetries) {
      return false
    }

    // Custom retry logic
    if (retryOn) {
      return retryOn(error, attempt)
    }

    // Default retry logic
    const errorMessage = error.message.toLowerCase()
    
    // Always retry network errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection')
    ) {
      return true
    }

    // Retry server errors (5xx)
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      return true
    }

    // Retry rate limit errors with backoff
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return true
    }

    // Don't retry client errors (4xx) except rate limits
    if (
      errorMessage.includes('400') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('404')
    ) {
      return false
    }

    return true
  }, [])

  /**
   * Get cached data
   */
  const getCachedData = useCallback((cacheKey: string, cacheDuration: number): T | null => {
    const cached = cache.get(cacheKey)
    
    if (!cached) {
      return null
    }

    const age = Date.now() - cached.timestamp
    const isExpired = age > cacheDuration

    if (isExpired && !cached.stale) {
      cache.delete(cacheKey)
      return null
    }

    return cached.data
  }, [])

  /**
   * Set cached data
   */
  const setCachedData = useCallback((cacheKey: string, data: T, stale = false) => {
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      stale,
    })
  }, [])

  /**
   * Invalidate cache
   */
  const invalidateCache = useCallback(() => {
    const { cacheKey, cacheInvalidate = [] } = defaultOptions
    
    if (cacheKey) {
      cache.delete(cacheKey)
    }

    // Invalidate related cache keys
    cacheInvalidate.forEach(key => {
      if (key.includes('*')) {
        // Pattern matching - escape regex characters except *
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*')
        const pattern = new RegExp(escapedKey)
        Array.from(cache.keys()).forEach(cacheKey => {
          if (pattern.test(cacheKey)) {
            cache.delete(cacheKey)
          }
        })
      } else {
        cache.delete(key)
      }
    })
  }, [defaultOptions])

  /**
   * Queue request for offline execution
   */
  const queueOfflineRequest = useCallback((
    url: string,
    options: ApiRequestOptions
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const requestId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      offlineQueue.push({
        id: requestId,
        url,
        options,
        timestamp: Date.now(),
        resolve,
        reject,
      })

      // Show notification
      if (defaultOptions.showNotifications) {
        showSuccess(
          'Request Queued',
          'Your request will be processed when connection is restored.',
          { persistent: true }
        )
      }

      console.log(`Queued offline request: ${requestId}`, { url, options })
    })
  }, [defaultOptions.showNotifications, showSuccess])

  /**
   * Execute API request
   */
  const execute = useCallback(async function execute(overrideOptions: Partial<UseApiOptions<T>> = {}): Promise<T | null> {
    const options = { ...defaultOptions, ...overrideOptions }
    const {
      enabled = true,
      cacheKey,
      cacheDuration = 5 * 60 * 1000, // 5 minutes default
      staleWhileRevalidate = false,
      offlineFallback,
      queueOfflineRequest: shouldQueueOffline = false,
      networkFirst = true,
      showNotifications = true,
      successMessage,
      errorMessage,
      notificationOptions = {},
      onSuccess,
      onError,
      onRetry,
    } = options

    if (!enabled) {
      return null
    }

    // Check circuit breaker
    if (circuitBreaker.isOpen) {
      const error = new Error(`Circuit breaker is open for ${url}. Too many failures.`)
      setError(error)
      setState(RequestState.ERROR)
      
      if (showNotifications) {
        showError(
          'Service Unavailable',
          'This service is temporarily unavailable due to repeated failures. Please try again later.',
          { persistent: true }
        )
      }
      
      return null
    }

    // Cancel any ongoing request
    cancel()

    // Generate unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    currentRequestIdRef.current = requestId

    // Check cache first (unless network first)
    if (cacheKey && !networkFirst) {
      const cachedData = getCachedData(cacheKey, cacheDuration)
      if (cachedData) {
        setData(cachedData)
        setState(RequestState.SUCCESS)
        
        // Revalidate in background if stale
        if (staleWhileRevalidate) {
          const cached = cache.get(cacheKey)
          if (cached && Date.now() - cached.timestamp > cacheDuration / 2) {
            // Mark as stale and revalidate
            setCachedData(cacheKey, cachedData, true)
            // Continue with request to revalidate
          } else {
            return cachedData
          }
        } else {
          return cachedData
        }
      }
    }

    // Check online status
    if (!isOnline) {
      setState(RequestState.OFFLINE)
      
      if (shouldQueueOffline) {
        return queueOfflineRequest(url, options)
      }
      
      if (offlineFallback !== undefined) {
        setData(offlineFallback)
        return offlineFallback
      }
      
      const error = new Error('No internet connection')
      setError(error)
      setState(RequestState.ERROR)
      
      if (showNotifications) {
        showError(
          'Offline',
          'Please check your internet connection and try again.',
          { persistent: true }
        )
      }
      
      return null
    }

    // Start request
    setState(retryCount > 0 ? RequestState.RETRYING : RequestState.LOADING)
    setError(null)

    try {
      // Create abort controller
      abortControllerRef.current = new AbortController()

      // Make request
      const response = await apiClient.current.request<T>(url, {
        ...options,
        signal: abortControllerRef.current.signal,
      })

      // Check if request is still current
      if (currentRequestIdRef.current !== requestId || !isMountedRef.current) {
        return null
      }

      if (response.success && response.data !== undefined) {
        // Success
        circuitBreaker.recordSuccess()
        
        const responseData = response.data
        setData(responseData)
        setState(RequestState.SUCCESS)
        setRetryCount(0)

        // Cache the data
        if (cacheKey) {
          setCachedData(cacheKey, responseData)
        }

        // Show success notification
        if (showNotifications && successMessage) {
          const message = typeof successMessage === 'function' 
            ? successMessage(responseData) 
            : successMessage
          showSuccess('Success', message, notificationOptions)
        }

        // Call success handler
        onSuccess?.(responseData)

        return responseData
      } else {
        // API returned error response
        throw new Error(response.error || 'Request failed')
      }
    } catch (err) {
      // Check if request is still current
      if (currentRequestIdRef.current !== requestId || !isMountedRef.current) {
        return null
      }

      const error = err instanceof Error ? err : new Error('Unknown error')
      
      // Don't retry aborted requests
      if (error.name === 'AbortError') {
        return null
      }

      // Record failure for circuit breaker
      circuitBreaker.recordFailure()

      // Check if should retry
      if (shouldRetry(error, retryCount, options)) {
        setState(RequestState.RETRYING)
        
        // Calculate retry delay
        const delay = calculateRetryDelay(retryCount, options)
        
        // Call retry handler
        onRetry?.(retryCount + 1, error)

        // Show retry notification
        if (showNotifications) {
          showError(
            'Retrying...',
            `Request failed. Retrying in ${Math.round(delay / 1000)} seconds...`,
            { duration: delay }
          )
        }

        // Schedule retry
        return new Promise((resolve) => {
          retryTimeoutRef.current = setTimeout(async () => {
            if (isMountedRef.current) {
              setRetryCount(prev => prev + 1)
              const result = await execute(overrideOptions)
              resolve(result)
            } else {
              resolve(null)
            }
          }, delay)
        })
      } else {
        // No retry - final error
        setError(error)
        setState(RequestState.ERROR)

        // Show error notification
        if (showNotifications) {
          const message = typeof errorMessage === 'function'
            ? errorMessage(error)
            : errorMessage || error.message
          
          showError(
            'Request Failed',
            message,
            {
              ...notificationOptions,
              action: options.enableRetry && retryCount < (options.maxRetries || 3)
                ? {
                    label: 'Retry',
                    onClick: () => retry(),
                  }
                : undefined,
            }
          )
        }

        // Call error handler
        onError?.(error)

        return null
      }
    }
  }, [
    defaultOptions,
    isOnline,
    circuitBreaker,
    cancel,
    getCachedData,
    setCachedData,
    queueOfflineRequest,
    shouldRetry,
    calculateRetryDelay,
    showSuccess,
    showError,
    retryCount,
  ])

  /**
   * Retry the request
   */
  const retry = useCallback(async (): Promise<T | null> => {
    setRetryCount(0)
    circuitBreaker.reset() // Reset circuit breaker for manual retry
    return execute()
  }, [execute, circuitBreaker])

  // Auto-execute on mount if immediate
  useEffect(() => {
    if (defaultOptions.immediate && state === RequestState.IDLE) {
      execute()
    }
  }, []) // Only on mount

  // Re-execute when deps change
  useEffect(() => {
    if (defaultOptions.deps && defaultOptions.immediate) {
      execute()
    }
  }, defaultOptions.deps || [])

  // Process offline queue when coming back online
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      console.log(`Processing ${offlineQueue.length} offline requests`)
      
      // Process queue
      const queue = [...offlineQueue]
      offlineQueue.length = 0 // Clear queue
      
      queue.forEach(async (request) => {
        try {
          const response = await apiClient.current.request(request.url, request.options)
          request.resolve(response)
        } catch (error) {
          request.reject(error)
        }
      })
    }
  }, [isOnline])

  return {
    data,
    error,
    state,
    isLoading: state === RequestState.LOADING,
    isSuccess: state === RequestState.SUCCESS,
    isError: state === RequestState.ERROR,
    isRetrying: state === RequestState.RETRYING,
    isOffline: state === RequestState.OFFLINE,
    retryCount,
    execute,
    retry,
    cancel,
    reset,
    invalidateCache,
  }
}

/**
 * Convenience hooks for common HTTP methods
 */
export function useApiGet<T>(url: string, options?: UseApiOptions<T>) {
  return useApi<T>(url, { ...options, method: 'GET' })
}

export function useApiPost<T>(url: string, data?: any, options?: UseApiOptions<T>) {
  return useApi<T>(url, { ...options, method: 'POST', body: JSON.stringify(data) })
}

export function useApiPut<T>(url: string, data?: any, options?: UseApiOptions<T>) {
  return useApi<T>(url, { ...options, method: 'PUT', body: JSON.stringify(data) })
}

export function useApiPatch<T>(url: string, data?: any, options?: UseApiOptions<T>) {
  return useApi<T>(url, { ...options, method: 'PATCH', body: JSON.stringify(data) })
}

export function useApiDelete<T>(url: string, options?: UseApiOptions<T>) {
  return useApi<T>(url, { ...options, method: 'DELETE' })
}