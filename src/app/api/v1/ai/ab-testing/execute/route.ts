import { prisma } from '@/lib/db';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { ABTestManager } from '@/lib/ai/ab-testing/ab-test-manager';

const executeRequestSchema = z.object({
  testId: z.string().min(1)
    .describe("Unique identifier for the A/B test being executed. This test compares different AI providers (Vercel AI SDK vs traditional) to determine optimal performance for specific use cases."),

  userId: z.string().min(1)
    .describe("User identifier who is participating in the A/B test. Used for variant assignment, result tracking, and ensuring consistent test experience across multiple requests."),

  organizationId: z.string().min(1)
    .describe("Organization identifier for A/B test participation. Ensures test results are scoped to the organization and applied to organization-specific AI usage patterns and preferences."),

  task: z.object({
    model: z.string()
      .describe("AI model identifier to use for the task execution. The A/B test framework will route this through either Vercel AI SDK or traditional providers based on the assigned variant."),

    messages: z.array(z.object({
      role: z.enum(['user', 'assistant', 'system'])
        .describe("Message role in the AI conversation for A/B testing."),

      content: z.string()
        .describe("Message content that will be processed by the assigned AI provider variant.")
    }))
      .describe("Array of conversation messages that will be processed by the A/B test. Both variants will receive identical input to ensure fair performance comparison."),

    maxTokens: z.number().optional()
      .describe("Maximum tokens to generate in the AI response. Both test variants use the same limit to ensure comparable output length and cost analysis."),

    temperature: z.number().optional()
      .describe("AI creativity control parameter. Kept consistent across both variants to ensure performance differences are due to provider capabilities, not parameter variations.")
  })
    .describe("AI task configuration that will be executed through the A/B testing framework. Contains all parameters needed to perform identical requests across different AI provider variants.")
});

/**
 * @swagger
 * /api/ai/ab-testing/execute:
 *   post:
 *     summary: Execute an AI task with A/B test tracking
 *     description: Executes an AI task using the assigned variant and tracks performance metrics
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - testId
 *               - userId
 *               - organizationId
 *               - task
 *             properties:
 *               testId:
 *                 type: string
 *                 description: The A/B test ID
 *               userId:
 *                 type: string
 *                 description: The user ID
 *               organizationId:
 *                 type: string
 *                 description: The organization ID
 *               task:
 *                 type: object
 *                 required:
 *                   - model
 *                   - messages
 *                 properties:
 *                   model:
 *                     type: string
 *                     description: The AI model to use
 *                   messages:
 *                     type: array
 *                     items:
 *                       type: object
 *                   maxTokens:
 *                     type: number
 *                     description: Maximum tokens to generate
 *                   temperature:
 *                     type: number
 *                     description: Temperature for generation
 *     responses:
 *       200:
 *         description: Task executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     content:
 *                       type: string
 *                     usage:
 *                       type: object
 *                     provider:
 *                       type: string
 *                 testResult:
 *                   type: object
 *                   properties:
 *                     testId:
 *                       type: string
 *                     variantId:
 *                       type: string
 *                     latency:
 *                       type: number
 *                     tokensUsed:
 *                       type: number
 *                     cost:
 *                       type: number
 *                     success:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: authUserId } = await auth();
    if (!authUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = executeRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { testId, userId, organizationId, task } = validation.data;

    const user = await prisma.user.findFirst({ where: { clerkId: authUserId, deletedAt: null, organization: { deletedAt: null } } });
    if (!user || user.id !== userId || user.organizationId !== organizationId) return NextResponse.json({ error: 'Account does not match request' }, { status: 403 });
    const usageError = await guardUsage(user.organizationId, UsageType.AI_QUERY);
    if (usageError) return usageError;
    const abTestManager = ABTestManager.getInstance();
    const { result, testResult } = await abTestManager.executeWithABTest(
      testId,
      userId,
      organizationId,
      task
    );

    return NextResponse.json({ result, testResult }, { status: testResult.success ? 200 : 503 });
  } catch (error) {
    console.error('Failed to execute with A/B test:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
