import { isPlatformAdmin } from '@/lib/security/platform-admin';
import { getSubscriptionPeriod } from '@/lib/billing/subscription-period';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe-server';
import { createErrorResponse, handleApiError } from '@/lib/api-errors';
import { cleanupOrganizationSubscriptions, ensureSingleActiveSubscription } from '@/lib/subscription-cleanup';
import { z } from 'zod';

/**
 * Emergency subscription fix endpoint
 *
 * This endpoint diagnoses and fixes subscription issues including:
 * - Multiple active subscriptions
 * - Orphaned Stripe subscriptions
 * - Database/Stripe sync issues
 * - Billing state inconsistencies
 *
 * @swagger
 * /api/billing/fix-subscriptions:
 *   post:
 *     summary: Diagnose and fix subscription issues
 *     description: |
 *       Comprehensive subscription repair endpoint that:
 *       - Identifies duplicate active subscriptions
 *       - Cancels orphaned Stripe subscriptions
 *       - Synchronizes database with Stripe state
 *       - Ensures billing consistency
 *     tags: [Billing]
 *     security:
 *       - ClerkAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 description: Preview changes without executing them
 *                 default: false
 *               force:
 *                 type: boolean
 *                 description: Force cleanup even if no issues detected
 *                 default: false
 *     responses:
 *       200:
 *         description: Subscription issues fixed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 diagnosis:
 *                   type: object
 *                   properties:
 *                     multipleActiveSubscriptions:
 *                       type: number
 *                     orphanedStripeSubscriptions:
 *                       type: number
 *                     databaseSyncIssues:
 *                       type: number
 *                 fixes:
 *                   type: object
 *                   properties:
 *                     subscriptionsCanceled:
 *                       type: number
 *                     databaseUpdates:
 *                       type: number
 *                     stripeUpdates:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Starting subscription fix process...');

    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const user = await currentUser();
    if (!user) {
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { dryRun = false, force = false } = body;

    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}, Force: ${force}`);

    if (!isPlatformAdmin(user.id)) return createErrorResponse('Platform administrator access required', 403, 'FORBIDDEN');

    // Get user's organization
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true }
    });

    if (!dbUser?.organizationId) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    const organizationId = dbUser.organizationId;

    // Get organization details
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
        planType: true,
        subscriptionStatus: true,
      }
    });

    if (!organization) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    console.log(`🏢 Organization: ${organization.name} (${organizationId})`);

    // STEP 1: DIAGNOSIS - Check for subscription issues
    console.log('📋 Running diagnosis...');

    const diagnosis = {
      multipleActiveSubscriptions: 0,
      orphanedStripeSubscriptions: 0,
      databaseSyncIssues: 0,
      organizationPlanMismatch: false,
      stripeCustomerIssues: 0,
    };

    // Check for multiple active subscriptions in database
    const activeSubscriptions = await db.subscription.findMany({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }
      },
      include: {
        organization: { select: { name: true } }
      }
    });

    diagnosis.multipleActiveSubscriptions = activeSubscriptions.length > 1 ? activeSubscriptions.length : 0;

    console.log(`📊 Found ${activeSubscriptions.length} active database subscriptions`);

    // Check for orphaned Stripe subscriptions
    let stripeSubscriptions: any[] = [];
    if (organization.stripeCustomerId) {
      try {
        const stripeSubsResponse = await stripe.subscriptions.list({
          customer: organization.stripeCustomerId,
          status: 'all'
        });
        stripeSubscriptions = stripeSubsResponse.data;

        const activeStripeSubscriptions = stripeSubscriptions.filter(sub =>
          ['active', 'trialing', 'past_due'].includes(sub.status)
        );

        console.log(`📊 Found ${activeStripeSubscriptions.length} active Stripe subscriptions`);

        // Check for orphaned Stripe subscriptions (in Stripe but not in database)
        for (const stripeSub of activeStripeSubscriptions) {
          const dbSub = activeSubscriptions.find(sub => sub.stripeSubscriptionId === stripeSub.id);
          if (!dbSub) {
            diagnosis.orphanedStripeSubscriptions++;
          }
        }

        // Check for database sync issues (in database but not in Stripe or status mismatch)
        for (const dbSub of activeSubscriptions) {
          if (dbSub.stripeSubscriptionId) {
            const stripeSub = stripeSubscriptions.find(sub => sub.id === dbSub.stripeSubscriptionId);
            if (!stripeSub || stripeSub.status !== dbSub.status.toLowerCase()) {
              diagnosis.databaseSyncIssues++;
            }
          }
        }
      } catch (stripeError) {
        console.error('Error fetching Stripe subscriptions:', stripeError);
        diagnosis.stripeCustomerIssues++;
      }
    }

    // Check for organization plan mismatch
    if (activeSubscriptions.length > 0) {
      const primarySubscription = activeSubscriptions[0];
      if (organization.planType !== primarySubscription.planType) {
        diagnosis.organizationPlanMismatch = true;
      }
    }

    console.log('📋 Diagnosis complete:', diagnosis);

    // STEP 2: DETERMINE IF FIXES ARE NEEDED
    const needsFixes = diagnosis.multipleActiveSubscriptions > 0 ||
                      diagnosis.orphanedStripeSubscriptions > 0 ||
                      diagnosis.databaseSyncIssues > 0 ||
                      diagnosis.organizationPlanMismatch ||
                      diagnosis.stripeCustomerIssues > 0;

    if (!needsFixes && !force) {
      return NextResponse.json({
        success: true,
        message: 'No subscription issues detected',
        diagnosis,
        fixes: {
          subscriptionsCanceled: 0,
          databaseUpdates: 0,
          stripeUpdates: 0,
        }
      });
    }

    // STEP 3: EXECUTE FIXES
    console.log('🔧 Executing fixes...');

    const fixes = {
      subscriptionsCanceled: 0,
      databaseUpdates: 0,
      stripeUpdates: 0,
    };

    // Fix 1: Handle multiple active subscriptions
    if (diagnosis.multipleActiveSubscriptions > 0 || force) {
      console.log('🧹 Cleaning up multiple active subscriptions...');

      const cleanupResults = await cleanupOrganizationSubscriptions(
        organizationId,
        undefined, // Don't exclude any subscriptions
        { dryRun }
      );

      fixes.subscriptionsCanceled = cleanupResults.successfulCancellations;

      if (!dryRun) {
        // Ensure single active subscription
        await ensureSingleActiveSubscription(organizationId);
      }
    }

    // Fix 2: Handle orphaned Stripe subscriptions
    if (diagnosis.orphanedStripeSubscriptions > 0 && !dryRun) {
      console.log('🧹 Cleaning up orphaned Stripe subscriptions...');

      const activeStripeSubscriptions = stripeSubscriptions.filter(sub =>
        ['active', 'trialing', 'past_due'].includes(sub.status)
      );

      for (const stripeSub of activeStripeSubscriptions) {
        const dbSub = activeSubscriptions.find(sub => sub.stripeSubscriptionId === stripeSub.id);
        if (!dbSub) {
          try {
            await stripe.subscriptions.cancel(stripeSub.id);
            fixes.stripeUpdates++;
            console.log(`✅ Canceled orphaned Stripe subscription: ${stripeSub.id}`);
          } catch (error) {
            console.error(`❌ Failed to cancel orphaned Stripe subscription ${stripeSub.id}:`, error);
          }
        }
      }
    }

    // Fix 3: Sync database with Stripe
    if (diagnosis.databaseSyncIssues > 0 && !dryRun) {
      console.log('🔄 Synchronizing database with Stripe...');

      for (const dbSub of activeSubscriptions) {
        if (dbSub.stripeSubscriptionId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(dbSub.stripeSubscriptionId);

            // Update database subscription with Stripe data
            await db.subscription.update({
              where: { id: dbSub.id },
              data: {
                status: stripeSub.status === 'active' ? 'ACTIVE' :
                       stripeSub.status === 'trialing' ? 'TRIALING' :
                       stripeSub.status === 'past_due' ? 'PAST_DUE' : 'CANCELED',
                currentPeriodStart: getSubscriptionPeriod(stripeSub).start,
                currentPeriodEnd: getSubscriptionPeriod(stripeSub).end,
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                updatedAt: new Date(),
              }
            });

            fixes.databaseUpdates++;
            console.log(`✅ Synchronized database subscription: ${dbSub.id}`);
          } catch (error) {
            console.error(`❌ Failed to sync subscription ${dbSub.id}:`, error);
          }
        }
      }
    }

    // Fix 4: Fix organization plan mismatch
    if (diagnosis.organizationPlanMismatch && !dryRun) {
      console.log('🔄 Fixing organization plan mismatch...');

      const updatedSubscriptions = await db.subscription.findMany({
        where: {
          organizationId,
          status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }
        },
        orderBy: { updatedAt: 'desc' }
      });

      if (updatedSubscriptions.length > 0) {
        const primarySubscription = updatedSubscriptions[0];

        await db.organization.update({
          where: { id: organizationId },
          data: {
            planType: primarySubscription.planType,
            subscriptionStatus: primarySubscription.status,
          }
        });

        fixes.databaseUpdates++;
        console.log(`✅ Fixed organization plan type: ${primarySubscription.planType}`);
      }
    }

    // STEP 4: CREATE AUDIT RECORD
    if (!dryRun) {
      await db.billingEvent.create({
        data: {
          eventType: 'subscription_fix_applied',
          stripeEventId: `fix_${Date.now()}`,
          data: {
            organizationId,
            diagnosis,
            fixes,
            timestamp: new Date().toISOString(),
          } as any,
          processed: true,
          processedAt: new Date(),
        }
      });
    }

    console.log('✅ Subscription fix process completed');

    return NextResponse.json({
      success: true,
      message: dryRun ? 'Fix preview completed (no changes made)' : 'Subscription issues fixed successfully',
      diagnosis,
      fixes,
      dryRun,
    });

  } catch (error) {
    console.error('❌ Subscription fix process failed:', error);
    return handleApiError(error);
  }
}
