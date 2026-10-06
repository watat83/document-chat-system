import { AIProviderAdapter } from '../interfaces';
import { ProviderCapabilities } from '../interfaces/types';

export interface ProviderConfig {
  enabled: boolean;
  priority: number;
  maxConcurrentRequests?: number;
  healthCheckInterval?: number;
  costMultiplier?: number;
}

export interface RegisteredProvider {
  adapter: AIProviderAdapter;
  config: ProviderConfig;
  lastHealthCheck: Date;
  isHealthy: boolean;
  errorCount: number;
  lastError?: Error;
}

export class AIProviderRegistry {
  private providers: Map<string, RegisteredProvider> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;

  register(name: string, adapter: AIProviderAdapter, config: ProviderConfig = {
    enabled: true,
    priority: 1,
    maxConcurrentRequests: 10,
    healthCheckInterval: 60000,
    costMultiplier: 1.0
  }): void {
    const registeredProvider: RegisteredProvider = {
      adapter,
      config,
      lastHealthCheck: new Date(),
      isHealthy: true,
      errorCount: 0
    };

    this.providers.set(name, registeredProvider);

    if (!this.healthCheckInterval && config.healthCheckInterval) {
      this.startHealthChecks();
    }
  }

  unregister(name: string): boolean {
    return this.providers.delete(name);
  }

  getProvider(name: string): AIProviderAdapter | null {
    const registered = this.providers.get(name);

    if (!registered || !registered.config.enabled || !registered.isHealthy) {
      return null;
    }

    return registered.adapter;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.config.enabled && provider.isHealthy)
      .sort(([_, a], [__, b]) => b.config.priority - a.config.priority)
      .map(([name, _]) => name);
  }

  getAllProviders(): Map<string, RegisteredProvider> {
    return new Map(this.providers);
  }

  getProviderCapabilities(name: string): ProviderCapabilities | null {
    const provider = this.getProvider(name);
    return provider ? provider.getCapabilities() : null;
  }

  getProviderStatus(name: string): {
    enabled: boolean;
    priority: number;
    maxConcurrentRequests?: number;
    healthCheckInterval?: number;
    healthy: boolean;
    lastHealthCheck: Date;
    errorCount: number;
    lastError?: string;
  } | null {
    const registered = this.providers.get(name);

    if (!registered) {
      return null;
    }

    return {
      enabled: registered.config.enabled,
      priority: registered.config.priority,
      maxConcurrentRequests: registered.config.maxConcurrentRequests,
      healthCheckInterval: registered.config.healthCheckInterval,
      healthy: registered.isHealthy,
      lastHealthCheck: registered.lastHealthCheck,
      errorCount: registered.errorCount,
      lastError: registered.lastError?.message
    };
  }

  enableProvider(name: string): boolean {
    const registered = this.providers.get(name);
    if (registered) {
      registered.config.enabled = true;
      return true;
    }
    return false;
  }

  disableProvider(name: string): boolean {
    const registered = this.providers.get(name);
    if (registered) {
      registered.config.enabled = false;
      return true;
    }
    return false;
  }

  recordProviderError(name: string, error: Error): void {
    const registered = this.providers.get(name);
    if (registered) {
      registered.errorCount++;
      registered.lastError = error;

      if (registered.errorCount >= 5) {
        registered.isHealthy = false;
        console.warn(`Provider ${name} marked as unhealthy due to repeated errors`);
      }
    }
  }

  recordProviderSuccess(name: string): void {
    const registered = this.providers.get(name);
    if (registered) {
      registered.errorCount = Math.max(0, registered.errorCount - 1);

      if (!registered.isHealthy && registered.errorCount === 0) {
        registered.isHealthy = true;
        console.info(`Provider ${name} recovered and marked as healthy`);
      }
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 60000); // Check every minute
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.providers.entries()).map(
      async ([name, registered]) => {
        if (!registered.config.enabled) {
          return;
        }

        try {
          // Check if the adapter has a checkHealth method
          const isHealthy = typeof registered.adapter.checkHealth === 'function'
            ? await registered.adapter.checkHealth()
            : true; // Assume healthy if no checkHealth method
          registered.isHealthy = isHealthy;
          registered.lastHealthCheck = new Date();

          if (isHealthy) {
            this.recordProviderSuccess(name);
          }
        } catch (error) {
          console.error(`Health check failed for provider ${name}:`, error);
          this.recordProviderError(name, error as Error);
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  getHealthySortedProviders(): Array<{ name: string; provider: RegisteredProvider }> {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) =>
        provider.config.enabled &&
        provider.isHealthy
      )
      .sort(([_, a], [__, b]) => {
        if (a.config.priority !== b.config.priority) {
          return b.config.priority - a.config.priority;
        }

        return a.errorCount - b.errorCount;
      })
      .map(([name, provider]) => ({ name, provider }));
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    this.providers.clear();
  }
}
