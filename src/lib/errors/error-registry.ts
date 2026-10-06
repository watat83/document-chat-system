'use client'

import { EnhancedError, ErrorSeverity, ErrorCategory } from '@/hooks/use-error-handler'
import { getErrorConfig, getReportingConfig } from '@/lib/config/error-config'
import { app } from '@/lib/config/env'

/**
 * Unified Error Registry
 *
 * Central hub for all error reporting, analytics, and correlation across
 * API, AI services, UI components, and system-level errors.
 */

// Error context interface
export interface ErrorContext {
  source: 'api' | 'ai-service' | 'ui-component' | 'system' | 'network' | 'database'
  feature?: string
  userId?: string
  organizationId?: string
  requestId?: string
  sessionId?: string
  userAgent?: string
  url?: string
  componentStack?: string
  metadata?: Record<string, any>
}

// Error report interface
export interface ErrorReport {
  id: string
  timestamp: Date
  error: EnhancedError
  context: ErrorContext
  fingerprint: string
  tags: string[]
  breadcrumbs: BreadcrumbEntry[]
  environment: {
    nodeEnv: string
    userAgent?: string
    url?: string
    timestamp: Date
  }
}

// Breadcrumb entry for error tracking
export interface BreadcrumbEntry {
  timestamp: Date
  category: 'navigation' | 'user-action' | 'network' | 'state-change' | 'error'
  message: string
  level: 'info' | 'warning' | 'error'
  data?: Record<string, any>
}

// Error analytics interface
export interface ErrorAnalytics {
  totalErrors: number
  errorsByCategory: Record<ErrorCategory, number>
  errorsBySeverity: Record<ErrorSeverity, number>
  errorsBySource: Record<ErrorContext['source'], number>
  errorsByFeature: Record<string, number>
  errorRate: number
  trends: {
    last24Hours: number
    last7Days: number
    last30Days: number
  }
  topErrors: Array<{
    fingerprint: string
    count: number
    lastSeen: Date
    message: string
  }>
  correlatedErrors: Array<{
    pattern: string
    errors: ErrorReport[]
    severity: ErrorSeverity
  }>
}

// Error metrics for external services
interface ErrorMetrics {
  errorId: string
  fingerprint: string
  timestamp: number
  category: ErrorCategory
  severity: ErrorSeverity
  source: ErrorContext['source']
  feature?: string
  userId?: string
  organizationId?: string
  tags: string[]
  customProperties: Record<string, any>
}

/**
 * Global Error Registry Class
 */
class GlobalErrorRegistry {
  private errorHistory: ErrorReport[] = []
  private breadcrumbs: BreadcrumbEntry[] = []
  private correlationMap: Map<string, ErrorReport[]> = new Map()
  private errorBatches: ErrorReport[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private maxHistorySize = 1000
  private maxBreadcrumbs = 50

  constructor() {
    this.setupFlushTimer()
  }

  /**
   * Report an error to the registry
   */
  reportError(error: EnhancedError, context: ErrorContext): ErrorReport {
    const config = getReportingConfig()

    // Generate unique error ID if not provided
    const errorId = error.errorId || this.generateErrorId()

    // Create fingerprint for error deduplication
    const fingerprint = this.generateFingerprint(error, context)

    // Generate tags for categorization
    const tags = this.generateTags(error, context)

    // Create error report
    const report: ErrorReport = {
      id: errorId,
      timestamp: new Date(),
      error: {
        ...error,
        errorId,
        timestamp: error.timestamp || new Date(),
      },
      context,
      fingerprint,
      tags,
      breadcrumbs: [...this.breadcrumbs],
      environment: {
        nodeEnv: app.nodeEnv,
        userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location?.href : context.url,
        timestamp: new Date(),
      },
    }

    // Add to history
    this.addToHistory(report)

    // Update correlations
    this.updateCorrelations(report)

    // Add to batch for external reporting
    if (config.enableErrorTracking || config.enableMetrics || config.enableAnalytics) {
      this.addToBatch(report)
    }

    // Immediate console logging in development
    if (config.enableErrorTracking && app.nodeEnv === 'development') {
      this.logErrorToConsole(report)
    }

    return report
  }

  /**
   * Add breadcrumb for error context
   */
  addBreadcrumb(breadcrumb: Omit<BreadcrumbEntry, 'timestamp'>): void {
    const entry: BreadcrumbEntry = {
      ...breadcrumb,
      timestamp: new Date(),
    }

    this.breadcrumbs.push(entry)

    // Maintain breadcrumb limit
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs)
    }
  }

  /**
   * Get error analytics
   */
  getAnalytics(timeRange?: { start: Date; end: Date }): ErrorAnalytics {
    const errors = timeRange
      ? this.errorHistory.filter(report =>
          report.timestamp >= timeRange.start && report.timestamp <= timeRange.end
        )
      : this.errorHistory

    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Count errors by category
    const errorsByCategory = Object.values(ErrorCategory).reduce((acc, category) => {
      acc[category] = errors.filter(report => report.error.category === category).length
      return acc
    }, {} as Record<ErrorCategory, number>)

    // Count errors by severity
    const errorsBySeverity = Object.values(ErrorSeverity).reduce((acc, severity) => {
      acc[severity] = errors.filter(report => report.error.severity === severity).length
      return acc
    }, {} as Record<ErrorSeverity, number>)

    // Count errors by source
    const errorsBySource = errors.reduce((acc, report) => {
      const source = report.context.source
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {} as Record<ErrorContext['source'], number>)

    // Count errors by feature
    const errorsByFeature = errors.reduce((acc, report) => {
      const feature = report.context.feature || 'unknown'
      acc[feature] = (acc[feature] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Calculate error rate (errors per hour)
    const hoursInRange = timeRange
      ? (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60)
      : 24 // Default to last 24 hours
    const errorRate = errors.length / Math.max(hoursInRange, 1)

    // Get top errors by fingerprint
    const fingerprintCounts = errors.reduce((acc, report) => {
      if (!acc[report.fingerprint]) {
        acc[report.fingerprint] = {
          count: 0,
          lastSeen: report.timestamp,
          message: report.error.message,
        }
      }
      acc[report.fingerprint].count++
      if (report.timestamp > acc[report.fingerprint].lastSeen) {
        acc[report.fingerprint].lastSeen = report.timestamp
      }
      return acc
    }, {} as Record<string, { count: number; lastSeen: Date; message: string }>)

    const topErrors = Object.entries(fingerprintCounts)
      .map(([fingerprint, data]) => ({ fingerprint, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get correlated errors
    const correlatedErrors = Array.from(this.correlationMap.entries())
      .map(([pattern, reports]) => ({
        pattern,
        errors: reports,
        severity: this.getCorrelationSeverity(reports),
      }))
      .filter(correlation => correlation.errors.length > 1)

    return {
      totalErrors: errors.length,
      errorsByCategory,
      errorsBySeverity,
      errorsBySource,
      errorsByFeature,
      errorRate,
      trends: {
        last24Hours: errors.filter(report => report.timestamp >= last24Hours).length,
        last7Days: errors.filter(report => report.timestamp >= last7Days).length,
        last30Days: errors.filter(report => report.timestamp >= last30Days).length,
      },
      topErrors,
      correlatedErrors,
    }
  }

  /**
   * Get errors by criteria
   */
  getErrors(criteria: {
    severity?: ErrorSeverity[]
    category?: ErrorCategory[]
    source?: ErrorContext['source'][]
    feature?: string
    timeRange?: { start: Date; end: Date }
    limit?: number
  } = {}): ErrorReport[] {
    let filtered = [...this.errorHistory]

    if (criteria.severity) {
      filtered = filtered.filter(report =>
        criteria.severity!.includes(report.error.severity || ErrorSeverity.MEDIUM)
      )
    }

    if (criteria.category) {
      filtered = filtered.filter(report =>
        criteria.category!.includes(report.error.category || ErrorCategory.UNKNOWN)
      )
    }

    if (criteria.source) {
      filtered = filtered.filter(report =>
        criteria.source!.includes(report.context.source)
      )
    }

    if (criteria.feature) {
      filtered = filtered.filter(report =>
        report.context.feature === criteria.feature
      )
    }

    if (criteria.timeRange) {
      filtered = filtered.filter(report =>
        report.timestamp >= criteria.timeRange!.start &&
        report.timestamp <= criteria.timeRange!.end
      )
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    if (criteria.limit) {
      filtered = filtered.slice(0, criteria.limit)
    }

    return filtered
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = []
    this.correlationMap.clear()
  }

  /**
   * Get correlation patterns
   */
  getCorrelationPatterns(): Array<{ pattern: string; errors: ErrorReport[]; severity: ErrorSeverity }> {
    return Array.from(this.correlationMap.entries()).map(([pattern, errors]) => ({
      pattern,
      errors,
      severity: this.getCorrelationSeverity(errors),
    }))
  }

  // Private methods

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateFingerprint(error: EnhancedError, context: ErrorContext): string {
    // Create a unique fingerprint for error deduplication
    const components = [
      error.message,
      error.category || 'unknown',
      context.source,
      context.feature || 'unknown',
      // Include first few lines of stack trace for better grouping
      error.stack?.split('\n').slice(0, 3).join('\n') || '',
    ]

    return btoa(components.join('|')).substr(0, 16)
  }

  private generateTags(error: EnhancedError, context: ErrorContext): string[] {
    const tags: string[] = []

    if (error.category) tags.push(`category:${error.category}`)
    if (error.severity) tags.push(`severity:${error.severity}`)
    if (context.source) tags.push(`source:${context.source}`)
    if (context.feature) tags.push(`feature:${context.feature}`)
    if (error.retryable) tags.push('retryable')
    if (app.nodeEnv) tags.push(`env:${app.nodeEnv}`)

    return tags
  }

  private addToHistory(report: ErrorReport): void {
    this.errorHistory.push(report)

    // Maintain history size limit
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize)
    }
  }

  private updateCorrelations(report: ErrorReport): void {
    const config = getErrorConfig().patterns
    const correlationWindow = config.correlationWindow
    const now = Date.now()

    // Find errors within correlation window
    const recentErrors = this.errorHistory.filter(r =>
      (now - r.timestamp.getTime()) < correlationWindow
    )

    if (recentErrors.length >= config.burstThreshold) {
      // Create correlation patterns
      const patterns = [
        `${report.error.category}_${report.context.source}`,
        `${report.context.feature}_errors`,
        `${report.error.severity}_burst`,
      ].filter(Boolean)

      patterns.forEach(pattern => {
        const relatedErrors = recentErrors.filter(r =>
          this.isErrorRelated(r, report, pattern)
        )

        if (relatedErrors.length >= 2) {
          this.correlationMap.set(pattern, relatedErrors)
        }
      })
    }
  }

  private isErrorRelated(error1: ErrorReport, error2: ErrorReport, pattern: string): boolean {
    if (pattern.includes('_burst')) {
      return error1.error.severity === error2.error.severity
    }

    if (pattern.includes('_errors')) {
      return error1.context.feature === error2.context.feature
    }

    return (
      error1.error.category === error2.error.category &&
      error1.context.source === error2.context.source
    )
  }

  private getCorrelationSeverity(errors: ErrorReport[]): ErrorSeverity {
    const severities = errors.map(e => e.error.severity || ErrorSeverity.MEDIUM)

    if (severities.includes(ErrorSeverity.CRITICAL)) return ErrorSeverity.CRITICAL
    if (severities.includes(ErrorSeverity.HIGH)) return ErrorSeverity.HIGH
    if (severities.includes(ErrorSeverity.MEDIUM)) return ErrorSeverity.MEDIUM
    return ErrorSeverity.LOW
  }

  private addToBatch(report: ErrorReport): void {
    this.errorBatches.push(report)

    const config = getReportingConfig()
    if (this.errorBatches.length >= config.batchSize) {
      this.flushBatch()
    }
  }

  private setupFlushTimer(): void {
    const config = getReportingConfig()

    this.flushTimer = setInterval(() => {
      if (this.errorBatches.length > 0) {
        this.flushBatch()
      }
    }, config.flushInterval)
  }

  private async flushBatch(): Promise<void> {
    if (this.errorBatches.length === 0) return

    const batch = [...this.errorBatches]
    this.errorBatches = []

    try {
      await this.sendToExternalServices(batch)
    } catch (error) {
      console.warn('Failed to flush error batch:', error)
      // Re-add failed batch items back to queue (with limit to prevent infinite growth)
      if (this.errorBatches.length < 100) {
        this.errorBatches.unshift(...batch.slice(0, 50))
      }
    }
  }

  private async sendToExternalServices(reports: ErrorReport[]): Promise<void> {
    const config = getReportingConfig()

    // Send to error tracking service (Sentry, etc.)
    if (config.enableErrorTracking) {
      await this.sendToErrorTracking(reports)
    }

    // Send to analytics service
    if (config.enableAnalytics) {
      await this.sendToAnalytics(reports)
    }

    // Send to metrics service
    if (config.enableMetrics) {
      await this.sendToMetrics(reports)
    }
  }

  private async sendToErrorTracking(reports: ErrorReport[]): Promise<void> {
    // TODO: Implement actual error tracking service integration
    if (app.nodeEnv === 'development') {
      console.log('Would send to error tracking:', reports.length, 'reports')
    }
  }

  private async sendToAnalytics(reports: ErrorReport[]): Promise<void> {
    // TODO: Implement actual analytics service integration
    if (app.nodeEnv === 'development') {
      console.log('Would send to analytics:', reports.length, 'reports')
    }
  }

  private async sendToMetrics(reports: ErrorReport[]): Promise<void> {
    // TODO: Implement actual metrics service integration
    const metrics: ErrorMetrics[] = reports.map(report => ({
      errorId: report.id,
      fingerprint: report.fingerprint,
      timestamp: report.timestamp.getTime(),
      category: report.error.category || ErrorCategory.UNKNOWN,
      severity: report.error.severity || ErrorSeverity.MEDIUM,
      source: report.context.source,
      feature: report.context.feature,
      userId: report.context.userId,
      organizationId: report.context.organizationId,
      tags: report.tags,
      customProperties: report.context.metadata || {},
    }))

    if (app.nodeEnv === 'development') {
      console.log('Would send metrics:', metrics.length, 'metrics')
    }
  }

  private logErrorToConsole(report: ErrorReport): void {
    console.group(`🚨 Error Registry - ${report.error.severity?.toUpperCase()}`)
    console.error('Error:', report.error.message || 'Unknown error')
    console.table({
      'Error ID': report.id,
      'Fingerprint': report.fingerprint,
      'Category': report.error.category,
      'Severity': report.error.severity,
      'Source': report.context.source,
      'Feature': report.context.feature,
      'Timestamp': report.timestamp.toISOString(),
    })

    if (report.context.metadata) {
      console.log('Context Metadata:', report.context.metadata)
    }

    if (report.breadcrumbs.length > 0) {
      console.log('Breadcrumbs:', report.breadcrumbs.slice(-5))
    }

    if (report.error.stack) {
      console.log('Stack Trace:', report.error.stack)
    }

    console.groupEnd()
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // Flush any remaining batches
    if (this.errorBatches.length > 0) {
      this.flushBatch()
    }
  }
}

// Singleton instance
let globalErrorRegistry: GlobalErrorRegistry | null = null

/**
 * Get the global error registry instance
 */
export function getErrorRegistry(): GlobalErrorRegistry {
  if (!globalErrorRegistry) {
    globalErrorRegistry = new GlobalErrorRegistry()
  }
  return globalErrorRegistry
}

/**
 * Convenience function to report errors
 */
export function reportError(error: EnhancedError, context: ErrorContext): ErrorReport {
  return getErrorRegistry().reportError(error, context)
}

/**
 * Convenience function to add breadcrumbs
 */
export function addBreadcrumb(breadcrumb: Omit<BreadcrumbEntry, 'timestamp'>): void {
  getErrorRegistry().addBreadcrumb(breadcrumb)
}

/**
 * Convenience function to get error analytics
 */
export function getErrorAnalytics(timeRange?: { start: Date; end: Date }): ErrorAnalytics {
  return getErrorRegistry().getAnalytics(timeRange)
}

// Export types
export type { ErrorContext, ErrorReport, BreadcrumbEntry, ErrorAnalytics }

// Default export
export default getErrorRegistry
