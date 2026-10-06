'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Target, 
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3
} from 'lucide-react'

interface CostSummary {
  totalCost: number
  tokenCount: number
  operationCount: number
  averageCostPerOperation: number
  dailyAverage: number
  monthlyProjection: number
  costByModel: Record<string, number>
  costByOperation: Record<string, number>
  period: {
    start: string
    end: string
    type: string
  }
}

interface OptimizationRecommendation {
  type: 'model_switch' | 'batch_optimization' | 'deduplication' | 'caching'
  priority: 'high' | 'medium' | 'low'
  description: string
  potentialSavings: number
  implementation: string
}

interface CostTrend {
  date: string
  cost: number
  tokens: number
  operations: number
}

interface CostAnalyticsData {
  costSummary: CostSummary
  recommendations: OptimizationRecommendation[]
  trends: CostTrend[]
}

export function CostAnalyticsDashboard() {
  const [data, setData] = useState<CostAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly')

  useEffect(() => {
    fetchCostAnalytics()
  }, [period])

  async function fetchCostAnalytics() {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/v1/cost-analytics?period=${period}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch cost analytics')
      }
      
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cost analytics')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => `$${amount.toFixed(6)}`
  const formatNumber = (num: number) => num.toLocaleString()

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive'
      case 'medium': return 'default'
      case 'low': return 'secondary'
      default: return 'default'
    }
  }

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'model_switch': return <Zap className="h-4 w-4" />
      case 'batch_optimization': return <BarChart3 className="h-4 w-4" />
      case 'deduplication': return <Target className="h-4 w-4" />
      case 'caching': return <Clock className="h-4 w-4" />
      default: return <CheckCircle className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">AI Cost Analytics</h2>
          <div className="animate-pulse h-10 w-32 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2" />
                <div className="h-3 bg-muted rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>No cost analytics data available</AlertDescription>
      </Alert>
    )
  }

  const { costSummary, recommendations } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Cost Analytics</h2>
          <p className="text-muted-foreground">
            Monitor and optimize your AI operation costs
          </p>
        </div>
        <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costSummary.totalCost)}</div>
            <p className="text-xs text-muted-foreground">
              {costSummary.period.type} period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Processed</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(costSummary.tokenCount)}</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(costSummary.operationCount)} operations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costSummary.dailyAverage)}</div>
            <p className="text-xs text-muted-foreground">
              per day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Projection</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costSummary.monthlyProjection)}</div>
            <p className="text-xs text-muted-foreground">
              projected
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cost by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(costSummary.costByModel).map(([model, cost]) => (
                <div key={model} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{model}</span>
                  <div className="text-right">
                    <div className="font-mono text-sm">{formatCurrency(cost)}</div>
                    <div className="text-xs text-muted-foreground">
                      {((cost / costSummary.totalCost) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost by Operation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(costSummary.costByOperation).map(([operation, cost]) => (
                <div key={operation} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{operation}</span>
                  <div className="text-right">
                    <div className="font-mono text-sm">{formatCurrency(cost)}</div>
                    <div className="text-xs text-muted-foreground">
                      {((cost / costSummary.totalCost) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Optimization Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Optimization Recommendations
            {recommendations.length > 0 && (
              <Badge variant="secondary">{recommendations.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="text-lg font-medium">No optimization recommendations</p>
              <p className="text-sm">Your AI costs are already well optimized!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getRecommendationIcon(rec.type)}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getPriorityColor(rec.priority) as any}>
                            {rec.priority} priority
                          </Badge>
                          <span className="text-sm text-muted-foreground capitalize">
                            {rec.type.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="font-medium">{rec.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(rec.potentialSavings)}
                      </div>
                      <div className="text-xs text-muted-foreground">potential savings</div>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded p-3 text-sm">
                    <strong>Implementation:</strong> {rec.implementation}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {formatCurrency(costSummary.averageCostPerOperation)}
              </div>
              <p className="text-sm text-muted-foreground">Average Cost per Operation</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {(costSummary.tokenCount / costSummary.operationCount || 0).toFixed(0)}
              </div>
              <p className="text-sm text-muted-foreground">Average Tokens per Operation</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {((costSummary.totalCost / costSummary.tokenCount) * 1000 || 0).toFixed(6)}
              </div>
              <p className="text-sm text-muted-foreground">Cost per 1K Tokens</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={fetchCostAnalytics} variant="outline">
          Refresh Data
        </Button>
        <Button variant="outline">
          Export Report
        </Button>
        <Button variant="outline">
          Set Cost Alerts
        </Button>
      </div>
    </div>
  )
}