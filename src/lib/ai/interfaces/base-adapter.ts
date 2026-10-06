import { AuthenticationError, RateLimitError, ValidationError, ProviderError } from './types';
import {
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
} from './types';

/**
 * Base class for all AI provider adapters
 * Provides common functionality and enforces interface compliance
 */
export abstract class AIProviderAdapter {
  protected name: string;
  protected isHealthy: boolean = true;
  protected lastHealthCheck: Date = new Date();

  constructor(name: string) {
    this.name = name;
  }

  // Abstract methods that must be implemented by subclasses
  abstract initialize(): Promise<void>;
  abstract getCapabilities(): ProviderCapabilities;
  abstract getAvailableModels(): ModelInfo[];
  abstract loadAvailableModels(): Promise<ModelInfo[]>;
  abstract refreshModels(): Promise<void>;
  abstract estimateCost(request: UnifiedCompletionRequest | UnifiedEmbeddingRequest): Promise<CostEstimate>;
  abstract estimateTokens(text: string, model?: string): Promise<TokenEstimate>;

  // Core API methods
  abstract generateCompletion(request: UnifiedCompletionRequest): Promise<UnifiedCompletionResponse>;
  abstract generateEmbedding(request: UnifiedEmbeddingRequest): Promise<UnifiedEmbeddingResponse>;
  abstract streamCompletion(request: UnifiedStreamRequest): Promise<AsyncIterable<UnifiedStreamChunk>> | AsyncIterable<UnifiedStreamChunk>;

  // Health check methods
  abstract checkHealth(): Promise<boolean>;

  // Common utility methods
  getName(): string {
    return this.name;
  }

  getHealth(): boolean {
    return this.isHealthy;
  }

  getLastHealthCheck(): Date {
    return this.lastHealthCheck;
  }

  protected updateHealth(healthy: boolean): void {
    this.isHealthy = healthy;
    this.lastHealthCheck = new Date();
  }

  // Default implementation for model validation
  protected validateModel(model: string): boolean {
    const availableModels = this.getAvailableModels();
    return availableModels.some(m => m.name === model);
  }


  // Common error handling
  protected handleError(error: any, context: string): Error {
    const message = `[${this.name}] ${context}: ${error.message || error}`;

    if (error.status === 401 || error.code === 'AUTHENTICATION_ERROR') {
      return new AuthenticationError(message, this.name);
    }

    if (error.status === 429 || error.code === 'RATE_LIMIT_ERROR') {
      return new RateLimitError(message, {
        provider: this.name,
        retryAfter: error.retryAfter
      });
    }

    if (error.status >= 400 && error.status < 500) {
      return new ValidationError(message, {
        provider: this.name,
        details: error
      });
    }

    // Generic provider error
    const providerError = new Error(message) as any;
    providerError.provider = this.name;
    providerError.retryable = error.status >= 500;
    return providerError;
  }
}
