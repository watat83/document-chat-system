import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { AuditQueryService } from '@/lib/audit/query-service';
import { AuditSeverity } from '@prisma/client';

const summaryParamsSchema = z.object({
  type: z.enum(['user', 'security', 'system']).default('system'),
  startDate: z.string().transform(val => new Date(val)),
  endDate: z.string().transform(val => new Date(val)),
});

/**
 * @swagger
 * /api/v1/audit-logs/summary:
 *   get:
 *     summary: Get audit log summary and analytics
 *     description: Retrieve summary statistics and analytics for audit logs
 *     tags:
 *       - Audit Logs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, security, system]
 *         description: Type of summary to generate
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for summary period
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for summary period
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: User ID for user-specific summary
 *     responses:
 *       200:
 *         description: Summary generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/UserActivitySummary'
 *                 - $ref: '#/components/schemas/SecurityEventsSummary'
 *                 - $ref: '#/components/schemas/SystemHealthSummary'
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: currentUserId } = await auth();
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams);

    const validatedParams = summaryParamsSchema.parse(params);

    const queryService = new AuditQueryService();
    let result;

    switch (validatedParams.type) {
      case 'user':
        // Always use current authenticated user
        result = await queryService.getUserActivitySummary(
          currentUserId,
          validatedParams.startDate,
          validatedParams.endDate
        );
        break;

      case 'security':
        result = await queryService.getSecurityEvents(
          validatedParams.startDate,
          validatedParams.endDate,
          [AuditSeverity.WARN, AuditSeverity.ERROR, AuditSeverity.CRITICAL],
          currentUserId
        );
        break;

      case 'system':
        result = await queryService.getSystemHealth(
          validatedParams.startDate,
          validatedParams.endDate,
          currentUserId
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid summary type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      type: validatedParams.type,
      period: {
        startDate: validatedParams.startDate,
        endDate: validatedParams.endDate,
      },
      data: result,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to generate audit log summary:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
