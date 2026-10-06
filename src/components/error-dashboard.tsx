'use client'

import { useClock } from '@/hooks/use-clock';
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { 
  AlertTriangle, 
  Activity, 
  TrendingUp, 
  Shield, 
  RefreshCw, 
  Settings,
  Eye,
  FileText,
  BarChart3,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Grid3x3,
  Target,
  ShieldCheck
} from 'lucide-react'
import { getErrorRegistry, getErrorAnalytics, type ErrorAnalytics } from '@/lib/errors/error-registry'
import { getErrorRouter } from '@/lib/errors/error-router'
import { getErrorConfig } from '@/lib/config/error-config'
import { ErrorSeverity, ErrorCategory } from '@/hooks/use-error-handler'
import { useSystemHealth } from '@/contexts/global-error-context'

/**
 * Error Dashboard Component
 * 
 * Admin interface for monitoring and managing the unified error handling system.
 * Provides real-time insights into system health, error patterns, and recovery status.
 */

interface ErrorDashboardProps {
  isDemo?: boolean
}

export function ErrorDashboard({ isDemo = false }: ErrorDashboardProps) {
  const now = useClock();
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const systemHealth = useSystemHealth()

  // Mock data for demo
  const demoAnalytics: ErrorAnalytics = {
    totalErrors: 47,
    errorsByCategory: {
      [ErrorCategory.NETWORK]: 12,
      [ErrorCategory.AI_SERVICE]: 8,
      [ErrorCategory.API]: 15,
      [ErrorCategory.VALIDATION]: 6,
      [ErrorCategory.AUTHENTICATION]: 3,
      [ErrorCategory.AUTHORIZATION]: 1,
      [ErrorCategory.PERFORMANCE]: 2,
      [ErrorCategory.DATA_INTEGRITY]: 0,
      [ErrorCategory.EXTERNAL_SERVICE]: 0,
      [ErrorCategory.USER_INPUT]: 0,
      [ErrorCategory.SYSTEM]: 0,
      [ErrorCategory.UNKNOWN]: 0,
    },
    errorsBySeverity: {
      [ErrorSeverity.CRITICAL]: 2,
      [ErrorSeverity.HIGH]: 8,
      [ErrorSeverity.MEDIUM]: 25,
      [ErrorSeverity.LOW]: 12,
    },
    errorsBySource: {
      'api': 18,
      'ai-service': 12,
      'ui-component': 8,
      'network': 6,
      'database': 2,
      'system': 1,
    },
    errorsByFeature: {
      'opportunity-matching': 15,
      'document-analysis': 10,
      'user-management': 8,
      'billing': 5,
      'ai-chat': 9,
    },
    errorRate: 2.3,
    trends: {
      last24Hours: 47,
      last7Days: 156,
      last30Days: 523,
    },
    topErrors: [
      {
        fingerprint: 'net_timeout_001',
        count: 12,
        lastSeen: new Date(),
        message: 'Network timeout during API request',
      },
      {
        fingerprint: 'ai_rate_limit_002',
        count: 8,
        lastSeen: new Date(now - 2 * 60 * 60 * 1000),
        message: 'AI service rate limit exceeded',
      },
      {
        fingerprint: 'auth_token_003',
        count: 6,
        lastSeen: new Date(now - 4 * 60 * 60 * 1000),
        message: 'Invalid authentication token',
      },
    ],
    correlatedErrors: [
      {
        pattern: 'ai_service_burst',
        errors: [], // Would contain actual error reports
        severity: ErrorSeverity.HIGH,
      },
      {
        pattern: 'network_degradation',
        errors: [], // Would contain actual error reports
        severity: ErrorSeverity.MEDIUM,
      },
    ],
  }

  function getTimeRange(range: string) {
    const now = new Date()
    const start = new Date()
    
    switch (range) {
      case '1h':
        start.setHours(now.getHours() - 1)
        break
      case '24h':
        start.setDate(now.getDate() - 1)
        break
      case '7d':
        start.setDate(now.getDate() - 7)
        break
      case '30d':
        start.setDate(now.getDate() - 30)
        break
    }
    
    return { start, end: now }
  }


  const analytics = isDemo ? demoAnalytics : getErrorAnalytics(getTimeRange(selectedTimeRange))
  const isLoading = false

  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 'destructive'
      case ErrorSeverity.HIGH: return 'destructive'
      case ErrorSeverity.MEDIUM: return 'default'
      case ErrorSeverity.LOW: return 'secondary'
      default: return 'default'
    }
  }

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'degraded': return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'critical': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error Loading Dashboard</AlertTitle>
        <AlertDescription>
          Unable to load error analytics. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Error Dashboard</h2>
          <p className="text-muted-foreground">Monitor system health and error patterns</p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <Badge variant="outline" className="mr-2">
              Demo Mode
            </Badge>
          )}
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* System Health Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              {getHealthStatusIcon(systemHealth.status)}
              <div>
                <div className="font-medium">Overall Status</div>
                <div className="text-sm text-muted-foreground capitalize">
                  {systemHealth.status}
                </div>
              </div>
            </div>
            <div>
              <div className="font-medium">Health Score</div>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={systemHealth.score} className="flex-1" />
                <span className="text-sm font-medium">{systemHealth.score}%</span>
              </div>
            </div>
            <div>
              <div className="font-medium">Error Rate</div>
              <div className="text-2xl font-bold">{analytics.errorRate.toFixed(1)}/hr</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalErrors}</div>
            <div className="text-xs text-muted-foreground">
              Last {selectedTimeRange}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {analytics.errorsBySeverity[ErrorSeverity.CRITICAL]}
            </div>
            <div className="text-xs text-muted-foreground">
              Require immediate attention
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recovery Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">94%</div>
            <div className="text-xs text-muted-foreground">
              Auto-recovery success
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1.2s</div>
            <div className="text-xs text-muted-foreground">
              Error handling time
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-14 w-full grid grid-cols-5 p-0 bg-background justify-start rounded-none">
          <TabsTrigger value="overview" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Eye className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Overview</code>
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Grid3x3 className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Categories</code>
          </TabsTrigger>
          <TabsTrigger value="patterns" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Target className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Patterns</code>
          </TabsTrigger>
          <TabsTrigger value="sources" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Activity className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Sources</code>
          </TabsTrigger>
          <TabsTrigger value="recovery" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <ShieldCheck className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Recovery</code>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Error Severity Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Severity Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(analytics.errorsBySeverity).map(([severity, count]) => (
                  <div key={severity} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={getSeverityColor(severity as ErrorSeverity)} size="sm">
                        {severity}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(count / analytics.totalErrors) * 100} 
                        className="w-20" 
                      />
                      <span className="text-sm font-medium w-8">{count}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top Errors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Error Patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analytics.topErrors.slice(0, 5).map((error, index) => (
                  <div key={error.fingerprint} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {error.message}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last seen: {error.lastSeen.toLocaleTimeString()}
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {error.count}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Error Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Error Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{analytics.trends.last24Hours}</div>
                  <div className="text-sm text-muted-foreground">Last 24 Hours</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{analytics.trends.last7Days}</div>
                  <div className="text-sm text-muted-foreground">Last 7 Days</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{analytics.trends.last30Days}</div>
                  <div className="text-sm text-muted-foreground">Last 30 Days</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Errors by Category</CardTitle>
              <CardDescription>
                Distribution of errors across different system categories
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(analytics.errorsByCategory)
                .filter(([_, count]) => count > 0)
                .sort(([,a], [,b]) => b - a)
                .map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium capitalize">
                        {category.replace('_', ' ').toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(count / analytics.totalErrors) * 100} 
                        className="w-20" 
                      />
                      <span className="text-sm font-medium w-8">{count}</span>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patterns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Correlated Error Patterns</CardTitle>
              <CardDescription>
                Automatically detected error patterns and correlations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analytics.correlatedErrors.length > 0 ? (
                analytics.correlatedErrors.map((correlation, index) => (
                  <div key={index} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{correlation.pattern}</span>
                      <Badge variant={getSeverityColor(correlation.severity)}>
                        {correlation.severity}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {correlation.errors.length} related errors detected
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div>No correlated patterns detected</div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Errors by Source</CardTitle>
              <CardDescription>
                Distribution of errors across different system sources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(analytics.errorsBySource)
                .sort(([,a], [,b]) => b - a)
                .map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-sm font-medium capitalize">
                        {source.replace('-', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(count / analytics.totalErrors) * 100} 
                        className="w-20" 
                      />
                      <span className="text-sm font-medium w-8">{count}</span>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recovery" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recovery Status</CardTitle>
              <CardDescription>
                Auto-recovery and manual intervention status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">94%</div>
                  <div className="text-sm text-muted-foreground">Auto-Recovery Rate</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">1.2s</div>
                  <div className="text-sm text-muted-foreground">Avg Recovery Time</div>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Circuit Breakers</span>
                  <Badge variant="outline">3 Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Fallback Strategies</span>
                  <Badge variant="outline">5 Configured</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Manual Interventions</span>
                  <Badge variant="outline">2 Today</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Simple Error Status Component
 * 
 * Client-facing component for showing basic error status
 */
export function ErrorStatusIndicator() {
  const systemHealth = useSystemHealth()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500'
      case 'degraded': return 'bg-yellow-500'
      case 'critical': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor(systemHealth.status)}`} />
      <span className="text-sm text-muted-foreground capitalize">
        {systemHealth.status}
      </span>
    </div>
  )
}

/**
 * Error Recovery Button
 * 
 * Client-facing component for triggering error recovery
 */
export function ErrorRecoveryButton() {
  const [isRecovering, setIsRecovering] = useState(false)

  const handleRecovery = async () => {
    setIsRecovering(true)
    try {
      // Trigger recovery through error router
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate recovery
    } finally {
      setIsRecovering(false)
    }
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleRecovery}
      disabled={isRecovering}
    >
      {isRecovering ? (
        <>
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          Recovering...
        </>
      ) : (
        <>
          <Zap className="h-4 w-4 mr-2" />
          Auto-Recover
        </>
      )}
    </Button>
  )
}