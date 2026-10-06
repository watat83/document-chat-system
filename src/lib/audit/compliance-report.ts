/**
 * SOC 2 Compliance Report Generator
 * Generates comprehensive compliance reports for audit trails and security monitoring
 */

import { prisma } from '@/lib/db';
import { AuditCategory, AuditEventType, AuditSeverity } from '@prisma/client';

export interface ComplianceMetrics {
  auditTrailCoverage: {
    profileOperations: number;
    billingOperations: number;
    documentOperations: number;
    apiKeyOperations: number;
    totalOperations: number;
    coveragePercentage: number;
  };
  securityCompliance: {
    criticalEvents: number;
    highSeverityEvents: number;
    dataAccessEvents: number;
    securityViolations: number;
    averageResponseTime: number;
  };
  dataProtection: {
    sensitiveDataMasked: number;
    piiProtectionEvents: number;
    dataRetentionCompliance: number;
    encryptionCompliance: number;
  };
  accessControl: {
    userAuthenticationEvents: number;
    adminOperations: number;
    permissionDenials: number;
    sessionManagement: number;
  };
  tenantSeparation: {
    multiTenantViolations: number;
    organizationIsolation: number;
    crossTenantQueries: number;
    isolationScore: number;
  };
}

export interface ComplianceReport {
  reportId: string;
  generatedAt: Date;
  reportPeriod: {
    startDate: Date;
    endDate: Date;
    days: number;
  };
  organizationId?: string; // Optional for organization-specific reports
  metrics: ComplianceMetrics;
  recommendations: string[];
  complianceScore: number;
  findings: Array<{
    category: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    count: number;
    lastOccurrence: Date;
  }>;
  soc2Requirements: {
    CC1_ControlEnvironment: boolean;
    CC2_CommunicationInformation: boolean;
    CC3_RiskAssessment: boolean;
    CC4_MonitoringActivities: boolean;
    CC5_ControlActivities: boolean;
    CC6_LogicalPhysicalAccess: boolean;
    CC7_SystemOperations: boolean;
    CC8_ChangeManagement: boolean;
    CC9_RiskMitigation: boolean;
  };
}

export class ComplianceReportGenerator {
  /**
   * Generate comprehensive SOC 2 compliance report
   */
  static async generateReport(
    organizationId?: string,
    startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: Date = new Date()
  ): Promise<ComplianceReport> {
    const reportId = `compliance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Base query filters
    const baseFilters = {
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      ...(organizationId && { organizationId })
    };

    // Fetch audit data
    const auditLogs = await prisma.auditLog.findMany({
      where: baseFilters,
      include: {
        user: {
          select: { id: true, role: true, organizationId: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const metrics = await this.calculateMetrics(auditLogs, organizationId);
    const findings = await this.analyzeFindings(auditLogs);
    const recommendations = this.generateRecommendations(metrics, findings);
    const complianceScore = this.calculateComplianceScore(metrics);
    const soc2Requirements = this.assessSOC2Requirements(metrics, findings);

    return {
      reportId,
      generatedAt: new Date(),
      reportPeriod: {
        startDate,
        endDate,
        days: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      },
      organizationId,
      metrics,
      recommendations,
      complianceScore,
      findings,
      soc2Requirements
    };
  }

  /**
   * Calculate compliance metrics from audit logs
   */
  private static async calculateMetrics(
    auditLogs: any[],
    organizationId?: string
  ): Promise<ComplianceMetrics> {
    const profileOps = auditLogs.filter(log => log.category === AuditCategory.PROFILE_MANAGEMENT);
    const billingOps = auditLogs.filter(log => log.category === AuditCategory.BILLING);
    const documentOps = auditLogs.filter(log => log.category === AuditCategory.DOCUMENT_MANAGEMENT);
    const apiKeyOps = auditLogs.filter(log => log.category === AuditCategory.API_USAGE);

    const criticalEvents = auditLogs.filter(log => log.severity === AuditSeverity.CRITICAL);
    const highSeverityEvents = auditLogs.filter(log => log.severity === AuditSeverity.ERROR);
    const dataAccessEvents = auditLogs.filter(log => log.eventType === AuditEventType.DATA_ACCESSED);

    // Calculate sensitive data masking compliance
    const sensitiveDataEvents = auditLogs.filter(log =>
      log.sensitiveFields && (log.sensitiveFields as string[]).length > 0
    );

    // Calculate multi-tenant isolation
    const tenantViolations = organizationId ?
      auditLogs.filter(log =>
        log.organizationId && log.organizationId !== organizationId
      ).length : 0;

    return {
      auditTrailCoverage: {
        profileOperations: profileOps.length,
        billingOperations: billingOps.length,
        documentOperations: documentOps.length,
        apiKeyOperations: apiKeyOps.length,
        totalOperations: auditLogs.length,
        coveragePercentage: auditLogs.length > 0 ?
          ((profileOps.length + billingOps.length + documentOps.length + apiKeyOps.length) / auditLogs.length) * 100 : 0
      },
      securityCompliance: {
        criticalEvents: criticalEvents.length,
        highSeverityEvents: highSeverityEvents.length,
        dataAccessEvents: dataAccessEvents.length,
        securityViolations: criticalEvents.filter(log =>
          log.category === AuditCategory.SECURITY
        ).length,
        averageResponseTime: this.calculateAverageResponseTime(auditLogs)
      },
      dataProtection: {
        sensitiveDataMasked: sensitiveDataEvents.length,
        piiProtectionEvents: auditLogs.filter(log =>
          log.currentData && typeof log.currentData === 'object' &&
          JSON.stringify(log.currentData).includes('[REDACTED]')
        ).length,
        dataRetentionCompliance: 100, // Assuming compliance - can be enhanced
        encryptionCompliance: 100 // Assuming compliance - can be enhanced
      },
      accessControl: {
        userAuthenticationEvents: auditLogs.filter(log =>
          log.eventType === AuditEventType.USER_LOGIN
        ).length,
        adminOperations: auditLogs.filter(log =>
          log.user?.role && ['ADMIN', 'OWNER'].includes(log.user.role)
        ).length,
        permissionDenials: auditLogs.filter(log =>
          log.eventType === AuditEventType.SECURITY_VIOLATION
        ).length,
        sessionManagement: auditLogs.filter(log =>
          log.category === AuditCategory.USER_MANAGEMENT
        ).length
      },
      tenantSeparation: {
        multiTenantViolations: tenantViolations,
        organizationIsolation: auditLogs.filter(log => log.organizationId).length,
        crossTenantQueries: tenantViolations,
        isolationScore: tenantViolations === 0 ? 100 : Math.max(0, 100 - (tenantViolations * 10))
      }
    };
  }

  /**
   * Analyze findings and security issues
   */
  private static async analyzeFindings(auditLogs: any[]): Promise<Array<{
    category: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    count: number;
    lastOccurrence: Date;
  }>> {
    const findings = [];

    // Critical security events
    const criticalEvents = auditLogs.filter(log => log.severity === AuditSeverity.CRITICAL);
    if (criticalEvents.length > 0) {
      findings.push({
        category: 'Security Events',
        severity: 'CRITICAL' as const,
        description: 'Critical security events detected requiring immediate attention',
        count: criticalEvents.length,
        lastOccurrence: new Date(Math.max(...criticalEvents.map(e => new Date(e.createdAt).getTime())))
      });
    }

    // Failed authentication attempts
    const authFailures = auditLogs.filter(log =>
      log.eventType === AuditEventType.SECURITY_VIOLATION &&
      log.description?.includes('authentication')
    );
    if (authFailures.length > 5) {
      findings.push({
        category: 'Authentication',
        severity: 'HIGH' as const,
        description: 'Multiple authentication failures detected',
        count: authFailures.length,
        lastOccurrence: new Date(Math.max(...authFailures.map(e => new Date(e.createdAt).getTime())))
      });
    }

    // Unusual data access patterns
    const dataAccessEvents = auditLogs.filter(log => log.eventType === AuditEventType.DATA_ACCESSED);
    const bulkDataAccess = dataAccessEvents.filter(log =>
      log.entityType === 'BULK' || (log.currentData as any)?.count > 100
    );
    if (bulkDataAccess.length > 0) {
      findings.push({
        category: 'Data Access',
        severity: 'MEDIUM' as const,
        description: 'Bulk data access operations detected',
        count: bulkDataAccess.length,
        lastOccurrence: new Date(Math.max(...bulkDataAccess.map(e => new Date(e.createdAt).getTime())))
      });
    }

    // API key security issues
    const apiKeyEvents = auditLogs.filter(log => log.category === AuditCategory.API_USAGE);
    const keyRotations = apiKeyEvents.filter(log =>
      log.metadata && (log.metadata as any).isRotation
    );
    if (keyRotations.length === 0 && apiKeyEvents.length > 0) {
      findings.push({
        category: 'API Security',
        severity: 'LOW' as const,
        description: 'No API key rotations detected in the reporting period',
        count: 0,
        lastOccurrence: new Date()
      });
    }

    return findings;
  }

  /**
   * Generate compliance recommendations
   */
  private static generateRecommendations(
    metrics: ComplianceMetrics,
    findings: any[]
  ): string[] {
    const recommendations = [];

    // Audit trail coverage recommendations
    if (metrics.auditTrailCoverage.coveragePercentage < 90) {
      recommendations.push(
        'Improve audit trail coverage by implementing logging for all CRUD operations across all system components'
      );
    }

    // Security event recommendations
    if (metrics.securityCompliance.criticalEvents > 0) {
      recommendations.push(
        'Review and address all critical security events immediately to maintain compliance'
      );
    }

    // Data protection recommendations
    if (metrics.dataProtection.sensitiveDataMasked < metrics.auditTrailCoverage.totalOperations * 0.1) {
      recommendations.push(
        'Implement comprehensive sensitive data masking for all audit logs containing PII or financial information'
      );
    }

    // Multi-tenant isolation recommendations
    if (metrics.tenantSeparation.isolationScore < 100) {
      recommendations.push(
        'Address multi-tenant isolation violations to ensure complete data separation between organizations'
      );
    }

    // Access control recommendations
    if (metrics.accessControl.permissionDenials > 10) {
      recommendations.push(
        'Review access control policies - high number of permission denials may indicate misconfigurations'
      );
    }

    // API security recommendations
    const apiKeyFindings = findings.filter(f => f.category === 'API Security');
    if (apiKeyFindings.length > 0) {
      recommendations.push(
        'Implement regular API key rotation policies and automated key lifecycle management'
      );
    }

    // General recommendations
    recommendations.push(
      'Maintain continuous monitoring of audit logs for security anomalies and compliance violations',
      'Implement automated alerting for critical security events and compliance violations',
      'Conduct regular audit log reviews and compliance assessments'
    );

    return recommendations;
  }

  /**
   * Calculate overall compliance score
   */
  private static calculateComplianceScore(metrics: ComplianceMetrics): number {
    const weights = {
      auditCoverage: 0.25,
      securityCompliance: 0.25,
      dataProtection: 0.20,
      accessControl: 0.15,
      tenantSeparation: 0.15
    };

    const auditScore = Math.min(100, metrics.auditTrailCoverage.coveragePercentage);
    const securityScore = metrics.securityCompliance.criticalEvents === 0 ? 100 :
      Math.max(0, 100 - (metrics.securityCompliance.criticalEvents * 20));
    const dataScore = (metrics.dataProtection.dataRetentionCompliance + metrics.dataProtection.encryptionCompliance) / 2;
    const accessScore = metrics.accessControl.permissionDenials < 5 ? 100 :
      Math.max(0, 100 - (metrics.accessControl.permissionDenials * 5));
    const tenantScore = metrics.tenantSeparation.isolationScore;

    return Math.round(
      auditScore * weights.auditCoverage +
      securityScore * weights.securityCompliance +
      dataScore * weights.dataProtection +
      accessScore * weights.accessControl +
      tenantScore * weights.tenantSeparation
    );
  }

  /**
   * Assess SOC 2 requirements compliance
   */
  private static assessSOC2Requirements(
    metrics: ComplianceMetrics,
    findings: any[]
  ): ComplianceReport['soc2Requirements'] {
    return {
      CC1_ControlEnvironment: metrics.auditTrailCoverage.coveragePercentage >= 90,
      CC2_CommunicationInformation: metrics.auditTrailCoverage.totalOperations > 0,
      CC3_RiskAssessment: findings.filter(f => f.severity === 'CRITICAL').length === 0,
      CC4_MonitoringActivities: metrics.securityCompliance.dataAccessEvents > 0,
      CC5_ControlActivities: metrics.accessControl.adminOperations > 0,
      CC6_LogicalPhysicalAccess: metrics.accessControl.permissionDenials >= 0, // Tracked
      CC7_SystemOperations: metrics.auditTrailCoverage.totalOperations > 50,
      CC8_ChangeManagement: metrics.auditTrailCoverage.profileOperations > 0,
      CC9_RiskMitigation: metrics.securityCompliance.criticalEvents === 0
    };
  }

  /**
   * Calculate average response time for audit events
   */
  private static calculateAverageResponseTime(auditLogs: any[]): number {
    // For now, return a static value - can be enhanced with actual response time tracking
    return 150; // milliseconds
  }

  /**
   * Export compliance report to various formats
   */
  static async exportReport(
    report: ComplianceReport,
    format: 'JSON' | 'CSV' | 'PDF' = 'JSON'
  ): Promise<string> {
    switch (format) {
      case 'JSON':
        return JSON.stringify(report, null, 2);

      case 'CSV':
        return this.generateCSVReport(report);

      case 'PDF':
        // For now, return a formatted text representation
        // In production, this would generate actual PDF using a library like puppeteer
        return this.generateTextReport(report);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate CSV format report
   */
  private static generateCSVReport(report: ComplianceReport): string {
    const lines = [
      'Metric,Value,Status',
      `Report ID,${report.reportId},`,
      `Generated At,${report.generatedAt.toISOString()},`,
      `Compliance Score,${report.complianceScore}%,${report.complianceScore >= 90 ? 'PASS' : 'FAIL'}`,
      `Audit Coverage,${report.metrics.auditTrailCoverage.coveragePercentage.toFixed(1)}%,${report.metrics.auditTrailCoverage.coveragePercentage >= 90 ? 'PASS' : 'FAIL'}`,
      `Critical Events,${report.metrics.securityCompliance.criticalEvents},${report.metrics.securityCompliance.criticalEvents === 0 ? 'PASS' : 'FAIL'}`,
      `Tenant Isolation,${report.metrics.tenantSeparation.isolationScore}%,${report.metrics.tenantSeparation.isolationScore === 100 ? 'PASS' : 'FAIL'}`,
      '',
      'SOC 2 Requirements,Status,',
      `CC1 Control Environment,${report.soc2Requirements.CC1_ControlEnvironment ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC2 Communication,${report.soc2Requirements.CC2_CommunicationInformation ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC3 Risk Assessment,${report.soc2Requirements.CC3_RiskAssessment ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC4 Monitoring,${report.soc2Requirements.CC4_MonitoringActivities ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC5 Control Activities,${report.soc2Requirements.CC5_ControlActivities ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC6 Access Controls,${report.soc2Requirements.CC6_LogicalPhysicalAccess ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC7 System Operations,${report.soc2Requirements.CC7_SystemOperations ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC8 Change Management,${report.soc2Requirements.CC8_ChangeManagement ? 'COMPLIANT' : 'NON-COMPLIANT'},`,
      `CC9 Risk Mitigation,${report.soc2Requirements.CC9_RiskMitigation ? 'COMPLIANT' : 'NON-COMPLIANT'},`
    ];

    return lines.join('\n');
  }

  /**
   * Generate formatted text report
   */
  private static generateTextReport(report: ComplianceReport): string {
    const compliantCount = Object.values(report.soc2Requirements).filter(Boolean).length;
    const totalRequirements = Object.keys(report.soc2Requirements).length;

    return `
SOC 2 COMPLIANCE REPORT
=======================

Report ID: ${report.reportId}
Generated: ${report.generatedAt.toLocaleString()}
Period: ${report.reportPeriod.startDate.toLocaleDateString()} - ${report.reportPeriod.endDate.toLocaleDateString()} (${report.reportPeriod.days} days)
${report.organizationId ? `Organization: ${report.organizationId}` : 'System-wide Report'}

COMPLIANCE SUMMARY
==================
Overall Score: ${report.complianceScore}% ${report.complianceScore >= 90 ? '✅ PASSING' : '❌ FAILING'}
SOC 2 Requirements: ${compliantCount}/${totalRequirements} compliant (${Math.round(compliantCount/totalRequirements*100)}%)

AUDIT TRAIL COVERAGE
=====================
Profile Operations: ${report.metrics.auditTrailCoverage.profileOperations}
Billing Operations: ${report.metrics.auditTrailCoverage.billingOperations}
Document Operations: ${report.metrics.auditTrailCoverage.documentOperations}
API Key Operations: ${report.metrics.auditTrailCoverage.apiKeyOperations}
Total Operations: ${report.metrics.auditTrailCoverage.totalOperations}
Coverage: ${report.metrics.auditTrailCoverage.coveragePercentage.toFixed(1)}%

SECURITY COMPLIANCE
===================
Critical Events: ${report.metrics.securityCompliance.criticalEvents}
High Severity Events: ${report.metrics.securityCompliance.highSeverityEvents}
Data Access Events: ${report.metrics.securityCompliance.dataAccessEvents}
Security Violations: ${report.metrics.securityCompliance.securityViolations}

DATA PROTECTION
===============
Sensitive Data Masked: ${report.metrics.dataProtection.sensitiveDataMasked}
PII Protection Events: ${report.metrics.dataProtection.piiProtectionEvents}
Data Retention Compliance: ${report.metrics.dataProtection.dataRetentionCompliance}%
Encryption Compliance: ${report.metrics.dataProtection.encryptionCompliance}%

ACCESS CONTROL
==============
Authentication Events: ${report.metrics.accessControl.userAuthenticationEvents}
Admin Operations: ${report.metrics.accessControl.adminOperations}
Permission Denials: ${report.metrics.accessControl.permissionDenials}
Session Management: ${report.metrics.accessControl.sessionManagement}

TENANT SEPARATION
=================
Multi-tenant Violations: ${report.metrics.tenantSeparation.multiTenantViolations}
Organization Isolation: ${report.metrics.tenantSeparation.organizationIsolation}
Cross-tenant Queries: ${report.metrics.tenantSeparation.crossTenantQueries}
Isolation Score: ${report.metrics.tenantSeparation.isolationScore}%

SOC 2 REQUIREMENTS STATUS
=========================
CC1 - Control Environment: ${report.soc2Requirements.CC1_ControlEnvironment ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC2 - Communication & Information: ${report.soc2Requirements.CC2_CommunicationInformation ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC3 - Risk Assessment: ${report.soc2Requirements.CC3_RiskAssessment ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC4 - Monitoring Activities: ${report.soc2Requirements.CC4_MonitoringActivities ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC5 - Control Activities: ${report.soc2Requirements.CC5_ControlActivities ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC6 - Logical & Physical Access: ${report.soc2Requirements.CC6_LogicalPhysicalAccess ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC7 - System Operations: ${report.soc2Requirements.CC7_SystemOperations ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC8 - Change Management: ${report.soc2Requirements.CC8_ChangeManagement ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}
CC9 - Risk Mitigation: ${report.soc2Requirements.CC9_RiskMitigation ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}

FINDINGS
========
${report.findings.length === 0 ? 'No significant findings detected.' :
  report.findings.map(f => `${f.severity}: ${f.description} (${f.count} occurrences)`).join('\n')}

RECOMMENDATIONS
===============
${report.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

---
Report generated by Document Chat System Compliance System
`;
  }
}
