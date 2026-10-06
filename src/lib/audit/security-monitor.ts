/**
 * Enhanced Security Monitoring System
 * Provides real-time security violation detection, anomaly monitoring, and threat assessment
 */

import { prisma } from '@/lib/db';
import { AuditCategory, AuditEventType, AuditSeverity, SecurityIncidentType } from '@prisma/client';
import { crudAuditLogger } from './crud-audit-logger';

export interface SecurityEvent {
  type: 'SUSPICIOUS_ACTIVITY' | 'RATE_LIMIT_VIOLATION' | 'UNAUTHORIZED_ACCESS' | 'DATA_BREACH_ATTEMPT' | 'ANOMALOUS_USAGE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  source: string;
  organizationId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  condition: (event: SecurityEvent) => boolean;
  action: 'LOG' | 'ALERT' | 'BLOCK' | 'THROTTLE';
}

export class SecurityMonitor {
  private static rules: SecurityRule[] = [
    {
      id: 'multiple_failed_logins',
      name: 'Multiple Failed Login Attempts',
      description: 'Detects multiple failed login attempts from same IP',
      enabled: true,
      severity: 'HIGH',
      condition: (event) => event.metadata.eventType === 'failed_login' && Number(event.metadata.count) >= 5,
      action: 'ALERT'
    },
    {
      id: 'rapid_api_calls',
      name: 'Rapid API Calls',
      description: 'Detects unusually high API call frequency',
      enabled: true,
      severity: 'MEDIUM',
      condition: (event) => event.metadata.eventType === 'api_call' && Number(event.metadata.rate) > 100,
      action: 'THROTTLE'
    },
    {
      id: 'cross_tenant_access',
      name: 'Cross-Tenant Data Access Attempt',
      description: 'Detects attempts to access data from different organization',
      enabled: true,
      severity: 'CRITICAL',
      condition: (event) => event.metadata.crossTenant === true,
      action: 'BLOCK'
    },
    {
      id: 'unusual_download_volume',
      name: 'Unusual Document Download Volume',
      description: 'Detects abnormally high document downloads',
      enabled: true,
      severity: 'MEDIUM',
      condition: (event) => event.metadata.eventType === 'document_download' && Number(event.metadata.count) > 50,
      action: 'ALERT'
    },
    {
      id: 'administrative_privilege_escalation',
      name: 'Administrative Privilege Escalation',
      description: 'Detects attempts to access admin functions by non-admin users',
      enabled: true,
      severity: 'CRITICAL',
      condition: (event) => event.metadata.eventType === 'admin_access' && event.metadata.userRole !== 'ADMIN' && event.metadata.userRole !== 'OWNER',
      action: 'BLOCK'
    }
  ];

  /**
   * Monitor and analyze security events in real-time
   */
  static async monitorEvent(event: SecurityEvent): Promise<void> {
    try {
      // Apply security rules to the event
      const triggeredRules = this.rules.filter(rule =>
        rule.enabled && rule.condition(event)
      );

      for (const rule of triggeredRules) {
        await this.handleSecurityViolation(event, rule);
      }

      // Log the security event
      await this.logSecurityEvent(event);

      // Check for patterns and anomalies
      if (event.type !== 'ANOMALOUS_USAGE') await this.detectAnomalies(event);

    } catch (error) {
      console.error('Security monitoring error:', error);
      // Don't fail the main operation due to monitoring issues
    }
  }

  /**
   * Handle security rule violations
   */
  private static async handleSecurityViolation(event: SecurityEvent, rule: SecurityRule): Promise<void> {
    const violation = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      action: rule.action,
      event,
      timestamp: new Date()
    };

    // Log the security violation
    await crudAuditLogger.logSecurityViolation(
      event.type,
      `Security Rule Triggered: ${rule.name}`,
      {
        organizationId: event.organizationId,
        severity: rule.severity,
        ruleId: rule.id,
        action: rule.action,
        eventSource: event.source,
        violationDetails: violation
      }
    );

    // Execute the appropriate action
    switch (rule.action) {
      case 'ALERT':
        await this.sendSecurityAlert(violation);
        break;
      case 'BLOCK':
        await this.blockAccess(event);
        break;
      case 'THROTTLE':
        await this.throttleAccess(event);
        break;
      case 'LOG':
        // Already logged above
        break;
    }
  }

  /**
   * Send security alerts to administrators
   */
  private static async sendSecurityAlert(violation: any): Promise<void> {
    // In a real implementation, this would send emails, Slack notifications, etc.
    console.warn('🚨 SECURITY ALERT:', {
      rule: violation.ruleName,
      severity: violation.severity,
      organization: violation.event.organizationId,
      timestamp: violation.timestamp
    });

    // Store alert in database for admin dashboard
    try {
      await prisma.securityIncident.create({
        data: {
          organizationId: violation.event.organizationId,
          incidentType: SecurityIncidentType.SUSPICIOUS_ACTIVITY,
          severity: violation.severity,
          title: violation.ruleName,
          description: violation.event.description,
          source: violation.event.source,
          affectedSystems: [violation.event.source],
          investigatedBy: [],
          relatedLogIds: [],
          tags: [violation.ruleId, violation.event.type],
          attachments: JSON.parse(JSON.stringify({
            userId: violation.event.userId,
            ipAddress: violation.event.ipAddress,
            metadata: violation.event.metadata,
            requestedAction: violation.action,
          })),
        }
      });
    } catch (error) {
      console.warn('Security alert storage failed:', error);
    }
  }

  /**
   * Block access for security violations
   */
  private static async blockAccess(event: SecurityEvent): Promise<void> {
    console.error('Security violation requires access enforcement:', {
      type: event.type,
      organization: event.organizationId,
      user: event.userId,
      ip: event.ipAddress
    });

    // In a real implementation, this would:
    // - Add IP to blocklist
    // - Suspend user account temporarily
    // - Notify security team
    // - Create incident ticket
  }

  /**
   * Throttle access for rate limit violations
   */
  private static async throttleAccess(event: SecurityEvent): Promise<void> {
    console.warn('Security violation requires rate enforcement:', {
      type: event.type,
      organization: event.organizationId,
      user: event.userId,
      ip: event.ipAddress
    });

    // In a real implementation, this would:
    // - Implement rate limiting
    // - Add delays to responses
    // - Reduce API quotas temporarily
  }

  /**
   * Log security events for analysis
   */
  private static async logSecurityEvent(event: SecurityEvent): Promise<void> {
    await crudAuditLogger.logCRUDOperation(
      {
        operation: 'CREATE',
        entityType: 'SECURITY_EVENT',
        entityId: event.source,
        entityName: `Security Event: ${event.type}`,
        previousData: null,
        currentData: event,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: {
          securityEventType: event.type,
          severity: event.severity,
          source: event.source,
          ...event.metadata
        }
      },
      AuditCategory.SECURITY,
      AuditEventType.SECURITY_VIOLATION,
      event.severity === 'CRITICAL' ? AuditSeverity.CRITICAL :
      event.severity === 'HIGH' ? AuditSeverity.ERROR : event.severity === 'MEDIUM' ? AuditSeverity.WARN : AuditSeverity.INFO
    );
  }

  /**
   * Detect patterns and anomalies in user behavior
   */
  private static async detectAnomalies(event: SecurityEvent): Promise<void> {
    const timeWindow = 1000 * 60 * 60; // 1 hour
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindow);

    try {
      // Check for unusual activity patterns
      const recentEvents = await prisma.auditLog.findMany({
        where: {
          organizationId: event.organizationId,
          createdAt: {
            gte: windowStart
          },
          category: AuditCategory.SECURITY
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      // Analyze patterns
      const eventCounts = recentEvents.reduce((acc, log) => {
        const metadata = log.metadata;
        const eventType = metadata && typeof metadata === 'object' && !Array.isArray(metadata) && typeof metadata.securityEventType === 'string' ? metadata.securityEventType : 'unknown';
        acc[eventType] = (acc[eventType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Detect anomalies
      const anomalies = Object.entries(eventCounts).filter(([type, count]) => {
        // Define thresholds for different event types
        const thresholds: Record<string, number> = {
          'failed_login': 10,
          'api_call': 200,
          'data_access': 100,
          'document_download': 30,
          'admin_access': 5
        };

        return count > (thresholds[type] || 20);
      });

      // Report anomalies
      for (const [type, count] of anomalies) {
        await this.monitorEvent({
          type: 'ANOMALOUS_USAGE',
          severity: 'MEDIUM',
          description: `Anomalous pattern detected: ${type} occurred ${count} times in the last hour`,
          source: 'anomaly_detector',
          organizationId: event.organizationId,
          metadata: {
            eventType: type,
            count,
            timeWindow: '1_hour',
            threshold: 20
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Anomaly detection error:', error);
    }
  }

  /**
   * Get security dashboard data for administrators
   */
  static async getSecurityDashboard(organizationId: string): Promise<any> {
    const timeWindow = 1000 * 60 * 60 * 24; // 24 hours
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindow);

    try {
      // Get recent security events
      const securityEvents = await prisma.auditLog.findMany({
        where: {
          organizationId,
          category: AuditCategory.SECURITY,
          createdAt: {
            gte: windowStart
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      // Get security alerts
      const securityAlerts = await prisma.securityIncident.findMany({
        where: {
          organizationId,
          detectedAt: {
            gte: windowStart
          }
        },
        orderBy: { detectedAt: 'desc' },
        take: 20
      }).catch(() => []);

      // Calculate security metrics
      const eventCounts = securityEvents.reduce((acc, event) => {
        const severity = event.severity;
        acc[severity] = (acc[severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const alertCounts = securityAlerts.reduce((acc, alert) => {
        const severity = alert.severity;
        acc[severity] = (acc[severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        organizationId,
        timeWindow: '24_hours',
        events: {
          total: securityEvents.length,
          bySeverity: eventCounts,
          recent: securityEvents.slice(0, 10)
        },
        alerts: {
          total: securityAlerts.length,
          bySeverity: alertCounts,
          unacknowledged: securityAlerts.filter(a => a.status === 'DETECTED').length,
          recent: securityAlerts.slice(0, 10)
        },
        rules: {
          total: this.rules.length,
          enabled: this.rules.filter(r => r.enabled).length,
          byAction: this.rules.reduce((acc, rule) => {
            acc[rule.action] = (acc[rule.action] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        },
        generatedAt: new Date()
      };

    } catch (error) {
      console.error('Security dashboard generation error:', error);
      return {
        organizationId,
        error: 'Failed to generate security dashboard',
        generatedAt: new Date()
      };
    }
  }

  /**
   * Monitor API endpoint for suspicious activity
   */
  static async monitorAPIAccess(
    endpoint: string,
    method: string,
    organizationId: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    responseTime?: number,
    statusCode?: number
  ): Promise<void> {
    // Detect suspicious patterns
    const events: SecurityEvent[] = [];

    // Check for admin endpoint access by non-admin users
    if (endpoint.includes('/admin/') && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
      }).catch(() => null);

      if (user && !['ADMIN', 'OWNER'].includes(user.role)) {
        events.push({
          type: 'UNAUTHORIZED_ACCESS',
          severity: 'CRITICAL',
          description: `Non-admin user attempted to access admin endpoint: ${endpoint}`,
          source: 'api_monitor',
          organizationId,
          userId,
          ipAddress,
          userAgent,
          metadata: {
            endpoint,
            method,
            userRole: user.role,
            statusCode
          },
          timestamp: new Date()
        });
      }
    }

    // Check for unusual response times (potential attacks)
    if (responseTime && responseTime > 10000) { // 10+ seconds
      events.push({
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'MEDIUM',
        description: `Unusually long response time detected: ${responseTime}ms for ${endpoint}`,
        source: 'api_monitor',
        organizationId,
        userId,
        ipAddress,
        userAgent,
        metadata: {
          endpoint,
          method,
          responseTime,
          statusCode
        },
        timestamp: new Date()
      });
    }

    // Check for error patterns (potential probing)
    if (statusCode && statusCode >= 400) {
      // This would need more sophisticated logic to detect patterns
      // For now, just log high-severity errors
      if (statusCode >= 500) {
        events.push({
          type: 'SUSPICIOUS_ACTIVITY',
          severity: 'LOW',
          description: `Server error occurred: ${statusCode} for ${endpoint}`,
          source: 'api_monitor',
          organizationId,
          userId,
          ipAddress,
          userAgent,
          metadata: {
            endpoint,
            method,
            statusCode,
            responseTime
          },
          timestamp: new Date()
        });
      }
    }

    // Process all detected events
    for (const event of events) {
      await this.monitorEvent(event);
    }
  }
}

// Export security monitoring utilities
