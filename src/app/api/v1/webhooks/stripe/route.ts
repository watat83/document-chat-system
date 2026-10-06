import { getInvoiceSubscriptionId } from '@/lib/billing/invoice-subscription';
import { claimWebhook } from '@/lib/billing/webhook-lease';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_WEBHOOK_EVENTS } from '@/lib/stripe-server';
import { db } from '@/lib/db';
import Stripe from 'stripe';
import { SubscriptionManager } from '@/lib/subscription-manager';
import { cacheManager } from '@/lib/cache';
import { stripe as stripeConfig } from '@/lib/config/env';

/**
 * Stripe webhook handler for subscription events
 * 
 * This endpoint handles incoming webhook events from Stripe to keep
 * subscription data in sync with our database.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    console.error('No Stripe signature found');
    return NextResponse.json(
      { error: 'No Stripe signature found' }, 
      { status: 400 }
    );
  }

  if (!stripeConfig.webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET environment variable');
    return NextResponse.json(
      { error: 'Webhook configuration error' }, 
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      stripeConfig.webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature' }, 
      { status: 400 }
    );
  }

  // Log the event for debugging
  console.log(`Received Stripe webhook: ${event.type} - ${event.id}`);

  let lease: Awaited<ReturnType<typeof claimWebhook>> | undefined;
  try {
    lease = await claimWebhook(db, event);
    if (lease.status === 'completed') return NextResponse.json({ received: true });
    if (lease.status === 'busy') return NextResponse.json({ error: 'Event is processing; retry later' }, { status: 503, headers: { 'Retry-After': '30' } });

    // Process the event based on type
    switch (event.type) {
      case STRIPE_WEBHOOK_EVENTS.CUSTOMER_SUBSCRIPTION_CREATED:
        await handleSubscriptionCreated(await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id));
        break;
        
      case STRIPE_WEBHOOK_EVENTS.CUSTOMER_SUBSCRIPTION_UPDATED:
        await handleSubscriptionUpdated(await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id));
        break;
        
      case STRIPE_WEBHOOK_EVENTS.CUSTOMER_SUBSCRIPTION_DELETED:
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.INVOICE_PAYMENT_SUCCEEDED:
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.INVOICE_PAYMENT_FAILED:
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_COMPLETED:
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.PRODUCT_CREATED:
        await handleProductCreated(event.data.object as Stripe.Product);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.PRODUCT_UPDATED:
        await handleProductUpdated(event.data.object as Stripe.Product);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.PRODUCT_DELETED:
        await handleProductDeleted(event.data.object as Stripe.Product);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.PRICE_CREATED:
        await handlePriceCreated(event.data.object as Stripe.Price);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.PRICE_UPDATED:
        await handlePriceUpdated(event.data.object as Stripe.Price);
        break;
        
      case STRIPE_WEBHOOK_EVENTS.PRICE_DELETED:
        await handlePriceDeleted(event.data.object as Stripe.Price);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    const completed = await db.billingEvent.updateMany({
      where: { id: lease.id, processingStartedAt: lease.startedAt, processed: false },
      data: { 
        processed: true, 
        processedAt: new Date(), processingStartedAt: null
      }
    });

    if (completed.count !== 1) throw new Error('Webhook processing lease expired');
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Update event with error
    try {
      if (lease?.status === 'claimed') await db.billingEvent.updateMany({
        where: { stripeEventId: event.id, processed: false, ...(lease && 'startedAt' in lease ? { processingStartedAt: lease.startedAt } : {}) },
        data: { 
          processingStartedAt: null,
          processingError: error instanceof Error ? error.message : 'Unknown error',
          retryCount: { increment: 1 }
        }
      });
    } catch (dbError) {
      console.error('Failed to update billing event with error:', dbError);
    }

    return NextResponse.json(
      { error: 'Webhook processing failed' }, 
      { status: 500 }
    );
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('🆕 Processing subscription created:', subscription.id);
  
  const organization = await db.organization.findFirst({
    where: { stripeCustomerId: subscription.customer as string }
  });

  if (!organization) {
    throw new Error(`Organization not found for customer: ${subscription.customer}`);
  }

  console.log(`Found organization: ${organization.id} (${organization.name})`);

  // **ENHANCED**: Use SubscriptionManager for consistent handling
  try {
    // Clean up any existing subscriptions for this organization first
    await SubscriptionManager.cleanupExistingSubscriptions(
      organization.id,
      subscription.customer as string,
      subscription.id // Exclude the newly created subscription
    );

    // Sync the new subscription to database
    await SubscriptionManager.syncSubscriptionToDatabase(subscription, organization.id);
    
    console.log(`✅ Subscription created and synced: ${subscription.id}`);
    
    // Note: No cache to invalidate since subscription caching is disabled
  } catch (error) {
    console.error(`❌ Failed to handle subscription creation for ${subscription.id}:`, error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('🔄 Processing subscription updated:', subscription.id);
  
  const existingSubscription = await db.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id }
  });

  if (!existingSubscription) {
    console.warn(`⚠️ Subscription not found in database: ${subscription.id}, creating it...`);
    // If subscription doesn't exist in our database, treat it as a new subscription
    return await handleSubscriptionCreated(subscription);
  }

  console.log(`Found existing subscription in database: ${existingSubscription.id}`);

  // **ENHANCED**: Use SubscriptionManager for consistent handling
  try {
    await SubscriptionManager.syncSubscriptionToDatabase(subscription, existingSubscription.organizationId);
    console.log(`✅ Subscription updated and synced: ${subscription.id}`);
    
    // Note: No cache to invalidate since subscription caching is disabled
  } catch (error) {
    console.error(`❌ Failed to handle subscription update for ${subscription.id}:`, error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('Processing subscription deleted:', subscription.id);
  
  const existingSubscription = await db.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id }
  });

  if (!existingSubscription) {
    console.warn(`Subscription not found in database: ${subscription.id}`);
    return;
  }

  // Update subscription status
  await db.subscription.update({
    where: { id: existingSubscription.id },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
    }
  });

  // Update organization to downgrade to free plan
  await db.organization.update({
    where: { id: existingSubscription.organizationId },
    data: {
      subscriptionStatus: 'CANCELED',
      planType: null, // No active plan
    }
  });

  // Note: No cache to invalidate since subscription caching is disabled
}

async function syncInvoiceSubscription(invoice: Stripe.Invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof current.customer === 'string' ? current.customer : current.customer.id;
  const organization = await db.organization.findFirst({ where: { stripeCustomerId: customerId } });
  if (!organization) throw new Error('Invoice organization is not synchronized yet');
  // Delivery order does not define the current billing state; retrieve it from Stripe.
  await SubscriptionManager.syncSubscriptionToDatabase(current, organization.id);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  await syncInvoiceSubscription(invoice);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  await syncInvoiceSubscription(invoice);
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('💳 Processing completed checkout session:', session.id);
  
  if (!session.metadata?.organizationId) {
    console.log('No organization ID in checkout session metadata');
    return;
  }

  const organizationId = session.metadata.organizationId;
  console.log(`Checkout completed for organization: ${organizationId}`);

  // **ENHANCED**: Use SubscriptionManager for comprehensive handling
  if (session.subscription) {
    try {
      // Get the new subscription details
      const newSubscription = await stripe.subscriptions.retrieve(session.subscription as string);
      
      console.log(`🔍 Retrieved new subscription: ${newSubscription.id} (${newSubscription.status})`);
      
      // Get organization for customer validation
      const organization = await db.organization.findUnique({
        where: { id: organizationId }
      });

      if (!organization) {
        throw new Error(`Organization not found: ${organizationId}`);
      }
      
      // **ENHANCED**: Use SubscriptionManager for cleanup and sync
      console.log('🧹 Starting comprehensive subscription cleanup...');
      
      const cleanupResult = await SubscriptionManager.cleanupExistingSubscriptions(
        organizationId,
        organization.stripeCustomerId || undefined,
        newSubscription.id // Exclude the new subscription
      );
      
      console.log(`✅ Cleanup completed: ${cleanupResult.cleanedSubscriptions} cleaned, ${cleanupResult.errors.length} errors`);
      
      // Sync the new subscription to database
      const syncedSubscription = await SubscriptionManager.syncSubscriptionToDatabase(
        newSubscription, 
        organizationId
      );
      
      // Log the completion
      const actionType = session.metadata?.action === 'plan_change' ? 'Plan change' : 'New subscription';
      console.log(`✅ ${actionType} completed successfully for organization ${organizationId}`);
      
      // Create billing event for audit trail
      await db.billingEvent.upsert({
        where: { stripeEventId: `checkout_${session.id}` }, update: {},
        create: {
          eventType: 'subscription_checkout_completed',
          stripeEventId: `checkout_${session.id}`,
          data: {
            sessionId: session.id,
            organizationId,
            subscriptionId: newSubscription.id,
            planType: syncedSubscription.planType,
            action: session.metadata?.action || 'new_subscription',
            cleanupResults: {
              cleaned: cleanupResult.cleanedSubscriptions,
              errors: cleanupResult.errors.length
            }
          } as any,
          processed: true,
          processedAt: new Date()
        }
      });
      
    } catch (error) {
      console.error('❌ Error processing checkout session completion:', error);
      
      // Create error billing event
      await db.billingEvent.upsert({
        where: { stripeEventId: `checkout_error_${session.id}` }, update: {},
        create: {
          eventType: 'subscription_checkout_error',
          stripeEventId: `checkout_error_${session.id}`,
          data: {
            sessionId: session.id,
            organizationId,
            error: error instanceof Error ? error.message : 'Unknown error'
          } as any,
          processed: true,
          processedAt: new Date(),
          processingError: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      
      throw error; // Re-throw to trigger webhook retry
    }
  } else {
    console.warn('⚠️ No subscription found in checkout session');
  }
}

// Helper functions
function getPlanTypeFromSubscription(subscription: Stripe.Subscription): string {
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

function mapStripeStatus(stripeStatus: string): string {
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

function getPlanFeatures(planType: string): string[] {
  // In a real implementation, this would be more sophisticated
  const planFeatures: Record<string, string[]> = {
    'STARTER': ['1 seat', '1 saved search', 'Basic search'],
    'PROFESSIONAL': ['1 seat', '10 saved searches', '10 AI credits'],
    'AGENCY': ['5 seats', 'Unlimited saved searches', '50 AI credits'],
    'ENTERPRISE': ['Custom seats', 'Custom AI credits', 'All features'],
  };

  return planFeatures[planType] || [];
}

function getPlanLimits(planType: string): any {
  const planLimits: Record<string, any> = {
    'STARTER': {
      seats: 1,
      savedSearches: 1,
      aiCreditsPerMonth: 0,
      matchScoreCalculations: 50,
    },
    'PROFESSIONAL': {
      seats: 1,
      savedSearches: 10,
      aiCreditsPerMonth: 10,
      matchScoreCalculations: 200,
    },
    'AGENCY': {
      seats: 5,
      savedSearches: -1,
      aiCreditsPerMonth: 50,
      matchScoreCalculations: 500,
    },
    'ENTERPRISE': {
      seats: -1,
      savedSearches: -1,
      aiCreditsPerMonth: -1,
      matchScoreCalculations: -1,
    },
  };

  return planLimits[planType] || planLimits['STARTER'];
}

// Product webhook handlers
async function handleProductCreated(product: Stripe.Product) {
  console.log('🆕 Processing product created:', product.id);
  
  // Only process products that have planType metadata (our managed products)
  if (!product.metadata?.planType) {
    console.log(`⚠️ Skipping product ${product.id} - no planType metadata`);
    return;
  }
  
  const planType = product.metadata.planType;
  console.log(`Processing pricing plan product: ${planType}`);
  
  try {
    // Create or update pricing plan from product metadata
    const pricingPlan = await db.pricingPlan.upsert({
      where: { planType },
      create: {
        planType,
        displayName: product.name,
        description: product.description || '',
        monthlyPrice: 0, // Will be updated when price events come in
        yearlyPrice: null,
        currency: 'usd',
        features: product.metadata?.features ? JSON.parse(product.metadata.features) : [],
        limits: product.metadata?.limits ? JSON.parse(product.metadata.limits) : {},
        isActive: product.active,
        isPopular: product.metadata?.isPopular === 'true',
        displayOrder: product.metadata?.displayOrder ? parseInt(product.metadata.displayOrder) : 0,
        metadata: {
          stripeProductId: product.id,
          ...product.metadata
        }
      },
      update: {
        displayName: product.name,
        description: product.description || '',
        features: product.metadata?.features ? JSON.parse(product.metadata.features) : undefined,
        limits: product.metadata?.limits ? JSON.parse(product.metadata.limits) : undefined,
        isActive: product.active,
        isPopular: product.metadata?.isPopular === 'true',
        displayOrder: product.metadata?.displayOrder ? parseInt(product.metadata.displayOrder) : undefined,
        metadata: {
          stripeProductId: product.id,
          ...product.metadata
        }
      }
    });
    
    console.log(`✅ Pricing plan synced: ${pricingPlan.planType} (${pricingPlan.id})`);
    
    // Invalidate pricing cache
    await cacheManager.invalidate('pricing:plans');
    console.log('🗑️ Pricing plans cache invalidated');
    
  } catch (error) {
    console.error(`❌ Failed to handle product creation for ${product.id}:`, error);
    throw error;
  }
}

async function handleProductUpdated(product: Stripe.Product) {
  console.log('🔄 Processing product updated:', product.id);
  
  // Only process products that have planType metadata (our managed products)
  if (!product.metadata?.planType) {
    console.log(`⚠️ Skipping product ${product.id} - no planType metadata`);
    return;
  }
  
  const planType = product.metadata.planType;
  console.log(`Updating pricing plan product: ${planType}`);
  
  try {
    // Find existing pricing plan
    const existingPlan = await db.pricingPlan.findUnique({
      where: { planType }
    });
    
    if (!existingPlan) {
      console.log(`⚠️ Pricing plan not found for ${planType}, creating it...`);
      return await handleProductCreated(product);
    }
    
    // Update pricing plan with product information
    const updatedPlan = await db.pricingPlan.update({
      where: { planType },
      data: {
        displayName: product.name,
        description: product.description || '',
        features: product.metadata?.features ? JSON.parse(product.metadata.features) : undefined,
        limits: product.metadata?.limits ? JSON.parse(product.metadata.limits) : undefined,
        isActive: product.active,
        isPopular: product.metadata?.isPopular === 'true',
        displayOrder: product.metadata?.displayOrder ? parseInt(product.metadata.displayOrder) : undefined,
        metadata: {
          ...(existingPlan.metadata as any || {}),
          stripeProductId: product.id,
          ...product.metadata
        }
      }
    });
    
    console.log(`✅ Pricing plan updated: ${updatedPlan.planType} (${updatedPlan.id})`);
    
    // Invalidate pricing cache
    await cacheManager.invalidate('pricing:plans');
    console.log('🗑️ Pricing plans cache invalidated');
    
  } catch (error) {
    console.error(`❌ Failed to handle product update for ${product.id}:`, error);
    throw error;
  }
}

async function handleProductDeleted(product: Stripe.Product) {
  console.log('🗑️ Processing product deleted:', product.id);
  
  // Only process products that have planType metadata (our managed products)
  if (!product.metadata?.planType) {
    console.log(`⚠️ Skipping product ${product.id} - no planType metadata`);
    return;
  }
  
  const planType = product.metadata.planType;
  console.log(`Soft deleting pricing plan: ${planType}`);
  
  try {
    // Find existing pricing plan
    const existingPlan = await db.pricingPlan.findUnique({
      where: { planType }
    });
    
    if (!existingPlan) {
      console.log(`⚠️ Pricing plan not found for ${planType}`);
      return;
    }
    
    // Mark pricing plan as inactive (soft delete)
    const updatedPlan = await db.pricingPlan.update({
      where: { planType },
      data: {
        isActive: false,
        metadata: {
          ...(existingPlan.metadata as any || {}),
          deletedAt: new Date().toISOString(),
          stripeProductDeleted: true
        }
      }
    });
    
    console.log(`✅ Pricing plan marked as inactive: ${updatedPlan.planType} (${updatedPlan.id})`);
    
    // Invalidate pricing cache
    await cacheManager.invalidate('pricing:plans');
    console.log('🗑️ Pricing plans cache invalidated');
    
  } catch (error) {
    console.error(`❌ Failed to handle product deletion for ${product.id}:`, error);
    throw error;
  }
}

// Price webhook handlers
async function handlePriceCreated(price: Stripe.Price) {
  console.log('🆕 Processing price created:', price.id);
  
  // Get the associated product to find the plan type
  if (!price.product || typeof price.product !== 'string') {
    console.log(`⚠️ Skipping price ${price.id} - no product association`);
    return;
  }
  
  try {
    // Retrieve the product to get metadata
    const product = await stripe.products.retrieve(price.product);
    
    // Only process prices for products that have planType metadata
    if (!product.metadata?.planType) {
      console.log(`⚠️ Skipping price ${price.id} - product has no planType metadata`);
      return;
    }
    
    const planType = product.metadata.planType;
    console.log(`Adding price to pricing plan: ${planType}`);
    
    // Find existing pricing plan
    const existingPlan = await db.pricingPlan.findUnique({
      where: { planType }
    });
    
    if (!existingPlan) {
      console.log(`⚠️ Pricing plan not found for ${planType}, creating from product...`);
      await handleProductCreated(product);
      // Retry finding the plan after creation
      const newPlan = await db.pricingPlan.findUnique({
        where: { planType }
      });
      if (!newPlan) {
        throw new Error(`Failed to create pricing plan for ${planType}`);
      }
    }
    
    // Determine if this is a monthly or yearly price based on interval
    const isMonthly = price.recurring?.interval === 'month';
    const isYearly = price.recurring?.interval === 'year';
    
    if (!isMonthly && !isYearly) {
      console.log(`⚠️ Skipping price ${price.id} - not monthly or yearly recurring`);
      return;
    }
    
    // Update pricing plan with new price information
    const updateData: any = {};
    
    if (isMonthly) {
      updateData.monthlyPrice = price.unit_amount || 0;
      updateData.stripeMonthlyPriceId = price.id;
    } else if (isYearly) {
      updateData.yearlyPrice = price.unit_amount || 0;
      updateData.stripeYearlyPriceId = price.id;
    }
    
    if (price.currency) {
      updateData.currency = price.currency;
    }
    
    const updatedPlan = await db.pricingPlan.update({
      where: { planType },
      data: updateData
    });
    
    console.log(`✅ Price added to pricing plan: ${updatedPlan.planType} (${isMonthly ? 'monthly' : 'yearly'}: $${(price.unit_amount || 0) / 100})`);
    
    // Invalidate pricing cache
    await cacheManager.invalidate('pricing:plans');
    console.log('🗑️ Pricing plans cache invalidated');
    
  } catch (error) {
    console.error(`❌ Failed to handle price creation for ${price.id}:`, error);
    throw error;
  }
}

async function handlePriceUpdated(price: Stripe.Price) {
  console.log('🔄 Processing price updated:', price.id);
  
  // Get the associated product to find the plan type
  if (!price.product || typeof price.product !== 'string') {
    console.log(`⚠️ Skipping price ${price.id} - no product association`);
    return;
  }
  
  try {
    // Retrieve the product to get metadata
    const product = await stripe.products.retrieve(price.product);
    
    // Only process prices for products that have planType metadata
    if (!product.metadata?.planType) {
      console.log(`⚠️ Skipping price ${price.id} - product has no planType metadata`);
      return;
    }
    
    const planType = product.metadata.planType;
    console.log(`Updating price for pricing plan: ${planType}`);
    
    // Find existing pricing plan
    const existingPlan = await db.pricingPlan.findUnique({
      where: { planType }
    });
    
    if (!existingPlan) {
      console.log(`⚠️ Pricing plan not found for ${planType}, treating as price creation...`);
      return await handlePriceCreated(price);
    }
    
    // Determine if this price should update monthly or yearly pricing
    const isMonthly = price.recurring?.interval === 'month';
    const isYearly = price.recurring?.interval === 'year';
    
    if (!isMonthly && !isYearly) {
      console.log(`⚠️ Skipping price ${price.id} - not monthly or yearly recurring`);
      return;
    }
    
    // Check if this price ID matches existing price IDs in the plan
    const priceIdMatches = (isMonthly && existingPlan.stripeMonthlyPriceId === price.id) ||
                          (isYearly && existingPlan.stripeYearlyPriceId === price.id);
    
    if (!priceIdMatches) {
      console.log(`⚠️ Price ${price.id} doesn't match existing price IDs for ${planType}, treating as new price...`);
      return await handlePriceCreated(price);
    }
    
    // Update pricing plan with updated price information
    const updateData: any = {};
    
    if (isMonthly && existingPlan.stripeMonthlyPriceId === price.id) {
      updateData.monthlyPrice = price.unit_amount || 0;
    } else if (isYearly && existingPlan.stripeYearlyPriceId === price.id) {
      updateData.yearlyPrice = price.unit_amount || 0;
    }
    
    if (price.currency) {
      updateData.currency = price.currency;
    }
    
    const updatedPlan = await db.pricingPlan.update({
      where: { planType },
      data: updateData
    });
    
    console.log(`✅ Price updated for pricing plan: ${updatedPlan.planType} (${isMonthly ? 'monthly' : 'yearly'}: $${(price.unit_amount || 0) / 100})`);
    
    // Invalidate pricing cache
    await cacheManager.invalidate('pricing:plans');
    console.log('🗑️ Pricing plans cache invalidated');
    
  } catch (error) {
    console.error(`❌ Failed to handle price update for ${price.id}:`, error);
    throw error;
  }
}

async function handlePriceDeleted(price: Stripe.Price) {
  console.log('🗑️ Processing price deleted:', price.id);
  
  try {
    // Find pricing plans that reference this price ID
    const plansWithThisPrice = await db.pricingPlan.findMany({
      where: {
        OR: [
          { stripeMonthlyPriceId: price.id },
          { stripeYearlyPriceId: price.id }
        ]
      }
    });
    
    if (plansWithThisPrice.length === 0) {
      console.log(`⚠️ No pricing plans found referencing price ${price.id}`);
      return;
    }
    
    // Remove price ID references from pricing plans
    for (const plan of plansWithThisPrice) {
      const updateData: any = {};
      
      if (plan.stripeMonthlyPriceId === price.id) {
        updateData.stripeMonthlyPriceId = null;
        console.log(`Removing monthly price reference from ${plan.planType}`);
      }
      
      if (plan.stripeYearlyPriceId === price.id) {
        updateData.stripeYearlyPriceId = null;
        console.log(`Removing yearly price reference from ${plan.planType}`);
      }
      
      // Update metadata to track the deletion
      const existingMetadata = (plan.metadata as any) || {};
      updateData.metadata = {
        ...existingMetadata,
        deletedPrices: [
          ...(existingMetadata.deletedPrices || []),
          {
            priceId: price.id,
            deletedAt: new Date().toISOString(),
            interval: price.recurring?.interval || 'unknown'
          }
        ]
      };
      
      await db.pricingPlan.update({
        where: { id: plan.id },
        data: updateData
      });
      
      console.log(`✅ Price references removed from pricing plan: ${plan.planType}`);
    }
    
    // Invalidate pricing cache
    await cacheManager.invalidate('pricing:plans');
    console.log('🗑️ Pricing plans cache invalidated');
    
  } catch (error) {
    console.error(`❌ Failed to handle price deletion for ${price.id}:`, error);
    throw error;
  }
}