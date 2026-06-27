import { AuditEventType, AuditCategory, AuditSeverity } from '@prisma/client';
import { prisma } from '@/lib/db';
import { TenantContext } from '@/lib/db/tenant-context';
import { auth } from '@clerk/nextjs/server';
import crypto from 'crypto';

interface AuditLogData {
  eventType: AuditEventType;
  category: AuditCategory;
  severity: AuditSeverity;
  resourceId?: string;
  resourceType?: string;
  description: string;
  metadata?: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  correlationId?: string;
}

interface AuditContext {
  organizationId: string;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private tenantContext: TenantContext;

  private constructor() {
    this.tenantContext = new TenantContext();
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  async log(data: AuditLogData, context?: Partial<AuditContext>): Promise<void> {
    try {
      const auditContext = await this.buildAuditContext(context);
      const checksum = this.calculateChecksum(data, auditContext);

      await prisma.auditLog.create({
        data: {
          organizationId: auditContext.organizationId,
          userId: auditContext.userId,
          userEmail: auditContext.userEmail,
          eventType: data.eventType,
          category: data.category,
          severity: data.severity,
          resourceId: data.resourceId,
          resourceType: data.resourceType,
          description: data.description,
          metadata: data.metadata || {},
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          sessionId: auditContext.sessionId,
          correlationId: data.correlationId || crypto.randomUUID(),
          checksum,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw to avoid breaking the main application flow
    }
  }

  // Convenience methods for different event types
  async logUserAction(
    eventType: AuditEventType,
    resourceId: string,
    resourceType: string,
    description: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      category: AuditCategory.USER_MANAGEMENT,
      severity: AuditSeverity.INFO,
      resourceId,
      resourceType,
      description,
      metadata,
    });
  }

  async logSecurityEvent(
    eventType: AuditEventType,
    description: string,
    severity: AuditSeverity = AuditSeverity.WARNING,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      category: AuditCategory.SECURITY,
      severity,
      description,
      metadata,
    });
  }

  async logDataAccess(
    eventType: AuditEventType,
    resourceId: string,
    resourceType: string,
    description: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      category: AuditCategory.DATA_ACCESS,
      severity: AuditSeverity.INFO,
      resourceId,
      resourceType,
      description,
      metadata,
    });
  }

  async logSystemEvent(
    eventType: AuditEventType,
    description: string,
    severity: AuditSeverity = AuditSeverity.INFO,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      category: AuditCategory.SYSTEM_ADMINISTRATION,
      severity,
      description,
      metadata,
    });
  }

  async logComplianceEvent(
    eventType: AuditEventType,
    description: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      category: AuditCategory.COMPLIANCE,
      severity: AuditSeverity.INFO,
      description,
      metadata,
    });
  }

  async logApiAccess(
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const severity = statusCode >= 400 ? AuditSeverity.WARNING : AuditSeverity.INFO;
    const eventType = statusCode >= 400 ? AuditEventType.API_ERROR : AuditEventType.API_REQUEST;

    await this.log({
      eventType,
      category: AuditCategory.SYSTEM_ADMINISTRATION,
      severity,
      description: `${method} ${endpoint} - ${statusCode}`,
      metadata: {
        endpoint,
        method,
        statusCode,
        responseTime,
        ...metadata,
      },
    });
  }

  private async buildAuditContext(context?: Partial<AuditContext>): Promise<AuditContext> {
    const { userId } = auth();
    const organizationId = await this.tenantContext.getCurrentTenantId();

    return {
      organizationId: context?.organizationId || organizationId || 'system',
      userId: context?.userId || userId || undefined,
      userEmail: context?.userEmail,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId: context?.sessionId || crypto.randomUUID(),
    };
  }

  private calculateChecksum(data: AuditLogData, context: AuditContext): string {
    const payload = JSON.stringify({
      ...data,
      ...context,
      timestamp: new Date().toISOString(),
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();
