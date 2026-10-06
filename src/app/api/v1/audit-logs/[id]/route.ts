import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { AuditQueryService } from '@/lib/audit/query-service';

/**
 * @swagger
 * /api/v1/audit-logs/{id}:
 *   get:
 *     summary: Get a specific audit log by ID
 *     description: Retrieve detailed information about a specific audit log entry
 *     tags:
 *       - Audit Logs
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Audit log ID
 *     responses:
 *       200:
 *         description: Audit log retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuditLog'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Audit log not found
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const queryService = new AuditQueryService();
    const log = await queryService.getLogById(params.id);

    if (!log) {
      return NextResponse.json(
        { error: 'Audit log not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(log);
  } catch (error) {
    console.error('Failed to retrieve audit log:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}