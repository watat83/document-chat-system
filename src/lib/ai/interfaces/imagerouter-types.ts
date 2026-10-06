/**
 * ImageRouter Types and Interfaces
 *
 * Type definitions for ImageRouter.io API integration following OpenRouter adapter patterns.
 * Supports image generation, video generation, and image editing capabilities.
 */

// Base ImageRouter Configuration
export interface ImageRouterConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  rateLimit: {
    requestsPerMinute: number;
  };
  costOptimization: 'aggressive' | 'balanced' | 'conservative';
  defaultModels: {
    image: string;
    video: string;
  };
  defaultQuality: 'auto' | 'low' | 'medium' | 'high';
  defaultResponseFormat: 'url' | 'b64_json';
  caching: {
    enabled: boolean;
    ttl: number;
  };
}

// Image Generation Request/Response Types
export interface ImageGenerationRequest {
  prompt: string;
  model: string;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  response_format?: 'url' | 'b64_json';
  n?: number; // Number of images (default: 1)
  size?: string; // Image size if supported
}

export interface ImageGenerationResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  usage?: {
    total_tokens?: number;
  };
  model?: string;
  cost?: number;
  latency?: number;
}

// Video Generation Request/Response Types
export interface VideoGenerationRequest {
  prompt: string;
  model: string;
  // Note: ImageRouter currently defaults these parameters
  // aspectRatio?: '16:9' | '9:16' | '1:1';
  // personGeneration?: 'allow_adult' | 'allow_minor' | 'disallow';
  // numberOfVideos?: number;
  // durationSeconds?: number;
}

export interface VideoGenerationResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  usage?: {
    total_tokens?: number;
  };
  model?: string;
  cost?: number;
  latency?: number;
}

// Image Editing Request/Response Types
export interface ImageEditRequest {
  prompt: string;
  model: string;
  image: File[]; // Array of image files (up to 16)
  mask?: File[]; // Optional mask files for some models
  quality?: 'auto' | 'low' | 'medium' | 'high';
  response_format?: 'url' | 'b64_json';
}

export interface ImageEditResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  usage?: {
    total_tokens?: number;
  };
  model?: string;
  cost?: number;
  latency?: number;
}

// Model Information Types
export interface ImageRouterModel {
  id: string;
  name?: string;
  description?: string;
  type: 'image' | 'video' | 'edit';
  architecture?: { input_modalities: string[]; output_modalities: string[] };
  supported_parameters?: string[];
  parameters?: { size?: string[]; seconds?: (string | number)[] };
  features?: string[]; // e.g., ['quality', 'edit']
  pricing?: {
    min: number;
    average: number;
    max: number;
  };
  limits?: {
    max_images?: number;
    max_duration?: number;
    max_file_size?: number;
  };
}

export interface ImageRouterModelsResponse {
  data: ImageRouterModel[];
}

export interface MediaRequestMetadata {
  organizationId?: string;
  userId?: string;
  sessionId?: string;
  costLimit?: number;
  httpRequest?: import('next/server').NextRequest;
  priority?: 'speed' | 'quality' | 'cost';
  requestId?: string;
  isWarmingRequest?: boolean;
}

// Unified Request Types for Integration
export interface UnifiedImageGenerationRequest {
  prompt: string;
  model?: string;
  type: 'image';
  quality?: 'auto' | 'low' | 'medium' | 'high';
  responseFormat?: 'url' | 'b64_json';
  count?: number;
  size?: string;
  metadata?: MediaRequestMetadata;
}

export interface UnifiedVideoGenerationRequest {
  prompt: string;
  model?: string;
  type: 'video';
  metadata?: MediaRequestMetadata & {
    // Future parameters when ImageRouter supports them
    aspectRatio?: '16:9' | '9:16' | '1:1';
    duration?: number;
  };
}

export interface UnifiedImageEditRequest {
  prompt: string;
  model?: string;
  type: 'edit';
  images: Array<{
    data?: Buffer | string;
    path?: string;
    mimeType?: string;
  }>;
  masks?: Array<{
    data?: Buffer | string;
    path?: string;
    mimeType?: string;
  }>;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  responseFormat?: 'url' | 'b64_json';
  metadata?: MediaRequestMetadata;
}

export type UnifiedMediaGenerationRequest =
  | UnifiedImageGenerationRequest
  | UnifiedVideoGenerationRequest
  | UnifiedImageEditRequest;

export interface UnifiedMediaGenerationResponse {
  results: Array<{
    url?: string;
    data?: string; // base64 if requested
    type: 'image' | 'video';
    mimeType?: string;
    size?: number;
  }>;
  model: string;
  usage: {
    totalTokens?: number;
    cost?: number;
  };
  metadata: {
    provider: 'imagerouter';
    requestId?: string;
    generatedAt: string;
    processingTime?: number;
    actualModel?: string;
    quality?: string;
    revisedPrompt?: string;
  };
}

// Cost Estimation Types
export interface MediaCostEstimate {
  estimatedCost: number;
  breakdown: {
    baseCost: number;
    qualityMultiplier?: number;
    countMultiplier?: number;
    totalCost: number;
  };
  metadata: {
    provider: 'imagerouter';
    model: string;
    type: 'image' | 'video' | 'edit';
    quality: string;
    count: number;
    usageCheck?: any;
  };
}

// Performance Monitoring Types
export interface ImageRouterMetrics {
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageLatency: number;
  totalCost: number;
  lastRequestAt: string;
  modelUsage: Record<string, {
    count: number;
    successRate: number;
    averageLatency: number;
    averageCost: number;
  }>;
}

// Error Types specific to ImageRouter
export interface ImageRouterError extends Error {
  provider: 'imagerouter';
  code?: string;
  statusCode?: number;
  retryable?: boolean;
  retryAfter?: number;
  details?: {
    model?: string;
    type?: 'image' | 'video' | 'edit';
    prompt?: string;
    originalError?: any;
  };
}

// Model Performance Data
export interface ImageRouterModelPerformance {
  modelId: string;
  averageLatency: number;
  successRate: number;
  averageCost: number;
  qualityScore: number;
  sampleSize: number;
  lastUpdated: string;
  features: string[];
  tier: 'fast' | 'balanced' | 'powerful';
}

// Cache Types
export interface ImageRouterCacheEntry {
  models?: ImageRouterModel[];
  performance?: Record<string, ImageRouterModelPerformance>;
  pricing?: Record<string, any>;
  lastUpdated: string;
  ttl: number;
}

// Feature Flags and Capabilities
export interface ImageRouterCapabilities {
  imageGeneration: boolean;
  videoGeneration: boolean;
  imageEditing: boolean;
  supportedFormats: {
    input: string[];
    output: string[];
  };
  maxFileSize: number;
  maxImages: number;
  supportedQualities: string[];
  supportedModels: {
    image: string[];
    video: string[];
    edit: string[];
  };
  rateLimit: {
    general: number; // requests per second
    imageGeneration: number; // requests per minute
  };
}

// Request Validation Types
export interface MediaGenerationValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedCost?: number;
  estimatedLatency?: number;
}

// Utility Types for Model Classification
export type ImageRouterModelType = 'image' | 'video' | 'edit';
export type ImageRouterQuality = 'auto' | 'low' | 'medium' | 'high';
export type ImageRouterResponseFormat = 'url' | 'b64_json';
export type ImageRouterCostOptimization = 'aggressive' | 'balanced' | 'conservative';

// Type Guards
export const isImageGenerationRequest = (req: UnifiedMediaGenerationRequest): req is UnifiedImageGenerationRequest => {
  return req.type === 'image';
};

export const isVideoGenerationRequest = (req: UnifiedMediaGenerationRequest): req is UnifiedVideoGenerationRequest => {
  return req.type === 'video';
};

export const isImageEditRequest = (req: UnifiedMediaGenerationRequest): req is UnifiedImageEditRequest => {
  return req.type === 'edit';
};

// Helper Functions for Model Selection
export interface ModelSelectionCriteria {
  type: ImageRouterModelType;
  costOptimization: ImageRouterCostOptimization;
  quality: ImageRouterQuality;
  features?: string[];
  maxCost?: number;
  maxLatency?: number;
}

// Constants
export const IMAGEROUTER_CONSTANTS = {
  BASE_URL: 'https://api.imagerouter.io',
  ENDPOINTS: {
    MODELS: '/v1/models',
    IMAGE_GENERATION: '/v1/openai/images/generations',
    VIDEO_GENERATION: '/v1/openai/videos/generations',
    IMAGE_EDIT: '/v1/openai/images/edits',
  },
  RATE_LIMITS: {
    GENERAL: 100, // requests per second
    IMAGE_GENERATION: 30, // requests per minute
  },
  DEFAULT_MODELS: {
    IMAGE: 'test/test',
    VIDEO: 'ir/test-video',
  },
  SUPPORTED_FORMATS: {
    INPUT: ['image/jpeg', 'image/png', 'image/webp'],
    OUTPUT: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
  },
  MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
  MAX_IMAGES: 16,
} as const;
