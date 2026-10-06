import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/models';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { prisma } from '@/lib/db';
import { canAccessDocument } from '@/lib/security/access-policy';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';

const generateRequestSchema = z.object({
  type: z.enum(['proposal', 'strategy', 'analysis', 'summary', 'custom'])
    .describe("Type of government contracting content to generate. 'proposal' creates compelling bid responses, 'strategy' develops competitive approaches, 'analysis' provides data-driven insights, 'summary' condenses complex information, 'custom' follows specific user instructions."),

  prompt: z.string().min(1)
    .describe("Detailed user prompt describing the specific content to generate. Should provide clear context about the government opportunity, requirements, and desired outcomes. The AI will use this as the primary instruction for content creation."),

  organizationId: z.string().min(1)
    .describe("Unique identifier for the organization requesting content generation. Used for access control, usage tracking, cost attribution, and applying organization-specific AI preferences and budget limits."),

  documents: z.array(z.string()).optional()
    .describe("Array of document IDs to include as context for content generation. These documents (solicitations, amendments, past performance examples) will be analyzed and referenced to create more accurate and relevant content."),

  requirements: z.object({
    length: z.enum(['short', 'medium', 'long']).optional()
      .describe("Desired content length: 'short' (200-400 words), 'medium' (400-800 words), 'long' (800-1500 words). Affects response depth, detail level, and processing time."),

    tone: z.enum(['professional', 'casual', 'technical']).optional()
      .describe("Writing tone for the generated content: 'professional' uses formal business language, 'casual' is conversational but business-appropriate, 'technical' includes detailed regulatory and industry terminology."),

    format: z.enum(['paragraph', 'bullets', 'outline', 'report']).optional()
      .describe("Content structure format: 'paragraph' creates flowing text, 'bullets' uses lists and points, 'outline' creates hierarchical structure, 'report' formats as formal business document with sections."),

    includeData: z.boolean().optional()
      .describe("Whether to include relevant statistics, market data, historical information, and quantitative support in the generated content. Enhances credibility for government proposals."),

    includeCitations: z.boolean().optional()
      .describe("Whether to include proper references to federal regulations (FAR, CFR), industry standards, and government publications. Essential for compliance and credibility in government contracting."),
  }).optional()
    .describe("Content generation requirements that control output format, style, length, and inclusion of data/citations. All fields are optional with intelligent defaults based on content type."),

  provider: z.enum(['vercel', 'traditional']).optional()
    .describe("AI provider preference: 'vercel' uses Vercel AI SDK for enhanced streaming and modern features, 'traditional' uses the established multi-provider system. Used for A/B testing and performance optimization."),

  streaming: z.boolean().optional().default(true)
    .describe("Enable real-time streaming of generated content. When true, content is delivered incrementally as it's generated, providing immediate feedback and allowing user interaction (pause/resume). Improves user experience for longer content.")
});

/**
 * @swagger
 * /api/ai/generate-content:
 *   post:
 *     summary: Generate enhanced content with AI
 *     description: Generate high-quality content for government contracting with real-time streaming
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
 *               - type
 *               - prompt
 *               - organizationId
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [proposal, strategy, analysis, summary, custom]
 *                 description: Type of content to generate
 *               prompt:
 *                 type: string
 *                 description: User prompt for content generation
 *               organizationId:
 *                 type: string
 *                 description: Organization ID for context
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document IDs for additional context
 *               requirements:
 *                 type: object
 *                 properties:
 *                   length:
 *                     type: string
 *                     enum: [short, medium, long]
 *                   tone:
 *                     type: string
 *                     enum: [professional, casual, technical]
 *                   format:
 *                     type: string
 *                     enum: [paragraph, bullets, outline, report]
 *                   includeData:
 *                     type: boolean
 *                   includeCitations:
 *                     type: boolean
 *               provider:
 *                 type: string
 *                 enum: [vercel, traditional]
 *                 description: AI provider to use
 *               streaming:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to stream the response
 *     responses:
 *       200:
 *         description: Content generated successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               description: Generated content (streamed)
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                 usage:
 *                   type: object
 *                 provider:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = generateRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const {
      type,
      prompt,
      organizationId,
      documents,
      requirements,
      provider = 'vercel',
      streaming
    } = validation.data;

    const user = await prisma.user.findFirst({ where: { clerkId: userId, organizationId, deletedAt: null, organization: { deletedAt: null } } });
    if (!user) return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
    const usageError = await guardUsage(user.organizationId, UsageType.AI_QUERY);
    if (usageError) return usageError;
    const contextDocuments = documents?.length ? await prisma.document.findMany({ where: { id: { in: documents }, organizationId: user.organizationId, deletedAt: null } }) : [];
    if (new Set(documents ?? []).size !== contextDocuments.length || contextDocuments.some(document => !canAccessDocument(user, document, 'READ'))) {
      return NextResponse.json({ error: 'Document access denied' }, { status: 403 });
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(type, requirements);

    // Build user prompt with context
    const userPrompt = buildUserPrompt(type, prompt) + contextDocuments.map(document =>
      `\n\nDocument: ${document.name}\n${document.extractedText ?? ''}`
    ).join('');

    // Determine max tokens based on length requirement
    const maxTokens = getMaxTokensForLength(requirements?.length || 'medium');

    if (provider === 'vercel' && streaming) {
      // Use Vercel AI SDK for streaming response
      const result = streamText({
        model: myProvider.languageModel('chat-model'),
        instructions: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: maxTokens,
        abortSignal: request.signal,
        temperature: type === 'analysis' ? 0.3 : 0.7,
        onEnd: async completion => {
          if (request.signal.aborted || completion.finishReason === 'error') return;
          await UsageTrackingService.trackUsage({ organizationId: user.organizationId, userId: user.id, usageType: UsageType.AI_QUERY, quantity: 1,
            resourceType: 'content_generation', metadata: { totalTokens: completion.totalUsage.totalTokens, type } });
        },
      });

      // Return streaming response
      return result.toTextStreamResponse({
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-AI-Provider': 'vercel',
          'X-Content-Type': type
        }
      });
    } else {
      // Use traditional AI service for non-streaming or traditional provider
      const aiService = AIServiceManager.getInstance();

      const result = await aiService.generateCompletion({
        model: 'fast',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        maxTokens,
        temperature: type === 'analysis' ? 0.3 : 0.7,
        metadata: { organizationId: user.organizationId, userId: user.id, taskType: 'content_generation' },
        signal: request.signal,
      });

      return NextResponse.json({
        content: result.content,
        usage: result.usage,
        provider: 'traditional',
        type
      });
    }
  } catch (error) {
    console.error('Content generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}

function buildSystemPrompt(
  type: string,
  requirements?: any
): string {
  const basePrompt = `You are an expert government contracting advisor and content strategist. Generate high-quality, professional content that helps contractors succeed in government markets.

Your expertise includes:
- Federal acquisition regulations (FAR)
- Government contracting best practices
- Proposal writing and strategy development
- Compliance and regulatory requirements
- Market analysis and competitive intelligence`;

  // Content type specific instructions
  const typeInstructions = {
    proposal: "Focus on creating compelling, compliant proposal content that addresses government requirements and demonstrates contractor capabilities.",
    strategy: "Develop strategic approaches that maximize win probability while ensuring compliance and competitive differentiation.",
    analysis: "Provide objective, data-driven analysis with actionable insights for government contracting decisions.",
    summary: "Create concise, accurate summaries that capture key information and decision points.",
    custom: "Follow the user's specific instructions while maintaining professional government contracting context."
  };

  let prompt = `${basePrompt}\n\n${typeInstructions[type as keyof typeof typeInstructions] || typeInstructions.custom}`;

  if (requirements) {
    const { length, tone, format, includeData, includeCitations } = requirements;

    // Length requirements
    const lengthGuide = {
      short: "\n\nLength: Keep response concise and focused (200-400 words). Prioritize the most critical information.",
      medium: "\n\nLength: Provide comprehensive coverage (400-800 words) with balanced detail and clarity.",
      long: "\n\nLength: Create detailed, thorough content (800-1500 words) with extensive analysis and supporting information."
    };

    // Tone requirements
    const toneGuide = {
      professional: "\n\nTone: Use formal, professional language appropriate for government business communications. Maintain authoritative voice.",
      casual: "\n\nTone: Use clear, accessible language while maintaining professionalism. Be conversational but business-appropriate.",
      technical: "\n\nTone: Use precise technical terminology and detailed explanations. Include specific regulatory and industry language."
    };

    // Format requirements
    const formatGuide = {
      paragraph: "\n\nFormat: Structure as flowing paragraphs with clear topic sentences and smooth transitions between ideas.",
      bullets: "\n\nFormat: Use bullet points, numbered lists, and clear formatting for maximum readability and actionability.",
      outline: "\n\nFormat: Create a structured outline with hierarchical headers, sub-points, and logical organization.",
      report: "\n\nFormat: Format as a formal business report with executive summary, sections, subsections, and conclusions."
    };

    if (length) prompt += lengthGuide[length as keyof typeof lengthGuide];
    if (tone) prompt += toneGuide[tone as keyof typeof toneGuide];
    if (format) prompt += formatGuide[format as keyof typeof formatGuide];

    if (includeData) {
      prompt += "\n\nData Requirements: Include relevant statistics, market data, historical information, and quantitative support where applicable.";
    }

    if (includeCitations) {
      prompt += "\n\nCitations: Include proper references to regulations, industry sources, and government publications where appropriate.";
    }
  }

  return prompt;
}

function buildUserPrompt(
  type: string,
  prompt: string,
): string {
  let fullPrompt = prompt;

  // Add type-specific context
  const typeContext = {
    proposal: "\n\nGenerate proposal content that addresses the opportunity requirements, demonstrates our capabilities, and differentiates us from competitors.",
    strategy: "\n\nDevelop a winning strategy that considers market dynamics, competition, pricing, and our unique value proposition.",
    analysis: "\n\nProvide analytical insights that inform decision-making and strategic planning for this opportunity or market.",
    summary: "\n\nSummarize the key points, requirements, deadlines, and action items from the provided information.",
    custom: ""
  };

  fullPrompt += typeContext[type as keyof typeof typeContext] || "";

  return fullPrompt;
}

function getMaxTokensForLength(length: string): number {
  const limits = {
    short: 600,    // ~400 words
    medium: 1200,  // ~800 words
    long: 2000     // ~1500 words
  };
  return limits[length as keyof typeof limits] || 1200;
}
