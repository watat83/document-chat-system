'use client'

import { useClock } from '@/hooks/use-clock';
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Zap, 
  Clock, 
  TrendingUp, 
  Shield,
  AlertTriangle,
  CheckCircle,
  Activity,
  BarChart3
} from 'lucide-react'

interface PerformanceData {
  responseTime: {
    avg: number
    p95: number
    p99: number
  }
  uptime: number
  errorRate: number
  rateLimit: {
    current: number
    limit: number
    resetTime: number
  }
  requests: {
    total: number
    lastHour: number
    successRate: number
  }
  security: {
    threatsBlocked: number
    authFailures: number
  }
}

interface PerformanceMetricsProps {
  endpoint?: {
    method: string
    path: string
  }
  showGlobal?: boolean
}

export function PerformanceMetrics({ endpoint, showGlobal = false }: PerformanceMetricsProps) {
  const now = useClock();
  const [metrics, setMetrics] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  // Simulate fetching real performance data
  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Generate realistic performance data
        const data: PerformanceData = {
          responseTime: {
            avg: showGlobal ? Math.random() * 200 + 100 : Math.random() * 150 + 50,
            p95: showGlobal ? Math.random() * 400 + 200 : Math.random() * 300 + 100,
            p99: showGlobal ? Math.random() * 800 + 400 : Math.random() * 600 + 200
          },
          uptime: 99.95 + Math.random() * 0.04,
          errorRate: Math.random() * 0.5,
          rateLimit: {
            current: Math.floor(Math.random() * 80),
            limit: 100,
            resetTime: now + (15 * 60 * 1000) // 15 minutes from now
          },
          requests: {
            total: Math.floor(Math.random() * 10000) + 5000,
            lastHour: Math.floor(Math.random() * 500) + 100,
            successRate: 99.2 + Math.random() * 0.7
          },
          security: {
            threatsBlocked: Math.floor(Math.random() * 10),
            authFailures: Math.floor(Math.random() * 5)
          }
        }
        
        setMetrics(data)
        setLastUpdated(new Date())
      } catch (error) {
        console.error('Failed to fetch metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    
    // Update metrics every 30 seconds
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [endpoint, showGlobal])

  const getPerformanceStatus = (responseTime: number) => {
    if (responseTime < 100) return { color: 'text-green-600', label: 'Excellent' }
    if (responseTime < 300) return { color: 'text-yellow-600', label: 'Good' }
    if (responseTime < 500) return { color: 'text-orange-600', label: 'Fair' }
    return { color: 'text-red-600', label: 'Poor' }
  }

  const getUptimeStatus = (uptime: number) => {
    if (uptime >= 99.9) return { color: 'text-green-600', icon: CheckCircle }
    if (uptime >= 99.5) return { color: 'text-yellow-600', icon: AlertTriangle }
    return { color: 'text-red-600', icon: AlertTriangle }
  }

  const formatTime = (ms: number) => {
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
  }

  const formatTimeToReset = (timestamp: number) => {
    const diff = timestamp - now
    const minutes = Math.floor(diff / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
    return `${minutes}m ${seconds}s`
  }

  if (loading || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            {showGlobal ? 'Platform Performance' : 'Endpoint Performance'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                <div className="h-2 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const performanceStatus = getPerformanceStatus(metrics.responseTime.avg)
  const uptimeStatus = getUptimeStatus(metrics.uptime)
  const UptimeIcon = uptimeStatus.icon

  return (
    <div className="space-y-4">
      {/* Main Performance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {showGlobal ? 'Platform Performance' : 'Endpoint Performance'}
            <Badge variant="outline" className="ml-auto">
              Live
            </Badge>
          </CardTitle>
          <CardDescription>
            {showGlobal 
              ? 'Real-time performance metrics across all API endpoints'
              : `Performance metrics for ${endpoint?.method} ${endpoint?.path}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Response Time */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Response Time</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{formatTime(metrics.responseTime.avg)}</span>
                  <Badge variant="outline" className={performanceStatus.color}>
                    {performanceStatus.label}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  P95: {formatTime(metrics.responseTime.p95)} • P99: {formatTime(metrics.responseTime.p99)}
                </div>
              </div>
            </div>

            {/* Uptime */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <UptimeIcon className={`h-4 w-4 ${uptimeStatus.color}`} />
                <span className="text-sm font-medium">Uptime</span>
              </div>
              <div className="space-y-1">
                <span className="text-2xl font-bold">{metrics.uptime.toFixed(2)}%</span>
                <div className="text-xs text-muted-foreground">
                  Last 30 days
                </div>
              </div>
            </div>

            {/* Error Rate */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Error Rate</span>
              </div>
              <div className="space-y-1">
                <span className="text-2xl font-bold">{metrics.errorRate.toFixed(2)}%</span>
                <div className="text-xs text-muted-foreground">
                  Success: {metrics.requests.successRate.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Request Volume */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Requests</span>
              </div>
              <div className="space-y-1">
                <span className="text-2xl font-bold">{metrics.requests.lastHour}</span>
                <div className="text-xs text-muted-foreground">
                  Last hour • {metrics.requests.total.toLocaleString()} total
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiting Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Rate Limiting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Current Usage</span>
                <span className="text-sm text-muted-foreground">
                  {metrics.rateLimit.current} / {metrics.rateLimit.limit} requests
                </span>
              </div>
              <Progress 
                value={(metrics.rateLimit.current / metrics.rateLimit.limit) * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground">
                Resets in {formatTimeToReset(metrics.rateLimit.resetTime)}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Threats Blocked</span>
                </div>
                <span className="text-lg font-bold">{metrics.security.threatsBlocked}</span>
                <div className="text-xs text-muted-foreground">Last 24 hours</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium">Auth Failures</span>
                </div>
                <span className="text-lg font-bold">{metrics.security.authFailures}</span>
                <div className="text-xs text-muted-foreground">Last 24 hours</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3 w-3" />
          <span>Metrics updated every 30 seconds</span>
        </div>
        <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
      </div>
    </div>
  )
}