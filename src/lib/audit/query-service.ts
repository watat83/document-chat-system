import { prisma } from '@/lib/db';
import { TenantContext } from '@/lib/db/tenant-context';
import { getOrganizationId } from '@/lib/auth/get-organization-id';
import { Prisma, AuditEventType, AuditCategory, AuditSeverity } from '@prisma/client';

export interface AuditLogFilter {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditEventType[];
  categories?: AuditCategory[];
  severities?: AuditSeverity[];
  userId?: string;
  resourceId?: string;
  resourceType?: string;
  ipAddress?: string;
  searchTerm?: string;
  correlationId?: string;
}

export interface AuditLogPagination {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'severity' | 'eventType';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditLogResult {
  logs: any[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export class AuditQueryService {
  private organizationId: string | null = null;

  constructor(organizationId?: string) {
    this.organizationId = organizationId || null;
  }

  private async getOrganizationId(userId?: string): Promise<string> {
    if (this.organizationId) {
      return this.organizationId;
    }

    if (!userId) {
      throw new Error('Organization ID or user ID is required for audit queries');
    }

    const orgId = await getOrganizationId(userId);
    if (!orgId) {
      throw new Error('Unable to determine organization ID for user');
    }

    return orgId;
  }

  async queryLogs(
    filter: AuditLogFilter = {},
    pagination: AuditLogPagination = { page: 1, limit: 50 }
  ): Promise<AuditLogResult> {
    const organizationId = await this.getOrganizationId(filter.userId);

    // Convert Clerk user ID to internal user ID if needed
    let internalUserId: string | undefined;
    if (filter.userId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: filter.userId },
        select: { id: true }
      });
      if (!user) throw new Error("Audit user filter did not match a user");
      internalUserId = user.id;
    }

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(filter.startDate && { createdAt: { gte: filter.startDate } }),
      ...(filter.endDate && {
        createdAt: {
          ...(filter.startDate && { gte: filter.startDate }),
          lte: filter.endDate
        }
      }),
      ...(filter.eventTypes?.length && { eventType: { in: filter.eventTypes } }),
      ...(filter.categories?.length && { category: { in: filter.categories } }),
      ...(filter.severities?.length && { severity: { in: filter.severities } }),
      ...(internalUserId && { userId: internalUserId }),
      ...(filter.resourceId && { resourceId: filter.resourceId }),
      ...(filter.resourceType && { resource: filter.resourceType }),
      ...(filter.ipAddress && { ipAddress: filter.ipAddress }),
      ...(filter.correlationId && { requestId: filter.correlationId }),
      ...(filter.searchTerm && {
        OR: [
          { description: { contains: filter.searchTerm, mode: 'insensitive' } },
          { message: { contains: filter.searchTerm, mode: 'insensitive' } },
          { action: { contains: filter.searchTerm, mode: 'insensitive' } },
        ],
      }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: {
          [pagination.sortBy || 'createdAt']: pagination.sortOrder || 'desc',
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pagination.limit);

    return {
      logs,
      total,
      page: pagination.page,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrev: pagination.page > 1,
    };
  }

  async getLogById(id: string, userId?: string): Promise<any | null> {
    const organizationId = await this.getOrganizationId(userId);

    return prisma.auditLog.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  async getLogsByCorrelationId(correlationId: string, userId?: string): Promise<any[]> {
    const organizationId = await this.getOrganizationId(userId);

    return prisma.auditLog.findMany({
      where: {
        requestId: correlationId,
        organizationId,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getUserActivitySummary(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalActions: number;
    actionsByCategory: Record<string, number>;
    actionsByType: Record<string, number>;
    recentActivity: any[];
  }> {
    const organizationId = await this.getOrganizationId(userId);

    // Convert Clerk user ID to internal user ID
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        userId: user.id,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const actionsByCategory = logs.reduce((acc, log) => {
      acc[log.category] = (acc[log.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const actionsByType = logs.reduce((acc, log) => {
      acc[log.eventType] = (acc[log.eventType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalActions: logs.length,
      actionsByCategory,
      actionsByType,
      recentActivity: logs.slice(0, 20),
    };
  }

  async getSecurityEvents(
    startDate: Date,
    endDate: Date,
    severities: AuditSeverity[] = [AuditSeverity.WARN, AuditSeverity.ERROR, AuditSeverity.CRITICAL],
    userId?: string
  ): Promise<any[]> {
    const organizationId = await this.getOrganizationId(userId);

    return prisma.auditLog.findMany({
      where: {
        organizationId,
        category: AuditCategory.SECURITY,
        severity: { in: severities },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSystemHealth(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<{
    totalEvents: number;
    errorCount: number;
    warningCount: number;
    errorRate: number;
    topErrors: Array<{ eventType: string; count: number }>;
  }> {
    const organizationId = await this.getOrganizationId(userId);

    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const errorCount = logs.filter(log => log.severity === AuditSeverity.ERROR).length;
    const warningCount = logs.filter(log => log.severity === AuditSeverity.WARN).length;
    const totalEvents = logs.length;
    const errorRate = totalEvents > 0 ? (errorCount / totalEvents) * 100 : 0;

    const errorTypeCounts = logs
      .filter(log => log.severity === AuditSeverity.ERROR)
      .reduce((acc, log) => {
        acc[log.eventType] = (acc[log.eventType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const topErrors = Object.entries(errorTypeCounts)
      .map(([eventType, count]) => ({ eventType, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents,
      errorCount,
      warningCount,
      errorRate,
      topErrors,
    };
  }

  async exportLogs(
    filter: AuditLogFilter,
    format: 'json' | 'csv' = 'json'
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    const organizationId = await this.getOrganizationId(filter.userId);

    // Get all logs matching filter (no pagination for export)
    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(filter.startDate && { createdAt: { gte: filter.startDate } }),
        ...(filter.endDate && {
          createdAt: {
            ...(filter.startDate && { gte: filter.startDate }),
            lte: filter.endDate
          }
        }),
        ...(filter.eventTypes?.length && { eventType: { in: filter.eventTypes } }),
        ...(filter.categories?.length && { category: { in: filter.categories } }),
        ...(filter.severities?.length && { severity: { in: filter.severities } }),
      },
      orderBy: { createdAt: 'desc' },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'csv') {
      const headers = [
        'Timestamp', 'Event Type', 'Category', 'Severity', 'Action',
        'Resource Type', 'Resource ID', 'Message', 'Description', 'IP Address'
      ];

      const rows = logs.map(log => [
        log.createdAt.toISOString(),
        log.eventType,
        log.category,
        log.severity,
        log.action || '',
        log.resource || '',
        log.resourceId || '',
        log.message,
        log.description || '',
        log.ipAddress || ''
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      return {
        data: csvContent,
        filename: `audit-logs-${timestamp}.csv`,
        mimeType: 'text/csv',
      };
    }

    return {
      data: JSON.stringify(logs, null, 2),
      filename: `audit-logs-${timestamp}.json`,
      mimeType: 'application/json',
    };
  }
}
