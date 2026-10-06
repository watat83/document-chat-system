/**
 * Enhanced AI Service Interfaces based on service-interfaces.md specification
 * Provides comprehensive contracts for provider-agnostic AI services
 */

export type ModelTier = 'fast' | 'balanced' | 'powerful';
export type EmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';

// Enhanced Message interface with tool support
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

// Tool interfaces for function calling
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export type ToolChoice = 'none' | 'auto' | { type: 'function'; function: { name: string } };

// Response format types
export interface ResponseFormat {
  type: 'text' | 'json_object';
}

// Optimization hints for provider selection
export interface OptimizationHints {
  taskType: import('./types').TaskType;
  complexity: 'low' | 'medium' | 'high';
  latencySensitive: boolean;
  qualityRequirement: 'standard' | 'high' | 'premium';
  preferredProviders?: string[];
  excludedProviders?: string[];
}

// Enhanced Completion Request
export interface CompletionRequest {
  // Required fields
  messages: Message[];

  // Provider selection
  provider?: string;
  model?: ModelTier | string;

  // Generation parameters
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];

  // Advanced features
  responseFormat?: ResponseFormat;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  seed?: number;

  // Context and metadata
  user?: string;
  metadata?: Record<string, any>;

  // Optimization hints
  hints?: OptimizationHints;
}

// Enhanced Completion Response
export interface CompletionResponse {
  // Core response
  content: string;
  role: 'assistant';

  // Tool calls if applicable
  toolCalls?: ToolCall[];

  // Usage information
  usage: TokenUsage;

  // Provider information
  provider: string;
  model: string;

  // Performance metrics
  latency: number;
  cost: number;

  // Response metadata
  id: string;
  created: Date;
  finishReason?: string;
  metadata?: Record<string, any>;
}

// Token usage interface
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Enhanced Embedding Request
export interface EmbeddingRequest {
  // Content to embed
  text: string;

  // Model selection
  provider?: string;
  model?: EmbeddingModel | string;

  // Embedding parameters
  dimensions?: number;
  normalize?: boolean;

  // Metadata
  user?: string;
  metadata?: Record<string, any>;
}

// Batch Embedding Request
export interface BatchEmbeddingRequest {
  texts: string[];
  provider?: string;
  model?: EmbeddingModel | string;
  dimensions?: number;
  normalize?: boolean;
  user?: string;
  metadata?: Record<string, any>;
}

// Enhanced Embedding Response
export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  provider: string;
  dimensions: number;
  usage: EmbeddingUsage;
  cost: number;
  metadata?: Record<string, any>;
}

// Batch Embedding Response
export interface BatchEmbeddingResponse {
  embeddings: number[][];
  model: string;
  provider: string;
  dimensions: number;
  usage: EmbeddingUsage;
  cost: number;
  metadata?: Record<string, any>;
}

// Embedding usage interface
export interface EmbeddingUsage {
  totalTokens: number;
}

// Stream interfaces
export interface StreamRequest extends CompletionRequest {
  stream: true;
}

export interface StreamChunk {
  content: string;
  role?: 'assistant';
  toolCalls?: ToolCall[];
  finishReason?: string;
  metadata?: Record<string, any>;
}

// Cost estimation interfaces
export interface EstimationRequest {
  messages?: Message[];
  text?: string;
  model?: string;
  provider?: string;
  operation: 'completion' | 'embedding';
}

export interface CostEstimate {
  estimatedCost: number;
  estimatedTokens: number;
  breakdown: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    promptCost?: number;
    completionCost?: number;
    embeddingCost?: number;
  };
  provider: string;
  model: string;
}

// Health and metrics interfaces
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  providers: Record<string, ProviderHealth>;
  timestamp: Date;
  uptime: number;
}

export interface ProviderHealth {
  status: 'available' | 'degraded' | 'unavailable';
  latency: number;
  errorRate: number;
  lastCheck: Date;
}

export interface ServiceMetrics {
  // Performance metrics
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;

  // Throughput metrics
  requestsPerSecond: number;
  tokensPerSecond: number;

  // Cost metrics
  costPerRequest: number;
  costPerToken: number;
  totalCost: number;

  // Reliability metrics
  successRate: number;
  errorRate: number;
  availability: number;

  // Provider breakdown
  providerMetrics: Map<string, ProviderMetrics>;

  // Time range
  startTime: Date;
  endTime: Date;
}

export interface ProviderMetrics {
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageLatency: number;
  totalCost: number;
  totalTokens: number;
}

// Core AI Service Interface
export interface IAIService {
  // Text generation
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: StreamRequest): AsyncIterator<StreamChunk>;

  // Embeddings
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  batchEmbed(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse>;

  // Provider management
  getProviders(): Provider[];
  getProvider(name: string): Provider | null;
  setPreferredProvider(provider: string): void;

  // Cost estimation
  estimateCost(request: EstimationRequest): Promise<CostEstimate>;

  // Health and status
  healthCheck(): Promise<HealthStatus>;
  getMetrics(): Promise<ServiceMetrics>;
}

// Provider interface
export interface Provider {
  // Identification
  name: string;
  displayName: string;
  version: string;

  // Capabilities
  capabilities: ProviderCapabilities;

  // Models
  models: ModelCatalog;

  // Status
  status: ProviderStatus;

  // Operations
  initialize(config: ProviderConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Request handling
  complete(request: ProviderRequest): Promise<ProviderResponse>;
  stream(request: ProviderRequest): AsyncIterator<ProviderStreamChunk>;
  embed(request: ProviderEmbeddingRequest): Promise<ProviderEmbeddingResponse>;
}

// Provider-specific interfaces
export interface ProviderCapabilities {
  // Feature support
  completion: boolean;
  streaming: boolean;
  embeddings: boolean;
  functionCalling: boolean;
  visionSupport: boolean;
  jsonMode: boolean;

  // Limits
  maxTokens: number;
  maxContextLength: number;
  embeddingDimensions: number[];

  // Advanced features
  fineTuning: boolean;
  customModels: boolean;
  batching: boolean;
}

export interface ModelCatalog {
  completion: ModelInfo[];
  embedding: ModelInfo[];

  getModel(id: string): ModelInfo | null;
  getModelsByCapability(capability: string): ModelInfo[];
  getModelsByTier(tier: ModelTier): ModelInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  type: 'completion' | 'embedding';
  tier: ModelTier;
  maxTokens: number;
  contextLength: number;
  pricing: {
    promptTokens: number; // per 1K tokens
    completionTokens: number; // per 1K tokens
  };
  capabilities: string[];
}

export interface ProviderStatus {
  online: boolean;
  healthy: boolean;
  lastCheck: Date;
  errorCount: number;
  circuitOpen: boolean;
}

export interface ProviderConfig {
  type: string;
  name: string;
  apiKey: string;
  endpoint?: string;
  options?: Record<string, any>;

  // Rate limiting
  rateLimit?: RateLimitConfig;

  // Cost controls
  maxCostPerRequest?: number;
  maxDailyCost?: number;

  // Model preferences
  modelMappings?: Record<ModelTier, string>;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrent: number;
}

// Provider request/response types
export interface ProviderRequest {
  messages: Message[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  responseFormat?: ResponseFormat;
  seed?: number;
  user?: string;
  metadata?: Record<string, any>;
}

export interface ProviderResponse {
  content: string;
  role: 'assistant';
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason?: string;
  metadata?: Record<string, any>;
}

export interface ProviderStreamChunk {
  content: string;
  role?: 'assistant';
  toolCalls?: ToolCall[];
  finishReason?: string;
  metadata?: Record<string, any>;
}

export interface ProviderEmbeddingRequest {
  text: string | string[];
  model: string;
  dimensions?: number;
  normalize?: boolean;
  user?: string;
  metadata?: Record<string, any>;
}

export interface ProviderEmbeddingResponse {
  embedding: number[] | number[][];
  model: string;
  dimensions: number;
  usage: EmbeddingUsage;
  metadata?: Record<string, any>;
}
