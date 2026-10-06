import { db } from './db';
import { getCurrentUser } from './auth';
import { getSubscriptionPlans } from './stripe';

import { UsageType } from '@prisma/client';
export { UsageType };

export interface UsageTrackingOptions {
  organizationId: string;
  userId?: string;
  usageType: UsageType;
  quantity?: number;
  resourceId?: string;
  resourceType?: string;
  metadata?: Record<string, any>;
}

export interface UsageLimits {
  seats: number;
  documentsPerMonth: number;
  savedSearches: number;
  aiCreditsPerMonth: number;
  matchScoreCalculations: number;
}

export interface UsageCheck {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remainingUsage: number;
  percentUsed: number;
  willExceedLimit: boolean;
}

export class UsageTrackingService {
  /**
   * Track usage for a specific organization and usage type
   */
  static async trackUsage(options: UsageTrackingOptions): Promise<void> {
    const {
      organizationId,
      userId,
      usageType,
      quantity = 1,
      resourceId,
      resourceType,
      metadata,
    } = options;

    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Usage quantity must be a positive integer');
    // Get current billing period based on subscription
    const { periodStart, periodEnd } = await this.getBillingPeriod(organizationId);

    // Get current subscription
    const subscription = await db.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Create usage record
    await db.usageRecord.create({
      data: {
        organizationId,
        subscriptionId: subscription?.id,
        usageType,
        quantity,
        periodStart,
        periodEnd,
        resourceId,
        resourceType,
        metadata: userId ? { ...metadata, userId } : metadata,
      }
    });
  }

  /**
   * Check if a specific usage type is within limits
   */
  static async checkUsageLimit(
    organizationId: string,
    usageType: UsageType,
    additionalQuantity = 1
  ): Promise<UsageCheck> {
    // Get current subscription and limits
    const subscription = await db.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get limits from subscription or default to STARTER
    let limits: UsageLimits;
    if (subscription?.limits) {
      try {
        // Handle both JSON and object formats
        limits = typeof subscription.limits === 'string'
          ? JSON.parse(subscription.limits)
          : (subscription.limits as unknown) as UsageLimits;
      } catch (error) {
        console.warn('Failed to parse subscription limits:', error);
        // Fallback to STARTER plan limits
        const plans = await getSubscriptionPlans();
        limits = plans.STARTER?.limits || {
          seats: 0, documentsPerMonth: 0, savedSearches: 0, aiCreditsPerMonth: 0, matchScoreCalculations: 0
        };
      }
    } else {
      // Fallback to STARTER plan limits
      const plans = await getSubscriptionPlans();
      limits = plans.STARTER?.limits || {
        seats: 0, documentsPerMonth: 0, savedSearches: 0, aiCreditsPerMonth: 0, matchScoreCalculations: 0
      };
    }

    // Get specific limit for this usage type
    const limit = this.getLimitForUsageType(limits, usageType);

    // Get current usage for this billing period (always calculate, even for unlimited plans)
    const { periodStart, periodEnd } = await this.getBillingPeriod(organizationId);

    const currentUsageResult = await db.usageRecord.aggregate({
      where: {
        organizationId,
        usageType,
        createdAt: {
          gte: periodStart, lt: periodEnd
        }
      },
      _sum: {
        quantity: true
      }
    });

    const currentUsage = currentUsageResult._sum?.quantity ?? 0;

    // If unlimited (-1), always allow but show actual usage
    if (limit === -1) {
      return {
        allowed: true,
        currentUsage,
        limit: -1,
        remainingUsage: -1,
        percentUsed: 0,
        willExceedLimit: false,
      };
    }

    const wouldExceed = (currentUsage + additionalQuantity) > limit;
    const remainingUsage = Math.max(0, limit - currentUsage);
    const percentUsed = limit > 0 ? (currentUsage / limit) * 100 : 0;

    return {
      allowed: !wouldExceed,
      currentUsage,
      limit,
      remainingUsage,
      percentUsed: Math.round(percentUsed),
      willExceedLimit: wouldExceed,
    };
  }

  /**
   * Get current usage summary for an organization
   */
  static async getUsageSummary(organizationId: string, period: 'current' | 'last' = 'current') {
    let periodStart: Date;
    let periodEnd: Date;

    if (period === 'current') {
      const billing = await this.getBillingPeriod(organizationId);
      periodStart = billing.periodStart;
      periodEnd = billing.periodEnd;
    } else {
      // For last period, calculate based on current billing cycle
      const current = await this.getBillingPeriod(organizationId);
      const cycleLength = current.periodEnd.getTime() - current.periodStart.getTime();
      periodEnd = new Date(current.periodStart.getTime() - 1); // End of previous period
      periodStart = new Date(periodEnd.getTime() - cycleLength + 1); // Start of previous period
    }

    // Get usage records for period
    const usageRecords = await db.usageRecord.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: periodStart,
          lt: periodEnd
        }
      },
      select: {
        usageType: true,
        quantity: true,
        createdAt: true,
      }
    });

    // Aggregate by usage type
    const totals = usageRecords.reduce((acc, record) => {
      acc[record.usageType] = (acc[record.usageType] || 0) + record.quantity;
      return acc;
    }, {} as Record<string, number>);

    return {
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString()
      },
      totals,
      recordCount: usageRecords.length,
    };
  }

  /**
   * Enforce usage limits before allowing an action
   */
  static async enforceUsageLimit(
    organizationId: string,
    usageType: UsageType,
    quantity = 1
  ): Promise<void> {
    const check = await this.checkUsageLimit(organizationId, usageType, quantity);

    if (!check.allowed) {
      const errorMessage = `Usage limit exceeded for ${usageType}. Remaining: ${check.remainingUsage}`;
      // For regular users, throw the error
      const error = new Error(errorMessage);
      (error as any).usageCheck = check;
      (error as any).code = 'USAGE_LIMIT_EXCEEDED';
      throw error;
    }
  }

  /**
   * Check usage limits and return detailed information for UI display
   */
  static async checkUsageLimitWithDetails(
    organizationId: string,
    usageType: UsageType,
    quantity = 1
  ): Promise<UsageCheck & {
    canProceed: boolean;
    warningMessage?: string;
    upgradeMessage?: string;
    isDeveloperOverride?: boolean;
  }> {
    const check = await this.checkUsageLimit(organizationId, usageType, quantity);
    let warningMessage: string | undefined;
    let upgradeMessage: string | undefined;
    if (!check.allowed) {
      warningMessage = `You've reached your ${usageType} limit (${check.currentUsage}/${check.limit})`;
      upgradeMessage = `Upgrade your plan to get more ${usageType.toLowerCase().replaceAll('_', ' ')} capacity`;
    } else if (check.percentUsed >= 80) {
      warningMessage = `You're approaching your ${usageType} limit (${check.currentUsage}/${check.limit} - ${check.percentUsed}% used)`;
    }

    return {
      ...check,
      canProceed: check.allowed,
      warningMessage,
      upgradeMessage,
      isDeveloperOverride: false
    };
  }

  /**
   * Track usage and enforce limits in one operation
   */
  static async trackAndEnforce(options: UsageTrackingOptions): Promise<void> {
    // First check if the usage would exceed limits
    await this.enforceUsageLimit(
      options.organizationId,
      options.usageType,
      options.quantity
    );

    // If we get here, usage is allowed - track it
    await this.trackUsage(options);
  }

  /**
   * Get billing period based on subscription cycle or default to calendar month
   * Enhanced to handle plan transitions gracefully by preserving usage continuity
   */
  static async getBillingPeriod(organizationId: string): Promise<{ periodStart: Date; periodEnd: Date }> {
    const subscription = await db.subscription.findFirst({
      where: { organizationId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, orderBy: { createdAt: 'desc' }
    });
    const now = new Date();
    if (subscription) {
      const periodStart = new Date(subscription.currentPeriodStart);
      const periodEnd = new Date(subscription.currentPeriodEnd);
      if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart >= periodEnd || now < periodStart || now >= periodEnd) {
        throw new Error('Subscription billing period must be synchronized before recording usage');
      }
      return { periodStart, periodEnd };
    }
    // Calendar periods use UTC and an exclusive next-month boundary.
    return { periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
  }

  /**
   * Get usage limit for a specific usage type from limits object
   */
  private static getLimitForUsageType(limits: UsageLimits, usageType: UsageType): number {
    const limitedTypes: Partial<Record<UsageType, number>> = {
      AI_QUERY: limits.aiCreditsPerMonth,
      AI_REQUESTS: limits.aiCreditsPerMonth,
      MATCH_SCORE_CALCULATION: limits.matchScoreCalculations,
      SAVED_FILTER: limits.documentsPerMonth,
      DOCUMENT_PROCESSING: limits.documentsPerMonth,
      SAVED_SEARCH: limits.savedSearches,
      USER_SEAT: limits.seats,
    };
    if (!Object.hasOwn(limitedTypes, usageType)) return -1;
    const limit = limitedTypes[usageType];
    return typeof limit === 'number' && Number.isFinite(limit) && (limit === -1 || limit >= 0) ? limit : 0;
  }

  /**
   * Helper to track match score calculation usage
   */
  static async trackMatchScoreUsage(
    organizationId: string,
    opportunityId: string,
    profileId: string
  ): Promise<void> {
    await this.trackAndEnforce({
      organizationId,
      usageType: UsageType.MATCH_SCORE_CALCULATION,
      quantity: 1,
      resourceId: opportunityId,
      resourceType: 'opportunity',
      metadata: { profileId }
    });
  }

  /**
   * Helper to track AI query usage
   */
  static async trackAIQueryUsage(
    organizationId: string,
    queryType: string,
    tokens?: number
  ): Promise<void> {
    await this.trackAndEnforce({
      organizationId,
      usageType: UsageType.AI_QUERY,
      quantity: 1,
      resourceType: queryType,
      metadata: { tokens }
    });
  }

  /**
   * Helper to track saved filter usage
   */
  static async trackSavedFilterUsage(
    organizationId: string,
    filterId: string
  ): Promise<void> {
    await this.trackAndEnforce({
      organizationId,
      usageType: UsageType.SAVED_FILTER,
      quantity: 1,
      resourceId: filterId,
      resourceType: 'filter'
    });
  }

  /**
   * Migrate usage data from old subscription to new subscription during plan changes
   * This ensures usage continuity when switching plans
   */
  static async migrateUsageForPlanSwitch(
    organizationId: string,
    oldSubscriptionId: string,
    newSubscriptionId: string
  ): Promise<number> {
    try {
      // Get the current billing period for the organization
      const { periodStart, periodEnd } = await this.getBillingPeriod(organizationId);

      // Update all usage records from the old subscription to the new subscription
      // for the current billing period
      const updateResult = await db.usageRecord.updateMany({
        where: {
          organizationId,
          subscriptionId: oldSubscriptionId,
          createdAt: {
            gte: periodStart,
            lt: periodEnd
          }
        },
        data: {
          subscriptionId: newSubscriptionId,
          // Note: We can't update metadata in updateMany, so we'll handle this separately if needed
        }
      });

      console.log(`Successfully migrated ${updateResult.count} usage records from subscription ${oldSubscriptionId} to ${newSubscriptionId} for organization ${organizationId}`);

      // Return the count for logging purposes
      return updateResult.count;
    } catch (error) {
      console.error('Error migrating usage data during plan switch:', error);
      throw error;
    }
  }

  /**
   * Preserve usage data during subscription transitions
   * This method should be called before canceling subscriptions during plan changes
   */
  static async preserveUsageForSubscriptionTransition(
    organizationId: string,
    currentSubscriptionId: string,
    newSubscriptionId: string
  ): Promise<void> {
    try {
      // Get current billing period
      const { periodStart, periodEnd } = await this.getBillingPeriod(organizationId);

      // Create a snapshot of current usage before the transition
      const currentUsage = await db.usageRecord.findMany({
        where: {
          organizationId,
          subscriptionId: currentSubscriptionId,
          createdAt: {
            gte: periodStart,
            lt: periodEnd
          }
        }
      });

      // If there's existing usage, migrate it to the new subscription
      if (currentUsage.length > 0) {
        await this.migrateUsageForPlanSwitch(
          organizationId,
          currentSubscriptionId,
          newSubscriptionId
        );
      }

      console.log(`Preserved ${currentUsage.length} usage records during subscription transition for organization ${organizationId}`);
    } catch (error) {
      console.error('Error preserving usage during subscription transition:', error);
      throw error;
    }
  }

  /**
   * Automatically preserve usage during plan switches by detecting subscription changes
   * This method should be called whenever a new subscription is created for an organization
   */
  static async autoPreserveUsageOnPlanSwitch(organizationId: string, newSubscriptionId: string): Promise<void> {
    try {
      // Find the most recent active/canceled subscription (excluding the new one)
      const previousSubscription = await db.subscription.findFirst({
        where: {
          organizationId,
          id: {
            not: newSubscriptionId
          },
          status: {
            in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED']
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      if (previousSubscription) {
        // Check if there's usage from the previous subscription in the current billing period
        const { periodStart, periodEnd } = await this.getBillingPeriod(organizationId);

        const previousUsage = await db.usageRecord.findMany({
          where: {
            organizationId,
            subscriptionId: previousSubscription.id,
            createdAt: {
              gte: periodStart, lt: periodEnd
            }
          }
        });

        if (previousUsage.length > 0) {
          console.log(`🔄 Auto-preserving ${previousUsage.length} usage records from previous subscription ${previousSubscription.id} to new subscription ${newSubscriptionId}`);
          await this.migrateUsageForPlanSwitch(
            organizationId,
            previousSubscription.id,
            newSubscriptionId
          );
        }
      }
    } catch (error) {
      console.error('Error auto-preserving usage during plan switch:', error);
      // Don't throw here - this is a background operation
    }
  }
}

// Middleware helper for automatic usage tracking
export function withUsageTracking(
  usageType: UsageType,
  options?: {
    quantity?: number;
    resourceIdFromRequest?: (req: any) => string;
    resourceType?: string;
  }
) {
  return function (handler: (...args: any[]) => any) {
    return async function (req: any, ...args: any[]) {
      try {
        // Extract organization ID from request (assuming you have tenant context)
        const user = await getCurrentUser();
        if (!user) throw new Error('Authenticated organization required for usage tracking');
        const organizationId = user.organizationId;

        if (organizationId) {
          // Check usage limit before proceeding
          await UsageTrackingService.enforceUsageLimit(
            organizationId,
            usageType,
            options?.quantity ?? 1
          );

          // Execute the handler
          const result = await handler(req, ...args);

          // Track usage after successful execution
          await UsageTrackingService.trackUsage({
            organizationId,
            usageType,
            quantity: options?.quantity ?? 1,
            resourceId: options?.resourceIdFromRequest?.(req),
            resourceType: options?.resourceType,
          });

          return result;
        }

        // If no organization ID, just execute handler (might be unauthenticated endpoint)
        return await handler(req, ...args);
      } catch (error) {
        // Re-throw the error (including usage limit errors)
        throw error;
      }
    };
  };
}
