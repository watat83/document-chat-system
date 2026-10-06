/**
 * CRUD Audit Logger for Critical Business Operations
 * Implements comprehensive audit trails for SOC 2 compliance
 */

import { prisma } from '@/lib/db';
import {
  AuditEventType,
  AuditCategory,
  AuditSeverity,
  type Prisma
} from '@prisma/client';
import { auth } from '@clerk/nextjs/server';
import { getOrganizationId } from '@/lib/auth/get-organization-id';
import { maskSensitiveData } from './data-masking';
import { TenantContext } from '@/lib/db/tenant-context';

/**
 * Interface for CRUD audit events
 */
export interface CRUDEventData {
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  entityType: string;
  entityId: string;
  entityName?: string;
  previousData?: any;
  currentData?: any;
  changedFields?: string[];
  metadata?: Record<string, any>;
  sensitiveFields?: string[];
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Main CRUD Audit Logger class
 */
export class CRUDAuditLogger {
  private static instance: CRUDAuditLogger;

  private constructor() {}

  static getInstance(): CRUDAuditLogger {
    if (!CRUDAuditLogger.instance) {
      CRUDAuditLogger.instance = new CRUDAuditLogger();
    }
    return CRUDAuditLogger.instance;
  }

  /**
   * Log a CRUD operation with automatic context detection
   */
  async logCRUDOperation(
    eventData: CRUDEventData,
    category: AuditCategory,
    eventType: AuditEventType,
    severity: AuditSeverity = AuditSeverity.INFO
  ): Promise<void> {
    try {
      const { userId: clerkUserId, orgId } = await auth();

      if (!clerkUserId) {
        console.warn('No authenticated user for audit log');
        return;
      }

      // Get user and organization context
      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
        select: { id: true, email: true, organizationId: true }
      });

      if (!user) {
        console.warn('User not found for audit log');
        return;
      }

      const organizationId = user.organizationId || (await getOrganizationId(user.id));

      if (!organizationId) {
        console.warn('No organization context for audit log');
        return;
      }

      // Mask sensitive data if specified
      let maskedPreviousData = eventData.previousData;
      let maskedCurrentData = eventData.currentData;

      if (eventData.sensitiveFields && eventData.sensitiveFields.length > 0) {
        maskedPreviousData = maskSensitiveData(eventData.previousData, eventData.sensitiveFields);
        maskedCurrentData = maskSensitiveData(eventData.currentData, eventData.sensitiveFields);
      }

      // Calculate what changed
      const changes = this.calculateChanges(
        maskedPreviousData,
        maskedCurrentData,
        eventData.changedFields
      );

      // Build description
      const description = this.buildDescription(eventData, changes);

      // Create audit log entry
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: user.id,
          eventType,
          category,
          severity,
          source: eventData.metadata?.endpoint || 'application',
          action: eventData.operation,
          resource: eventData.entityType,
          resourceId: eventData.entityId,
          entityType: eventData.entityType,
          entityId: eventData.entityId,
          endpoint: eventData.metadata?.endpoint,
          httpMethod: eventData.metadata?.method,
          ipAddress: eventData.ipAddress || 'unknown',
          userAgent: eventData.userAgent || 'unknown',
          message: description,
          description: `${eventData.operation} operation on ${eventData.entityType} ${eventData.entityName || eventData.entityId}`,
          oldValues: maskedPreviousData ? JSON.parse(JSON.stringify(maskedPreviousData)) : null,
          newValues: maskedCurrentData ? JSON.parse(JSON.stringify(maskedCurrentData)) : null,
          metadata: {
            operation: eventData.operation,
            entityName: eventData.entityName,
            changes,
            userEmail: user.email,
            ...eventData.metadata
          }
        }
      });
    } catch (error) {
      console.error('Failed to create CRUD audit log:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Calculate what fields changed between two objects
   */
  private calculateChanges(
    previousData: any,
    currentData: any,
    specifiedFields?: string[]
  ): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};

    if (!previousData && !currentData) {
      return changes;
    }

    // If fields are specified, only check those
    if (specifiedFields && specifiedFields.length > 0) {
      for (const field of specifiedFields) {
        if (previousData?.[field] !== currentData?.[field]) {
          changes[field] = {
            old: previousData?.[field],
            new: currentData?.[field]
          };
        }
      }
      return changes;
    }

    // Otherwise, check all fields
    const allKeys = new Set([
      ...Object.keys(previousData || {}),
      ...Object.keys(currentData || {})
    ]);

    for (const key of allKeys) {
      const oldValue = previousData?.[key];
      const newValue = currentData?.[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[key] = { old: oldValue, new: newValue };
      }
    }

    return changes;
  }

  /**
   * Build a human-readable description of the operation
   */
  private buildDescription(eventData: CRUDEventData, changes: Record<string, any>): string {
    const { operation, entityType, entityName } = eventData;
    const entityLabel = entityName || `${entityType} ${eventData.entityId}`;

    switch (operation) {
      case 'CREATE':
        return `Created ${entityLabel}`;
      case 'READ':
        return `Accessed ${entityLabel}`;
      case 'UPDATE':
        const changedFieldsList = Object.keys(changes).join(', ');
        return `Updated ${entityLabel}${changedFieldsList ? ` (${changedFieldsList})` : ''}`;
      case 'DELETE':
        return `Deleted ${entityLabel}`;
      default:
        return `Performed ${operation} on ${entityLabel}`;
    }
  }

  // Specialized logging methods for each critical area

  /**
   * Log Profile CRUD operations with sensitive data masking
   */
  async logProfileOperation(
    operation: CRUDEventData['operation'],
    profileId: string,
    companyName: string,
    previousData?: any,
    currentData?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCRUDOperation(
      {
        operation,
        entityType: 'Profile',
        entityId: profileId,
        entityName: companyName,
        previousData,
        currentData,
        sensitiveFields: [
          'primaryContactEmail',
          'primaryContactPhone',
          'annualRevenue',
          'duns',
          'cageCode',
          'uei'
        ],
        metadata
      },
      AuditCategory.PROFILE_MANAGEMENT,
      this.getEventTypeForOperation(operation, 'PROFILE'),
      operation === 'DELETE' ? AuditSeverity.WARN : AuditSeverity.INFO
    );
  }

  /**
   * Log Billing/Subscription operations
   */
  async logBillingOperation(
    operation: CRUDEventData['operation'],
    subscriptionId: string,
    planName: string,
    previousData?: any,
    currentData?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCRUDOperation(
      {
        operation,
        entityType: 'Subscription',
        entityId: subscriptionId,
        entityName: planName,
        previousData,
        currentData,
        sensitiveFields: ['stripeCustomerId', 'stripeSubscriptionId', 'stripePaymentMethodId'],
        metadata: {
          ...metadata,
          isFinancialOperation: true
        }
      },
      AuditCategory.BILLING,
      this.getEventTypeForOperation(operation, 'SUBSCRIPTION'),
      operation === 'DELETE' ? AuditSeverity.WARN : AuditSeverity.INFO
    );
  }

  /**
   * Log Document operations with access tracking
   */
  async logDocumentOperation(
    operation: CRUDEventData['operation'],
    documentId: string,
    documentName: string,
    documentType: string,
    previousData?: any,
    currentData?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCRUDOperation(
      {
        operation,
        entityType: 'Document',
        entityId: documentId,
        entityName: documentName,
        previousData,
        currentData,
        metadata: {
          ...metadata,
          documentType,
          isConfidential: metadata?.isConfidential || false
        }
      },
      AuditCategory.DATA_ACCESS,
      this.getEventTypeForOperation(operation, 'DOCUMENT'),
      operation === 'DELETE' ? AuditSeverity.WARN : AuditSeverity.INFO
    );
  }

  /**
   * Log API Key operations with security tracking
   */
  async logAPIKeyOperation(
    operation: CRUDEventData['operation'],
    keyId: string,
    keyName: string,
    previousData?: any,
    currentData?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Never log actual API key values
    const sanitizedPrevious = previousData ? { ...previousData, key: '[REDACTED]' } : null;
    const sanitizedCurrent = currentData ? { ...currentData, key: '[REDACTED]' } : null;

    await this.logCRUDOperation(
      {
        operation,
        entityType: 'APIKey',
        entityId: keyId,
        entityName: keyName,
        previousData: sanitizedPrevious,
        currentData: sanitizedCurrent,
        metadata: {
          ...metadata,
          isSecurityOperation: true
        }
      },
      AuditCategory.SECURITY,
      this.getEventTypeForOperation(operation, 'API_KEY'),
      AuditSeverity.WARN // API key operations are always important
    );
  }

  /**
   * Log Organization/User management operations
   */
  async logOrganizationOperation(
    operation: CRUDEventData['operation'],
    entityType: 'Organization' | 'User' | 'Member',
    entityId: string,
    entityName: string,
    previousData?: any,
    currentData?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCRUDOperation(
      {
        operation,
        entityType,
        entityId,
        entityName,
        previousData,
        currentData,
        sensitiveFields: ['email', 'phoneNumber'],
        metadata
      },
      AuditCategory.USER_MANAGEMENT,
      this.getEventTypeForOperation(operation, entityType.toUpperCase()),
      operation === 'DELETE' ? AuditSeverity.WARN : AuditSeverity.INFO
    );
  }

  /**
   * Log Opportunity operations
   */
  async logOpportunityOperation(
    operation: CRUDEventData['operation'],
    opportunityId: string,
    opportunityTitle: string,
    actionType: 'SAVE' | 'APPLY' | 'NOTE' | 'ASSIGN',
    previousData?: any,
    currentData?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCRUDOperation(
      {
        operation,
        entityType: `Opportunity_${actionType}`,
        entityId: opportunityId,
        entityName: opportunityTitle,
        previousData,
        currentData,
        metadata: {
          ...metadata,
          actionType
        }
      },
      AuditCategory.BUSINESS_LOGIC,
      this.getEventTypeForOperation(operation, 'OPPORTUNITY'),
      AuditSeverity.INFO
    );
  }

  /**
   * Log AI/Match Score operations with decision tracking
   */
  async logAIOperation(
    operation: CRUDEventData['operation'],
    scoreId: string,
    opportunityTitle: string,
    profileName: string,
    score: number,
    algorithm: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logCRUDOperation(
      {
        operation,
        entityType: 'MatchScore',
        entityId: scoreId,
        entityName: `${profileName} <-> ${opportunityTitle}`,
        currentData: { score, algorithm },
        metadata: {
          ...metadata,
          algorithm,
          score,
          isAIDecision: true
        }
      },
      AuditCategory.AI_SERVICES,
      AuditEventType.MATCH_SCORE_FEEDBACK_PROVIDED,
      AuditSeverity.INFO
    );
  }

  /**
   * Helper to get event type based on operation and entity
   */
  private getEventTypeForOperation(
    operation: CRUDEventData['operation'],
    entityType: string
  ): AuditEventType {
    // Handle specific entity types with known audit event types
    if (entityType === 'DOCUMENT') {
      switch (operation) {
        case 'CREATE':
          return AuditEventType.DOCUMENT_UPLOADED;
        case 'READ':
          return AuditEventType.DATA_ACCESSED;
        case 'UPDATE':
          return AuditEventType.DATA_UPDATED;
        case 'DELETE':
          return AuditEventType.DOCUMENT_DELETED;
        default:
          return AuditEventType.DATA_UPDATED;
      }
    }

    // Fallback for other entity types - try to construct the event type name
    const baseType = entityType.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    switch (operation) {
      case 'CREATE':
        return AuditEventType[`${baseType}_CREATED` as keyof typeof AuditEventType] || AuditEventType.DATA_CREATED;
      case 'READ':
        return AuditEventType[`${baseType}_ACCESSED` as keyof typeof AuditEventType] || AuditEventType.DATA_ACCESSED;
      case 'UPDATE':
        return AuditEventType[`${baseType}_UPDATED` as keyof typeof AuditEventType] || AuditEventType.DATA_UPDATED;
      case 'DELETE':
        return AuditEventType[`${baseType}_DELETED` as keyof typeof AuditEventType] || AuditEventType.DATA_DELETED;
      default:
        return AuditEventType.DATA_UPDATED;
    }
  }

  /**
   * Get organization-specific audit logs with tenant isolation
   */
  static async getOrganizationAuditLogs(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      category?: AuditCategory;
      severity?: AuditSeverity;
      entityType?: string;
      userId?: string;
    } = {}
  ): Promise<{
    logs: any[];
    total: number;
    organizationId: string;
  }> {
    const {
      limit = 100,
      offset = 0,
      startDate,
      endDate,
      category,
      severity,
      entityType,
      userId
    } = options;

    // Build where clause with mandatory organization filter
    const whereClause: any = {
      organizationId // CRITICAL: Always filter by organization
    };

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt.gte = startDate;
      if (endDate) whereClause.createdAt.lte = endDate;
    }

    if (category) whereClause.category = category;
    if (severity) whereClause.severity = severity;
    if (entityType) whereClause.entityType = entityType;
    if (userId) whereClause.userId = userId;

    try {
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                organizationId: true // Double-check organization
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset
        }),
        prisma.auditLog.count({
          where: whereClause
        })
      ]);

      // SECURITY: Verify all logs belong to the requested organization
      const invalidLogs = logs.filter(log =>
        log.organizationId !== organizationId ||
        (log.user && log.user.organizationId !== organizationId)
      );

      if (invalidLogs.length > 0) {
        console.error(`SECURITY VIOLATION: Found ${invalidLogs.length} audit logs with mismatched organization IDs`, {
          requestedOrganization: organizationId,
          invalidLogs: invalidLogs.map(log => ({
            logId: log.id,
            logOrganization: log.organizationId,
            userOrganization: log.user?.organizationId
          }))
        });

        // Log this security violation
        await CRUDAuditLogger.getInstance().logSecurityViolation(
          'TENANT_ISOLATION_BREACH',
          'Audit log query returned logs from wrong organization',
          {
            requestedOrganization: organizationId,
            violatingLogs: invalidLogs.length,
            severity: 'CRITICAL'
          }
        );

        // Filter out invalid logs
        const validLogs = logs.filter(log =>
          log.organizationId === organizationId &&
          (!log.user || log.user.organizationId === organizationId)
        );

        return {
          logs: validLogs,
          total: validLogs.length,
          organizationId
        };
      }

      return {
        logs,
        total,
        organizationId
      };
    } catch (error) {
      console.error('Failed to fetch organization audit logs:', error);
      throw new Error('Failed to retrieve audit logs');
    }
  }

  /**
   * Get audit log statistics for an organization
   */
  static async getOrganizationAuditStats(
    organizationId: string,
    timeframe: 'day' | 'week' | 'month' = 'month'
  ): Promise<{
    totalLogs: number;
    categoryCounts: Record<AuditCategory, number>;
    severityCounts: Record<AuditSeverity, number>;
    recentActivity: Array<{
      date: string;
      count: number;
    }>;
    topUsers: Array<{
      userId: string;
      userName: string;
      count: number;
    }>;
    organizationId: string;
  }> {
    const timeframeDays = timeframe === 'day' ? 1 : timeframe === 'week' ? 7 : 30;
    const startDate = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);

    try {
      // Get all logs for the organization within timeframe
      const logs = await prisma.auditLog.findMany({
        where: {
          organizationId, // CRITICAL: Always filter by organization
          createdAt: {
            gte: startDate
          }
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              organizationId: true // Verify user organization
            }
          }
        }
      });

      // SECURITY: Verify all logs belong to the requested organization
      const validLogs = logs.filter(log =>
        log.organizationId === organizationId &&
        (!log.user || log.user.organizationId === organizationId)
      );

      if (validLogs.length !== logs.length) {
        console.error(`SECURITY VIOLATION: Filtered out ${logs.length - validLogs.length} logs with wrong organization ID`);

        await CRUDAuditLogger.getInstance().logSecurityViolation(
          'TENANT_ISOLATION_BREACH',
          'Audit statistics query included cross-tenant data',
          {
            requestedOrganization: organizationId,
            filteredLogs: logs.length - validLogs.length,
            severity: 'HIGH'
          }
        );
      }

      // Calculate statistics
      const categoryCounts = Object.values(AuditCategory).reduce((acc, category) => {
        acc[category] = validLogs.filter(log => log.category === category).length;
        return acc;
      }, {} as Record<AuditCategory, number>);

      const severityCounts = Object.values(AuditSeverity).reduce((acc, severity) => {
        acc[severity] = validLogs.filter(log => log.severity === severity).length;
        return acc;
      }, {} as Record<AuditSeverity, number>);

      // Recent activity by day
      const recentActivity = [];
      for (let i = 0; i < timeframeDays; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const count = validLogs.filter(log =>
          log.createdAt.toISOString().split('T')[0] === dateStr
        ).length;
        recentActivity.unshift({ date: dateStr, count });
      }

      // Top users by activity
      const userCounts = validLogs.reduce((acc, log) => {
        if (log.user) {
          const key = log.user.id;
          if (!acc[key]) {
            acc[key] = {
              userId: log.user.id,
              userName: `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || 'Unknown User',
              count: 0
            };
          }
          acc[key].count++;
        }
        return acc;
      }, {} as Record<string, { userId: string; userName: string; count: number }>);

      const topUsers = Object.values(userCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalLogs: validLogs.length,
        categoryCounts,
        severityCounts,
        recentActivity,
        topUsers,
        organizationId
      };
    } catch (error) {
      console.error('Failed to fetch organization audit stats:', error);
      throw new Error('Failed to retrieve audit statistics');
    }
  }

  /**
   * Validate tenant isolation for audit operations
   */
  static async validateTenantIsolation(
    organizationId: string
  ): Promise<{
    isValid: boolean;
    violations: Array<{
      type: 'CROSS_TENANT_LOG' | 'MISSING_ORGANIZATION' | 'USER_ORGANIZATION_MISMATCH';
      description: string;
      count: number;
    }>;
  }> {
    try {
      const violations = [];

      // organizationId is mandatory and protected by a foreign key in the schema.

      // Check for cross-tenant contamination in user relationships
      const crossTenantUsers = await prisma.auditLog.findMany({
        where: {
          organizationId,
          user: {
            organizationId: {
              not: organizationId
            }
          }
        },
        select: {
          id: true,
          userId: true,
          organizationId: true,
          user: {
            select: {
              organizationId: true
            }
          }
        }
      });

      if (crossTenantUsers.length > 0) {
        violations.push({
          type: 'USER_ORGANIZATION_MISMATCH' as const,
          description: 'Audit logs found with user from different organization',
          count: crossTenantUsers.length
        });
      }

      const isValid = violations.length === 0;

      if (!isValid) {
        console.warn(`Tenant isolation violations detected for organization ${organizationId}:`, violations);

        // Log the isolation violation
        await CRUDAuditLogger.getInstance().logSecurityViolation(
          'TENANT_ISOLATION_VALIDATION_FAILED',
          'Tenant isolation validation detected violations',
          {
            organizationId,
            violations,
            severity: 'HIGH'
          }
        );
      }

      return {
        isValid,
        violations
      };
    } catch (error) {
      console.error('Failed to validate tenant isolation:', error);
      throw new Error('Failed to validate tenant isolation');
    }
  }

  /**
   * Log security violations and threat detection events
   */
  async logSecurityViolation(
    violationType: string,
    description: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: metadata.organizationId || null,
          userId: null,
          eventType: AuditEventType.SECURITY_INCIDENT_CREATED,
          category: AuditCategory.SECURITY,
          severity: AuditSeverity.CRITICAL,
          source: 'audit-system',
          action: 'SECURITY_VIOLATION',
          resource: 'SECURITY_VIOLATION',
          resourceId: `violation-${Date.now()}`,
          entityType: 'SECURITY_VIOLATION',
          entityId: `violation-${Date.now()}`,
          ipAddress: 'system',
          userAgent: 'audit-system',
          message: violationType,
          description,
          metadata
        }
      });
    } catch (error) {
      console.error('Failed to log security violation:', error);
    }
  }
}

// Export singleton instance
export const crudAuditLogger = CRUDAuditLogger.getInstance();
