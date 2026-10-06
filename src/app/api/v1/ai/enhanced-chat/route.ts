import { guardUsage } from '@/lib/billing/usage-guard';
import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { getAuth } from '@clerk/nextjs/server';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { z } from 'zod';
import { 
  QuotaExceededError,
  RateLimitError,
  AuthenticationError,
  ProviderUnavailableError,
  NetworkError,
  ProviderConfigurationError,
  isAIServiceError
} from '@/lib/ai/interfaces/errors';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { db } from '@/lib/db';

// Request validation schema
const enhancedChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system'])
      .describe("Message role in the conversation: 'user' for human input, 'assistant' for AI responses, 'system' for context and instructions that guide AI behavior."),
    
    content: z.string().min(1)
      .describe("Message content containing the actual text. For 'user' messages, this is the question or prompt. For 'assistant', it's the AI response. For 'system', it provides context about government contracting requirements."),
    
    attachments: z.array(z.object({
      type: z.enum(['image', 'file', 'pdf'])
        .describe("Type of attachment: 'image' for image analysis, 'file' for generic document processing, 'pdf' for PDF document processing"),
      
      data: z.string().optional()
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
    })).optional()
      .describe("Array of file attachments for multimodal processing including image analysis and PDF document processing"),
    
    id: z.string().optional()
      .describe("Unique identifier for the message. Used for tracking, editing, and referencing specific parts of the conversation history."),
    
    name: z.string().optional()
      .describe("Optional name identifier for the message sender. Can be used to distinguish between different users or AI agents in multi-participant conversations.")
  })).min(1)
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

type EnhancedChatRequest = z.infer<typeof enhancedChatSchema>;

/**
 * Helper function to get organization ID from authenticated user
 */
async function getOrganizationId(userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }
  
  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true }
    });
    
    return user?.organizationId || null;
  } catch (error) {
    console.warn('Failed to get organization ID for user:', userId, error);
    return null;
  }
}

/**
 * Track usage for AI calls and document processing
 */
async function trackUsageForRequest(
  organizationId: string | null,
  messages: any[],
  response: any
): Promise<void> {
  if (!organizationId) {
    console.log('Skipping usage tracking: no organization ID');
    return;
  }

  try {
    // Track AI query usage (always 1 per request)
    await UsageTrackingService.trackUsage({
      organizationId,
      usageType: UsageType.AI_QUERY,
      quantity: 1,
      resourceType: 'enhanced_chat',
      metadata: {
        model: response.model || 'unknown',
        provider: response.metadata?.provider || 'unknown',
        tokens: response.usage?.totalTokens || 0,
        hasAttachments: messages.some((msg: any) => msg.attachments?.length > 0)
      }
    });

    // Track document processing usage if attachments were processed
    const hasDocuments = messages.some((msg: any) => 
      msg.attachments?.some((att: any) => att.type === 'pdf' || att.type === 'file')
    );

    if (hasDocuments) {
      const documentCount = messages.reduce((count: number, msg: any) => {
        return count + (msg.attachments?.filter((att: any) => 
          att.type === 'pdf' || att.type === 'file'
        ).length || 0);
      }, 0);

      await UsageTrackingService.trackUsage({
        organizationId,
        usageType: UsageType.DOCUMENT_PROCESSING,
        quantity: documentCount,
        resourceType: 'document_analysis',
        metadata: {
          model: response.model || 'unknown',
          provider: response.metadata?.provider || 'unknown',
          documentTypes: messages.flatMap((msg: any) => 
            msg.attachments?.filter((att: any) => att.type === 'pdf' || att.type === 'file')
              .map((att: any) => att.type) || []
          )
        }
      });

      console.log(`📄 Tracked document processing usage: ${documentCount} documents for org ${organizationId}`);
    }

    // Track API call usage
    await UsageTrackingService.trackUsage({
      organizationId,
      usageType: UsageType.API_CALL,
      quantity: 1,
      resourceType: 'enhanced_chat_api',
      metadata: {
        endpoint: '/api/v1/ai/enhanced-chat',
        method: 'POST',
        hasDocuments,
        messageCount: messages.length
      }
    });

    console.log(`✅ Usage tracking completed for org ${organizationId}`);
  } catch (error) {
    console.error('Failed to track usage:', error);
    // Don't throw - usage tracking failures shouldn't break the API
  }
}

/**
 * Convert AI service errors to user-friendly API responses
 */
function handleAIServiceError(error: Error): Response {
  if (isAIServiceError(error)) {
    switch (true) {
      case error instanceof QuotaExceededError:
        return Response.json({
          success: false,
          error: 'AI service quota exceeded',
          code: 'QUOTA_EXCEEDED',
          message: error.provider === 'anthropic' 
            ? 'Your Anthropic credit balance is too low. Please visit the Anthropic Console to add credits to your account.'
            : 'Service quota has been exceeded. Please try again later or upgrade your plan.',
          details: {
            provider: error.provider,
            quotaType: 'credit_balance'
          }
        }, { status: 402 }); // Payment Required
        
      case error instanceof RateLimitError:
        return Response.json({
          success: false,
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests to ${error.provider}. Please wait before trying again.`,
          details: {
            provider: error.provider,
            retryAfter: error.retryAfter
          }
        }, { status: 429 });
        
      case error instanceof AuthenticationError:
        return Response.json({
          success: false,
          error: 'Authentication failed',
          code: 'AUTHENTICATION_ERROR',
          message: error.provider 
            ? `Invalid API key for ${error.provider}. Please check your configuration.`
            : 'Authentication failed. Please check your API keys.',
          details: {
            provider: error.provider
          }
        }, { status: 401 });
        
      case error instanceof ProviderUnavailableError:
        return Response.json({
          success: false,
          error: 'AI service unavailable',
          code: 'PROVIDER_UNAVAILABLE',
          message: `${error.provider} service is currently unavailable. Trying alternative providers...`,
          details: {
            provider: error.provider
          }
        }, { status: 503 });
        
      case error instanceof NetworkError:
        return Response.json({
          success: false,
          error: 'Network error',
          code: 'NETWORK_ERROR',
          message: `Unable to connect to ${error.provider}. Please check your internet connection.`,
          details: {
            provider: error.provider
          }
        }, { status: 502 });
        
      case error instanceof ProviderConfigurationError:
        return Response.json({
          success: false,
          error: 'Configuration error',
          code: 'CONFIGURATION_ERROR',
          message: `${error.provider} is not properly configured. Please check your settings.`,
          details: {
            provider: error.provider
          }
        }, { status: 500 });
    }
  }
  
  // Fallback for non-AI service errors
  return Response.json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again later.'
  }, { status: 500 });
}

/**
 * Handle media processing intent by calling the media API directly
 */
async function handleMediaProcessingIntent(
  intentRoutingResult: any,
  userPrompt: string,
  organizationId: string | null
): Promise<Response> {
  try {
    console.log('🎨 Handling media processing intent:', {
      intent: intentRoutingResult.classification.intent,
      subIntent: intentRoutingResult.classification.subIntent,
      model: intentRoutingResult.model
    });

    // Determine media type from sub-intent
    let mediaType = 'image'; // default
    if (intentRoutingResult.classification.subIntent === 'video_generate') {
      mediaType = 'video';
    } else if (intentRoutingResult.classification.subIntent === 'image_edit') {
      mediaType = 'edit';
    }

    // Prepare the media API request
    const mediaRequest = {
      prompt: intentRoutingResult.amplifiedPrompt || userPrompt,
      type: mediaType,
      model: intentRoutingResult.model,
      quality: 'auto',
      responseFormat: 'url',
      count: 1,
      metadata: {
        intentRouting: {
          intent: intentRoutingResult.classification.intent,
          subIntent: intentRoutingResult.classification.subIntent,
          confidence: intentRoutingResult.classification.confidence
        },
        organizationId
      }
    };

    console.log('📡 Calling media API with request:', mediaRequest);

    // Call the internal media API
    const mediaApiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/ai/media`;
    
    const mediaResponse = await fetch(mediaApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Call': 'true', // Bypass auth for internal calls
        'X-Organization-Id': organizationId || ''
      },
      body: JSON.stringify(mediaRequest)
    });

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.error('❌ Media API error:', mediaResponse.status, errorText);
      throw new Error(`Media API failed: ${mediaResponse.status} - ${errorText}`);
    }

    const mediaResult = await mediaResponse.json();
    console.log('✅ Media API response:', mediaResult);

    // Transform the media API response to match the enhanced chat format
    const enhancedChatResponse = {
      id: Date.now().toString(),
      role: 'assistant',
      content: generateMediaResponseMessage(mediaResult, userPrompt, mediaType),
      createdAt: new Date().toISOString(),
      metadata: {
        provider: 'imagerouter',
        model: mediaResult.data?.model || intentRoutingResult.model,
        intentRouting: {
          intent: intentRoutingResult.classification.intent,
          subIntent: intentRoutingResult.classification.subIntent,
          confidence: intentRoutingResult.classification.confidence
        },
        mediaGeneration: {
          type: mediaType,
          results: mediaResult.data?.results || [],
          cost: mediaResult.data?.usage?.cost || 0,
          processingTime: mediaResult.data?.metadata?.processingTime || 0
        }
      }
    };

    return Response.json(enhancedChatResponse);

  } catch (error) {
    console.error('❌ Failed to handle media processing intent:', error);
    
    // Fallback to text response explaining the error
    return Response.json({
      id: Date.now().toString(),
      role: 'assistant',
      content: `I understand you want to generate media content, but I encountered an error: ${error.message}\n\nPlease try again or contact support if the issue persists.`,
      createdAt: new Date().toISOString(),
      metadata: {
        provider: 'fallback',
        intentRouting: {
          intent: intentRoutingResult.classification.intent,
          error: error.message
        }
      }
    });
  }
}

/**
 * Generate appropriate response message for media generation
 */
function generateMediaResponseMessage(
  mediaResult: any,
  originalPrompt: string,
  mediaType: string
): string {
  if (!mediaResult.success || !mediaResult.data?.results?.length) {
    return `I attempted to generate ${mediaType} content for: "${originalPrompt}"\n\nHowever, the generation was not successful. Please try again with a different prompt or contact support.`;
  }

  const results = mediaResult.data.results;
  const model = mediaResult.data.model || 'AI model';
  
  let message = `Here's the generated ${mediaType} for: "${originalPrompt}"\n\n`;
  
  if (mediaType === 'video') {
    message += `🎥 **Video Generated**\n`;
  } else {
    message += `🎨 **Image Generated**\n`;
  }
  
  message += `**Model**: ${model}\n`;
  
  if (mediaResult.data.usage?.cost) {
    message += `**Cost**: $${mediaResult.data.usage.cost.toFixed(4)}\n`;
  }
  
  if (mediaResult.data.metadata?.processingTime) {
    message += `**Processing Time**: ${(mediaResult.data.metadata.processingTime / 1000).toFixed(1)}s\n`;
  }
  
  message += `\n`;
  
  // Add URLs for each result
  results.forEach((result: any, index: number) => {
    if (result.url) {
      message += `[View ${mediaType} ${index + 1}](${result.url})\n`;
    }
  });
  
  if (mediaResult.data.metadata?.revisedPrompt && 
      mediaResult.data.metadata.revisedPrompt !== originalPrompt) {
    message += `\n**Enhanced Prompt**: ${mediaResult.data.metadata.revisedPrompt}`;
  }
  
  return message;
}

/**
 * Handle request using existing AI service manager with OpenRouter integration
 */
async function handleExistingSystem(
  aiService: any,
  request: EnhancedChatRequest,
  temperature: number,
  maxTokens: number,
  stream: boolean,
  organizationId: string | null
): Promise<Response> {
  try {
    // Try to use real AI providers first
    const availableProviders = aiService.getAvailableProviders();
    const hasRealProvider = availableProviders.some((p: string) => p !== 'mock-demo');

    if (hasRealProvider) {
      // Use real AI service with enhanced request
      try {
        if (stream) {
          // Use streaming with real provider

          // CRITICAL: Append :online suffix if web search is enabled
          let streamModelToUse = request.model;
          const webSearchEnabled = request.options?.webSearch?.enabled;

          if (webSearchEnabled && !streamModelToUse.includes(':online')) {
            streamModelToUse = `${streamModelToUse}:online`;
            console.log(`🌐 Web search enabled (streaming): ${request.model} → ${streamModelToUse}`);
          }

          const streamRequest = {
            messages: request.messages.map((msg: any) => {
              // Convert message to OpenRouter format with attachments
              const baseMessage = {
                role: msg.role,
                content: msg.content
              };

              // Add attachments if present
              if (msg.attachments && msg.attachments.length > 0) {
                return {
                  ...baseMessage,
                  attachments: msg.attachments.map((attachment: any) => ({
                    type: attachment.type,
                    data: attachment.data,
                    path: attachment.url,
                    mimeType: attachment.mimeType,
                    detail: attachment.detail || 'auto',
                    pdfEngine: attachment.pdfEngine || 'pdf-text',
                    annotations: attachment.annotations
                  }))
                };
              }

              return baseMessage;
            }),
            model: streamModelToUse,
            temperature,
            maxTokens,
            options: request.options, // Pass through the options including webSearch
            metadata: {
              provider: 'openrouter', // Force OpenRouter
              originalModel: request.model
            }
          };

          const streamResponse = await aiService.streamCompletion(streamRequest);
          
          // Convert our stream to the format expected by useChat
          let fullContent = '';
          const chunks: string[] = [];
          
          for await (const chunk of streamResponse) {
            fullContent += chunk.content;
            chunks.push(chunk.content);
          }

          return Response.json({
            id: Date.now().toString(),
            role: 'assistant',
            content: fullContent,
            createdAt: new Date().toISOString()
          });
        } else {
          // Non-streaming completion with real provider
          const completionRequest = {
            messages: request.messages.map((msg: any) => {
              // Convert message to OpenRouter format with attachments
              const baseMessage = {
                role: msg.role,
                content: msg.content
              };
              
              // Add attachments if present
              if (msg.attachments && msg.attachments.length > 0) {
                return {
                  ...baseMessage,
                  attachments: msg.attachments.map((attachment: any) => ({
                    type: attachment.type,
                    data: attachment.data,
                    path: attachment.url,
                    mimeType: attachment.mimeType,
                    detail: attachment.detail || 'auto',
                    pdfEngine: attachment.pdfEngine || 'pdf-text',
                    annotations: attachment.annotations
                  }))
                };
              }
              
              return baseMessage;
            }),
            model: request.model,
            temperature,
            maxTokens,
            options: request.options, // Pass through the options including webSearch
            metadata: {
              provider: 'openrouter', // Force OpenRouter
              originalModel: request.model
            }
          };

          console.log('🚀 Sending completion request to AI service:', completionRequest);

          // CRITICAL: Append :online suffix if web search is enabled
          let modelToUse = completionRequest.model;
          const webSearchEnabled = completionRequest.options?.webSearch?.enabled;

          if (webSearchEnabled && !modelToUse.includes(':online')) {
            modelToUse = `${modelToUse}:online`;
            console.log(`🌐 Web search enabled: ${completionRequest.model} → ${modelToUse}`);
          }

          // Update the request with the modified model
          const enhancedCompletionRequest = {
            ...completionRequest,
            model: modelToUse
          };

          // Try OpenRouter adapter first, fallback to direct API if needed
          const openrouterAdapter = aiService.getOpenRouterAdapter();
          let response;

          console.log('🔍 API Enhanced-chat request:', {
            hasOptions: !!enhancedCompletionRequest.options,
            options: enhancedCompletionRequest.options,
            webSearchEnabled: enhancedCompletionRequest.options?.webSearch?.enabled,
            model: enhancedCompletionRequest.model,
            messages: enhancedCompletionRequest.messages.length
          });

          if (openrouterAdapter) {
            console.log('🎯 Using OpenRouter adapter directly for online search with model:', enhancedCompletionRequest.model);
            try {
              response = await openrouterAdapter.generateCompletion(enhancedCompletionRequest);
            } catch (adapterError) {
              console.error('❌ OpenRouter adapter failed, trying direct API:', adapterError);
              response = null;
            }
          }
          
          // Fallback to direct OpenRouter API call if adapter failed
          if (!response) {
            console.log('🔄 Falling back to direct OpenRouter API call');
            const { ai: aiEnvConfig } = await import('@/lib/config/env');
            const openrouterApiKey = aiEnvConfig.openrouterApiKey;
            
            if (!openrouterApiKey) {
              throw new Error('OpenRouter API key not configured');
            }
            
            // Check if request has attachments to determine if we need a multimodal model
            const hasImages = request.messages.some((msg: any) => 
              msg.attachments?.some((att: any) => att.type === 'image')
            );
            const hasPDFs = request.messages.some((msg: any) => 
              msg.attachments?.some((att: any) => att.type === 'pdf')
            );
            const hasFiles = request.messages.some((msg: any) => 
              msg.attachments?.some((att: any) => att.type === 'file')
            );
            const hasAnyAttachments = hasImages || hasPDFs || hasFiles;
            
            // Use appropriate model based on content - ensure capable models for file processing
            let modelToUse = request.model;
            if (hasAnyAttachments) {
              // For multimodal content (images, PDFs, files), ensure we use a capable model
              let baseModel = modelToUse.replace(':online', ''); // Remove :online temporarily
              
              // Ensure we're using a multimodal-capable model
              // GPT-4o and Claude Sonnet are known to handle various file types well
              if (!baseModel.includes('gpt-4o') && !baseModel.includes('gpt-4o-mini') && !baseModel.includes('claude-3') && !baseModel.includes('gemini')) {
                console.log(`⚠️ Model ${baseModel} may not support file processing, upgrading to gpt-4o-mini`);
                baseModel = 'openai/gpt-4o-mini';
              }
              
              // For PDFs specifically, use the full GPT-4o model for better processing
              if (hasPDFs && baseModel === 'openai/gpt-4o-mini') {
                console.log(`📄 PDF detected, upgrading from gpt-4o-mini to gpt-4o for better file processing`);
                baseModel = 'openai/gpt-4o';
              }
              
              // Re-add :online for web search capability
              modelToUse = `${baseModel}:online`;
            } else {
              // For text-only, we can use :online for web search if requested
              if (!modelToUse.includes(':online')) {
                modelToUse = `${modelToUse}:online`;
              }
            }
            
            console.log(`🎯 Model selection: ${request.model} → ${modelToUse} (hasImages: ${hasImages}, hasPDFs: ${hasPDFs}, hasFiles: ${hasFiles})`);
            
            // Note: Attachments are now handled directly in the message content array

            const openrouterRequest = {
              model: modelToUse,
              messages: request.messages.map((msg: any) => {
                // Convert message to OpenRouter format with attachments
                const baseMessage = {
                  role: msg.role,
                  content: msg.content
                };
                
                // Add attachments if present - convert to OpenRouter multimodal format
                if (msg.attachments && msg.attachments.length > 0) {
                  console.log(`🖼️ Processing ${msg.attachments.length} attachments for message`);
                  const contentParts = [{ type: 'text', text: msg.content }];
                  
                  msg.attachments.forEach((attachment: any, index: number) => {
                    console.log(`🔍 Attachment ${index}:`, {
                      type: attachment.type,
                      name: attachment.name,
                      mimeType: attachment.mimeType,
                      hasData: !!attachment.data,
                      dataLength: attachment.data?.length || 0,
                      detail: attachment.detail
                    });
                    
                    if (attachment.type === 'image' && attachment.data) {
                      const imageUrl = `data:${attachment.mimeType};base64,${attachment.data}`;
                      console.log(`🎯 Creating image_url content:`, {
                        type: 'image_url',
                        imageUrlLength: imageUrl.length,
                        mimeType: attachment.mimeType,
                        detail: attachment.detail || 'auto'
                      });
                      
                      contentParts.push({
                        type: 'image_url',
                        image_url: {
                          url: imageUrl,
                          detail: attachment.detail || 'auto'
                        }
                      });
                    } else if (attachment.type === 'pdf' && attachment.data) {
                      console.log(`📄 Processing PDF attachment: ${attachment.name}`);
                      // For PDFs, use OpenRouter's file format
                      const pdfDataUrl = `data:${attachment.mimeType};base64,${attachment.data}`;
                      console.log(`🎯 Creating PDF file content:`, {
                        type: 'file',
                        mimeType: attachment.mimeType,
                        name: attachment.name,
                        dataLength: pdfDataUrl.length
                      });
                      
                      contentParts.push({
                        type: 'file',
                        file: {
                          filename: attachment.name,
                          file_data: pdfDataUrl
                        }
                      });
                    } else if (attachment.type === 'file' && attachment.data) {
                      console.log(`📎 Processing file attachment: ${attachment.name}`);
                      // Add generic file as text description to the message
                      contentParts.push({
                        type: 'text',
                        text: `\n\n[IMPORTANT: I have uploaded a file called "${attachment.name}". Please analyze this file and extract all relevant information from it.]`
                      });
                    }
                  });
                  
                  console.log(`✅ Message converted with ${contentParts.length} content parts`);
                  return {
                    ...baseMessage,
                    content: contentParts
                  };
                }
                
                return baseMessage;
              }),
              temperature,
              max_tokens: maxTokens,
              // Add PDF processing plugin configuration if PDFs are present
              ...(hasPDFs && {
                plugins: [
                  {
                    id: 'file-parser',
                    pdf: {
                      engine: 'pdf-text' // Use free PDF text extraction for structured PDFs
                    }
                  }
                ]
              })
            };
            
            console.log('📤 Final OpenRouter request:', {
              model: openrouterRequest.model,
              messageCount: openrouterRequest.messages.length,
              messagesWithImages: openrouterRequest.messages.filter((m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url')).length,
              messagesWithPDFs: openrouterRequest.messages.filter((m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'file')).length,
              hasPlugins: !!openrouterRequest.plugins,
              pdfEngine: openrouterRequest.plugins?.[0]?.pdf?.engine
            });
            
            const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openrouterApiKey}`,
                'HTTP-Referer': 'https://document-chat-system.vercel.app',
                'X-Title': 'Document Chat System',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(openrouterRequest)
            });
            
            if (!apiResponse.ok) {
              const errorText = await apiResponse.text();
              console.error('❌ OpenRouter API error:', {
                status: apiResponse.status,
                statusText: apiResponse.statusText,
                error: errorText,
                model: openrouterRequest.model,
                hasImages: openrouterRequest.messages.some((m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url'))
              });
              throw new Error(`OpenRouter API error: ${apiResponse.status} - ${errorText}`);
            }
            
            const data = await apiResponse.json();
            response = {
              content: data.choices[0]?.message?.content || 'No response content',
              model: data.model,
              usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0
              },
              metadata: {
                provider: 'openrouter',
                model: data.model,
                system: 'direct-api-fallback'
              }
            };
          }
          console.log('✅ OpenRouter response received:', {
            provider: response.metadata?.provider,
            model: response.model,
            hasContent: !!response.content,
            hasCitations: !!(response.citations || response.metadata?.citations),
            citationsCount: (response.citations || response.metadata?.citations || []).length,
            citations: response.citations || response.metadata?.citations || [],
            annotations: response.annotations || response.metadata?.annotations || []
          });

          // Track usage for successful request
          await trackUsageForRequest(organizationId, request.messages, response);

          return Response.json({
            success: true,
            content: response.content,
            model: response.model,
            usage: response.usage,
            // Include citations at top level for easy access
            citations: response.citations || response.metadata?.citations || [],
            annotations: response.annotations || response.metadata?.annotations || [],
            metadata: {
              ...response.metadata,
              provider: 'openrouter',
              model: response.model,
              actualModel: response.model,
              system: 'ai-service-manager',
              timestamp: Date.now(),
              citations: response.citations || response.metadata?.citations || [],
              annotations: response.annotations || response.metadata?.annotations || []
            },
            // Include file annotations for future reuse (cost optimization)
            fileAnnotations: response.fileAnnotations
          });
        }
      } catch (aiError) {
        console.error('Real AI provider failed:', aiError);
        
        // Always check if it's an AI service error first
        if (isAIServiceError(aiError)) {
          console.log('Detected AI service error, returning user-friendly response');
          return handleAIServiceError(aiError as Error);
        }
        
        // Check if the error message contains AI service error indicators
        if (aiError instanceof Error) {
          const errorMessage = aiError.message.toLowerCase();
          if (errorMessage.includes('quota') || 
              errorMessage.includes('credit balance') || 
              errorMessage.includes('rate limit') ||
              errorMessage.includes('authentication')) {
            console.log('Detected error pattern, creating appropriate error response');
            
            if (errorMessage.includes('quota') || errorMessage.includes('credit balance')) {
              console.log('Anthropic quota exceeded, attempting fallback to OpenAI...');
              
              // Try fallback to OpenAI
              try {
                const fallbackRequest = {
                  messages: request.messages.map((msg: any) => {
                    // Convert message to OpenRouter format with attachments
                    const baseMessage = {
                      role: msg.role,
                      content: msg.content
                    };
                    
                    // Add attachments if present
                    if (msg.attachments && msg.attachments.length > 0) {
                      return {
                        ...baseMessage,
                        attachments: msg.attachments.map((attachment: any) => ({
                          type: attachment.type,
                          data: attachment.data,
                          path: attachment.url,
                          mimeType: attachment.mimeType,
                          detail: attachment.detail || 'auto',
                          pdfEngine: attachment.pdfEngine || 'pdf-text',
                          annotations: attachment.annotations
                        }))
                      };
                    }
                    
                    return baseMessage;
                  }),
                  model: 'gpt-4o-mini', // Use a more cost-effective model
                  temperature,
                  maxTokens,
                  hints: {
                    taskType: 'simple_qa' as const,
                    complexity: 'medium' as const
                  },
                  metadata: {
                    provider: 'openai',
                    originalModel: 'gpt-4o-mini',
                    fallbackFrom: 'anthropic'
                  }
                };

                const fallbackResponse = await aiService.generateCompletion(fallbackRequest);
                
                // Track usage for successful fallback request
                await trackUsageForRequest(organizationId, request.messages, fallbackResponse);

                return Response.json({
                  success: true,
                  content: fallbackResponse.content,
                  model: fallbackResponse.model,
                  usage: fallbackResponse.usage,
                  // Include citations at top level for easy access
                  citations: fallbackResponse.citations || [],
                  annotations: fallbackResponse.annotations || [],
                  metadata: {
                    ...fallbackResponse.metadata,
                    provider: 'openai',
                    model: fallbackResponse.model,
                    actualModel: fallbackResponse.model,
                    system: 'enhanced-ai',
                    timestamp: Date.now(),
                    fallbackFrom: 'anthropic',
                    fallbackReason: 'quota exceeded',
                    citations: fallbackResponse.citations || [],
                    annotations: fallbackResponse.annotations || []
                  }
                });
              } catch (fallbackError) {
                console.error('Fallback to OpenAI also failed:', fallbackError);
                return handleAIServiceError(new QuotaExceededError('anthropic', 'credit balance'));
              }
            }
            if (errorMessage.includes('rate limit')) {
              return handleAIServiceError(new RateLimitError('anthropic'));
            }
            if (errorMessage.includes('authentication')) {
              return handleAIServiceError(new AuthenticationError('Invalid API key', 'anthropic'));
            }
          }
        }
        
        // For other errors, fall through to mock response
        console.log('Falling back to mock response');
      }
    }

    // Fallback to mock response for demo purposes
    const lastMessage = request.messages[request.messages.length - 1];
    const mockResponse = `Demo response to: "${lastMessage?.content}". This is a mock response from the Enhanced Chat demo system. To use real AI responses, configure your OpenAI API key.`;
    
    if (stream) {
      return Response.json({
        id: Date.now().toString(),
        role: 'assistant', 
        content: mockResponse,
        createdAt: new Date().toISOString()
      });
    } else {
      const mockResponseObj = {
        content: mockResponse,
        model: request.model,
        usage: {
          promptTokens: 10,
          completionTokens: mockResponse.split(' ').length,
          totalTokens: 10 + mockResponse.split(' ').length
        },
        metadata: {
          system: 'enhanced-demo',
          provider: request.provider || 'mock',
          model: request.model,
          timestamp: Date.now()
        }
      };

      // Track usage for mock response (for demo billing)
      await trackUsageForRequest(organizationId, request.messages, mockResponseObj);

      return Response.json({
        success: true,
        ...mockResponseObj
      });
    }
  } catch (error) {
    console.error('Enhanced system failed:', error);
    
    // Handle AI service errors with user-friendly messages
    if (isAIServiceError(error)) {
      return handleAIServiceError(error as Error);
    }
    
    // Handle other errors
    return Response.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


/**
 * Enhanced chat endpoint supporting both our existing AI system and Vercel AI SDK
 * Provides backward compatibility while enabling new streaming capabilities
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate request (with demo fallback)
    const { userId } = getAuth(req);
    
    if (!userId) {
      console.log('Demo mode: No authentication found, proceeding with demo');
    }

    // Get organization ID for usage tracking
    const organizationId = await getOrganizationId(userId);
    if (!organizationId) return Response.json({ error: 'Account unavailable' }, { status: 403 });
    const usageError = await guardUsage(organizationId, UsageType.AI_QUERY);
    if (usageError) return usageError;


    // Parse and validate request body
    const requestBody = await req.json();
    const validation = enhancedChatSchema.safeParse(requestBody);
    
    if (!validation.success) {
      return Response.json(
        { 
          success: false,
          error: 'Invalid request', 
          details: validation.error.errors,
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    const {
      messages,
      model,
      provider,
      useVercelOptimized,
      temperature,
      maxTokens
    }: EnhancedChatRequest = validation.data;
    
    console.log('🔍 Enhanced Chat API received:', {
      model,
      provider,
      useVercelOptimized,
      messageCount: messages.length
    });
    
    const stream = false; // Using non-streaming for consistent format

    // Initialize AI service and wait for providers to be ready
    const aiService = AIServiceManager.getInstance();
    console.log('🔄 Initializing AI service...');
    await aiService.initialize();
    console.log('✅ AI service initialized');
    console.log('📋 Available providers:', aiService.getAvailableProviders());
    console.log('🔍 OpenRouter status:', aiService.getOpenRouterStatus());
    
    // Initialize Intent Router if enabled
    const enableIntentRouting = process.env.ENABLE_INTENT_ROUTING === 'true';
    const intentRoutingResult: any = null;
    const finalModel = model === 'auto' ? 'openai/gpt-4o-mini' : model;
    const selectedProvider = provider || 'openrouter';
    
    if (!enableIntentRouting) {
      console.log('🔌 Intent routing disabled');
    }
    
    console.log('🌐 Using AI Service Manager with OpenRouter (online search enabled)', { model: finalModel });
    
    // Debug: Check available providers
    const availableProviders = aiService.getAvailableProviders();
    console.log('Available providers:', availableProviders);
    console.log('🎯 Final selection:', { provider: 'openrouter', model: finalModel });
    
    // Update request with intent routing results
    const enhancedRequest = {
      ...validation.data,
      model: finalModel,
      provider: selectedProvider,
      metadata: {
        ...validation.data.metadata,
        provider: selectedProvider,
        intentRouting: intentRoutingResult ? {
          intent: intentRoutingResult.classification.intent,
          confidence: intentRoutingResult.classification.confidence,
          subIntent: intentRoutingResult.classification.subIntent
        } : undefined
      }
    };

    if (useVercelOptimized) {
      // Use Vercel AI SDK directly for rapid development and streaming
      const vercelAdapter = aiService.getVercelOptimizedService();
      
      if (!vercelAdapter) {
        // Fallback to our existing system if Vercel adapter not available
        console.warn('Vercel AI adapter not available, falling back to existing system');
        return handleExistingSystem(aiService, enhancedRequest, temperature, maxTokens, stream, organizationId);
      }

      if (stream) {
        // Stream response using Vercel AI SDK
        try {
          const result = await streamText({
            model: getVercelModel(model),
            messages: messages.map(msg => {
              const baseMessage = {
                role: msg.role,
                content: msg.content,
                ...(msg.name && { name: msg.name })
              };
              
              // Add attachments if present - convert to Vercel AI format
              if (msg.attachments && msg.attachments.length > 0) {
                const contentParts = [{ type: 'text', text: msg.content }];
                
                msg.attachments.forEach((attachment: any) => {
                  if (attachment.type === 'image' && attachment.data) {
                    contentParts.push({
                      type: 'image',
                      image: `data:${attachment.mimeType};base64,${attachment.data}`
                    });
                  } else if ((attachment.type === 'pdf' || attachment.type === 'file') && attachment.data) {
                    // Note: Vercel AI SDK may have different file handling
                    contentParts.push({
                      type: 'file',
                      data: `data:${attachment.mimeType};base64,${attachment.data}`,
                      filename: attachment.name
                    });
                  }
                });
                
                return {
                  ...baseMessage,
                  content: contentParts
                };
              }
              
              return baseMessage;
            }),
            temperature,
            maxTokens
          });

          return result.toUIMessageStreamResponse();
        } catch (error) {
          console.error('Vercel AI SDK streaming failed:', error);
          console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            model,
            messageCount: messages.length
          });
          // Fallback to existing system
          return handleExistingSystem(aiService, enhancedRequest, temperature, maxTokens, stream, organizationId);
        }
      } else {
        // Non-streaming response using Vercel AI adapter
        try {
          const response = await vercelAdapter.generateCompletion({
            messages: messages.map(msg => {
              const baseMessage = {
                role: msg.role as any,
                content: msg.content,
                metadata: msg.name ? { name: msg.name } : undefined
              };
              
              // Add attachments if present
              if (msg.attachments && msg.attachments.length > 0) {
                return {
                  ...baseMessage,
                  attachments: msg.attachments.map((attachment: any) => ({
                    type: attachment.type,
                    data: attachment.data,
                    path: attachment.url,
                    mimeType: attachment.mimeType,
                    detail: attachment.detail || 'auto',
                    pdfEngine: attachment.pdfEngine || 'pdf-text',
                    annotations: attachment.annotations
                  }))
                };
              }
              
              return baseMessage;
            }),
            model: finalModel,
            temperature,
            maxTokens,
            hints: {
              taskType: 'chat',
              complexity: 'medium'
            }
          });

          // Track usage for successful Vercel optimized request
          await trackUsageForRequest(organizationId, messages, response);

          return Response.json({
            success: true,
            content: response.content,
            model: response.model,
            usage: response.usage,
            // Include citations at top level for easy access
            citations: response.citations || [],
            annotations: response.annotations || [],
            metadata: {
              ...response.metadata,
              provider: 'openrouter',
              model: response.model,
              system: 'vercel-enhanced',
              citations: response.citations || [],
              annotations: response.annotations || []
            }
          });
        } catch (error) {
          console.error('Vercel AI adapter failed:', error);
          return handleExistingSystem(aiService, enhancedRequest, temperature, maxTokens, stream, organizationId);
        }
      }
    } else {
      return handleExistingSystem(aiService, enhancedRequest, temperature, maxTokens, stream, organizationId);
    }

  } catch (error) {
    console.error('Enhanced chat API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error name:', error instanceof Error ? error.name : 'Unknown');
    
    // Handle AI service errors with user-friendly messages
    if (isAIServiceError(error)) {
      return handleAIServiceError(error as Error);
    }
    
    return Response.json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? {
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      } : undefined
    }, { status: 500 });
  }
}

/**
 * Helper function to get Vercel AI SDK model instance
 */
function getVercelModel(modelName: string) {
  // Map common model names to appropriate providers
  if (modelName.startsWith('gpt-')) {
    return openai(modelName);
  }
  if (modelName.startsWith('claude-')) {
    return anthropic(modelName);
  }
  if (modelName.startsWith('gemini-')) {
    return google(modelName);
  }
  
  // Default fallback
  return openai('gpt-4o-mini');
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return Response.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}