import { isPlatformAdmin } from '@/lib/security/platform-admin';
import { getSubscriptionPeriod } from '@/lib/billing/subscription-period';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe-server';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/lib/stripe';
import { createErrorResponse, handleApiError } from '@/lib/api-errors';
import { z } from 'zod';

/**
 * @swagger
 * /api/billing/complete-fix:
 *   post:
 *     summary: Complete subscription flow fix
 *     description: Cancels existing subscriptions and creates new ones directly (bypassing checkout)
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
 *                 enum: [STARTER, PROFESSIONAL, AGENCY, ENTERPRISE]
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Subscription flow fixed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 organizationId:
 *                   type: string
 *                 organizationName:
 *                   type: string
 *                 canceledSubscriptions:
 *                   type: number
 *                 newSubscriptionId:
 *                   type: string
 *                 newStripeSubscriptionId:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

const completeFixSchema = z.object({
  planType: z.enum(['STARTER', 'PROFESSIONAL', 'AGENCY', 'ENTERPRISE']),
  dryRun: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/billing/complete-fix - Starting complete subscription fix');

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return createErrorResponse('Stripe is not configured. Please add STRIPE_SECRET_KEY to your environment variables.', 503, 'STRIPE_NOT_CONFIGURED');
    }

    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const user = await currentUser();
    if (!user) {
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    console.log('User authenticated:', { userId: user.id });

    const body = await request.json();
    const validatedData = completeFixSchema.parse(body);

    console.log('Request data:', validatedData);

    if (!isPlatformAdmin(user.id)) return createErrorResponse('Platform administrator access required', 403, 'FORBIDDEN');

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

    // Get organization with existing subscriptions
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
          where: {
            status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }
          }
        }
      }
    });

    if (!organization) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    console.log(`Found organization: ${organization.name} with ${organization.subscriptions.length} active subscriptions`);

    const result = {
      success: true,
      organizationId: organization.id,
      organizationName: organization.name,
      canceledSubscriptions: 0,
      newSubscriptionId: '',
      newStripeSubscriptionId: '',
      message: '',
    };

    // Step 1: Cancel existing subscriptions
    console.log('🧹 Canceling existing subscriptions...');
    for (const subscription of organization.subscriptions) {
      try {
        console.log(`🗑️ Canceling subscription: ${subscription.id}`);

        if (!validatedData.dryRun) {
          // Cancel in Stripe
          if (subscription.stripeSubscriptionId) {
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          }

          // Update database
          await db.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'CANCELED',
              canceledAt: new Date(),
              cancelAtPeriodEnd: true,
              updatedAt: new Date(),
            }
          });
        }

        result.canceledSubscriptions++;
        console.log(`✅ Canceled: ${subscription.id}`);
      } catch (error) {
        console.error(`❌ Failed to cancel subscription ${subscription.id}:`, error);
      }
    }

    // Step 2: Create Stripe customer if needed
    let customerId = organization.stripeCustomerId;
    if (!customerId) {
      console.log('👤 Creating Stripe customer...');
      if (!validatedData.dryRun) {
        const customer = await stripe.customers.create({
          email: organization.billingEmail || user.emailAddresses[0]?.emailAddress,
          name: organization.name,
          metadata: {
            organizationId: organization.id,
            userId: user.id,
          },
        });
        customerId = customer.id;

        await db.organization.update({
          where: { id: organization.id },
          data: { stripeCustomerId: customerId }
        });
      }
      console.log(`✅ Customer created: ${customerId}`);
    }

    // Step 3: Create new subscription
    console.log('🆕 Creating new subscription...');
    const planDetails = SUBSCRIPTION_PLANS[validatedData.planType as SubscriptionPlan];
    if (!planDetails || !planDetails.priceId) {
      return createErrorResponse(`Invalid plan or missing price ID: ${validatedData.planType}`, 400, 'INVALID_PLAN');
    }

    if (!validatedData.dryRun && customerId) {
      // Create subscription directly (bypass checkout)
      const stripeSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: planDetails.priceId }],
        trial_period_days: 14,
        metadata: {
          organizationId: organization.id,
          planType: validatedData.planType,
          userId: user.id,
        },
      });

      console.log(`✅ Stripe subscription created: ${stripeSubscription.id}`);

      // Create database record
      const dbSubscription = await db.subscription.create({
        data: {
          organizationId: organization.id,
          stripeSubscriptionId: stripeSubscription.id,
          stripePriceId: planDetails.priceId,
          stripeCustomerId: customerId,
          planType: validatedData.planType,
          status: 'TRIALING',
          currentPeriodStart: getSubscriptionPeriod(stripeSubscription).start,
          currentPeriodEnd: getSubscriptionPeriod(stripeSubscription).end,
          trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
          trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
          cancelAtPeriodEnd: false,
          amount: planDetails.price * 100,
          currency: 'usd',
          interval: 'month',
          features: planDetails.features,
          limits: planDetails.limits,
        }
      });

      console.log(`✅ Database subscription created: ${dbSubscription.id}`);

      // Update organization
      await db.organization.update({
        where: { id: organization.id },
        data: {
          planType: validatedData.planType,
          subscriptionStatus: 'TRIALING',
        }
      });

      result.newSubscriptionId = dbSubscription.id;
      result.newStripeSubscriptionId = stripeSubscription.id;
      result.message = `Successfully created ${validatedData.planType} subscription with 14-day trial`;
    } else {
      result.message = validatedData.dryRun
        ? `DRY RUN: Would create ${validatedData.planType} subscription`
        : `Would create ${validatedData.planType} subscription`;
    }

    console.log('✅ Complete subscription fix completed successfully');

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in complete subscription fix:', error);
    return handleApiError(error);
  }
}
