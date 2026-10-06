import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { aiAnalyticsService } from '@/lib/ai/analytics/ai-analytics-service';
import { providerStatusService } from '@/lib/ai/analytics/provider-status-service';
import { rateLimit } from '@/lib/rate-limit';

/**
 * @swagger
 * /api/ai/analytics/real-time:
 *   get:
 *     summary: Get real-time AI analytics data
 *     description: Retrieve comprehensive real-time analytics for AI routing decisions, provider performance, and system health
 *     tags: [AI Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID for analytics scope
 *       - in: query
 *         name: timeRange
 *         required: false
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 24h, 7d, 30d]
 *           default: 24h
 *         description: Time range for analytics data
 *       - in: query
 *         name: providers
 *         required: false
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Filter by specific providers
 *       - in: query
 *         name: includeQuality
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include quality metrics in response
 *       - in: query
 *         name: includeUsagePatterns
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include usage patterns in response
 *     responses:
 *       200:
 *         description: Real-time analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalRequests:
 *                       type: number
 *                       description: Total number of requests
 *                     totalCost:
 *                       type: number
 *                       format: float
 *                       description: Total cost in dollars
 *                     avgLatency:
 *                       type: number
 *                       format: float
 *                       description: Average latency in milliseconds
 *                     overallSuccessRate:
 *                       type: number
 *                       format: float
 *                       description: Overall success rate percentage
 *                     fallbackRate:
 *                       type: number
 *                       format: float
 *                       description: Fallback rate percentage
 *                     avgQualityScore:
 *                       type: number
 *                       format: float
 *                       description: Average quality score (0-1)
 *                 providerMetrics:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       provider:
 *                         type: string
 *                         description: Provider name
 *                       totalRequests:
 *                         type: number
 *                         description: Total requests for this provider
 *                       successRate:
 *                         type: number
 *                         format: float
 *                         description: Success rate percentage
 *                       avgLatency:
 *                         type: number
 *                         format: float
 *                         description: Average latency in milliseconds
 *                       totalCost:
 *                         type: number
 *                         format: float
 *                         description: Total cost for this provider
 *                       avgCost:
 *                         type: number
 *                         format: float
 *                         description: Average cost per request
 *                 providerStatus:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       provider:
 *                         type: string
 *                         description: Provider name
 *                       isHealthy:
 *                         type: boolean
 *                         description: Provider health status
 *                       circuitState:
 *                         type: string
 *                         enum: [CLOSED, OPEN, HALF_OPEN]
 *                         description: Circuit breaker state
 *                       lastHealthCheck:
 *                         type: string
 *                         format: date-time
 *                         description: Last health check timestamp
 *                       consecutiveFailures:
 *                         type: number
 *                         description: Number of consecutive failures
 *                 costAnalysis:
 *                   type: object
 *                   properties:
 *                     totalCost:
 *                       type: number
 *                       format: float
 *                       description: Total cost
 *                     projectedMonthlyCost:
 *                       type: number
 *                       format: float
 *                       description: Projected monthly cost
 *                     costByProvider:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           provider:
 *                             type: string
 *                           cost:
 *                             type: number
 *                             format: float
 *                           percentage:
 *                             type: number
 *                             format: float
 *                     optimizationOpportunities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           potentialSavings:
 *                             type: number
 *                             format: float
 *                           impact:
 *                             type: string
 *                             enum: [low, medium, high]
 *                 routingAnalysis:
 *                   type: object
 *                   properties:
 *                     routingDecisions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           decision:
 *                             type: string
 *                           count:
 *                             type: number
 *                           percentage:
 *                             type: number
 *                             format: float
 *                           avgLatency:
 *                             type: number
 *                             format: float
 *                           avgCost:
 *                             type: number
 *                             format: float
 *                           successRate:
 *                             type: number
 *                             format: float
 *                     fallbackRate:
 *                       type: number
 *                       format: float
 *                     routingEfficiency:
 *                       type: number
 *                       format: float
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           impact:
 *                             type: string
 *                             enum: [low, medium, high]
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [info, warning, error]
 *                       message:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       provider:
 *                         type: string
 *                       resolved:
 *                         type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Response timestamp
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */

const querySchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
  providers: z.array(z.string()).optional(),
  includeQuality: z.boolean().default(true),
  includeUsagePatterns: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Apply rate limiting
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 120, // 120 requests per minute for real-time data
    }, 'ai-analytics-real-time');

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    // Parse and validate query parameters
    const url = new URL(request.url);
    const queryParams: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());

    // Handle array parameters
    if (queryParams.providers && typeof queryParams.providers === 'string') {
      queryParams.providers = queryParams.providers.split(',').map(p => p.trim());
    }

    // Handle boolean parameters
    if (queryParams.includeQuality !== undefined) {
      queryParams.includeQuality = queryParams.includeQuality === 'true';
    }
    if (queryParams.includeUsagePatterns !== undefined) {
      queryParams.includeUsagePatterns = queryParams.includeUsagePatterns === 'true';
    }

    const validatedQuery = querySchema.parse(queryParams);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();

    switch (validatedQuery.timeRange) {
      case '1h':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case '6h':
        startDate.setHours(startDate.getHours() - 6);
        break;
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
    }

    // Build analytics query
    const analyticsQuery = {
      organizationId: validatedQuery.organizationId,
      startDate,
      endDate,
      ...(validatedQuery.providers && { providers: validatedQuery.providers }),
    };

    // Fetch comprehensive analytics data
    const [dashboardData, providerStatus] = await Promise.all([
      aiAnalyticsService.getDashboardData(analyticsQuery),
      providerStatusService.getAllProviderStatus(),
    ]);

    // Generate alerts based on current data
    const alerts = [];
    const currentTime = new Date();

    // Check for high fallback rate
    if (dashboardData.summary.fallbackRate > 10) {
      alerts.push({
        type: 'warning',
        message: `High fallback rate detected: ${dashboardData.summary.fallbackRate.toFixed(1)}%`,
        timestamp: currentTime.toISOString(),
        provider: null,
        resolved: false,
      });
    }

    // Check for low quality scores
    if (dashboardData.summary.avgQualityScore < 0.8) {
      alerts.push({
        type: 'error',
        message: `Quality score below threshold: ${dashboardData.summary.avgQualityScore.toFixed(2)}`,
        timestamp: currentTime.toISOString(),
        provider: null,
        resolved: false,
      });
    }

    // Check for high costs
    if (dashboardData.costAnalysis.projectedMonthlyCost > 1000) {
      alerts.push({
        type: 'warning',
        message: `Projected monthly cost is high: $${dashboardData.costAnalysis.projectedMonthlyCost.toFixed(2)}`,
        timestamp: currentTime.toISOString(),
        provider: null,
        resolved: false,
      });
    }

    // Check provider health
    for (const provider of providerStatus) {
      if (!provider.isHealthy) {
        alerts.push({
          type: 'error',
          message: `Provider ${provider.provider} is unhealthy`,
          timestamp: currentTime.toISOString(),
          provider: provider.provider,
          resolved: false,
        });
      }

      if (provider.circuitState === 'OPEN') {
        alerts.push({
          type: 'error',
          message: `Circuit breaker is open for ${provider.provider}`,
          timestamp: currentTime.toISOString(),
          provider: provider.provider,
          resolved: false,
        });
      }
    }

    // Check for high latency
    for (const provider of dashboardData.providerMetrics) {
      if (provider.avgLatency > 2000) {
        alerts.push({
          type: 'warning',
          message: `High latency detected for ${provider.provider}: ${provider.avgLatency.toFixed(0)}ms`,
          timestamp: currentTime.toISOString(),
          provider: provider.provider,
          resolved: false,
        });
      }
    }

    // Sort alerts by severity and timestamp
    alerts.sort((a, b) => {
      const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.type] - severityOrder[b.type];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Build response
    const response = {
      summary: dashboardData.summary,
      providerMetrics: dashboardData.providerMetrics,
      providerStatus,
      costAnalysis: dashboardData.costAnalysis,
      routingAnalysis: dashboardData.routingAnalysis,
      alerts: alerts.slice(0, 10), // Limit to 10 most recent/important alerts
      timestamp: currentTime.toISOString(),
      ...(validatedQuery.includeQuality && { qualityMetrics: dashboardData.qualityMetrics }),
      ...(validatedQuery.includeUsagePatterns && { usagePatterns: dashboardData.usagePatterns }),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in real-time analytics API:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request parameters',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/ai/analytics/real-time:
 *   post:
 *     summary: Record real-time AI metrics
 *     description: Record AI metrics for real-time analytics and monitoring
 *     tags: [AI Analytics]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *               - metrics
 *             properties:
 *               organizationId:
 *                 type: string
 *                 description: Organization ID
 *               metrics:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - requestId
 *                     - provider
 *                     - model
 *                     - operation
 *                     - latency
 *                     - cost
 *                     - success
 *                   properties:
 *                     requestId:
 *                       type: string
 *                       description: Unique request identifier
 *                     provider:
 *                       type: string
 *                       description: AI provider name
 *                     model:
 *                       type: string
 *                       description: AI model name
 *                     operation:
 *                       type: string
 *                       description: Operation type
 *                     latency:
 *                       type: number
 *                       description: Response latency in milliseconds
 *                     cost:
 *                       type: number
 *                       format: float
 *                       description: Request cost in dollars
 *                     success:
 *                       type: boolean
 *                       description: Whether the request was successful
 *                     tokensInput:
 *                       type: number
 *                       description: Input tokens used
 *                     tokensOutput:
 *                       type: number
 *                       description: Output tokens used
 *                     routingDecision:
 *                       type: string
 *                       description: Routing decision made
 *                     fallbackUsed:
 *                       type: boolean
 *                       description: Whether fallback was used
 *                     error:
 *                       type: string
 *                       description: Error message if failed
 *                     responseQuality:
 *                       type: number
 *                       format: float
 *                       description: Response quality score (0-1)
 *     responses:
 *       201:
 *         description: Metrics recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 recordedCount:
 *                   type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */

const metricsSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  metrics: z.array(z.object({
    requestId: z.string().min(1, 'Request ID is required'),
    provider: z.string().min(1, 'Provider is required'),
    model: z.string().min(1, 'Model is required'),
    operation: z.string().min(1, 'Operation is required'),
    latency: z.number().min(0, 'Latency must be non-negative'),
    cost: z.number().min(0, 'Cost must be non-negative'),
    success: z.boolean(),
    tokensInput: z.number().min(0).optional(),
    tokensOutput: z.number().min(0).optional(),
    routingDecision: z.string().optional(),
    fallbackUsed: z.boolean().optional(),
    error: z.string().optional(),
    responseQuality: z.number().min(0).max(1).optional(),
    userId: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  })).min(1, 'At least one metric is required'),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Apply rate limiting
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 1000, // 1000 metrics per minute
    }, 'ai-metrics-record');

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = metricsSchema.parse(body);

    // Transform metrics data
    const metricsData = validatedData.metrics.map(metric => ({
      requestId: metric.requestId,
      provider: metric.provider,
      model: metric.model,
      operation: metric.operation,
      latency: metric.latency,
      cost: metric.cost,
      success: metric.success,
      tokensInput: metric.tokensInput,
      tokensOutput: metric.tokensOutput,
      totalTokens: (metric.tokensInput || 0) + (metric.tokensOutput || 0),
      routingDecision: metric.routingDecision,
      fallbackUsed: metric.fallbackUsed || false,
      error: metric.error,
      responseQuality: metric.responseQuality,
      organizationId: validatedData.organizationId,
      userId: metric.userId || userId,
      metadata: metric.metadata,
    }));

    // Record metrics
    await aiAnalyticsService.recordMetrics(metricsData);

    // Update provider status for each provider
    const providerUpdates = new Map();

    for (const metric of metricsData) {
      if (!providerUpdates.has(metric.provider)) {
        providerUpdates.set(metric.provider, {
          provider: metric.provider,
          isHealthy: true,
          successCount: 0,
          totalCount: 0,
          totalLatency: 0,
        });
      }

      const update = providerUpdates.get(metric.provider);
      update.totalCount++;
      update.totalLatency += metric.latency;

      if (metric.success) {
        update.successCount++;
      } else {
        update.isHealthy = false;
      }
    }

    // Update provider status
    for (const [provider, data] of providerUpdates) {
      const successRate = (data.successCount / data.totalCount) * 100;
      const avgLatency = data.totalLatency / data.totalCount;

      await providerStatusService.updateProviderStatus({
        provider,
        isHealthy: successRate > 90,
        avgLatency,
        successRate,
        requestCount: data.totalCount,
      });
    }

    return NextResponse.json(
      {
        success: true,
        recordedCount: metricsData.length,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error recording metrics:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
