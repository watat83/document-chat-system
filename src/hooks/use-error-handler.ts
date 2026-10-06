'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useNotifications } from '@/contexts/notification-context'

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error categories for better handling
export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  PERFORMANCE = 'performance',
  DATA_INTEGRITY = 'data_integrity',
  EXTERNAL_SERVICE = 'external_service',
  USER_INPUT = 'user_input',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

// Enhanced error interface
export interface EnhancedError extends Error {
  errorId?: string
  severity?: ErrorSeverity
  category?: ErrorCategory
  feature?: string
  userMessage?: string
  technicalDetails?: any
  retryable?: boolean
  timestamp?: Date
  userId?: string
  organizationId?: string
  metadata?: Record<string, any>
}

// Error handler configuration
interface ErrorHandlerConfig {
  showNotifications?: boolean
  logToConsole?: boolean
  reportToService?: boolean
  trackMetrics?: boolean
  maxNotificationsPerMinute?: number
}

// Error notification options
interface ErrorNotificationOptions {
  title?: string
  message?: string
  persistent?: boolean
  showRetryButton?: boolean
  onRetry?: () => void
  suppressDuplicates?: boolean
}

/**
 * Enhanced Error Handler Hook
 *
 * Provides comprehensive error handling with:
 * - Integration with notification system
 * - Error categorization and severity assessment
 * - Automatic retry suggestions
 * - User-friendly messaging
 * - Error tracking and metrics
 */
export function useErrorHandler(config: ErrorHandlerConfig = {}) {
  const {
    showNotifications = true,
    logToConsole = true,
    reportToService = true,
    trackMetrics = true,
    maxNotificationsPerMinute = 10
  } = config

  const { error: showErrorNotification, warning: showWarningNotification, info: showInfoNotification } = useNotifications()

  // Track notifications to prevent spam
  const notificationCountRef = useRef(0)
  const lastResetRef = useRef(0)

  // Reset notification count every minute
  useEffect(() => {
    const interval = setInterval(() => {
      notificationCountRef.current = 0
      lastResetRef.current = Date.now()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  /**
   * Categorize error based on error message and context
   */
  const categorizeError = useCallback((error: Error): ErrorCategory => {
    const message = error.message.toLowerCase()

    if (message.includes('fetch') || message.includes('network') || message.includes('connection')) {
      return ErrorCategory.NETWORK
    }
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return ErrorCategory.AUTHENTICATION
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return ErrorCategory.AUTHORIZATION
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorCategory.VALIDATION
    }
    if (message.includes('timeout') || message.includes('slow') || message.includes('performance')) {
      return ErrorCategory.PERFORMANCE
    }
    if (message.includes('corrupt') || message.includes('integrity') || message.includes('checksum')) {
      return ErrorCategory.DATA_INTEGRITY
    }
    if (message.includes('api') || message.includes('service') || message.includes('external')) {
      return ErrorCategory.EXTERNAL_SERVICE
    }
    if (message.includes('input') || message.includes('format') || message.includes('parse')) {
      return ErrorCategory.USER_INPUT
    }
    if (message.includes('system') || message.includes('internal') || message.includes('server')) {
      return ErrorCategory.SYSTEM
    }

    return ErrorCategory.UNKNOWN
  }, [])

  /**
   * Determine error severity based on category and context
   */
  const assessSeverity = useCallback((error: Error, category: ErrorCategory): ErrorSeverity => {
    switch (category) {
      case ErrorCategory.DATA_INTEGRITY:
        return ErrorSeverity.CRITICAL

      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
      case ErrorCategory.SYSTEM:
        return ErrorSeverity.HIGH

      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
      case ErrorCategory.PERFORMANCE:
        return ErrorSeverity.MEDIUM

      case ErrorCategory.VALIDATION:
      case ErrorCategory.USER_INPUT:
        return ErrorSeverity.LOW

      default:
        return ErrorSeverity.MEDIUM
    }
  }, [])

  /**
   * Generate user-friendly error message
   */
  const generateUserMessage = useCallback((error: Error, category: ErrorCategory): string => {
    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Connection problem. Please check your internet and try again.'

      case ErrorCategory.AUTHENTICATION:
        return 'Your session has expired. Please sign in again.'

      case ErrorCategory.AUTHORIZATION:
        return 'You don\'t have permission to perform this action.'

      case ErrorCategory.VALIDATION:
        return 'Please check your input and try again.'

      case ErrorCategory.PERFORMANCE:
        return 'The request is taking longer than expected. Please try again.'

      case ErrorCategory.DATA_INTEGRITY:
        return 'Data validation failed. Please contact support.'

      case ErrorCategory.EXTERNAL_SERVICE:
        return 'External service is temporarily unavailable. Please try again later.'

      case ErrorCategory.USER_INPUT:
        return 'Invalid input provided. Please check and try again.'

      case ErrorCategory.SYSTEM:
        return 'System error occurred. Our team has been notified.'

      default:
        return 'An unexpected error occurred. Please try again or contact support.'
    }
  }, [])

  /**
   * Determine if error is retryable
   */
  const isRetryable = useCallback((category: ErrorCategory): boolean => {
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.PERFORMANCE:
      case ErrorCategory.EXTERNAL_SERVICE:
      case ErrorCategory.SYSTEM:
        return true

      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
      case ErrorCategory.DATA_INTEGRITY:
        return false

      case ErrorCategory.VALIDATION:
      case ErrorCategory.USER_INPUT:
        return false

      default:
        return true
    }
  }, [])

  /**
   * Log error to console with enhanced formatting
   */
  const logError = useCallback((enhancedError: EnhancedError) => {
    if (!logToConsole) return

    const logLevel = enhancedError.severity === ErrorSeverity.CRITICAL ? 'error' :
                    enhancedError.severity === ErrorSeverity.HIGH ? 'error' :
                    enhancedError.severity === ErrorSeverity.MEDIUM ? 'warn' : 'log'

    console.group(`🚨 Error Handler - ${enhancedError.severity?.toUpperCase()}`)
    console[logLevel]('Error:', enhancedError.message)
    console.table({
      'Error ID': enhancedError.errorId,
      'Category': enhancedError.category,
      'Severity': enhancedError.severity,
      'Feature': enhancedError.feature,
      'Retryable': enhancedError.retryable,
      'Timestamp': enhancedError.timestamp?.toISOString(),
    })

    if (enhancedError.technicalDetails) {
      console.log('Technical Details:', enhancedError.technicalDetails)
    }

    if (enhancedError.stack) {
      console.log('Stack Trace:', enhancedError.stack)
    }

    console.groupEnd()
  }, [logToConsole])

  /**
   * Report error to external service
   */
  const reportError = useCallback(async (enhancedError: EnhancedError) => {
    if (!reportToService) return

    try {
      // TODO: Integrate with error tracking service (Sentry, LogRocket, etc.)
      const errorReport = {
        errorId: enhancedError.errorId,
        message: enhancedError.message,
        stack: enhancedError.stack,
        category: enhancedError.category,
        severity: enhancedError.severity,
        feature: enhancedError.feature,
        userMessage: enhancedError.userMessage,
        timestamp: enhancedError.timestamp?.toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        userId: enhancedError.userId,
        organizationId: enhancedError.organizationId,
        metadata: enhancedError.metadata,
      }

      // In development, just log to console
      if (process.env.NODE_ENV === 'development') {
        console.log('Error Report (would be sent to service):', errorReport)
      } else {
        // Production: Send to actual error tracking service
        // await errorTrackingService.captureException(enhancedError, errorReport)
      }
    } catch (reportingError) {
      console.warn('Failed to report error:', reportingError)
    }
  }, [reportToService])

  /**
   * Track error metrics
   */
  const trackErrorMetrics = useCallback((enhancedError: EnhancedError) => {
    if (!trackMetrics) return

    try {
      // TODO: Integrate with analytics service
      const metrics = {
        event: 'error_occurred',
        properties: {
          error_id: enhancedError.errorId,
          error_category: enhancedError.category,
          error_severity: enhancedError.severity,
          feature: enhancedError.feature,
          retryable: enhancedError.retryable,
          timestamp: enhancedError.timestamp?.getTime(),
        }
      }

      // In development, just log
      if (process.env.NODE_ENV === 'development') {
        console.log('Error Metrics (would be tracked):', metrics)
      } else {
        // Production: Send to analytics service
        // analytics.track(metrics.event, metrics.properties)
      }
    } catch (metricsError) {
      console.warn('Failed to track error metrics:', metricsError)
    }
  }, [trackMetrics])

  /**
   * Get notification title based on error
   */
  const getNotificationTitle = useCallback((error: EnhancedError): string => {
    switch (error.category) {
      case ErrorCategory.NETWORK:
        return 'Connection Issue'
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication Required'
      case ErrorCategory.AUTHORIZATION:
        return 'Access Denied'
      case ErrorCategory.VALIDATION:
        return 'Input Error'
      case ErrorCategory.PERFORMANCE:
        return 'Performance Issue'
      case ErrorCategory.DATA_INTEGRITY:
        return 'Data Error'
      case ErrorCategory.EXTERNAL_SERVICE:
        return 'Service Unavailable'
      case ErrorCategory.USER_INPUT:
        return 'Invalid Input'
      case ErrorCategory.SYSTEM:
        return 'System Error'
      default:
        return error.feature ? `${error.feature} Error` : 'Error Occurred'
    }
  }, [])


  /**
   * Show error notification to user
   */
  const showNotification = useCallback((
    enhancedError: EnhancedError,
    options: ErrorNotificationOptions = {}
  ) => {
    if (!showNotifications) return

    // Check notification rate limiting
    if (notificationCountRef.current >= maxNotificationsPerMinute) {
      console.warn('Error notification rate limit exceeded')
      return
    }

    notificationCountRef.current++

    const {
      title = getNotificationTitle(enhancedError),
      message = enhancedError.userMessage || enhancedError.message,
      persistent = enhancedError.severity === ErrorSeverity.CRITICAL,
      showRetryButton = enhancedError.retryable && options.onRetry,
      onRetry,
      suppressDuplicates = true
    } = options

    const notificationOptions = {
      persistent,
      action: showRetryButton && onRetry ? {
        label: 'Retry',
        onClick: onRetry
      } : undefined
    }

    // Show notification based on severity
    switch (enhancedError.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        showErrorNotification(title, message, notificationOptions)
        break

      case ErrorSeverity.MEDIUM:
        showWarningNotification(title, message, notificationOptions)
        break

      case ErrorSeverity.LOW:
        showInfoNotification(title, message, notificationOptions)
        break

      default:
        showErrorNotification(title, message, notificationOptions)
    }
  }, [showNotifications, maxNotificationsPerMinute, showErrorNotification, showWarningNotification, showInfoNotification])

  /**
   * Main error handling function
   */
  const handleError = useCallback((
    error: Error,
    context?: {
      feature?: string
      userId?: string
      organizationId?: string
      metadata?: Record<string, any>
    },
    notificationOptions?: ErrorNotificationOptions
  ) => {
    // Generate unique error ID
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Categorize and assess the error
    const category = categorizeError(error)
    const severity = assessSeverity(error, category)
    const userMessage = generateUserMessage(error, category)
    const retryable = isRetryable(category)

    // Create enhanced error object
    const enhancedError: EnhancedError = {
      ...error,
      errorId,
      severity,
      category,
      feature: context?.feature,
      userMessage,
      retryable,
      timestamp: new Date(),
      userId: context?.userId,
      organizationId: context?.organizationId,
      metadata: context?.metadata,
    }

    // Process the error
    logError(enhancedError)
    reportError(enhancedError)
    trackErrorMetrics(enhancedError)
    showNotification(enhancedError, notificationOptions)

    return enhancedError
  }, [
    categorizeError,
    assessSeverity,
    generateUserMessage,
    isRetryable,
    logError,
    reportError,
    trackErrorMetrics,
    showNotification
  ])

  /**
   * Handle network errors specifically
   */
  const handleNetworkError = useCallback((
    error: Error,
    context?: { feature?: string; onRetry?: () => void }
  ) => {
    return handleError(error, { feature: context?.feature }, {
      showRetryButton: true,
      onRetry: context?.onRetry
    })
  }, [handleError])

  /**
   * Handle authentication errors specifically
   */
  const handleAuthError = useCallback((
    error: Error,
    context?: { feature?: string; redirectToLogin?: boolean }
  ) => {
    const enhancedError = handleError(error, { feature: context?.feature })

    // Optionally redirect to login
    if (context?.redirectToLogin) {
      setTimeout(() => {
        window.location.href = '/auth/signin'
      }, 2000)
    }

    return enhancedError
  }, [handleError])

  /**
   * Handle validation errors specifically
   */
  const handleValidationError = useCallback((
    error: Error,
    context?: { feature?: string; field?: string }
  ) => {
    return handleError(error, {
      feature: context?.feature,
      metadata: { field: context?.field }
    })
  }, [handleError])

  return {
    handleError,
    handleNetworkError,
    handleAuthError,
    handleValidationError,
    ErrorSeverity,
    ErrorCategory,
  }
}

// Convenience hook for manual error throwing (useful for testing error boundaries)
export function useThrowError() {
  return useCallback((message: string = 'Test error') => {
    throw new Error(message)
  }, [])
}
