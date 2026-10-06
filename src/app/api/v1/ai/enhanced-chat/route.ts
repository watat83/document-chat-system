import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import type { UnifiedCompletionRequest, MessageAttachment } from '@/lib/ai/interfaces/types';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { db } from '@/lib/db';
import { z } from 'zod';
import { AuthenticationError, QuotaExceededError, RateLimitError } from '@/lib/ai/interfaces/errors';

// Request validation schema
const enhancedChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system'])
      .describe("Message role in the conversation: 'user' for human input, 'assistant' for AI responses, 'system' for context and instructions that guide AI behavior."),

    content: z.string().min(1).max(200000)
      .describe("Message content containing the actual text. For 'user' messages, this is the question or prompt. For 'assistant', it's the AI response. For 'system', it provides context about government contracting requirements."),

    attachments: z.array(z.object({
      type: z.enum(['image', 'file', 'pdf'])
        .describe("Type of attachment: 'image' for image analysis, 'file' for generic document processing, 'pdf' for PDF document processing"),

      data: z.string().max(28000000)
        .describe("Base64 encoded file data for processing"),

      url: z.string().optional()
        .describe("URL to the file for processing"),

      name: z.string()
        .describe("Original filename of the attachment"),

      mimeType: z.string()
        .describe("MIME type of the attachment (e.g., 'image/jpeg', 'application/pdf')"),

      size: z.number().optional()
        .describe("File size in bytes"),

      detail: z.enum(['low', 'high', 'auto']).optional().default('auto')
        .describe("Image detail level for vision models: 'low' for basic analysis, 'high' for detailed analysis, 'auto' for automatic selection"),

      pdfEngine: z.enum(['pdf-text', 'mistral-ocr', 'native']).optional().default('pdf-text')
        .describe("PDF processing engine: 'pdf-text' for structured PDFs (free), 'mistral-ocr' for scanned documents ($2/1000 pages), 'native' for models with native file support"),

      annotations: z.any().optional()
        .describe("File annotations from previous processing to avoid re-parsing costs")
    })).max(10).optional()
      .describe("Array of file attachments for multimodal processing including image analysis and PDF document processing"),

    id: z.string().optional()
      .describe("Unique identifier for the message. Used for tracking, editing, and referencing specific parts of the conversation history."),

    name: z.string().optional()
      .describe("Optional name identifier for the message sender. Can be used to distinguish between different users or AI agents in multi-participant conversations.")
  })).min(1).max(100)
    .describe("Array of conversation messages forming the chat history. Must contain at least one message. The AI uses this complete context to generate relevant responses for government contracting discussions."),

  model: z.string().default('gpt-4o-mini')
    .describe("AI model identifier to use for chat completion. Default 'gpt-4o-mini' provides cost-effective responses. Other options include 'gpt-4o' for higher quality or 'claude-3-sonnet' for specialized analysis. Use 'auto' for automatic model selection."),

  provider: z.string().optional()
    .describe("AI provider to use for the request. Options include 'openai', 'anthropic', 'google'. Use 'auto' for automatic provider selection based on the task requirements."),

  useVercelOptimized: z.boolean().optional().default(false)
    .describe("Enable Vercel AI SDK optimization for enhanced streaming performance and modern AI features. When true, uses Vercel's optimized providers instead of the traditional multi-provider system."),

  organizationId: z.string().nullable().optional()
    .describe("Organization identifier for access control, usage tracking, and applying organization-specific AI settings. Null for demo mode or public access. Required for production usage with cost tracking."),

  streamingEnabled: z.boolean().optional().default(true)
    .describe("Enable real-time streaming of AI responses. When true, responses are delivered incrementally as they're generated, providing immediate feedback and better user experience for longer responses."),

  temperature: z.number().min(0).max(2).optional().default(0.7)
    .describe("AI creativity and randomness control. 0 = deterministic/focused responses, 0.7 = balanced creativity, 2 = highly creative/varied responses. Lower values better for factual government contract analysis."),

  maxTokens: z.number().min(1).max(4000).optional().default(1000)
    .describe("Maximum number of tokens (roughly words) to generate in the AI response. Limits response length and controls costs. 1000 tokens ≈ 750 words, suitable for detailed explanations."),

  plugins: z.array(z.object({
    id: z.string()
      .describe("Plugin identifier (e.g., 'file-parser')"),

    pdf: z.object({
      engine: z.enum(['pdf-text', 'mistral-ocr', 'native']).optional().default('pdf-text')
        .describe("PDF processing engine: 'pdf-text' for structured PDFs (free), 'mistral-ocr' for scanned documents ($2/1000 pages), 'native' for models with native file support")
    }).optional()
      .describe("PDF processing configuration")
  })).optional()
    .describe("OpenRouter plugin configuration for file processing"),

  options: z.object({
    webSearch: z.object({
      enabled: z.boolean().optional().default(false)
        .describe("Enable web search for real-time information retrieval"),
      max_results: z.number().min(1).max(20).optional().default(5)
        .describe("Maximum number of web search results to include (1-20)"),
      search_depth: z.enum(['basic', 'advanced']).optional().default('basic')
        .describe("Search depth: 'basic' for quick results, 'advanced' for comprehensive search")
    }).optional()
      .describe("Web search configuration for real-time information retrieval")
  }).optional()
    .describe("Additional options for AI request processing including web search capabilities")
});

/** Compatibility JSON endpoint; provider failures are always reported as failures. */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const user = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true, organizationId: true } });
  if (!user) return Response.json({ success: false, error: 'Account unavailable' }, { status: 403 });
  try {
    const parsed = enhancedChatSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ success: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    const usageError = await guardUsage(user.organizationId, UsageType.AI_QUERY);
    if (usageError) return usageError;
    const body = parsed.data;
    const messages = body.messages.map(message => ({
      role: message.role, content: message.content,
      attachments: message.attachments?.map((attachment): MessageAttachment => {
        if (attachment.type === 'image') return { type: 'image', data: attachment.data, mimeType: attachment.mimeType, detail: attachment.detail };
        return { type: attachment.type, data: attachment.data, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, metadata: { engine: attachment.pdfEngine, annotations: attachment.annotations } };
      }),
    }));
    const completion: UnifiedCompletionRequest = {
      signal: request.signal,
      messages, model: body.model === 'auto' ? 'balanced' : body.model,
      temperature: body.temperature, maxTokens: body.maxTokens,
      options: { ...body.options, plugins: body.plugins },
      metadata: { organizationId: user.organizationId, userId: user.id, provider: body.provider === 'auto' ? undefined : body.provider },
    };
    const response = await AIServiceManager.getInstance().generateCompletion(completion);
    return Response.json({
      success: true, content: response.content, model: response.model, usage: response.usage,
      citations: response.metadata.citations ?? [], annotations: response.metadata.annotations ?? [], metadata: response.metadata,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    const status = error instanceof AuthenticationError ? 502 : error instanceof QuotaExceededError || error instanceof RateLimitError ? 429 : 503;
    console.error('Enhanced chat request failed', error instanceof Error ? error.name : 'Unknown error');
    return Response.json({ success: false, error: 'AI service unavailable. Please try again later.', code: 'AI_SERVICE_UNAVAILABLE' }, { status });
  }
}
