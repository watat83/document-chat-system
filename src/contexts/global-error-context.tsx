'use client'

import React, { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'
import { useNotifications } from '@/contexts/notification-context'
import { EnhancedError, ErrorSeverity, ErrorCategory } from '@/hooks/use-error-handler'
import { useCircuitBreakerStats, useAllCircuitBreakers } from '@/hooks/use-circuit-breaker'
import { useNetworkStatus, NetworkQuality } from '@/hooks/use-network-status'

// Global error state
export interface GlobalErrorState {
  // Current errors
  activeErrors: EnhancedError[]

  // Error history
  errorHistory: EnhancedError[]
  maxHistorySize: number

  // Error correlation
  correlatedErrors: Record<string, EnhancedError[]>

  // System health
  systemHealth: {
    overallStatus: 'healthy' | 'degraded' | 'critical'
    networkQuality: NetworkQuality
    circuitBreakerStatus: Record<string, 'open' | 'closed' | 'half_open'>
    errorRate: number
    lastHealthCheck: Date
  }

  // Recovery state
  recoveryState: {
    isRecovering: boolean
    recoveryProgress: number
    activeRecoveryTasks: string[]
    lastRecoveryAttempt: Date | null
  }

  // Error patterns
  errorPatterns: {
    frequentErrors: Record<string, number>
    errorTrends: Array<{ timestamp: Date; count: number; severity: ErrorSeverity }>
    criticalThreshold: number
    warningThreshold: number
  }
}

// Actions for error state management
export type GlobalErrorAction =
  | { type: 'ADD_ERROR'; payload: EnhancedError }
  | { type: 'REMOVE_ERROR'; payload: string } // errorId
  | { type: 'CLEAR_ERRORS' }
  | { type: 'UPDATE_SYSTEM_HEALTH'; payload: Partial<GlobalErrorState['systemHealth']> }
  | { type: 'START_RECOVERY'; payload: string[] } // task names
  | { type: 'UPDATE_RECOVERY_PROGRESS'; payload: number }
  | { type: 'COMPLETE_RECOVERY' }
  | { type: 'CORRELATE_ERRORS'; payload: { pattern: string; errors: EnhancedError[] } }
  | { type: 'UPDATE_ERROR_PATTERNS'; payload: Partial<GlobalErrorState['errorPatterns']> }

// Initial state
const initialState: GlobalErrorState = {
  activeErrors: [],
  errorHistory: [],
  maxHistorySize: 100,
  correlatedErrors: {},
  systemHealth: {
    overallStatus: 'healthy',
    networkQuality: NetworkQuality.GOOD,
    circuitBreakerStatus: {},
    errorRate: 0,
    lastHealthCheck: new Date()
  },
  recoveryState: {
    isRecovering: false,
    recoveryProgress: 0,
    activeRecoveryTasks: [],
    lastRecoveryAttempt: null
  },
  errorPatterns: {
    frequentErrors: {},
    errorTrends: [],
    criticalThreshold: 10,
    warningThreshold: 5
  }
}

// Error state reducer
function globalErrorReducer(state: GlobalErrorState, action: GlobalErrorAction): GlobalErrorState {
  switch (action.type) {
    case 'ADD_ERROR': {
      const error = action.payload
      const now = new Date()

      // Add to active errors
      const activeErrors = [...state.activeErrors, error].slice(-20) // Keep last 20 active

      // Add to history
      const errorHistory = [...state.errorHistory, error].slice(-state.maxHistorySize)

      // Update frequent errors count
      const errorKey = `${error.category}_${error.severity}`
      const frequentErrors = {
        ...state.errorPatterns.frequentErrors,
        [errorKey]: (state.errorPatterns.frequentErrors[errorKey] || 0) + 1
      }

      // Add to error trends
      const errorTrends = [
        ...state.errorPatterns.errorTrends,
        { timestamp: now, count: 1, severity: error.severity || ErrorSeverity.MEDIUM }
      ].slice(-50) // Keep last 50 trend points

      // Calculate error rate (errors per hour)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const recentErrors = errorTrends.filter(trend => trend.timestamp > oneHourAgo)
      const errorRate = recentErrors.reduce((sum, trend) => sum + trend.count, 0)

      return {
        ...state,
        activeErrors,
        errorHistory,
        errorPatterns: {
          ...state.errorPatterns,
          frequentErrors,
          errorTrends
        },
        systemHealth: {
          ...state.systemHealth,
          errorRate,
          lastHealthCheck: now
        }
      }
    }

    case 'REMOVE_ERROR': {
      const errorId = action.payload
      return {
        ...state,
        activeErrors: state.activeErrors.filter(error => error.errorId !== errorId)
      }
    }

    case 'CLEAR_ERRORS': {
      return {
        ...state,
        activeErrors: [],
        correlatedErrors: {}
      }
    }

    case 'UPDATE_SYSTEM_HEALTH': {
      const healthUpdate = action.payload
      const newHealth = { ...state.systemHealth, ...healthUpdate, lastHealthCheck: new Date() }

      // Determine overall status based on various factors
      let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy'

      if (newHealth.errorRate > state.errorPatterns.criticalThreshold) {
        overallStatus = 'critical'
      } else if (
        newHealth.errorRate > state.errorPatterns.warningThreshold ||
        newHealth.networkQuality === NetworkQuality.POOR ||
        Object.values(newHealth.circuitBreakerStatus).some(status => status === 'open')
      ) {
        overallStatus = 'degraded'
      }

      return {
        ...state,
        systemHealth: { ...newHealth, overallStatus }
      }
    }

    case 'START_RECOVERY': {
      return {
        ...state,
        recoveryState: {
          isRecovering: true,
          recoveryProgress: 0,
          activeRecoveryTasks: action.payload,
          lastRecoveryAttempt: new Date()
        }
      }
    }

    case 'UPDATE_RECOVERY_PROGRESS': {
      return {
        ...state,
        recoveryState: {
          ...state.recoveryState,
          recoveryProgress: action.payload
        }
      }
    }

    case 'COMPLETE_RECOVERY': {
      return {
        ...state,
        recoveryState: {
          isRecovering: false,
          recoveryProgress: 100,
          activeRecoveryTasks: [],
          lastRecoveryAttempt: state.recoveryState.lastRecoveryAttempt
        },
        activeErrors: [] // Clear active errors after successful recovery
      }
    }

    case 'CORRELATE_ERRORS': {
      const { pattern, errors } = action.payload
      return {
        ...state,
        correlatedErrors: {
          ...state.correlatedErrors,
          [pattern]: errors
        }
      }
    }

    case 'UPDATE_ERROR_PATTERNS': {
      return {
        ...state,
        errorPatterns: {
          ...state.errorPatterns,
          ...action.payload
        }
      }
    }

    default:
      return state
  }
}

// Context type
interface GlobalErrorContextType {
  state: GlobalErrorState

  // Error management
  addError: (error: EnhancedError) => void
  removeError: (errorId: string) => void
  clearErrors: () => void

  // System health
  updateSystemHealth: (health: Partial<GlobalErrorState['systemHealth']>) => void
  getSystemHealthScore: () => number

  // Recovery
  startRecovery: (tasks: string[]) => void
  updateRecoveryProgress: (progress: number) => void
  completeRecovery: () => void

  // Error correlation
  correlateErrors: (pattern: string, errors: EnhancedError[]) => void
  findCorrelatedErrors: (error: EnhancedError) => EnhancedError[]

  // Error patterns
  getErrorTrends: () => GlobalErrorState['errorPatterns']['errorTrends']
  getFrequentErrors: () => Array<{ pattern: string; count: number }>

  // Health monitoring
  isSystemHealthy: () => boolean
  getHealthStatus: () => 'healthy' | 'degraded' | 'critical'
}

// Create context
const GlobalErrorContext = createContext<GlobalErrorContextType | undefined>(undefined)

// Provider component
export function GlobalErrorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(globalErrorReducer, initialState)
  const { quality: networkQuality } = useNetworkStatus({ showNotifications: false })
  const circuitBreakers = useAllCircuitBreakers()
  const { warning: showWarning, error: showError, info: showInfo } = useNotifications()

  // Refs for tracking notifications to prevent spam
  const lastHealthNotificationRef = useRef<Date | null>(null)
  const notificationCooldownRef = useRef<Record<string, Date>>({})

  // Update system health when network or circuit breakers change
  useEffect(() => {
    const circuitBreakerStatus: Record<string, 'open' | 'closed' | 'half_open'> = {}
    Object.entries(circuitBreakers).forEach(([key, stats]) => {
      circuitBreakerStatus[key] = stats.state as 'open' | 'closed' | 'half_open'
    })

    dispatch({
      type: 'UPDATE_SYSTEM_HEALTH',
      payload: {
        networkQuality,
        circuitBreakerStatus
      }
    })
  }, [networkQuality, circuitBreakers])

  // Monitor system health and show notifications
  useEffect(() => {
    const now = new Date()
    const cooldownPeriod = 5 * 60 * 1000 // 5 minutes

    // Check if we should notify about health status
    const shouldNotify = !lastHealthNotificationRef.current ||
      (now.getTime() - lastHealthNotificationRef.current.getTime()) > cooldownPeriod

    if (shouldNotify) {
      switch (state.systemHealth.overallStatus) {
        case 'critical':
          showError(
            'System Health Critical',
            `Multiple services are experiencing issues. Error rate: ${state.systemHealth.errorRate}/hour`,
            { persistent: true }
          )
          lastHealthNotificationRef.current = now
          break

        case 'degraded':
          showWarning(
            'System Performance Degraded',
            'Some services may be slower than usual. We\'re monitoring the situation.',
            { duration: 10000 }
          )
          lastHealthNotificationRef.current = now
          break

        case 'healthy':
          // Only show recovery notification if we were previously unhealthy
          if (lastHealthNotificationRef.current) {
            showInfo(
              'System Health Restored',
              'All services are operating normally.',
              { duration: 5000 }
            )
            lastHealthNotificationRef.current = null
          }
          break
      }
    }
  }, [state.systemHealth.overallStatus, state.systemHealth.errorRate, showError, showWarning, showInfo])

  // Error correlation analysis
  useEffect(() => {
    if (state.activeErrors.length < 2) return

    // Find errors that occurred within a short time window
    const correlationWindow = 60000 // 1 minute
    const now = Date.now()

    const recentErrors = state.activeErrors.filter(error =>
      error.timestamp && (now - error.timestamp.getTime()) < correlationWindow
    )

    if (recentErrors.length >= 3) {
      // Group by category or feature
      const errorsByCategory = recentErrors.reduce((acc, error) => {
        const key = error.category || 'unknown'
        if (!acc[key]) acc[key] = []
        acc[key].push(error)
        return acc
      }, {} as Record<string, EnhancedError[]>)

      // Find categories with multiple errors
      Object.entries(errorsByCategory).forEach(([category, errors]) => {
        if (errors.length >= 2) {
          dispatch({
            type: 'CORRELATE_ERRORS',
            payload: { pattern: `${category}_burst`, errors }
          })
        }
      })
    }
  }, [state.activeErrors])

  // Context methods
  const addError = useCallback((error: EnhancedError) => {
    dispatch({ type: 'ADD_ERROR', payload: error })
  }, [])

  const removeError = useCallback((errorId: string) => {
    dispatch({ type: 'REMOVE_ERROR', payload: errorId })
  }, [])

  const clearErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ERRORS' })
  }, [])

  const updateSystemHealth = useCallback((health: Partial<GlobalErrorState['systemHealth']>) => {
    dispatch({ type: 'UPDATE_SYSTEM_HEALTH', payload: health })
  }, [])

  const getSystemHealthScore = useCallback((): number => {
    const { networkQuality, errorRate, circuitBreakerStatus } = state.systemHealth

    let score = 100

    // Network quality impact
    switch (networkQuality) {
      case NetworkQuality.EXCELLENT: score -= 0; break
      case NetworkQuality.GOOD: score -= 5; break
      case NetworkQuality.FAIR: score -= 15; break
      case NetworkQuality.POOR: score -= 30; break
      case NetworkQuality.OFFLINE: score -= 50; break
    }

    // Error rate impact
    if (errorRate > state.errorPatterns.criticalThreshold) {
      score -= 40
    } else if (errorRate > state.errorPatterns.warningThreshold) {
      score -= 20
    }

    // Circuit breaker impact
    const openBreakers = Object.values(circuitBreakerStatus).filter(status => status === 'open').length
    score -= openBreakers * 15

    return Math.max(0, score)
  }, [state.systemHealth, state.errorPatterns])

  const startRecovery = useCallback((tasks: string[]) => {
    dispatch({ type: 'START_RECOVERY', payload: tasks })
  }, [])

  const updateRecoveryProgress = useCallback((progress: number) => {
    dispatch({ type: 'UPDATE_RECOVERY_PROGRESS', payload: progress })
  }, [])

  const completeRecovery = useCallback(() => {
    dispatch({ type: 'COMPLETE_RECOVERY' })
  }, [])

  const correlateErrors = useCallback((pattern: string, errors: EnhancedError[]) => {
    dispatch({ type: 'CORRELATE_ERRORS', payload: { pattern, errors } })
  }, [])

  const findCorrelatedErrors = useCallback((error: EnhancedError): EnhancedError[] => {
    const patterns = Object.keys(state.correlatedErrors)
    for (const pattern of patterns) {
      const errors = state.correlatedErrors[pattern]
      if (errors.some(e => e.errorId === error.errorId)) {
        return errors.filter(e => e.errorId !== error.errorId)
      }
    }
    return []
  }, [state.correlatedErrors])

  const getErrorTrends = useCallback(() => {
    return state.errorPatterns.errorTrends
  }, [state.errorPatterns.errorTrends])

  const getFrequentErrors = useCallback(() => {
    return Object.entries(state.errorPatterns.frequentErrors)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
  }, [state.errorPatterns.frequentErrors])

  const isSystemHealthy = useCallback(() => {
    return state.systemHealth.overallStatus === 'healthy'
  }, [state.systemHealth.overallStatus])

  const getHealthStatus = useCallback(() => {
    return state.systemHealth.overallStatus
  }, [state.systemHealth.overallStatus])

  const contextValue: GlobalErrorContextType = {
    state,
    addError,
    removeError,
    clearErrors,
    updateSystemHealth,
    getSystemHealthScore,
    startRecovery,
    updateRecoveryProgress,
    completeRecovery,
    correlateErrors,
    findCorrelatedErrors,
    getErrorTrends,
    getFrequentErrors,
    isSystemHealthy,
    getHealthStatus
  }

  return (
    <GlobalErrorContext.Provider value={contextValue}>
      {children}
    </GlobalErrorContext.Provider>
  )
}

// Hook to use the global error context
export function useGlobalError(): GlobalErrorContextType {
  const context = useContext(GlobalErrorContext)
  if (context === undefined) {
    throw new Error('useGlobalError must be used within a GlobalErrorProvider')
  }
  return context
}

// Hook for system health monitoring
export function useSystemHealth() {
  const { state, getSystemHealthScore, isSystemHealthy, getHealthStatus } = useGlobalError()

  return {
    health: state.systemHealth,
    score: getSystemHealthScore(),
    isHealthy: isSystemHealthy(),
    status: getHealthStatus(),
    errorRate: state.systemHealth.errorRate,
    networkQuality: state.systemHealth.networkQuality
  }
}

// Hook for error correlation
export function useErrorCorrelation() {
  const { state, correlateErrors, findCorrelatedErrors } = useGlobalError()

  return {
    correlatedErrors: state.correlatedErrors,
    correlateErrors,
    findCorrelatedErrors
  }
}

// Hook for recovery management
export function useErrorRecovery() {
  const { state, startRecovery, updateRecoveryProgress, completeRecovery } = useGlobalError()

  return {
    recoveryState: state.recoveryState,
    startRecovery,
    updateRecoveryProgress,
    completeRecovery
  }
}
