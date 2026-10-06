import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe-server'
import { PricingService } from '@/lib/pricing-service'
import type Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'
import { isPlatformAdmin } from '@/lib/security/platform-admin'
import { cacheManager } from '@/lib/cache'
import { prisma } from '@/lib/prisma'

/**
 * @swagger
 * /api/pricing:
 *   get:
 *     summary: Get current pricing plans
 *     description: Retrieve all active pricing plans with current pricing from Stripe and database
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: Pricing plans retrieved successfully
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
 *                         example: "professional"
 *                       name:
 *                         type: string
 *                         example: "Professional"
 *                       description:
 *                         type: string
 *                         example: "Perfect for growing businesses"
 *                       price:
 *                         type: number
 *                         example: 49.99
 *                       priceId:
 *                         type: string
 *                         example: "price_123"
 *                       interval:
 *                         type: string
 *                         example: "month"
 *                       features:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["Advanced search", "Priority support"]
 *                       limits:
 *                         type: object
 *                         properties:
 *                           apiRequests:
 *                             type: number
 *                           aiQueries:
 *                             type: number
 *                       popular:
 *                         type: boolean
 *                         example: true
 *                       cta:
 *                         type: string
 *                         example: "Get Started"
 *                 cached:
 *                   type: boolean
 *                   example: true
 *   delete:
 *     summary: Clear pricing cache
 *     description: Admin endpoint to invalidate pricing cache when pricing changes
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: Pricing cache cleared successfully
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
 *                   example: "Pricing cache cleared successfully"
 *       500:
 *         description: Failed to clear cache
 */

async function fetchPricingData() {
  const plans = await PricingService.getActivePlans();
  const prices = new Map<string, Stripe.Price>();
  try {
    if (stripe) for (const price of (await stripe.prices.list({ active: true, limit: 100 })).data) prices.set(price.id, price);
  } catch (error) { console.error('Could not refresh Stripe prices:', error); }
  return plans.map(plan => {
    const price = plan.stripeMonthlyPriceId ? prices.get(plan.stripeMonthlyPriceId) : undefined;
    return {
      id: plan.planType.toLowerCase(), name: plan.displayName, description: plan.description,
      price: price?.unit_amount != null ? price.unit_amount / 100 : plan.monthlyPrice / 100,
      priceId: plan.stripeMonthlyPriceId ?? null, interval: 'month', features: plan.features.list,
      limits: plan.limits, popular: plan.isPopular, displayOrder: plan.displayOrder,
      cta: plan.planType === 'ENTERPRISE' ? 'Contact Sales' : 'Get Started',
      stripePriceData: price ? { currency: price.currency, interval: price.recurring?.interval, intervalCount: price.recurring?.interval_count } : null,
      yearlyPrice: plan.yearlyPrice != null ? plan.yearlyPrice / 100 : null,
      yearlyPriceId: plan.stripeYearlyPriceId ?? null, metadata: plan.metadata ?? null,
    };
  });
}

export async function GET() {
  try {
    // Use cache with 24-hour TTL and smart invalidation
    const result = await cacheManager.withCache(
      'pricing:plans',
      fetchPricingData,
      {
        ttl: 86400, // 24 hours
        prefix: 'pricing:'
      }
    )

    return NextResponse.json({
      success: true,
      data: result.data,
      cached: result.cached
    })

  } catch (error) {
    console.error('Error fetching pricing data:', error)

    return NextResponse.json({ success: false, error: 'Pricing is unavailable' }, { status: 503 });
  }
}

// Admin endpoint to invalidate pricing cache (for when pricing changes)
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPlatformAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await cacheManager.invalidate('pricing:plans')

    return NextResponse.json({
      success: true,
      message: 'Pricing cache cleared successfully'
    })
  } catch (error) {
    console.error('Error clearing pricing cache:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to clear pricing cache'
    }, { status: 500 })
  }
}
