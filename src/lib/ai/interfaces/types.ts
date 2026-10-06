
import type { OptimizationHints } from './service-contracts';

export type Complexity = 'low' | 'medium' | 'high';
export type TaskType = 'simple_qa' | 'complex_analysis' | 'document_analysis' | 'content_generation' | 'embedding' | 'data_extraction' | 'translation' | 'summarization' | 'code_generation' | 'media_generation' | 'image_generation' | 'video_generation' | 'image_edit' | 'document_processing' | 'opportunity_matching' | 'classification' | 'completion';

export interface ImageAttachment {
  type: 'image';
  data?: string | Buffer; // Base64 string or Buffer
  path?: string; // File path for server-side processing
  mimeType?: string;
  detail?: 'low' | 'high' | 'auto';
  description?: string;
}

export interface FileAttachment {
  type: 'file' | 'pdf';
  data?: string | Buffer;
  path?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  metadata?: { engine?: 'native' | 'mistral-ocr' | 'pdf-text'; pageCount?: number; cost?: number; annotations?: unknown; [key: string]: unknown };
}

export type MessageAttachment = ImageAttachment | FileAttachment;

export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachment[];
  metadata?: Record<string, any>;
}

export interface UnifiedCompletionRequest {
  messages: UnifiedMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  systemPrompt?: string;
  signal?: AbortSignal;
  organizationId?: string;
  userId?: string;
  metadata?: { organizationId?: string; userId?: string; provider?: string; httpRequest?: import('next/server').NextRequest; [key: string]: any };
  hints?: Partial<OptimizationHints>;

  options?: {
    streaming?: boolean;
    plugins?: Array<{ id: string; pdf?: { engine?: 'native' | 'mistral-ocr' | 'pdf-text' } }>;
    jsonMode?: boolean;
    functionCalling?: boolean;
    seed?: number;
    webSearch?: {
      enabled?: boolean;
      max_results?: number;
      search_depth?: 'basic' | 'advanced';
    };
  };

  functions?: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;

  functionCall?: string | { name: string };
}

export interface URLCitation {
  type: 'url_citation';
  url_citation: {
    url: string;
    title?: string;
    content?: string;
    start_index: number;
    end_index: number;
  };
}

export interface Citation {
  url: string;
  title?: string;
  content?: string;
  start_index: number;
  end_index: number;
}

export interface UnifiedCompletionResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  citations?: Citation[];
  annotations?: URLCitation[];
  metadata: {
    provider: string;
    requestId?: string;
    finishReason?: string;
    functionCall?: any;
    citations?: Citation[];
    annotations?: URLCitation[];
    cost?: number;
    generationId?: string;
    [key: string]: any;
  };
}

export interface UnifiedEmbeddingRequest {
  text: string | string[];
  model: string;
  dimensions?: number;
  metadata?: Record<string, any>;
}

export interface UnifiedEmbeddingResponse {
  embedding: number[] | number[][];
  model: string;
  usage: {
    totalTokens: number;
  };
  metadata: {
    provider: string;
    dimensions: number;
    cost?: number;
  };
}

export interface UnifiedStreamRequest extends UnifiedCompletionRequest {
  onChunk?: (chunk: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export interface UnifiedStreamChunk {
  content: string;
  metadata: {
    provider: string;
    model: string;
    finishReason?: string;
    [key: string]: unknown;
  };
}

export interface ProviderCapabilities {
  maxTokens: number;
  supportsFunctionCalling: boolean;
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
  supportsVision?: boolean;
  supportsAudio?: boolean;
  embeddingDimensions?: number[];
  models: {
    completion: string[];
    embedding?: string[];
  };
}

export interface CostEstimate {
  estimatedCost: number;
  breakdown: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    promptCost?: number;
    completionCost?: number;
    imageCost?: number;
    pdfCost?: number;
    pricePerToken?: number;
  };
  metadata?: {
    realTimePricing?: boolean;
    pricingSource?: string;
    model?: string;
    hasImages?: boolean;
    hasPDFs?: boolean;
    provider?: string;
    [key: string]: any;
    usageCheck?: any;
  };
}

export interface TokenEstimate {
  prompt: number;
  completion: number;
  total: number;
}

export interface AIRequest {
  model: string;
  maxLatency?: number;
  maxCost?: number;
  features?: string[];
  messages?: UnifiedMessage[];
  text?: string;
  taskType: TaskType;
  complexity: Complexity;
  tools?: unknown[];
}

export interface ModelInfo {
  name: string;
  provider: string;
  displayName?: string;
  description?: string;
  maxTokens: number;
  costPer1KTokens: {
    prompt: number;
    completion: number;
  };
  averageLatency: number;
  qualityScore: number;
  tier?: 'fast' | 'balanced' | 'powerful';
  features?: string[];
  metadata?: Record<string, any>;
}

export interface ProviderError extends Error {
  provider: string;
  code?: string;
  retryable?: boolean;
  retryAfter?: number;
}

export class RateLimitError extends Error implements ProviderError {
  provider: string;
  retryAfter?: number;
  retryable = true;

  constructor(message: string, details: { provider: string; retryAfter?: number }) {
    super(message);
    this.name = 'RateLimitError';
    this.provider = details.provider;
    this.retryAfter = details.retryAfter;
  }
}

export class AuthenticationError extends Error implements ProviderError {
  provider: string;
  retryable = false;

  constructor(message: string, provider = 'unknown') {
    super(message);
    this.name = 'AuthenticationError';
    this.provider = provider;
  }
}

export class ValidationError extends Error implements ProviderError {
  provider: string;
  retryable = false;
  details?: any;

  constructor(message: string, details?: { provider?: string; details?: any }) {
    super(message);
    this.name = 'ValidationError';
    this.provider = details?.provider || 'unknown';
    this.details = details?.details;
  }
}

export class CircuitOpenError extends Error implements ProviderError {
  provider: string;
  retryable = true;

  constructor(message: string, provider = 'unknown') {
    super(message);
    this.name = 'CircuitOpenError';
    this.provider = provider;
  }
}

export class AllProvidersFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllProvidersFailedError';
  }
}

// Export the base adapter class
export { AIProviderAdapter } from './base-adapter';
