import { PrismaClient } from '@prisma/client';
import { generateId } from '../../utils';
import { aiAnalyticsService } from './ai-analytics-service';
import { providerStatusService } from './provider-status-service';

const prisma = new PrismaClient();

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  organizationId?: string; // null for system-wide rules
  alertType: 'COST_THRESHOLD' | 'PERFORMANCE_DEGRADATION' | 'PROVIDER_DOWN' | 'QUALITY_THRESHOLD' | 'USAGE_SPIKE' | 'CIRCUIT_BREAKER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  conditions: AlertCondition[];
  actions: AlertAction[];
  cooldownMinutes: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface AlertCondition {
  field: string;
  operator: '>' | '<' | '=' | '>=' | '<=' | '!=' | 'contains' | 'not_contains';
  value: any;
  timeWindow: '5m' | '15m' | '1h' | '6h' | '24h';
  aggregation: 'avg' | 'sum' | 'count' | 'min' | 'max' | 'p95' | 'p99';
}

export interface AlertAction {
  type: 'EMAIL' | 'WEBHOOK' | 'SLACK' | 'IN_APP' | 'SMS';
  config: {
    recipients?: string[];
    webhookUrl?: string;
    slackChannel?: string;
    message?: string;
    template?: string;
  };
  enabled: boolean;
}

export interface Alert {
  id: string;
  organizationId?: string;
  ruleId: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  provider?: string;
  metric?: string;
  threshold?: number;
  actualValue?: number;
  actionRequired: boolean;
  actionTaken?: string;
  actionBy?: string;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  metadata?: any;
  createdAt: Date;
}

export interface AlertDashboard {
  summary: {
    activeAlerts: number;
    criticalAlerts: number;
    acknowledgedAlerts: number;
    resolvedToday: number;
    avgResolutionTime: number;
  };
  recentAlerts: Alert[];
  alertsByType: Array<{
    type: string;
    count: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  alertsByProvider: Array<{
    provider: string;
    count: number;
    severity: string;
  }>;
  healthScore: number;
  recommendations: string[];
}

export class AlertingService {
  private readonly DEFAULT_RULES: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
    {
      name: 'High Cost Alert',
      description: 'Alert when daily AI costs exceed threshold',
      enabled: true,
      organizationId: null,
      alertType: 'COST_THRESHOLD',
      severity: 'HIGH',
      conditions: [
        {
          field: 'totalCost',
          operator: '>',
          value: 100,
          timeWindow: '24h',
          aggregation: 'sum',
        },
      ],
      actions: [
        {
          type: 'EMAIL',
          config: {
            recipients: ['admin@example.com'],
            template: 'cost_alert',
          },
          enabled: true,
        },
        {
          type: 'IN_APP',
          config: {
            message: 'Daily AI costs have exceeded $100',
          },
          enabled: true,
        },
      ],
      cooldownMinutes: 60,
    },
    {
      name: 'Provider Down Alert',
      description: 'Alert when AI provider becomes unavailable',
      enabled: true,
      organizationId: null,
      alertType: 'PROVIDER_DOWN',
      severity: 'CRITICAL',
      conditions: [
        {
          field: 'successRate',
          operator: '<',
          value: 50,
          timeWindow: '15m',
          aggregation: 'avg',
        },
      ],
      actions: [
        {
          type: 'EMAIL',
          config: {
            recipients: ['ops@example.com'],
            template: 'provider_down',
          },
          enabled: true,
        },
        {
          type: 'IN_APP',
          config: {
            message: 'AI provider experiencing critical issues',
          },
          enabled: true,
        },
      ],
      cooldownMinutes: 5,
    },
    {
      name: 'High Latency Alert',
      description: 'Alert when response times are consistently high',
      enabled: true,
      organizationId: null,
      alertType: 'PERFORMANCE_DEGRADATION',
      severity: 'MEDIUM',
      conditions: [
        {
          field: 'avgLatency',
          operator: '>',
          value: 3000,
          timeWindow: '1h',
          aggregation: 'avg',
        },
      ],
      actions: [
        {
          type: 'IN_APP',
          config: {
            message: 'AI response times are higher than normal',
          },
          enabled: true,
        },
      ],
      cooldownMinutes: 30,
    },
    {
      name: 'Quality Degradation Alert',
      description: 'Alert when AI response quality drops',
      enabled: true,
      organizationId: null,
      alertType: 'QUALITY_THRESHOLD',
      severity: 'HIGH',
      conditions: [
        {
          field: 'avgQualityScore',
          operator: '<',
          value: 0.7,
          timeWindow: '1h',
          aggregation: 'avg',
        },
      ],
      actions: [
        {
          type: 'EMAIL',
          config: {
            recipients: ['quality@example.com'],
            template: 'quality_alert',
          },
          enabled: true,
        },
        {
          type: 'IN_APP',
          config: {
            message: 'AI response quality has declined',
          },
          enabled: true,
        },
      ],
      cooldownMinutes: 60,
    },
    {
      name: 'Usage Spike Alert',
      description: 'Alert when AI usage spikes unexpectedly',
      enabled: true,
      organizationId: null,
      alertType: 'USAGE_SPIKE',
      severity: 'MEDIUM',
      conditions: [
        {
          field: 'requestCount',
          operator: '>',
          value: 1000,
          timeWindow: '1h',
          aggregation: 'count',
        },
      ],
      actions: [
        {
          type: 'IN_APP',
          config: {
            message: 'Unusual spike in AI usage detected',
          },
          enabled: true,
        },
      ],
      cooldownMinutes: 60,
    },
    {
      name: 'Circuit Breaker Alert',
      description: 'Alert when circuit breaker opens',
      enabled: true,
      organizationId: null,
      alertType: 'CIRCUIT_BREAKER',
      severity: 'HIGH',
      conditions: [
        {
          field: 'circuitState',
          operator: '=',
          value: 'OPEN',
          timeWindow: '5m',
          aggregation: 'count',
        },
      ],
      actions: [
        {
          type: 'EMAIL',
          config: {
            recipients: ['ops@example.com'],
            template: 'circuit_breaker',
          },
          enabled: true,
        },
        {
          type: 'IN_APP',
          config: {
            message: 'Circuit breaker activated for AI provider',
          },
          enabled: true,
        },
      ],
      cooldownMinutes: 10,
    },
  ];

  /**
   * Initialize default alert rules
   */
  async initializeDefaultRules(): Promise<void> {
    for (const rule of this.DEFAULT_RULES) {
      await this.createRule({
        ...rule,
        createdBy: 'system',
      });
    }
  }

  /**
   * Create a new alert rule
   */
  async createRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertRule> {
    const ruleId = generateId();
    const now = new Date();

    // Check if rule already exists
    const existingRule = await prisma.aIAlert.findFirst({
      where: {
        title: rule.name,
        alertType: rule.alertType,
        organizationId: rule.organizationId,
      },
    });

    if (existingRule) {
      console.log(`Alert rule '${rule.name}' already exists`);
      return {
        id: existingRule.id,
        name: rule.name,
        description: rule.description,
        enabled: rule.enabled,
        organizationId: rule.organizationId,
        alertType: rule.alertType,
        severity: rule.severity,
        conditions: rule.conditions,
        actions: rule.actions,
        cooldownMinutes: rule.cooldownMinutes,
        createdAt: existingRule.createdAt,
        updatedAt: now,
        createdBy: rule.createdBy,
      };
    }

    const newRule: AlertRule = {
      id: ruleId,
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      organizationId: rule.organizationId,
      alertType: rule.alertType,
      severity: rule.severity,
      conditions: rule.conditions,
      actions: rule.actions,
      cooldownMinutes: rule.cooldownMinutes,
      createdAt: now,
      updatedAt: now,
      createdBy: rule.createdBy,
    };

    // Store in a separate rules table (would need to be created)
    // For now, we'll just return the rule

    return newRule;
  }

  /**
   * Run alert monitoring check
   */
  async runMonitoringCheck(): Promise<Alert[]> {
    console.log('Running alert monitoring check...');

    const alerts: Alert[] = [];
    const now = new Date();

    try {
      // Get all organizations for monitoring
      const organizations = await prisma.organization.findMany({
        select: { id: true },
      });

      for (const org of organizations) {
        const orgAlerts = await this.checkOrganizationAlerts(org.id);
        alerts.push(...orgAlerts);
      }

      // Check system-wide alerts
      const systemAlerts = await this.checkSystemAlerts();
      alerts.push(...systemAlerts);

      // Process and store alerts
      for (const alert of alerts) {
        await this.processAlert(alert);
      }

    } catch (error) {
      console.error('Error in monitoring check:', error);
    }

    return alerts;
  }

  /**
   * Check alerts for a specific organization
   */
  private async checkOrganizationAlerts(organizationId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const now = new Date();

    try {
      // Get analytics data for the organization
      const analyticsQuery = {
        organizationId,
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Last 24 hours
        endDate: now,
      };

      const dashboardData = await aiAnalyticsService.getDashboardData(analyticsQuery);

      // Check cost thresholds
      if (dashboardData.costAnalysis.totalCost > 100) {
        alerts.push(await this.createAlert({
          organizationId,
          ruleId: 'cost_threshold',
          alertType: 'COST_THRESHOLD',
          severity: 'HIGH',
          title: 'High AI Costs Detected',
          message: `Daily AI costs have reached $${dashboardData.costAnalysis.totalCost.toFixed(2)}, exceeding the $100 threshold`,
          metric: 'totalCost',
          threshold: 100,
          actualValue: dashboardData.costAnalysis.totalCost,
          actionRequired: true,
        }));
      }

      // Check performance degradation
      if (dashboardData.summary.avgLatency > 3000) {
        alerts.push(await this.createAlert({
          organizationId,
          ruleId: 'performance_degradation',
          alertType: 'PERFORMANCE_DEGRADATION',
          severity: 'MEDIUM',
          title: 'High Latency Detected',
          message: `Average response time is ${dashboardData.summary.avgLatency.toFixed(0)}ms, exceeding the 3000ms threshold`,
          metric: 'avgLatency',
          threshold: 3000,
          actualValue: dashboardData.summary.avgLatency,
          actionRequired: false,
        }));
      }

      // Check quality degradation
      if (dashboardData.summary.avgQualityScore < 0.7) {
        alerts.push(await this.createAlert({
          organizationId,
          ruleId: 'quality_threshold',
          alertType: 'QUALITY_THRESHOLD',
          severity: 'HIGH',
          title: 'Quality Score Below Threshold',
          message: `Average quality score is ${dashboardData.summary.avgQualityScore.toFixed(2)}, below the 0.7 threshold`,
          metric: 'avgQualityScore',
          threshold: 0.7,
          actualValue: dashboardData.summary.avgQualityScore,
          actionRequired: true,
        }));
      }

      // Check usage spikes
      if (dashboardData.summary.totalRequests > 1000) {
        const hourlyAvg = dashboardData.summary.totalRequests / 24;
        if (hourlyAvg > 100) {
          alerts.push(await this.createAlert({
            organizationId,
            ruleId: 'usage_spike',
            alertType: 'USAGE_SPIKE',
            severity: 'MEDIUM',
            title: 'Usage Spike Detected',
            message: `Request volume is ${dashboardData.summary.totalRequests} in the last 24 hours, significantly above normal`,
            metric: 'requestCount',
            threshold: 1000,
            actualValue: dashboardData.summary.totalRequests,
            actionRequired: false,
          }));
        }
      }

      // Check provider-specific issues
      for (const provider of dashboardData.providerMetrics) {
        if (provider.successRate < 50) {
          alerts.push(await this.createAlert({
            organizationId,
            ruleId: 'provider_down',
            alertType: 'PROVIDER_DOWN',
            severity: 'CRITICAL',
            title: `Provider ${provider.provider} Experiencing Issues`,
            message: `${provider.provider} success rate is ${provider.successRate.toFixed(1)}%, below the 50% threshold`,
            provider: provider.provider,
            metric: 'successRate',
            threshold: 50,
            actualValue: provider.successRate,
            actionRequired: true,
          }));
        }
      }

    } catch (error) {
      console.error(`Error checking alerts for organization ${organizationId}:`, error);
    }

    return alerts;
  }

  /**
   * Check system-wide alerts
   */
  private async checkSystemAlerts(): Promise<Alert[]> {
    const alerts: Alert[] = [];

    try {
      // Check provider status
      const providerStatus = await providerStatusService.getAllProviderStatus();

      for (const provider of providerStatus) {
        if (provider.circuitState === 'OPEN') {
          alerts.push(await this.createAlert({
            ruleId: 'circuit_breaker',
            alertType: 'CIRCUIT_BREAKER',
            severity: 'HIGH',
            title: `Circuit Breaker Open for ${provider.provider}`,
            message: `Circuit breaker has been activated for ${provider.provider} due to consecutive failures`,
            provider: provider.provider,
            metric: 'circuitState',
            threshold: 0,
            actualValue: 1,
            actionRequired: true,
          }));
        }

        if (!provider.isHealthy) {
          alerts.push(await this.createAlert({
            ruleId: 'provider_down',
            alertType: 'PROVIDER_DOWN',
            severity: 'CRITICAL',
            title: `Provider ${provider.provider} Unhealthy`,
            message: `${provider.provider} is reporting as unhealthy`,
            provider: provider.provider,
            metric: 'isHealthy',
            threshold: 1,
            actualValue: 0,
            actionRequired: true,
          }));
        }
      }

    } catch (error) {
      console.error('Error checking system alerts:', error);
    }

    return alerts;
  }

  /**
   * Create and store an alert
   */
  private async createAlert(alertData: Omit<Alert, 'id' | 'createdAt'>): Promise<Alert> {
    const alertId = generateId();
    const now = new Date();

    // Check if similar alert was recently created (cooldown)
    const recentAlert = await prisma.aIAlert.findFirst({
      where: {
        organizationId: alertData.organizationId,
        alertType: alertData.alertType,
        provider: alertData.provider,
        createdAt: {
          gte: new Date(now.getTime() - 60 * 60 * 1000), // Last hour
        },
      },
    });

    if (recentAlert) {
      console.log(`Similar alert recently created, skipping: ${alertData.title}`);
      return {
        id: recentAlert.id,
        organizationId: alertData.organizationId,
        ruleId: alertData.ruleId,
        alertType: alertData.alertType,
        severity: alertData.severity,
        title: alertData.title,
        message: alertData.message,
        provider: alertData.provider,
        metric: alertData.metric,
        threshold: alertData.threshold,
        actualValue: alertData.actualValue,
        actionRequired: alertData.actionRequired,
        actionTaken: alertData.actionTaken,
        actionBy: alertData.actionBy,
        acknowledgedAt: recentAlert.acknowledgedAt,
        acknowledgedBy: alertData.acknowledgedBy,
        resolvedAt: recentAlert.resolvedAt,
        resolvedBy: alertData.resolvedBy,
        metadata: alertData.metadata,
        createdAt: recentAlert.createdAt,
      };
    }

    const alert: Alert = {
      id: alertId,
      organizationId: alertData.organizationId,
      ruleId: alertData.ruleId,
      alertType: alertData.alertType,
      severity: alertData.severity,
      title: alertData.title,
      message: alertData.message,
      provider: alertData.provider,
      metric: alertData.metric,
      threshold: alertData.threshold,
      actualValue: alertData.actualValue,
      actionRequired: alertData.actionRequired,
      actionTaken: alertData.actionTaken,
      actionBy: alertData.actionBy,
      acknowledgedAt: alertData.acknowledgedAt,
      acknowledgedBy: alertData.acknowledgedBy,
      resolvedAt: alertData.resolvedAt,
      resolvedBy: alertData.resolvedBy,
      metadata: alertData.metadata,
      createdAt: now,
    };

    // Store in database
    await prisma.aIAlert.create({
      data: {
        id: alert.id,
        organizationId: alert.organizationId,
        alertType: alert.alertType,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        provider: alert.provider,
        metric: alert.metric,
        threshold: alert.threshold,
        actualValue: alert.actualValue,
        actionRequired: alert.actionRequired,
        actionTaken: alert.actionTaken,
        actionBy: alert.actionBy,
        acknowledgedAt: alert.acknowledgedAt,
        resolvedAt: alert.resolvedAt,
        metadata: alert.metadata,
        createdAt: alert.createdAt,
      },
    });

    return alert;
  }

  /**
   * Process an alert (send notifications, etc.)
   */
  private async processAlert(alert: Alert): Promise<void> {
    try {
      // Send notifications based on alert severity
      if (alert.severity === 'CRITICAL') {
        await this.sendCriticalNotification(alert);
      } else if (alert.severity === 'HIGH') {
        await this.sendHighPriorityNotification(alert);
      } else {
        await this.sendStandardNotification(alert);
      }

      // Log alert processing
      console.log(`Processed alert: ${alert.title} (${alert.severity})`);

    } catch (error) {
      console.error('Error processing alert:', error);
    }
  }

  /**
   * Get alert dashboard data
   */
  async getAlertDashboard(organizationId?: string): Promise<AlertDashboard> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const whereClause = organizationId ? { organizationId } : {};

    const [
      activeAlerts,
      criticalAlerts,
      acknowledgedAlerts,
      resolvedToday,
      recentAlerts,
      alertsByType,
    ] = await Promise.all([
      prisma.aIAlert.count({
        where: {
          ...whereClause,
          resolvedAt: null,
        },
      }),
      prisma.aIAlert.count({
        where: {
          ...whereClause,
          severity: 'CRITICAL',
          resolvedAt: null,
        },
      }),
      prisma.aIAlert.count({
        where: {
          ...whereClause,
          acknowledgedAt: { not: null },
          resolvedAt: null,
        },
      }),
      prisma.aIAlert.count({
        where: {
          ...whereClause,
          resolvedAt: { gte: today },
        },
      }),
      prisma.aIAlert.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.aIAlert.groupBy({
        by: ['alertType'],
        where: {
          ...whereClause,
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
        _count: true,
      }),
    ]);

    // Calculate average resolution time
    const resolvedAlertsWithTime = await prisma.aIAlert.findMany({
      where: {
        ...whereClause,
        resolvedAt: { not: null },
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    const avgResolutionTime = resolvedAlertsWithTime.length > 0
      ? resolvedAlertsWithTime.reduce((sum, alert) => {
          const resolutionTime = alert.resolvedAt!.getTime() - alert.createdAt.getTime();
          return sum + resolutionTime;
        }, 0) / (resolvedAlertsWithTime.length * 1000 * 60) // Convert to minutes
      : 0;

    // Group alerts by provider
    const alertsByProvider = await prisma.aIAlert.groupBy({
      by: ['provider'],
      where: {
        ...whereClause,
        provider: { not: null },
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      _count: true,
    });

    // Calculate health score
    const healthScore = this.calculateHealthScore(activeAlerts, criticalAlerts, avgResolutionTime);

    // Generate recommendations
    const recommendations = this.generateRecommendations(activeAlerts, criticalAlerts, alertsByType);

    return {
      summary: {
        activeAlerts,
        criticalAlerts,
        acknowledgedAlerts,
        resolvedToday,
        avgResolutionTime,
      },
      recentAlerts: recentAlerts.map(alert => ({
        id: alert.id,
        organizationId: alert.organizationId,
        ruleId: 'unknown',
        alertType: alert.alertType,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        provider: alert.provider,
        metric: alert.metric,
        threshold: alert.threshold,
        actualValue: alert.actualValue,
        actionRequired: alert.actionRequired,
        actionTaken: alert.actionTaken,
        actionBy: alert.actionBy,
        acknowledgedAt: alert.acknowledgedAt,
        acknowledgedBy: 'unknown',
        resolvedAt: alert.resolvedAt,
        resolvedBy: 'unknown',
        metadata: alert.metadata,
        createdAt: alert.createdAt,
      })),
      alertsByType: alertsByType.map(item => ({
        type: item.alertType,
        count: item._count,
        trend: 'stable' as const, // Would be calculated from historical data
      })),
      alertsByProvider: alertsByProvider.map(item => ({
        provider: item.provider || 'unknown',
        count: item._count,
        severity: 'MEDIUM', // Would be calculated from actual data
      })),
      healthScore,
      recommendations,
    };
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    await prisma.aIAlert.update({
      where: { id: alertId },
      data: {
        acknowledgedAt: new Date(),
        actionBy: userId,
      },
    });
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, resolution: string): Promise<void> {
    await prisma.aIAlert.update({
      where: { id: alertId },
      data: {
        resolvedAt: new Date(),
        actionTaken: resolution,
        actionBy: userId,
      },
    });
  }

  /**
   * Private helper methods
   */
  private async sendCriticalNotification(alert: Alert): Promise<void> {
    // Implementation for critical notifications
    console.log(`CRITICAL ALERT: ${alert.title} - ${alert.message}`);
  }

  private async sendHighPriorityNotification(alert: Alert): Promise<void> {
    // Implementation for high priority notifications
    console.log(`HIGH PRIORITY ALERT: ${alert.title} - ${alert.message}`);
  }

  private async sendStandardNotification(alert: Alert): Promise<void> {
    // Implementation for standard notifications
    console.log(`ALERT: ${alert.title} - ${alert.message}`);
  }

  private calculateHealthScore(activeAlerts: number, criticalAlerts: number, avgResolutionTime: number): number {
    let score = 100;

    // Reduce score for active alerts
    score -= activeAlerts * 5;

    // Reduce score more for critical alerts
    score -= criticalAlerts * 15;

    // Reduce score for slow resolution times
    if (avgResolutionTime > 60) {
      score -= Math.min(20, (avgResolutionTime - 60) / 10);
    }

    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(activeAlerts: number, criticalAlerts: number, alertsByType: any[]): string[] {
    const recommendations = [];

    if (criticalAlerts > 0) {
      recommendations.push(`Address ${criticalAlerts} critical alert(s) immediately`);
    }

    if (activeAlerts > 10) {
      recommendations.push('Consider reviewing alert thresholds to reduce noise');
    }

    const costAlerts = alertsByType.find(a => a.alertType === 'COST_THRESHOLD');
    if (costAlerts && costAlerts._count > 2) {
      recommendations.push('Implement cost optimization measures');
    }

    const performanceAlerts = alertsByType.find(a => a.alertType === 'PERFORMANCE_DEGRADATION');
    if (performanceAlerts && performanceAlerts._count > 3) {
      recommendations.push('Investigate performance optimization opportunities');
    }

    return recommendations;
  }
}

// Create a singleton instance
export const alertingService = new AlertingService();
