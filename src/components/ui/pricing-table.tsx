'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card'
import { Button } from './button'
import { Badge } from './badge'
import { Check, Zap, Crown, Building2, Building, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from './alert'
import { usePricingPlans, PricingPlan } from '@/hooks/usePricingPlans'

// PricingPlan interface now imported from usePricingPlans hook

interface PricingTableProps {
  onPlanSelect?: (plan: PricingPlan) => void
  className?: string
  billingInterval?: 'monthly' | 'yearly'
  showLoadingState?: boolean
}

const planIcons: Record<string, React.ReactNode> = {
  STARTER: <Zap className="w-5 h-5" />,
  PROFESSIONAL: <Crown className="w-5 h-5" />,
  AGENCY: <Building2 className="w-5 h-5" />,
  ENTERPRISE: <Building className="w-5 h-5" />
}

export function PricingTable({ 
  onPlanSelect, 
  className, 
  billingInterval = 'monthly',
  showLoadingState = true 
}: PricingTableProps) {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'database' | 'cache' | 'fallback'>('database')
  
  // Fetch pricing plans from API
  const fetchPlans = async (retryCount = 0) => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/v1/pricing/plans?format=detailed')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch pricing plans: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch pricing plans')
      }
      
      setPlans(data.data || [])
      setDataSource(data.source || 'database')
      
    } catch (err) {
      console.error('Error fetching pricing plans:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load pricing plans'
      
      // Retry once on failure
      if (retryCount === 0) {
        console.log('Retrying pricing plans fetch...')
        setTimeout(() => fetchPlans(1), 1000)
        return
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }
  
  // Fetch plans on mount
  useEffect(() => {
    fetchPlans()
  }, [])
  
  // Retry function
  const handleRetry = () => {
    fetchPlans()
  }

  const formatPrice = (priceInCents: number) => {
    if (priceInCents === 0) return 'Custom'
    const dollars = priceInCents / 100
    return `$${dollars.toLocaleString()}`
  }

  const formatLimit = (limit: number | undefined) => {
    if (limit === undefined || limit === null) return 'N/A'
    if (limit === -1) return 'Unlimited'
    return limit.toLocaleString()
  }
  
  const getPlanIcon = (planType: string) => {
    return planIcons[planType] || <Zap className="w-5 h-5" />
  }
  
  const getPriceForInterval = (plan: PricingPlan) => {
    if (billingInterval === 'yearly' && plan.yearlyPrice) {
      return plan.yearlyPrice
    }
    return plan.monthlyPrice
  }
  
  const getPriceId = (plan: PricingPlan) => {
    if (billingInterval === 'yearly' && plan.stripeYearlyPriceId) {
      return plan.stripeYearlyPriceId
    }
    return plan.stripeMonthlyPriceId
  }

  const handlePlanSelect = async (plan: PricingPlan) => {
    if (plan.planType === 'ENTERPRISE') {
      // Enterprise can trigger custom callback (e.g., contact sales)
      onPlanSelect?.(plan)
    } else {
      // All other plans use the callback or redirect to sign up
      if (onPlanSelect) {
        onPlanSelect(plan)
      } else {
        window.location.assign('/sign-up')
      }
    }
  }
  
  // Loading state
  if (loading && showLoadingState) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="relative">
              <CardHeader className="text-center space-y-2">
                <div className="animate-pulse">
                  <div className="h-6 w-16 bg-gray-200 rounded mx-auto mb-2" />
                  <div className="h-8 w-24 bg-gray-200 rounded mx-auto mb-2" />
                  <div className="h-4 w-32 bg-gray-200 rounded mx-auto mb-4" />
                  <div className="h-8 w-20 bg-gray-200 rounded mx-auto" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-4 bg-gray-200 rounded" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }
  
  // Error state
  if (error) {
    return (
      <div className={cn("space-y-6", className)}>
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <div className="space-y-2">
              <div className="font-medium">Failed to load pricing plans</div>
              <div className="text-sm">{error}</div>
              <Button 
                onClick={handleRetry}
                variant="outline"
                size="sm"
                className="mt-2 text-red-700 border-red-300 hover:bg-red-100"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  
  // No plans found
  if (!plans || plans.length === 0) {
    return (
      <div className={cn("space-y-6", className)}>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">No pricing plans available</div>
              <div className="text-sm">Please try again later or contact support.</div>
              <Button 
                onClick={handleRetry}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }


  return (
    <div className={cn("space-y-6", className)}>
      {/* Data Source Indicator */}
      {dataSource === 'fallback' && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <div className="font-medium">Using fallback pricing data</div>
            <div className="text-sm mt-1">Database is temporarily unavailable. Pricing information may not be current.</div>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Pricing Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <div 
            key={plan.id} 
            className={cn(
              "relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl transition-all duration-300 hover:border-gray-600/50 hover:scale-105",
              plan.isPopular && "ring-2 ring-blue-500/50 shadow-2xl shadow-blue-500/10 scale-105"
            )}
          >
            {plan.isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium px-4 py-1 rounded-full">
                Most Popular
              </div>
            )}
            
            <div className="p-6">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="text-blue-400">
                    {getPlanIcon(plan.planType)}
                  </div>
                  <h3 className="text-xl font-bold text-white">{plan.displayName}</h3>
                </div>
                <p className="text-gray-400 text-sm">{plan.description}</p>
                <div className="mt-4">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl font-bold text-white">{formatPrice(getPriceForInterval(plan))}</span>
                    {getPriceForInterval(plan) > 0 && (
                      <span className="text-sm text-gray-400">/{billingInterval === 'yearly' ? 'year' : 'month'}</span>
                    )}
                  </div>
                  {billingInterval === 'yearly' && plan.yearlyPrice && plan.monthlyPrice > 0 && (
                    <div className="text-xs text-green-400 mt-1">
                      Save ${(((plan.monthlyPrice * 12) - plan.yearlyPrice) / 100).toFixed(0)}/year
                    </div>
                  )}
                </div>
              </div>

              {/* Key Limits */}
              <div className="space-y-3 text-sm mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-400">Seats:</span>
                  <span className="font-medium text-white">{formatLimit(plan.limits.seats)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Saved Searches:</span>
                  <span className="font-medium text-white">{formatLimit(plan.limits.documentsPerMonth)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">AI Credits:</span>
                  <span className="font-medium text-white">
                    {plan.limits.aiCreditsPerMonth === -1 
                      ? 'Unlimited' 
                      : plan.limits.aiCreditsPerMonth === 0 
                        ? 'None' 
                        : `${plan.limits.aiCreditsPerMonth}/${billingInterval === 'yearly' ? 'year' : 'month'}`
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Match Scores:</span>
                  <span className="font-medium text-white">
                    {formatLimit(plan.limits.matchScoreCalculations)}
                    {plan.limits.matchScoreCalculations > 0 && plan.limits.matchScoreCalculations !== -1 && (
                      <span className="text-xs">/{billingInterval === 'yearly' ? 'year' : 'month'}</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3 mb-8 pt-4 border-t border-gray-700/50">
                {plan.features.list.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <Button 
                className={cn(
                  "w-full py-3 font-semibold rounded-xl transition-all duration-200",
                  plan.isPopular 
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white shadow-lg hover:shadow-xl hover:scale-105" 
                    : "bg-gray-700/50 hover:bg-gray-600/50 text-white border-gray-600/50 hover:border-gray-500/50"
                )}
                onClick={() => handlePlanSelect(plan)}
                disabled={checkoutLoading === plan.id}
              >
                {checkoutLoading === plan.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  plan.monthlyPrice === 0 ? 'Contact Sales' : 'Get Started'
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Additional Info */}
      <div className="text-center text-sm text-gray-400 space-y-2 mt-12 pt-8">
        <p>All plans include 14-day free trial • No setup fees • Cancel anytime</p>
        <p>Enterprise plans include dedicated support and custom integrations</p>
        {dataSource === 'fallback' && (
          <p className="text-yellow-400 text-xs">* Pricing shown from fallback data - actual pricing may vary</p>
        )}
      </div>
    </div>
  )
}