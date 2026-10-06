import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isPlatformAdmin } from '@/lib/security/platform-admin'
import { type PricingPlan, PricingService } from '@/lib/pricing-service'

/**
 * @swagger
 * /api/v1/pricing/plans:
 *   get:
 *     summary: Get all active pricing plans
 *     description: Returns all active pricing plans from the database with fallback to default plans
 *     tags: [Pricing]
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [detailed, stripe, simple]
 *         description: Response format (detailed=full plan data, stripe=stripe-compatible, simple=basic info)
 *       - in: query
 *         name: useFallback
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Whether to use fallback plans if database is unavailable
 *     responses:
 *       200:
 *         description: Successfully retrieved pricing plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       planType:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       description:
 *                         type: string
 *                       monthlyPrice:
 *                         type: number
 *                       yearlyPrice:
 *                         type: number
 *                         nullable: true
 *                       currency:
 *                         type: string
 *                       features:
 *                         type: object
 *                       limits:
 *                         type: object
 *                       isActive:
 *                         type: boolean
 *                       isPopular:
 *                         type: boolean
 *                       displayOrder:
 *                         type: number
 *                       stripeMonthlyPriceId:
 *                         type: string
 *                         nullable: true
 *                       stripeYearlyPriceId:
 *                         type: string
 *                         nullable: true
 *                 source:
 *                   type: string
 *                   enum: [database, cache, fallback]
 *                   description: Source of the pricing data
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'detailed'
    const useFallback = searchParams.get('useFallback') !== 'false'

    let plans: PricingPlan[]
    let source = 'database'

    try {
      // Try to get plans from database
      plans = await PricingService.getActivePlans(useFallback)
    } catch (error) {
      if (!useFallback) {
        throw error
      }

      // This should not happen as getActivePlans with fallback should always return data
      console.error('Unexpected error getting pricing plans:', error)
      source = 'fallback'
      plans = []
    }

    // Determine actual source
    const isDatabaseAvailable = await PricingService.isDatabaseAvailable()
    if (!isDatabaseAvailable) {
      source = 'fallback'
    }

    // Format response based on requested format
    let responseData: unknown = plans

    if (format === 'stripe') {
      // Format for Stripe compatibility (legacy SUBSCRIPTION_PLANS format)
      const stripeFormatted: Record<string, any> = {}
      plans.forEach(plan => {
        stripeFormatted[plan.planType] = {
          id: plan.id,
          name: plan.displayName,
          description: plan.description,
          price: plan.monthlyPrice / 100, // Convert from cents to dollars
          priceId: plan.stripeMonthlyPriceId,
          interval: 'month',
          features: plan.features.list,
          limits: {
            seats: plan.limits.seats,
            savedSearches: plan.limits.documentsPerMonth,
            aiCreditsPerMonth: plan.limits.aiCreditsPerMonth,
            matchScoreCalculations: plan.limits.matchScoreCalculations ?? 0
          }
        }
      })
      responseData = stripeFormatted
    } else if (format === 'simple') {
      // Simple format with just essential info
      responseData = plans.map(plan => ({
        id: plan.id,
        planType: plan.planType,
        name: plan.displayName,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        currency: plan.currency,
        isPopular: plan.isPopular,
        features: plan.features.list,
        limits: plan.limits
      }))
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      source,
      count: plans.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching pricing plans:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch pricing plans',
      timestamp: new Date().toISOString()
    }, {
      status: 500
    })
  }
}

/**
 * @swagger
 * /api/v1/pricing/plans:
 *   post:
 *     summary: Refresh pricing plans cache
 *     description: Forces a refresh of pricing plans from the database and clears cache
 *     tags: [Pricing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Pricing cache refreshed successfully"
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPlatformAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {

    console.log('Refreshing pricing plans cache...')
    const plans = await PricingService.refreshPricingData()

    return NextResponse.json({
      success: true,
      message: 'Pricing cache refreshed successfully',
      count: plans.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error refreshing pricing cache:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh pricing cache',
      timestamp: new Date().toISOString()
    }, {
      status: 500
    })
  }
}
