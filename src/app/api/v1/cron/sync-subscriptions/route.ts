import { NextRequest, NextResponse } from 'next/server';
import { SubscriptionManager } from '@/lib/subscription-manager';
import { db } from '@/lib/db';
import { auth } from '@/lib/config/env';

/**
 * @swagger
 * /api/cron/sync-subscriptions:
 *   get:
 *     summary: Sync all subscriptions from Stripe
 *     description: Periodic sync job to keep database subscriptions in sync with Stripe
 *     tags: [Cron Jobs]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Sync completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 syncedCount:
 *                   type: number
 *                 processedOrganizations:
 *                   type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 duration:
 *                   type: number
 *                   description: Sync duration in milliseconds
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  console.log('🔄 Starting periodic subscription sync...');

  try {
    // Authentication check
    const apiKey = request.headers.get('x-api-key');
    const authHeader = request.headers.get('authorization');

    // Check for API key in header or query parameter
    const validApiKey = auth.internalApiKey;
    const providedKey = apiKey ||
                       authHeader?.replace('Bearer ', '') ||
                       request.nextUrl.searchParams.get('key');

    if (!validApiKey) {
      console.error('❌ INTERNAL_API_KEY not configured');
      return NextResponse.json({
        error: 'Internal API key not configured'
      }, { status: 500 });
    }

    if (!providedKey || providedKey !== validApiKey) {
      console.warn('⚠️ Unauthorized sync attempt from:', request.headers.get('x-forwarded-for')?.split(',')[0]);
      return NextResponse.json({
        error: 'Unauthorized - Invalid API key'
      }, { status: 401 });
    }

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ Stripe not configured');
      return NextResponse.json({
        error: 'Stripe not configured'
      }, { status: 500 });
    }

    console.log('✅ Authentication successful, starting sync...');

    // Get organizations that have Stripe customers
    const organizations = await db.organization.findMany({
      where: {
        stripeCustomerId: { not: null },
        // Only sync organizations that have been active recently (optional optimization)
        updatedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
        planType: true,
        subscriptionStatus: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    console.log(`📋 Found ${organizations.length} organizations with Stripe customers`);

    if (organizations.length === 0) {
      return NextResponse.json({
        success: true,
        syncedCount: 0,
        processedOrganizations: 0,
        message: 'No organizations with Stripe customers found',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }

    let totalSyncedCount = 0;
    let processedCount = 0;
    const errors: string[] = [];

    // Process each organization
    for (const org of organizations) {
      try {
        console.log(`🔄 Syncing ${org.name} (${org.id})...`);

        const result = await SubscriptionManager.syncAllSubscriptionsFromStripe(org.id);

        if (result.syncedCount > 0) {
          totalSyncedCount += result.syncedCount;
          console.log(`✅ Synced ${result.syncedCount} subscriptions for ${org.name}`);
        } else {
          console.log(`ℹ️ No changes needed for ${org.name}`);
        }

        if (result.errors.length > 0) {
          console.warn(`⚠️ Sync errors for ${org.name}:`, result.errors);
          errors.push(`${org.name}: ${result.errors.join(', ')}`);
        }

        processedCount++;

      } catch (error) {
        const errorMsg = `Failed to sync ${org.name} (${org.id}): ${error}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Periodic sync completed: ${totalSyncedCount} subscriptions synced across ${processedCount} organizations in ${duration}ms`);

    if (errors.length > 0) {
      console.warn(`⚠️ Sync completed with ${errors.length} errors:`, errors);
    }

    // Return comprehensive results
    return NextResponse.json({
      success: true,
      syncedCount: totalSyncedCount,
      processedOrganizations: processedCount,
      totalOrganizations: organizations.length,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
      duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('❌ Periodic sync failed:', error);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      duration
    }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/cron/sync-subscriptions:
 *   post:
 *     summary: Trigger manual subscription sync
 *     description: Manually trigger a subscription sync for all organizations or a specific one
 *     tags: [Cron Jobs]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organizationId:
 *                 type: string
 *                 description: Specific organization to sync (optional)
 *               force:
 *                 type: boolean
 *                 description: Force sync even if recently synced
 *     responses:
 *       200:
 *         description: Manual sync completed successfully
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  console.log('🔄 Starting manual subscription sync...');

  try {
    // Authentication check (same as GET)
    const apiKey = request.headers.get('x-api-key');
    const authHeader = request.headers.get('authorization');

    const validApiKey = auth.internalApiKey;
    const providedKey = apiKey ||
                       authHeader?.replace('Bearer ', '') ||
                       request.nextUrl.searchParams.get('key');

    if (!validApiKey || !providedKey || providedKey !== validApiKey) {
      return NextResponse.json({
        error: 'Unauthorized - Invalid API key'
      }, { status: 401 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { organizationId, force = false } = body;

    if (organizationId) {
      // Sync specific organization
      console.log(`🎯 Manual sync for specific organization: ${organizationId}`);

      const result = await SubscriptionManager.syncAllSubscriptionsFromStripe(organizationId);

      return NextResponse.json({
        success: true,
        syncedCount: result.syncedCount,
        processedOrganizations: 1,
        organizationId,
        errors: result.errors.length > 0 ? result.errors : undefined,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });

    } else {
      // Sync all organizations (force mode if requested)
      const whereClause: any = { stripeCustomerId: { not: null } };

      if (!force) {
        // Only sync recently active organizations unless forced
        whereClause.updatedAt = {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours for manual sync
        };
      }

      const organizations = await db.organization.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          stripeCustomerId: true
        }
      });

      console.log(`📋 Manual sync for ${organizations.length} organizations (force: ${force})`);

      let totalSyncedCount = 0;
      const errors: string[] = [];

      for (const org of organizations) {
        try {
          const result = await SubscriptionManager.syncAllSubscriptionsFromStripe(org.id);
          totalSyncedCount += result.syncedCount;

          if (result.errors.length > 0) {
            errors.push(`${org.name}: ${result.errors.join(', ')}`);
          }
        } catch (error) {
          errors.push(`${org.name}: ${error}`);
        }
      }

      return NextResponse.json({
        success: true,
        syncedCount: totalSyncedCount,
        processedOrganizations: organizations.length,
        force,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('❌ Manual sync failed:', error);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    }, { status: 500 });
  }
}
