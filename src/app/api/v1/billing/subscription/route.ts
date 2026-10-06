import { getSubscriptionPeriod } from '@/lib/billing/subscription-period';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe-server';
import { getSubscriptionPlans, type SubscriptionPlan } from '@/lib/stripe';
import { createErrorResponse, handleApiError } from '@/lib/api-errors';
import { SubscriptionManager } from '@/lib/subscription-manager';
import { SubscriptionSync } from '@/lib/subscription-sync';
import { UsageTrackingService } from '@/lib/usage-tracking';
import { cacheManager } from '@/lib/cache';
import { z } from 'zod';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';

/**
 * @swagger
 * /api/billing/subscription:
 *   get:
 *     summary: Get current subscription details
 *     description: Retrieves the current subscription information for the authenticated organization
 *     tags: [Billing]
 *     security:
 *       - ClerkAuth: []
 *     responses:
 *       200:
 *         description: Subscription details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     planType:
 *                       type: string
 *                       enum: [STARTER, PROFESSIONAL, ENTERPRISE]
 *                     status:
 *                       type: string
 *                     currentPeriodEnd:
 *                       type: string
 *                       format: date-time
 *                     cancelAtPeriodEnd:
 *                       type: boolean
 *                     amount:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     interval:
 *                       type: string
 *                     features:
 *                       type: array
 *                       items:
 *                         type: string
 *                     limits:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No subscription found
 *       500:
 *         description: Internal server error
 */
// Extract subscription data fetching logic for caching
async function fetchSubscriptionData(organizationId: string) {
  // Check if Stripe is configured
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey || stripeKey.length < 10) {
    console.warn('[SUBSCRIPTION] Stripe is not configured properly, returning empty subscription');
    return {
      subscription: null,
      hasActiveSubscription: false,
      trialStatus: null,
      usageData: null,
      nextBilling: null,
      planFeatures: null,
      billingHistory: []
    };
  }

  // **ENHANCED**: Use smart sync to ensure fresh data
  console.log('🔍 Getting current subscription with smart sync...');

  const smartSyncResult = await SubscriptionSync.smartSync(organizationId, 5); // 5 minute freshness
  const subscription = smartSyncResult.subscription;

  if (!subscription) {
    console.log('No active subscription found in database');
    return {
      subscription: null,
      hasActiveSubscription: false,
      trialStatus: null,
      usageData: null,
      nextBilling: null,
      planFeatures: null,
      billingHistory: []
    };
  }

  if (smartSyncResult.synced) {
    console.log('✅ Subscription data refreshed from Stripe');
  }

  console.log(`Found active subscription: ${subscription.id} (${subscription.planType}, ${subscription.status})`);

  // **ENHANCEMENT**: Check if there are multiple subscriptions and clean them up
  const allActiveSubscriptions = await db.subscription.findMany({
    where: {
      organizationId,
      status: {
        in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
      }
    }
  });

  if (allActiveSubscriptions.length > 1) {
    console.warn(`Multiple active subscriptions found (${allActiveSubscriptions.length}), cleaning up in background...`);

    // Clean up duplicates in background using SubscriptionManager
    SubscriptionManager.cleanupExistingSubscriptions(
      organizationId,
      undefined, // Don't need Stripe customer ID for database-only cleanup
      subscription.stripeSubscriptionId // Keep the current one
    ).catch(error => {
      console.error('Background cleanup failed:', error);
    });
  }

  // Ensure organization plan type matches the active subscription
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { planType: true }
  });

  if (organization && organization.planType !== subscription.planType) {
    console.log(`Fixing organization plan type mismatch: ${organization.planType} -> ${subscription.planType}`);

    // Update organization plan type to match active subscription (background operation)
    db.organization.update({
      where: { id: organizationId },
      data: { planType: subscription.planType }
    }).catch(error => {
      console.error('Failed to update organization plan type:', error);
    });
  }

  // Get plan details
  const plans = await getSubscriptionPlans();
  const planDetails = plans[subscription.planType as SubscriptionPlan];

  return {
    subscription: {
      id: subscription.id,
      planType: subscription.planType,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialStart: subscription.trialStart,
      trialEnd: subscription.trialEnd,
      amount: subscription.amount,
      currency: subscription.currency,
      interval: subscription.interval,
      features: subscription.features,
      limits: subscription.limits,
      planDetails
    }
  };
}

export async function GET() {
  try {
    console.log('[SUBSCRIPTION API] Starting GET request');

    const { userId } = await auth();
    if (!userId) {
      console.log('[SUBSCRIPTION API] No userId from auth');
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    console.log('[SUBSCRIPTION API] Got userId:', userId);

    const user = await currentUser();
    if (!user) {
      console.log('[SUBSCRIPTION API] No user from currentUser()');
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    console.log('[SUBSCRIPTION API] Got current user');

    // Get user's organization from database
    console.log('[SUBSCRIPTION API] Fetching user from database...');
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true }
    });

    if (!dbUser) {
      console.log('[SUBSCRIPTION API] User not found in database');
      return createErrorResponse('User not found in database', 404, 'USER_NOT_FOUND');
    }

    let organizationId = dbUser.organizationId;
    console.log('[SUBSCRIPTION API] Organization ID:', organizationId);

    // **AUTO-FIX**: If user doesn't have organization, create one automatically
    if (!organizationId) {
      console.log('[SUBSCRIPTION API] No organization ID for user, creating one...');

      try {
        // First check if an organization was created by another concurrent request
        const refreshedUser = await db.user.findUnique({
          where: { clerkId: user.id },
          select: { organizationId: true }
        });

        if (refreshedUser?.organizationId) {
          console.log('[SUBSCRIPTION API] Organization created by concurrent request:', refreshedUser.organizationId);
          organizationId = refreshedUser.organizationId;
        } else {
          // Create organization with unique slug
          const organization = await db.organization.create({
            data: {
              name: `${user.firstName || 'User'} ${user.lastName || 'Organization'}`,
              slug: `org-${userId.slice(0, 12)}-${Date.now()}`,
            }
          });

          console.log('[SUBSCRIPTION API] Created organization:', organization.id);

          // Update user with organization
          await db.user.update({
            where: { clerkId: user.id },
            data: { organizationId: organization.id }
          });

          organizationId = organization.id;
          console.log('[SUBSCRIPTION API] Updated user with organization');
        }
      } catch (orgError: any) {
        console.error('[SUBSCRIPTION API] Failed to create organization:', orgError);

        // Check if it's a unique constraint error - another request might have created it
        if (orgError.code === 'P2002') {
          console.log('[SUBSCRIPTION API] Unique constraint error, re-fetching user...');
          const refreshedUser = await db.user.findUnique({
            where: { clerkId: user.id },
            select: { organizationId: true }
          });

          if (refreshedUser?.organizationId) {
            organizationId = refreshedUser.organizationId;
            console.log('[SUBSCRIPTION API] Found organization after constraint error:', organizationId);
          } else {
            return createErrorResponse('Failed to create organization', 500, 'ORGANIZATION_CREATION_FAILED');
          }
        } else {
          return createErrorResponse('Failed to create organization', 500, 'ORGANIZATION_CREATION_FAILED');
        }
      }
    }

    // **NO CACHE** - Always fetch fresh subscription data for immediate updates
    console.log('[SUBSCRIPTION API] Fetching fresh subscription data (cache disabled)');
    const result = await fetchSubscriptionData(organizationId);

    console.log('[SUBSCRIPTION API] Got subscription data:', {
      hasSubscription: !!result.subscription,
      planType: result.subscription?.planType
    });

    // Log subscription read operation for audit trail
    if (result.subscription) {
      try {
        await crudAuditLogger.logBillingOperation(
          'READ',
          result.subscription.id,
          result.subscription.planType || 'Unknown Plan',
          null,
          { subscriptionId: result.subscription.id, status: result.subscription.status },
          {
            endpoint: '/api/v1/billing/subscription',
            method: 'GET',
            organizationId,
            hasActiveSubscription: !!result.subscription
          }
        );
      } catch (auditError) {
        console.error('[SUBSCRIPTION API] Failed to create subscription read audit log:', auditError);
      }
    }

    console.log('[SUBSCRIPTION API] Returning success response');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[SUBSCRIPTION API] Error fetching subscription:', error);
    console.error('[SUBSCRIPTION API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[SUBSCRIPTION API] Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('[SUBSCRIPTION API] Error message:', error instanceof Error ? error.message : 'Unknown');

    // Return empty subscription data as fallback instead of failing
    return NextResponse.json({
      subscription: null,
      hasActiveSubscription: false,
      trialStatus: null,
      usageData: null,
      nextBilling: null,
      planFeatures: null,
      billingHistory: [],
      error: 'Failed to fetch subscription data'
    });
  }
}

const createSubscriptionSchema = z.object({
  planType: z.enum(['STARTER', 'PROFESSIONAL', 'AGENCY', 'ENTERPRISE'])
    .describe("Subscription plan type to create. Determines features, limits, and pricing. STARTER for small businesses, PROFESSIONAL for growing companies, AGENCY for service providers, ENTERPRISE for large organizations."),
  paymentMethodId: z.string().optional()
    .describe("Stripe payment method ID for immediate payment processing. Optional - if not provided, user will be redirected to Stripe checkout for payment method collection."),
  successUrl: z.string().url().optional()
    .describe("URL to redirect user after successful subscription creation. Optional - defaults to /billing?success=true if not provided."),
  cancelUrl: z.string().url().optional()
    .describe("URL to redirect user if subscription creation is canceled. Optional - defaults to /billing?canceled=true if not provided.")
})
  .describe("Schema for creating new subscription requests. Handles plan selection, payment processing, and redirect URL configuration.");

/**
 * @swagger
 * /api/billing/subscription:
 *   post:
 *     summary: Create a new subscription
 *     description: Creates a new subscription for the authenticated organization
 *     tags: [Billing]
 *     security:
 *       - ClerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planType
 *             properties:
 *               planType:
 *                 type: string
 *                 enum: [STARTER, PROFESSIONAL, ENTERPRISE]
 *               paymentMethodId:
 *                 type: string
 *                 description: Stripe payment method ID
 *               successUrl:
 *                 type: string
 *                 format: uri
 *                 description: URL to redirect after successful payment
 *               cancelUrl:
 *                 type: string
 *                 format: uri
 *                 description: URL to redirect after canceled payment
 *     responses:
 *       200:
 *         description: Subscription created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 checkoutUrl:
 *                   type: string
 *                   description: Stripe checkout session URL
 *                 subscriptionId:
 *                   type: string
 *                   description: Created subscription ID
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/billing/subscription - Starting subscription creation');

    // Check if Stripe is configured
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeKey || stripeKey.length < 10) {
      return createErrorResponse('Stripe is not configured. Please contact support to enable billing.', 503, 'STRIPE_NOT_CONFIGURED');
    }

    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const user = await currentUser();
    if (!user) {
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    const body = await request.json();
    const validatedData = createSubscriptionSchema.parse(body);

    console.log('Subscription request data:', { planType: validatedData.planType, userId: user.id });

    // Get user's organization from database
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true }
    });

    if (!dbUser) {
      return createErrorResponse('User not found in database', 404, 'USER_NOT_FOUND');
    }

    const organizationId = dbUser.organizationId;

    if (!organizationId) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    const organization = await db.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    console.log('Organization found:', { id: organizationId, name: organization.name, stripeCustomerId: organization.stripeCustomerId });

    // **CRITICAL FIX**: Check for existing active subscriptions BEFORE creating new ones
    console.log('🔍 Checking for existing active subscriptions...');

    const existingActiveSubscriptions = await db.subscription.findMany({
      where: {
        organizationId,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
        }
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    console.log(`Found ${existingActiveSubscriptions.length} existing active subscriptions`);

    // Check if user already has the requested plan
    const existingPlan = existingActiveSubscriptions.find(sub =>
      sub.planType === validatedData.planType && !sub.cancelAtPeriodEnd
    );

    if (existingPlan) {
      console.log(`User already has ${validatedData.planType} plan:`, existingPlan.id);
      return createErrorResponse(
        `You already have an active ${validatedData.planType} subscription. Please manage your existing subscription instead.`,
        400,
        'SUBSCRIPTION_ALREADY_EXISTS',
        { existingSubscriptionId: existingPlan.id }
      );
    }

    // Check if organization has Stripe customer and validate it exists in Stripe
    let customerId = organization.stripeCustomerId;
    let stripeCustomer = null;

    if (customerId) {
      // Verify customer exists in Stripe
      try {
        stripeCustomer = await stripe.customers.retrieve(customerId);
        console.log('Existing Stripe customer found:', customerId);
      } catch (error) {
        console.warn('Stripe customer not found, will create new one:', error);
        customerId = null;
      }
    }

    // Create or get Stripe customer
    if (!customerId) {
      console.log('Creating new Stripe customer...');
      const customer = await stripe.customers.create({
        email: organization.billingEmail || user.emailAddresses[0]?.emailAddress,
        name: organization.name,
        metadata: {
          organizationId,
          userId: user.id,
        },
      });

      customerId = customer.id;
      stripeCustomer = customer;

      // Update organization with customer ID
      await db.organization.update({
        where: { id: organizationId },
        data: { stripeCustomerId: customerId }
      });

      console.log('New Stripe customer created:', customerId);
    }

    // **ENHANCEMENT**: Clean up any existing Stripe subscriptions before creating new one
    if (customerId) {
      console.log('🧹 Cleaning up existing Stripe subscriptions...');

      const existingStripeSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100
      });

      const activeStripeSubscriptions = existingStripeSubscriptions.data.filter(sub =>
        ['active', 'trialing', 'past_due'].includes(sub.status)
      );

      console.log(`Found ${activeStripeSubscriptions.length} active Stripe subscriptions to clean up`);

      // Cancel all active Stripe subscriptions
      for (const stripeSub of activeStripeSubscriptions) {
        try {
          console.log(`🗑️ Canceling existing Stripe subscription: ${stripeSub.id}`);
          await stripe.subscriptions.cancel(stripeSub.id);
          console.log(`✅ Canceled: ${stripeSub.id}`);
        } catch (error) {
          console.warn(`⚠️ Failed to cancel Stripe subscription ${stripeSub.id}:`, error);
        }
      }

      // Cancel all active database subscriptions
      for (const dbSub of existingActiveSubscriptions) {
        try {
          console.log(`🗑️ Canceling database subscription: ${dbSub.id}`);
          await db.subscription.update({
            where: { id: dbSub.id },
            data: {
              status: 'CANCELED',
              cancelAtPeriodEnd: true,
              canceledAt: new Date(),
              updatedAt: new Date(),
            }
          });
          console.log(`✅ Database subscription canceled: ${dbSub.id}`);
        } catch (error) {
          console.warn(`⚠️ Failed to cancel database subscription ${dbSub.id}:`, error);
        }
      }
    }

    // Get plan details
    const plans = await getSubscriptionPlans();
    const planDetails = plans[validatedData.planType as SubscriptionPlan];
    if (!planDetails) {
      return createErrorResponse('Invalid plan type', 400, 'INVALID_PLAN');
    }

    // Use the real Stripe price IDs
    if (!planDetails.priceId) {
      return createErrorResponse('Price not configured for this plan. Please contact support.', 400, 'PRICE_NOT_CONFIGURED');
    }

    console.log('Creating checkout session for plan:', {
      planType: validatedData.planType,
      priceId: planDetails.priceId,
      customerId
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: planDetails.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: validatedData.successUrl || `${request.headers.get('origin')}/billing?success=true`,
      cancel_url: validatedData.cancelUrl || `${request.headers.get('origin')}/billing?canceled=true`,
      subscription_data: {
        trial_period_days: 14, // 14-day trial
      },
      metadata: {
        organizationId,
        planType: validatedData.planType,
        userId: user.id,
        action: 'new_subscription',
        cleanedUpSubscriptions: existingActiveSubscriptions.length.toString(),
      },
    });

    console.log('✅ Checkout session created:', {
      sessionId: checkoutSession.id,
      cleanedUpSubscriptions: existingActiveSubscriptions.length
    });

    // **IMMEDIATE SYNC**: Trigger background sync after checkout session creation
    // Note: No cache to clear since subscription caching is disabled for immediate updates

    // This replaces webhook dependency with proactive syncing
    SubscriptionSync.syncAfterStripeOperation(organizationId, {
      delay: 3000, // Wait 3 seconds for Stripe to process
      backgroundSync: true, // Don't block response
      retries: 3
    }).catch(error => {
      console.warn('Background sync after checkout failed:', error);
    });

    // Log subscription creation initiation for audit trail
    try {
      await crudAuditLogger.logBillingOperation(
        'CREATE',
        checkoutSession.id,
        validatedData.planType,
        null,
        {
          checkoutSessionId: checkoutSession.id,
          planType: validatedData.planType,
          status: 'checkout_initiated'
        },
        {
          endpoint: '/api/v1/billing/subscription',
          method: 'POST',
          organizationId,
          checkoutUrl: checkoutSession.url,
          cleanedExistingSubscriptions: existingActiveSubscriptions.length
        }
      );
    } catch (auditError) {
      console.error('Failed to create subscription creation audit log:', auditError);
    }

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      message: existingActiveSubscriptions.length > 0
        ? `Cleaned up ${existingActiveSubscriptions.length} existing subscription(s) before creating new one.`
        : 'Subscription creation initiated.'
    });

  } catch (error) {
    console.error('Error creating subscription:', error);
    return handleApiError(error);
  }
}

const updateSubscriptionSchema = z.object({
  planType: z.enum(['STARTER', 'PROFESSIONAL', 'AGENCY', 'ENTERPRISE']).optional()
    .describe("New subscription plan type for plan changes. Optional - if provided, triggers plan change flow through Stripe checkout. Used for upgrading/downgrading subscriptions."),
  cancelAtPeriodEnd: z.boolean().optional()
    .describe("Whether to cancel subscription at the end of current billing period. Optional - true schedules cancellation, false reactivates if previously scheduled for cancellation.")
})
  .describe("Schema for updating existing subscriptions. Handles plan changes and cancellation scheduling while preserving billing periods and usage data.");

/**
 * Billing subscription management schemas for Stripe integration.
 *
 * Features:
 * - Multi-plan support (STARTER, PROFESSIONAL, AGENCY, ENTERPRISE)
 * - Plan change flow with automatic cleanup
 * - Subscription cancellation scheduling
 * - Usage data preservation during transitions
 * - Comprehensive error handling and validation
 *
 * Used for:
 * - Subscription creation and checkout
 * - Plan upgrades and downgrades
 * - Subscription cancellation management
 * - Stripe webhook processing
 */

/**
 * @swagger
 * /api/billing/subscription:
 *   patch:
 *     summary: Update existing subscription
 *     description: Updates the current subscription (change plan, cancel, etc.)
 *     tags: [Billing]
 *     security:
 *       - ClerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planType:
 *                 type: string
 *                 enum: [STARTER, PROFESSIONAL, ENTERPRISE]
 *                 description: New plan type
 *               cancelAtPeriodEnd:
 *                 type: boolean
 *                 description: Whether to cancel subscription at period end
 *     responses:
 *       200:
 *         description: Subscription updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Subscription not found
 *       500:
 *         description: Internal server error
 */
export async function PATCH(request: NextRequest) {
  try {
    console.log('PATCH /api/billing/subscription - Starting request');

    // Check if Stripe is configured
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeKey || stripeKey.length < 10) {
      console.error('Stripe not configured');
      return createErrorResponse('Stripe is not configured. Please contact support to enable billing.', 503, 'STRIPE_NOT_CONFIGURED');
    }

    const { userId } = await auth();
    if (!userId) {
      console.error('No user ID found');
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const user = await currentUser();
    if (!user) {
      console.error('User not found in Clerk');
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    console.log('User authenticated:', { userId: user.id, email: user.emailAddresses[0]?.emailAddress });

    const body = await request.json();
    console.log('Request body:', body);

    const validatedData = updateSubscriptionSchema.parse(body);
    console.log('Validated data:', validatedData);

    // Get user's organization from database
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true }
    });

    if (!dbUser) {
      return createErrorResponse('User not found in database', 404, 'USER_NOT_FOUND');
    }

    const organizationId = dbUser.organizationId;

    if (!organizationId) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    // **ENHANCED**: Use SubscriptionManager for reliable subscription retrieval
    console.log('🔍 Getting current subscription for update...');

    const subscription = await SubscriptionManager.getCurrentSubscription(organizationId);

    if (!subscription) {
      console.error('No active subscription found for organization:', organizationId);
      return createErrorResponse('No active subscription found. Please create a subscription first.', 404, 'SUBSCRIPTION_NOT_FOUND');
    }

    console.log(`Found subscription for update: ${subscription.id} (${subscription.planType}, ${subscription.status})`);

    // Check for multiple subscriptions and clean up in background
    const allActiveSubscriptions = await db.subscription.findMany({
      where: {
        organizationId,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
        }
      }
    });

    if (allActiveSubscriptions.length > 1) {
      console.warn(`Multiple active subscriptions found during PATCH (${allActiveSubscriptions.length}), cleaning up in background...`);

      // Clean up duplicates in background
      SubscriptionManager.cleanupExistingSubscriptions(
        organizationId,
        undefined,
        subscription.stripeSubscriptionId // Keep the current one
      ).catch(error => {
        console.error('Background cleanup during PATCH failed:', error);
      });
    }

    console.log('Found subscription:', {
      id: subscription.id,
      planType: subscription.planType,
      status: subscription.status,
      stripeSubscriptionId: subscription.stripeSubscriptionId
    });

    // Check if subscription has a valid Stripe subscription ID
    if (!subscription.stripeSubscriptionId) {
      console.error('Subscription missing Stripe subscription ID:', subscription.id);
      return createErrorResponse(
        'Subscription is missing Stripe subscription ID. Please contact support to resolve this issue.',
        400,
        'MISSING_STRIPE_SUBSCRIPTION_ID'
      );
    }

    // Update Stripe subscription
    const updateData: any = {};

    if (validatedData.cancelAtPeriodEnd !== undefined) {
      updateData.cancel_at_period_end = validatedData.cancelAtPeriodEnd;

      // For trial cancellations, ensure we're preserving the trial period
      if (validatedData.cancelAtPeriodEnd === true) {
        console.log(`🔄 Canceling subscription at period end (preserving trial/billing period)`);

        // Check if this is a trial subscription
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          const isInTrial = stripeSubscription.status === 'trialing' ||
                           (stripeSubscription.trial_end && stripeSubscription.trial_end * 1000 > Date.now());

          if (isInTrial) {
            console.log(`📅 This is a trial subscription - will cancel at trial end: ${new Date(stripeSubscription.trial_end! * 1000).toISOString()}`);
          } else {
            console.log(`📅 This is a paid subscription - will cancel at period end: ${getSubscriptionPeriod(stripeSubscription).end.toISOString()}`);
          }
        } catch (error) {
          console.warn('⚠️ Could not check trial status from Stripe:', error);
        }
      }
    }

    // Check if trying to change to the same plan
    if (validatedData.planType && validatedData.planType === subscription.planType) {
      console.log('Attempted to change to the same plan:', validatedData.planType);
      return createErrorResponse(
        'You are already on the ' + validatedData.planType + ' plan.',
        400,
        'SAME_PLAN_SELECTED'
      );
    }

    if (validatedData.planType && validatedData.planType !== subscription.planType) {
      // Get the new plan details
      const plans = await getSubscriptionPlans();
      const newPlanDetails = plans[validatedData.planType as SubscriptionPlan];

      if (!newPlanDetails) {
        console.error('Invalid plan type:', validatedData.planType);
        return createErrorResponse(`Invalid plan type: ${validatedData.planType}`, 400, 'INVALID_PLAN_TYPE');
      }

      console.log('Plan change requested:', {
        oldPlan: subscription.planType,
        newPlan: validatedData.planType,
        newPlanDetails: newPlanDetails
      });

      // Check if new plan has a price ID
      if (!newPlanDetails.priceId) {
        return createErrorResponse('Price not configured for this plan. Please contact support.', 400, 'PRICE_NOT_CONFIGURED');
      }

      // Get organization for customer ID
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { stripeCustomerId: true }
      });

      if (!organization?.stripeCustomerId) {
        return createErrorResponse('Stripe customer not found', 404, 'STRIPE_CUSTOMER_NOT_FOUND');
      }

      // ENHANCED: Proactively cancel ALL existing active subscriptions before creating new one
      // This prevents duplicate subscriptions and ensures clean transitions
      // NEW: Usage data is preserved during this process
      console.log('🧹 Cleaning up existing subscriptions before plan change with usage preservation...');

      // Step 1: Cancel all database subscriptions for this organization
      const allActiveSubscriptions = await db.subscription.findMany({
        where: {
          organizationId,
          status: {
            in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
          }
        }
      });

      console.log(`Found ${allActiveSubscriptions.length} active database subscriptions to clean up`);

      // Step 2: Also get ALL Stripe subscriptions for this customer to ensure complete cleanup
      const allStripeSubscriptions = await stripe.subscriptions.list({
        customer: organization.stripeCustomerId,
        status: 'all'
      });

      const activeStripeSubscriptions = allStripeSubscriptions.data.filter(sub =>
        ['active', 'trialing', 'past_due'].includes(sub.status)
      );

      console.log(`Found ${activeStripeSubscriptions.length} active Stripe subscriptions to clean up`);

      // Step 3: Cancel ALL active Stripe subscriptions
      for (const stripeSub of activeStripeSubscriptions) {
        try {
          console.log(`🗑️ Canceling Stripe subscription: ${stripeSub.id} (${stripeSub.status})`);
          await stripe.subscriptions.cancel(stripeSub.id);
          console.log(`✅ Successfully canceled in Stripe: ${stripeSub.id}`);
        } catch (cancelError: any) {
          console.warn(`⚠️ Failed to cancel Stripe subscription ${stripeSub.id}:`, cancelError.message);
        }
      }

      // Step 4: Cancel all database subscriptions with usage preservation
      for (const existingSub of allActiveSubscriptions) {
        try {
          console.log(`🗑️ Canceling database subscription: ${existingSub.id} (${existingSub.planType})`);

          // Update in database
          await db.subscription.update({
            where: { id: existingSub.id },
            data: {
              status: 'CANCELED',
              cancelAtPeriodEnd: true,
              canceledAt: new Date(),
              updatedAt: new Date(),
            }
          });

          console.log(`✅ Successfully canceled in database: ${existingSub.id}`);
        } catch (cancelError: any) {
          console.warn(`⚠️ Failed to cancel database subscription ${existingSub.id}:`, cancelError.message);
        }
      }

      console.log('✅ Cleanup completed. Creating new subscription checkout...');

      // Always use checkout session for plan changes to show Stripe's hosted page
      try {
        const checkoutSession = await stripe.checkout.sessions.create({
          customer: organization.stripeCustomerId,
              line_items: [
            {
              price: newPlanDetails.priceId,
              quantity: 1,
            },
          ],
          mode: 'subscription',
          success_url: `${request.headers.get('origin')}/billing?success=true&plan_changed=true`,
          cancel_url: `${request.headers.get('origin')}/billing?canceled=true`,
          metadata: {
            organizationId,
            planType: validatedData.planType,
            action: 'plan_change',
            oldPlanType: subscription.planType,
            cleanedUpSubscriptions: allActiveSubscriptions.length.toString(),
          },
        });

        console.log('✅ Checkout session created for plan change:', {
          sessionId: checkoutSession.id,
          newPlan: validatedData.planType,
          oldPlan: subscription.planType,
          cleanedUpSubscriptions: allActiveSubscriptions.length
        });

        // **IMMEDIATE SYNC**: Trigger sync after plan change
        SubscriptionSync.syncAfterStripeOperation(organizationId, {
          delay: 4000, // Wait 4 seconds for plan change to process
          backgroundSync: true,
          retries: 3
        }).catch(error => {
          console.warn('Background sync after plan change failed:', error);
        });

        // Log plan change initiation for audit trail
        try {
          await crudAuditLogger.logBillingOperation(
            'UPDATE',
            subscription.id,
            `${subscription.planType} → ${validatedData.planType}`,
            subscription,
            {
              checkoutSessionId: checkoutSession.id,
              planType: validatedData.planType,
              status: 'plan_change_initiated',
              oldPlanType: subscription.planType
            },
            {
              endpoint: '/api/v1/billing/subscription',
              method: 'PATCH',
              organizationId,
              action: 'plan_change',
              checkoutUrl: checkoutSession.url,
              cleanedUpSubscriptions: allActiveSubscriptions.length
            }
          );
        } catch (auditError) {
          console.error('Failed to create plan change audit log:', auditError);
        }

        return NextResponse.json({
          checkoutUrl: checkoutSession.url,
          sessionId: checkoutSession.id,
          message: `Plan change initiated. Cleaned up ${allActiveSubscriptions.length} existing subscription(s).`
        });
      } catch (stripeError: any) {
        console.error('Stripe checkout session error:', stripeError);
        return createErrorResponse(
          `Failed to create checkout session: ${stripeError.message}`,
          500,
          'STRIPE_CHECKOUT_ERROR',
          { stripeCode: stripeError.code, stripeType: stripeError.type }
        );
      }
    }

    if (Object.keys(updateData).length > 0) {
      try {
        console.log('Updating Stripe subscription:', {
          subscriptionId: subscription.stripeSubscriptionId,
          updateData
        });

        await stripe.subscriptions.update(subscription.stripeSubscriptionId, updateData);

        console.log('✅ Stripe subscription updated successfully');
      } catch (stripeError: any) {
        console.error('Stripe subscription update error:', stripeError);
        return createErrorResponse(
          `Failed to update subscription in Stripe: ${stripeError.message}`,
          500,
          'STRIPE_UPDATE_ERROR',
          { stripeCode: stripeError.code, stripeType: stripeError.type }
        );
      }
    }

    // Update local database
    const updatedSubscription = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        ...(validatedData.planType && { planType: validatedData.planType }),
        ...(validatedData.cancelAtPeriodEnd !== undefined && {
          cancelAtPeriodEnd: validatedData.cancelAtPeriodEnd
        }),
        updatedAt: new Date(),
      }
    });

    // Note: No cache to clear since subscription caching is disabled for immediate updates

    // Log subscription update for audit trail
    try {
      await crudAuditLogger.logBillingOperation(
        'UPDATE',
        updatedSubscription.id,
        updatedSubscription.planType || 'Unknown Plan',
        subscription, // Previous data
        updatedSubscription, // Current data
        {
          endpoint: '/api/v1/billing/subscription',
          method: 'PATCH',
          organizationId,
          action: validatedData.cancelAtPeriodEnd !== undefined ? 'cancel_schedule' : 'direct_update',
          cancelAtPeriodEnd: validatedData.cancelAtPeriodEnd
        }
      );
    } catch (auditError) {
      console.error('Failed to create subscription update audit log:', auditError);
    }

    return NextResponse.json({
      subscription: updatedSubscription
    });

  } catch (error) {
    console.error('Error updating subscription:', error);
    return handleApiError(error);
  }
}
