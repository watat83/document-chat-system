import { checkRateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { UsageTrackingService } from '@/lib/usage-tracking';
import type { SearchFilters } from '@/lib/ai/services/vector-search';
import { defaultVectorSearch } from '@/lib/ai/services/vector-search';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';

const documentChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system'])
      .describe("Message role in document-based conversation: 'user' asks questions about documents, 'assistant' provides answers based on document content, 'system' contains document context and analysis instructions."),

    content: z.string()
      .describe("Message content for document-based chat. User messages should reference specific document sections, requirements, or ask analysis questions. Assistant responses include document-grounded answers with relevant citations.")
  }))
    .describe("Conversation history for document-based chat. The AI uses both the conversation context and document content to provide accurate, grounded responses about government solicitations, amendments, and requirements."),

  documentId: z.string().optional()
    .describe("Specific document ID to focus the chat on. When provided, the AI will prioritize this document's content in responses. If not provided, the chat considers all uploaded documents in the organization's context."),

  documentContext: z.object({
    mode: z.enum(['all-documents', 'current-folder', 'selected-documents'])
      .describe("Document scope mode for the chat context"),
    folderId: z.string().optional()
      .describe("Folder ID when mode is 'current-folder'"),
    folderName: z.string().optional()
      .describe("Folder name for display purposes"),
    documentIds: z.array(z.string()).optional()
      .describe("Document IDs when mode is 'selected-documents'"),
    documentCount: z.number().optional()
      .describe("Total number of documents in the current scope")
  }).optional()
    .describe("Document context scope for multi-document chat. Allows filtering chat to specific folders or document selections."),

  organizationId: z.string()
    .describe("Organization identifier required for document access control and ensuring the AI only references documents that belong to this organization. Critical for multi-tenant security and compliance."),

  useVercelOptimized: z.boolean().default(true)
    .describe("Enable Vercel AI SDK for optimized document analysis and chat responses. Provides enhanced RAG (Retrieval Augmented Generation) capabilities and better streaming performance for document-based conversations."),

  streamingEnabled: z.boolean().default(true)
    .describe("Enable real-time streaming of document analysis responses. Particularly useful for complex document analysis that may take longer to process, providing immediate feedback as the AI analyzes and responds."),

  model: z.string().optional()
    .describe("AI model for document analysis and chat. Defaults to organization preferences. Models like 'claude-3-sonnet' excel at document analysis, while 'gpt-4o' provides balanced performance for government contract documents."),

  temperature: z.number().min(0).max(2).optional()
    .describe("Response creativity control for document-based chat. Lower values (0-0.3) recommended for factual document analysis and compliance checking. Higher values (0.7-1.0) for creative interpretation and strategic insights."),

  maxTokens: z.number().int().min(1).max(8000).optional()
    .describe("Maximum response length for document chat. Longer responses may be needed for comprehensive document analysis, opportunity summaries, and detailed requirement breakdowns. Defaults to model-appropriate limits.")
});

async function getDocumentContext(documentId: string, organizationId: string, internalUserId: string) {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId,
      deletedAt: null
    },
    select: {
      id: true,
      name: true,
      extractedText: true,
      summary: true,
      mimeType: true
    }
  });

  if (!document) {
    throw new Error('Document not found or not yet processed');
  }

  return document;
}

async function getMultipleDocumentsContext(
  documentContext: NonNullable<z.infer<typeof documentChatSchema>['documentContext']>,
  organizationId: string,
  internalUserId: string
) {
  const whereClause: Record<string, any> = {
    organizationId,
    deletedAt: null
  };

  // Add specific filters based on context mode
  switch (documentContext.mode) {
    case 'current-folder':
      if (!documentContext.folderId) throw new Error('Folder selection required');
      whereClause.folderId = documentContext.folderId;
      break;

    case 'selected-documents':
      whereClause.id = { in: documentContext.documentIds ?? [] };
      break;

    // 'all-documents' - no additional filters needed
  }

  const documents = await prisma.document.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      extractedText: true,
      summary: true,
      mimeType: true
    },
    orderBy: { updatedAt: 'desc' }
  });

  return documents;
}

interface DocumentData {
  id: string;
  name: string;
  extractedText: string | null;
  summary: string | null;
  mimeType: string;
}

function buildDocumentSystemPrompt(document: DocumentData): string {
  return `You are an AI assistant specialized in analyzing and discussing documents. You are currently analyzing a document with the following details:

Document: ${document.name}
Type: ${document.mimeType}
Summary: ${document.summary || 'No summary available'}

Content:
${document.extractedText}

Instructions:
1. Answer questions based ONLY on the content of this specific document
2. If asked about something not in the document, clearly state that the information is not available in this document
3. Provide specific quotes or references when possible
4. Be helpful and thorough in your analysis
5. If the user asks about government contracting aspects, focus on relevant details from the document
6. Maintain a professional tone suitable for business and government contracting contexts

Remember: You can only reference information that is explicitly contained in the document content provided above.`;
}

function buildMultiDocumentSystemPrompt(documents: DocumentData[], documentContext: NonNullable<z.infer<typeof documentChatSchema>['documentContext']>): string {
  const contextDescription = documentContext.mode === 'current-folder'
    ? `documents from the "${documentContext.folderName}" folder`
    : documentContext.mode === 'selected-documents'
    ? `${documents.length} selected documents`
    : `all ${documents.length} documents in your account`;

  const documentList = documents.slice(0, 50).map((doc, index) =>
    `${index + 1}. ${doc.name} (${doc.mimeType})`
  ).join('\n');

  return `You are an AI assistant specialized in analyzing and discussing documents. You have access to ${contextDescription}.

Documents available:
${documentList}
${documents.length > 50 ? "Additional documents are included in semantic retrieval." : ""}

Instructions:
1. Answer questions by searching across ALL available documents
2. When providing information, ALWAYS cite which document(s) it comes from
3. If information is found in multiple documents, synthesize and compare the findings
4. If asked about something not in any document, clearly state that the information is not available
5. Provide specific quotes or references with document names when possible
6. For government contracting questions, focus on relevant details across all documents
7. Maintain a professional tone suitable for business and government contracting contexts

When the user asks a question, I will perform a semantic search across these documents and provide you with the most relevant excerpts to answer their question.`;
}

async function performDocumentSearch(
  query: string,
  documentContext: NonNullable<z.infer<typeof documentChatSchema>['documentContext']>,
  organizationId: string,
  loadedDocuments: DocumentData[]
) {
  try {
    // Build search filters based on document context
    const searchFilters: SearchFilters = {
      organizationId
    };

    searchFilters.documentIds = loadedDocuments.map(d => d.id);
    if (!searchFilters.documentIds.length) return [];


    console.log(`🔍 [Document Search] Performing semantic search:`, {
      query: query.substring(0, 100) + '...',
      mode: documentContext.mode,
      searchFilters,
      documentCount: loadedDocuments.length
    });

    // Perform semantic search
    const searchResults = await defaultVectorSearch.searchSimilar(
      query,
      searchFilters,
      {
        topK: 5,
        minScore: 0.3,
        includeMetadata: true,
        rerank: true
      }
    );

    console.log(`✅ [Document Search] Found ${searchResults.length} search results:`,
      searchResults.map(r => ({
        documentTitle: r.documentTitle,
        score: r.score,
        chunkText: r.chunkText.substring(0, 100) + '...'
      }))
    );

    return searchResults;
  } catch (error) {
    console.error('Document search error:', error);
    throw new Error('Document retrieval is temporarily unavailable. Please retry.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = documentChatSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const {
      messages,
      documentId,
      documentContext,
      organizationId,
      useVercelOptimized,
      streamingEnabled,
      model = 'gpt-4o',
      temperature = 0.7,
      maxTokens = 2000
    } = validation.data;

    // Verify user access to organization
    const userOrg = await prisma.user.findFirst({
      where: {
        clerkId: userId,
        organizationId, deletedAt: null
      }
    });

    if (!userOrg) {
      return NextResponse.json(
        { error: 'Access denied to organization' },
        { status: 403 }
      );
    }

    const rateLimit = await checkRateLimit(request, rateLimitConfigs.ai, 'document-chat');
    if (!rateLimit.success) return NextResponse.json({ error: 'Please try again later' }, { status: 429 });
    const usageError = await guardUsage(userOrg.organizationId, UsageType.AI_QUERY);
    if (usageError) return usageError;

    // Get document context based on scope
    let documents: DocumentData[] = [];
    let enhancedMessages = [...messages];
    let systemPrompt = '';

    // Handle new document context (multi-document)
    if (documentContext) {
      try {
        documents = await getMultipleDocumentsContext(documentContext, organizationId, userOrg.id);

        console.log(`📚 [Document Chat] Loaded ${documents.length} documents for context:`, {
          mode: documentContext.mode,
          documentIds: documents.map(d => ({ id: d.id, name: d.name }))
        });

        if (documents.length === 0) {
          return NextResponse.json(
            { error: 'No documents found in the specified context' },
            { status: 404 }
          );
        }

        // Build multi-document system prompt
        systemPrompt = buildMultiDocumentSystemPrompt(documents, documentContext);

        // For multi-document chat, perform semantic search on the last user message
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (lastUserMessage) {
          const searchResults = await performDocumentSearch(
            lastUserMessage.content,
            documentContext,
            organizationId,
            documents
          );

          // Add search results to the system prompt
          if (searchResults.length > 0) {
            const searchContext = searchResults
              .map((result, idx) =>
                `\n[Search Result ${idx + 1} from "${result.documentTitle}"]\n${result.chunkText}\n`
              )
              .join('\n---\n');

            systemPrompt += `\n\nRelevant excerpts found for the user's question:\n${searchContext}`;
          }
        }

        enhancedMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...messages
        ];
      } catch {
        return NextResponse.json(
          { error: 'Document context or retrieval unavailable. Please retry.' },
          { status: 503 }
        );
      }
    }
    // Handle legacy single document ID
    else if (documentId) {
      try {
        const document = await getDocumentContext(documentId, organizationId, userOrg.id);
        documents = [document];

        // Add document context as system message
        systemPrompt = buildDocumentSystemPrompt(document);
        enhancedMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...messages
        ];
      } catch {
        return NextResponse.json(
          { error: 'Document context or retrieval unavailable. Please retry.' },
          { status: 503 }
        );
      }
    }

    // Initialize usage tracking
    const startTime = Date.now();

    if (useVercelOptimized && streamingEnabled) {
      // Use Vercel AI SDK for optimized streaming

      // Select model provider
      let aiModel;
      if (model.startsWith('gpt-')) {
        aiModel = openai(model);
      } else if (model.startsWith('claude-')) {
        aiModel = anthropic(model);
      } else {
        return NextResponse.json({ error: 'Choose an OpenAI GPT or Anthropic Claude model for document chat' }, { status: 400 });
      }

      try {
        const result = await streamText({
          model: aiModel,
          messages: enhancedMessages,
          temperature,
          maxTokens,
          abortSignal: request.signal,
          onEnd: async (completion) => {
            // Track usage after completion
            const endTime = Date.now();
            const latency = endTime - startTime;

            await UsageTrackingService.trackAIQueryUsage(
              organizationId,
              'document_chat_stream',
              completion.usage?.totalTokens || 0
            );

            // Log audit trail for document chat interaction
            const userPrompt = messages.filter(m => m.role === 'user').pop()?.content || 'Document chat conversation';
            const assistantResponse = completion.text || '';
            const documentNames = documents.map(d => d.name).join(', ');

            await crudAuditLogger.logAIOperation(
              'CREATE',
              `document_chat_${Date.now()}`,
              `Document Chat: ${userPrompt.substring(0, 100)}`,
              'Document chat',
              0,
              model,
              {
                model,
                temperature,
                maxTokens,
                documentIds: documents.map(d => d.id),
                documentNames,
                contextMode: documentContext?.mode || 'single-document',
                prompt: userPrompt.substring(0, 500), // Truncate for storage
                response: assistantResponse.substring(0, 500), // Truncate for storage
                tokensUsed: completion.usage?.totalTokens || 0,
                latencyMs: latency
              }
            );
          }
        });

        // Convert to SSE format that the client expects
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();

            try {
              for await (const chunk of result.textStream) {
                const sseData = {
                  model: model,
                  choices: [{
                    delta: {
                      content: chunk
                    }
                  }]
                };

                const sseMessage = `data: ${JSON.stringify(sseData)}\n\n`;
                controller.enqueue(encoder.encode(sseMessage));
              }

              // Send completion signal
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (error) {
              console.error('Streaming error:', error);
              controller.error(error);
            }
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        });

      } catch (error) {
        console.error('Vercel AI streaming error:', error);

        // Track failure
        await UsageTrackingService.trackAIQueryUsage(
          organizationId,
          'document_chat_stream_error',
          0
        );

        return NextResponse.json(
          { error: 'Failed to generate response' },
          { status: 500 }
        );
      }
    } else {
      // Use our existing AI service manager for non-streaming or fallback
      try {
        const aiService = AIServiceManager.getInstance();

        const response = await aiService.generateCompletion({
          messages: enhancedMessages,
          model,
          temperature,
          maxTokens,
        });

        // Track usage
        const endTime = Date.now();
        const latency = endTime - startTime;

        await UsageTrackingService.trackAIQueryUsage(
          organizationId,
          'document_chat',
          response.usage?.totalTokens || 0
        );

        // Log audit trail for document chat interaction
        const userPrompt = messages.filter(m => m.role === 'user').pop()?.content || 'Document chat conversation';
        const assistantResponse = response.content || '';
        const documentNames = documents.map(d => d.name).join(', ');

        await crudAuditLogger.logAIOperation(
          'CREATE',
          `document_chat_${Date.now()}`,
          `Document Chat: ${userPrompt.substring(0, 100)}`,
          'Document chat',
          0,
          model,
          {
            model,
            temperature,
            maxTokens,
            documentIds: documents.map(d => d.id),
            documentNames,
            contextMode: documentContext?.mode || 'single-document',
            prompt: userPrompt.substring(0, 500), // Truncate for storage
            response: assistantResponse.substring(0, 500), // Truncate for storage
            tokensUsed: response.usage?.totalTokens || 0,
            latencyMs: latency
          }
        );

        return NextResponse.json({
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: response.content,
          usage: response.usage,
          metadata: {
            documentId,
            documentName: documents[0]?.name,
            latency,
            provider: response.metadata?.provider
          }
        });

      } catch (error) {
        console.error('Custom AI service error:', error);

        // Track failure
        await UsageTrackingService.trackAIQueryUsage(
          organizationId,
          'document_chat_error',
          0
        );

        return NextResponse.json(
          { error: 'Failed to generate response' },
          { status: 500 }
        );
      }
    }

  } catch (error) {
    console.error('Document chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateCost(model: string, totalTokens: number): number {
  // Simplified cost calculation - in production this would be more sophisticated
  const costs: Record<string, number> = {
    'gpt-4o': 0.03 / 1000, // $0.03 per 1K tokens (average of input/output)
    'gpt-4': 0.045 / 1000,
    'gpt-3.5-turbo': 0.002 / 1000,
    'claude-3-opus': 0.075 / 1000,
    'claude-3-sonnet': 0.015 / 1000,
    'claude-3-haiku': 0.00125 / 1000
  };

  const costPerToken = costs[model] || costs['gpt-4o'];
  return totalTokens * costPerToken;
}
