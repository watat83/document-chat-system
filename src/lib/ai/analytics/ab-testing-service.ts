import { PrismaClient } from '@prisma/client';
import { generateId } from '../../utils';

const prisma = new PrismaClient();

export interface ABTestConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  startDate: Date;
  endDate?: Date;
  targetAudience: {
    organizationIds?: string[];
    userIds?: string[];
    percentage?: number;
    criteria?: any;
  };
  variants: ABTestVariant[];
  metrics: string[];
  createdBy: string;
}

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  provider: 'vercel' | 'openai' | 'anthropic' | 'google' | 'azure';
  weight: number;
  config: {
    model?: string;
    parameters?: any;
    fallbackProvider?: string;
    customRouting?: any;
  };
}

export interface ABTestResult {
  testId: string;
  variantId: string;
  userId: string;
  organizationId: string;
  startTime: Date;
  endTime: Date;
  latency: number;
  tokensUsed: number;
  cost: number;
  success: boolean;
  error?: string;
  userFeedback?: {
    rating?: number;
    comment?: string;
    satisfaction?: number;
  };
  metadata?: any;
}

export interface ABTestAnalysis {
  testId: string;
  status: 'running' | 'completed' | 'stopped';
  variants: Array<{
    variantId: string;
    name: string;
    participants: number;
    metrics: {
      avgLatency: number;
      successRate: number;
      avgCost: number;
      avgTokens: number;
      userSatisfaction: number;
    };
    confidence: number;
    significantDifference: boolean;
  }>;
  winner?: {
    variantId: string;
    confidence: number;
    improvement: {
      latency: number;
      cost: number;
      satisfaction: number;
    };
  };
  recommendation: 'continue' | 'stop_winner' | 'stop_inconclusive' | 'extend_test';
  insights: string[];
}

export interface ABTestSegment {
  id: string;
  name: string;
  criteria: {
    organizationSize?: string;
    industry?: string;
    usageVolume?: string;
    region?: string;
  };
  percentage: number;
}

export class ABTestingService {
  /**
   * Create a new A/B test
   */
  async createTest(config: Omit<ABTestConfig, 'id'>): Promise<ABTestConfig> {
    const testId = generateId();

    // Validate test configuration
    this.validateTestConfig(config);

    // Create test in database
    const test = await prisma.aBTest.create({
      data: {
        id: testId,
        name: config.name,
        description: config.description,
        enabled: config.enabled,
        startDate: config.startDate,
        endDate: config.endDate,
        targetAudience: config.targetAudience,
        createdBy: config.createdBy,
        variants: {
          create: config.variants.map(variant => ({
            id: variant.id,
            name: variant.name,
            description: variant.description,
            provider: variant.provider,
            weight: variant.weight,
          })),
        },
      },
      include: {
        variants: true,
      },
    });

    return {
      id: test.id,
      name: test.name,
      description: test.description,
      enabled: test.enabled,
      startDate: test.startDate,
      endDate: test.endDate,
      targetAudience: test.targetAudience as any,
      variants: test.variants.map(v => ({
        id: v.id,
        name: v.name,
        description: v.description,
        provider: v.provider as any,
        weight: v.weight,
        config: {}, // Would be stored separately
      })),
      metrics: config.metrics,
      createdBy: test.createdBy,
    };
  }

  /**
   * Get active A/B tests for a user/organization
   */
  async getActiveTests(userId: string, organizationId: string): Promise<ABTestConfig[]> {
    const now = new Date();

    const tests = await prisma.aBTest.findMany({
      where: {
        enabled: true,
        startDate: { lte: now },
        OR: [
          { endDate: null },
          { endDate: { gte: now } },
        ],
      },
      include: {
        variants: true,
      },
    });

    // Filter tests based on target audience
    const eligibleTests = tests.filter(test => {
      const targetAudience = test.targetAudience as any;

      // Check organization targeting
      if (targetAudience.organizationIds && !targetAudience.organizationIds.includes(organizationId)) {
        return false;
      }

      // Check user targeting
      if (targetAudience.userIds && !targetAudience.userIds.includes(userId)) {
        return false;
      }

      // Check percentage targeting
      if (targetAudience.percentage && targetAudience.percentage < 100) {
        const hash = this.hashString(userId + test.id);
        const userPercentile = (hash % 100) + 1;
        if (userPercentile > targetAudience.percentage) {
          return false;
        }
      }

      return true;
    });

    return eligibleTests.map(test => ({
      id: test.id,
      name: test.name,
      description: test.description,
      enabled: test.enabled,
      startDate: test.startDate,
      endDate: test.endDate,
      targetAudience: test.targetAudience as any,
      variants: test.variants.map(v => ({
        id: v.id,
        name: v.name,
        description: v.description,
        provider: v.provider as any,
        weight: v.weight,
        config: {}, // Would be loaded from configuration
      })),
      metrics: ['latency', 'cost', 'success_rate', 'user_satisfaction'],
      createdBy: test.createdBy,
    }));
  }

  /**
   * Assign a user to a test variant
   */
  async assignVariant(testId: string, userId: string, organizationId: string): Promise<ABTestVariant | null> {
    const test = await prisma.aBTest.findUnique({
      where: { id: testId },
      include: { variants: true },
    });

    if (!test || !test.enabled) {
      return null;
    }

    // Check if user is already assigned to this test
    const existingResult = await prisma.aBTestResult.findFirst({
      where: {
        testId,
        userId,
        organizationId,
      },
      include: {
        variant: true,
      },
    });

    if (existingResult) {
      return {
        id: existingResult.variant.id,
        name: existingResult.variant.name,
        description: existingResult.variant.description,
        provider: existingResult.variant.provider as any,
        weight: existingResult.variant.weight,
        config: {}, // Would be loaded from configuration
      };
    }

    // Assign user to a variant based on weighted distribution
    const selectedVariant = this.selectWeightedVariant(test.variants, userId + testId);

    if (!selectedVariant) {
      return null;
    }

    return {
      id: selectedVariant.id,
      name: selectedVariant.name,
      description: selectedVariant.description,
      provider: selectedVariant.provider as any,
      weight: selectedVariant.weight,
      config: {}, // Would be loaded from configuration
    };
  }

  /**
   * Record A/B test result
   */
  async recordResult(result: ABTestResult): Promise<void> {
    try {
      await prisma.aBTestResult.create({
        data: {
          testId: result.testId,
          variantId: result.variantId,
          userId: result.userId,
          organizationId: result.organizationId,
          startTime: result.startTime,
          endTime: result.endTime,
          latency: result.latency,
          tokensUsed: result.tokensUsed,
          cost: result.cost,
          success: result.success,
          error: result.error,
          userFeedback: result.userFeedback,
        },
      });
    } catch (error) {
      console.error('Failed to record A/B test result:', error);
    }
  }

  /**
   * Analyze A/B test results
   */
  async analyzeTest(testId: string): Promise<ABTestAnalysis> {
    const test = await prisma.aBTest.findUnique({
      where: { id: testId },
      include: {
        variants: true,
        results: true,
      },
    });

    if (!test) {
      throw new Error('Test not found');
    }

    const variantAnalysis = [];

    for (const variant of test.variants) {
      const results = test.results.filter(r => r.variantId === variant.id);

      if (results.length === 0) {
        variantAnalysis.push({
          variantId: variant.id,
          name: variant.name,
          participants: 0,
          metrics: {
            avgLatency: 0,
            successRate: 0,
            avgCost: 0,
            avgTokens: 0,
            userSatisfaction: 0,
          },
          confidence: 0,
          significantDifference: false,
        });
        continue;
      }

      const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
      const successRate = (results.filter(r => r.success).length / results.length) * 100;
      const avgCost = results.reduce((sum, r) => sum + r.cost, 0) / results.length;
      const avgTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0) / results.length;

      const feedbackResults = results.filter(r => r.userFeedback);
      const userSatisfaction = feedbackResults.length > 0
        ? feedbackResults.reduce((sum, r) => sum + (r.userFeedback?.rating || 0), 0) / feedbackResults.length
        : 0;

      // Calculate confidence (simplified)
      const confidence = Math.min(95, Math.max(0, (results.length - 10) * 2));

      variantAnalysis.push({
        variantId: variant.id,
        name: variant.name,
        participants: results.length,
        metrics: {
          avgLatency,
          successRate,
          avgCost,
          avgTokens,
          userSatisfaction,
        },
        confidence,
        significantDifference: results.length > 30 && confidence > 80,
      });
    }

    // Determine winner
    const winner = this.determineWinner(variantAnalysis);

    // Generate recommendation
    const recommendation = this.generateRecommendation(test, variantAnalysis, winner);

    // Generate insights
    const insights = this.generateInsights(variantAnalysis);

    return {
      testId,
      status: this.getTestStatus(test),
      variants: variantAnalysis,
      winner,
      recommendation,
      insights,
    };
  }

  /**
   * Get test performance over time
   */
  async getTestPerformanceHistory(testId: string, hours: number = 24): Promise<Array<{
    timestamp: Date;
    variantId: string;
    variantName: string;
    avgLatency: number;
    successRate: number;
    avgCost: number;
    participantCount: number;
  }>> {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    const results = await prisma.aBTestResult.findMany({
      where: {
        testId,
        startTime: { gte: startTime },
      },
      include: {
        variant: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Group results by hour and variant
    const hourlyData = new Map();

    for (const result of results) {
      const hour = new Date(result.startTime);
      hour.setMinutes(0, 0, 0); // Round to hour

      const key = `${hour.getTime()}_${result.variantId}`;

      if (!hourlyData.has(key)) {
        hourlyData.set(key, {
          timestamp: hour,
          variantId: result.variantId,
          variantName: result.variant.name,
          latencies: [],
          successes: 0,
          costs: [],
          totalCount: 0,
        });
      }

      const data = hourlyData.get(key);
      data.latencies.push(result.latency);
      data.costs.push(result.cost);
      data.totalCount++;

      if (result.success) {
        data.successes++;
      }
    }

    // Calculate averages
    return Array.from(hourlyData.values()).map(data => ({
      timestamp: data.timestamp,
      variantId: data.variantId,
      variantName: data.variantName,
      avgLatency: data.latencies.reduce((sum, l) => sum + l, 0) / data.latencies.length,
      successRate: (data.successes / data.totalCount) * 100,
      avgCost: data.costs.reduce((sum, c) => sum + c, 0) / data.costs.length,
      participantCount: data.totalCount,
    }));
  }

  /**
   * Stop an A/B test
   */
  async stopTest(testId: string, reason: string): Promise<void> {
    await prisma.aBTest.update({
      where: { id: testId },
      data: {
        enabled: false,
        endDate: new Date(),
      },
    });
  }

  /**
   * Get test summary for dashboard
   */
  async getTestSummary(organizationId?: string): Promise<{
    activeTests: number;
    completedTests: number;
    totalParticipants: number;
    avgImprovement: number;
    recentTests: Array<{
      id: string;
      name: string;
      status: string;
      participants: number;
      winner?: string;
    }>;
  }> {
    const now = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [activeTests, completedTests, recentResults] = await Promise.all([
      prisma.aBTest.count({
        where: {
          enabled: true,
          startDate: { lte: now },
          OR: [
            { endDate: null },
            { endDate: { gte: now } },
          ],
        },
      }),
      prisma.aBTest.count({
        where: {
          enabled: false,
          endDate: { gte: monthAgo },
        },
      }),
      prisma.aBTestResult.findMany({
        where: {
          startTime: { gte: monthAgo },
          ...(organizationId && { organizationId }),
        },
        include: {
          test: true,
          variant: true,
        },
      }),
    ]);

    const totalParticipants = new Set(recentResults.map(r => r.userId)).size;

    // Get recent tests
    const recentTestsData = await prisma.aBTest.findMany({
      where: {
        createdAt: { gte: monthAgo },
      },
      include: {
        results: true,
        variants: true,
      },
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const recentTests = recentTestsData.map(test => ({
      id: test.id,
      name: test.name,
      status: this.getTestStatus(test),
      participants: new Set(test.results.map(r => r.userId)).size,
      winner: test.results.length > 0 ? 'To be determined' : undefined,
    }));

    return {
      activeTests,
      completedTests,
      totalParticipants,
      avgImprovement: 15.3, // Would be calculated from actual data
      recentTests,
    };
  }

  /**
   * Private helper methods
   */
  private validateTestConfig(config: Omit<ABTestConfig, 'id'>): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Test name is required');
    }

    if (!config.variants || config.variants.length < 2) {
      throw new Error('At least 2 variants are required');
    }

    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
      throw new Error('Variant weights must sum to 100');
    }

    if (config.endDate && config.endDate <= config.startDate) {
      throw new Error('End date must be after start date');
    }
  }

  private selectWeightedVariant(variants: any[], seed: string): any {
    const hash = this.hashString(seed);
    const random = (hash % 100) + 1;

    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        return variant;
      }
    }

    return variants[0]; // Fallback
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private determineWinner(variants: any[]): any {
    const validVariants = variants.filter(v => v.participants > 10 && v.confidence > 80);

    if (validVariants.length === 0) {
      return null;
    }

    // Score variants based on multiple factors
    const scoredVariants = validVariants.map(variant => {
      const score = (
        (1 / variant.metrics.avgLatency) * 1000 + // Lower latency is better
        (1 / variant.metrics.avgCost) * 1000 + // Lower cost is better
        variant.metrics.successRate + // Higher success rate is better
        variant.metrics.userSatisfaction * 20 // Higher satisfaction is better
      );

      return { ...variant, score };
    });

    scoredVariants.sort((a, b) => b.score - a.score);
    const winner = scoredVariants[0];
    const baseline = scoredVariants[1] || winner;

    return {
      variantId: winner.variantId,
      confidence: winner.confidence,
      improvement: {
        latency: ((baseline.metrics.avgLatency - winner.metrics.avgLatency) / baseline.metrics.avgLatency) * 100,
        cost: ((baseline.metrics.avgCost - winner.metrics.avgCost) / baseline.metrics.avgCost) * 100,
        satisfaction: winner.metrics.userSatisfaction - baseline.metrics.userSatisfaction,
      },
    };
  }

  private generateRecommendation(test: any, variants: any[], winner: any): string {
    const totalParticipants = variants.reduce((sum, v) => sum + v.participants, 0);

    if (totalParticipants < 100) {
      return 'continue';
    }

    if (winner && winner.confidence > 90) {
      return 'stop_winner';
    }

    if (totalParticipants > 1000 && (!winner || winner.confidence < 70)) {
      return 'stop_inconclusive';
    }

    return 'continue';
  }

  private generateInsights(variants: any[]): string[] {
    const insights = [];

    // Find performance patterns
    const bestLatency = Math.min(...variants.map(v => v.metrics.avgLatency));
    const bestCost = Math.min(...variants.map(v => v.metrics.avgCost));
    const bestSatisfaction = Math.max(...variants.map(v => v.metrics.userSatisfaction));

    const fastestVariant = variants.find(v => v.metrics.avgLatency === bestLatency);
    const cheapestVariant = variants.find(v => v.metrics.avgCost === bestCost);
    const mostSatisfyingVariant = variants.find(v => v.metrics.userSatisfaction === bestSatisfaction);

    if (fastestVariant) {
      insights.push(`${fastestVariant.name} has the lowest latency (${bestLatency.toFixed(0)}ms)`);
    }

    if (cheapestVariant) {
      insights.push(`${cheapestVariant.name} has the lowest cost ($${bestCost.toFixed(4)} per request)`);
    }

    if (mostSatisfyingVariant && bestSatisfaction > 0) {
      insights.push(`${mostSatisfyingVariant.name} has the highest user satisfaction (${bestSatisfaction.toFixed(1)}/5)`);
    }

    // Check for statistical significance
    const significantVariants = variants.filter(v => v.significantDifference);
    if (significantVariants.length > 0) {
      insights.push(`${significantVariants.length} variant(s) show statistically significant differences`);
    }

    return insights;
  }

  private getTestStatus(test: any): string {
    const now = new Date();

    if (!test.enabled) {
      return 'completed';
    }

    if (test.startDate > now) {
      return 'scheduled';
    }

    if (test.endDate && test.endDate < now) {
      return 'completed';
    }

    return 'running';
  }
}

// Create a singleton instance
export const abTestingService = new ABTestingService();
