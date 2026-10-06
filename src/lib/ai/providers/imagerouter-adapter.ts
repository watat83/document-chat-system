import { normalizeError } from '@/lib/errors/normalize-error';
/**
 * ImageRouter Adapter
 *
 * Media generation adapter for ImageRouter.io following OpenRouter adapter patterns.
 * Supports image generation, video generation, and image editing capabilities.
 * Implements comprehensive error handling, caching, usage tracking, and performance monitoring.
 */

import { imageRouter } from '@/lib/config/env';
import {
  AIProviderAdapter,
  ProviderCapabilities,
  ModelInfo,
  ValidationError,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  ProviderUnavailableError,
  ProviderConfigurationError,
  QuotaExceededError
} from '../interfaces';
import { CircuitBreakerManager } from '../circuit-breaker/circuit-breaker';
import { ImageRouterErrorHandler } from './imagerouter-error-handler';

import {
  ImageRouterConfig,
  UnifiedMediaGenerationRequest,
  UnifiedMediaGenerationResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  VideoGenerationRequest,
  VideoGenerationResponse,
  ImageEditRequest,
  ImageEditResponse,
  ImageRouterModel,
  ImageRouterModelsResponse,
  MediaCostEstimate,
  ImageRouterMetrics,
  ImageRouterError,
  ImageRouterModelPerformance,
  ImageRouterCapabilities,
  IMAGEROUTER_CONSTANTS,
  isImageGenerationRequest,
  isVideoGenerationRequest,
  isImageEditRequest
} from '../interfaces/imagerouter-types';

import { cacheManager } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/cache/config';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { validateCSRFInAPIRoute } from '@/lib/csrf';

/**
 * ImageRouter Adapter
 *
 * Deep native integration with ImageRouter.io API:
 * - Uses ImageRouter's /models endpoint for model discovery
 * - Supports image generation, video generation, and image editing
 * - Implements intelligent model routing and cost optimization
 * - Full integration with internal policies and security
 * - Comprehensive caching and performance monitoring
 */
export class ImageRouterAdapter extends AIProviderAdapter {
  private config: ImageRouterConfig;
  private baseUrl: string;
  private metrics: ImageRouterMetrics;
  private circuitBreakerManager: CircuitBreakerManager;
  private errorHandler: ImageRouterErrorHandler;

  // Configuration constants
  private readonly DEFAULT_TIMEOUT = 60000; // 60 seconds for media generation
  private readonly DEFAULT_QUALITY = 'auto';
  private readonly DEFAULT_RESPONSE_FORMAT = 'url';
  private readonly MIN_SAMPLES_FOR_STATS = 5;
  private readonly PERFORMANCE_CACHE_DURATION = 300; // 5 minutes

  constructor(config: ImageRouterConfig) {
    super('imagerouter');
    this.config = config;
    this.baseUrl = config.baseUrl;

    // Initialize circuit breaker with ImageRouter-specific configuration
    // More lenient settings since ImageRouter is optional and may not always be available
    this.circuitBreakerManager = new CircuitBreakerManager({
      failureThreshold: 5, // Allow more failures before opening circuit
      recoveryTimeout: 60000, // 1 minute recovery time
      monitoringWindow: 300000, // 5 minute window
      expectedErrorRate: 0.15 // 15% error rate threshold (more tolerant)
    });

    // Initialize error handler with media generation optimized settings
    this.errorHandler = new ImageRouterErrorHandler({
      maxAttempts: 3,
      baseDelay: 2000,        // 2 seconds for media generation
      maxDelay: 60000,        // 1 minute max for media tasks
      backoffMultiplier: 2,
      jitterFactor: 0.15,     // Slightly more jitter for media generation
      retryableCategories: ['transient', 'network', 'rate_limit', 'service']
    });

    // Initialize metrics
    this.metrics = {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      averageLatency: 0,
      totalCost: 0,
      lastRequestAt: new Date().toISOString(),
      modelUsage: {}
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new ProviderConfigurationError('ImageRouter API key is required');
    }

    try {
      await this.testConnection();
      await this.loadAndCacheModels();

      console.log('✅ ImageRouterAdapter initialized successfully');
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      // Don't throw - log the error but allow the adapter to be registered anyway
      // The adapter will work for actual requests even if the initial connection test fails
      console.warn('⚠️ ImageRouterAdapter initialization warning - connection test failed but adapter is registered:', error);
      console.log('📝 ImageRouter will still attempt to handle requests');
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxTokens: 0, // Not applicable for media generation
      supportsFunctionCalling: false,
      supportsJsonMode: false,
      supportsStreaming: false,
      supportsVision: false, // This is for input, ImageRouter generates media
      supportsAudio: false,
      models: {
        completion: [], // ImageRouter doesn't do text completion
        embedding: []   // ImageRouter doesn't do embeddings
      }
    };
  }

  // Required by AIProviderAdapter base class
  async loadAvailableModels(): Promise<ModelInfo[]> {
    return this.loadImageRouterModels();
  }

  async refreshModels(): Promise<void> {
    // Refresh models asynchronously
    await this.loadImageRouterModels();
  }

  async estimateCost(request: any): Promise<any> {
    if (request.type && ['image', 'video', 'edit'].includes(request.type)) {
      return this.estimateMediaCost(request);
    }
    return { estimatedCost: 0, breakdown: {} };
  }

  async estimateTokens(text: string, model?: string): Promise<{ prompt: number; completion: number; total: number }> {
    // Not applicable for media generation
    return { prompt: 0, completion: 0, total: 0 };
  }

  async generateCompletion(): Promise<any> {
    throw new Error('Text completion not supported by ImageRouter - use generateMedia instead');
  }

  async generateEmbedding(): Promise<any> {
    throw new Error('Embeddings not supported by ImageRouter');
  }

  async streamCompletion(): Promise<AsyncIterable<any>> {
    throw new Error('Streaming not supported by ImageRouter');
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.testConnection();
      this.updateHealth(true);
      return true;
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      this.updateHealth(false);
      return false;
    }
  }

  /**
   * Get ImageRouter capabilities specific to media generation
   */
  async getMediaCapabilities(): Promise<ImageRouterCapabilities> {
    const cacheKey = 'ai:imagerouter:capabilities';

    try {
      const cached = await cacheManager.get<ImageRouterCapabilities>(cacheKey);
      if (cached) {
        return cached;
      }

      const models = await this.loadImageRouterModels();

      const capabilities: ImageRouterCapabilities = {
        imageGeneration: true,
        videoGeneration: true,
        imageEditing: true,
        supportedFormats: {
          input: [...IMAGEROUTER_CONSTANTS.SUPPORTED_FORMATS.INPUT],
          output: [...IMAGEROUTER_CONSTANTS.SUPPORTED_FORMATS.OUTPUT]
        },
        maxFileSize: IMAGEROUTER_CONSTANTS.MAX_FILE_SIZE,
        maxImages: IMAGEROUTER_CONSTANTS.MAX_IMAGES,
        supportedQualities: ['auto', 'low', 'medium', 'high'],
        supportedModels: {
          image: models.filter(m => m.metadata?.type === 'image').map(m => m.name),
          video: models.filter(m => m.metadata?.type === 'video').map(m => m.name),
          edit: models.filter(m => m.metadata?.type === 'edit').map(m => m.name)
        },
        rateLimit: {
          general: IMAGEROUTER_CONSTANTS.RATE_LIMITS.GENERAL,
          imageGeneration: IMAGEROUTER_CONSTANTS.RATE_LIMITS.IMAGE_GENERATION
        }
      };

      await cacheManager.set(cacheKey, capabilities, CACHE_TTL.MEDIUM);
      return capabilities;

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Failed to get ImageRouter capabilities:', error);
      throw error;
    }
  }

  private availableModels: ModelInfo[] = [];
  private nativeModels: ImageRouterModel[] = [];

  getAvailableModels(): ModelInfo[] { return [...this.availableModels]; }

  async loadNativeModels(): Promise<ImageRouterModel[]> {
    if (!this.nativeModels.length) await this.loadImageRouterModels();
    return [...this.nativeModels];
  }

  /**
   * Native ImageRouter Models Loading - Uses ImageRouter's /models endpoint directly
   */
  async loadImageRouterModels(): Promise<ModelInfo[]> {
    const cacheKey = 'ai:imagerouter:models:available';

    try {
      // Check cache first
      const cachedModels = await cacheManager.get<ModelInfo[]>(cacheKey);
      if (cachedModels && this.config.caching.enabled && this.nativeModels.length) {
        this.availableModels = cachedModels;
        return cachedModels;
      }

      // Try to fetch models from ImageRouter API
      const response = await this.makeRequest<ImageRouterModelsResponse>('/v1/models', 'GET');

      // Validate response structure
      if (!response || !response.data || !Array.isArray(response.data)) {
        console.debug('ImageRouter models endpoint returned empty or invalid response');
        return [];
      }

      this.nativeModels = response.data;
      // Transform to ModelInfo with ImageRouter-specific data
      const models: ModelInfo[] = await Promise.all(
        response.data.map(async (model) => {
        const performance = await this.getModelPerformance(model.id);

        return {
          name: model.id,
          provider: 'imagerouter',
          displayName: model.name || this.formatModelDisplayName(model.id),
          description: model.description || `${model.name || model.id} model via ImageRouter`,
          maxTokens: 0, // Not applicable for media generation
          costPer1KTokens: this.extractPricingFromModel(model),
          averageLatency: performance?.averageLatency || 0,
          qualityScore: performance?.qualityScore || 0.8,
          tier: this.calculateTierFromModel(model),
          features: this.extractFeaturesFromModel(model),
          metadata: {
            type: model.type,
            features: model.features,
            limits: model.limits,
            pricing: model.pricing,
            performanceSamples: performance?.sampleSize || 0,
            lastPerformanceUpdate: performance?.lastUpdated || null
          }
        };
      })
      );

      if (this.config.caching.enabled) {
        await cacheManager.set(cacheKey, models, this.config.caching.ttl);
      }

      console.log(`✅ Loaded ${models.length} ImageRouter models`);
      this.availableModels = models;
      return models;

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      // Don't throw error, just log and return empty array
      // ImageRouter is optional and shouldn't break the application
      console.debug('ImageRouter models could not be loaded (service may be unavailable):', error.message);
      return [];
    }
  }

  /**
   * Generate media (image, video, or edit) based on request type
   */
  async generateMedia(request: UnifiedMediaGenerationRequest): Promise<UnifiedMediaGenerationResponse> {
    const startTime = Date.now();
    const organizationId = request.metadata?.organizationId;

    try {
      // Note: CSRF validation is handled at the API route level (/api/v1/ai/media/route.ts)
      // not here in the adapter. The ImageRouter API headers are set in makeRequest() method.

      // Usage tracking
      if (organizationId) {
        await UsageTrackingService.enforceUsageLimit(organizationId, UsageType.AI_QUERY, 1);
      }

      // Route to appropriate generation method
      let response: UnifiedMediaGenerationResponse;

      if (isImageGenerationRequest(request)) {
        response = await this.generateImage(request);
      } else if (isVideoGenerationRequest(request)) {
        response = await this.generateVideo(request);
      } else if (isImageEditRequest(request)) {
        response = await this.editImage(request);
      } else {
        throw new ValidationError('Invalid media generation request type');
      }

      const latency = Date.now() - startTime;

      // Track usage after successful request
      if (organizationId) {
        await UsageTrackingService.trackUsage({
          organizationId,
          usageType: UsageType.AI_QUERY,
          quantity: 1,
          resourceId: response.metadata.requestId || 'unknown',
          resourceType: 'media_generation',
          metadata: {
            provider: 'imagerouter',
            type: request.type,
            model: response.model,
            cost: response.usage.cost || 0,
            latency: latency
          }
        });
      }

      // Update metrics
      this.updateMetrics(request.model || 'default', latency, true, response.usage.cost || 0);

      return response;

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      const latency = Date.now() - startTime;
      this.updateMetrics(request.model || 'default', latency, false, 0, (error as Error).message);

      // Use comprehensive error handling
      const { errorInfo, recovery } = await this.errorHandler.handleError(error as Error, {
        operation: 'generateMedia',
        organizationId,
        requestId: `ir_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        model: request.model,
        mediaType: request.type,
        prompt: request.prompt?.substring(0, 100),
        attemptNumber: 1
      });

      // If recovery was attempted, log it
      if (recovery) {
        console.log(`Recovery attempted for ImageRouter error: ${recovery.message}`);
      }

      throw new Error(errorInfo.userMessage);
    }
  }

  /**
   * Generate image using ImageRouter API
   */
  private async generateImage(request: UnifiedMediaGenerationRequest): Promise<UnifiedMediaGenerationResponse> {
    const imageReq = request as ImageGenerationRequest;
    const model = imageReq.model || this.config.defaultModels.image;

    const imageRequest: ImageGenerationRequest = {
      prompt: imageReq.prompt,
      model: model,
      quality: imageReq.quality || this.config.defaultQuality,
      response_format: imageReq.responseFormat || this.config.defaultResponseFormat,
      n: imageReq.count || 1
    };

    console.log('🎨 ImageRouter image generation request:', {
      model: imageRequest.model,
      quality: imageRequest.quality,
      response_format: imageRequest.response_format,
      count: imageRequest.n
    });

    const response = await this.makeRequest<ImageGenerationResponse>(
      IMAGEROUTER_CONSTANTS.ENDPOINTS.IMAGE_GENERATION,
      'POST',
      imageRequest
    );

    return this.transformToUnifiedResponse(response, 'image', model);
  }

  /**
   * Generate video using ImageRouter API
   */
  private async generateVideo(request: UnifiedMediaGenerationRequest): Promise<UnifiedMediaGenerationResponse> {
    const videoReq = request as VideoGenerationRequest;
    const model = videoReq.model || this.config.defaultModels.video;

    const videoRequest: VideoGenerationRequest = {
      prompt: videoReq.prompt,
      model: model
    };

    console.log('🎬 ImageRouter video generation request:', {
      model: videoRequest.model,
      prompt: videoRequest.prompt.substring(0, 100) + '...'
    });

    const response = await this.makeRequest<VideoGenerationResponse>(
      IMAGEROUTER_CONSTANTS.ENDPOINTS.VIDEO_GENERATION,
      'POST',
      videoRequest
    );

    return this.transformToUnifiedResponse(response, 'video', model);
  }

  /**
   * Edit image using ImageRouter API
   */
  private async editImage(request: UnifiedMediaGenerationRequest): Promise<UnifiedMediaGenerationResponse> {
    const editReq = request as ImageEditRequest;
    const model = editReq.model || this.getDefaultEditModel();

    // Convert images to FormData format
    const formData = new FormData();
    formData.append('prompt', editReq.prompt);
    formData.append('model', model);

    if (editReq.quality) {
      formData.append('quality', editReq.quality);
    }

    if (editReq.responseFormat) {
      formData.append('response_format', editReq.responseFormat);
    }

    // Add image files
    for (const [index, image] of editReq.images.entries()) {
      let imageBlob: Blob;

      if (image.data) {
        if (Buffer.isBuffer(image.data)) {
          imageBlob = new Blob([image.data], { type: image.mimeType || 'image/jpeg' });
        } else if (typeof image.data === 'string') {
          // Handle base64 data
          const buffer = Buffer.from(image.data, 'base64');
          imageBlob = new Blob([buffer], { type: image.mimeType || 'image/jpeg' });
        } else {
          throw new ValidationError('Invalid image data format');
        }
      } else if (image.path) {
        // Handle file path
        const fs = require('fs');
        const imageBuffer = await fs.promises.readFile(image.path);
        imageBlob = new Blob([imageBuffer], { type: image.mimeType || 'image/jpeg' });
      } else {
        throw new ValidationError('Image must have either data or path');
      }

      formData.append('image[]', imageBlob, `image_${index}.jpg`);
    }

    // Add mask files if provided
    if (editReq.masks) {
      for (const [index, mask] of editReq.masks.entries()) {
        let maskBlob: Blob;

        if (mask.data) {
          if (Buffer.isBuffer(mask.data)) {
            maskBlob = new Blob([mask.data], { type: mask.mimeType || 'image/jpeg' });
          } else if (typeof mask.data === 'string') {
            const buffer = Buffer.from(mask.data, 'base64');
            maskBlob = new Blob([buffer], { type: mask.mimeType || 'image/jpeg' });
          } else {
            throw new ValidationError('Invalid mask data format');
          }
        } else if (mask.path) {
          const fs = require('fs');
          const maskBuffer = await fs.promises.readFile(mask.path);
          maskBlob = new Blob([maskBuffer], { type: mask.mimeType || 'image/jpeg' });
        } else {
          throw new ValidationError('Mask must have either data or path');
        }

        formData.append('mask[]', maskBlob, `mask_${index}.jpg`);
      }
    }

    console.log('✏️ ImageRouter image edit request:', {
      model: model,
      imageCount: editReq.images.length,
      maskCount: editReq.masks?.length || 0,
      quality: editReq.quality
    });

    const response = await this.makeRequestFormData<ImageEditResponse>(
      IMAGEROUTER_CONSTANTS.ENDPOINTS.IMAGE_EDIT,
      formData
    );

    return this.transformToUnifiedResponse(response, 'image', model);
  }

  /**
   * Transform ImageRouter response to unified format
   */
  private transformToUnifiedResponse(
    response: ImageGenerationResponse | VideoGenerationResponse | ImageEditResponse,
    type: 'image' | 'video',
    model: string
  ): UnifiedMediaGenerationResponse {
    // Validate response structure
    if (!response || !response.data || !Array.isArray(response.data)) {
      console.warn('🚨 Invalid response format from ImageRouter generation endpoint:', response);
      return {
        results: [],
        model,
        provider: 'imagerouter',
        usage: { totalTokens: 0 }
      };
    }

    return {
      results: response.data.map(item => ({
        url: item.url,
        data: item.b64_json,
        type: type,
        mimeType: type === 'video' ? 'video/mp4' : 'image/jpeg'
      })),
      model: response.model,
      usage: {
        totalTokens: response.usage?.total_tokens,
        cost: this.estimateCostFromResponse(response, model, type)
      },
      metadata: {
        provider: 'imagerouter',
        requestId: `ir_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        generatedAt: new Date().toISOString(),
        processingTime: 0, // Would need to track this separately
        actualModel: response.model,
        revisedPrompt: response.data[0]?.revised_prompt
      }
    };
  }

  /**
   * Estimate cost from ImageRouter response
   */
  private estimateCostFromResponse(
    response: ImageGenerationResponse | VideoGenerationResponse | ImageEditResponse,
    model: string,
    type: 'image' | 'video'
  ): number {
    // This would need real pricing data from ImageRouter
    // For now, return a placeholder cost
    const baseCost = type === 'video' ? 0.10 : 0.02; // Video is more expensive
    return baseCost * response.data.length;
  }

  /**
   * Estimate cost for media generation request
   */
  async estimateMediaCost(request: UnifiedMediaGenerationRequest): Promise<MediaCostEstimate> {
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

      // Calculate base cost based on type and model
      const model = request.model || this.getDefaultModel(request.type);
      const baseCost = this.getBaseCostForModel(model, request.type);

      // Apply quality multiplier
      let qualityMultiplier = 1.0;
      if ('quality' in request && request.quality) {
        qualityMultiplier = this.getQualityMultiplier(request.quality);
      }

      // Apply count multiplier
      let countMultiplier = 1;
      if ('count' in request && request.count) {
        countMultiplier = request.count;
      } else if ('images' in request && request.images) {
        countMultiplier = request.images.length;
      }

      const totalCost = baseCost * qualityMultiplier * countMultiplier;

      return {
        estimatedCost: totalCost,
        breakdown: {
          baseCost,
          qualityMultiplier,
          countMultiplier,
          totalCost
        },
        metadata: {
          provider: 'imagerouter',
          model,
          type: request.type,
          quality: 'quality' in request ? request.quality || 'auto' : 'auto',
          count: countMultiplier,
          usageCheck: organizationId ? await UsageTrackingService.checkUsageLimitWithDetails(organizationId, UsageType.AI_QUERY, 1) : undefined
        }
      };

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Media cost estimation error:', error);
      throw error;
    }
  }

  // Helper methods

  private getDefaultModel(type: 'image' | 'video' | 'edit'): string {
    switch (type) {
      case 'image':
        return this.config.defaultModels.image;
      case 'video':
        return this.config.defaultModels.video;
      case 'edit':
        return this.getDefaultEditModel();
      default:
        return this.config.defaultModels.image;
    }
  }

  private getDefaultEditModel(): string {
    // ImageRouter doesn't have a specific default edit model, so use a known edit model
    return 'openai/gpt-image-1';
  }

  private getBaseCostForModel(model: string, type: 'image' | 'video' | 'edit'): number {
    // Placeholder costs - these would come from real ImageRouter pricing
    switch (type) {
      case 'image':
        return 0.02;
      case 'video':
        return 0.10;
      case 'edit':
        return 0.03;
      default:
        return 0.02;
    }
  }

  private getQualityMultiplier(quality: 'auto' | 'low' | 'medium' | 'high'): number {
    switch (quality) {
      case 'low':
        return 0.7;
      case 'medium':
        return 1.0;
      case 'high':
        return 1.5;
      case 'auto':
      default:
        return 1.0;
    }
  }

  private async getModelPerformance(modelId: string): Promise<ImageRouterModelPerformance | null> {
    const cacheKey = `ai:imagerouter:performance:${modelId}`;

    try {
      const cachedPerformance = await cacheManager.get<ImageRouterModelPerformance>(cacheKey);
      if (cachedPerformance) {
        return cachedPerformance;
      }

      // For now, return placeholder performance data
      // In a real implementation, this would fetch actual performance metrics
      const performance: ImageRouterModelPerformance = {
        modelId,
        averageLatency: 15000, // 15 seconds average for media generation
        successRate: 0.95,
        averageCost: 0.02,
        qualityScore: 0.8,
        sampleSize: 10,
        lastUpdated: new Date().toISOString(),
        features: [],
        tier: 'balanced'
      };

      await cacheManager.set(cacheKey, performance, this.PERFORMANCE_CACHE_DURATION);
      return performance;

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn(`Failed to get ImageRouter performance for ${modelId}:`, error);
      return null;
    }
  }

  private extractPricingFromModel(model: ImageRouterModel): { prompt: number; completion: number } {
    // ImageRouter pricing is different from text models
    // Return placeholder pricing for now
    return {
      prompt: 0.02, // Base cost per image/video
      completion: 0 // Not applicable for media generation
    };
  }

  private calculateTierFromModel(model: ImageRouterModel): 'fast' | 'balanced' | 'powerful' {
    // Classify based on model features or naming conventions
    if (model.id.includes('test') || model.id.includes('fast')) {
      return 'fast';
    } else if (model.id.includes('pro') || model.id.includes('high')) {
      return 'powerful';
    } else {
      return 'balanced';
    }
  }

  private extractFeaturesFromModel(model: ImageRouterModel): string[] {
    const features = ['media-generation'];

    if (model.type === 'image') {
      features.push('image-generation');
    } else if (model.type === 'video') {
      features.push('video-generation');
    } else if (model.type === 'edit') {
      features.push('image-editing');
    }

    if (model.features) {
      features.push(...model.features);
    }

    return features;
  }

  private formatModelDisplayName(modelId: string): string {
    return modelId.replace('/', ' ').replace('-', ' ').replace(/_/g, ' ') + ' (ImageRouter)';
  }

  private updateMetrics(model: string, latency: number, success: boolean, cost: number, error?: string): void {
    this.metrics.requestCount++;
    this.metrics.lastRequestAt = new Date().toISOString();

    if (success) {
      this.metrics.successCount++;
      this.metrics.totalCost += cost;

      // Update rolling average latency
      const totalLatency = this.metrics.averageLatency * (this.metrics.successCount - 1) + latency;
      this.metrics.averageLatency = totalLatency / this.metrics.successCount;
    } else {
      this.metrics.errorCount++;
    }

    // Update model-specific metrics
    if (!this.metrics.modelUsage[model]) {
      this.metrics.modelUsage[model] = {
        count: 0,
        successRate: 0,
        averageLatency: 0,
        averageCost: 0
      };
    }

    const modelMetrics = this.metrics.modelUsage[model];
    modelMetrics.count++;

    if (success) {
      const successCount = Math.round(modelMetrics.count * modelMetrics.successRate) + 1;
      modelMetrics.successRate = successCount / modelMetrics.count;

      const totalLatency = modelMetrics.averageLatency * (successCount - 1) + latency;
      modelMetrics.averageLatency = totalLatency / successCount;

      const totalCost = modelMetrics.averageCost * (successCount - 1) + cost;
      modelMetrics.averageCost = totalCost / successCount;
    } else {
      const successCount = Math.round(modelMetrics.count * modelMetrics.successRate);
      modelMetrics.successRate = successCount / modelMetrics.count;
    }
  }

  private async testConnection(): Promise<void> {
    try {
      console.log('🔍 Testing ImageRouter connection to:', `${this.baseUrl}/v1/models`);
      await this.makeRequest<any>('/v1/models', 'GET');
      console.log('✅ ImageRouter connection test successful');
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('❌ ImageRouter connection test failed:', error);
      throw new ProviderUnavailableError(`ImageRouter connection test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadAndCacheModels(): Promise<void> {
    try {
      await this.loadImageRouterModels();
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('Failed to load models during initialization:', error);
    }
  }

  private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST', body?: any): Promise<T> {
    return this.circuitBreakerManager.executeWithCircuitBreaker(
      'imagerouter-api',
      async () => {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Document-Chat-System/1.0',
            'X-CSRF-Token': this.config.apiKey, // Add CSRF token for ImageRouter API
            'X-API-Key': this.config.apiKey // Some APIs use this instead of Authorization
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.config.timeout)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new NetworkError(`ImageRouter API error: ${response.status} - ${errorText}`);
        }

        return response.json();
      }
    );
  }

  private async makeRequestFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.circuitBreakerManager.executeWithCircuitBreaker(
      'imagerouter-api',
      async () => {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'User-Agent': 'Document-Chat-System/1.0',
            'X-CSRF-Token': this.config.apiKey, // Add CSRF token for ImageRouter API
            'X-API-Key': this.config.apiKey // Some APIs use this instead of Authorization
            // Don't set Content-Type for FormData - browser will set it with boundary
          },
          body: formData,
          signal: AbortSignal.timeout(this.config.timeout)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new NetworkError(`ImageRouter API error: ${response.status} - ${errorText}`);
        }

        return response.json();
      }
    );
  }

  protected handleError(error: any, operation: string): Error {
    console.error(`ImageRouterAdapter ${operation} error:`, error);

    if (error.message?.includes('401')) {
      return new AuthenticationError('ImageRouter API key invalid', 'imagerouter');
    }

    if (error.message?.includes('429')) {
      return new RateLimitError('ImageRouter rate limit exceeded', {
        provider: 'imagerouter'
      });
    }

    if (error.message?.includes('400')) {
      return new ValidationError('ImageRouter request validation failed', {
        provider: 'imagerouter',
        details: error.message
      });
    }

    if (error.message?.includes('402') || error.message?.includes('quota')) {
      return new QuotaExceededError('ImageRouter quota exceeded', 'imagerouter');
    }

    return new ProviderUnavailableError(`ImageRouter ${operation} failed: ${error.message}`);
  }

  // Public methods for integration

  /**
   * Get current metrics
   */
  getMetrics(): ImageRouterMetrics {
    return { ...this.metrics };
  }

  /**
   * Get circuit breaker metrics
   */
  getCircuitBreakerMetrics() {
    return this.circuitBreakerManager.getProviderMetrics('imagerouter-api');
  }

  /**
   * Get error patterns for analysis
   */
  getErrorPatterns() {
    return this.errorHandler.getErrorPatterns();
  }

  /**
   * Clear old error patterns
   */
  clearOldErrorPatterns(maxAge?: number) {
    this.errorHandler.clearOldPatterns(maxAge);
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      averageLatency: 0,
      totalCost: 0,
      lastRequestAt: new Date().toISOString(),
      modelUsage: {}
    };
  }

  /**
   * Check if a model supports a specific feature
   */
  async modelSupportsFeature(modelId: string, feature: string): Promise<boolean> {
    const models = await this.loadImageRouterModels();
    const model = models.find(m => m.name === modelId);
    return model?.features?.includes(feature) || false;
  }

  /**
   * Get recommended models for a specific type
   */
  async getRecommendedModels(type: 'image' | 'video' | 'edit', tier: 'fast' | 'balanced' | 'powerful' = 'balanced'): Promise<ModelInfo[]> {
    const models = await this.loadImageRouterModels();
    return models.filter(m =>
      m.metadata?.type === type &&
      m.tier === tier
    ).sort((a, b) => b.qualityScore - a.qualityScore);
  }

  // Static utility methods

  /**
   * Validate media generation request
   */
  static validateMediaRequest(request: UnifiedMediaGenerationRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.prompt || request.prompt.trim().length === 0) {
      errors.push('Prompt is required and cannot be empty');
    }

    if (request.prompt && request.prompt.length > 4000) {
      errors.push('Prompt cannot exceed 4000 characters');
    }

    if ('count' in request && request.count && (request.count < 1 || request.count > 10)) {
      errors.push('Count must be between 1 and 10');
    }

    if ('images' in request && request.images) {
      if (request.images.length === 0) {
        errors.push('At least one image is required for editing');
      }

      if (request.images.length > IMAGEROUTER_CONSTANTS.MAX_IMAGES) {
        errors.push(`Maximum ${IMAGEROUTER_CONSTANTS.MAX_IMAGES} images allowed`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Get supported file types
   */
  static getSupportedFileTypes(): { input: string[]; output: string[] } {
    return {
      input: [...IMAGEROUTER_CONSTANTS.SUPPORTED_FORMATS.INPUT],
      output: [...IMAGEROUTER_CONSTANTS.SUPPORTED_FORMATS.OUTPUT]
    };
  }

  /**
   * Check if file type is supported
   */
  static isFileTypeSupported(mimeType: string, operation: 'input' | 'output'): boolean {
    const supportedTypes = operation === 'input'
      ? [...IMAGEROUTER_CONSTANTS.SUPPORTED_FORMATS.INPUT]
      : [...IMAGEROUTER_CONSTANTS.SUPPORTED_FORMATS.OUTPUT];

    return supportedTypes.includes(mimeType as any);
  }
}
