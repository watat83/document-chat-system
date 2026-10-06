/**
 * @swagger
 * /api/v1/admin/security/alerts:
 *   get:
 *     summary: Get security alerts
 *     description: Retrieve security alerts with filtering and pagination
 *     tags: [Admin - Security]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Organization ID (admin only)
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *         description: Filter by alert severity
 *       - in: query
 *         name: acknowledged
 *         schema:
 *           type: boolean
 *         description: Filter by acknowledgment status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *         description: Number of alerts to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Security alerts retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *   patch:
 *     summary: Acknowledge security alerts
 *     description: Mark security alerts as acknowledged by administrator
 *     tags: [Admin - Security]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alertIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of alert IDs to acknowledge
 *               notes:
 *                 type: string
 *                 description: Optional notes about the acknowledgment
 *     responses:
 *       200:
 *         description: Alerts acknowledged successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';

const SecurityAlertsQuerySchema = z.object({
  organizationId: z.string().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  acknowledged: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0)
});

const AcknowledgeAlertsSchema = z.object({
  alertIds: z.array(z.string()).min(1).max(50).describe("Array of alert IDs to acknowledge"),
  notes: z.string().optional().describe("Optional notes about the acknowledgment")
});

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user and verify admin access
    const user = await db.user.findUnique({
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
      select: {
        id: true,
        organizationId: true,
        role: true,
        firstName: true,
        lastName: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify admin or owner role
    if (!['ADMIN', 'OWNER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryData = SecurityAlertsQuerySchema.parse({
      organizationId: searchParams.get('organizationId') || undefined,
      severity: searchParams.get('severity') || undefined,
      acknowledged: searchParams.get('acknowledged') === 'true' ? true :
                   searchParams.get('acknowledged') === 'false' ? false : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    });

    // Determine target organization
    const targetOrganizationId = queryData.organizationId || user.organizationId;

    // Security check: only allow access to own organization unless super admin
    if (targetOrganizationId !== user.organizationId ) {
      return NextResponse.json(
        { success: false, error: 'Access denied to requested organization' },
        { status: 403 }
      );
    }

    // Build where clause
    const whereClause: any = {
      organizationId: targetOrganizationId
    };

    if (queryData.severity) {
      whereClause.severity = queryData.severity;
    }

    if (queryData.acknowledged !== undefined) {
      whereClause.acknowledged = queryData.acknowledged;
    }

    try {
      // Get security alerts
      const alerts = await db.securityIncident.findMany({
        where: whereClause,
        orderBy: { detectedAt: 'desc' },
        take: queryData.limit,
        skip: queryData.offset
      });

      // Get total count for pagination
      const total = await db.securityIncident.count({
        where: whereClause
      });

      return NextResponse.json({
        success: true,
        data: {
          alerts,
          pagination: {
            total,
            limit: queryData.limit,
            offset: queryData.offset,
            hasMore: queryData.offset + queryData.limit < total
          }
        }
      });

    } catch (dbError) {
      console.error('Security incident query failed:', dbError);
      return NextResponse.json({ success: false, error: 'Security alerts are unavailable' }, { status: 503 });

    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        },
        { status: 400 }
      );
    }

    console.error('Error retrieving security alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve security alerts' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user and verify admin access
    const user = await db.user.findUnique({
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
      select: {
        id: true,
        organizationId: true,
        role: true,
        firstName: true,
        lastName: true
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify admin or owner role
    if (!['ADMIN', 'OWNER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { alertIds, notes } = AcknowledgeAlertsSchema.parse(body);

    try {
      // Update alerts as acknowledged
      const updateResult = await db.securityIncident.updateMany({
        where: {
          id: { in: alertIds },
          organizationId: user.organizationId,
          acknowledged: false // Only update unacknowledged alerts
        },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy: user.id,
          acknowledgmentNotes: notes
        }
      });

      // Log the acknowledgment action
      try {
        await crudAuditLogger.logSecurityViolation(
          'ADMIN_ACCESS',
          `Security Alerts Acknowledged`,
          {
            organizationId: user.organizationId,
            severity: 'LOW' as const,
            alertIds,
            acknowledgedBy: user.id,
            acknowledgedCount: updateResult.count,
            notes,
            endpoint: '/api/v1/admin/security/alerts',
            method: 'PATCH'
          }
        );
      } catch (auditError) {
        console.error('Failed to log alert acknowledgment:', auditError);
      }

      return NextResponse.json({
        success: true,
        data: {
          acknowledgedCount: updateResult.count,
          acknowledgedBy: `${user.firstName} ${user.lastName}`.trim() || 'Unknown Admin',
          acknowledgedAt: new Date(),
          notes
        },
        message: `${updateResult.count} security alert(s) acknowledged successfully`
      });

    } catch (dbError) {
      // Handle case where securityAlert table doesn't exist
      console.warn('Security alerts table not available:', dbError);
      return NextResponse.json({
        success: false,
        error: 'Security alerts feature not yet configured'
      }, { status: 503 });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors
        },
        { status: 400 }
      );
    }

    console.error('Error acknowledging security alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to acknowledge security alerts' },
      { status: 500 }
    );
  }
}
