import { prisma } from '@/lib/prisma'
import { cacheManager } from '@/lib/cache'
import { stripe } from '@/lib/stripe-server'
import { DEFAULT_PLANS } from '@/lib/config/default-plans'

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

export class PricingService {
  private static CACHE_KEY = 'pricing:plans:all'
  private static CACHE_TTL = 3600 // 1 hour
  private static FALLBACK_CACHE_KEY = 'pricing:plans:fallback'
  private static FALLBACK_CACHE_TTL = 86400 // 24 hours

  /**
   * Get all active pricing plans with fallback support
   */
  static async getActivePlans(useFallback = true): Promise<PricingPlan[]> {
    try {
      const result = await cacheManager.withCache(
        this.CACHE_KEY,
        async () => {
          const plans = await prisma.pricingPlan.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' }
          })

          if (plans.length === 0) {
            throw new Error('No plans found in database')
          }

          return plans.map(plan => ({
            ...plan,
            features: plan.features as any,
            limits: plan.limits as any,
            metadata: plan.metadata as any,
            yearlyPrice: plan.yearlyPrice
          }))
        },
        {
          ttl: this.CACHE_TTL,
          prefix: 'pricing:'
        }
      )

      // Cache successful database result as fallback
      if (result.data && result.data.length > 0) {
        await cacheManager.set(this.FALLBACK_CACHE_KEY, result.data, {
          ttl: this.FALLBACK_CACHE_TTL,
          prefix: 'pricing:'
        })
      }

      return result.data
    } catch (error) {
      console.error('Failed to fetch pricing plans from database:', error)

      if (!useFallback) {
        throw error
      }

      // Try cached fallback first
      try {
        const fallbackResult = await cacheManager.get(this.FALLBACK_CACHE_KEY, {
          prefix: 'pricing:'
        })

        if (fallbackResult) {
          console.log('Using cached fallback pricing plans')
          return fallbackResult as PricingPlan[]
        }
      } catch (cacheError) {
        console.warn('Failed to get cached fallback plans:', cacheError)
      }

      // Final fallback to default plans
      console.log('Using default pricing plans as fallback')
      return this.convertDefaultPlansToFormat(DEFAULT_PLANS)
    }
  }

  /**
   * Get a specific plan by type
   */
  static async getPlanByType(planType: string): Promise<PricingPlan | null> {
    const plans = await this.getActivePlans()
    return plans.find(plan => plan.planType === planType) || null
  }

  /**
   * Get a plan by Stripe price ID
   */
  static async getPlanByStripePrice(stripePriceId: string): Promise<PricingPlan | null> {
    const plans = await this.getActivePlans()
    return plans.find(plan =>
      plan.stripeMonthlyPriceId === stripePriceId ||
      plan.stripeYearlyPriceId === stripePriceId
    ) || null
  }

  /**
   * Get plan limits for a specific plan type
   */
  static async getPlanLimits(planType: string): Promise<PricingPlan['limits'] | null> {
    const plan = await this.getPlanByType(planType)
    return plan?.limits || null
  }

  /**
   * Compare two plans
   */
  static async comparePlans(planType1: string, planType2: string): Promise<{
    plan1: PricingPlan | null
    plan2: PricingPlan | null
    differences: {
      feature: string
      plan1Value: any
      plan2Value: any
    }[]
  }> {
    const [plan1, plan2] = await Promise.all([
      this.getPlanByType(planType1),
      this.getPlanByType(planType2)
    ])

    const differences: any[] = []

    if (plan1 && plan2) {
      // Compare prices
      if (plan1.monthlyPrice !== plan2.monthlyPrice) {
        differences.push({
          feature: 'Monthly Price',
          plan1Value: `$${plan1.monthlyPrice / 100}`,
          plan2Value: `$${plan2.monthlyPrice / 100}`
        })
      }

      // Compare limits
      const allLimitKeys = new Set([
        ...Object.keys(plan1.limits),
        ...Object.keys(plan2.limits)
      ])

      allLimitKeys.forEach(key => {
        const val1 = plan1.limits[key]
        const val2 = plan2.limits[key]
        if (val1 !== val2) {
          differences.push({
            feature: this.formatLimitKey(key),
            plan1Value: val1 === -1 ? 'Unlimited' : val1,
            plan2Value: val2 === -1 ? 'Unlimited' : val2
          })
        }
      })

      // Compare feature counts
      if (plan1.features.list.length !== plan2.features.list.length) {
        differences.push({
          feature: 'Number of Features',
          plan1Value: plan1.features.list.length,
          plan2Value: plan2.features.list.length
        })
      }
    }

    return { plan1, plan2, differences }
  }

  /**
   * Check if a plan supports a specific feature
   */
  static async planSupportsFeature(planType: string, feature: string): Promise<boolean> {
    const plan = await this.getPlanByType(planType)
    if (!plan) return false

    // Check in feature list
    if (plan.features.list.some(f => f.toLowerCase().includes(feature.toLowerCase()))) {
      return true
    }

    // Check in detailed features
    if (plan.features.detailed && plan.features.detailed[feature]) {
      return true
    }

    return false
  }

  /**
   * Get the next upgrade plan for a given plan type
   */
  static async getUpgradePath(currentPlanType: string): Promise<PricingPlan | null> {
    const plans = await this.getActivePlans()
    const currentPlan = plans.find(p => p.planType === currentPlanType)

    if (!currentPlan) return null

    // Find the next plan by display order with higher price
    const upgradePlans = plans
      .filter(p =>
        p.displayOrder > currentPlan.displayOrder &&
        p.monthlyPrice > currentPlan.monthlyPrice &&
        p.planType !== 'ENTERPRISE' // Don't auto-suggest enterprise
      )
      .sort((a, b) => a.displayOrder - b.displayOrder)

    return upgradePlans[0] || null
  }

  /**
   * Validate if a subscription can be created with a plan
   */
  static async validatePlanForSubscription(planType: string): Promise<{
    valid: boolean
    error?: string
    plan?: PricingPlan
  }> {
    const plan = await this.getPlanByType(planType)

    if (!plan) {
      return { valid: false, error: 'Plan not found' }
    }

    if (!plan.isActive) {
      return { valid: false, error: 'Plan is not active' }
    }

    if (plan.planType === 'ENTERPRISE' && !plan.stripeMonthlyPriceId) {
      return { valid: false, error: 'Enterprise plans require custom setup' }
    }

    if (plan.monthlyPrice > 0 && !plan.stripeMonthlyPriceId) {
      return { valid: false, error: 'Plan is missing Stripe price configuration' }
    }

    return { valid: true, plan }
  }

  /**
   * Get plan recommendation based on usage
   */
  static async recommendPlan(requirements: {
    seats: number
    documentsPerMonth: number
    aiCreditsNeeded: boolean
    matchScoresPerMonth: number
  }): Promise<PricingPlan | null> {
    const plans = await this.getActivePlans()

    // Filter plans that meet requirements
    const suitablePlans = plans.filter(plan => {
      if (plan.planType === 'ENTERPRISE') return false // Don't auto-recommend enterprise

      const meetsSeats = plan.limits.seats === -1 || plan.limits.seats >= requirements.seats
      const meetsFilters = plan.limits.documentsPerMonth === -1 || plan.limits.documentsPerMonth >= requirements.documentsPerMonth
      const meetsAI = !requirements.aiCreditsNeeded || plan.limits.aiCreditsPerMonth > 0
      const meetsMatchScores = plan.limits.matchScoreCalculations === -1 ||
                               plan.limits.matchScoreCalculations >= requirements.matchScoresPerMonth

      return meetsSeats && meetsFilters && meetsAI && meetsMatchScores
    })

    // Return the most affordable suitable plan
    return suitablePlans.sort((a, b) => a.monthlyPrice - b.monthlyPrice)[0] || null
  }

  /**
   * Convert default plans to PricingPlan format
   */
  private static convertDefaultPlansToFormat(defaultPlans: typeof DEFAULT_PLANS): PricingPlan[] {
    // Map plan keys to Stripe price IDs from environment variables
    const priceIdMap: Record<string, string | undefined> = {
      'STARTER': process.env.STRIPE_PRICE_STARTER,
      'PROFESSIONAL': process.env.STRIPE_PRICE_PROFESSIONAL,
      'AGENCY': process.env.STRIPE_PRICE_AGENCY,
    };

    return Object.entries(defaultPlans).map(([key, plan], index) => ({
      id: plan.id || key.toLowerCase(),
      planType: key,
      displayName: plan.name,
      description: plan.description,
      monthlyPrice: plan.price * 100, // Convert to cents
      yearlyPrice: null,
      currency: 'USD',
      features: {
        list: [...plan.features],
      },
      limits: {
        seats: plan.limits.seats,
        documentsPerMonth: plan.limits.documentsPerMonth,
        aiCreditsPerMonth: plan.limits.aiCreditsPerMonth,
        matchScoreCalculations: 0,
        savedSearches: 0,
        apiCallsPerMonth: -1,
        exportLimit: -1
      },
      isActive: true,
      isPopular: key === 'PROFESSIONAL',
      displayOrder: index,
      metadata: null,
      stripeMonthlyPriceId: priceIdMap[key] || null,
      stripeYearlyPriceId: null
    }))
  }

  /**
   * Get plans formatted for Stripe operations
   */
  static async getStripeFormattedPlans(): Promise<Record<string, {
    priceId: string | null;
    name: string;
    price: number;
    interval: string;
    features: string[];
    limits: PricingPlan['limits'];
  }>> {
    const plans = await this.getActivePlans()
    const result: Record<string, any> = {}

    plans.forEach(plan => {
      result[plan.planType] = {
        priceId: plan.stripeMonthlyPriceId,
        name: plan.displayName,
        price: plan.monthlyPrice / 100, // Convert from cents
        interval: 'month',
        features: plan.features.list,
        limits: plan.limits
      }
    })

    return result
  }

  /**
   * Invalidate pricing cache (call after updates)
   */
  static async invalidateCache(): Promise<void> {
    await cacheManager.invalidate(this.CACHE_KEY)
    await cacheManager.invalidate(this.FALLBACK_CACHE_KEY)
  }

  /**
   * Refresh pricing data from database and update cache
   */
  static async refreshPricingData(): Promise<PricingPlan[]> {
    await this.invalidateCache()
    return await this.getActivePlans(false) // Force database fetch without fallback
  }

  /**
   * Check if database is available for pricing operations
   */
  static async isDatabaseAvailable(): Promise<boolean> {
    try {
      await prisma.pricingPlan.findFirst()
      return true
    } catch (error) {
      console.warn('Database unavailable for pricing operations:', error)
      return false
    }
  }

  /**
   * Format limit key for display
   */
  private static formatLimitKey(key: string): string {
    const formatMap: Record<string, string> = {
      seats: 'User Seats',
      documentsPerMonth: 'Saved Filters',
      aiCreditsPerMonth: 'AI Credits/Month',
      matchScoreCalculations: 'Match Score Calculations',
      apiCallsPerMonth: 'API Calls/Month',
      exportLimit: 'Export Limit'
    }

    return formatMap[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
  }

  /**
   * Create Stripe checkout session with dynamic pricing
   */
  static async createCheckoutSession(
    planType: string,
    customerId: string,
    successUrl: string,
    cancelUrl: string,
    billingInterval: 'monthly' | 'yearly' = 'monthly'
  ): Promise<string> {
    const plan = await this.getPlanByType(planType)

    if (!plan) {
      throw new Error('Plan not found')
    }

    const priceId = billingInterval === 'yearly'
      ? plan.stripeYearlyPriceId
      : plan.stripeMonthlyPriceId

    if (!priceId) {
      throw new Error(`No ${billingInterval} price configured for plan ${planType}`)
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        planType: plan.planType,
        billingInterval
      },
      subscription_data: {
        metadata: {
          planType: plan.planType,
          billingInterval
        }
      },
      allow_promotion_codes: true
    })

    return checkoutSession.url || ''
  }
}
