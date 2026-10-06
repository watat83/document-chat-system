import Stripe from 'stripe';
import { stripe as stripeConfig } from '@/lib/config/env';

// Lazy-initialized Stripe instance to avoid import-time errors
let _stripe: Stripe | null = null;

export const stripe = new Proxy({} as Stripe, {
  get(target, prop) {
    if (!_stripe) {
      if (!stripeConfig.secretKey) {
        throw new Error('Missing STRIPE_SECRET_KEY environment variable');
      }
      _stripe = new Stripe(stripeConfig.secretKey, {
        apiVersion: '2026-09-30.endive',
        typescript: true,
      });
    }
    return _stripe[prop as keyof Stripe];
  }
});

// Stripe webhook events we handle
export const STRIPE_WEBHOOK_EVENTS = {
  CUSTOMER_SUBSCRIPTION_CREATED: 'customer.subscription.created',
  CUSTOMER_SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  CUSTOMER_SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRICE_CREATED: 'price.created',
  PRICE_UPDATED: 'price.updated',
  PRICE_DELETED: 'price.deleted',
} as const;
