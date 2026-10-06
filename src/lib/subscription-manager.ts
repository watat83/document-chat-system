import { getSubscriptionPeriod } from '@/lib/billing/subscription-period';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe-server';
import { getSubscriptionPlans, type SubscriptionPlan } from '@/lib/stripe';
import { UsageTrackingService } from '@/lib/usage-tracking';
import Stripe from 'stripe';

interface SubscriptionValidationResult {
  hasActiveSubscription: boolean;
  activeSubscriptions: any[];
  existingPlan?: string;
  canCreateNewSubscription: boolean;
  message?: string;
}

interface SubscriptionCleanupResult {
  cleanedSubscriptions: number;
  errors: string[];
}

export class SubscriptionManager {
  /**
   * Validates if an organization can create a new subscription
   */
  static async validateSubscriptionCreation(
    organizationId: string,
    requestedPlanType: string
  ): Promise<SubscriptionValidationResult> {
    console.log(`🔍 Validating subscription creation for org: ${organizationId}, plan: ${requestedPlanType}`);

    // Get all active subscriptions from database
    const activeSubscriptions = await db.subscription.findMany({
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

    console.log(`Found ${activeSubscriptions.length} active subscriptions in database`);

    // Check if user already has the requested plan
    const existingPlan = activeSubscriptions.find(sub =>
      sub.planType === requestedPlanType && !sub.cancelAtPeriodEnd
    );

    if (existingPlan) {
      return {
        hasActiveSubscription: true,
        activeSubscriptions,
        existingPlan: requestedPlanType,
        canCreateNewSubscription: false,
        message: `Organization already has an active ${requestedPlanType} subscription.`
      };
    }

    return {
      hasActiveSubscription: activeSubscriptions.length > 0,
      activeSubscriptions,
      canCreateNewSubscription: true,
      message: activeSubscriptions.length > 0
        ? `Will replace ${activeSubscriptions.length} existing subscription(s)`
        : 'Can create new subscription'
    };
  }

  /**
   * Clean up existing subscriptions before creating a new one
   */
  static async cleanupExistingSubscriptions(
    organizationId: string,
    stripeCustomerId?: string,
    excludeSubscriptionId?: string
  ): Promise<SubscriptionCleanupResult> {
    console.log(`🧹 Starting subscription cleanup for org: ${organizationId}`);

    const errors: string[] = [];
    let cleanedCount = 0;

    // Clean up database subscriptions
    const dbSubscriptions = await db.subscription.findMany({
      where: {
        organizationId,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
        },
        ...(excludeSubscriptionId && {
          stripeSubscriptionId: {
            not: excludeSubscriptionId
          }
        })
      }
    });

    console.log(`Found ${dbSubscriptions.length} database subscriptions to clean up`);

    for (const dbSub of dbSubscriptions) {
      try {
        await db.subscription.update({
          where: { id: dbSub.id },
          data: {
            status: 'CANCELED',
            cancelAtPeriodEnd: true,
            canceledAt: new Date(),
            updatedAt: new Date(),
          }
        });

        cleanedCount++;
        console.log(`✅ Canceled database subscription: ${dbSub.id} (${dbSub.planType})`);
      } catch (error) {
        const errorMsg = `Failed to cancel database subscription ${dbSub.id}: ${error}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    // Clean up Stripe subscriptions if customer ID provided
    if (stripeCustomerId) {
      try {
        const stripeSubscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'all',
          limit: 100
        });

        const activeStripeSubscriptions = stripeSubscriptions.data.filter(sub =>
          ['active', 'trialing', 'past_due'].includes(sub.status) &&
          (!excludeSubscriptionId || sub.id !== excludeSubscriptionId)
        );

        console.log(`Found ${activeStripeSubscriptions.length} Stripe subscriptions to clean up`);

        for (const stripeSub of activeStripeSubscriptions) {
          try {
            await stripe.subscriptions.cancel(stripeSub.id);
            console.log(`✅ Canceled Stripe subscription: ${stripeSub.id}`);
          } catch (error) {
            const errorMsg = `Failed to cancel Stripe subscription ${stripeSub.id}: ${error}`;
            errors.push(errorMsg);
            console.error(errorMsg);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to list Stripe subscriptions: ${error}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    console.log(`✅ Cleanup completed: ${cleanedCount} subscriptions cleaned, ${errors.length} errors`);

    return {
      cleanedSubscriptions: cleanedCount,
      errors
    };
  }

  /**
   * Sync a subscription from Stripe to the database
   */
  static async syncSubscriptionToDatabase(
    stripeSubscription: Stripe.Subscription,
    organizationId?: string
  ): Promise<any> {
    console.log(`🔄 Syncing subscription ${stripeSubscription.id} to database`);

    // Get organization if not provided
    if (!organizationId) {
      const organization = await db.organization.findFirst({
        where: { stripeCustomerId: stripeSubscription.customer as string }
      });

      if (!organization) {
        throw new Error(`Organization not found for customer: ${stripeSubscription.customer}`);
      }

      organizationId = organization.id;
    }

    const planType = this.getPlanTypeFromStripeSubscription(stripeSubscription);
    const plans = await getSubscriptionPlans();
    const planDetails = plans[planType as SubscriptionPlan];

    // Upsert subscription to avoid duplicates
    const syncedSubscription = await db.subscription.upsert({
      where: {
        stripeSubscriptionId: stripeSubscription.id
      },
      create: {
        organizationId,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: stripeSubscription.items.data[0]?.price.id || '',
        stripeCustomerId: stripeSubscription.customer as string,
        planType,
        status: this.mapStripeStatusToDb(stripeSubscription.status),
        currentPeriodStart: getSubscriptionPeriod(stripeSubscription).start,
        currentPeriodEnd: getSubscriptionPeriod(stripeSubscription).end,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        amount: stripeSubscription.items.data[0]?.price.unit_amount || 0,
        currency: stripeSubscription.currency,
        interval: stripeSubscription.items.data[0]?.price.recurring?.interval || 'month',
        features: planDetails?.features || [],
        limits: planDetails?.limits || {},
        metadata: stripeSubscription.metadata,
        canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
      },
      update: {
        planType,
        status: this.mapStripeStatusToDb(stripeSubscription.status),
        currentPeriodStart: getSubscriptionPeriod(stripeSubscription).start,
        currentPeriodEnd: getSubscriptionPeriod(stripeSubscription).end,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        amount: stripeSubscription.items.data[0]?.price.unit_amount || 0,
        currency: stripeSubscription.currency,
        interval: stripeSubscription.items.data[0]?.price.recurring?.interval || 'month',
        features: planDetails?.features || [],
        limits: planDetails?.limits || {},
        metadata: stripeSubscription.metadata,
        canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
        updatedAt: new Date(),
      }
    });

    // Update organization status
    await db.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: this.mapStripeStatusToDb(stripeSubscription.status),
        planType: planType,
      }
    });

    // ENHANCED: Check if this is a new subscription (plan change) and preserve usage data
    const wasNewSubscription = !syncedSubscription.id || Date.now() - syncedSubscription.createdAt.getTime() < 10000; // New if created within last 10 seconds

    if (wasNewSubscription) {
      try {
        // Check for recently canceled subscriptions (within last 24 hours) that might have usage data
        const recentCanceledSubscriptions = await db.subscription.findMany({
          where: {
            organizationId,
            status: 'CANCELED',
            canceledAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
            },
            id: {
              not: syncedSubscription.id // Exclude the current subscription
            }
          },
          orderBy: {
            canceledAt: 'desc'
          }
        });

        // If we found recently canceled subscriptions, migrate usage data
        if (recentCanceledSubscriptions.length > 0) {
          const mostRecentCanceled = recentCanceledSubscriptions[0];
          console.log(`🔄 Found recently canceled subscription ${mostRecentCanceled.id}, migrating usage data...`);

          await UsageTrackingService.migrateUsageForPlanSwitch(
            organizationId,
            mostRecentCanceled.id,
            syncedSubscription.id
          );

          console.log(`✅ Usage data migrated from ${mostRecentCanceled.id} to ${syncedSubscription.id}`);
        }
      } catch (usageError) {
        console.warn('Error migrating usage data during subscription sync:', usageError);
        // Don't fail the subscription sync if usage migration fails
      }
    }

    console.log(`✅ Subscription synced: ${stripeSubscription.id} -> ${syncedSubscription.id}`);

    return syncedSubscription;
  }

  /**
   * Get the most current active subscription for an organization
   */
  static async getCurrentSubscription(organizationId: string): Promise<any | null> {
    const subscriptions = await db.subscription.findMany({
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

    // Prioritize subscriptions that are not scheduled for cancellation
    const trulyActiveSubscriptions = subscriptions.filter(s => !s.cancelAtPeriodEnd);

    return trulyActiveSubscriptions.length > 0 ? trulyActiveSubscriptions[0] : subscriptions[0] || null;
  }

  /**
   * Helper function to extract plan type from Stripe subscription
   */
  private static getPlanTypeFromStripeSubscription(subscription: Stripe.Subscription): string {
    // First check metadata
    if (subscription.metadata?.planType) {
      return subscription.metadata.planType;
    }

    // Map price ID to plan type
    const priceId = subscription.items.data[0]?.price.id;
    if (priceId) {
      const priceIdToPlan: Record<string, string> = {
        'price_1Rh465QEGVp7c1lx569CvH1O': 'STARTER',
        'price_1Rh465QEGVp7c1lxXTDm7WaT': 'PROFESSIONAL',
        'price_1Rh466QEGVp7c1lxpqhF84Tb': 'AGENCY',
      };

      if (priceIdToPlan[priceId]) {
        return priceIdToPlan[priceId];
      }
    }

    // Default fallback
    return 'STARTER';
  }

  /**
   * Helper function to map Stripe status to database status
   */
  private static mapStripeStatusToDb(stripeStatus: string): string {
    const statusMap: Record<string, string> = {
      'trialing': 'TRIALING',
      'active': 'ACTIVE',
      'past_due': 'PAST_DUE',
      'canceled': 'CANCELED',
      'unpaid': 'UNPAID',
      'incomplete': 'INCOMPLETE',
      'incomplete_expired': 'INCOMPLETE_EXPIRED',
      'paused': 'PAUSED',
    };

    return statusMap[stripeStatus] || 'ACTIVE';
  }

  /**
   * Force sync all subscriptions for an organization from Stripe
   */
  static async syncAllSubscriptionsFromStripe(organizationId: string): Promise<{
    syncedCount: number;
    activeSubscription: any | null;
    errors: string[];
  }> {
    console.log(`🔄 Force syncing all subscriptions for organization: ${organizationId}`);

    const organization = await db.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization?.stripeCustomerId) {
      throw new Error('No Stripe customer found for organization');
    }

    const errors: string[] = [];
    let syncedCount = 0;
    let activeSubscription = null;

    try {
      const stripeSubscriptions = await stripe.subscriptions.list({
        customer: organization.stripeCustomerId,
        limit: 100
      });

      for (const stripeSub of stripeSubscriptions.data) {
        try {
          const syncedSub = await this.syncSubscriptionToDatabase(stripeSub, organizationId);
          syncedCount++;

          // Track the most recent active subscription
          if (['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(syncedSub.status) &&
              !stripeSub.cancel_at_period_end) {
            if (!activeSubscription || stripeSub.created > (activeSubscription as any).created) {
              activeSubscription = syncedSub;
            }
          }
        } catch (error) {
          const errorMsg = `Failed to sync subscription ${stripeSub.id}: ${error}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      // Update organization with current subscription status
      await db.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionStatus: activeSubscription ? activeSubscription.status : 'CANCELED',
          planType: activeSubscription ? activeSubscription.planType : null,
        }
      });

      console.log(`✅ Sync completed: ${syncedCount} subscriptions synced, ${errors.length} errors`);

      return {
        syncedCount,
        activeSubscription,
        errors
      };
    } catch (error) {
      const errorMsg = `Failed to list Stripe subscriptions: ${error}`;
      errors.push(errorMsg);
      throw new Error(errorMsg);
    }
  }
}
