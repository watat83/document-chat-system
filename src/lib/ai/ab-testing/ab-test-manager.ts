import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { myProvider } from '@/lib/ai/models';
import { streamText } from 'ai';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  provider: 'vercel' | 'traditional';
  weight: number; // 0-100 percentage
  testId: string;
  createdAt: Date;
}

export interface ABTestConfig {
  id: string;
  name: string;
  description: string;
  variants: ABTestVariant[];
  enabled: boolean;
  startDate: Date;
  endDate?: Date;
  targetAudience?: {
    organizationIds?: string[];
    userIds?: string[];
    percentage?: number;
  };
}

export interface ABTestMetrics {
  variantId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  averageCost: number;
  totalCost: number;
  averageTokensPerSecond: number;
  userSatisfaction?: number;
  conversionRate?: number;
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
    satisfied: boolean;
    rating?: number;
    comment?: string;
  };
}

export class ABTestManager {
  private static instance: ABTestManager;
  private activeTests: Map<string, ABTestConfig> = new Map();
  private metricsCache: Map<string, ABTestMetrics[]> = new Map();

  private constructor() {
    this.loadActiveTests();
  }

  static getInstance(): ABTestManager {
    if (!ABTestManager.instance) {
      ABTestManager.instance = new ABTestManager();
    }
    return ABTestManager.instance;
  }

  private async loadActiveTests() {
    try {
      // Load from Redis cache first
      const cached = await redis.get('ab_tests:active');
      if (cached) {
        const tests = JSON.parse(cached) as ABTestConfig[];
        tests.forEach(test => {
          this.activeTests.set(test.id, test);
        });
        return;
      }

      // Load from database if not cached
      const tests = await prisma.aBTest.findMany({
        where: {
          enabled: true,
          startDate: { lte: new Date() },
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } }
          ]
        },
        include: {
          variants: true
        }
      });

      tests.forEach(test => {
        const config: ABTestConfig = {
          id: test.id,
          name: test.name,
          description: test.description,
          variants: test.variants.map(v => ({
            id: v.id,
            name: v.name,
            description: v.description,
            provider: v.provider as 'vercel' | 'traditional',
            weight: v.weight
          })),
          enabled: test.enabled,
          startDate: test.startDate,
          endDate: test.endDate || undefined,
          targetAudience: test.targetAudience as ABTestConfig['targetAudience']
        };
        this.activeTests.set(test.id, config);
      });

      // Cache for 5 minutes
      await redis.set(
        'ab_tests:active',
        JSON.stringify(Array.from(this.activeTests.values())),
        { ex: 300 }
      );
    } catch (error) {
      console.error('Failed to load active A/B tests:', error);
    }
  }

  async getVariantForUser(
    testId: string,
    userId: string,
    organizationId: string
  ): Promise<ABTestVariant | null> {
    const test = this.activeTests.get(testId);
    if (!test || !test.enabled) return null;

    // Check if user/org is in target audience
    if (test.targetAudience) {
      const { organizationIds, userIds, percentage } = test.targetAudience;

      if (organizationIds && !organizationIds.includes(organizationId)) {
        return null;
      }

      if (userIds && !userIds.includes(userId)) {
        return null;
      }

      if (percentage) {
        // Use consistent hashing for user assignment
        const hash = this.hashUserId(userId);
        if (hash > percentage) return null;
      }
    }

    // Check if user already has an assigned variant
    const cachedVariant = await redis.get(`ab_test:${testId}:user:${userId}`);
    if (cachedVariant) {
      return test.variants.find(v => v.id === cachedVariant) || null;
    }

    // Assign variant based on weights
    const variant = this.selectVariantByWeight(test.variants);
    if (variant) {
      // Cache assignment for consistency
      await redis.set(
        `ab_test:${testId}:user:${userId}`,
        variant.id,
        { ex: 86400 * 30 } // 30 days
      );
    }

    return variant;
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100;
  }

  private selectVariantByWeight(variants: ABTestVariant[]): ABTestVariant {
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    const random = Math.random() * totalWeight;

    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        return variant;
      }
    }

    return variants[0]; // Fallback to first variant
  }

  async executeWithABTest(
    testId: string,
    userId: string,
    organizationId: string,
    task: {
      model: string;
      messages: any[];
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<{ result: any; testResult: ABTestResult }> {
    const variant = await this.getVariantForUser(testId, userId, organizationId);
    if (!variant) {
      // No test variant, use default (traditional)
      return this.executeTraditional(task, testId, 'default', userId, organizationId);
    }

    const startTime = new Date();
    let result: any;
    let error: string | undefined;
    let tokensUsed = 0;
    let cost = 0;

    try {
      if (variant.provider === 'vercel') {
        result = await this.executeVercel(task);
        tokensUsed = result.usage?.totalTokens || 0;
        cost = this.calculateCost(task.model, tokensUsed);
      } else {
        const response = await this.executeTraditional(task, testId, variant.id, userId, organizationId);
        result = response.result;
        tokensUsed = response.testResult.tokensUsed;
        cost = response.testResult.cost;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      console.error(`A/B test execution error (variant: ${variant.id}):`, err);
    }

    const endTime = new Date();
    const latency = endTime.getTime() - startTime.getTime();

    const testResult: ABTestResult = {
      testId,
      variantId: variant.id,
      userId,
      organizationId,
      startTime,
      endTime,
      latency,
      tokensUsed,
      cost,
      success: !error,
      error
    };

    // Record the result
    await this.recordTestResult(testResult);

    return { result, testResult };
  }

  private async executeVercel(task: any) {
    const { fullStream } = await streamText({
      model: myProvider.languageModel(task.model),
      messages: task.messages,
      maxOutputTokens: task.maxTokens,
      temperature: task.temperature,
    });

    let content = '';
    let usage = null;

    for await (const delta of fullStream) {
      if (delta.type === 'text-delta') {
        content += delta.text;
      } else if (delta.type === 'finish') {
        usage = delta.usage;
      }
    }

    return {
      content,
      usage,
      provider: 'vercel'
    };
  }

  private async executeTraditional(
    task: any,
    testId: string,
    variantId: string,
    userId: string,
    organizationId: string
  ): Promise<{ result: any; testResult: ABTestResult }> {
    const aiService = new AIServiceManager();
    const startTime = new Date();

    const result = await aiService.generateCompletion({
      model: task.model,
      messages: task.messages,
      maxTokens: task.maxTokens,
      temperature: task.temperature
    });

    const endTime = new Date();
    const latency = endTime.getTime() - startTime.getTime();
    const tokensUsed = result.usage?.totalTokens || 0;
    const cost = result.usage?.totalCost || 0;

    const testResult: ABTestResult = {
      testId,
      variantId,
      userId,
      organizationId,
      startTime,
      endTime,
      latency,
      tokensUsed,
      cost,
      success: true
    };

    return {
      result: {
        content: result.content,
        usage: result.usage,
        provider: 'traditional'
      },
      testResult
    };
  }

  private calculateCost(model: string, tokens: number): number {
    // Simple cost calculation - should match your pricing model
    const costPer1kTokens = {
      'gpt-4': 0.03,
      'gpt-3.5-turbo': 0.002,
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025
    };

    const rate = costPer1kTokens[model] || 0.002;
    return (tokens / 1000) * rate;
  }

  async recordTestResult(result: ABTestResult) {
    try {
      // Store in database
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
          userFeedback: result.userFeedback as any
        }
      });

      // Update real-time metrics
      await this.updateMetrics(result);
    } catch (error) {
      console.error('Failed to record A/B test result:', error);
    }
  }

  private async updateMetrics(result: ABTestResult) {
    const metricsKey = `ab_metrics:${result.testId}:${result.variantId}`;

    // Get current metrics
    const current = await redis.get(metricsKey);
    const metrics: ABTestMetrics = current ? JSON.parse(current) : {
      variantId: result.variantId,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      averageCost: 0,
      totalCost: 0,
      averageTokensPerSecond: 0
    };

    // Update metrics
    metrics.totalRequests++;
    if (result.success) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }

    // Update running averages
    const n = metrics.totalRequests;
    metrics.averageLatency = ((metrics.averageLatency * (n - 1)) + result.latency) / n;
    metrics.averageCost = ((metrics.averageCost * (n - 1)) + result.cost) / n;
    metrics.totalCost += result.cost;

    if (result.tokensUsed > 0 && result.latency > 0) {
      const tokensPerSecond = (result.tokensUsed / result.latency) * 1000;
      metrics.averageTokensPerSecond =
        ((metrics.averageTokensPerSecond * (n - 1)) + tokensPerSecond) / n;
    }

    // Save updated metrics
    await redis.set(metricsKey, JSON.stringify(metrics), { ex: 86400 }); // 24 hours
  }

  async getTestMetrics(testId: string): Promise<ABTestMetrics[]> {
    const test = this.activeTests.get(testId);
    if (!test) return [];

    const metrics: ABTestMetrics[] = [];

    for (const variant of test.variants) {
      const metricsKey = `ab_metrics:${testId}:${variant.id}`;
      const data = await redis.get(metricsKey);

      if (data) {
        metrics.push(JSON.parse(data));
      } else {
        // Load from database if not in cache
        const results = await prisma.aBTestResult.findMany({
          where: {
            testId,
            variantId: variant.id,
            startTime: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          }
        });

        if (results.length > 0) {
          const variantMetrics = this.calculateMetricsFromResults(variant.id, results);
          metrics.push(variantMetrics);

          // Cache the calculated metrics
          await redis.set(metricsKey, JSON.stringify(variantMetrics), { ex: 3600 });
        }
      }
    }

    return metrics;
  }

  private calculateMetricsFromResults(
    variantId: string,
    results: any[]
  ): ABTestMetrics {
    const totalRequests = results.length;
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;

    const totalLatency = results.reduce((sum, r) => sum + r.latency, 0);
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalTokensPerSecond = results.reduce((sum, r) => {
      if (r.tokensUsed > 0 && r.latency > 0) {
        return sum + (r.tokensUsed / r.latency) * 1000;
      }
      return sum;
    }, 0);

    const satisfiedCount = results.filter(r =>
      r.userFeedback?.satisfied === true
    ).length;

    return {
      variantId,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageLatency: totalRequests > 0 ? totalLatency / totalRequests : 0,
      averageCost: totalRequests > 0 ? totalCost / totalRequests : 0,
      totalCost,
      averageTokensPerSecond: totalRequests > 0 ? totalTokensPerSecond / totalRequests : 0,
      userSatisfaction: satisfiedCount > 0 ? (satisfiedCount / totalRequests) * 100 : undefined
    };
  }

  async createABTest(config: Omit<ABTestConfig, 'id'>): Promise<ABTestConfig> {
    const test = await prisma.aBTest.create({
      data: {
        name: config.name,
        description: config.description,
        enabled: config.enabled,
        startDate: config.startDate,
        endDate: config.endDate,
        targetAudience: config.targetAudience as any,
        variants: {
          create: config.variants.map(v => ({
            name: v.name,
            description: v.description,
            provider: v.provider,
            weight: v.weight
          }))
        }
      },
      include: {
        variants: true
      }
    });

    const newConfig: ABTestConfig = {
      id: test.id,
      name: test.name,
      description: test.description,
      variants: test.variants.map(v => ({
        id: v.id,
        name: v.name,
        description: v.description,
        provider: v.provider as 'vercel' | 'traditional',
        weight: v.weight
      })),
      enabled: test.enabled,
      startDate: test.startDate,
      endDate: test.endDate || undefined,
      targetAudience: test.targetAudience as ABTestConfig['targetAudience']
    };

    this.activeTests.set(test.id, newConfig);
    await this.refreshCache();

    return newConfig;
  }

  async updateABTest(testId: string, updates: Partial<ABTestConfig>): Promise<void> {
    await prisma.aBTest.update({
      where: { id: testId },
      data: {
        name: updates.name,
        description: updates.description,
        enabled: updates.enabled,
        endDate: updates.endDate,
        targetAudience: updates.targetAudience as any
      }
    });

    await this.loadActiveTests();
  }

  async endABTest(testId: string): Promise<void> {
    await prisma.aBTest.update({
      where: { id: testId },
      data: {
        enabled: false,
        endDate: new Date()
      }
    });

    this.activeTests.delete(testId);
    await this.refreshCache();
  }

  private async refreshCache() {
    await redis.del('ab_tests:active');
    await this.loadActiveTests();
  }

  async recordUserFeedback(
    testId: string,
    variantId: string,
    userId: string,
    feedback: {
      satisfied: boolean;
      rating?: number;
      comment?: string;
    }
  ): Promise<void> {
    // Find the most recent test result for this user/variant
    const recentResult = await prisma.aBTestResult.findFirst({
      where: {
        testId,
        variantId,
        userId,
        startTime: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Within last hour
        }
      },
      orderBy: {
        startTime: 'desc'
      }
    });

    if (recentResult) {
      await prisma.aBTestResult.update({
        where: { id: recentResult.id },
        data: {
          userFeedback: feedback as any
        }
      });

      // Update metrics cache
      await this.updateMetrics({
        ...recentResult,
        userFeedback: feedback
      } as ABTestResult);
    }
  }

  async getWinningVariant(testId: string): Promise<{
    variant: ABTestVariant;
    confidence: number;
    metrics: ABTestMetrics;
  } | null> {
    const metrics = await this.getTestMetrics(testId);
    if (metrics.length < 2) return null;

    // Simple winner determination based on multiple factors
    const scores = metrics.map(m => {
      const successRate = m.totalRequests > 0
        ? m.successfulRequests / m.totalRequests
        : 0;

      const latencyScore = m.averageLatency > 0
        ? 1000 / m.averageLatency // Lower latency = higher score
        : 0;

      const costScore = m.averageCost > 0
        ? 1 / m.averageCost // Lower cost = higher score
        : 0;

      const satisfactionScore = m.userSatisfaction || 50;

      // Weighted scoring
      return {
        variantId: m.variantId,
        score: (
          successRate * 0.3 +
          (latencyScore / 10) * 0.3 +
          (costScore * 100) * 0.2 +
          (satisfactionScore / 100) * 0.2
        ),
        metrics: m
      };
    });

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    const winner = scores[0];
    const runnerUp = scores[1];

    // Calculate confidence based on score difference and sample size
    const scoreDiff = winner.score - runnerUp.score;
    const sampleSize = Math.min(winner.metrics.totalRequests, runnerUp.metrics.totalRequests);
    const confidence = Math.min(
      (scoreDiff * 100) * Math.log10(sampleSize + 1),
      99
    );

    const test = this.activeTests.get(testId);
    const winningVariant = test?.variants.find(v => v.id === winner.variantId);

    if (!winningVariant) return null;

    return {
      variant: winningVariant,
      confidence,
      metrics: winner.metrics
    };
  }
}
