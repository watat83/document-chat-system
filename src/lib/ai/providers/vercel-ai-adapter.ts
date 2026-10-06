import { completionUsage, metricTokens } from '../usage';
import { generateText, streamText, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { AIProviderAdapter } from '../interfaces/base-adapter';
import {
  UnifiedCompletionRequest,
  UnifiedCompletionResponse,
  UnifiedStreamRequest,
  UnifiedStreamChunk,
  UnifiedEmbeddingRequest,
  UnifiedEmbeddingResponse,
  UnifiedMessage,
  TaskType,
  Complexity,
  ProviderCapabilities,
  ModelInfo,
  CostEstimate,
  TokenEstimate
} from '../interfaces/types';
import { AIRequestRouter } from '../routing';
import { AIConfiguration } from '../config';

export interface VercelAIConfig {
  enableStreaming: boolean;
  enableFunctionCalling: boolean;
  enableVision: boolean;
  fallbackToOurSystem: boolean;
  costLimits: {
    maxPerRequest: number;
    maxDaily: number;
  };
}

export class VercelAIAdapter extends AIProviderAdapter {
  private router: AIRequestRouter;
  private config: AIConfiguration;
  private vercelConfig: VercelAIConfig;

  constructor(
    router: AIRequestRouter,
    vercelConfig?: Partial<VercelAIConfig>
  ) {
    super('vercel-enhanced');
    this.router = router;
    this.config = AIConfiguration.getInstance();
    this.vercelConfig = {
      enableStreaming: true,
      enableFunctionCalling: true,
      enableVision: false,
      fallbackToOurSystem: true,
      costLimits: {
        maxPerRequest: 2.0,
        maxDaily: 50.0
      },
      ...vercelConfig
    };
  }

  /**
   * Map provider and model names to Vercel AI SDK model instances
   */
  private getVercelModel(modelName: string, provider: string) {
    switch (provider.toLowerCase()) {
      case 'openai':
        return openai(modelName);
      case 'anthropic':
        return anthropic(modelName);
      case 'google':
        return google(modelName);
      default:
        // Fallback to OpenAI GPT-3.5-turbo for unknown providers
        return openai('gpt-3.5-turbo');
    }
  }

  /**
   * Transform our unified message format to Vercel AI SDK format
   */
  private transformMessages(messages: UnifiedMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.metadata?.name && { name: msg.metadata.name })
    }));
  }

  /**
   * Transform Vercel AI SDK response to our unified format
   */
  private transformToUnifiedResponse(
    text: string,
    usage: any,
    routing: any
  ): UnifiedCompletionResponse {
    return {
      content: text,
      model: routing.model,
      usage: {
        promptTokens: usage?.promptTokens || 0,
        completionTokens: usage?.completionTokens || 0,
        totalTokens: usage?.totalTokens || 0
      },
      metadata: {
        provider: routing.selectedProvider,
        requestId: routing.requestId,
        finishReason: 'stop'
      }
    };
  }

  /**
   * Transform streaming chunks to our unified format
   */
  private transformToUnifiedChunk(
    chunk: any,
    routing: any
  ): UnifiedStreamChunk {
    return {
      content: chunk || '',
      metadata: {
        provider: routing.selectedProvider,
        model: routing.model,
        finishReason: undefined
      }
    };
  }

  async generateCompletion(
    request: UnifiedCompletionRequest
  ): Promise<UnifiedCompletionResponse> {
    const startTime = Date.now();

    try {
      // Route through our existing system first for provider selection and cost optimization
      const routing = await this.router.route({
        model: request.model,
        taskType: request.hints?.taskType || 'simple_qa',
        complexity: request.hints?.complexity || 'medium',
        messages: request.messages
      });

      // Use Vercel AI SDK for the actual API call
      const vercelModel = this.getVercelModel(routing.model, routing.selectedProvider);

      const { text, usage, finishReason } = await generateText({
        model: vercelModel,
        messages: this.transformMessages(request.messages),
        temperature: request.temperature || 0.7,
        maxOutputTokens: request.maxTokens
      });

      // Transform back to our unified format
      const response = this.transformToUnifiedResponse(text, usage, routing);
      response.metadata.finishReason = finishReason;

      return response;
    } catch (error) {
      if (this.vercelConfig.fallbackToOurSystem) {
        // Fallback to our original system
        throw new Error(`Vercel AI SDK failed, fallback required: ${(error as Error).message}`);
      }
      throw error;
    }
  }

  async streamCompletion(
    request: UnifiedStreamRequest
  ): Promise<AsyncIterable<UnifiedStreamChunk>> {
    const routing = await this.router.route({
      model: request.model,
      taskType: request.hints?.taskType || 'simple_qa',
      complexity: request.hints?.complexity || 'medium',
      messages: request.messages
    });

    const vercelModel = this.getVercelModel(routing.model, routing.selectedProvider);

    const transformMessages = this.transformMessages.bind(this);
    const transformToUnifiedChunk = this.transformToUnifiedChunk.bind(this);
    const fallbackToOurSystem = this.vercelConfig.fallbackToOurSystem;

    return {
      async *[Symbol.asyncIterator]() {
        try {
          const { textStream } = await streamText({
            model: vercelModel,
            messages: transformMessages(request.messages),
            temperature: request.temperature || 0.7,
            maxOutputTokens: request.maxTokens
          });

          for await (const chunk of textStream) {
            yield transformToUnifiedChunk(chunk, routing);
          }
        } catch (error) {
          if (fallbackToOurSystem) {
            throw new Error(`Vercel AI SDK streaming failed, fallback required: ${(error as Error).message}`);
          }
          throw error;
        }
      }
    };
  }

  async generateEmbedding(
    request: UnifiedEmbeddingRequest
  ): Promise<UnifiedEmbeddingResponse> {
    // For embeddings, we'll route to our existing system since Vercel AI SDK
    // doesn't provide a unified embedding interface yet
    const routing = await this.router.route({
      model: request.model,
      taskType: 'embedding',
      complexity: 'low',
      text: Array.isArray(request.text) ? request.text[0] : request.text
    });

    // Delegate to the routed provider's embedding implementation
    return routing.adapter.generateEmbedding(request);
  }

  /**
   * Enhanced method: Check if request should use Vercel AI SDK
   */
  shouldUseVercel(request: any): boolean {
    // Use Vercel AI SDK for:
    if (request.operation === 'stream' && this.vercelConfig.enableStreaming) return true;
    if (request.taskType === 'chat' && this.vercelConfig.enableStreaming) return true;
    if (request.prototype === true) return true; // For prototyping

    // Don't use for:
    if (request.requiresCompliance) return false;
    if (request.complexCostOptimization) return false;
    if (request.organizationPolicies?.length > 0) return false;
    if (request.operation === 'embedding') return false; // Use our system for embeddings

    return false;
  }

  /**
   * Enhanced method: Generate structured objects using Vercel AI SDK
   */
  async generateObject<T>(
    request: UnifiedCompletionRequest & {
      schema: any;
      schemaName?: string;
      schemaDescription?: string;
    }
  ): Promise<{ object: T; usage: any }> {
    const routing = await this.router.route({
      model: request.model,
      taskType: request.hints?.taskType || 'simple_qa',
      complexity: request.hints?.complexity || 'medium',
      messages: request.messages
    });

    const vercelModel = this.getVercelModel(routing.model, routing.selectedProvider);

    const result = await generateObject({
      model: vercelModel,
      messages: this.transformMessages(request.messages),
      schema: request.schema,
      schemaName: request.schemaName,
      schemaDescription: request.schemaDescription,
      temperature: request.temperature || 0.7,
      maxOutputTokens: request.maxTokens
    });

    return {
      object: result.object as T,
      usage: result.usage
    };
  }

  /**
   * Get configuration for this adapter
   */
  getConfig(): VercelAIConfig {
    return { ...this.vercelConfig };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VercelAIConfig>): void {
    this.vercelConfig = { ...this.vercelConfig, ...updates };
  }

  // Required abstract method implementations
  async initialize(): Promise<void> {
    // Vercel AI SDK doesn't require explicit initialization
    // We just validate that configuration is available
    try {
      const testModel = openai('gpt-3.5-turbo');
      this.updateHealth(true);
    } catch (error) {
      this.updateHealth(false);
      throw new Error(`Failed to initialize Vercel AI adapter: ${(error as Error).message}`);
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxTokens: 4096,
      supportsFunctionCalling: this.vercelConfig.enableFunctionCalling,
      supportsJsonMode: true,
      supportsStreaming: this.vercelConfig.enableStreaming,
      supportsVision: this.vercelConfig.enableVision,
      models: {
        completion: [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-3.5-turbo',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
          'gemini-1.5-pro',
          'gemini-1.5-flash'
        ],
        embedding: [] // Embeddings handled by our existing system
      }
    };
  }

  async loadAvailableModels(): Promise<ModelInfo[]> { return this.getAvailableModels(); }
  async refreshModels(): Promise<void> { await this.loadAvailableModels(); }

  getAvailableModels(): ModelInfo[] {
    return [
      {
        name: 'gpt-4o',
        provider: 'openai',
        maxTokens: 4096,
        costPer1KTokens: { prompt: 0.005, completion: 0.015 },
        averageLatency: 1200,
        qualityScore: 0.95
      },
      {
        name: 'gpt-3.5-turbo',
        provider: 'openai',
        maxTokens: 4096,
        costPer1KTokens: { prompt: 0.001, completion: 0.002 },
        averageLatency: 800,
        qualityScore: 0.85
      },
      {
        name: 'claude-3-sonnet-20240229',
        provider: 'anthropic',
        maxTokens: 4096,
        costPer1KTokens: { prompt: 0.003, completion: 0.015 },
        averageLatency: 1000,
        qualityScore: 0.92
      }
    ];
  }

  async estimateCost(request: UnifiedCompletionRequest | UnifiedEmbeddingRequest): Promise<CostEstimate> {
    const tokens = await this.estimateTokens(
      'messages' in request ?
        request.messages.map(m => m.content).join(' ') :
        Array.isArray(request.text) ? request.text.join(' ') : request.text
    );

    const model = request.model || 'gpt-4o';
    const modelInfo = this.getAvailableModels().find(m => m.name === model);
    const costInfo = modelInfo?.costPer1KTokens || { prompt: 0.005, completion: 0.015 };

    const promptCost = (tokens.prompt / 1000) * costInfo.prompt;
    const completionCost = (tokens.completion / 1000) * costInfo.completion;

    return {
      estimatedCost: promptCost + completionCost,
      breakdown: {
        promptTokens: tokens.prompt,
        completionTokens: tokens.completion,
        totalTokens: tokens.total,
        promptCost,
        completionCost,
        pricePerToken: (costInfo.prompt + costInfo.completion) / 2000
      }
    };
  }

  async estimateTokens(text: string, model?: string): Promise<TokenEstimate> {
    // Rough token estimation: 1 token ≈ 4 characters
    const promptTokens = Math.ceil(text.length / 4);
    const completionTokens = Math.ceil(promptTokens * 0.5); // Estimate completion as 50% of prompt

    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens
    };
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Simple health check with a minimal request
      await this.generateCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-3.5-turbo',
        maxTokens: 5
      });
      this.updateHealth(true);
      return true;
    } catch (error) {
      this.updateHealth(false);
      return false;
    }
  }

  /**
   * Health check for Vercel AI SDK integration
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      // Test with a simple completion
      const testResponse = await this.generateCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-3.5-turbo',
        maxTokens: 5
      });

      return {
        status: 'healthy',
        details: {
          vercelSDK: true,
          lastTest: new Date().toISOString(),
          responseTime: testResponse.metadata?.latency || 0,
          capabilities: this.getCapabilities()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: (error as Error).message,
          vercelSDK: false,
          lastTest: new Date().toISOString()
        }
      };
    }
  }
}
