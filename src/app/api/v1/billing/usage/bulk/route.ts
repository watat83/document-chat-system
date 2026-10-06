import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createErrorResponse, handleApiError } from '@/lib/api-errors';
import { z } from 'zod';
import { UsageType } from '@prisma/client';

const bulkUsageSchema = z.object({
  usageRecords: z.array(z.object({
    usageType: z.nativeEnum(UsageType),
    quantity: z.number().int().positive().default(1),
    resourceId: z.string().optional(),
    resourceType: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  })).min(1).max(100), // Limit to 100 records per request
});

/**
 * @swagger
 * /api/billing/usage/bulk:
 *   post:
 *     summary: Record multiple usage events
 *     description: Records multiple usage events in a single request (max 100)
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
 *               - usageRecords
 *             properties:
 *               usageRecords:
 *                 type: array
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required:
 *                     - usageType
 *                   properties:
 *                     usageType:
 *                       type: string
 *                       enum: [OPPORTUNITY_MATCH, AI_QUERY, DOCUMENT_PROCESSING, API_CALL, EXPORT, USER_SEAT, MATCH_SCORE_CALCULATION, SAVED_FILTER]
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                     resourceId:
 *                       type: string
 *                     resourceType:
 *                       type: string
 *                     metadata:
 *                       type: object
 *     responses:
 *       201:
 *         description: Usage events recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordsCreated:
 *                   type: integer
 *                   description: Number of usage records created
 *                 totalQuantity:
 *                   type: integer
 *                   description: Total quantity across all records
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Usage limit exceeded
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const user = await currentUser();
    if (!user) {
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    const body = await request.json();
    const validatedData = bulkUsageSchema.parse(body);

    // Get user's organization
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true }
    });

    if (!dbUser?.organizationId) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    // Get current subscription
    const subscription = await db.subscription.findFirst({
      where: {
        organizationId: dbUser.organizationId,
        status: {
          in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Aggregate usage by type
    const usageByType = validatedData.usageRecords.reduce((acc, record) => {
      acc[record.usageType] = (acc[record.usageType] || 0) + record.quantity;
      return acc;
    }, {} as Record<string, number>);

    // Check limits for each type
    if (subscription) {
      const limits = subscription.limits as any;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const [usageType, quantity] of Object.entries(usageByType)) {
        // Get current usage for this type
        const currentUsage = await db.usageRecord.aggregate({
          where: {
            organizationId: dbUser.organizationId,
            usageType: z.nativeEnum(UsageType).parse(usageType),
            createdAt: {
              gte: monthStart
            }
          },
          _sum: {
            quantity: true
          }
        });

        const currentTotal = (currentUsage._sum?.quantity ?? 0) + quantity;

        // Check specific limits
        let limitExceeded = false;
        if (usageType === 'OPPORTUNITY_MATCH' && limits.matchesPerMonth > 0) {
          limitExceeded = currentTotal > limits.matchesPerMonth;
        } else if (usageType === 'AI_QUERY' && limits.aiQueriesPerMonth > 0) {
          limitExceeded = currentTotal > limits.aiQueriesPerMonth;
        } else if (usageType === 'DOCUMENT_PROCESSING' && limits.documentsPerMonth > 0) {
          limitExceeded = currentTotal > limits.documentsPerMonth;
        }

        if (limitExceeded) {
          return createErrorResponse(
            `Usage limit exceeded for ${usageType}. Current: ${currentUsage._sum.quantity}, Requested: ${quantity}, Limit: ${limits[usageType.toLowerCase() + 'PerMonth'] || 'N/A'}`,
            403,
            'USAGE_LIMIT_EXCEEDED'
          );
        }
      }
    }

    // Create all usage records
    const now = new Date();
    const usageRecordsData = validatedData.usageRecords.map(record => ({
      organizationId: dbUser.organizationId,
      subscriptionId: subscription?.id,
      usageType: record.usageType,
      quantity: record.quantity,
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      resourceId: record.resourceId,
      resourceType: record.resourceType,
      metadata: record.metadata,
    }));

    // Use createMany for efficiency
    const result = await db.usageRecord.createMany({
      data: usageRecordsData,
    });

    const totalQuantity = validatedData.usageRecords.reduce((sum, record) => sum + record.quantity, 0);

    return NextResponse.json(
      {
        recordsCreated: result.count,
        totalQuantity,
        usageByType,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error recording bulk usage:', error);
    return handleApiError(error);
  }
}
