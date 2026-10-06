import { z } from 'zod'
import { errorConfig as envErrorConfig, app } from '@/lib/config/env'

/**
 * Centralized Error Handling Configuration
 *
 * All error handling thresholds, timeouts, and settings in one place.
 * Supports environment variable overrides and runtime configuration.
 */

// Environment-based configuration schema
const errorConfigSchema = z.object({
  // Circuit Breaker Configuration
  circuitBreaker: z.object({
    failureThreshold: z.number().min(1).max(100).default(5)
      .describe("Number of failures before opening circuit breaker"),
    recoveryTimeout: z.number().min(1000).max(300000).default(30000)
      .describe("Time in milliseconds before attempting recovery"),
    monitoringWindow: z.number().min(10000).max(600000).default(60000)
      .describe("Time window in milliseconds for monitoring failures"),
    expectedErrorRate: z.number().min(0).max(1).default(0.1)
      .describe("Expected error rate (0-1) before triggering circuit breaker"),
    halfOpenMaxCalls: z.number().min(1).max(20).default(3)
      .describe("Maximum calls allowed in half-open state"),
  }),

  // Notification Configuration
  notifications: z.object({
    maxPerMinute: z.number().min(1).max(100).default(10)
      .describe("Maximum error notifications per minute to prevent spam"),
    cooldownPeriod: z.number().min(60000).max(1800000).default(300000)
      .describe("Cooldown period in milliseconds between health notifications"),
    persistentSeverities: z.array(z.enum(['critical', 'high'])).default(['critical'])
      .describe("Error severities that show persistent notifications"),
  }),

  // Retry Configuration
  retry: z.object({
    maxAttempts: z.number().min(1).max(10).default(3)
      .describe("Maximum retry attempts for retryable errors"),
    baseDelay: z.number().min(100).max(10000).default(1000)
      .describe("Base delay in milliseconds for exponential backoff"),
    maxDelay: z.number().min(1000).max(60000).default(30000)
      .describe("Maximum delay in milliseconds for exponential backoff"),
    jitterFactor: z.number().min(0).max(1).default(0.1)
      .describe("Jitter factor (0-1) to prevent thundering herd"),
  }),

  // Auto-Recovery Configuration
  recovery: z.object({
    maxRetries: z.number().min(1).max(10).default(3)
      .describe("Maximum auto-recovery attempts"),
    recoveryTimeout: z.number().min(30000).max(600000).default(120000)
      .describe("Timeout in milliseconds for recovery operations"),
    healthCheckInterval: z.number().min(5000).max(60000).default(15000)
      .describe("Interval in milliseconds for health checks during recovery"),
    enableAutoRecovery: z.boolean().default(true)
      .describe("Whether to enable automatic error recovery"),
  }),

  // Error Pattern Detection
  patterns: z.object({
    correlationWindow: z.number().min(30000).max(300000).default(60000)
      .describe("Time window in milliseconds for error correlation"),
    burstThreshold: z.number().min(2).max(20).default(3)
      .describe("Number of errors in correlation window to trigger burst detection"),
    cascadeTimeout: z.number().min(5000).max(60000).default(15000)
      .describe("Timeout in milliseconds to detect cascade failures"),
    trendAnalysisWindow: z.number().min(300000).max(3600000).default(1800000)
      .describe("Time window in milliseconds for error trend analysis"),
  }),

  // Health Monitoring
  health: z.object({
    criticalThreshold: z.number().min(5).max(50).default(10)
      .describe("Error count per hour threshold for critical health status"),
    warningThreshold: z.number().min(2).max(25).default(5)
      .describe("Error count per hour threshold for warning health status"),
    healthCheckInterval: z.number().min(10000).max(300000).default(30000)
      .describe("Interval in milliseconds for system health checks"),
    historyRetention: z.number().min(50).max(1000).default(100)
      .describe("Number of errors to retain in history"),
  }),

  // AI Service Specific Configuration
  aiServices: z.object({
    timeoutMs: z.number().min(5000).max(120000).default(30000)
      .describe("Timeout in milliseconds for AI service requests"),
    rateLimitWindow: z.number().min(60000).max(3600000).default(3600000)
      .describe("Rate limit window in milliseconds for AI services"),
    costThresholdWarning: z.number().min(1).max(1000).default(100)
      .describe("Cost threshold in dollars for warning notifications"),
    costThresholdCritical: z.number().min(10).max(10000).default(500)
      .describe("Cost threshold in dollars for critical notifications"),
    fallbackDelay: z.number().min(100).max(5000).default(1000)
      .describe("Delay in milliseconds before attempting fallback provider"),
  }),

  // Reporting Configuration
  reporting: z.object({
    enableErrorTracking: z.boolean().default(true)
      .describe("Whether to enable external error tracking (Sentry, etc.)"),
    enableMetrics: z.boolean().default(true)
      .describe("Whether to enable error metrics collection"),
    enableAnalytics: z.boolean().default(true)
      .describe("Whether to enable error analytics"),
    batchSize: z.number().min(1).max(100).default(10)
      .describe("Batch size for error reporting to external services"),
    flushInterval: z.number().min(5000).max(60000).default(30000)
      .describe("Interval in milliseconds to flush batched error reports"),
  }),

  // Development Configuration
  development: z.object({
    enableConsoleLogging: z.boolean().default(true)
      .describe("Whether to enable console logging in development"),
    enableDetailedErrors: z.boolean().default(true)
      .describe("Whether to show detailed error information in development"),
    enableMockErrors: z.boolean().default(false)
      .describe("Whether to enable mock errors for testing"),
    verboseLogging: z.boolean().default(false)
      .describe("Whether to enable verbose error logging"),
  }),
})

// Type definition for the configuration
export type ErrorConfig = z.infer<typeof errorConfigSchema>

// Load configuration from environment variables
function loadErrorConfig(): ErrorConfig {
  const config = {
    circuitBreaker: {
      failureThreshold: envErrorConfig.circuitBreaker.failureThreshold,
      recoveryTimeout: envErrorConfig.circuitBreaker.recoveryTimeout,
      monitoringWindow: envErrorConfig.circuitBreaker.monitoringWindow,
      expectedErrorRate: envErrorConfig.circuitBreaker.expectedErrorRate,
      halfOpenMaxCalls: envErrorConfig.circuitBreaker.halfOpenMaxCalls,
    },
    notifications: {
      maxPerMinute: envErrorConfig.notifications.maxPerMinute,
      cooldownPeriod: envErrorConfig.notifications.cooldownPeriod,
      persistentSeverities: (envErrorConfig.notifications.persistentSeverities || 'critical')
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s) as ['critical'] | ['critical', 'high'],
    },
    retry: {
      maxAttempts: envErrorConfig.retry.maxAttempts,
      baseDelay: envErrorConfig.retry.baseDelay,
      maxDelay: envErrorConfig.retry.maxDelay,
      jitterFactor: envErrorConfig.retry.jitterFactor,
    },
    recovery: {
      maxRetries: envErrorConfig.recovery.maxRetries,
      recoveryTimeout: envErrorConfig.recovery.recoveryTimeout,
      healthCheckInterval: envErrorConfig.recovery.healthCheckInterval,
      enableAutoRecovery: envErrorConfig.recovery.enableAutoRecovery,
    },
    patterns: {
      correlationWindow: envErrorConfig.patterns.correlationWindow,
      burstThreshold: envErrorConfig.patterns.burstThreshold,
      cascadeTimeout: envErrorConfig.patterns.cascadeTimeout,
      trendAnalysisWindow: envErrorConfig.patterns.trendAnalysisWindow,
    },
    health: {
      criticalThreshold: envErrorConfig.health.criticalThreshold,
      warningThreshold: envErrorConfig.health.warningThreshold,
      healthCheckInterval: envErrorConfig.health.healthCheckInterval,
      historyRetention: envErrorConfig.health.historyRetention,
    },
    aiServices: {
      timeoutMs: envErrorConfig.aiServices.timeoutMs,
      rateLimitWindow: envErrorConfig.aiServices.rateLimitWindow,
      costThresholdWarning: envErrorConfig.aiServices.costThresholdWarning,
      costThresholdCritical: envErrorConfig.aiServices.costThresholdCritical,
      fallbackDelay: envErrorConfig.aiServices.fallbackDelay,
    },
    reporting: {
      enableErrorTracking: envErrorConfig.reporting.enableErrorTracking,
      enableMetrics: envErrorConfig.reporting.enableMetrics,
      enableAnalytics: envErrorConfig.reporting.enableAnalytics,
      batchSize: envErrorConfig.reporting.batchSize,
      flushInterval: envErrorConfig.reporting.flushInterval,
    },
    development: {
      enableConsoleLogging: app.nodeEnv === 'development' && envErrorConfig.development.enableConsoleLogging,
      enableDetailedErrors: app.nodeEnv === 'development' && envErrorConfig.development.enableDetailedErrors,
      enableMockErrors: envErrorConfig.development.enableMockErrors,
      verboseLogging: envErrorConfig.development.verboseLogging,
    },
  }

  // Validate configuration
  const result = errorConfigSchema.safeParse(config)

  if (!result.success) {
    console.error('Invalid error configuration:', result.error.issues)
    throw new Error('Invalid error handling configuration')
  }

  return result.data
}

// Singleton configuration instance
let errorConfig: ErrorConfig | null = null

/**
 * Get the global error configuration
 */
export function getErrorConfig(): ErrorConfig {
  if (!errorConfig) {
    errorConfig = loadErrorConfig()
  }
  return errorConfig
}

/**
 * Update error configuration at runtime (for admin interfaces)
 */
export function updateErrorConfig(updates: Partial<ErrorConfig>): void {
  const currentConfig = getErrorConfig()
  const newConfig = { ...currentConfig, ...updates }

  const result = errorConfigSchema.safeParse(newConfig)
  if (!result.success) {
    throw new Error('Invalid error configuration update')
  }

  errorConfig = result.data
}

/**
 * Reset configuration to environment defaults
 */
export function resetErrorConfig(): void {
  errorConfig = null
}

// Export specific configuration getters for convenience
export const getCircuitBreakerConfig = () => getErrorConfig().circuitBreaker
export const getNotificationConfig = () => getErrorConfig().notifications
export const getRetryConfig = () => getErrorConfig().retry
export const getRecoveryConfig = () => getErrorConfig().recovery
export const getPatternConfig = () => getErrorConfig().patterns
export const getHealthConfig = () => getErrorConfig().health
export const getAIServiceConfig = () => getErrorConfig().aiServices
export const getReportingConfig = () => getErrorConfig().reporting
export const getDevelopmentConfig = () => getErrorConfig().development

// Configuration validation helpers
export function validateConfig(config: Partial<ErrorConfig>): { valid: boolean; errors?: string[] } {
  const result = errorConfigSchema.safeParse(config)

  if (result.success) {
    return { valid: true }
  }

  return {
    valid: false,
    errors: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
  }
}

// Default export
export default getErrorConfig
