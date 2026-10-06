import { AuditCategory, AuditEventType } from '@prisma/client';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { prisma } from '@/lib/db';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';
import { checkRateLimit, rateLimitConfigs } from '@/lib/rate-limit';

function getOpenAI() { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']).describe("Message role: system for instructions, user for questions, assistant for responses"),
    content: z.string().min(1).describe("Message content text")
  })).min(1).describe("Array of messages for the conversation context"),
  model: z.string().default('gpt-4o-mini').describe("OpenAI model to use for response generation"),
  temperature: z.number().min(0).max(2).default(0.3).describe("Creativity level: 0-2, lower is more focused"),
  max_tokens: z.number().min(1).max(4000).default(800).describe("Maximum tokens in response")
}).describe("Schema for AI chat completion requests with conversation context and generation parameters");

/**
 * @swagger
 * /api/v1/ai/chat:
 *   post:
 *     summary: Generate AI responses for document chat
 *     description: Uses OpenAI to generate intelligent responses based on document context and user questions
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
 *               - messages
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - role
 *                     - content
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [system, user, assistant]
 *                       description: Message role in conversation
 *                     content:
 *                       type: string
 *                       description: Message content
 *               model:
 *                 type: string
 *                 default: gpt-4o-mini
 *                 description: OpenAI model to use
 *               temperature:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 2
 *                 default: 0.3
 *                 description: Response creativity level
 *               max_tokens:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 4000
 *                 default: 800
 *                 description: Maximum response length
 *           example:
 *             messages:
 *               - role: system
 *                 content: "You are a document analyst helping users understand government contracts."
 *               - role: user
 *                 content: "What are the key requirements in this solicitation?"
 *             model: "gpt-4o-mini"
 *             temperature: 0.3
 *             max_tokens: 800
 *     responses:
 *       200:
 *         description: AI response generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 choices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       message:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                             example: assistant
 *                           content:
 *                             type: string
 *                             description: AI-generated response
 *                       finish_reason:
 *                         type: string
 *                         example: stop
 *                 usage:
 *                   type: object
 *                   properties:
 *                     prompt_tokens:
 *                       type: number
 *                     completion_tokens:
 *                       type: number
 *                     total_tokens:
 *                       type: number
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: AI service error
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } });
    if (!account) return NextResponse.json({ error: 'Account unavailable' }, { status: 403 });
    const usageError = await guardUsage(account.organizationId, UsageType.AI_QUERY);
    if (usageError) return usageError;

    // Rate limiting for AI requests (prevents cost explosion)
    const rateLimitResult = await checkRateLimit(request, rateLimitConfigs.ai, 'ai-chat');
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: rateLimitConfigs.ai.message,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
          }
        }
      );
    }

    const body = await request.json();
    console.log('🤖 AI Chat request:', {
      userId,
      messageCount: body.messages?.length,
      model: body.model
    });

    // Validate request
    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      console.error('❌ Chat request validation failed:', validation.error.format());
      return NextResponse.json(
        {
          error: 'Invalid request parameters',
          details: validation.error.format()
        },
        { status: 400 }
      );
    }

    const { messages, model, temperature, max_tokens } = validation.data;

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OpenAI API key not configured');
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    // Call OpenAI API
    console.log('🚀 Calling OpenAI API...');
    const completion = await getOpenAI().chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      stream: false
    });

    await UsageTrackingService.trackUsage({ organizationId: account.organizationId, usageType: UsageType.AI_QUERY, quantity: 1, resourceType: 'chat' });

    console.log('✅ OpenAI response received:', {
      choices: completion.choices.length,
      usage: completion.usage
    });

    // Get user organization for audit logging
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true, firstName: true, lastName: true }
    });

    // Log AI operation audit trail
    if (user) {
      try {
        const userPrompt = messages.find(m => m.role === 'user')?.content || 'Chat conversation';
        const assistantResponse = completion.choices[0]?.message?.content || '';

        await crudAuditLogger.logCRUDOperation({ operation: 'CREATE', entityType: 'AIChat', entityId: `chat_${Date.now()}`, entityName: 'AI Chat Interaction',
          currentData: { model, usage: completion.usage }, metadata: { organizationId: user.organizationId, userId: user.id, provider: 'openai', endpoint: '/api/v1/ai/chat', method: 'POST' } }, AuditCategory.AI_SERVICES, AuditEventType.DATA_CREATED);
      } catch (auditError) {
        console.error('Failed to create AI chat audit log:', auditError);
      }
    }

    return NextResponse.json(completion);

  } catch (error) {
    console.error('❌ AI chat error:', error);

    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', {
        status: error.status,
        message: error.message,
        type: error.type
      });

      return NextResponse.json(
        {
          error: 'AI service error',
          details: error.message
        },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
