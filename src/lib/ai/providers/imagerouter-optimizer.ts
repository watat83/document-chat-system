/**
 * ImageRouter Performance Optimizer
 *
 * Advanced performance optimization for ImageRouter integration including:
 * - Intelligent model selection and routing
 * - Dynamic request batching and queuing
 * - Adaptive caching strategies
 * - Cost optimization algorithms
 * - Quality-based fallback mechanisms
 */

import { cacheManager } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/cache/config';
import { imageRouterMetrics } from './imagerouter-metrics';
import {
  UnifiedMediaGenerationRequest,
  UnifiedMediaGenerationResponse,
  ImageRouterModel,
  ImageRouterModelPerformance,
  IMAGEROUTER_CONSTANTS
} from '../interfaces/imagerouter-types';

export interface OptimizationConfig {
  enableModelRouting: boolean;
  enableRequestBatching: boolean;
  enableAdaptiveCaching: boolean;
  enableCostOptimization: boolean;
  enableQualityFallback: boolean;
  performance: {
    maxLatencyMs: number;
    targetSuccessRate: number;
    maxCostPerRequest: number;
  };
  batching: {
    maxBatchSize: number;
    batchTimeoutMs: number;
    enableSmartBatching: boolean;
  };
  caching: {
    enablePromptSimilarity: boolean;
    similarityThreshold: number;
    maxCacheSize: number;
    adaptiveTTL: boolean;
  };
  fallback: {
    enableAutoFallback: boolean;
    maxRetries: number;
    fallbackModels: string[];
    qualityThreshold: number;
  };
}

export interface ModelScore {
  modelId: string;
  score: number;
  reasoningText: {
    latencyScore: number;
    costScore: number;
    qualityScore: number;
    reliabilityScore: number;
    weightedScore: number;
  };
  recommendation: 'recommended' | 'acceptable' | 'avoid';
}

export interface OptimizationResult {
  originalRequest: UnifiedMediaGenerationRequest;
  optimizedRequest: UnifiedMediaGenerationRequest;
  selectedModel: string;
  estimatedImprovement: {
    latencyReduction: number;
    costSavings: number;
    qualityImprovement: number;
  };
  optimizations: string[];
  cacheHit: boolean;
  batchedWith?: string[];
}

export interface RequestBatch {
  id: string;
  requests: UnifiedMediaGenerationRequest[];
  combinedPrompt: string;
  estimatedSavings: number;
  createdAt: Date;
  timeoutAt: Date;
}

export interface CacheEntry {
  key: string;
  response: UnifiedMediaGenerationResponse;
  similarity: number;
  usage: number;
  lastAccessed: Date;
  quality: number;
  ttl: number;
}

export class ImageRouterOptimizer {
  private config: OptimizationConfig;
  private pendingBatches: Map<string, RequestBatch> = new Map();
  private batchTimeout: Map<string, NodeJS.Timeout> = new Map();
  private cacheEntries: Map<string, CacheEntry> = new Map();

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = {
      enableModelRouting: true,
      enableRequestBatching: true,
      enableAdaptiveCaching: true,
      enableCostOptimization: true,
      enableQualityFallback: true,
      performance: {
        maxLatencyMs: 30000,
        targetSuccessRate: 0.95,
        maxCostPerRequest: 0.25
      },
      batching: {
        maxBatchSize: 5,
        batchTimeoutMs: 2000,
        enableSmartBatching: true
      },
      caching: {
        enablePromptSimilarity: true,
        similarityThreshold: 0.85,
        maxCacheSize: 1000,
        adaptiveTTL: true
      },
      fallback: {
        enableAutoFallback: true,
        maxRetries: 3,
        fallbackModels: ['openai/dall-e-3', 'stability-ai/stable-diffusion-xl'],
        qualityThreshold: 0.7
      },
      ...config
    };
  }

  /**
   * Optimize a media generation request
   */
  async optimizeRequest(
    request: UnifiedMediaGenerationRequest,
    availableModels: ImageRouterModel[]
  ): Promise<OptimizationResult> {
    const optimizations: string[] = [];
    let optimizedRequest = { ...request };
    let selectedModel = request.model;
    let cacheHit = false;
    let batchedWith: string[] | undefined;

    // 1. Check cache first
    if (this.config.enableAdaptiveCaching) {
      const cachedResult = await this.checkCache(request);
      if (cachedResult) {
        cacheHit = true;
        optimizations.push('cache_hit');
        return {
          originalRequest: request,
          optimizedRequest: request,
          selectedModel: cachedResult.response.model,
          estimatedImprovement: {
            latencyReduction: 95, // Cache hits are ~95% faster
            costSavings: 100, // Cache hits are free
            qualityImprovement: 0
          },
          optimizations,
          cacheHit: true
        };
      }
    }

    // 2. Optimize model selection
    if (this.config.enableModelRouting && !selectedModel) {
      const modelScore = await this.selectOptimalModel(request, availableModels);
      selectedModel = modelScore.modelId;
      optimizedRequest.model = selectedModel;
      optimizations.push(`model_routing:${modelScore.recommendation}`);
    }

    // 3. Optimize request parameters
    const paramOptimizations = await this.optimizeParameters(optimizedRequest);
    if (paramOptimizations.changes.prompt !== undefined) optimizedRequest.prompt = paramOptimizations.changes.prompt;
    if ('quality' in optimizedRequest && paramOptimizations.changes.quality !== undefined) optimizedRequest.quality = paramOptimizations.changes.quality;
    if (optimizedRequest.type === 'image' && paramOptimizations.changes.count !== undefined) optimizedRequest.count = paramOptimizations.changes.count;
    optimizations.push(...paramOptimizations.optimizations);

    // 4. Check for batching opportunities
    if (this.config.enableRequestBatching) {
      const batchResult = await this.attemptBatching(optimizedRequest);
      if (batchResult.batched) {
        batchedWith = batchResult.batchedWith;
        optimizations.push('request_batching');
      }
    }

    // 5. Calculate estimated improvements
    const estimatedImprovement = await this.estimateImprovement(
      request,
      optimizedRequest,
      selectedModel || request.model || 'default'
    );

    return {
      originalRequest: request,
      optimizedRequest,
      selectedModel: selectedModel || request.model || 'default',
      estimatedImprovement,
      optimizations,
      cacheHit,
      batchedWith
    };
  }

  /**
   * Select the optimal model based on current performance metrics
   */
  async selectOptimalModel(
    request: UnifiedMediaGenerationRequest,
    availableModels: ImageRouterModel[]
  ): Promise<ModelScore> {
    const relevantModels = availableModels.filter(model => {
      if (request.type === 'image' && model.type !== 'image') return false;
      if (request.type === 'video' && model.type !== 'video') return false;
      if (request.type === 'edit' && model.type !== 'edit') return false;
      return true;
    });

    const scores: ModelScore[] = [];
    const modelPerformance = await imageRouterMetrics.getModelPerformanceComparison();

    for (const model of relevantModels) {
      const performance = modelPerformance[model.id];
      const score = await this.calculateModelScore(model, performance, request);
      scores.push(score);
    }

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    // Return the best model that meets our criteria
    const bestModel = scores.find(s => s.recommendation === 'recommended') || scores[0];

    if (!bestModel) {
      throw new Error('No suitable models found for request');
    }

    return bestModel;
  }

  /**
   * Calculate a comprehensive score for a model
   */
  private async calculateModelScore(
    model: ImageRouterModel,
    performance: ImageRouterModelPerformance | undefined,
    request: UnifiedMediaGenerationRequest
  ): Promise<ModelScore> {
    // Weight factors based on request priority
    const weights = {
      latency: 0.3,
      cost: 0.25,
      quality: 0.3,
      reliability: 0.15
    };

    // Adjust weights based on request context
    if (request.metadata?.priority === 'speed') {
      weights.latency = 0.5;
      weights.cost = 0.2;
      weights.quality = 0.2;
      weights.reliability = 0.1;
    } else if (request.metadata?.priority === 'quality') {
      weights.latency = 0.1;
      weights.cost = 0.2;
      weights.quality = 0.5;
      weights.reliability = 0.2;
    } else if (request.metadata?.priority === 'cost') {
      weights.latency = 0.2;
      weights.cost = 0.5;
      weights.quality = 0.2;
      weights.reliability = 0.1;
    }

    // Calculate individual scores (0-1 scale)
    const latencyScore = this.calculateLatencyScore(performance?.averageLatency || 15000);
    const costScore = this.calculateCostScore(performance?.averageCost || 0.02);
    const qualityScore = performance?.qualityScore || 0.8;
    const reliabilityScore = performance?.successRate || 0.95;

    // Calculate weighted score
    const weightedScore =
      latencyScore * weights.latency +
      costScore * weights.cost +
      qualityScore * weights.quality +
      reliabilityScore * weights.reliability;

    // Determine recommendation
    let recommendation: 'recommended' | 'acceptable' | 'avoid' = 'acceptable';
    if (weightedScore >= 0.8 && reliabilityScore >= 0.9) {
      recommendation = 'recommended';
    } else if (weightedScore < 0.5 || reliabilityScore < 0.7) {
      recommendation = 'avoid';
    }

    return {
      modelId: model.id,
      score: weightedScore,
      reasoningText: {
        latencyScore,
        costScore,
        qualityScore,
        reliabilityScore,
        weightedScore
      },
      recommendation
    };
  }

  /**
   * Optimize request parameters for better performance
   */
  private async optimizeParameters(
    request: UnifiedMediaGenerationRequest
  ): Promise<{ changes: { prompt?: string; quality?: 'auto' | 'low' | 'medium' | 'high'; count?: number }; optimizations: string[] }> {
    const changes: { prompt?: string; quality?: 'auto' | 'low' | 'medium' | 'high'; count?: number } = {};
    const optimizations: string[] = [];

    // Optimize quality settings based on use case
    if ('quality' in request) {
      const currentQuality = request.quality || 'auto';
      const optimizedQuality = await this.optimizeQuality(currentQuality, request);

      if (optimizedQuality !== currentQuality) {
        changes.quality = optimizedQuality;
        optimizations.push(`quality_optimization:${currentQuality}_to_${optimizedQuality}`);
      }
    }

    // Optimize count/batch size
    if ('count' in request && request.count && request.count > 1) {
      const optimizedCount = this.optimizeCount(request.count);
      if (optimizedCount !== request.count) {
        changes.count = optimizedCount;
        optimizations.push(`count_optimization:${request.count}_to_${optimizedCount}`);
      }
    }

    // Optimize prompt for better performance
    const optimizedPrompt = await this.optimizePrompt(request.prompt);
    if (optimizedPrompt !== request.prompt) {
      changes.prompt = optimizedPrompt;
      optimizations.push('prompt_optimization');
    }

    return { changes, optimizations };
  }

  /**
   * Attempt to batch similar requests
   */
  private async attemptBatching(
    request: UnifiedMediaGenerationRequest
  ): Promise<{ batched: boolean; batchedWith?: string[] }> {
    if (!this.config.enableRequestBatching) {
      return { batched: false };
    }

    // Find compatible pending batches
    const compatibleBatch = this.findCompatibleBatch(request);

    if (compatibleBatch && compatibleBatch.requests.length < this.config.batching.maxBatchSize) {
      compatibleBatch.requests.push(request);

      // If batch is full, process immediately
      if (compatibleBatch.requests.length >= this.config.batching.maxBatchSize) {
        await this.processBatch(compatibleBatch);
      }

      return {
        batched: true,
        batchedWith: compatibleBatch.requests
          .filter(r => r !== request)
          .map(r => r.metadata?.requestId || 'unknown')
      };
    }

    // Create new batch if no compatible batch found
    if (this.config.batching.enableSmartBatching) {
      const newBatch = this.createNewBatch(request);
      this.pendingBatches.set(newBatch.id, newBatch);

      // Set timeout for batch processing
      const timeout = setTimeout(() => {
        this.processBatch(newBatch);
      }, this.config.batching.batchTimeoutMs);

      this.batchTimeout.set(newBatch.id, timeout);
    }

    return { batched: false };
  }

  /**
   * Check cache for similar requests
   */
  private async checkCache(
    request: UnifiedMediaGenerationRequest
  ): Promise<CacheEntry | null> {
    if (!this.config.enableAdaptiveCaching) {
      return null;
    }

    const cacheKey = this.generateCacheKey(request);

    // Check exact match first
    const exactMatch = await cacheManager.get<UnifiedMediaGenerationResponse>(cacheKey);
    if (exactMatch) {
      await this.updateCacheUsage(cacheKey);
      return {
        key: cacheKey,
        response: exactMatch,
        similarity: 1.0,
        usage: 1,
        lastAccessed: new Date(),
        quality: 1.0,
        ttl: CACHE_TTL.LONG
      };
    }

    // Check for similar prompts if enabled
    if (this.config.caching.enablePromptSimilarity) {
      const similarEntry = await this.findSimilarCacheEntry(request);
      if (similarEntry && similarEntry.similarity >= this.config.caching.similarityThreshold) {
        await this.updateCacheUsage(similarEntry.key);
        return similarEntry;
      }
    }

    return null;
  }

  /**
   * Cache a successful response
   */
  async cacheResponse(
    request: UnifiedMediaGenerationRequest,
    response: UnifiedMediaGenerationResponse,
    quality: number = 0.8
  ): Promise<void> {
    if (!this.config.enableAdaptiveCaching) {
      return;
    }

    const cacheKey = this.generateCacheKey(request);

    // Calculate adaptive TTL based on quality and usage patterns
    const ttl = this.config.caching.adaptiveTTL
      ? this.calculateAdaptiveTTL(quality, request)
      : CACHE_TTL.LONG;

    await cacheManager.set(cacheKey, response, ttl);

    // Store metadata
    this.cacheEntries.set(cacheKey, {
      key: cacheKey,
      response,
      similarity: 1.0,
      usage: 1,
      lastAccessed: new Date(),
      quality,
      ttl
    });

    // Maintain cache size limit
    await this.maintainCacheSize();
  }

  /**
   * Get optimization statistics
   */
  async getOptimizationStats(): Promise<{
    totalOptimizations: number;
    cacheHitRate: number;
    averageLatencyReduction: number;
    averageCostSavings: number;
    batchingEfficiency: number;
    modelRoutingSuccess: number;
  }> {
    const metrics = await imageRouterMetrics.getAggregatedMetrics();

    // This would be enhanced with actual optimization tracking
    return {
      totalOptimizations: metrics.requests.total,
      cacheHitRate: 0.15, // Placeholder - would track actual cache hits
      averageLatencyReduction: 0.25, // 25% average reduction
      averageCostSavings: 0.30, // 30% average savings
      batchingEfficiency: 0.20, // 20% of requests batched
      modelRoutingSuccess: 0.85 // 85% of routes were optimal
    };
  }

  // Private helper methods

  private calculateLatencyScore(latency: number): number {
    // Score inversely related to latency (lower latency = higher score)
    const maxAcceptableLatency = this.config.performance.maxLatencyMs;
    if (latency <= 5000) return 1.0; // Excellent
    if (latency <= 15000) return 0.8; // Good
    if (latency <= maxAcceptableLatency) return 0.6; // Acceptable
    return Math.max(0.1, 1 - (latency / maxAcceptableLatency));
  }

  private calculateCostScore(cost: number): number {
    // Score inversely related to cost (lower cost = higher score)
    const maxAcceptableCost = this.config.performance.maxCostPerRequest;
    if (cost <= 0.01) return 1.0; // Excellent
    if (cost <= 0.05) return 0.8; // Good
    if (cost <= maxAcceptableCost) return 0.6; // Acceptable
    return Math.max(0.1, 1 - (cost / maxAcceptableCost));
  }

  private async optimizeQuality(
    currentQuality: 'auto' | 'low' | 'medium' | 'high',
    request: UnifiedMediaGenerationRequest
  ): Promise<'auto' | 'low' | 'medium' | 'high'> {
    // Optimize quality based on use case and cost constraints
    if (request.metadata?.priority === 'cost' && currentQuality === 'high') {
      return 'medium';
    }

    if (request.metadata?.priority === 'speed' && currentQuality === 'high') {
      return 'auto';
    }

    return currentQuality;
  }

  private optimizeCount(count: number): number {
    // Optimize count based on performance constraints
    if (count > 5) return 5; // Max batch size
    return count;
  }

  private async optimizePrompt(prompt: string): Promise<string> {
    // Basic prompt optimization
    let optimized = prompt.trim();

    // Remove redundant words that don't affect image generation
    const redundantPhrases = [
      'please create',
      'generate an image of',
      'make a picture of',
      'i want',
      'can you'
    ];

    for (const phrase of redundantPhrases) {
      optimized = optimized.replace(new RegExp(phrase, 'gi'), '');
    }

    return optimized.trim();
  }

  private findCompatibleBatch(request: UnifiedMediaGenerationRequest): RequestBatch | undefined {
    for (const batch of this.pendingBatches.values()) {
      if (this.isRequestCompatibleWithBatch(request, batch)) {
        return batch;
      }
    }
    return undefined;
  }

  private isRequestCompatibleWithBatch(
    request: UnifiedMediaGenerationRequest,
    batch: RequestBatch
  ): boolean {
    const firstRequest = batch.requests[0];

    // Must be same type and model
    if (request.type !== firstRequest.type) return false;
    if (request.model !== firstRequest.model) return false;

    // Similar quality requirements
    if ('quality' in request && 'quality' in firstRequest) {
      if (request.quality !== firstRequest.quality) return false;
    }

    // Compatible timing
    if (Date.now() > batch.timeoutAt.getTime()) return false;

    return true;
  }

  private createNewBatch(request: UnifiedMediaGenerationRequest): RequestBatch {
    const id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      id,
      requests: [request],
      combinedPrompt: request.prompt,
      estimatedSavings: 0,
      createdAt: new Date(),
      timeoutAt: new Date(Date.now() + this.config.batching.batchTimeoutMs)
    };
  }

  private async processBatch(batch: RequestBatch): Promise<void> {
    // Remove from pending
    this.pendingBatches.delete(batch.id);

    // Clear timeout
    const timeout = this.batchTimeout.get(batch.id);
    if (timeout) {
      clearTimeout(timeout);
      this.batchTimeout.delete(batch.id);
    }

    // Process the batch (implementation would depend on specific batching strategy)
    console.log(`Processing batch ${batch.id} with ${batch.requests.length} requests`);
  }

  private generateCacheKey(request: UnifiedMediaGenerationRequest): string {
    const keyParts = [
      request.type,
      request.model || 'default',
      this.hashPrompt(request.prompt)
    ];

    if ('quality' in request) {
      keyParts.push(request.quality || 'auto');
    }

    if ('count' in request) {
      keyParts.push(String(request.count || 1));
    }

    return `imagerouter:cache:${keyParts.join(':')}`;
  }

  private hashPrompt(prompt: string): string {
    // Simple hash function for prompt
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private async findSimilarCacheEntry(
    request: UnifiedMediaGenerationRequest
  ): Promise<CacheEntry | null> {
    // Simplified similarity search
    for (const entry of this.cacheEntries.values()) {
      const similarity = this.calculatePromptSimilarity(
        request.prompt,
        entry.response.metadata?.revisedPrompt || ''
      );

      if (similarity >= this.config.caching.similarityThreshold) {
        return { ...entry, similarity };
      }
    }

    return null;
  }

  private calculatePromptSimilarity(prompt1: string, prompt2: string): number {
    // Simplified similarity calculation (Jaccard similarity)
    const words1 = new Set(prompt1.toLowerCase().split(/\s+/));
    const words2 = new Set(prompt2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private async updateCacheUsage(cacheKey: string): Promise<void> {
    const entry = this.cacheEntries.get(cacheKey);
    if (entry) {
      entry.usage++;
      entry.lastAccessed = new Date();
    }
  }

  private calculateAdaptiveTTL(quality: number, request: UnifiedMediaGenerationRequest): number {
    // Base TTL
    let ttl = CACHE_TTL.MEDIUM;

    // Higher quality results get longer TTL
    if (quality >= 0.9) {
      ttl = CACHE_TTL.LONG;
    } else if (quality < 0.7) {
      ttl = CACHE_TTL.SHORT;
    }

    // Adjust based on request type
    if (request.type === 'video') {
      ttl *= 1.5; // Videos are more expensive to generate
    }

    return ttl;
  }

  private async maintainCacheSize(): Promise<void> {
    if (this.cacheEntries.size <= this.config.caching.maxCacheSize) {
      return;
    }

    // Remove least recently used entries with lowest quality
    const entries = Array.from(this.cacheEntries.values())
      .sort((a, b) => {
        // Sort by usage frequency and quality
        const scoreA = a.usage * a.quality;
        const scoreB = b.usage * b.quality;
        return scoreA - scoreB;
      });

    // Remove bottom 10%
    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cacheEntries.delete(entries[i].key);
      await cacheManager.delete(entries[i].key);
    }
  }

  private async estimateImprovement(
    original: UnifiedMediaGenerationRequest,
    optimized: UnifiedMediaGenerationRequest,
    selectedModel: string
  ): Promise<{ latencyReduction: number; costSavings: number; qualityImprovement: number }> {
    // Placeholder implementation - would use actual performance data
    return {
      latencyReduction: 15, // 15% average latency reduction
      costSavings: 20, // 20% average cost savings
      qualityImprovement: 5 // 5% quality improvement
    };
  }
}

// Singleton instance
export const imageRouterOptimizer = new ImageRouterOptimizer();
