import { db } from './db';
import { TenantContext } from './tenant-context';
import { getSubscriptionPlans } from './stripe';

export enum UsageType {
  OPPORTUNITY_MATCH = 'OPPORTUNITY_MATCH',
  AI_QUERY = 'AI_QUERY',
  DOCUMENT_PROCESSING = 'DOCUMENT_PROCESSING',
  API_CALL = 'API_CALL',
  EXPORT = 'EXPORT',
  USER_SEAT = 'USER_SEAT',
  MATCH_SCORE_CALCULATION = 'MATCH_SCORE_CALCULATION',
  SAVED_FILTER = 'SAVED_FILTER',
  SAVED_SEARCH = 'SAVED_SEARCH',
}

export interface UsageTrackingOptions {
  organizationId: string;
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
      usageType,
      quantity = 1,
      resourceId,
      resourceType,
      metadata,
    } = options;

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
        metadata,
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
          seats: 5,
          documentsPerMonth: 10,
          savedSearches: 1,
          aiCreditsPerMonth: 100,
          matchScoreCalculations: 100
        };
      }
    } else {
      // Fallback to STARTER plan limits
      const plans = await getSubscriptionPlans();
      limits = plans.STARTER?.limits || {
        seats: 5,
        documentsPerMonth: 10,
        savedSearches: 1,
        aiCreditsPerMonth: 100,
        matchScoreCalculations: 100
      };
    }

    // Get specific limit for this usage type
    const limit = this.getLimitForUsageType(limits, usageType);

    // Get current usage for this billing period (always calculate, even for unlimited plans)
    const { periodStart } = await this.getBillingPeriod(organizationId);
    
    const currentUsageResult = await db.usageRecord.aggregate({
      where: {
        organizationId,
        usageType,
        createdAt: {
          gte: periodStart
        }
      },
      _sum: {
        quantity: true
      }
    });

    const currentUsage = currentUsageResult._sum.quantity || 0;

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
          lte: periodEnd
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
   * Allows bypass for developer email (yourpersonalmarketer123@gmail.com) with warnings
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
   * Check if the current user is the developer (yourpersonalmarketer123@gmail.com)
   */

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
    const isDeveloper = await this.isDeveloperUser(organizationId);
    
    console.log('📊 Usage limit check details:', {
      organizationId,
      usageType,
      quantity,
      isDeveloper,
      currentUsage: check.currentUsage,
      limit: check.limit,
      allowed: check.allowed,
      percentUsed: check.percentUsed
    });
    
    let warningMessage: string | undefined;
    let upgradeMessage: string | undefined;
    let canProceed = check.allowed;
    let isDeveloperOverride = false;

    if (!check.allowed) {
      if (isDeveloper) {
        canProceed = true;
        isDeveloperOverride = true;
        warningMessage = `Developer Mode: This action would exceed your ${usageType} limit in production (${check.currentUsage}/${check.limit})`;
      } else {
        warningMessage = `You've reached your ${usageType} limit (${check.currentUsage}/${check.limit})`;
        upgradeMessage = `Upgrade your plan to get more ${usageType.toLowerCase().replace('_', ' ')} capacity`;
      }
    } else if (check.percentUsed >= 80) {
      warningMessage = `You're approaching your ${usageType} limit (${check.currentUsage}/${check.limit} - ${check.percentUsed}% used)`;
    }

    return {
      ...check,
      canProceed,
      warningMessage,
      upgradeMessage,
      isDeveloperOverride
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
    try {
      // Get current active subscription
      const activeSubscription = await db.subscription.findFirst({
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

      // Get recently canceled subscriptions that might have usage data
      const recentCanceledSubscriptions = await db.subscription.findMany({
        where: {
          organizationId,
          status: 'CANCELED',
          canceledAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Within last 30 days
          }
        },
        orderBy: {
          canceledAt: 'desc'
        }
      });

      // ENHANCED LOGIC: Create a unified billing period that encompasses both old and new subscriptions
      let periodStart: Date;
      let periodEnd: Date;

      if (activeSubscription?.currentPeriodStart && activeSubscription?.currentPeriodEnd) {
        periodStart = new Date(activeSubscription.currentPeriodStart);
        periodEnd = new Date(activeSubscription.currentPeriodEnd);

        // CRITICAL FIX: Check if there are usage records that predate the current period
        // This handles cases where a plan switch happened mid-period
        const existingUsage = await db.usageRecord.findFirst({
          where: {
            organizationId,
            createdAt: {
              lt: periodStart
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

        if (existingUsage) {
          // Find the earliest usage record in the current billing cycle
          const earliestUsageInCycle = await db.usageRecord.findFirst({
            where: {
              organizationId,
              createdAt: {
                gte: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) // Within last 31 days
              }
            },
            orderBy: {
              createdAt: 'asc'
            }
          });

          if (earliestUsageInCycle) {
            const usageDate = new Date(earliestUsageInCycle.createdAt);
            // Extend period to include all usage from the current billing cycle
            if (usageDate < periodStart) {
              console.log(`🔄 Extending billing period start from ${periodStart.toISOString()} to ${usageDate.toISOString()} to preserve usage continuity`);
              periodStart = usageDate;
            }
          }
        }

        // If there are recent cancellations, also check their periods
        if (recentCanceledSubscriptions.length > 0) {
          const oldestCanceled = recentCanceledSubscriptions[recentCanceledSubscriptions.length - 1];
          if (oldestCanceled.currentPeriodStart) {
            const oldPeriodStart = new Date(oldestCanceled.currentPeriodStart);
            // Use the earlier start date to preserve usage continuity
            if (oldPeriodStart < periodStart) {
              console.log(`🔄 Extending billing period start from ${periodStart.toISOString()} to ${oldPeriodStart.toISOString()} to preserve usage data from canceled subscription`);
              periodStart = oldPeriodStart;
            }
          }
        }

        return { periodStart, periodEnd };
      }

      // If no active subscription, use the most recent canceled subscription's period (if still valid)
      if (recentCanceledSubscriptions.length > 0) {
        const mostRecentCanceled = recentCanceledSubscriptions[0];
        if (mostRecentCanceled.currentPeriodStart && mostRecentCanceled.currentPeriodEnd) {
          const now = new Date();
          const canceledPeriodEnd = new Date(mostRecentCanceled.currentPeriodEnd);
          
          // Use canceled subscription's period if it's still valid or recently expired
          if (now <= canceledPeriodEnd || (now.getTime() - canceledPeriodEnd.getTime()) < 24 * 60 * 60 * 1000) {
            console.log(`🔄 Using recently canceled subscription period for usage calculation`);
            return {
              periodStart: new Date(mostRecentCanceled.currentPeriodStart),
              periodEnd: canceledPeriodEnd
            };
          }
        }
      }

    } catch (error) {
      console.warn('Error getting subscription billing period:', error);
    }

    // Final fallback to calendar month
    const now = new Date();
    return {
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0)
    };
  }

  /**
   * Get usage limit for a specific usage type from limits object
   */
  private static getLimitForUsageType(limits: UsageLimits, usageType: UsageType): number {
    switch (usageType) {
      case UsageType.AI_QUERY:
        return limits.aiCreditsPerMonth;
      case UsageType.MATCH_SCORE_CALCULATION:
        return limits.matchScoreCalculations;
      case UsageType.SAVED_FILTER:
        return limits.documentsPerMonth;
      case UsageType.SAVED_SEARCH:
        return limits.savedSearches;
      case UsageType.USER_SEAT:
        return limits.seats;
      // These types typically don't have limits
      case UsageType.OPPORTUNITY_MATCH:
      case UsageType.DOCUMENT_PROCESSING:
      case UsageType.API_CALL:
      case UsageType.EXPORT:
        return -1; // Unlimited
      default:
        return -1; // Unlimited for unknown types
    }
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
            lte: periodEnd
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
            lte: periodEnd
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
        const { periodStart } = await this.getBillingPeriod(organizationId);
        
        const previousUsage = await db.usageRecord.findMany({
          where: {
            organizationId,
            subscriptionId: previousSubscription.id,
            createdAt: {
              gte: periodStart
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
  return function (handler: Function) {
    return async function (req: any, ...args: any[]) {
      try {
        // Extract organization ID from request (assuming you have tenant context)
        const tenantContext = new TenantContext(req.user);
        const organizationId = await tenantContext.getOrganizationId();

        if (organizationId) {
          // Check usage limit before proceeding
          await UsageTrackingService.enforceUsageLimit(
            organizationId,
            usageType,
            options?.quantity || 1
          );

          // Execute the handler
          const result = await handler(req, ...args);

          // Track usage after successful execution
          await UsageTrackingService.trackUsage({
            organizationId,
            usageType,
            quantity: options?.quantity || 1,
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