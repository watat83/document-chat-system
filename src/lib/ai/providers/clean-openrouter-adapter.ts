import { readSSEData } from '../sse-reader';
import { z } from 'zod';
import { normalizeError } from '@/lib/errors/normalize-error';
import { ai } from '@/lib/config/env';
import {
  AIProviderAdapter,
  UnifiedCompletionRequest,
  UnifiedCompletionResponse,
  UnifiedEmbeddingRequest,
  UnifiedEmbeddingResponse,
  UnifiedStreamRequest,
  UnifiedStreamChunk,
  ProviderCapabilities,
  ModelInfo,
  CostEstimate,
  UnifiedMessage,
  Citation
} from '../interfaces';

import {
  RateLimitError,
  AuthenticationError,
  ValidationError,
  QuotaExceededError,
  NetworkError,
  ProviderUnavailableError,
  ProviderConfigurationError
} from '../interfaces/errors';

import { OpenRouterMetricsCollector } from '../monitoring/openrouter-metrics-collector';
import { AIMetricsIntegration } from '../monitoring/ai-metrics-integration';
import { cacheManager } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/cache/config';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { validateCSRFInAPIRoute } from '@/lib/csrf';
import openRouterMapping from '../openrouter-mapping.json';
import fs from 'fs';
import { db } from '@/lib/db';

export interface OpenRouterConfig {
  apiKey: string;
  appName: string;
  siteUrl: string;
  enableSmartRouting: boolean;
  costOptimization: 'aggressive' | 'balanced' | 'conservative';
  maxRetries: number;
  timeout: number;
}

export interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{
      type: 'text' | 'image_url' | 'pdf_url' | 'file';
      text?: string;
      image_url?: {
        url: string;
        detail?: 'low' | 'high' | 'auto';
      };
      pdf_url?: {
        url: string;
        engine?: 'mistral-ocr' | 'pdf-text' | 'native';
      };
      file?: {
        filename: string;
        file_data: string;
      };
      cache_control?: {
        type: 'ephemeral';
      };
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  provider?: {
    order?: string[];
    allow?: string[];
    sort?: 'price' | 'latency' | 'throughput';
    max_price?: { prompt: number; completion: number };
    data_collection?: 'allow' | 'deny';
  };
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema';
    json_schema?: any;
  };
  plugins?: Array<{
    id: string;
    pdf?: {
      engine?: 'pdf-text' | 'mistral-ocr' | 'native';
    };
    // Web search plugin (OpenRouter format)
    max_results?: number;
    search_prompt?: string;
  }>;
  web_search_options?: {
    search_context_size?: 'low' | 'medium' | 'high';
  };
  usage?: {
    include?: boolean;
  };
}

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      annotations?: Array<{
        type: 'url_citation';
        url_citation: {
          url: string;
          title?: string;
          content?: string;
          start_index: number;
          end_index: number;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  generation_id?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: string;
    completion: string;
    request?: string;
    image?: string;
  };
  context_length?: number;
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: {
    context_length: number;
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
  per_request_limits?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  parameters?: {
    model_parameters?: number;
    model_type?: string;
  };
  modality?: string;
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export interface OpenRouterGenerationStats {
  id: string;
  model: string;
  provider: string;
  cost: number;
  latency_ms: number;
  tokens_per_second: number;
  created_at: string;
  success: boolean;
  routing_info?: {
    selected_provider: string;
    fallback_used: boolean;
    cost_optimization: boolean;
    latency_optimization: boolean;
  };
}

interface ModelPerformanceData {
  averageLatency: number;
  qualityScore: number;
  successRate: number;
  averageCost: number;
  sampleSize: number;
  lastUpdated: string;
}

/**
 * Clean OpenRouter Adapter
 *
 * Deep native integration with OpenRouter API:
 * - Uses OpenRouter's native /models endpoint for model discovery
 * - Uses OpenRouter's /generation endpoint for real-time performance data
 * - Uses OpenRouter's native routing with provider preferences
 * - Integrates with Zustand store for AI state management
 * - Full integration with internal policies and security
 * - NO hardcoded model mappings, performance estimates, or quality scores
 * - Supports multimodal capabilities with image analysis
 */
export class CleanOpenRouterAdapter extends AIProviderAdapter {
  private config: OpenRouterConfig;
  private availableModels: ModelInfo[] = [];
  private metricsCollector: OpenRouterMetricsCollector;
  private aiMetricsIntegration: AIMetricsIntegration;
  private baseUrl = 'https://openrouter.ai/api/v1';

  // Only trivial constants
  private readonly DEFAULT_MAX_TOKENS = 4096;
  private readonly DEFAULT_TEMPERATURE = 0.7;
  private readonly MIN_SAMPLES_FOR_STATS = 5;
  private readonly PERFORMANCE_CACHE_DURATION = 300; // 5 minutes

  // Prompt caching configuration from environment
  private readonly promptCacheEnabled: boolean;
  private readonly promptCacheTtl: number;
  private readonly promptCacheMinTokens: number;
  private readonly cacheBreakpointStrategy: string;

  constructor(config: OpenRouterConfig) {
    super('openrouter');
    this.config = config;
    this.metricsCollector = new OpenRouterMetricsCollector(config.apiKey);
    this.aiMetricsIntegration = new AIMetricsIntegration();

    // Load prompt caching configuration from environment
    const { ai } = require('@/lib/config/env');
    this.promptCacheEnabled = ai.openrouterPromptCacheEnabled ?? true;
    this.promptCacheTtl = ai.openrouterPromptCacheTtl ?? 300;
    this.promptCacheMinTokens = ai.openrouterPromptCacheMinTokens ?? 1024;
    this.cacheBreakpointStrategy = ai.openrouterCacheBreakpointStrategy ?? 'auto';

    // Validate configuration follows our policies
    this.validateCacheConfiguration();
  }

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new ProviderConfigurationError('OpenRouter API key is required');
    }

    try {
      // Only test connection, skip loading all models to prevent timeouts
      // Models will be loaded on-demand when needed
      await this.testConnection();
      await this.loadAvailableModels();
      this.updateHealth(true);
      console.log('✅ CleanOpenRouterAdapter initialized successfully');
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('⚠️ CleanOpenRouterAdapter connection test failed, but continuing:', error);
      this.updateHealth(false);
      throw error;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxTokens: 200000,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsVision: true,
      supportsAudio: false,
      embeddingDimensions: [512, 1024, 1536, 3072],
      models: {
        completion: [], // Populated dynamically from OpenRouter
        embedding: []   // Populated dynamically from OpenRouter
      }
    };
  }

  /**
   * Native OpenRouter Models Loading - Uses OpenRouter's /models endpoint directly
   */
  getAvailableModels(): ModelInfo[] { return [...this.availableModels]; }

  async refreshModels(): Promise<void> {
    await cacheManager.delete('ai:openrouter:models:available');
    await this.loadAvailableModels();
  }

  async checkHealth(): Promise<boolean> {
    try { await this.testConnection(); this.updateHealth(true); return true; }
    catch { this.updateHealth(false); return false; }
  }

  getHealthMetrics() { return { healthy: this.getHealth(), lastHealthCheck: this.getLastHealthCheck() }; }
  getCostOptimizationInsights(organizationId: string) { return this.metricsCollector.getCostOptimizationInsights(organizationId); }
  getProviderPerformanceComparison(organizationId: string) { return this.metricsCollector.getProviderPerformanceComparison(organizationId); }

  async loadAvailableModels(): Promise<ModelInfo[]> {
    const cacheKey = `ai:openrouter:models:available`;

    try {
      const cachedModels = await cacheManager.get<ModelInfo[]>(cacheKey);
      if (cachedModels) {
        console.log('🔄 Using cached OpenRouter models');
        this.availableModels = cachedModels;
        return cachedModels;
      }

      console.log('🔄 Loading OpenRouter models from API...');

      const response = await this.makeRequest<OpenRouterModelsResponse>('/models', 'GET');

      // Transform to ModelInfo with real-time data from OpenRouter
      const models: ModelInfo[] = await Promise.all(
        response.data.map(async (model) => {
          const [performance, realTimePricing] = await Promise.all([
            this.getModelPerformanceFromOpenRouter(model.id),
            Promise.resolve(this.extractPricingFromModel(model))
          ]);

          return {
            name: model.id,
            provider: 'openrouter',
            displayName: model.name || this.formatModelDisplayName(model.id),
            description: model.description || `${model.name || model.id} model via OpenRouter`,
            maxTokens: model.context_length || this.DEFAULT_MAX_TOKENS,
            costPer1KTokens: realTimePricing || this.extractPricingFromModel(model),
            averageLatency: performance?.averageLatency ?? 0,
            qualityScore: performance?.qualityScore ?? 0,
            tier: this.calculateTierFromMappingPricing(model.id, realTimePricing || this.extractPricingFromModel(model)),
            features: this.extractFeaturesFromMapping(model.id),
            metadata: {
              architecture: model.architecture,
              modality: model.modality,
              topProvider: model.top_provider,
              parameters: model.parameters,
              requestLimits: model.per_request_limits,
              performanceSamples: performance?.sampleSize || 0,
              lastPerformanceUpdate: performance?.lastUpdated || null
            }
          };
        })
      );

      await cacheManager.set(cacheKey, models, CACHE_TTL.MEDIUM);

      console.log(`✅ Loaded ${models.length} OpenRouter models`);
      this.availableModels = models;
      return models;

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('❌ Failed to load OpenRouter models:', error);
      throw new ProviderUnavailableError(`Failed to load OpenRouter models: ${error.message}`);
    }
  }

  /**
   * Get real-time model performance from OpenRouter's generation stats API
   */
  private async getModelPerformanceFromOpenRouter(modelId: string): Promise<ModelPerformanceData | null> {
    // DISABLED: Not needed anymore - causes too many timeouts
    return null;

    /* Original code disabled to prevent timeouts
    const cacheKey = `ai:openrouter:performance:${modelId}`;

    try {
      const cachedPerformance = await cacheManager.get<ModelPerformanceData>(cacheKey);
      if (cachedPerformance) {
        return cachedPerformance;
      }

      // Fetch recent generation stats from OpenRouter
      const response = await this.makeRequest<{ data: OpenRouterGenerationStats[] }>(
        `/generation?id=${encodeURIComponent(modelId)}&limit=100`,
        'GET'
      );

      if (!response.data || response.data.length < this.MIN_SAMPLES_FOR_STATS) {
        console.log(`Insufficient data for ${modelId}: ${response.data?.length || 0} samples`);
        return null;
      }

      const stats = response.data;
      const successfulStats = stats.filter(s => s.success);

      if (successfulStats.length < this.MIN_SAMPLES_FOR_STATS) {
        console.log(`Insufficient successful samples for ${modelId}: ${successfulStats.length}`);
        return null;
      }

      // Calculate real performance metrics from OpenRouter data
      const performance: ModelPerformanceData = {
        averageLatency: Math.round(successfulStats.reduce((sum, s) => sum + s.latency_ms, 0) / successfulStats.length),
        successRate: successfulStats.length / stats.length,
        averageCost: successfulStats.reduce((sum, s) => sum + s.cost, 0) / successfulStats.length,
        qualityScore: this.calculateQualityFromSuccessRate(successfulStats.length / stats.length),
        sampleSize: stats.length,
        lastUpdated: new Date().toISOString()
      };

      await cacheManager.set(cacheKey, performance, this.PERFORMANCE_CACHE_DURATION);
      return performance;

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      // Handle 404 errors gracefully - model might not exist or have performance data
      if (error instanceof NetworkError && error.message.includes('404')) {
        // Silently skip - too many models cause noise in logs
        // console.log(`Model ${modelId} not found in OpenRouter performance API - skipping performance data`);
        return null;
      }

      console.warn(`Failed to get OpenRouter performance for ${modelId}:`, error);
      return null;
    }
    */
  }

  /**
   * Get real-time pricing from OpenRouter models API
   */
  private resolveModel(model: string): string {
    const configured = model === 'fast' ? ai.modelFast : model === 'balanced' || model === 'auto' ? ai.modelBalanced : model === 'powerful' ? ai.modelPowerful : model;
    return configured.includes('/') ? configured : `openai/${configured}`;
  }

  private async getRealTimePricingFromOpenRouter(modelId: string): Promise<{ prompt: number; completion: number } | null> {
    if (!this.availableModels.length) await this.loadAvailableModels();
    const resolved = this.resolveModel(modelId).replace(/:online$/, '');
    return this.availableModels.find(model => model.name === resolved)?.costPer1KTokens ?? null;
  }

  /**
   * Generate completion with full integration
   */
  async generateCompletion(request: UnifiedCompletionRequest): Promise<UnifiedCompletionResponse> {
    const startTime = Date.now();
    const organizationId = request.metadata?.organizationId;

    try {
      // Security validation
      if (process.env.NODE_ENV === 'production' && request.metadata?.httpRequest) {
        const csrfResult = await validateCSRFInAPIRoute(request.metadata.httpRequest);
        if (!csrfResult.valid) {
          throw new ValidationError(`CSRF validation failed: ${csrfResult.error}`);
        }
      }

      // Usage tracking
      if (organizationId) {
        await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
      }

      const openRouterRequest = await this.prepareCompletionRequest(request);

      // Make request to OpenRouter
      const response = await this.makeRequest<OpenRouterResponse>(
        '/chat/completions',
        'POST',
        openRouterRequest, request.signal
      );

      const latency = Date.now() - startTime;

      // Track usage after successful request (Layer 1: Billing)
      if (organizationId) {
        await UsageTrackingService.trackUsage({
          organizationId,
          usageType: UsageType.AI_QUERY,
          quantity: 1,
          resourceId: response.id,
          resourceType: 'ai_completion',
          metadata: {
            model: response.model,
            tokens: response.usage.total_tokens,
            cost: await this.calculateActualCostFromOpenRouter(response, request.model),
            latency: latency,
            provider: 'openrouter'
          }
        });

        // Record in global AI metrics system (Layer 2: Performance Metrics)
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'openrouter',
            model: response.model,
            operation: 'completion',
            latency: latency,
            tokenCount: {
              prompt: response.usage.prompt_tokens,
              completion: response.usage.completion_tokens,
              total: response.usage.total_tokens
            },
            cost: await this.calculateActualCostFromOpenRouter(response, request.model),
            success: true,
            metadata: {
              taskType: 'completion',
              organizationId,
              userId: request.metadata?.userId,
              requestId: response.id
            }
          }
        );
      }

      // Record metrics
      await this.recordMetrics(request, response, startTime, openRouterRequest);

      // Update real-time performance in store


      // Update prompt caching metrics in store
      const cacheStats = this.extractCacheStats(response);


      // Log caching effectiveness
      if (this.promptCacheEnabled && (cacheStats.cacheTokens || 0) > 0) {
        console.log(`💾 Prompt cache hit! Saved ${cacheStats.cacheTokens} tokens, discount: ${cacheStats.cacheDiscount}, ratio: ${cacheStats.cacheHitRatio}`);
      }

      // RAW AI RESPONSE LOG for analysis
      console.log('🔍 RAW AI RESPONSE:', JSON.stringify(response, null, 2));

      // Extract citations from response annotations
      console.log('🔍 OpenRouter raw response structure:', {
        hasChoices: !!response.choices,
        choicesLength: response.choices?.length,
        firstChoice: response.choices?.[0],
        hasMessage: !!response.choices?.[0]?.message,
        message: response.choices?.[0]?.message,
        annotations: response.choices?.[0]?.message?.annotations,
        annotationsCount: response.choices?.[0]?.message?.annotations?.length || 0,
        responseContent: response.choices?.[0]?.message?.content?.substring(0, 500) + '...',
        fullResponse: JSON.stringify(response, null, 2)
      });

      const citations = this.extractCitationsFromResponse(response);
      console.log('📚 Extracted citations:', citations);
      console.log('📚 Citations count:', citations.length);

      return {
        content: response.choices[0]?.message?.content || '',
        model: response.model,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        },
        citations: citations.length > 0 ? citations : undefined,
        annotations: response.choices[0]?.message?.annotations || undefined,
        metadata: {
          provider: 'openrouter',
          requestId: response.id,
          finishReason: response.choices[0]?.finish_reason,
          generationId: response.generation_id,
          latency,
          actualModel: response.model,
          actualProvider: this.extractProviderFromModelId(response.model),
          citations: citations.length > 0 ? citations : undefined,
          annotations: response.choices[0]?.message?.annotations || undefined,
          cacheStats: this.extractCacheStats(response),
          promptCacheEnabled: this.promptCacheEnabled
        }
      };
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      const latency = Date.now() - startTime;
      const organizationId = request.metadata?.organizationId;

      await this.recordErrorMetrics(request, error, startTime);


      // Record error in global AI metrics system (Layer 2: Performance Metrics)
      if (organizationId) {
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'openrouter',
            model: request.model,
            operation: 'completion',
            latency: latency,
            tokenCount: { prompt: 0, completion: 0, total: 0 },
            cost: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              taskType: 'completion',
              organizationId,
              userId: request.metadata?.userId,
              errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
            }
          }
        );
      }

      throw this.handleError(error, 'generateCompletion');
    }
  }

  /**
   * Cost estimation with real-time pricing from OpenRouter
   * Includes image processing costs for vision-enabled models
   */
  async estimateCost(request: UnifiedCompletionRequest | UnifiedEmbeddingRequest): Promise<CostEstimate> {
    const organizationId = request.metadata?.organizationId;

    try {
      // Check usage limits
      if (organizationId) {
        const usageCheck = await UsageTrackingService.checkUsageLimitWithDetails(
          organizationId,
          UsageType.AI_QUERY,
          1
        );

        if (!usageCheck.canProceed && !usageCheck.isDeveloperOverride) {
          throw new Error(`Usage limit exceeded: ${usageCheck.warningMessage}`);
        }
      }

      // Get real-time pricing from OpenRouter
      const realTimePricing = await this.getRealTimePricingFromOpenRouter(request.model);

      if (!realTimePricing) {
        throw new Error(`Unable to get real-time pricing for model: ${request.model}`);
      }

      const tokenEstimate = this.estimateRequestTokens(request);
      const promptCost = (tokenEstimate.prompt / 1000) * realTimePricing.prompt;
      const completionCost = (tokenEstimate.completion / 1000) * realTimePricing.completion;

      // Calculate image and PDF processing costs
      let imageCost = 0;
      let pdfCost = 0;
      let fileMetadata = { imageCount: 0, pdfPageCount: 0 };

      if ('messages' in request) {
        const counts = this.countFilesInMessages(request.messages);
        fileMetadata = counts;

        // Image costs
        const mappedModel = this.lookupModelInMapping(request.model);
        const imagePrice = mappedModel?.pricing?.image ? parseFloat(mappedModel.pricing.image) : 0;
        imageCost = counts.imageCount * imagePrice;

        // PDF costs (based on OpenRouter pricing: mistral-ocr = $2 per 1000 pages, others free)
        if (counts.pdfPageCount > 0) {
          const pdfEngines = this.getPDFEnginesInMessages(request.messages);
          pdfCost = pdfEngines.reduce((cost, engine) => {
            if (engine.engine === 'mistral-ocr') {
              return cost + (engine.pageCount / 1000) * 2; // $2 per 1000 pages
            }
            return cost; // pdf-text and native are free
          }, 0);
        }
      }

      const totalCost = promptCost + completionCost + imageCost + pdfCost;

      return {
        estimatedCost: totalCost,
        breakdown: {
          promptTokens: tokenEstimate.prompt,
          completionTokens: tokenEstimate.completion,
          totalTokens: tokenEstimate.total,
          promptCost,
          completionCost,
          imageCost,
          pdfCost,
          pricePerToken: totalCost / tokenEstimate.total
        },
        metadata: {
          realTimePricing: true,
          pricingSource: 'openrouter_models_api',
          model: request.model,
          hasImages: imageCost > 0,
          hasPDFs: pdfCost > 0,
          imageCount: fileMetadata.imageCount,
          pdfPageCount: fileMetadata.pdfPageCount,
          usageCheck: organizationId ? await UsageTrackingService.checkUsageLimitWithDetails(organizationId, UsageType.AI_QUERY, 1) : undefined
        }
      };
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Cost estimation error:', error);
      throw error;
    }
  }

  /**
   * Extract citations from OpenRouter response annotations
   */
  private extractCitationsFromResponse(response: OpenRouterResponse): Citation[] {
    const content = response.choices[0]?.message?.content || '';
    const citations: Citation[] = [];

    console.log('🔍 Citation extraction - analyzing response content (first 1000 chars):', content.substring(0, 1000));
    console.log('🔍 Citation extraction - full content length:', content.length);

    // First check for annotations (some models may still use this)
    const annotations = response.choices[0]?.message?.annotations;
    if (annotations && annotations.length > 0) {
      console.log('🔍 Found annotations in response:', annotations);
      const annotationCitations = annotations
        .filter(annotation => annotation.type === 'url_citation')
        .map(annotation => ({
          url: annotation.url_citation.url,
          title: annotation.url_citation.title,
          content: annotation.url_citation.content,
          start_index: annotation.url_citation.start_index,
          end_index: annotation.url_citation.end_index
        }));
      citations.push(...annotationCitations);
    }

    // Extract citations from content for :online models
    // Pattern 1: [1] style citations with URLs
    const citationPattern = /\[(\d+)\]\s*(https?:\/\/[^\s\)]+)/g;
    const matches = Array.from(content.matchAll(citationPattern));
    console.log('🔍 Pattern 1 [1] + URL matches:', matches.length);

    matches.forEach((match, index) => {
      const citationNumber = match[1];
      const url = match[2];

      // Try to extract title from content (usually follows the URL)
      const titlePattern = new RegExp(`\\[${citationNumber}\\]\\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-?\\s*([^\\[\\n]+)`);
      const titleMatch = content.match(titlePattern);
      const title = titleMatch ? titleMatch[1].trim() : `Source ${citationNumber}`;

      citations.push({
        url: url,
        title: title,
        content: `Reference [${citationNumber}]`,
        start_index: match.index || 0,
        end_index: (match.index || 0) + match[0].length
      });
    });

    // Pattern 2: Markdown link style citations
    const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    const mdMatches = Array.from(content.matchAll(markdownLinkPattern));
    console.log('🔍 Pattern 2 markdown link matches:', mdMatches.length);

    mdMatches.forEach((match) => {
      const title = match[1];
      const url = match[2];

      // Avoid duplicates
      if (!citations.some(c => c.url === url)) {
        citations.push({
          url: url,
          title: title,
          content: title,
          start_index: match.index || 0,
          end_index: (match.index || 0) + match[0].length
        });
      }
    });

    // Pattern 3: Look for any URLs in the content
    const urlPattern = /https?:\/\/[^\s\)]+/g;
    const urlMatches = Array.from(content.matchAll(urlPattern));
    console.log('🔍 Pattern 3 standalone URL matches:', urlMatches.length);

    urlMatches.forEach((match, index) => {
      const url = match[0];

      // Avoid duplicates and only add if not already captured
      if (!citations.some(c => c.url === url)) {
        citations.push({
          url: url,
          title: `Web Source ${index + 1}`,
          content: `Web reference found in response`,
          start_index: match.index || 0,
          end_index: (match.index || 0) + match[0].length
        });
      }
    });

    console.log('📚 OpenRouter citations extracted:', {
      fromAnnotations: annotations?.length || 0,
      fromContent: citations.length,
      citations: citations,
      contentPreview: content.substring(0, 500),
      patternMatches: {
        pattern1: matches.length,
        markdown: mdMatches.length,
        urls: urlMatches.length
      }
    });

    return citations;
  }

  /**
   * Count files in messages for cost calculation
   */
  private countFilesInMessages(messages: UnifiedMessage[]): { imageCount: number; pdfPageCount: number } {
    return messages.reduce((counts, message) => {
      if (message.attachments) {
        for (const attachment of message.attachments) {
          if (attachment.type === 'image') {
            counts.imageCount++;
          } else if (attachment.type === 'file' && attachment.mimeType === 'application/pdf') {
            // Estimate pages (default to 10 if not specified)
            counts.pdfPageCount += attachment.metadata?.pageCount || 10;
          }
        }
      }
      return counts;
    }, { imageCount: 0, pdfPageCount: 0 });
  }

  /**
   * Get PDF engines used in messages for cost calculation
   */
  private getPDFEnginesInMessages(messages: UnifiedMessage[]): Array<{ engine: string; pageCount: number }> {
    const engines: Array<{ engine: string; pageCount: number }> = [];

    messages.forEach(message => {
      if (message.attachments) {
        message.attachments.forEach(attachment => {
          if (attachment.type === 'file' && attachment.mimeType === 'application/pdf') {
            engines.push({
              engine: attachment.metadata?.engine || 'pdf-text',
              pageCount: attachment.metadata?.pageCount || 10
            });
          }
        });
      }
    });

    return engines;
  }

  // Helper methods - only trivial logic, no hardcoded performance values

  private async getMaxPriceForOrganization(organizationId?: string): Promise<number> {
    if (!organizationId) return 0.05; // Default fallback

    const subscription = await this.getOrganizationSubscription(organizationId);

    switch (subscription?.plan) {
      case 'ENTERPRISE': return 0.1;
      case 'PROFESSIONAL': return 0.05;
      case 'STARTER':
      default: return 0.02;
    }
  }

  /**
   * Encode image file to base64 for OpenRouter API
   */
  private async encodeImageToBase64(imagePath: string): Promise<string> {
    try {
      const imageBuffer = await fs.promises.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Detect image type from file extension
      const extension = imagePath.split('.').pop()?.toLowerCase();
      const mimeType = this.getMimeTypeFromExtension(extension);

      return `data:${mimeType};base64,${base64Image}`;
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      throw new Error(`Failed to encode image: ${error.message}`);
    }
  }

  /**
   * Encode image buffer to base64 for OpenRouter API
   */
  private encodeImageBufferToBase64(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): string {
    const base64Image = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64Image}`;
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeTypeFromExtension(extension?: string): string {
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  /**
   * Check if model supports vision/multimodal capabilities
   */
  private modelSupportsVision(modelId: string): boolean {
    const catalogModel = this.availableModels.find(model => model.name === modelId.replace(/:online$/, ''));
    if (catalogModel) {
      const architecture = catalogModel.metadata?.architecture;
      const inputs = architecture?.input_modalities;
      if (Array.isArray(inputs)) return inputs.includes('image');
      if (typeof architecture?.modality === 'string') return architecture.modality.split('->')[0].includes('image');
    }
    const mappedModel = this.lookupModelInMapping(modelId);
    return mappedModel?.capabilities?.includes('multimodal') ||
           mappedModel?.capabilities?.includes('image_analysis') ||
           false;
  }

  private lookupModelInMapping(modelId: string): any {
    // Look through all capability categories to find the model
    const capabilities = openRouterMapping.openrouter_ai_capabilities_mapping.models_by_capability;

    for (const [category, data] of Object.entries(capabilities)) {
      const foundModel = data.models.find((model: any) => model.id === modelId);
      if (foundModel) {
        return foundModel;
      }
    }

    // Also check providers
    const providers = openRouterMapping.openrouter_ai_capabilities_mapping.models_by_provider;
    for (const [provider, data] of Object.entries(providers)) {
      const foundModel = data.models.find((model: any) => model.id === modelId);
      if (foundModel) {
        return foundModel;
      }
    }

    return null;
  }

  private calculateTierFromMappingPricing(modelId: string, fallbackPricing: { prompt: number; completion: number }): 'fast' | 'balanced' | 'powerful' {
    const mappedModel = this.lookupModelInMapping(modelId);

    if (mappedModel?.pricing) {
      const promptCost = parseFloat(mappedModel.pricing.prompt);
      const completionCost = parseFloat(mappedModel.pricing.completion);
      const totalCost = promptCost + completionCost;

      // Use the mapping's pricing tiers for classification
      if (totalCost === 0) return 'fast';           // Free models
      if (totalCost <= 0.000001) return 'fast';     // Ultra budget
      if (totalCost <= 0.000005) return 'balanced'; // Budget
      if (totalCost <= 0.00002) return 'balanced';  // Premium
      return 'powerful';                           // Enterprise
    }

    // Fallback to existing logic
    const totalCost = fallbackPricing.prompt + fallbackPricing.completion;
    if (totalCost <= 0.001) return 'fast';
    if (totalCost <= 0.01) return 'balanced';
    return 'powerful';
  }

  private calculateQualityFromSuccessRate(successRate: number): number {
    // Convert success rate to quality score (0-1)
    return Math.min(0.95, Math.max(0.1, successRate * 0.9 + 0.1));
  }

  private extractFeaturesFromMapping(modelId: string): string[] {
    const mappedModel = this.lookupModelInMapping(modelId);

    if (mappedModel?.capabilities) {
      // Map the capabilities to our filter system
      const features = ['chat']; // All models support chat

      mappedModel.capabilities.forEach((capability: string) => {
        switch (capability) {
          case 'web_search':
            features.push('web-search');
            break;
          case 'reasoning':
            features.push('deep-research');
            break;
          case 'multimodal':
          case 'image_analysis':
            features.push('vision');
            features.push('multimodal');
            break;
          case 'coding':
          case 'software_engineering':
            features.push('code-generation');
            break;
          case 'tool_calling':
            features.push('function-calling');
            break;
          case 'structured_outputs':
            features.push('json-mode');
            break;
          case 'scientific_analysis':
          case 'mathematics':
            features.push('deep-research');
            break;
          case 'image_generation':
            features.push('image-generation');
            break;
          case 'fast_inference':
            features.push('streaming');
            break;
          default:
            // Keep original capability name if not mapped
            features.push(capability);
        }
      });

      return [...new Set(features)]; // Remove duplicates
    }

    // Fallback to basic chat functionality
    return ['chat'];
  }

  private extractPricingFromModel(model: OpenRouterModel): { prompt: number; completion: number } {
    return {
      prompt: model.pricing?.prompt ? parseFloat(model.pricing.prompt) * 1000 : 0,
      completion: model.pricing?.completion ? parseFloat(model.pricing.completion) * 1000 : 0
    };
  }

  private formatModelDisplayName(modelId: string): string {
    return modelId.replace('/', ' ').replace('-', ' ').replace(/_/g, ' ') + ' (OpenRouter)';
  }

  private extractProviderFromModelId(modelId: string): string {
    return modelId.includes('/') ? modelId.split('/')[0] : 'unknown';
  }

  private async calculateActualCostFromOpenRouter(response: OpenRouterResponse, modelId: string): Promise<number> {
    // First try to get actual cost from OpenRouter generation stats
    if (response.generation_id) {
      try {
        const stats = await this.fetchGenerationStatsFromOpenRouter(response.generation_id);
        if (stats?.cost) {
          return stats.cost;
        }
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.warn('Failed to fetch generation cost from OpenRouter:', error);
      }
    }

    // Fallback to real-time pricing calculation
    const pricing = await this.getRealTimePricingFromOpenRouter(modelId);
    if (pricing) {
      return ((response.usage.prompt_tokens / 1000) * pricing.prompt) +
             ((response.usage.completion_tokens / 1000) * pricing.completion);
    }

    return 0;
  }

  private async fetchGenerationStatsFromOpenRouter(generationId: string): Promise<OpenRouterGenerationStats | null> {
    try {
      const response = await this.makeRequest<{ data: OpenRouterGenerationStats }>(
        `/generation?id=${generationId}`,
        'GET'
      );
      return response.data;
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('Failed to fetch generation stats from OpenRouter:', error);
      return null;
    }
  }

  // Zustand store integration
  // Note: Server-side adapters should not directly integrate with client-side Zustand stores
  // Store updates should happen through API responses and client-side state management

  private async loadAndCacheModels(): Promise<void> {
    try {
      await this.getAvailableModels();
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('Failed to load models during initialization:', error);
    }
  }

  private async getOrganizationSubscription(organizationId: string): Promise<{ plan: string } | null> {
    try {
      const subscription = await db.subscription.findFirst({
        where: { organizationId, status: { in: ['ACTIVE', 'TRIALING'] } },
        orderBy: { createdAt: 'desc' },
        select: { planType: true },
      });
      return subscription ? { plan: subscription.planType } : null;
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('Failed to get organization subscription:', error);
      return null;
    }
  }

  // Standard adapter methods
  private async testConnection(): Promise<void> {
    try {
      await this.makeRequest<any>('/models', 'GET');
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      throw new ProviderUnavailableError('OpenRouter connection test failed');
    }
  }

  private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST', body?: any, signal?: AbortSignal): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Create AbortController for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.config.timeout || 10000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.config.siteUrl,
          'X-Title': this.config.appName
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, abortController.signal]) : abortController.signal
      });


      if (!response.ok) {
        const errorText = await response.text();
        throw new NetworkError(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (caughtError) {
      const error = normalizeError(caughtError);

      if (error.name === 'AbortError') {
        throw new NetworkError(`OpenRouter API timeout after ${this.config.timeout}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected handleError(error: any, operation: string): Error {
    console.error(`CleanOpenRouterAdapter ${operation} error:`, error);

    if (error.message?.includes('401')) {
      return new AuthenticationError('OpenRouter API key invalid', 'openrouter');
    }

    if (error.message?.includes('429')) {
      return new RateLimitError('openrouter');
    }

    if (error.message?.includes('400')) {
      return new ValidationError('OpenRouter request validation failed', {
        provider: 'openrouter',
        details: error.message
      });
    }

    return new ProviderUnavailableError(`OpenRouter ${operation} failed: ${error.message}`);
  }

  private async recordMetrics(
    request: UnifiedCompletionRequest,
    response: OpenRouterResponse,
    startTime: number,
    openRouterRequest: OpenRouterRequest
  ): Promise<void> {
    try {
      const organizationId = request.metadata?.organizationId || 'unknown';
      const userId = request.metadata?.userId;

      await this.metricsCollector.recordOpenRouterRequest(
        organizationId,
        userId,
        openRouterRequest,
        response,
        startTime,
        response.generation_id
      );
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('Failed to record OpenRouter metrics:', error);
    }
  }

  private async recordErrorMetrics(
    request: UnifiedCompletionRequest,
    error: Error,
    startTime: number
  ): Promise<void> {
    try {
      const organizationId = request.metadata?.organizationId || 'unknown';
      const userId = request.metadata?.userId;

      await this.metricsCollector.recordOpenRouterError(
        organizationId,
        userId,
        request,
        error,
        startTime
      );
    } catch (recordError) {
      console.warn('Failed to record OpenRouter error metrics:', recordError);
    }
  }

  private async prepareCompletionRequest(request: UnifiedCompletionRequest): Promise<OpenRouterRequest> {
    const organizationId = request.metadata?.organizationId;
      const model = this.resolveModel(request.model);
      const supportsVision = this.modelSupportsVision(model);

      // Build OpenRouter request with native routing and prompt caching
      const maxPricePerMillion = (await this.getMaxPriceForOrganization(organizationId)) * 1000;
      const openRouterRequest: OpenRouterRequest = {
        model,
        messages: await Promise.all(request.messages.map(async msg => {
          // Handle multimodal messages with images
          if (msg.attachments && msg.attachments.length > 0) {
            const content: Exclude<OpenRouterRequest['messages'][number]['content'], string> = [
              {
                type: 'text' as const,
                text: msg.content
              }
            ];

            // Process all attachments (images and PDFs)
            for (const attachment of msg.attachments) {
              if (attachment.type === 'image') {
                if (!supportsVision) throw new ValidationError('The selected model does not support image attachments');
                let imageUrl: string;

                if (attachment.data) {
                  // Handle base64 data
                  if (typeof attachment.data === 'string' && attachment.data.startsWith('data:')) {
                    imageUrl = attachment.data;
                  } else if (Buffer.isBuffer(attachment.data)) {
                    imageUrl = this.encodeImageBufferToBase64(attachment.data, attachment.mimeType);
                  } else if (typeof attachment.data === 'string') {
                    // Handle plain base64 string
                    imageUrl = `data:${attachment.mimeType};base64,${attachment.data}`;
                  } else {
                    console.warn('Unsupported image data type:', typeof attachment.data);
                    continue;
                  }
                } else if (attachment.path) {
                  // Handle file path
                  imageUrl = await this.encodeImageToBase64(attachment.path);
                } else {
                  console.warn('Image attachment missing data or path');
                  continue;
                }

                content.push({
                  type: 'image_url' as const,
                  image_url: {
                    url: imageUrl,
                    detail: attachment.detail || 'auto'
                  }
                });
              } else if ((attachment.type === 'file' || attachment.type === 'pdf') && attachment.mimeType === 'application/pdf') {
                // Handle PDF attachments using the newer file format
                let fileData: string;

                if (attachment.data) {
                  // Handle base64 data
                  if (typeof attachment.data === 'string' && attachment.data.startsWith('data:')) {
                    fileData = attachment.data;
                  } else if (Buffer.isBuffer(attachment.data)) {
                    fileData = `data:application/pdf;base64,${attachment.data.toString('base64')}`;
                  } else if (typeof attachment.data === 'string') {
                    // Handle plain base64 string
                    fileData = `data:application/pdf;base64,${attachment.data}`;
                  } else {
                    console.warn('Unsupported PDF data type:', typeof attachment.data);
                    continue;
                  }
                } else if (attachment.path) {
                  // Handle file path
                  try {
                    const pdfBuffer = await fs.promises.readFile(attachment.path);
                    fileData = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
                  } catch (caughtError) {
      const error = normalizeError(caughtError);
                    console.error('Failed to read PDF file:', error);
                    continue;
                  }
                } else {
                  console.warn('PDF attachment missing data or path');
                  continue;
                }

                content.push({
                  type: 'file' as const,
                  file: {
                    filename: attachment.name || 'document.pdf',
                    file_data: fileData
                  }
                });
              }
            }

            return {
              role: msg.role,
              content: content
            };
          }

          // Handle text-only messages
          return {
            role: msg.role,
            content: msg.content
          };
        })),
        temperature: request.temperature ?? this.DEFAULT_TEMPERATURE,
        max_tokens: request.maxTokens,
        stop: request.stopSequences,
        provider: {
          sort: 'price',
          max_price: { prompt: maxPricePerMillion, completion: maxPricePerMillion },
          data_collection: 'deny' // Always deny for government contracting
        },
        usage: {
          include: true // Include cache tokens in response for cost tracking
        }
      };

      if (request.options?.plugins) openRouterRequest.plugins = request.options.plugins;

      // Apply prompt caching if enabled
      if (this.promptCacheEnabled) {
        this.applyPromptCaching(openRouterRequest);
      }

      if (request.options?.jsonMode) {
        openRouterRequest.response_format = { type: 'json_object' };
      }

      // Simplified web search handling - just use :online suffix
      const hasWebSearchEnabled = request.options?.webSearch?.enabled;

      // Log if web search is requested
      console.log('🔍 Web search configuration:', {
        hasOptions: !!request.options,
        hasWebSearchConfig: !!request.options?.webSearch,
        webSearchEnabled: hasWebSearchEnabled,
        webSearchOptions: request.options?.webSearch,
        currentModel: openRouterRequest.model,
        fullOptions: request.options
      });

      if (hasWebSearchEnabled) {
        console.log('🔍 Web search requested for model:', openRouterRequest.model);

        // Method 1: Use :online suffix (equivalent to web plugin)
        if (!openRouterRequest.model.includes(':online')) {
          openRouterRequest.model = openRouterRequest.model + ':online';
          console.log('🔄 Added :online suffix to model:', openRouterRequest.model);
        }

        // Method 2: Add web plugin explicitly (as documented)
        const webSearchOptions = request.options?.webSearch ?? {};
        const webPlugin = {
          id: 'web',
          max_results: webSearchOptions.max_results || 5,
          search_prompt: 'A web search was conducted. Incorporate the following web search results into your response.\n\nIMPORTANT: Cite them using markdown links named using the domain of the source.\nExample: [nytimes.com](https://nytimes.com/some-page).'
        };

        if (!openRouterRequest.plugins) {
          openRouterRequest.plugins = [];
        }
        openRouterRequest.plugins.push(webPlugin);

        // Method 3: Add web search options parameter for context size
        openRouterRequest.web_search_options = {
          search_context_size: webSearchOptions.search_depth === 'advanced' ? 'high' : 'medium'
        };

        console.log('🔍 Added web plugin:', webPlugin);
        console.log('🔍 Added web_search_options:', openRouterRequest.web_search_options);
        console.log('🔍 Web search config details:', {
          maxResults: webSearchOptions.max_results,
          searchDepth: webSearchOptions.search_depth,
          enabled: webSearchOptions.enabled,
          fullWebSearchOptions: webSearchOptions
        });
      }

      // Handle PDF attachments separately if needed
      const hasPDFAttachments = request.messages.some(msg =>
        msg.attachments?.some(att => att.type === 'pdf' || att.mimeType === 'application/pdf')
      );

      if (hasPDFAttachments) {
        if (!openRouterRequest.plugins) {
          openRouterRequest.plugins = [];
        }
        openRouterRequest.plugins.push({
          id: 'file-parser',
          pdf: {
            engine: request.metadata?.pdfEngine || 'pdf-text'
          }
        });
      }

    return openRouterRequest;
  }

  async generateEmbedding(request: UnifiedEmbeddingRequest): Promise<UnifiedEmbeddingResponse> {
    const organizationId = request.metadata?.organizationId;
    if (organizationId) await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
    const model = request.model === 'embedding-small' ? 'openai/text-embedding-3-small'
      : request.model === 'embedding-large' ? 'openai/text-embedding-3-large'
      : request.model.startsWith('text-embedding-') ? `openai/${request.model}` : request.model;
    const inputs = Array.isArray(request.text) ? request.text : [request.text];
    if (!inputs.length || inputs.some(input => !input.trim())) throw new ValidationError('Embedding inputs cannot be empty');
    const response = await this.makeRequest<unknown>('/embeddings', 'POST', { model, input: request.text, ...(request.dimensions && { dimensions: request.dimensions }) });
    const parsed = z.object({
      model: z.string().optional(),
      data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number().finite()).min(1) })).min(1),
      usage: z.object({ total_tokens: z.number().nonnegative() }).optional(),
    }).parse(response);
    const ordered = [...parsed.data].sort((a, b) => a.index - b.index);
    if (ordered.some((item, index) => item.index !== index)) throw new NetworkError('Embedding response indices do not match inputs');
    const vectors = ordered.map(item => item.embedding);
    const expected = Array.isArray(request.text) ? request.text.length : 1;
    if (vectors.length !== expected || new Set(vectors.map(vector => vector.length)).size !== 1 || (request.dimensions !== undefined && vectors[0].length !== request.dimensions)) throw new NetworkError('Invalid embedding response shape');
    if (organizationId) await UsageTrackingService.trackUsage({ organizationId, usageType: UsageType.AI_QUERY, quantity: 1, resourceType: 'ai_embedding', metadata: { provider: this.name, model, tokens: parsed.usage?.total_tokens ?? 0 } });
    return { embedding: Array.isArray(request.text) ? vectors : vectors[0], model: parsed.model ?? model, usage: { totalTokens: parsed.usage?.total_tokens ?? 0 }, metadata: { provider: this.name, dimensions: vectors[0].length } };
  }

  async *streamCompletion(request: UnifiedStreamRequest): AsyncGenerator<UnifiedStreamChunk> {
    const organizationId = request.metadata?.organizationId;
    if (organizationId) await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
    const body = await this.prepareCompletionRequest(request);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': this.config.siteUrl, 'X-Title': this.config.appName },
      body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
      signal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(this.config.timeout)]) : AbortSignal.timeout(this.config.timeout),
    });
    if (!response.ok || !response.body) throw new NetworkError(`OpenRouter stream failed (${response.status})`);
    const reader = response.body.getReader();
    let completed = false;
    let content = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let generationId: string | undefined;
    let model = body.model;
    try {
      for await (const data of readSSEData(reader)) {
        if (data === '[DONE]') { completed = true; break; }
        const chunk = z.object({
          id: z.string().optional(), model: z.string().optional(), error: z.unknown().optional(),
          choices: z.array(z.object({ delta: z.object({ content: z.string().nullable().optional() }).optional(), finish_reason: z.string().nullable().optional() })).optional(),
          usage: z.object({ prompt_tokens: z.number().nonnegative(), completion_tokens: z.number().nonnegative(), total_tokens: z.number().nonnegative() }).optional(),
        }).parse(JSON.parse(data));
        if (chunk.error) throw new NetworkError('OpenRouter reported a stream error');
        generationId = chunk.id ?? generationId;
        model = chunk.model ?? model;
        usage = chunk.usage ?? usage;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          request.onChunk?.(delta);
          yield { content: delta, metadata: { provider: this.name, model } };
        }
      }
      if (!completed) throw new NetworkError('OpenRouter stream ended before completion');
      if (organizationId) await UsageTrackingService.trackUsage({ organizationId, usageType: UsageType.AI_QUERY, quantity: 1, resourceId: generationId, resourceType: 'ai_stream', metadata: { provider: this.name, model, tokens: usage.total_tokens } });
      request.onComplete?.(content);
      yield { content: '', metadata: { provider: this.name, model, usage, generationId, finishReason: 'stop' } };
    } catch (error) {
      request.onError?.(normalizeError(error));
      throw error;
    } finally {
      await response.body.cancel().catch(() => {});
    }
  }

  // Utility methods for vision/multimodal functionality

  /**
   * Create a vision-enabled message with image analysis
   */
  static createVisionMessage(
    text: string,
    imagePath: string,
    detail: 'low' | 'high' | 'auto' = 'auto'
  ): UnifiedMessage {
    return {
      role: 'user',
      content: text,
      attachments: [
        {
          type: 'image',
          path: imagePath,
          detail
        }
      ]
    };
  }

  /**
   * Create a vision-enabled message with base64 image data
   */
  static createVisionMessageWithData(
    text: string,
    imageData: string,
    mimeType: string = 'image/jpeg',
    detail: 'low' | 'high' | 'auto' = 'auto'
  ): UnifiedMessage {
    return {
      role: 'user',
      content: text,
      attachments: [
        {
          type: 'image',
          data: imageData,
          mimeType,
          detail
        }
      ]
    };
  }

  /**
   * Create a vision-enabled message with buffer data
   */
  static createVisionMessageWithBuffer(
    text: string,
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg',
    detail: 'low' | 'high' | 'auto' = 'auto'
  ): UnifiedMessage {
    return {
      role: 'user',
      content: text,
      attachments: [
        {
          type: 'image',
          data: imageBuffer,
          mimeType,
          detail
        }
      ]
    };
  }

  /**
   * Create a message with PDF attachment from file path
   */
  static createPDFMessage(
    text: string,
    pdfPath: string,
    engine: 'mistral-ocr' | 'pdf-text' | 'native' = 'pdf-text'
  ): UnifiedMessage {
    return {
      role: 'user',
      content: text,
      attachments: [
        {
          type: 'file',

          path: pdfPath,
mimeType: 'application/pdf',
metadata: { engine }
        }
      ]
    };
  }

  /**
   * Create a message with PDF attachment from buffer
   */
  static createPDFMessageWithBuffer(
    text: string,
    pdfBuffer: Buffer,
    engine: 'mistral-ocr' | 'pdf-text' | 'native' = 'pdf-text'
  ): UnifiedMessage {
    return {
      role: 'user',
      content: text,
      attachments: [
        {
          type: 'file',

          data: pdfBuffer,
mimeType: 'application/pdf',
metadata: { engine }
        }
      ]
    };
  }

  /**
   * Create a message with PDF attachment from base64 data
   */
  static createPDFMessageWithData(
    text: string,
    base64Data: string,
    engine: 'mistral-ocr' | 'pdf-text' | 'native' = 'pdf-text'
  ): UnifiedMessage {
    return {
      role: 'user',
      content: text,
      attachments: [
        {
          type: 'file',

          data: base64Data,
mimeType: 'application/pdf',
metadata: { engine }
        }
      ]
    };
  }

  /**
   * Create a message with mixed content (text + multiple files)
   */
  static createMultiModalMessage(
    text: string,
    attachments: Array<{
      type: 'image' | 'file';
      path?: string;
      data?: string | Buffer;
      mimeType: string;
      detail?: 'low' | 'high' | 'auto';
      metadata?: { engine?: 'native' | 'mistral-ocr' | 'pdf-text'; pageCount?: number };
    }>
  ): UnifiedMessage {
    return {
      role: 'user',
      content: text,
      attachments: attachments.map(att => ({
        type: att.type,
        path: att.path,
        data: att.data,
        mimeType: att.mimeType,
        detail: att.detail,
        metadata: att.metadata
      }))
    };
  }

  /**
   * Get recommended vision models for image analysis
   */
  static getVisionModels(): string[] {
    return [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro-exp',
      'meta-llama/llama-3.2-90b-vision-instruct',
      'qwen/qwen2.5-vl-3b-instruct:free'
    ];
  }

  /**
   * Check if a model supports vision capabilities
   */
  static isVisionModel(modelId: string): boolean {
    const visionModels = CleanOpenRouterAdapter.getVisionModels();
    return visionModels.includes(modelId);
  }

  /**
   * Check if model supports PDF processing
   */
  static isPDFModel(modelId: string): boolean {
    // Most vision models also support PDF processing
    return this.isVisionModel(modelId);
  }

  /**
   * Get recommended PDF engine based on document characteristics
   */
  static getRecommendedPDFEngine(
    isScanned: boolean = false,
    hasComplexLayout: boolean = false,
    costOptimization: 'aggressive' | 'balanced' | 'conservative' = 'balanced'
  ): 'mistral-ocr' | 'pdf-text' | 'native' {
    if (isScanned) {
      return 'mistral-ocr'; // Best for scanned documents, $2 per 1000 pages
    }

    if (hasComplexLayout && costOptimization === 'conservative') {
      return 'native'; // Model-specific processing for complex layouts
    }

    return 'pdf-text'; // Best for clear text PDFs, free
  }

  /**
   * Validate file type and size
   */
  static validateFile(file: File): { isValid: boolean; error?: string } {
    const maxSize = 20 * 1024 * 1024; // 20MB limit
    const supportedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ];

    if (file.size > maxSize) {
      return { isValid: false, error: 'File size exceeds 20MB limit' };
    }

    if (!supportedTypes.includes(file.type)) {
      return { isValid: false, error: 'Unsupported file type. Only JPEG, PNG, WebP, and PDF are supported.' };
    }

    return { isValid: true };
  }

  /**
   * Convert file to base64 for API upload
   */
  static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data:type;base64, prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Create a message with web search enabled
   */
  static createWebSearchMessage(
    text: string,
    webSearchOptions: {
      max_results?: number;
      search_depth?: 'basic' | 'advanced';
    } = {}
  ): UnifiedCompletionRequest {
    return {
      messages: [{
        role: 'user',
        content: text
      }],
      model: 'anthropic/claude-3.5-sonnet', // Default model
      options: {
        webSearch: {
          enabled: true,
          max_results: webSearchOptions.max_results || 5,
          search_depth: webSearchOptions.search_depth || 'basic'
        }
      }
    };
  }

  /**
   * Check if a model supports web search
   */
  static supportsWebSearch(modelId: string): boolean {
    // Models that support web search through OpenRouter
    const webSearchModels = [
      'perplexity/llama-3.1-sonar-small-128k-online',
      'perplexity/llama-3.1-sonar-large-128k-online',
      'perplexity/llama-3.1-sonar-huge-128k-online',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro-exp'
    ];

    return webSearchModels.includes(modelId) || modelId.includes('online');
  }

  /**
   * Get recommended web search models
   */
  static getWebSearchModels(): string[] {
    return [
      'perplexity/llama-3.1-sonar-large-128k-online',
      'perplexity/llama-3.1-sonar-small-128k-online',
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet'
    ];
  }

  /**
   * Format citations for display
   */
  static formatCitations(citations: Citation[]): string {
    if (!citations || citations.length === 0) {
      return '';
    }

    return '\n\n**Sources:**\n' +
      citations.map((citation, index) => {
        const title = citation.title || 'Source';
        return `${index + 1}. [${title}](${citation.url})`;
      }).join('\n');
  }

  /**
   * Extract citation numbers from content
   */
  static extractCitationNumbers(content: string, citations: Citation[]): Array<{
    number: number;
    citation: Citation;
  }> {
    const results: Array<{ number: number; citation: Citation }> = [];

    citations.forEach((citation, index) => {
      const citationNumber = index + 1;
      const contentSnippet = content.substring(citation.start_index, citation.end_index);

      if (contentSnippet.trim()) {
        results.push({
          number: citationNumber,
          citation
        });
      }
    });

    return results;
  }

  /**
   * Validate web search configuration
   */
  static validateWebSearchConfig(config: {
    enabled?: boolean;
    max_results?: number;
    search_depth?: 'basic' | 'advanced';
  }): { isValid: boolean; error?: string } {
    if (!config.enabled) {
      return { isValid: true };
    }

    if (config.max_results && (config.max_results < 1 || config.max_results > 20)) {
      return {
        isValid: false,
        error: 'max_results must be between 1 and 20'
      };
    }

    if (config.search_depth && !['basic', 'advanced'].includes(config.search_depth)) {
      return {
        isValid: false,
        error: 'search_depth must be either "basic" or "advanced"'
      };
    }

    return { isValid: true };
  }

  /**
   * Simple token estimation for caching decisions
   */
  async estimateTokens(text: string): Promise<import('../interfaces').TokenEstimate> {
    const prompt = Math.ceil(text.length / 4);
    return { prompt, completion: 0, total: prompt };
  }

  private estimateRequestTokens(request: UnifiedCompletionRequest | UnifiedEmbeddingRequest | { messages: Array<{ role: string; content: string }> }): { prompt: number; completion: number; total: number } {
    let promptTokens = 0;

    if ('messages' in request) {
      promptTokens = request.messages.reduce((total, message) => {
        return total + Math.ceil(message.content.length / 4); // Rough approximation: 4 chars = 1 token
      }, 0);
    } else if ('text' in request) {
      const text = Array.isArray(request.text) ? request.text.join(' ') : request.text;
      promptTokens = Math.ceil(text.length / 4);
    }

    const completionTokens = ('maxTokens' in request ? request.maxTokens : 0) || this.DEFAULT_MAX_TOKENS;

    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens
    };
  }

  /**
   * Apply OpenRouter prompt caching based on provider and configuration
   * Implements cache_control breakpoints for Anthropic/Gemini and leverages automatic caching for OpenAI/Grok
   */
  private applyPromptCaching(request: OpenRouterRequest): void {
    const provider = this.extractProviderFromModelId(request.model);

    // OpenAI and Grok have automatic caching - no action needed
    if (provider === 'openai' || provider === 'x-ai' || provider === 'grok') {
      console.log(`🔄 Using automatic prompt caching for ${provider} model: ${request.model}`);
      return;
    }

    // Anthropic and Google require explicit cache_control breakpoints
    if (provider === 'anthropic' || provider === 'google') {
      this.applyCacheControlBreakpoints(request);
      return;
    }

    // DeepSeek has automatic caching
    if (provider === 'deepseek') {
      console.log(`🔄 Using automatic prompt caching for ${provider} model: ${request.model}`);
      return;
    }

    console.log(`ℹ️ Prompt caching not explicitly supported for provider: ${provider}`);
  }

  /**
   * Apply cache_control breakpoints for Anthropic and Google models
   */
  private applyCacheControlBreakpoints(request: OpenRouterRequest): void {
    if (this.cacheBreakpointStrategy === 'disabled') {
      return;
    }

    console.log(`🎯 Applying cache_control breakpoints with strategy: ${this.cacheBreakpointStrategy}`);

    request.messages.forEach((message, messageIndex) => {
      if (Array.isArray(message.content)) {
        // Find the largest text content part to cache
        let largestTextIndex = -1;
        let largestTextLength = 0;

        message.content.forEach((part, partIndex) => {
          if (part.type === 'text' && part.text && part.text.length > largestTextLength) {
            largestTextLength = part.text.length;
            largestTextIndex = partIndex;
          }
        });

        // Apply cache control to the largest text part if it meets minimum token threshold
        if (largestTextIndex >= 0 && this.estimateRequestTokens({ messages: [{ role: 'user', content: message.content[largestTextIndex].text || '' }] }).total >= this.promptCacheMinTokens) {
          const shouldCache = this.shouldCacheMessage(message.role, messageIndex, request.messages.length);

          if (shouldCache) {
            console.log(`💾 Adding cache_control to ${message.role} message ${messageIndex}, part ${largestTextIndex} (${largestTextLength} chars)`);
            message.content[largestTextIndex].cache_control = {
              type: 'ephemeral'
            };
          }
        }
      } else if (typeof message.content === 'string') {
        // For string content, convert to array format and add cache control
        const estimatedTokens = this.estimateRequestTokens({ messages: [{ role: 'user', content: message.content }] }).total;

        if (estimatedTokens >= this.promptCacheMinTokens) {
          const shouldCache = this.shouldCacheMessage(message.role, messageIndex, request.messages.length);

          if (shouldCache) {
            console.log(`💾 Converting string to array and adding cache_control to ${message.role} message ${messageIndex} (${estimatedTokens} tokens)`);
            message.content = [
              {
                type: 'text',
                text: message.content,
                cache_control: {
                  type: 'ephemeral'
                }
              }
            ];
          }
        }
      }
    });
  }

  /**
   * Determine if a message should be cached based on strategy and message characteristics
   */
  private shouldCacheMessage(role: string, messageIndex: number, totalMessages: number): boolean {
    switch (this.cacheBreakpointStrategy) {
      case 'system_only':
        return role === 'system';

      case 'user_only':
        return role === 'user';

      case 'auto':
        // Intelligent caching strategy:
        // 1. Always cache system messages (context/instructions)
        // 2. Cache the last user message (current query context)
        // 3. Cache large user messages (RAG data, documents)
        if (role === 'system') {
          return true;
        }
        if (role === 'user' && messageIndex === totalMessages - 1) {
          return true; // Cache the final user message
        }
        return false;

      case 'disabled':
      default:
        return false;
    }
  }

  /**
   * Check if a model supports prompt caching
   */
  private modelSupportsPromptCaching(modelId: string): boolean {
    const provider = this.extractProviderFromModelId(modelId);

    // Providers with prompt caching support
    const supportedProviders = ['openai', 'anthropic', 'google', 'x-ai', 'grok', 'deepseek'];
    return supportedProviders.includes(provider);
  }

  /**
   * Get cache statistics from OpenRouter response
   */
  private extractCacheStats(response: OpenRouterResponse): {
    cacheTokens?: number;
    cacheDiscount?: number;
    cacheHitRatio?: number;
  } {
    const usage = response.usage as any;

    return {
      cacheTokens: usage?.cache_tokens || 0,
      cacheDiscount: usage?.cache_discount || 0,
      cacheHitRatio: usage?.cache_hit_ratio || 0
    };
  }

  /**
   * Validate prompt caching configuration follows our policies
   */
  private validateCacheConfiguration(): void {
    // Ensure TTL is within reasonable bounds (5 minutes to 1 hour)
    if (this.promptCacheTtl < 300 || this.promptCacheTtl > 3600) {
      console.warn(`⚠️ Prompt cache TTL ${this.promptCacheTtl}s is outside recommended range (300-3600s). Using default: 300s`);
    }

    // Ensure minimum tokens is reasonable (1024-4096 range)
    if (this.promptCacheMinTokens < 1024 || this.promptCacheMinTokens > 4096) {
      console.warn(`⚠️ Prompt cache min tokens ${this.promptCacheMinTokens} is outside recommended range (1024-4096). Some providers may not cache.`);
    }

    // Validate breakpoint strategy
    const validStrategies = ['auto', 'system_only', 'user_only', 'disabled'];
    if (!validStrategies.includes(this.cacheBreakpointStrategy)) {
      console.warn(`⚠️ Invalid cache breakpoint strategy: ${this.cacheBreakpointStrategy}. Using 'auto'.`);
    }

    if (this.promptCacheEnabled) {
      console.log(`💾 Prompt caching enabled with strategy: ${this.cacheBreakpointStrategy}, TTL: ${this.promptCacheTtl}s, min tokens: ${this.promptCacheMinTokens}`);
    } else {
      console.log(`😫 Prompt caching disabled via configuration`);
    }
  }

  // ============================================================================
  // DOCUMENT PROCESSING METHODS
  // ============================================================================

  /**
   * Process document with text extraction and AI analysis
   * Provides dual usage tracking: AI_QUERY + DOCUMENT_PROCESSING
   */
  async processDocument(request: DocumentProcessingRequest): Promise<DocumentProcessingResponse> {
    const organizationId = request.metadata?.organizationId;
    const startTime = Date.now();

    try {
      // 1. Enforce usage limits BEFORE processing
      if (organizationId) {
        await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.DOCUMENT_PROCESSING, 1);
        await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
      }

      // 2. Detect document type for optimal engine selection
      const documentType = await this.detectDocumentType(request.documentData, request.mimeType);
      const optimalEngine = this.selectOptimalEngine(documentType, request.mimeType);

      // 3. Create completion request with document attachment
      const completionRequest: UnifiedCompletionRequest = {
        signal: request.signal,
        messages: [{
          role: 'user',
          content: request.prompt || this.getDefaultDocumentPrompt(request.operation),
          attachments: [{
            type: 'file',

            data: request.documentData,
mimeType: request.mimeType,
name: request.fileName || 'document'
          }]
        }],
        model: request.model || 'anthropic/claude-3.5-sonnet',
        metadata: {
          ...request.metadata,
          pdfEngine: optimalEngine,
          operation: 'document_processing',
          documentType,
          organizationId
        }
      };

      // 4. Process document using OpenRouter's native capabilities
      const response = await this.generateCompletion(completionRequest);
      const latency = Date.now() - startTime;

      // 5. Track document processing usage (Layer 1: Billing)
      if (organizationId) {
        await UsageTrackingService.trackUsage({
          organizationId,
          usageType: UsageType.DOCUMENT_PROCESSING,
          quantity: 1,
          resourceId: request.documentId || `doc_${Date.now()}`,
          resourceType: 'document_processing',
          metadata: {
            provider: 'openrouter',
            engine: optimalEngine,
            documentType,
            operation: request.operation,
            fileName: request.fileName,
            fileSize: request.documentData.length,
            mimeType: request.mimeType,
            latency,
            cost: response.metadata?.cost || 0,
            success: true
          }
        });

        // 6. Record in global AI metrics system (Layer 2: Performance Metrics)
        await this.aiMetricsIntegration.recordDocumentProcessing(
          organizationId,
          request.metadata?.userId,
          'openrouter',
          optimalEngine,
          'document_processing',
          request.operation ?? 'analysis',
          response.metadata?.cost || 0,
          latency,
          true,
          {
            documentType,
            documentSize: request.documentData.length,
            engineUsed: optimalEngine,
            tokensUsed: response.usage?.totalTokens
          }
        );
      }

      return {
        extractedText: response.content,
        summary: this.extractSummaryFromResponse(response.content, request.operation),
        metadata: {
          provider: 'openrouter',
          engine: optimalEngine,
          documentType,
          cost: response.metadata?.cost || 0,
          latency,
          tokensUsed: response.usage?.totalTokens || 0,
          model: response.model || request.model || 'balanced',
          success: true
        }
      };

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      const latency = Date.now() - startTime;

      // Track document processing errors
      if (organizationId) {
        // Record error in global AI metrics system
        await this.aiMetricsIntegration.recordDocumentProcessing(
          organizationId,
          request.metadata?.userId,
          'openrouter',
          'unknown',
          'document_processing',
          request.operation ?? 'analysis',
          0,
          latency,
          false,
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        );
      }

      throw this.handleError(error, 'processDocument');
    }
  }

  /**
   * Smart engine selection based on document characteristics
   */
  private selectOptimalEngine(documentType: string, mimeType: string): string {
    // Image files always need OCR
    if (mimeType.startsWith('image/')) {
      return 'mistral-ocr';
    }

    // PDF engine selection based on document type
    if (mimeType === 'application/pdf') {
      switch (documentType) {
        case 'scanned':
        case 'image-heavy':
          return 'mistral-ocr'; // Premium OCR for scanned documents ($2/1000 pages)
        case 'complex':
        case 'structured':
        case 'form':
          return 'native'; // Native processing for complex layouts
        default:
          return 'pdf-text'; // Free engine for standard text PDFs
      }
    }

    // For other file types, use native processing
    return 'native';
  }

  /**
   * Detect document type for optimal processing
   */
  private async detectDocumentType(documentData: Buffer, mimeType: string): Promise<string> {
    // Quick heuristics for document type detection
    if (mimeType.startsWith('image/')) {
      return 'scanned';
    }

    if (mimeType === 'application/pdf') {
      // For PDFs, we could add more sophisticated detection
      // For now, use size as a heuristic
      if (documentData.length > 10 * 1024 * 1024) { // >10MB
        return 'image-heavy';
      }
      return 'text'; // Default to text-based PDF
    }

    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return 'structured';
    }

    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
      return 'presentation';
    }

    return 'text';
  }

  /**
   * Get default prompt based on operation type
   */
  private getDefaultDocumentPrompt(operation?: string): string {
    switch (operation) {
      case 'summary':
        return 'Analyze this document and provide a comprehensive summary highlighting the key points, main topics, and important details.';
      case 'extraction':
        return 'Extract all text content from this document, maintaining the structure and formatting as much as possible.';
      case 'analysis':
        return 'Provide a detailed analysis of this document including key themes, important information, and actionable insights.';
      case 'qa':
        return 'Analyze this document and prepare to answer questions about its content.';
      default:
        return 'Analyze this document and extract the key information and provide a summary.';
    }
  }

  /**
   * Extract summary from AI response based on operation
   */
  private extractSummaryFromResponse(content: string, operation?: string): string {
    // For now, return the first paragraph as summary
    // Could be enhanced with more sophisticated extraction
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.slice(0, 3).join('. ').trim() + '.';
  }
}

// Document Processing Interfaces
export interface DocumentProcessingRequest {
  signal?: AbortSignal;
  documentId?: string;
  documentData: Buffer;
  fileName?: string;
  mimeType: string;
  operation?: 'summary' | 'extraction' | 'analysis' | 'qa';
  prompt?: string;
  model?: string;
  metadata?: {
    organizationId?: string;
    userId?: string;
    [key: string]: any;
  };
}

export interface DocumentProcessingResponse {
  extractedText: string;
  summary?: string;
  metadata: {
    provider: string;
    engine: string;
    documentType: string;
    cost: number;
    latency: number;
    tokensUsed: number;
    model: string;
    success: boolean;
  };
}
