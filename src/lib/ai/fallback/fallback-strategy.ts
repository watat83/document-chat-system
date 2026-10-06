import {
  UnifiedCompletionRequest,
  UnifiedCompletionResponse,
  UnifiedEmbeddingRequest,
  UnifiedEmbeddingResponse,
  UnifiedStreamRequest,
  UnifiedStreamChunk,
  AllProvidersFailedError,
  TaskType
} from '../interfaces/types';
import { AIProviderAdapter } from '../interfaces';
import { AIProviderRegistry } from '../registry';
import { AIRequestRouter, RoutingDecision } from '../routing';
import { CircuitBreakerManager } from '../circuit-breaker';

export interface FallbackAttempt {
  provider: string;
  adapter: AIProviderAdapter;
  error?: Error;
  success: boolean;
  latency?: number;
  cost?: number;
}

export interface FallbackResult<T> {
  result: T;
  primaryAttempt: FallbackAttempt;
  fallbackAttempts: FallbackAttempt[];
  totalAttempts: number;
  totalLatency: number;
  successfulProvider: string;
}

export interface FallbackConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  initialBackoffMs: number;
  enableRetries: boolean;
  retryableErrors: string[];
  fallbackPreferences: Partial<Record<TaskType, string[]>>;
  degradedModeThreshold: number;
}

export class AIFallbackStrategy {
  private attemptCount: Map<string, number> = new Map();
  private lastAttemptTime: Map<string, Date> = new Map();

  constructor(
    private registry: AIProviderRegistry,
    private router: AIRequestRouter,
    private circuitBreaker: CircuitBreakerManager,
    private config: FallbackConfig = {
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialBackoffMs: 1000,
      enableRetries: true,
      retryableErrors: ['RateLimitError', 'NetworkError', 'TimeoutError'],
      fallbackPreferences: {
        'document_analysis': ['anthropic', 'openai', 'azure'],
        'opportunity_matching': ['openai', 'anthropic', 'google'],
        'content_generation': ['openai', 'anthropic', 'azure'],
        'summarization': ['anthropic', 'openai', 'google'],
        'classification': ['openai', 'google', 'anthropic'],
        'embedding': ['openai', 'google', 'azure'],
        'simple_qa': ['openai', 'google', 'anthropic'],
        'complex_analysis': ['anthropic', 'openai', 'azure']
      },
      degradedModeThreshold: 0.5
    }
  ) {}

  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallbacks: Array<() => Promise<T>>,
    context: string = 'unknown'
  ): Promise<T> {
    const attempts: FallbackAttempt[] = [];
    const startTime = Date.now();

    try {
      const result = await primary();
      return result;
    } catch (primaryError) {
      console.error(`Primary provider failed for ${context}:`, primaryError);

      attempts.push({
        provider: 'primary',
        adapter: null as any,
        error: primaryError as Error,
        success: false,
        latency: Date.now() - startTime
      });

      for (let i = 0; i < fallbacks.length && i < this.config.maxAttempts - 1; i++) {
        try {
          const fallbackStart = Date.now();
          const result = await this.executeWithBackoff(fallbacks[i], i);

          attempts.push({
            provider: `fallback-${i}`,
            adapter: null as any,
            success: true,
            latency: Date.now() - fallbackStart
          });

          return result;
        } catch (fallbackError) {
          console.error(`Fallback ${i} failed for ${context}:`, fallbackError);

          attempts.push({
            provider: `fallback-${i}`,
            adapter: null as any,
            error: fallbackError as Error,
            success: false,
            latency: Date.now() - fallbackStart
          });

          continue;
        }
      }

      throw new AllProvidersFailedError(`All providers failed for ${context}`);
    }
  }

  async executeCompletionWithFallback(
    request: UnifiedCompletionRequest
  ): Promise<FallbackResult<UnifiedCompletionResponse>> {
    const attempts: FallbackAttempt[] = [];
    const startTime = Date.now();

    const routingDecision = await this.router.route({
      model: request.model,
      taskType: 'simple_qa',
      complexity: 'medium',
      messages: request.messages,
      provider: request.metadata?.provider
    });

    const fallbackProviders = this.getFallbackProviders(
      'simple_qa',
      routingDecision.selectedProvider
    );

    let primaryAttempt: FallbackAttempt;

    try {
      const primaryStart = Date.now();
      const result = await this.circuitBreaker.executeWithCircuitBreaker(
        routingDecision.selectedProvider,
        () => routingDecision.adapter.generateCompletion(request)
      );

      primaryAttempt = {
        provider: routingDecision.selectedProvider,
        adapter: routingDecision.adapter,
        success: true,
        latency: Date.now() - primaryStart,
        cost: routingDecision.estimatedCost
      };

      return {
        result,
        primaryAttempt,
        fallbackAttempts: [],
        totalAttempts: 1,
        totalLatency: Date.now() - startTime,
        successfulProvider: routingDecision.selectedProvider
      };
    } catch (primaryError) {
      primaryAttempt = {
        provider: routingDecision.selectedProvider,
        adapter: routingDecision.adapter,
        error: primaryError as Error,
        success: false,
        latency: Date.now() - startTime,
        cost: routingDecision.estimatedCost
      };

      console.error(`Primary provider ${routingDecision.selectedProvider} failed:`, primaryError);
    }

    for (const providerName of fallbackProviders) {
      const fallbackStart = Date.now(); // Move outside try block
      try {
        const adapter = this.registry.getProvider(providerName);
        if (!adapter) {
          continue;
        }

        await this.applyBackoff(attempts.length);

        const result = await this.circuitBreaker.executeWithCircuitBreaker(
          providerName,
          () => adapter.generateCompletion(request)
        );

        const fallbackAttempt: FallbackAttempt = {
          provider: providerName,
          adapter,
          success: true,
          latency: Date.now() - fallbackStart
        };

        attempts.push(fallbackAttempt);

        return {
          result,
          primaryAttempt,
          fallbackAttempts: attempts,
          totalAttempts: attempts.length + 1,
          totalLatency: Date.now() - startTime,
          successfulProvider: providerName
        };
      } catch (fallbackError) {
        const fallbackAttempt: FallbackAttempt = {
          provider: providerName,
          adapter: this.registry.getProvider(providerName)!,
          error: fallbackError as Error,
          success: false,
          latency: Date.now() - fallbackStart
        };

        attempts.push(fallbackAttempt);
        console.error(`Fallback provider ${providerName} failed:`, fallbackError);
        continue;
      }
    }

    throw new AllProvidersFailedError(
      `All providers failed for completion request. Primary: ${routingDecision.selectedProvider}, Fallbacks: ${fallbackProviders.join(', ')}`
    );
  }

  async executeEmbeddingWithFallback(
    request: UnifiedEmbeddingRequest
  ): Promise<FallbackResult<UnifiedEmbeddingResponse>> {
    const attempts: FallbackAttempt[] = [];
    const startTime = Date.now();

    console.log('🤖 Starting embedding fallback strategy...')
    console.log('📋 Available providers:', this.registry.getAvailableProviders())

    const routingDecision = await this.router.route({
      model: request.model,
      taskType: 'embedding',
      complexity: 'low',
      text: Array.isArray(request.text) ? request.text[0] : request.text
    });

    console.log('🎯 Primary provider selected:', routingDecision.selectedProvider)

    const fallbackProviders = this.getFallbackProviders('embedding', routingDecision.selectedProvider);
    console.log('🔄 Fallback providers:', fallbackProviders)

    let primaryAttempt: FallbackAttempt;

    try {
      const primaryStart = Date.now();
      console.log(`🚀 Attempting primary provider: ${routingDecision.selectedProvider}`)
      const result = await this.circuitBreaker.executeWithCircuitBreaker(
        routingDecision.selectedProvider,
        () => routingDecision.adapter.generateEmbedding(request)
      );
      console.log(`✅ Primary provider ${routingDecision.selectedProvider} succeeded`)

      primaryAttempt = {
        provider: routingDecision.selectedProvider,
        adapter: routingDecision.adapter,
        success: true,
        latency: Date.now() - primaryStart,
        cost: routingDecision.estimatedCost
      };

      return {
        result,
        primaryAttempt,
        fallbackAttempts: [],
        totalAttempts: 1,
        totalLatency: Date.now() - startTime,
        successfulProvider: routingDecision.selectedProvider
      };
    } catch (primaryError) {
      console.log(`❌ Primary provider ${routingDecision.selectedProvider} failed:`, primaryError)
      primaryAttempt = {
        provider: routingDecision.selectedProvider,
        adapter: routingDecision.adapter,
        error: primaryError as Error,
        success: false,
        latency: Date.now() - startTime
      };
    }

    for (const providerName of fallbackProviders) {
      const fallbackStart = Date.now();

      try {
        console.log(`🔄 Attempting fallback provider: ${providerName}`)
        const adapter = this.registry.getProvider(providerName);
        if (!adapter) {
          console.log(`❌ Fallback provider ${providerName} not available`)
          continue;
        }

        await this.applyBackoff(attempts.length);

        const result = await this.circuitBreaker.executeWithCircuitBreaker(
          providerName,
          () => adapter.generateEmbedding(request)
        );
        console.log(`✅ Fallback provider ${providerName} succeeded`)

        const fallbackAttempt: FallbackAttempt = {
          provider: providerName,
          adapter,
          success: true,
          latency: Date.now() - fallbackStart
        };

        attempts.push(fallbackAttempt);

        return {
          result,
          primaryAttempt,
          fallbackAttempts: attempts,
          totalAttempts: attempts.length + 1,
          totalLatency: Date.now() - startTime,
          successfulProvider: providerName
        };
      } catch (fallbackError) {
        console.log(`❌ Fallback provider ${providerName} failed:`, fallbackError)
        attempts.push({
          provider: providerName,
          adapter: this.registry.getProvider(providerName)!,
          error: fallbackError as Error,
          success: false,
          latency: Date.now() - fallbackStart
        });

        continue;
      }
    }

    throw new AllProvidersFailedError(`All providers failed for embedding request`);
  }

  async *executeStreamWithFallback(
    request: UnifiedStreamRequest
  ): AsyncGenerator<UnifiedStreamChunk> {
    const routingDecision = await this.router.route({
      model: request.model,
      taskType: 'simple_qa',
      complexity: 'medium',
      messages: request.messages,
      provider: request.metadata?.provider
    });

    const fallbackProviders = this.getFallbackProviders(
      'simple_qa',
      routingDecision.selectedProvider
    );

    let emitted = false;
    for (const providerName of [routingDecision.selectedProvider, ...fallbackProviders]) {
      try {
        if (request.signal?.aborted) throw request.signal.reason ?? new Error('Request cancelled');
        const adapter = this.registry.getProvider(providerName);
        if (!adapter) continue;
        for await (const chunk of await adapter.streamCompletion(request)) {
          emitted = true;
          yield chunk;
        }
        return;
      } catch (error) {
        // Retrying after output would append a second answer to a partial first answer.
        if (emitted || request.signal?.aborted || !this.isRetryableError(error as Error)) throw error;
      }
    }

    throw new AllProvidersFailedError(`All streaming providers failed`);
  }

  private getFallbackProviders(taskType: TaskType, primaryProvider: string): string[] {
    const preferred = this.config.fallbackPreferences[taskType] || [];
    const available = this.registry.getAvailableProviders();

    const fallbacks = preferred
      .filter(provider => provider !== primaryProvider && available.includes(provider))
      .slice(0, this.config.maxAttempts - 1);

    const additional = available
      .filter(provider => !fallbacks.includes(provider) && provider !== primaryProvider)
      .slice(0, this.config.maxAttempts - 1 - fallbacks.length);

    return [...fallbacks, ...additional];
  }

  private async executeWithBackoff<T>(operation: () => Promise<T>, attemptIndex: number): Promise<T> {
    if (attemptIndex > 0) {
      await this.applyBackoff(attemptIndex);
    }
    return operation();
  }

  private async applyBackoff(attemptIndex: number): Promise<void> {
    if (!this.config.enableRetries || attemptIndex === 0) {
      return;
    }

    const backoffMs = this.config.initialBackoffMs * Math.pow(this.config.backoffMultiplier, attemptIndex - 1);
    const jitter = Math.random() * 0.1 * backoffMs; // Add 10% jitter
    const totalBackoff = backoffMs + jitter;

    await new Promise(resolve => setTimeout(resolve, totalBackoff));
  }

  private isRetryableError(error: Error): boolean {
    return this.config.retryableErrors.some(errorType =>
      error.name === errorType || error.constructor.name === errorType
    );
  }

  isDegradedMode(): boolean {
    const availableProviders = this.registry.getAvailableProviders();
    const allProviders = Array.from(this.registry.getAllProviders().keys());

    const availabilityRatio = availableProviders.length / Math.max(allProviders.length, 1);
    return availabilityRatio < this.config.degradedModeThreshold;
  }

  getSystemStatus(): {
    degradedMode: boolean;
    availableProviders: string[];
    unavailableProviders: string[];
    totalProviders: number;
    healthScore: number;
  } {
    const availableProviders = this.registry.getAvailableProviders();
    const allProviders = Array.from(this.registry.getAllProviders().keys());
    const unavailableProviders = allProviders.filter(p => !availableProviders.includes(p));

    const healthScore = availableProviders.length / Math.max(allProviders.length, 1);

    return {
      degradedMode: this.isDegradedMode(),
      availableProviders,
      unavailableProviders,
      totalProviders: allProviders.length,
      healthScore
    };
  }
}
