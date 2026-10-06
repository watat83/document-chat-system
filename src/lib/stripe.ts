import { loadStripe } from '@stripe/stripe-js';

// Check if we're in browser or server environment
const isBrowser = typeof window !== 'undefined';

// In browser, use environment variables directly
// In server, use the centralized config
const stripePublishableKey = isBrowser
  ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  : require('@/lib/config/env').stripe?.publishableKey;

const stripePriceIds = isBrowser
  ? {
      priceStarter: process.env.NEXT_PUBLIC_STRIPE_STARTER_PLAN_PRICE_ID,
      priceProfessional: process.env.NEXT_PUBLIC_STRIPE_PROFESSIONAL_PLAN_PRICE_ID,
      priceAgency: process.env.NEXT_PUBLIC_STRIPE_AGENCY_PLAN_PRICE_ID,
    }
  : require('@/lib/config/env').stripe;

// Client-side Stripe instance
export const getStripe = () => {
  if (!stripePublishableKey) {
    throw new Error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY environment variable');
  }

  return loadStripe(stripePublishableKey);
};

/**
 * Stripe Price ID mappings - Only contains Stripe-specific configuration
 * All pricing data should be fetched from PricingService
 */
export const STRIPE_PRICE_IDS = {
  // Monthly price IDs from Stripe
  STARTER_MONTHLY: 'price_1Rh465QEGVp7c1lx569CvH1O',
  PROFESSIONAL_MONTHLY: 'price_1Rh465QEGVp7c1lxXTDm7WaT',
  AGENCY_MONTHLY: 'price_1Rh466QEGVp7c1lxpqhF84Tb',
  // Add yearly price IDs when available
  // STARTER_YEARLY: 'price_yearly_starter',
  // PROFESSIONAL_YEARLY: 'price_yearly_professional',
  // AGENCY_YEARLY: 'price_yearly_agency',
} as const;

/**
 * Get subscription plans dynamically from PricingService
 * This is a compatibility layer for components still using SUBSCRIPTION_PLANS
 *
 * @deprecated Use PricingService.getActivePlans() directly instead
 */
export async function getSubscriptionPlans() {
  // Dynamic import to avoid circular dependencies
  const { PricingService } = await import('@/lib/pricing-service');

  try {
    const plans = await PricingService.getStripeFormattedPlans();
    return plans;
  } catch (error) {
    console.error('Failed to get dynamic pricing plans:', error);
    // Fallback to DEFAULT_PLANS
    const { DEFAULT_PLANS } = await import('@/lib/config/default-plans');

    const fallbackPlans: Record<string, any> = {};
    Object.entries(DEFAULT_PLANS).forEach(([key, plan]) => {
      fallbackPlans[key] = {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        priceId: STRIPE_PRICE_IDS[`${key}_MONTHLY` as keyof typeof STRIPE_PRICE_IDS] || null,
        interval: 'month',
        features: plan.features,
        limits: {
          seats: plan.limits.seats,
          savedSearches: 0,
          documentsPerMonth: plan.limits.documentsPerMonth,
          aiCreditsPerMonth: plan.limits.aiCreditsPerMonth,
          matchScoreCalculations: 0,
        },
      };
    });

    return fallbackPlans;
  }
}

/**
 * Legacy SUBSCRIPTION_PLANS constant for backward compatibility
 *
 * @deprecated This will be removed in future versions. Use PricingService instead.
 * This constant now returns a Proxy that throws errors to help identify usage.
 */
export const SUBSCRIPTION_PLANS = new Proxy({}, {
  get(target, prop) {
    console.warn(
      '⚠️  SUBSCRIPTION_PLANS is deprecated. Please use PricingService.getActivePlans() or getSubscriptionPlans() instead.',
      `\nAccessed property: ${String(prop)}`,
      '\nStack trace:', new Error().stack
    );

    // For development, we can provide fallback data to prevent immediate breaks
    if (process.env.NODE_ENV === 'development') {
      const { DEFAULT_PLANS } = require('@/lib/config/default-plans');
      const planKey = String(prop).toUpperCase();

      if (DEFAULT_PLANS[planKey as keyof typeof DEFAULT_PLANS]) {
        const plan = DEFAULT_PLANS[planKey as keyof typeof DEFAULT_PLANS];
        return {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          priceId: STRIPE_PRICE_IDS[`${planKey}_MONTHLY` as keyof typeof STRIPE_PRICE_IDS] || null,
          interval: 'month',
          features: plan.features,
          limits: {
            seats: plan.limits.seats,
            savedSearches: 0,
          documentsPerMonth: plan.limits.documentsPerMonth,
            aiCreditsPerMonth: plan.limits.aiCreditsPerMonth,
            matchScoreCalculations: 0,
          },
        };
      }
    }

    throw new Error(
      `SUBSCRIPTION_PLANS.${String(prop)} is no longer available. ` +
      'Please migrate to PricingService.getActivePlans() for dynamic pricing data.'
    );
  }
}) as any;

export type SubscriptionPlan = 'STARTER' | 'PROFESSIONAL' | 'AGENCY' | 'ENTERPRISE';

// Map plan IDs to display names
export const PLAN_DISPLAY_NAMES: Record<SubscriptionPlan, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Pro',
  AGENCY: 'Agency',
  ENTERPRISE: 'Enterprise',
};

// Stripe webhook events we handle
export const STRIPE_WEBHOOK_EVENTS = {
  CUSTOMER_SUBSCRIPTION_CREATED: 'customer.subscription.created',
  CUSTOMER_SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  CUSTOMER_SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
} as const;

// Helper function to format currency
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

// Helper function to get plan by Stripe price ID
export function getPlanByPriceId(priceId: string): SubscriptionPlan | null {
  // Map Stripe price IDs to plan types
  const priceIdToPlan: Record<string, SubscriptionPlan> = {
    [STRIPE_PRICE_IDS.STARTER_MONTHLY]: 'STARTER',
    [STRIPE_PRICE_IDS.PROFESSIONAL_MONTHLY]: 'PROFESSIONAL',
    [STRIPE_PRICE_IDS.AGENCY_MONTHLY]: 'AGENCY',
  };

  // Also check environment variables in case they're different
  if (stripePriceIds?.priceStarter === priceId) return 'STARTER';
  if (stripePriceIds?.priceProfessional === priceId) return 'PROFESSIONAL';
  if (stripePriceIds?.priceAgency === priceId) return 'AGENCY';

  return priceIdToPlan[priceId] || null;
}

/**
 * Get Stripe price ID for a plan type
 */
export function getStripePriceId(planType: SubscriptionPlan, interval: 'monthly' | 'yearly' = 'monthly'): string | null {
  const suffix = interval === 'yearly' ? '_YEARLY' : '_MONTHLY';
  const key = `${planType}${suffix}` as keyof typeof STRIPE_PRICE_IDS;
  return STRIPE_PRICE_IDS[key] || null;
}

// Helper function to check if user has exceeded usage limits
export function hasExceededLimit(
  currentUsage: number,
  limit: number,
  buffer = 0.1 // 10% buffer before hard limit
): boolean {
  if (limit === -1) return false; // Unlimited
  return currentUsage >= limit * (1 - buffer);
}
