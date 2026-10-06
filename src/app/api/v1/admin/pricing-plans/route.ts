import { isPlatformAdmin } from '@/lib/security/platform-admin'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { stripe } from '@/lib/stripe-server'
import { cacheManager } from '@/lib/cache'

// Validation schemas
const createPricingPlanSchema = z.object({
  planType: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  monthlyPrice: z.number().int().min(0), // Price in cents
  yearlyPrice: z.number().int().min(0).optional(),
  currency: z.string().default('usd'),
  features: z.object({
    list: z.array(z.string()),
    detailed: z.record(z.any()).optional()
  }),
  limits: z.object({
    seats: z.number().int().min(-1), // -1 for unlimited
    savedSearches: z.number().int().min(-1),
    aiCreditsPerMonth: z.number().int().min(-1),
    matchScoreCalculations: z.number().int().min(-1),
    apiCallsPerMonth: z.number().int().min(-1).optional(),
    exportLimit: z.number().int().min(-1).optional(),
    customFields: z.record(z.number()).optional()
  }),
  isActive: z.boolean().default(true),
  isPopular: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
  metadata: z.record(z.any()).optional(),
  // Stripe integration options
  createStripeProducts: z.boolean().default(false),
  stripeProductName: z.string().optional(),
  stripeProductMetadata: z.record(z.string()).optional()
})

const updatePricingPlanSchema = createPricingPlanSchema.partial().extend({
  id: z.string(),
  stripeMonthlyPriceId: z.string().optional(),
  stripeYearlyPriceId: z.string().optional()
})

// GET: List all pricing plans
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(isPlatformAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams
    const activeOnly = searchParams.get('activeOnly') === 'true'
    const includeStripeData = searchParams.get('includeStripeData') === 'true'

    // Use proper error handling for database operations
    let plans;
    try {
      // Try primary database connection first
      plans = await (db || prisma).pricingPlan.findMany({
        where: activeOnly ? { isActive: true } : undefined,
        orderBy: { displayOrder: 'asc' }
      })
    } catch (dbError) {
      console.error('Database query failed:', dbError)
      throw new Error('Failed to fetch pricing plans from database')
    }

    // Optionally fetch current Stripe prices
    let enrichedPlans = plans
    if (includeStripeData && plans.length > 0) {
      const stripePriceIds = [
        ...plans.map(p => p.stripeMonthlyPriceId).filter(Boolean),
        ...plans.map(p => p.stripeYearlyPriceId).filter(Boolean)
      ] as string[]

      if (stripePriceIds.length > 0) {
        try {
          const stripePrices = await stripe.prices.list({
            limit: 100,
            active: true
          })

          const priceMap = new Map(
            stripePrices.data.map(price => [price.id, price])
          )

          enrichedPlans = plans.map(plan => {
            const monthlyStripePrice = plan.stripeMonthlyPriceId ? priceMap.get(plan.stripeMonthlyPriceId) : null
            const yearlyStripePrice = plan.stripeYearlyPriceId ? priceMap.get(plan.stripeYearlyPriceId) : null

            return {
              ...plan,
              stripeData: {
                monthlyPrice: monthlyStripePrice ? {
                  amount: (monthlyStripePrice as any).unit_amount,
                  currency: (monthlyStripePrice as any).currency,
                  active: (monthlyStripePrice as any).active
                } : null,
                yearlyPrice: yearlyStripePrice ? {
                  amount: (yearlyStripePrice as any).unit_amount,
                  currency: (yearlyStripePrice as any).currency,
                  active: (yearlyStripePrice as any).active
                } : null
              }
            }
          })
        } catch (stripeError) {
          console.warn('Stripe price fetching failed (non-critical):', stripeError.message)
          // Continue without Stripe data enrichment
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: enrichedPlans,
      count: enrichedPlans.length
    })

  } catch (error) {
    console.error('Error fetching pricing plans:', error)
    return NextResponse.json({
      error: 'Failed to fetch pricing plans',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST: Create a new pricing plan
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(isPlatformAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = createPricingPlanSchema.parse(body)

    // Check if plan type already exists
    const existingPlan = await db.pricingPlan.findUnique({
      where: { planType: validatedData.planType }
    })

    if (existingPlan) {
      return NextResponse.json({
        error: 'Plan type already exists',
        details: `A plan with type "${validatedData.planType}" already exists`
      }, { status: 400 })
    }

    // Create Stripe products and prices if requested
    let stripeMonthlyPriceId: string | null = null
    let stripeYearlyPriceId: string | null = null

    if (validatedData.createStripeProducts && validatedData.monthlyPrice > 0) {
      try {
        // Create Stripe product
        const stripeProduct = await stripe.products.create({
          name: validatedData.stripeProductName || validatedData.displayName,
          description: validatedData.description,
          metadata: {
            planType: validatedData.planType,
            ...validatedData.stripeProductMetadata
          }
        })

        // Create monthly price
        const monthlyPrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: validatedData.monthlyPrice,
          currency: validatedData.currency,
          recurring: {
            interval: 'month',
            interval_count: 1
          },
          metadata: {
            planType: validatedData.planType,
            billingInterval: 'monthly'
          }
        })
        stripeMonthlyPriceId = monthlyPrice.id

        // Create yearly price if provided
        if (validatedData.yearlyPrice) {
          const yearlyPrice = await stripe.prices.create({
            product: stripeProduct.id,
            unit_amount: validatedData.yearlyPrice,
            currency: validatedData.currency,
            recurring: {
              interval: 'year',
              interval_count: 1
            },
            metadata: {
              planType: validatedData.planType,
              billingInterval: 'yearly'
            }
          })
          stripeYearlyPriceId = yearlyPrice.id
        }

        console.log(`Created Stripe product ${stripeProduct.id} with prices:`, {
          monthly: stripeMonthlyPriceId,
          yearly: stripeYearlyPriceId
        })
      } catch (stripeError) {
        console.error('Error creating Stripe products:', stripeError)
        return NextResponse.json({
          error: 'Failed to create Stripe products',
          details: stripeError instanceof Error ? stripeError.message : 'Unknown error'
        }, { status: 500 })
      }
    }

    // Create the pricing plan in database
    const newPlan = await db.pricingPlan.create({
      data: {
        planType: validatedData.planType,
        displayName: validatedData.displayName,
        description: validatedData.description,
        monthlyPrice: validatedData.monthlyPrice,
        yearlyPrice: validatedData.yearlyPrice,
        currency: validatedData.currency,
        features: validatedData.features,
        limits: validatedData.limits,
        isActive: validatedData.isActive,
        isPopular: validatedData.isPopular,
        displayOrder: validatedData.displayOrder,
        metadata: validatedData.metadata,
        stripeMonthlyPriceId,
        stripeYearlyPriceId
      }
    })

    // Invalidate pricing cache (with error handling)
    try {
      await cacheManager.invalidate('pricing:plans')
    } catch (cacheError) {
      console.warn('Cache invalidation failed (non-critical):', cacheError.message)
    }

    return NextResponse.json({
      success: true,
      data: newPlan,
      message: 'Pricing plan created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating pricing plan:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation error',
        details: error.errors
      }, { status: 400 })
    }

    return NextResponse.json({
      error: 'Failed to create pricing plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// PUT: Update an existing pricing plan
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(isPlatformAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validatedData = updatePricingPlanSchema.parse(body)

    // Check if plan exists
    const existingPlan = await db.pricingPlan.findUnique({
      where: { id: validatedData.id }
    })

    if (!existingPlan) {
      return NextResponse.json({
        error: 'Plan not found',
        details: `No plan found with ID: ${validatedData.id}`
      }, { status: 404 })
    }

    // If changing plan type, check if new type already exists
    if (validatedData.planType && validatedData.planType !== existingPlan.planType) {
      const conflictingPlan = await db.pricingPlan.findUnique({
        where: { planType: validatedData.planType }
      })

      if (conflictingPlan) {
        return NextResponse.json({
          error: 'Plan type already exists',
          details: `A plan with type "${validatedData.planType}" already exists`
        }, { status: 400 })
      }
    }

    // Update Stripe prices if price changed
    if (validatedData.monthlyPrice && validatedData.monthlyPrice !== existingPlan.monthlyPrice) {
      if (existingPlan.stripeMonthlyPriceId) {
        try {
          // Stripe doesn't allow updating price amounts, so we need to create a new price
          // and archive the old one
          const stripePrice = await stripe.prices.retrieve(existingPlan.stripeMonthlyPriceId)
          
          if (stripePrice.product) {
            const newMonthlyPrice = await stripe.prices.create({
              product: stripePrice.product as string,
              unit_amount: validatedData.monthlyPrice,
              currency: validatedData.currency || existingPlan.currency,
              recurring: {
                interval: 'month',
                interval_count: 1
              },
              metadata: {
                planType: validatedData.planType || existingPlan.planType,
                billingInterval: 'monthly'
              }
            })

            // Archive old price
            await stripe.prices.update(existingPlan.stripeMonthlyPriceId, {
              active: false
            })

            validatedData.stripeMonthlyPriceId = newMonthlyPrice.id
            console.log(`Updated Stripe monthly price from ${existingPlan.stripeMonthlyPriceId} to ${newMonthlyPrice.id}`)
          }
        } catch (stripeError) {
          console.error('Error updating Stripe monthly price:', stripeError)
        }
      }
    }

    // Similar logic for yearly price
    if (validatedData.yearlyPrice && validatedData.yearlyPrice !== existingPlan.yearlyPrice) {
      if (existingPlan.stripeYearlyPriceId) {
        try {
          const stripePrice = await stripe.prices.retrieve(existingPlan.stripeYearlyPriceId)
          
          if (stripePrice.product) {
            const newYearlyPrice = await stripe.prices.create({
              product: stripePrice.product as string,
              unit_amount: validatedData.yearlyPrice,
              currency: validatedData.currency || existingPlan.currency,
              recurring: {
                interval: 'year',
                interval_count: 1
              },
              metadata: {
                planType: validatedData.planType || existingPlan.planType,
                billingInterval: 'yearly'
              }
            })

            // Archive old price
            await stripe.prices.update(existingPlan.stripeYearlyPriceId, {
              active: false
            })

            validatedData.stripeYearlyPriceId = newYearlyPrice.id
            console.log(`Updated Stripe yearly price from ${existingPlan.stripeYearlyPriceId} to ${newYearlyPrice.id}`)
          }
        } catch (stripeError) {
          console.error('Error updating Stripe yearly price:', stripeError)
        }
      }
    }

    // Update the pricing plan
    const { id, ...updateData } = validatedData
    const updatedPlan = await db.pricingPlan.update({
      where: { id },
      data: updateData
    })

    // Invalidate pricing cache (with error handling)
    try {
      await cacheManager.invalidate('pricing:plans')
    } catch (cacheError) {
      console.warn('Cache invalidation failed (non-critical):', cacheError.message)
    }

    return NextResponse.json({
      success: true,
      data: updatedPlan,
      message: 'Pricing plan updated successfully'
    })

  } catch (error) {
    console.error('Error updating pricing plan:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: 'Validation error',
        details: error.errors
      }, { status: 400 })
    }

    return NextResponse.json({
      error: 'Failed to update pricing plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// DELETE: Delete a pricing plan
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!(isPlatformAdmin(userId))) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Get plan ID from query parameters
    const searchParams = request.nextUrl.searchParams
    const planId = searchParams.get('id')

    if (!planId) {
      return NextResponse.json({
        error: 'Missing plan ID',
        details: 'Please provide a plan ID in the query parameters'
      }, { status: 400 })
    }

    // Check if plan exists
    const existingPlan = await db.pricingPlan.findUnique({
      where: { id: planId }
    })

    if (!existingPlan) {
      return NextResponse.json({
        error: 'Plan not found',
        details: `No plan found with ID: ${planId}`
      }, { status: 404 })
    }

    // Check if any active subscriptions are using this plan
    const activeSubscriptions = await db.subscription.count({
      where: {
        planType: existingPlan.planType,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
        }
      }
    })

    if (activeSubscriptions > 0) {
      return NextResponse.json({
        error: 'Cannot delete plan with active subscriptions',
        details: `There are ${activeSubscriptions} active subscriptions using this plan`,
        activeSubscriptions
      }, { status: 400 })
    }

    // Archive Stripe prices if they exist
    if (existingPlan.stripeMonthlyPriceId) {
      try {
        await stripe.prices.update(existingPlan.stripeMonthlyPriceId, {
          active: false
        })
        console.log(`Archived Stripe monthly price: ${existingPlan.stripeMonthlyPriceId}`)
      } catch (stripeError) {
        console.error('Error archiving Stripe monthly price:', stripeError)
      }
    }

    if (existingPlan.stripeYearlyPriceId) {
      try {
        await stripe.prices.update(existingPlan.stripeYearlyPriceId, {
          active: false
        })
        console.log(`Archived Stripe yearly price: ${existingPlan.stripeYearlyPriceId}`)
      } catch (stripeError) {
        console.error('Error archiving Stripe yearly price:', stripeError)
      }
    }

    // Delete the pricing plan
    await db.pricingPlan.delete({
      where: { id: planId }
    })

    // Invalidate pricing cache (with error handling)
    try {
      await cacheManager.invalidate('pricing:plans')
    } catch (cacheError) {
      console.warn('Cache invalidation failed (non-critical):', cacheError.message)
    }

    return NextResponse.json({
      success: true,
      message: 'Pricing plan deleted successfully',
      deletedPlan: {
        id: existingPlan.id,
        planType: existingPlan.planType,
        displayName: existingPlan.displayName
      }
    })

  } catch (error) {
    console.error('Error deleting pricing plan:', error)
    
    return NextResponse.json({
      error: 'Failed to delete pricing plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}