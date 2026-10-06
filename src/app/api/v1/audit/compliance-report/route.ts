import { AuditCategory, AuditEventType, AuditSeverity } from '@prisma/client';
/**
 * @swagger
 * /api/v1/audit/compliance-report:
 *   get:
 *     summary: Generate SOC 2 compliance report
 *     description: Generate comprehensive compliance report for audit trails and security monitoring
 *     tags: [Audit & Compliance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Optional organization ID for organization-specific reports
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for report period (defaults to 30 days ago)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for report period (defaults to today)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [JSON, CSV, PDF]
 *           default: JSON
 *         description: Report export format
 *     responses:
 *       200:
 *         description: Compliance report generated successfully
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
 *                     reportId:
 *                       type: string
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *                     complianceScore:
 *                       type: number
 *                       minimum: 0
 *                       maximum: 100
 *                     metrics:
 *                       type: object
 *                     soc2Requirements:
 *                       type: object
 *                     findings:
 *                       type: array
 *                     recommendations:
 *                       type: array
 *           text/csv:
 *             schema:
 *               type: string
 *           text/plain:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized - authentication required
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { ComplianceReportGenerator } from '@/lib/audit/compliance-report';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';

export async function GET(request: NextRequest) {
  let userId: string | null = null;
  try {
    // Check authentication
    ({ userId } = await auth());
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user and check permissions
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: {
        id: true,
        role: true,
        organizationId: true,
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

    // Only ADMIN and OWNER can generate compliance reports
    if (!['ADMIN', 'OWNER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to generate compliance reports' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const organizationIdParam = url.searchParams.get('organizationId');
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const formatParam = url.searchParams.get('format') || 'JSON';

    // Validate organization access
    const targetOrganizationId = organizationIdParam || user.organizationId;
    if (organizationIdParam && organizationIdParam !== user.organizationId && user.role !== 'OWNER') {
      return NextResponse.json(
        { success: false, error: 'Cannot access reports for other organizations' },
        { status: 403 }
      );
    }

    // Parse dates
    const startDate = startDateParam ?
      new Date(startDateParam) :
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const endDate = endDateParam ?
      new Date(endDateParam) :
      new Date();

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD format.' },
        { status: 400 }
      );
    }

    if (startDate >= endDate) {
      return NextResponse.json(
        { success: false, error: 'Start date must be before end date' },
        { status: 400 }
      );
    }

    // Validate format
    if (!['JSON', 'CSV', 'PDF'].includes(formatParam.toUpperCase())) {
      return NextResponse.json(
        { success: false, error: 'Invalid format. Supported formats: JSON, CSV, PDF' },
        { status: 400 }
      );
    }

    // Generate compliance report
    console.log(`Generating compliance report for organization ${targetOrganizationId}, period: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const report = await ComplianceReportGenerator.generateReport(
      targetOrganizationId,
      startDate,
      endDate
    );

    // Log compliance report generation for audit trail
    try {
      await crudAuditLogger.logCRUDOperation(
        {
          operation: 'CREATE',
          entityType: 'COMPLIANCE_REPORT',
          entityId: report.reportId,
          entityName: `Compliance Report ${report.reportId}`,
          previousData: null,
          currentData: {
            reportId: report.reportId,
            complianceScore: report.complianceScore,
            organizationId: targetOrganizationId,
            reportPeriod: report.reportPeriod,
            format: formatParam.toUpperCase(),
            soc2RequirementsCompliant: Object.values(report.soc2Requirements).filter(Boolean).length
          },
          ipAddress: request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          metadata: {
            endpoint: '/api/v1/audit/compliance-report',
            method: 'GET',
            organizationId: user.organizationId,
            targetOrganization: targetOrganizationId,
            reportFormat: formatParam.toUpperCase(),
            complianceScore: report.complianceScore
          }
        },
        AuditCategory.AUDIT_MANAGEMENT,
        AuditEventType.COMPLIANCE_REPORT_GENERATED,
        AuditSeverity.INFO
      );
    } catch (auditError) {
      console.error('Failed to create compliance report audit log:', auditError);
    }

    // Export report in requested format
    if (formatParam.toUpperCase() !== 'JSON') {
      const exportedReport = await ComplianceReportGenerator.exportReport(
        report,
        formatParam.toUpperCase() as 'CSV' | 'PDF'
      );

      const contentType = formatParam.toUpperCase() === 'CSV' ? 'text/csv' : 'text/plain';
      const filename = `compliance-report-${report.reportId}.${formatParam.toLowerCase()}`;

      return new NextResponse(exportedReport, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Error generating compliance report:', error);

    // Log error for audit trail
    try {
      if (userId) {
        await crudAuditLogger.logCRUDOperation(
          {
            operation: 'CREATE',
            entityType: 'COMPLIANCE_REPORT',
            entityId: 'failed-report',
            entityName: 'Failed Compliance Report',
            previousData: null,
            currentData: null,
            ipAddress: request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
            metadata: {
              endpoint: '/api/v1/audit/compliance-report',
              method: 'GET',
              error: (error as Error).message
            }
          },
          AuditCategory.AUDIT_MANAGEMENT,
          AuditEventType.API_REQUEST_FAILED,
          AuditSeverity.CRITICAL
        );
      }
    } catch (auditError) {
      console.error('Failed to create error audit log:', auditError);
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate compliance report',
        details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      },
      { status: 500 }
    );
  }
}
