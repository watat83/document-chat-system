import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe-server';
import { createErrorResponse } from '@/lib/api-errors';

/**
 * Debug endpoint to check Stripe configuration and customer setup
 * Only available in development mode
 */
export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return createErrorResponse('Not available in production', 404);
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Unauthorized', 401);
    }

    const user = await currentUser();
    if (!user) {
      return createErrorResponse('User not found', 404);
    }

    // Get user's organization
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true }
    });

    if (!dbUser) {
      return createErrorResponse('User not found in database', 404);
    }

    const organization = await db.organization.findUnique({
      where: { id: dbUser.organizationId },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' }, take: 1,
          select: {
            id: true,
            status: true,
            stripeSubscriptionId: true,
            stripePriceId: true,
            currentPeriodEnd: true
          }
        }
      }
    });

    const debugInfo = {
      environment: process.env.NODE_ENV,
      stripe: {
        configured: !!process.env.STRIPE_SECRET_KEY,
        publicKeyConfigured: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
        customerExists: undefined as boolean | undefined,
        customerEmail: undefined as string | null | undefined,
        customerError: undefined as string | undefined,
        customerErrorCode: undefined as string | undefined,
      },
      organization: {
        exists: !!organization,
        id: organization?.id,
        name: organization?.name,
        stripeCustomerId: organization?.stripeCustomerId,
        hasSubscription: !!organization?.subscriptions[0],
        subscriptionStatus: organization?.subscriptions[0]?.status,
        subscriptionId: organization?.subscriptions[0]?.stripeSubscriptionId,
      },
      user: {
        clerkId: user.id,
        email: user.emailAddresses[0]?.emailAddress,
        organizationId: dbUser.organizationId,
      }
    };

    // Test Stripe connection if customer exists
    if (organization?.stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(organization.stripeCustomerId);
        debugInfo.stripe = {
          ...debugInfo.stripe,
          customerExists: !customer.deleted,
          customerEmail: (customer as any).email,
        };
      } catch (stripeError: any) {
        debugInfo.stripe = {
          ...debugInfo.stripe,
          customerError: stripeError.message,
          customerErrorCode: stripeError.code,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: debugInfo,
      message: 'Debug information retrieved successfully'
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Debug check failed',
      500
    );
  }
}
