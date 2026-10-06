import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { stripe } from '@/lib/stripe-server'
import { getSubscriptionPlans } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { priceId, planId } = await req.json()

    if (!priceId || !planId) {
      return NextResponse.json(
        { success: false, error: 'Missing priceId or planId' },
        { status: 400 }
      )
    }

    // Validate that the plan exists
    const plans = await getSubscriptionPlans();
    const plan = Object.values(plans).find(p => p.id === planId)
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Invalid plan' },
        { status: 400 }
      )
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.nextUrl.origin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/?canceled=true`,
      metadata: {
        userId,
        planId,
      },
      subscription_data: {
        metadata: {
          userId,
          planId,
        },
        trial_period_days: 14, // 14-day free trial
      },
      customer_email: undefined, // Let Stripe handle this
      allow_promotion_codes: true,
    })

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      }
    })

  } catch (error) {
    console.error('Checkout error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An error occurred during checkout'
      },
      { status: 500 }
    )
  }
}
