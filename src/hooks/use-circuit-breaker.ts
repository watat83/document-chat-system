'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useNotifications } from '@/contexts/notification-context'

// Circuit breaker states
export enum CircuitBreakerState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Blocking requests due to failures
  HALF_OPEN = 'half_open' // Testing if service has recovered
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number      // Number of failures before opening
  resetTimeout: number          // Time to wait before moving to half-open (ms)
  successThreshold: number      // Successes needed in half-open to close
  monitoringWindow: number      // Time window for failure counting (ms)
  showNotifications: boolean    // Whether to show user notifications
}

// Circuit breaker statistics
export interface CircuitBreakerStats {
  state: CircuitBreakerState
  failures: number
  successes: number
  attempts: number
  lastFailureTime: Date | null
  lastSuccessTime: Date | null
  nextRetryTime: Date | null
  isOpen: boolean
  isHalfOpen: boolean
  isClosed: boolean
}

// Default configuration
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  successThreshold: 3,
  monitoringWindow: 300000, // 5 minutes
  showNotifications: true
}

// Global circuit breaker registry to share state across components
const circuitBreakerRegistry = new Map<string, {
  config: CircuitBreakerConfig
  stats: CircuitBreakerStats
  listeners: Set<(stats: CircuitBreakerStats) => void>
  timeouts: {
    resetTimeout?: NodeJS.Timeout
    cleanupTimeout?: NodeJS.Timeout
  }
}>()

/**
 * Circuit Breaker Hook
 * 
 * Implements the circuit breaker pattern for resilient error handling:
 * - CLOSED: Normal operation, tracks failures
 * - OPEN: Fails fast, blocks requests for resetTimeout
 * - HALF_OPEN: Allows limited requests to test recovery
 * 
 * Provides automatic recovery and user notifications about service status.
 */
export function useCircuitBreaker(
  serviceKey: string,
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreakerStats & {
  recordSuccess: () => void
  recordFailure: () => void
  reset: () => void
  forceOpen: () => void
  forceClose: () => void
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const { warning: showWarning, info: showInfo, success: showSuccess } = useNotifications()
  
  // Get or create circuit breaker for this service
  const getCircuitBreaker = useCallback(() => {
    if (!circuitBreakerRegistry.has(serviceKey)) {
      const initialStats: CircuitBreakerStats = {
        state: CircuitBreakerState.CLOSED,
        failures: 0,
        successes: 0,
        attempts: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        nextRetryTime: null,
        isOpen: false,
        isHalfOpen: false,
        isClosed: true
      }

      circuitBreakerRegistry.set(serviceKey, {
        config: finalConfig,
        stats: initialStats,
        listeners: new Set(),
        timeouts: {}
      })
    }

    return circuitBreakerRegistry.get(serviceKey)!
  }, [serviceKey, finalConfig])

  const [stats, setStats] = useState<CircuitBreakerStats>(() => getCircuitBreaker().stats)

  /**
   * Notify all listeners of state changes
   */
  const notifyListeners = useCallback((newStats: CircuitBreakerStats) => {
    const breaker = circuitBreakerRegistry.get(serviceKey)
    if (breaker) {
      breaker.stats = newStats
      breaker.listeners.forEach(listener => listener(newStats))
    }
  }, [serviceKey])

  /**
   * Update circuit breaker state
   */
  const updateStats = useCallback((updater: (prev: CircuitBreakerStats) => CircuitBreakerStats) => {
    const breaker = getCircuitBreaker()
    const newStats = updater(breaker.stats)
    
    // Update derived boolean properties
    const finalStats = {
      ...newStats,
      isOpen: newStats.state === CircuitBreakerState.OPEN,
      isHalfOpen: newStats.state === CircuitBreakerState.HALF_OPEN,
      isClosed: newStats.state === CircuitBreakerState.CLOSED
    }

    setStats(finalStats)
    notifyListeners(finalStats)
    
    return finalStats
  }, [getCircuitBreaker, notifyListeners])

  /**
   * Transition to OPEN state
   */
  const transitionToOpen = useCallback((currentStats: CircuitBreakerStats) => {
    const breaker = getCircuitBreaker()
    const now = new Date()
    const nextRetryTime = new Date(now.getTime() + breaker.config.resetTimeout)

    console.log(`Circuit breaker OPEN for ${serviceKey}. Next retry: ${nextRetryTime.toISOString()}`)

    // Show user notification
    if (breaker.config.showNotifications) {
      showWarning(
        'Service Temporarily Unavailable',
        `${serviceKey} is experiencing issues. Automatic retry in ${Math.round(breaker.config.resetTimeout / 1000)}s.`,
        { persistent: true }
      )
    }

    // Clear any existing timeout
    if (breaker.timeouts.resetTimeout) {
      clearTimeout(breaker.timeouts.resetTimeout)
    }

    // Set timeout to transition to half-open
    breaker.timeouts.resetTimeout = setTimeout(() => {
      updateStats(prev => ({
        ...prev,
        state: CircuitBreakerState.HALF_OPEN,
        nextRetryTime: null
      }))

      console.log(`Circuit breaker HALF_OPEN for ${serviceKey}. Testing recovery...`)

      if (breaker.config.showNotifications) {
        showInfo(
          'Testing Service Recovery',
          `Checking if ${serviceKey} has recovered...`,
          { duration: 3000 }
        )
      }
    }, breaker.config.resetTimeout)

    return updateStats(prev => ({
      ...prev,
      state: CircuitBreakerState.OPEN,
      nextRetryTime
    }))
  }, [getCircuitBreaker, updateStats, serviceKey, showWarning, showInfo])

  /**
   * Transition to CLOSED state
   */
  const transitionToClosed = useCallback(() => {
    const breaker = getCircuitBreaker()
    
    console.log(`Circuit breaker CLOSED for ${serviceKey}. Service recovered.`)

    // Show success notification
    if (breaker.config.showNotifications) {
      showSuccess(
        'Service Restored',
        `${serviceKey} is working normally again.`,
        { duration: 3000 }
      )
    }

    // Clear timeouts
    if (breaker.timeouts.resetTimeout) {
      clearTimeout(breaker.timeouts.resetTimeout)
      breaker.timeouts.resetTimeout = undefined
    }

    return updateStats(prev => ({
      ...prev,
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      successes: 0,
      nextRetryTime: null
    }))
  }, [getCircuitBreaker, updateStats, serviceKey, showSuccess])

  /**
   * Check if failures are within monitoring window
   */
  const isWithinMonitoringWindow = useCallback((timestamp: Date | null): boolean => {
    if (!timestamp) return false
    const breaker = getCircuitBreaker()
    const now = Date.now()
    const windowStart = now - breaker.config.monitoringWindow
    return timestamp.getTime() >= windowStart
  }, [getCircuitBreaker])

  /**
   * Record a successful operation
   */
  const recordSuccess = useCallback(() => {
    updateStats(prev => {
      const newStats = {
        ...prev,
        successes: prev.successes + 1,
        attempts: prev.attempts + 1,
        lastSuccessTime: new Date()
      }

      // State transitions based on success
      const breaker = getCircuitBreaker()
      
      if (prev.state === CircuitBreakerState.HALF_OPEN) {
        // Check if we have enough successes to close
        if (newStats.successes >= breaker.config.successThreshold) {
          return {
            ...newStats,
            state: CircuitBreakerState.CLOSED,
            failures: 0,
            successes: 0,
            nextRetryTime: null
          }
        }
      }

      return newStats
    })

    // Handle state change notifications
    const currentStats = stats
    if (currentStats.state === CircuitBreakerState.HALF_OPEN) {
      const breaker = getCircuitBreaker()
      if (currentStats.successes + 1 >= breaker.config.successThreshold) {
        transitionToClosed()
      }
    }
  }, [updateStats, getCircuitBreaker, stats, transitionToClosed])

  /**
   * Record a failed operation
   */
  const recordFailure = useCallback(() => {
    updateStats(prev => {
      const now = new Date()
      const newStats = {
        ...prev,
        failures: prev.failures + 1,
        attempts: prev.attempts + 1,
        lastFailureTime: now
      }

      // State transitions based on failure
      const breaker = getCircuitBreaker()
      
      if (prev.state === CircuitBreakerState.CLOSED) {
        // Check if we should open due to too many failures
        if (newStats.failures >= breaker.config.failureThreshold) {
          // Only count failures within the monitoring window
          if (isWithinMonitoringWindow(prev.lastFailureTime)) {
            return {
              ...newStats,
              state: CircuitBreakerState.OPEN,
              nextRetryTime: new Date(now.getTime() + breaker.config.resetTimeout)
            }
          }
        }
      } else if (prev.state === CircuitBreakerState.HALF_OPEN) {
        // Any failure in half-open state returns to open
        return {
          ...newStats,
          state: CircuitBreakerState.OPEN,
          successes: 0, // Reset success count
          nextRetryTime: new Date(now.getTime() + breaker.config.resetTimeout)
        }
      }

      return newStats
    })

    // Handle state change to open
    const currentStats = stats
    const breaker = getCircuitBreaker()
    
    if (currentStats.state === CircuitBreakerState.CLOSED && 
        currentStats.failures + 1 >= breaker.config.failureThreshold) {
      transitionToOpen(currentStats)
    } else if (currentStats.state === CircuitBreakerState.HALF_OPEN) {
      transitionToOpen(currentStats)
    }
  }, [updateStats, getCircuitBreaker, stats, isWithinMonitoringWindow, transitionToOpen])

  /**
   * Manually reset the circuit breaker
   */
  const reset = useCallback(() => {
    const breaker = getCircuitBreaker()
    
    // Clear timeouts
    if (breaker.timeouts.resetTimeout) {
      clearTimeout(breaker.timeouts.resetTimeout)
      breaker.timeouts.resetTimeout = undefined
    }

    updateStats(prev => ({
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      successes: 0,
      attempts: prev.attempts,
      lastFailureTime: prev.lastFailureTime,
      lastSuccessTime: new Date(),
      nextRetryTime: null,
      isOpen: false,
      isHalfOpen: false,
      isClosed: true
    }))

    console.log(`Circuit breaker manually reset for ${serviceKey}`)
  }, [getCircuitBreaker, updateStats, serviceKey])

  /**
   * Force the circuit breaker to open
   */
  const forceOpen = useCallback(() => {
    const currentStats = stats
    transitionToOpen(currentStats)
    console.log(`Circuit breaker manually opened for ${serviceKey}`)
  }, [stats, transitionToOpen, serviceKey])

  /**
   * Force the circuit breaker to close
   */
  const forceClose = useCallback(() => {
    transitionToClosed()
    console.log(`Circuit breaker manually closed for ${serviceKey}`)
  }, [transitionToClosed, serviceKey])

  // Set up listener for shared state
  useEffect(() => {
    const breaker = getCircuitBreaker()
    
    const handleStatsChange = (newStats: CircuitBreakerStats) => {
      setStats(newStats)
    }

    breaker.listeners.add(handleStatsChange)

    return () => {
      breaker.listeners.delete(handleStatsChange)
      
      // Clean up if no more listeners
      if (breaker.listeners.size === 0) {
        if (breaker.timeouts.resetTimeout) {
          clearTimeout(breaker.timeouts.resetTimeout)
        }
        if (breaker.timeouts.cleanupTimeout) {
          clearTimeout(breaker.timeouts.cleanupTimeout)
        }
        circuitBreakerRegistry.delete(serviceKey)
      }
    }
  }, [getCircuitBreaker, serviceKey])

  // Periodic cleanup of old failure records
  useEffect(() => {
    const breaker = getCircuitBreaker()
    
    breaker.timeouts.cleanupTimeout = setInterval(() => {
      if (stats.state === CircuitBreakerState.CLOSED && stats.lastFailureTime) {
        if (!isWithinMonitoringWindow(stats.lastFailureTime)) {
          updateStats(prev => ({
            ...prev,
            failures: 0
          }))
        }
      }
    }, breaker.config.monitoringWindow)

    return () => {
      if (breaker.timeouts.cleanupTimeout) {
        clearInterval(breaker.timeouts.cleanupTimeout)
      }
    }
  }, [getCircuitBreaker, stats, isWithinMonitoringWindow, updateStats])

  return {
    ...stats,
    recordSuccess,
    recordFailure,
    reset,
    forceOpen,
    forceClose
  }
}

/**
 * Hook to get circuit breaker statistics for monitoring
 */
export function useCircuitBreakerStats(serviceKey: string): CircuitBreakerStats | null {
  const subscribe = useCallback((onChange: () => void) => {
    const breaker = circuitBreakerRegistry.get(serviceKey)
    if (!breaker) return () => {}
    breaker.listeners.add(onChange)
    return () => { breaker.listeners.delete(onChange) }
  }, [serviceKey])
  const getSnapshot = useCallback(() => circuitBreakerRegistry.get(serviceKey)?.stats ?? null, [serviceKey])
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

/**
 * Hook to get all circuit breaker states for monitoring dashboard
 */
export function useAllCircuitBreakers(): Record<string, CircuitBreakerStats> {
  const [allStats, setAllStats] = useState<Record<string, CircuitBreakerStats>>({})

  useEffect(() => {
    const updateAllStats = () => {
      const stats: Record<string, CircuitBreakerStats> = {}
      circuitBreakerRegistry.forEach((breaker, key) => {
        stats[key] = breaker.stats
      })
      setAllStats(stats)
    }

    // Initial load
    updateAllStats()

    // Set up listeners for all circuit breakers
    const listeners = new Map<string, (stats: CircuitBreakerStats) => void>()
    
    circuitBreakerRegistry.forEach((breaker, key) => {
      const listener = () => updateAllStats()
      listeners.set(key, listener)
      breaker.listeners.add(listener)
    })

    // Poll for new circuit breakers
    const interval = setInterval(updateAllStats, 5000)

    return () => {
      clearInterval(interval)
      listeners.forEach((listener, key) => {
        const breaker = circuitBreakerRegistry.get(key)
        if (breaker) {
          breaker.listeners.delete(listener)
        }
      })
    }
  }, [])

  return allStats
}