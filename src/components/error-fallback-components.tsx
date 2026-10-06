'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Send,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Bug,
  Zap,
  Shield,
  Wifi,
  WifiOff
} from 'lucide-react'
import { ErrorFallbackProps } from '@/components/error-boundary'

/**
 * Enhanced Error Fallback with Smart Retry Logic
 * 
 * Provides intelligent retry mechanisms with:
 * - Exponential backoff
 * - Network status detection
 * - Progressive disclosure of error details
 * - User feedback collection
 */
export function SmartRetryErrorFallback({
  error,
  resetError,
  retryCount,
  maxRetries,
  errorId,
  feature,
}: ErrorFallbackProps) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryProgress, setRetryProgress] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showDetails, setShowDetails] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Calculate retry delay based on attempt count
  const getRetryDelay = (attempt: number) => {
    return Math.min(1000 * Math.pow(2, attempt), 10000) // Max 10 seconds
  }

  const handleSmartRetry = async () => {
    if (!isOnline) {
      alert('Please check your internet connection and try again.')
      return
    }

    setIsRetrying(true)
    setRetryProgress(0)

    const delay = getRetryDelay(retryCount)
    const interval = 50 // Update progress every 50ms
    const steps = delay / interval

    // Show progress during retry delay
    let currentStep = 0
    const progressInterval = setInterval(() => {
      currentStep++
      setRetryProgress((currentStep / steps) * 100)

      if (currentStep >= steps) {
        clearInterval(progressInterval)
        setIsRetrying(false)
        setRetryProgress(0)
        resetError()
      }
    }, interval)
  }

  const handleCopyError = () => {
    const errorInfo = `
Error ID: ${errorId}
Feature: ${feature || 'Unknown'}
Error: ${error?.message || 'Unknown error'}
Timestamp: ${new Date().toISOString()}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}
    `.trim()

    navigator.clipboard.writeText(errorInfo)
  }

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return

    try {
      // TODO: Send feedback to support system
      console.log('Feedback sent:', { errorId, feedback, feature })
      setFeedbackSent(true)
      setTimeout(() => setFeedbackSent(false), 3000)
    } catch (err) {
      console.error('Failed to send feedback:', err)
    }
  }

  const canRetry = retryCount < maxRetries
  const isNetworkError = error?.message?.includes('fetch') || error?.message?.includes('network')

  return (
    <Card className="w-full max-w-2xl mx-auto border-red-200 bg-red-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="h-5 w-5" />
            {feature ? `${feature} Error` : 'Application Error'}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600" />
            )}
            <Badge variant={isOnline ? 'default' : 'destructive'}>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
        </div>
        <CardDescription className="text-red-700">
          {isNetworkError ? (
            'Network connection issue detected. Please check your internet connection.'
          ) : (
            'Something went wrong. We\'re working to fix this issue.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Error Status */}
        <Alert className="border-red-200 bg-red-100">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Error Details</AlertTitle>
          <AlertDescription className="text-red-700">
            {error?.message || 'An unexpected error occurred'}
          </AlertDescription>
        </Alert>

        {/* Retry Section */}
        {canRetry && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-red-800">
                  Retry Attempts
                </Label>
                <p className="text-xs text-red-600">
                  {retryCount} of {maxRetries} attempts used
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={(retryCount / maxRetries) * 100} className="w-20" />
                <span className="text-xs text-red-600">
                  {Math.round((retryCount / maxRetries) * 100)}%
                </span>
              </div>
            </div>

            {isRetrying ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-blue-600">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Retrying in {Math.ceil((100 - retryProgress) / 100 * getRetryDelay(retryCount) / 1000)}s...</span>
                </div>
                <Progress value={retryProgress} className="w-full" />
              </div>
            ) : (
              <Button
                onClick={handleSmartRetry}
                disabled={!isOnline}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Smart Retry {retryCount > 0 && `(${maxRetries - retryCount} left)`}
              </Button>
            )}
          </div>
        )}

        {/* Alternative Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Page
          </Button>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            Go Back
          </Button>
        </div>

        {/* Error Details (Collapsible) */}
        <div className="border-t border-red-200 pt-4">
          <Button
            variant="ghost"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full justify-between p-0 h-auto text-red-700 hover:text-red-800"
          >
            <span className="text-sm font-medium">Technical Details</span>
            {showDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {showDetails && (
            <div className="mt-3 space-y-3">
              <div className="bg-red-100 rounded-md p-3 text-xs font-mono text-red-800">
                <div>Error ID: {errorId}</div>
                <div>Timestamp: {new Date().toISOString()}</div>
                <div>Feature: {feature || 'Unknown'}</div>
                <div>URL: {window.location.href}</div>
                {error?.stack && (
                  <div className="mt-2">
                    <div>Stack Trace:</div>
                    <pre className="whitespace-pre-wrap text-xs">
                      {error.stack.split('\n').slice(0, 3).join('\n')}
                    </pre>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyError}
                className="w-full border-red-300 text-red-700 hover:bg-red-100"
              >
                <Copy className="mr-2 h-3 w-3" />
                Copy Error Details
              </Button>
            </div>
          )}
        </div>

        {/* Feedback Section */}
        <div className="border-t border-red-200 pt-4 space-y-3">
          <Label className="text-sm font-medium text-red-800">
            Help us improve (optional)
          </Label>
          <Textarea
            placeholder="What were you trying to do when this error occurred?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="border-red-200 focus:border-red-300"
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              onClick={handleSendFeedback}
              disabled={!feedback.trim() || feedbackSent}
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              {feedbackSent ? (
                <>
                  <CheckCircle className="mr-2 h-3 w-3" />
                  Sent
                </>
              ) : (
                <>
                  <Send className="mr-2 h-3 w-3" />
                  Send Feedback
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open('/support', '_blank')}
              className="text-red-700 hover:text-red-800"
            >
              <ExternalLink className="mr-2 h-3 w-3" />
              Contact Support
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Minimal Error Fallback for Small Components
 * 
 * Lightweight error display for small components that shouldn't
 * take up much space when they fail.
 */
export function MinimalErrorFallback({
  error,
  resetError,
  retryCount,
  maxRetries,
  errorId,
}: ErrorFallbackProps) {
  const canRetry = retryCount < maxRetries

  return (
    <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-md">
      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
      <span className="text-sm text-red-700 flex-1">
        {error?.message || 'Error occurred'}
      </span>
      {canRetry && (
        <Button
          onClick={resetError}
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

/**
 * Loading State Error Fallback
 * 
 * For errors that occur during loading states.
 * Provides context about what was being loaded.
 */
export function LoadingErrorFallback({
  error,
  resetError,
  retryCount,
  maxRetries,
  feature,
}: ErrorFallbackProps) {
  const [autoRetryCountdown, setAutoRetryCountdown] = useState<number | null>(retryCount === 0 && retryCount < maxRetries ? 5 : null)
  const canRetry = retryCount < maxRetries

  // Auto-retry for loading errors after 5 seconds
  useEffect(() => {
    if (canRetry && retryCount === 0) {
      const interval = setInterval(() => {
        setAutoRetryCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval)
            resetError()
            return null
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [canRetry, retryCount, resetError])

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardContent className="pt-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
          
          <div>
            <h3 className="font-medium text-yellow-800">
              {feature ? `${feature} Loading Failed` : 'Loading Failed'}
            </h3>
            <p className="text-sm text-yellow-700 mt-1">
              {error?.message || 'Unable to load content'}
            </p>
          </div>

          {autoRetryCountdown !== null ? (
            <div className="space-y-2">
              <p className="text-sm text-yellow-700">
                Auto-retrying in {autoRetryCountdown} seconds...
              </p>
              <Progress value={(5 - autoRetryCountdown) / 5 * 100} className="w-full" />
            </div>
          ) : (
            canRetry && (
              <Button
                onClick={resetError}
                size="sm"
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Critical Error Fallback
 * 
 * For critical system errors that require immediate attention.
 * Used for authentication, security, or data integrity issues.
 */
export function CriticalErrorFallback({
  error,
  resetError,
  errorId,
  feature,
}: ErrorFallbackProps) {
  const isSecurity = error?.message?.includes('auth') || error?.message?.includes('security')
  const isDataIntegrity = error?.message?.includes('corrupt') || error?.message?.includes('integrity')

  return (
    <Card className="border-red-500 bg-red-50 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-900">
          <Shield className="h-5 w-5" />
          Critical System Error
        </CardTitle>
        <CardDescription className="text-red-800">
          {isSecurity && 'Security validation failed. Please re-authenticate.'}
          {isDataIntegrity && 'Data integrity check failed. Please contact support.'}
          {!isSecurity && !isDataIntegrity && 'A critical error occurred that requires attention.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert className="border-red-300 bg-red-100">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Immediate Action Required</AlertTitle>
          <AlertDescription className="text-red-700">
            {isSecurity && (
              <div>
                <p>Please sign out and sign back in to restore access.</p>
                <p className="text-sm mt-1">Your session may have expired or been compromised.</p>
              </div>
            )}
            {isDataIntegrity && (
              <div>
                <p>Data validation failed. Please contact support immediately.</p>
                <p className="text-sm mt-1">Do not retry this operation.</p>
              </div>
            )}
            {!isSecurity && !isDataIntegrity && (
              <p>Please contact support with Error ID: {errorId}</p>
            )}
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 gap-3">
          {isSecurity && (
            <Button
              onClick={() => window.location.href = '/auth/signout'}
              className="bg-red-600 hover:bg-red-700"
            >
              <Shield className="mr-2 h-4 w-4" />
              Sign Out & Re-authenticate
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={() => window.open('/support', '_blank')}
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Contact Support
          </Button>

          {!isSecurity && !isDataIntegrity && (
            <Button
              variant="outline"
              onClick={resetError}
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again (Use Caution)
            </Button>
          )}
        </div>

        <div className="text-xs text-red-600 font-mono bg-red-100 p-2 rounded">
          Critical Error ID: {errorId}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Performance Error Fallback
 * 
 * For errors related to performance issues like timeouts,
 * memory issues, or slow operations.
 */
export function PerformanceErrorFallback({
  error,
  resetError,
  retryCount,
  maxRetries,
  feature,
}: ErrorFallbackProps) {
  const isTimeout = error?.message?.includes('timeout')
  const isMemory = error?.message?.includes('memory') || error?.message?.includes('heap')
  const canRetry = retryCount < maxRetries

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <Zap className="h-5 w-5" />
          Performance Issue Detected
        </CardTitle>
        <CardDescription className="text-orange-700">
          {isTimeout && 'The operation took too long to complete.'}
          {isMemory && 'The system is experiencing memory constraints.'}
          {!isTimeout && !isMemory && 'Performance degradation detected.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert className="border-orange-200 bg-orange-100">
          <Clock className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800">Performance Tips</AlertTitle>
          <AlertDescription className="text-orange-700">
            <ul className="text-sm space-y-1 mt-2">
              {isTimeout && (
                <>
                  <li>• Try breaking down large operations</li>
                  <li>• Check your internet connection</li>
                  <li>• Consider using filters to reduce data load</li>
                </>
              )}
              {isMemory && (
                <>
                  <li>• Close other browser tabs</li>
                  <li>• Refresh the page to clear memory</li>
                  <li>• Use smaller data sets</li>
                </>
              )}
              {!isTimeout && !isMemory && (
                <>
                  <li>• Try again after a moment</li>
                  <li>• Consider simplifying your request</li>
                </>
              )}
            </ul>
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          {canRetry && (
            <Button
              onClick={resetError}
              size="sm"
              className="bg-orange-600 hover:bg-orange-700"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="border-orange-300 text-orange-700 hover:bg-orange-100"
          >
            Refresh Page
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Export all fallback components
export {
  SmartRetryErrorFallback,
  MinimalErrorFallback,
  LoadingErrorFallback,
  CriticalErrorFallback,
  PerformanceErrorFallback,
}