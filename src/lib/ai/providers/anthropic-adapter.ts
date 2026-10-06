import { completionUsage, metricTokens } from '../usage';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';
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

export interface AnthropicConfig {
  apiKey: string;
  maxRetries?: number;
  timeout?: number;
}

// Anthropic API response interfaces
interface AnthropicModelResponse {
  object: string;
  data: AnthropicModel[];
}

interface AnthropicModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  display_name: string;
  type: string;
}

export class AnthropicAdapter extends AIProviderAdapter {
  private config: AnthropicConfig;
  private anthropic: ReturnType<typeof createAnthropic>;
  private aiMetricsIntegration: AIMetricsIntegration;

  // Model mapping from unified names to Anthropic model IDs
  private modelMapping: Record<string, string> = {
    'fast': 'claude-3-haiku-20240307',
    'balanced': 'claude-3-sonnet-20240229',
    'powerful': 'claude-3-opus-20240229',
    'latest': 'claude-3-5-sonnet-20241022'
  };

  // Cost per 1K tokens (as of 2024) - Fallback pricing when API doesn't provide it
  private fallbackCostPerToken: Record<string, { prompt: number; completion: number }> = {
    'claude-3-haiku-20240307': { prompt: 0.00025, completion: 0.00125 },
    'claude-3-sonnet-20240229': { prompt: 0.003, completion: 0.015 },
    'claude-3-opus-20240229': { prompt: 0.015, completion: 0.075 },
    'claude-3-5-sonnet-20241022': { prompt: 0.003, completion: 0.015 },
    'claude-3-5-haiku-20241022': { prompt: 0.00025, completion: 0.00125 }
  };

  // Dynamic models fetched from API
  private availableModels: ModelInfo[] = [];
  private modelsLastFetched: number = 0;
  private readonly modelsCacheDuration = 24 * 60 * 60 * 1000; // 24 hours

  constructor(config: AnthropicConfig) {
    super('anthropic');
    this.config = config;
    this.aiMetricsIntegration = new AIMetricsIntegration();

    // Initialize Anthropic client with API key
    this.anthropic = createAnthropic({
      apiKey: config.apiKey,
    });
  }

  async initialize(): Promise<void> {
    // Verify API key is available
    if (!this.config.apiKey) {
      throw new AuthenticationError('Anthropic API key is required');
    }

    // Load available models from API
    try {
      await this.loadAvailableModels();
      this.updateHealth(true);
    } catch (error) {
      console.warn('Failed to load Anthropic models, using fallback:', error);
      this.loadFallbackModels();
      this.updateHealth(false);
    }
  }

  async generateCompletion(request: UnifiedCompletionRequest): Promise<UnifiedCompletionResponse> {
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

      const model = this.getAnthropicModel(request.model);
      const startTime = Date.now();

      // Transform messages to Anthropic format
      const messages = this.transformMessages(request.messages);

      const result = await generateText({
        model: this.anthropic(model),
        abortSignal: request.signal,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      // Calculate costs
      const cost = this.calculateCost(model, completionUsage(result.usage));

      // Track usage after successful request (Layer 1: Billing)
      if (organizationId) {
        await UsageTrackingService.trackUsage({
          organizationId,
          usageType: UsageType.AI_QUERY,
          quantity: 1,
          resourceId: result.response?.id || 'unknown',
          resourceType: 'ai_completion',
          metadata: {
            provider: 'anthropic',
            model: model,
            cost: cost,
            promptTokens: completionUsage(result.usage).promptTokens,
            completionTokens: completionUsage(result.usage).completionTokens,
            totalTokens: completionUsage(result.usage).totalTokens,
            latency: latency
          }
        });

        // Record in global AI metrics system (Layer 2: Performance Metrics)
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'anthropic',
            model: model,
            operation: 'completion',
            latency: latency,
            tokenCount: metricTokens(completionUsage(result.usage)),
            cost: cost,
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
        model,
        usage: {
          promptTokens: completionUsage(result.usage).promptTokens,
          completionTokens: completionUsage(result.usage).completionTokens,
          totalTokens: completionUsage(result.usage).totalTokens
        },
        metadata: {
          provider: 'anthropic',
          finishReason: 'stop',
          cost: cost,
          latency: latency
        }
      };
    } catch (error) {
      // Record error in global AI metrics system (Layer 2: Performance Metrics)
      if (organizationId) {
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'anthropic',
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

  async streamCompletion(request: UnifiedStreamRequest): Promise<AsyncIterable<UnifiedStreamChunk>> {
    return this.streamGenerator(request);
  }

  async *streamGenerator(request: UnifiedStreamRequest): AsyncGenerator<UnifiedStreamChunk> {
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

      const model = this.getAnthropicModel(request.model);
      const startTime = Date.now();

      // Transform messages to Anthropic format
      const messages = this.transformMessages(request.messages);

      const stream = await streamText({
        model: this.anthropic(model),
        abortSignal: request.signal,
        messages,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      });

      for await (const chunk of stream.textStream) {
        yield {
          content: chunk,
          metadata: {
            provider: 'anthropic',
            model
          }
        };
      }

      // Final chunk with usage information
      const finalResult = await stream.text;
      const usage = completionUsage(await stream.usage);
      const endTime = Date.now();
      const latency = endTime - startTime;
      const cost = this.calculateCost(model, usage);

      // Track usage after successful streaming (Layer 1: Billing)
      if (organizationId) {
        await UsageTrackingService.trackUsage({
          organizationId,
          usageType: UsageType.AI_QUERY,
          quantity: 1,
          resourceId: `stream_${Date.now()}`,
          resourceType: 'ai_stream',
          metadata: {
            provider: 'anthropic',
            model: model,
            cost: cost,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            latency: latency,
            streaming: true
          }
        });

        // Record in global AI metrics system (Layer 2: Performance Metrics)
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'anthropic',
            model: model,
            operation: 'stream',
            latency: latency,
            tokenCount: metricTokens(usage),
            cost: cost,
            success: true,
            metadata: {
              taskType: 'completion',
              organizationId,
              userId: request.metadata?.userId,
              streaming: true
            }
          }
        );
      }

      yield {
        content: '',
        metadata: {
          provider: 'anthropic',
          model,
          finishReason: 'stop',
          cost: cost,
          latency: latency
        }
      };
    } catch (error) {
      // Record error in global AI metrics system (Layer 2: Performance Metrics)
      if (organizationId) {
        await this.aiMetricsIntegration.recordAIUsage(
          organizationId,
          request.metadata?.userId,
          {
            provider: 'anthropic',
            model: request.model,
            operation: 'stream',
            latency: Date.now() - startTime,
            tokenCount: { prompt: 0, completion: 0, total: 0 },
            cost: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            metadata: {
              taskType: 'completion',
              organizationId,
              userId: request.metadata?.userId,
              streaming: true,
              errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
            }
          }
        );
      }

      throw this.handleError(error, 'streamCompletion');
    }
  }

  async generateEmbedding(request: UnifiedEmbeddingRequest): Promise<UnifiedEmbeddingResponse> {
    // Anthropic doesn't provide embedding models, throw not supported error
    throw new ValidationError('Anthropic does not support embedding generation. Use OpenAI or other providers for embeddings.');
  }

  async estimateTokens(text: string, model?: string): Promise<TokenEstimate> {
    // Rough estimation: ~4 characters per token for Claude models
    const estimatedTokens = Math.ceil(text.length / 4);

    return {
      prompt: Math.floor(estimatedTokens * 0.5),
      completion: Math.ceil(estimatedTokens * 0.5),
      total: estimatedTokens
    };
  }

  async estimateCost(request: UnifiedCompletionRequest | UnifiedEmbeddingRequest): Promise<CostEstimate> {
    const organizationId = request.metadata?.organizationId;
    const model = request.model;
    const anthropicModel = this.getAnthropicModel(model);
    const pricing = this.fallbackCostPerToken[anthropicModel];

    if (!pricing) {
      throw new ValidationError(`Unknown Anthropic model: ${anthropicModel}`);
    }

    // Estimate tokens from request content
    let totalTokens = 0;
    if ('messages' in request) {
      // Completion request
      const content = request.messages.map(m => m.content).join(' ');
      totalTokens = Math.ceil(content.length / 4);
    } else {
      // Embedding request
      const text = Array.isArray(request.text) ? request.text.join(' ') : request.text;
      totalTokens = Math.ceil(text.length / 4);
    }

    // Assume 50/50 split between prompt and completion tokens for estimation
    const promptTokens = Math.floor(totalTokens * 0.5);
    const completionTokens = Math.ceil(totalTokens * 0.5);

    const promptCost = (promptTokens / 1000) * pricing.prompt;
    const completionCost = (completionTokens / 1000) * pricing.completion;
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
        promptTokens,
        completionTokens,
        totalTokens,
        promptCost,
        completionCost,
        pricePerToken: totalCost / totalTokens
      },
      metadata: {
        provider: 'anthropic',
        model: anthropicModel,
        usageCheck
      }
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxTokens: 200000,
      supportsFunctionCalling: true,
      supportsJsonMode: false,
      supportsStreaming: true,
      supportsVision: true,
      models: {
        completion: Object.keys(this.modelMapping)
      }
    };
  }

  getAvailableModels(): ModelInfo[] {
    // Return cached models if available, otherwise return fallback
    if (this.availableModels.length > 0) {
      return this.availableModels;
    }

    // Return fallback models if no cached models are available
    return this.loadFallbackModels();
  }

  async loadAvailableModels(): Promise<ModelInfo[]> {
    const cacheKey = `ai:anthropic:models`;
    const now = Date.now();

    try {
      // Check cache first
      const cachedModels = await cacheManager.get<ModelInfo[]>(cacheKey);
      if (cachedModels && (now - this.modelsLastFetched) < this.modelsCacheDuration) {
        this.availableModels = cachedModels;
        return cachedModels;
      }

      // Fetch from Anthropic API
      const models = await this.fetchModelsFromAPI();

      // Cache the results
      await cacheManager.set(cacheKey, models, 86400); // 24 hours
      this.availableModels = models;
      this.modelsLastFetched = now;

      return models;
    } catch (error) {
      console.error('Failed to fetch Anthropic models from API:', error);

      // Try to use cached models if available
      const cachedModels = await cacheManager.get<ModelInfo[]>(cacheKey);
      if (cachedModels) {
        this.availableModels = cachedModels;
        return cachedModels;
      }

      // Final fallback to hardcoded models
      const fallbackModels = this.loadFallbackModels();
      this.availableModels = fallbackModels;
      return fallbackModels;
    }
  }

  private async fetchModelsFromAPI(): Promise<ModelInfo[]> {
    console.log('🔄 Fetching Anthropic models from API...');

    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    if (!response.ok) {
      throw new NetworkError(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data: AnthropicModelResponse = await response.json();

    console.log(`✅ Fetched ${data.data.length} Anthropic models from API`);

    return data.data.map(model => this.transformAnthropicModel(model));
  }

  private transformAnthropicModel(model: AnthropicModel): ModelInfo {
    // Get fallback pricing for this model
    const pricing = this.fallbackCostPerToken[model.id] || this.fallbackCostPerToken['claude-3-5-sonnet-20241022'];

    // Determine model tier based on name
    let tier: 'fast' | 'balanced' | 'powerful' = 'balanced';
    let qualityScore = 0.90;
    let averageLatency = 1200;

    if (model.id.includes('haiku')) {
      tier = 'fast';
      qualityScore = 0.85;
      averageLatency = 800;
    } else if (model.id.includes('opus')) {
      tier = 'powerful';
      qualityScore = 0.98;
      averageLatency = 2000;
    } else if (model.id.includes('sonnet')) {
      tier = 'balanced';
      qualityScore = model.id.includes('3-5') ? 0.95 : 0.92;
      averageLatency = 1000;
    }

    return {
      name: model.id,
      provider: 'anthropic',
      displayName: model.display_name || model.id,
      description: `${model.display_name || model.id} - ${tier} tier Claude model`,
      maxTokens: 200000, // Anthropic models generally support 200k tokens
      costPer1KTokens: {
        prompt: pricing.prompt,
        completion: pricing.completion
      },
      averageLatency,
      qualityScore,
      tier,
      features: this.getModelFeatures(model.id),
      metadata: {
        anthropicId: model.id,
        created: model.created,
        ownedBy: model.owned_by,
        type: model.type
      }
    };
  }

  private getModelFeatures(modelId: string): string[] {
    const baseFeatures = ['chat', 'text-generation', 'reasoning'];

    // Add vision capabilities for models that support it
    if (modelId.includes('3-5') || modelId.includes('opus') || modelId.includes('sonnet')) {
      baseFeatures.push('vision');
    }

    // Add function calling for newer models
    if (modelId.includes('3-5') || modelId.includes('opus')) {
      baseFeatures.push('function-calling');
    }

    return baseFeatures;
  }

  private loadFallbackModels(): ModelInfo[] {
    console.log('⚠️  Loading fallback Anthropic models (hardcoded)');

    return [
      {
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        displayName: 'Claude 3.5 Sonnet',
        description: 'Claude 3.5 Sonnet - Latest balanced model',
        maxTokens: 200000,
        costPer1KTokens: {
          prompt: this.fallbackCostPerToken['claude-3-5-sonnet-20241022'].prompt,
          completion: this.fallbackCostPerToken['claude-3-5-sonnet-20241022'].completion
        },
        averageLatency: 1000,
        qualityScore: 0.95,
        tier: 'balanced',
        features: ['chat', 'text-generation', 'reasoning', 'vision', 'function-calling']
      },
      {
        name: 'claude-3-opus-20240229',
        provider: 'anthropic',
        displayName: 'Claude 3 Opus',
        description: 'Claude 3 Opus - Most powerful model',
        maxTokens: 200000,
        costPer1KTokens: {
          prompt: this.fallbackCostPerToken['claude-3-opus-20240229'].prompt,
          completion: this.fallbackCostPerToken['claude-3-opus-20240229'].completion
        },
        averageLatency: 2000,
        qualityScore: 0.98,
        tier: 'powerful',
        features: ['chat', 'text-generation', 'reasoning', 'vision', 'function-calling']
      },
      {
        name: 'claude-3-sonnet-20240229',
        provider: 'anthropic',
        displayName: 'Claude 3 Sonnet',
        description: 'Claude 3 Sonnet - Balanced model',
        maxTokens: 200000,
        costPer1KTokens: {
          prompt: this.fallbackCostPerToken['claude-3-sonnet-20240229'].prompt,
          completion: this.fallbackCostPerToken['claude-3-sonnet-20240229'].completion
        },
        averageLatency: 1200,
        qualityScore: 0.92,
        tier: 'balanced',
        features: ['chat', 'text-generation', 'reasoning', 'vision']
      },
      {
        name: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        displayName: 'Claude 3 Haiku',
        description: 'Claude 3 Haiku - Fastest model',
        maxTokens: 200000,
        costPer1KTokens: {
          prompt: this.fallbackCostPerToken['claude-3-haiku-20240307'].prompt,
          completion: this.fallbackCostPerToken['claude-3-haiku-20240307'].completion
        },
        averageLatency: 800,
        qualityScore: 0.85,
        tier: 'fast',
        features: ['chat', 'text-generation', 'reasoning']
      }
    ];
  }

  async refreshModels(): Promise<void> {
    const cacheKey = `ai:anthropic:models`;
    await cacheManager.delete(cacheKey);
    await this.loadAvailableModels();
  }

  async checkHealth(): Promise<boolean> {
    try {
      const startTime = Date.now();

      await generateText({
        model: this.anthropic(this.modelMapping.fast),
        messages: [{
          role: 'user',

          content: 'Hello'
        }],
        maxOutputTokens: 10
      });

      this.updateHealth(true);
      return true;
    } catch (error) {
      this.updateHealth(false);
      return false;
    }
  }

  private getAnthropicModel(unifiedModel: string): string {
    // If it's a direct mapping, use it
    if (this.modelMapping[unifiedModel]) {
      return this.modelMapping[unifiedModel];
    }

    // If it's already a valid Anthropic model, use it
    const validAnthropicModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
    if (validAnthropicModels.includes(unifiedModel)) {
      return unifiedModel;
    }

    // If it's an OpenAI model that fell back to Anthropic, map to equivalent
    if (unifiedModel.includes('gpt')) {
      if (unifiedModel.includes('gpt-4o')) {
        return 'claude-3-5-sonnet-20241022'; // High-quality model for complex tasks
      } else if (unifiedModel.includes('gpt-3.5') || unifiedModel.includes('mini')) {
        return 'claude-3-haiku-20240307'; // Fast model
      }
    }

    // Default fallback
    return this.modelMapping.balanced;
  }

  private transformMessages(messages: Array<{ role: string; content: string }>): Array<{ role: 'user' | 'assistant'; content: string }> {
    return messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : (msg.role as 'user' | 'assistant'),
      content: msg.role === 'system' ? `System: ${msg.content}` : msg.content
    }));
  }

  private calculateCost(model: string, usage: { promptTokens: number; completionTokens: number }): number {
    const pricing = this.fallbackCostPerToken[model];
    if (!pricing) return 0;

    const promptCost = (usage.promptTokens / 1000) * pricing.prompt;
    const completionCost = (usage.completionTokens / 1000) * pricing.completion;

    return promptCost + completionCost;
  }

  protected handleError(error: any, context: string): Error {
    // Handle authentication errors
    if (error.status === 401) {
      if (error.message?.includes('credit balance is too low')) {
        return new QuotaExceededError('anthropic', 'credit balance');
      }
      return new AuthenticationError('Invalid Anthropic API key', 'anthropic');
    }

    // Handle rate limiting
    if (error.status === 429) {
      return new RateLimitError('anthropic', error.retryAfter);
    }

    // Handle validation errors
    if (error.status === 400) {
      return new ValidationError(`Anthropic API validation error: ${error.message}`);
    }

    // Handle quota/billing issues specifically
    if (error.message?.includes('credit balance is too low') ||
        error.message?.includes('billing') ||
        error.message?.includes('quota')) {
      return new QuotaExceededError('anthropic', 'credit balance');
    }

    // Handle network/connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return new NetworkError(`Anthropic API connection error: ${error.message}`, 'anthropic');
    }

    // Handle service unavailable
    if (error.status >= 500) {
      return new ProviderUnavailableError('anthropic', `Service error: ${error.status}`);
    }

    // Handle configuration errors
    if (error.status === 403) {
      return new ProviderConfigurationError('Access forbidden - check API key permissions', 'anthropic');
    }

    // Generic error fallback
    return new NetworkError(`Anthropic API error: ${error.message || 'Unknown error'}`);
  }
}
