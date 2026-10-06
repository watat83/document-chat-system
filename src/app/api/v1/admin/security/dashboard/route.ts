/**
 * @swagger
 * /api/v1/admin/security/dashboard:
 *   get:
 *     summary: Get security monitoring dashboard
 *     description: Retrieve comprehensive security metrics, alerts, and monitoring data for administrators
 *     tags: [Admin - Security]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Organization ID (admin only, optional for owners)
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 24h, 7d, 30d]
 *           default: 24h
 *         description: Time window for security data
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *         description: Filter by security event severity
 *     responses:
 *       200:
 *         description: Security dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     organizationId:
 *                       type: string
 *                     timeWindow:
 *                       type: string
 *                     events:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         bySeverity:
 *                           type: object
 *                         recent:
 *                           type: array
 *                     alerts:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         unacknowledged:
 *                           type: number
 *                         recent:
 *                           type: array
 *                     rules:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         enabled:
 *                           type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { SecurityMonitor } from '@/lib/audit/security-monitor';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';

const SecurityDashboardQuerySchema = z.object({
  organizationId: z.string().optional().describe("Organization ID to filter security data"),
  timeframe: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h').describe("Time window for security analysis"),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().describe("Filter by security event severity")
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
      where: { clerkId: userId },
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
    const queryData = SecurityDashboardQuerySchema.parse({
      organizationId: searchParams.get('organizationId'),
      timeframe: searchParams.get('timeframe'),
      severity: searchParams.get('severity')
    });

    // Determine target organization
    const targetOrganizationId = queryData.organizationId || user.organizationId;

    // Security check: only allow access to own organization unless super admin
    if (targetOrganizationId !== user.organizationId && user.role !== 'OWNER') {
      return NextResponse.json(
        { success: false, error: 'Access denied to requested organization' },
        { status: 403 }
      );
    }

    // Get security dashboard data
    const dashboardData = await SecurityMonitor.getSecurityDashboard(targetOrganizationId);

    // Log admin access to security dashboard
    try {
      await crudAuditLogger.logSecurityViolation(
        'ADMIN_ACCESS',
        `Security Dashboard Access`,
        {
          organizationId: user.organizationId,

          targetOrganization: targetOrganizationId,
          timeframe: queryData.timeframe,
          severity: queryData.severity,
          accessedBy: user.id,
          endpoint: '/api/v1/admin/security/dashboard',
          method: 'GET'
        }
      );
    } catch (auditError) {
      console.error('Failed to log security dashboard access:', auditError);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...dashboardData,
        filters: {
          timeframe: queryData.timeframe,
          severity: queryData.severity,
          organizationId: targetOrganizationId
        },
        accessedBy: {
          userId: user.id,
          name: `${user.firstName} ${user.lastName}`.trim() || 'Unknown Admin',
          role: user.role
        }
      }
    });

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

    console.error('Error retrieving security dashboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve security dashboard' },
      { status: 500 }
    );
  }
}
