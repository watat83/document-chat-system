import { sdkRequestOptions } from '../sdk-request';
import { consumeSDKStream } from '../sdk-stream';
import { completionUsage, metricTokens } from '../usage';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, embed, embedMany } from 'ai';
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
  TokenEstimate
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

import { cacheManager } from '@/lib/cache';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { validateCSRFInAPIRoute } from '@/lib/csrf';
import { AIMetricsIntegration } from '../monitoring/ai-metrics-integration';

export interface OpenAIConfig {
  apiKey: string;
  organizationId?: string;
  maxRetries?: number;
  timeout?: number;
}

export class OpenAIAdapter extends AIProviderAdapter {
  private config: OpenAIConfig;
  private client: ReturnType<typeof createOpenAI>;
  private aiMetricsIntegration: AIMetricsIntegration;

  // Model mapping from unified names to OpenAI model IDs
  private modelMapping: Record<string, string> = {
    'fast': ai.modelFast,
    'balanced': ai.modelBalanced,
    'powerful': ai.modelPowerful,
    'embedding-small': 'text-embedding-3-small',
    'embedding-large': 'text-embedding-3-large'
  };

  // Cost per 1K tokens (as of 2024)
  private costPerToken: Record<string, { prompt: number; completion: number }> = {
    'gpt-4o': { prompt: 0.005, completion: 0.015 },
    'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
    'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
    'text-embedding-3-small': { prompt: 0.00002, completion: 0 },
    'text-embedding-3-large': { prompt: 0.00013, completion: 0 }
  };

  constructor(config: OpenAIConfig) {
    super('openai');
    if (!config.apiKey?.trim()) throw new ProviderConfigurationError('OpenAI API key is required');
    this.config = config;
    this.client = createOpenAI({ apiKey: config.apiKey, organization: config.organizationId });
    this.aiMetricsIntegration = new AIMetricsIntegration();
  }

  async initialize(): Promise<void> {
    try {
      // Test API connection with a simple completion
      if (!await this.checkHealth()) throw new ProviderUnavailableError('openai', 'Health check failed');
      this.updateHealth(true);
    } catch (error) {
      this.updateHealth(false);
      throw this.handleError(error, 'Failed to initialize OpenAI adapter');
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxTokens: 4000, // GPT-4 Turbo max output tokens
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsStreaming: true,
      supportsVision: true,
      embeddingDimensions: [512, 1536, 3072],
      models: {
        completion: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
        embedding: ['text-embedding-3-small', 'text-embedding-3-large']
      }
    };
  }

  getAvailableModels(): ModelInfo[] {
    return [
      {
        name: 'gpt-4o',
        provider: 'openai',
        displayName: 'GPT-4o',
        description: 'Most capable GPT-4 model with vision capabilities',
        maxTokens: 4000, // GPT-4 max output tokens
        costPer1KTokens: this.costPerToken['gpt-4o'],
        averageLatency: 2000,
        qualityScore: 0.95,
        tier: 'powerful',
        features: ['chat', 'vision', 'function-calling', 'json-mode']
      },
      {
        name: 'gpt-4o-mini',
        provider: 'openai',
        displayName: 'GPT-4o Mini',
        description: 'Fast and cost-effective GPT-4 model',
        maxTokens: 4000, // GPT-4 max output tokens
        costPer1KTokens: this.costPerToken['gpt-4o-mini'],
        averageLatency: 1500,
        qualityScore: 0.90,
        tier: 'balanced',
        features: ['chat', 'vision', 'function-calling', 'json-mode']
      },
      {
        name: 'gpt-3.5-turbo',
        provider: 'openai',
        displayName: 'GPT-3.5 Turbo',
        description: 'Fast and economical model for simple tasks',
        maxTokens: 4000, // GPT-3.5 max output tokens
        costPer1KTokens: this.costPerToken['gpt-3.5-turbo'],
        averageLatency: 1000,
        qualityScore: 0.80,
        tier: 'fast',
        features: ['chat', 'function-calling']
      }
    ];
  }

  async loadAvailableModels(): Promise<ModelInfo[]> {
    const cacheKey = `ai:openai:models`;

    try {
      // Try to get cached models first
      const cachedModels = await cacheManager.get<ModelInfo[]>(cacheKey);
      if (cachedModels) {
        return cachedModels;
      }

      // Load models from OpenAI API
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new NetworkError(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();

      // Transform OpenAI models to our format
      const models: ModelInfo[] = data.data
        .filter((model: any) => model.id.startsWith('gpt-'))
        .map((model: any) => ({
          name: model.id,
          provider: 'openai',
          displayName: this.getDisplayNameForModel(model.id),
          description: this.getDescriptionForModel(model.id),
          maxTokens: this.getMaxTokensForModel(model.id),
          costPer1KTokens: this.costPerToken[model.id] || { prompt: 0.002, completion: 0.002 },
          averageLatency: this.getLatencyForModel(model.id),
          qualityScore: this.getQualityScoreForModel(model.id),
          tier: this.getTierForModel(model.id),
          features: this.getFeaturesForModel(model.id)
        }));

      // Cache the models for 1 hour
      await cacheManager.set(cacheKey, models, 3600);

      return models;

    } catch (error) {
      console.error('Failed to load OpenAI models:', error);

      // Return static models as fallback
      return this.getAvailableModels();
    }
  }

  async refreshModels(): Promise<void> {
    const cacheKey = `ai:openai:models`;
    await cacheManager.delete(cacheKey);
    await this.loadAvailableModels();
  }

  private getMaxTokensForModel(modelId: string): number {
    if (modelId.includes('gpt-4o')) return 128000;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5-turbo')) return 16384;
    return 4096;
  }

  private getLatencyForModel(modelId: string): number {
    if (modelId.includes('gpt-4o')) return 2000;
    if (modelId.includes('gpt-4')) return 2500;
    if (modelId.includes('gpt-3.5')) return 1000;
    return 2000;
  }

  private getQualityScoreForModel(modelId: string): number {
    if (modelId.includes('gpt-4o')) return 0.95;
    if (modelId.includes('gpt-4')) return 0.90;
    if (modelId.includes('gpt-3.5')) return 0.80;
    return 0.75;
  }

  private getTierForModel(modelId: string): 'fast' | 'balanced' | 'powerful' {
    if (modelId.includes('gpt-4o') && !modelId.includes('mini')) return 'powerful';
    if (modelId.includes('gpt-4o-mini') || modelId.includes('gpt-4')) return 'balanced';
    if (modelId.includes('gpt-3.5')) return 'fast';
    return 'balanced';
  }

  private getDisplayNameForModel(modelId: string): string {
    if (modelId === 'gpt-4o') return 'GPT-4o';
    if (modelId === 'gpt-4o-mini') return 'GPT-4o Mini';
    if (modelId === 'gpt-3.5-turbo') return 'GPT-3.5 Turbo';
    if (modelId.includes('gpt-4')) return 'GPT-4';
    if (modelId.includes('gpt-3.5')) return 'GPT-3.5';
    return modelId;
  }

  private getDescriptionForModel(modelId: string): string {
    if (modelId === 'gpt-4o') return 'Most capable GPT-4 model with vision capabilities';
    if (modelId === 'gpt-4o-mini') return 'Fast and cost-effective GPT-4 model';
    if (modelId === 'gpt-3.5-turbo') return 'Fast and economical model for simple tasks';
    if (modelId.includes('gpt-4')) return 'Advanced GPT-4 model for complex tasks';
    if (modelId.includes('gpt-3.5')) return 'Fast and economical GPT-3.5 model';
    return `${modelId} model`;
  }

  private getFeaturesForModel(modelId: string): string[] {
    const baseFeatures = ['chat'];

    if (modelId.includes('gpt-4o')) {
      baseFeatures.push('vision', 'function-calling', 'json-mode');
    } else if (modelId.includes('gpt-4')) {
      baseFeatures.push('function-calling', 'json-mode');
    } else if (modelId.includes('gpt-3.5')) {
      baseFeatures.push('function-calling');
    }

    return baseFeatures;
  }

  async estimateCost(
    request: UnifiedCompletionRequest | UnifiedEmbeddingRequest
  ): Promise<CostEstimate> {
    const organizationId = request.metadata?.organizationId;
    let model: string;
    let tokenEstimate: TokenEstimate;

    if ('messages' in request) {
      // Completion request
      model = this.resolveModel(request.model);
      tokenEstimate = await this.estimateTokensForCompletion(request);
    } else {
      // Embedding request
      model = this.resolveModel(request.model);
      tokenEstimate = await this.estimateTokensForEmbedding(request);
    }

    const modelCost = this.costPerToken[model];
    if (!modelCost) {
      throw new ValidationError(`Unknown model for cost estimation: ${model}`, {
        provider: this.name
      });
    }

    const promptCost = (tokenEstimate.prompt / 1000) * modelCost.prompt;
    const completionCost = (tokenEstimate.completion / 1000) * modelCost.completion;
    const totalCost = promptCost + completionCost;

    // Check usage limits if organization is provided
    let usageCheck;
    if (organizationId) {
      usageCheck = await UsageTrackingService.checkUsageLimitWithDetails(
        organizationId,
        UsageType.AI_QUERY,
        1
      );
    }

    return {
      estimatedCost: totalCost,
      breakdown: {
        promptTokens: tokenEstimate.prompt,
        completionTokens: tokenEstimate.completion,
        totalTokens: tokenEstimate.total,
        promptCost,
        completionCost,
        pricePerToken: totalCost / tokenEstimate.total
      },
      metadata: {
        provider: 'openai',
        model,
        usageCheck
      }
    };
  }

  async estimateTokens(text: string, model?: string): Promise<TokenEstimate> {
    // Simple estimation: ~4 characters per token for GPT models
    const tokenCount = Math.ceil(text.length / 4);

    return {
      prompt: tokenCount,
      completion: model?.includes('embedding') ? 0 : Math.ceil(tokenCount * 0.3), // Estimate 30% completion
      total: tokenCount
    };
  }

  async generateCompletion(
    request: UnifiedCompletionRequest
  ): Promise<UnifiedCompletionResponse> {
    const organizationId = request.metadata?.organizationId;
    const startTime = Date.now();

    try {
      // Security validation
      if (process.env.NODE_ENV === 'production' && request.metadata?.httpRequest) {
        const csrfResult = await validateCSRFInAPIRoute(request.metadata.httpRequest);
        if (!csrfResult.valid) {
          throw new ValidationError(`CSRF validation failed: ${csrfResult.error}`);
        }
      }

      // Usage tracking - enforce limit before making request
      if (organizationId) {
        await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
      }

      const model = this.resolveModel(request.model);
      const openAIModel = this.client.chat(model);


      const result = await generateText({
        model: openAIModel,
        abortSignal: request.signal,
        maxRetries: this.config.maxRetries,
        ...sdkRequestOptions(request),
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
        seed: request.options?.seed
      });

      // Calculate cost for tracking
      const modelCost = this.costPerToken[model] || { prompt: 0.002, completion: 0.002 };
      const promptCost = (completionUsage(result.usage).promptTokens / 1000) * modelCost.prompt;
      const completionCost = (completionUsage(result.usage).completionTokens / 1000) * modelCost.completion;
      const totalCost = promptCost + completionCost;

      // Track usage after successful request (Layer 1: Billing)
      if (organizationId) {
        await UsageTrackingService.trackUsage({
          organizationId,
          usageType: UsageType.AI_QUERY,
          quantity: 1,
          resourceId: result.response?.id || 'unknown',
          resourceType: 'ai_completion',
          metadata: {
            provider: 'openai',
            model: model,
            cost: totalCost,
            promptTokens: completionUsage(result.usage).promptTokens,
            completionTokens: completionUsage(result.usage).completionTokens,
            totalTokens: completionUsage(result.usage).totalTokens
          }
        });

        // Record in global AI metrics system (Layer 2: Performance Metrics)
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'openai',
            model: model,
            operation: 'completion',
            latency: Date.now() - startTime,
            tokenCount: metricTokens(completionUsage(result.usage)),
            cost: totalCost,
            success: true,
            metadata: {
              taskType: 'completion',
              organizationId,
              userId: request.metadata?.userId,
              requestId: result.response?.id
            }
          }
        );
      }

      return {
        content: result.text,
        model: model,
        usage: {
          promptTokens: completionUsage(result.usage).promptTokens,
          completionTokens: completionUsage(result.usage).completionTokens,
          totalTokens: completionUsage(result.usage).totalTokens
        },
        metadata: {
          provider: this.name,
          requestId: result.response?.id,
          finishReason: result.finishReason,
          ...(result.toolCalls?.length && { functionCall: { name: result.toolCalls[0].toolName, arguments: result.toolCalls[0].input } }),
          cost: totalCost
        }
      };
    } catch (error) {
      // Record error in global AI metrics system (Layer 2: Performance Metrics)
      if (organizationId) {
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'openai',
            model: request.model,
            operation: 'completion',
            latency: Date.now() - startTime,
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

  async generateEmbedding(
    request: UnifiedEmbeddingRequest
  ): Promise<UnifiedEmbeddingResponse> {
    const organizationId = request.metadata?.organizationId;
    const startTime = Date.now();

    try {
      // Security validation
      if (process.env.NODE_ENV === 'production' && request.metadata?.httpRequest) {
        const csrfResult = await validateCSRFInAPIRoute(request.metadata.httpRequest);
        if (!csrfResult.valid) {
          throw new ValidationError(`CSRF validation failed: ${csrfResult.error}`);
        }
      }

      // Usage tracking - enforce limit before making request
      if (organizationId) {
        await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
      }

      const model = this.resolveModel(request.model);
      const openAIModel = this.client.embedding(model);

      const providerOptions = request.dimensions ? { openai: { dimensions: request.dimensions } } : undefined;
      const result = Array.isArray(request.text)
        ? await embedMany({ model: openAIModel, values: request.text, providerOptions })
        : await embed({ model: openAIModel, value: request.text, providerOptions });
      const embedding = 'embeddings' in result ? result.embeddings : result.embedding;
      const dimensions = 'embeddings' in result ? result.embeddings[0]?.length ?? 0 : result.embedding.length;

      // Calculate cost for tracking
      const modelCost = this.costPerToken[model] || { prompt: 0.00002, completion: 0 };
      const totalCost = (result.usage.tokens / 1000) * modelCost.prompt;

      // Track usage after successful request (Layer 1: Billing)
      if (organizationId) {
        await UsageTrackingService.trackUsage({
          organizationId,
          usageType: UsageType.AI_QUERY,
          quantity: 1,
          resourceId: `embedding_${Date.now()}`,
          resourceType: 'ai_embedding',
          metadata: {
            provider: 'openai',
            model: model,
            cost: totalCost,
            totalTokens: result.usage.tokens,
            dimensions: dimensions
          }
        });

        // Record in global AI metrics system (Layer 2: Performance Metrics)
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'openai',
            model: model,
            operation: 'embedding',
            latency: Date.now() - startTime,
            tokenCount: { prompt: result.usage.tokens, completion: 0, total: result.usage.tokens },
            cost: totalCost,
            success: true,
            metadata: {
              taskType: 'embedding',
              organizationId,
              userId: request.metadata?.userId,
              dimensions: dimensions
            }
          }
        );
      }

      return {
        embedding,
        model: model,
        usage: {
          totalTokens: result.usage.tokens
        },
        metadata: {
          provider: this.name,
          dimensions: dimensions,
          cost: totalCost
        }
      };
    } catch (error) {
      // Record error in global AI metrics system (Layer 2: Performance Metrics)
      if (organizationId) {
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'openai',
            model: request.model,
            operation: 'embedding',
            latency: Date.now() - startTime,
            tokenCount: { prompt: 0, completion: 0, total: 0 },
            cost: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              taskType: 'embedding',
              organizationId,
              userId: request.metadata?.userId,
              errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
            }
          }
        );
      }

      throw this.handleError(error, 'generateEmbedding');
    }
  }

  async *streamCompletion(request: UnifiedStreamRequest): AsyncGenerator<UnifiedStreamChunk> {
    const organizationId = request.metadata?.organizationId;
    const startTime = Date.now();
    try {
      if (process.env.NODE_ENV === 'production' && request.metadata?.httpRequest) {
        const csrf = await validateCSRFInAPIRoute(request.metadata.httpRequest);
        if (!csrf.valid) throw new ValidationError(`CSRF validation failed: ${csrf.error}`);
      }
      request.signal?.throwIfAborted();
      if (organizationId) await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
      const model = this.resolveModel(request.model);
      const result = streamText({ model: this.client.chat(model), abortSignal: request.signal, maxRetries: this.config.maxRetries,
        ...sdkRequestOptions(request), temperature: request.temperature, maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences, seed: request.options?.seed });
      const { usage, finishReason } = yield* consumeSDKStream(result.stream, this.name, model, request.signal);
      const pricing = this.costPerToken[model] || { prompt: 0.002, completion: 0.002 };
      const cost = (usage.promptTokens * pricing.prompt + usage.completionTokens * pricing.completion) / 1000;
      const latency = Date.now() - startTime;
      if (organizationId) {
        await UsageTrackingService.trackUsage({ organizationId, usageType: UsageType.AI_QUERY, quantity: 1,
          resourceId: `stream_${Date.now()}`, resourceType: 'ai_stream', metadata: { provider: this.name, model, cost, ...usage, streaming: true } });
        await this.aiMetricsIntegration.recordAIUsage(organizationId, request.metadata?.userId, {
          provider: this.name, model, operation: 'stream', latency, tokenCount: metricTokens(usage), cost, success: true,
          metadata: { taskType: 'completion', organizationId, userId: request.metadata?.userId, streaming: true },
        });
      }
      yield { content: '', metadata: { provider: this.name, model, usage, finishReason, cost, latency } };
    } catch (error) {
      if (organizationId) await this.aiMetricsIntegration.recordAIUsage(organizationId, request.metadata?.userId, {
        provider: this.name, model: request.model, operation: 'stream', latency: Date.now() - startTime,
        tokenCount: { prompt: 0, completion: 0, total: 0 }, cost: 0, success: false,
        error: error instanceof Error ? error.message : 'Stream failed', metadata: { taskType: 'completion', organizationId, streaming: true },
      });
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw this.handleError(error, 'streamCompletion');
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const openAIModel = this.client.chat('gpt-3.5-turbo');

      await generateText({
        model: openAIModel,
        messages: [{
          role: 'user',

          content: 'Hello'
        }],
        maxOutputTokens: 5
      });

      this.updateHealth(true);
      return true;
    } catch (error) {
      this.updateHealth(false);
      return false;
    }
  }

  // Private helper methods

  private resolveModel(unifiedModel: string): string {
    // If it's a direct mapping, use it
    if (this.modelMapping[unifiedModel]) {
      return this.modelMapping[unifiedModel];
    }

    // If it's already a valid OpenAI model, use it
    const validOpenAIModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'text-embedding-3-small', 'text-embedding-3-large'];
    if (validOpenAIModels.includes(unifiedModel)) {
      return unifiedModel;
    }

    // If it's an Anthropic model that fell back to OpenAI, map to equivalent
    if (unifiedModel.includes('claude')) {
      if (unifiedModel.includes('sonnet') || unifiedModel.includes('opus')) {
        return 'gpt-4o'; // High-quality model for complex tasks
      } else if (unifiedModel.includes('haiku')) {
        return 'gpt-4o-mini'; // Fast model
      }
    }

    // Default fallback for any unknown model
    return 'gpt-4o-mini';
  }

  private formatMessages(messages: any[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  private async estimateTokensForCompletion(
    request: UnifiedCompletionRequest
  ): Promise<TokenEstimate> {
    const allText = request.messages.map(m => m.content).join(' ');
    const promptTokens = Math.ceil(allText.length / 4);
    const completionTokens = Math.ceil((request.maxTokens || 1000) * 0.7); // Estimate 70% of max

    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens
    };
  }

  private async estimateTokensForEmbedding(
    request: UnifiedEmbeddingRequest
  ): Promise<TokenEstimate> {
    const text = Array.isArray(request.text) ? request.text.join(' ') : request.text;
    const tokens = Math.ceil(text.length / 4);

    return {
      prompt: tokens,
      completion: 0,
      total: tokens
    };
  }

  private async *transformStream(
    stream: AsyncIterable<string>,
    model: string
  ): AsyncGenerator<UnifiedStreamChunk> {
    for await (const chunk of stream) {
      yield {
        content: chunk,
        metadata: {
          provider: this.name,
          model: model
        }
      };
    }
  }

  protected handleError(error: any, context: string): Error {
    // Handle authentication errors
    if (error?.status === 401) {
      return new AuthenticationError('Invalid OpenAI API key', 'openai');
    }

    // Handle rate limiting
    if (error?.status === 429) {
      return new RateLimitError('openai', error.headers?.['retry-after']);
    }

    // Handle validation errors
    if (error?.status === 400) {
      return new ValidationError(`OpenAI API validation error: ${error.message || error.body?.message}`);
    }

    // Handle quota/billing issues specifically
    if (error?.status === 402 ||
        error.message?.includes('quota') ||
        error.message?.includes('billing') ||
        error.message?.includes('insufficient funds') ||
        error.message?.includes('credits')) {
      return new QuotaExceededError('openai', 'usage quota or billing');
    }

    // Handle network/connection errors
    if (error?.name === 'APIConnectionError' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return new NetworkError(`OpenAI API connection error: ${error.message}`, 'openai');
    }

    // Handle service unavailable
    if (error?.status >= 500) {
      return new ProviderUnavailableError('openai', `Service error: ${error.status}`);
    }

    // Handle configuration errors
    if (error?.status === 403) {
      return new ProviderConfigurationError('Access forbidden - check API key permissions', 'openai');
    }

    // Generic error fallback
    return new NetworkError(`OpenAI API error: ${error.message || 'Unknown error'}`);
  }
}
