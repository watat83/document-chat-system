import { useState, useEffect, useCallback } from 'react'

export interface PricingPlan {
  id: string
  planType: string
  displayName: string
  description: string
  monthlyPrice: number
  yearlyPrice?: number | null
  currency: string
  features: {
    list: string[]
    detailed?: Record<string, any>
  }
  limits: {
    seats: number
    documentsPerMonth: number
    aiCreditsPerMonth: number
    matchScoreCalculations: number
    apiCallsPerMonth?: number
    exportLimit?: number
    [key: string]: number | undefined
  }
  isActive: boolean
  isPopular: boolean
  displayOrder: number
  metadata?: Record<string, any> | null
  stripeMonthlyPriceId?: string | null
  stripeYearlyPriceId?: string | null
}

export interface UsePricingPlansOptions {
  format?: 'detailed' | 'stripe' | 'simple'
  autoRefresh?: boolean
  refreshInterval?: number
  retryAttempts?: number
  retryDelay?: number
}

export interface UsePricingPlansReturn {
  plans: PricingPlan[]
  loading: boolean
  error: string | null
  dataSource: 'database' | 'cache' | 'fallback'
  lastUpdated: Date | null
  retry: () => Promise<void>
  refresh: () => Promise<void>
  getPlanByType: (planType: string) => PricingPlan | null
  formatPrice: (priceInCents: number) => string
  formatLimit: (limit: number | undefined) => string
}

/**
 * Custom hook for managing pricing plans with comprehensive error handling,
 * retry logic, fallback support, and caching
 */
export function usePricingPlans(options: UsePricingPlansOptions = {}): UsePricingPlansReturn {
  const {
    format = 'detailed',
    autoRefresh = false,
    refreshInterval = 5 * 60 * 1000, // 5 minutes
    retryAttempts = 2,
    retryDelay = 1000
  } = options

  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'database' | 'cache' | 'fallback'>('database')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const fetchPlans = useCallback(async function fetchPlans(isRetry = false) {
    try {
      if (!isRetry) {
        setLoading(true)
      }
      setError(null)

      const url = `/api/v1/pricing/plans?format=${format}&timestamp=${Date.now()}`
      const response = await fetch(url, {
        cache: 'no-store', // Ensure fresh data
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch pricing plans: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch pricing plans')
      }

      setPlans(data.data || [])
      setDataSource(data.source || 'database')
      setLastUpdated(new Date())
      setRetryCount(0) // Reset retry count on success

    } catch (err) {
      console.error('Error fetching pricing plans:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load pricing plans'

      // Retry logic
      if (retryCount < retryAttempts) {
        console.log(`Retrying pricing plans fetch (attempt ${retryCount + 1}/${retryAttempts})...`)
        setRetryCount(prev => prev + 1)
        setTimeout(() => {
          fetchPlans(true)
        }, retryDelay * (retryCount + 1)) // Exponential backoff
        return
      }

      setError(errorMessage)
      setRetryCount(0)
    } finally {
      if (!isRetry) {
        setLoading(false)
      }
    }
  }, [format, retryAttempts, retryCount, retryDelay])

  // Fetch plans on mount
  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  // Auto-refresh logic
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return

    const interval = setInterval(() => {
      console.log('Auto-refreshing pricing plans...')
      fetchPlans(true) // Silent refresh
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, fetchPlans])

  // Manual retry function
  const retry = useCallback(async () => {
    setRetryCount(0)
    await fetchPlans()
  }, [fetchPlans])

  // Manual refresh function
  const refresh = useCallback(async () => {
    setRetryCount(0)
    await fetchPlans()
  }, [fetchPlans])

  // Utility functions
  const getPlanByType = useCallback((planType: string): PricingPlan | null => {
    return plans.find(plan => plan.planType === planType) || null
  }, [plans])

  const formatPrice = useCallback((priceInCents: number): string => {
    if (priceInCents === 0) return 'Custom'
    const dollars = priceInCents / 100
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(dollars)
  }, [])

  const formatLimit = useCallback((limit: number | undefined): string => {
    if (limit === undefined || limit === null) return 'N/A'
    if (limit === -1) return 'Unlimited'
    return limit.toLocaleString()
  }, [])

  return {
    plans,
    loading,
    error,
    dataSource,
    lastUpdated,
    retry,
    refresh,
    getPlanByType,
    formatPrice,
    formatLimit
  }
}

/**
 * Hook for getting a specific pricing plan by type
 */
export function usePricingPlan(planType: string, options: UsePricingPlansOptions = {}) {
  const { plans, loading, error, dataSource, retry, getPlanByType, formatPrice, formatLimit } = usePricingPlans(options)
  
  const plan = getPlanByType(planType)
  
  return {
    plan,
    loading,
    error,
    dataSource,
    retry,
    formatPrice,
    formatLimit,
    exists: plan !== null
  }
}