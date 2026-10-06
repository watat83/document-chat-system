import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { AuditQueryService } from '@/lib/audit/query-service';

/**
 * @swagger
 * /api/v1/audit-logs/correlation/{correlationId}:
 *   get:
 *     summary: Get related audit logs by correlation ID
 *     description: Retrieve all audit logs that share the same correlation ID, useful for tracing related events
 *     tags:
 *       - Audit Logs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: correlationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Correlation ID to search for
 *     responses:
 *       200:
 *         description: Related audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 correlationId:
 *                   type: string
 *                 logs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No logs found with this correlation ID
 *       500:
 *         description: Internal server error
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ correlationId: string }> }
) {
  const params = await props.params;
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const queryService = new AuditQueryService();
    const logs = await queryService.getLogsByCorrelationId(params.correlationId);

    if (logs.length === 0) {
      return NextResponse.json(
        { error: 'No logs found with this correlation ID' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      correlationId: params.correlationId,
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('Failed to retrieve correlated audit logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}