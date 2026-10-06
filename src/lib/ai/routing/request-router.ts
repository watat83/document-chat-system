import {
  AIRequest,
  TaskType,
  Complexity,
  CostEstimate,
  ModelInfo
} from '../interfaces/types';
import { AIProviderRegistry } from '../registry';
import { AIProviderAdapter } from '../interfaces';

export interface ProviderSelectionCriteria {
  taskType: TaskType;
  complexity: Complexity;
  estimatedTokens: number;
  requestedModel?: string;
  requiredFeatures: string[];
  maxLatency?: number;
  maxCost?: number;
  preferredProviders?: string[];
  excludedProviders?: string[];
  qualityRequirement?: 'standard' | 'high' | 'premium';
}

export interface ProviderEvaluation {
  name: string;
  adapter: AIProviderAdapter;
  score: number;
  estimatedCost: number;
  estimatedLatency: number;
  qualityScore: number;
  featureCompatibility: number;
  reasoningText: string[];
}

export interface RoutingDecision {
  selectedProvider: string;
  adapter: AIProviderAdapter;
  model: string;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number;
  reasoningText: string[];
  alternatives: Array<{
    provider: string;
    score: number;
    reason: string;
  }>;
}

export class AIRequestRouter {
  constructor(private registry: AIProviderRegistry) {}

  async route(request: AIRequest & { provider?: string }): Promise<RoutingDecision> {
    const criteria = this.buildSelectionCriteria(request);
    const evaluations = await this.evaluateProviders(criteria);

    if (evaluations.length === 0) {
      throw new Error('No suitable providers available for this request');
    }

    const selected = evaluations[0];
    const model = this.selectOptimalModel(selected.adapter, criteria, request.model);

    return {
      selectedProvider: selected.name,
      adapter: selected.adapter,
      model,
      estimatedCost: selected.estimatedCost,
      estimatedLatency: selected.estimatedLatency,
      confidence: this.calculateConfidence(selected, evaluations),
      reasoningText: selected.reasoningText,
      alternatives: evaluations.slice(1, 4).map(evaluation => ({
        provider: evaluation.name,
        score: evaluation.score,
        reason: evaluation.reasoningText[0] || 'Alternative option'
      }))
    };
  }

  private buildSelectionCriteria(request: AIRequest & { provider?: string }): ProviderSelectionCriteria {
    const tokenEstimate = this.estimateRequestTokens(request);

    return {
      taskType: request.taskType,
      complexity: request.complexity,
      estimatedTokens: tokenEstimate,
      requestedModel: request.model,
      requiredFeatures: request.features || [],
      maxLatency: request.maxLatency,
      maxCost: request.maxCost,
      qualityRequirement: this.determineQualityRequirement(request),
      preferredProviders: request.provider ? [request.provider] : undefined
    };
  }

  private async evaluateProviders(criteria: ProviderSelectionCriteria): Promise<ProviderEvaluation[]> {
    const availableProviders = this.registry.getHealthySortedProviders();
    const evaluations: ProviderEvaluation[] = [];

    for (const { name, provider } of availableProviders) {
      if (criteria.preferredProviders?.length && !criteria.preferredProviders.includes(name)) continue;
      if (criteria.excludedProviders?.includes(name)) {
        continue;
      }

      try {
        const evaluation = await this.evaluateProvider(name, provider.adapter, criteria);
        evaluations.push(evaluation);
      } catch (error) {
        console.warn(`Failed to evaluate provider ${name}:`, error);
      }
    }

    return evaluations.sort((a, b) => b.score - a.score);
  }

  private async evaluateProvider(
    name: string,
    adapter: AIProviderAdapter,
    criteria: ProviderSelectionCriteria
  ): Promise<ProviderEvaluation> {
    const capabilities = adapter.getCapabilities();
    const costEstimate = await this.estimateProviderCost(adapter, criteria);
    const latencyEstimate = this.estimateProviderLatency(name, criteria);

    const scores = {
      cost: this.scoreCost(costEstimate.estimatedCost, criteria.maxCost),
      latency: this.scoreLatency(latencyEstimate, criteria.maxLatency),
      quality: this.scoreQuality(name, criteria.complexity, criteria.qualityRequirement),
      features: this.scoreFeatureCompatibility(capabilities, criteria.requiredFeatures),
      task: this.scoreTaskSuitability(name, criteria.taskType)
    };

    const reasoning: string[] = [];
    let totalScore = 0;

    if (criteria.preferredProviders?.includes(name)) {
      scores.cost *= 1.2;
      reasoning.push('Preferred provider');
    }

    totalScore = this.calculateWeightedScore(scores, criteria);

    this.addReasoningForScores(scores, reasoning, name);

    return {
      name,
      adapter,
      score: totalScore,
      estimatedCost: costEstimate.estimatedCost,
      estimatedLatency: latencyEstimate,
      qualityScore: scores.quality,
      featureCompatibility: scores.features,
      reasoningText: reasoning
    };
  }

  private calculateWeightedScore(scores: any, criteria: ProviderSelectionCriteria): number {
    const weights = this.getWeightsForCriteria(criteria);

    return (
      scores.cost * weights.cost +
      scores.latency * weights.latency +
      scores.quality * weights.quality +
      scores.features * weights.features +
      scores.task * weights.task
    );
  }

  private getWeightsForCriteria(criteria: ProviderSelectionCriteria): Record<string, number> {
    const baseWeights = {
      cost: 0.25,
      latency: 0.15,
      quality: 0.30,
      features: 0.15,
      task: 0.15
    };

    if (criteria.maxCost && criteria.maxCost < 0.01) {
      baseWeights.cost = 0.40;
      baseWeights.quality = 0.20;
    }

    if (criteria.maxLatency && criteria.maxLatency < 2000) {
      baseWeights.latency = 0.30;
      baseWeights.quality = 0.20;
    }

    if (criteria.qualityRequirement === 'premium') {
      baseWeights.quality = 0.45;
      baseWeights.cost = 0.15;
    }

    return baseWeights;
  }

  private scoreCost(cost: number, maxCost?: number): number {
    if (maxCost && cost > maxCost) {
      return 0;
    }

    const normalizedCost = Math.min(cost / 0.1, 1);
    return Math.max(0, 1 - normalizedCost);
  }

  private scoreLatency(latency: number, maxLatency?: number): number {
    if (maxLatency && latency > maxLatency) {
      return 0;
    }

    const normalizedLatency = Math.min(latency / 5000, 1);
    return Math.max(0, 1 - normalizedLatency);
  }

  private scoreQuality(provider: string, complexity: Complexity, requirement?: string): number {
    const qualityScores: Record<string, Record<Complexity, number>> = {
      'openai': { low: 0.85, medium: 0.90, high: 0.95 },
      'anthropic': { low: 0.80, medium: 0.95, high: 0.98 },
      'google': { low: 0.75, medium: 0.85, high: 0.90 },
      'azure': { low: 0.85, medium: 0.90, high: 0.95 }
    };

    const baseScore = qualityScores[provider]?.[complexity] || 0.7;

    if (requirement === 'premium') {
      return Math.min(baseScore * 1.1, 1.0);
    }

    return baseScore;
  }

  private scoreFeatureCompatibility(capabilities: any, requiredFeatures: string[]): number {
    if (requiredFeatures.length === 0) {
      return 1.0;
    }

    const supportedFeatures = requiredFeatures.filter(feature => {
      switch (feature) {
        case 'function_calling':
          return capabilities.supportsFunctionCalling;
        case 'json_mode':
          return capabilities.supportsJsonMode;
        case 'streaming':
          return capabilities.supportsStreaming;
        case 'vision':
          return capabilities.supportsVision;
        default:
          return true;
      }
    });

    return supportedFeatures.length / requiredFeatures.length;
  }

  private scoreTaskSuitability(provider: string, taskType: TaskType): number {
    const taskSuitability: Record<string, Partial<Record<TaskType, number>>> = {
      'openai': {
        'document_analysis': 0.85,
        'opportunity_matching': 0.80,
        'content_generation': 0.90,
        'summarization': 0.85,
        'classification': 0.80,
        'embedding': 0.95,
        'simple_qa': 0.85,
        'complex_analysis': 0.90
      },
      'anthropic': {
        'document_analysis': 0.95,
        'opportunity_matching': 0.85,
        'content_generation': 0.95,
        'summarization': 0.90,
        'classification': 0.85,
        'embedding': 0.70,
        'simple_qa': 0.90,
        'complex_analysis': 0.98
      },
      'google': {
        'document_analysis': 0.80,
        'opportunity_matching': 0.75,
        'content_generation': 0.80,
        'summarization': 0.80,
        'classification': 0.85,
        'embedding': 0.85,
        'simple_qa': 0.80,
        'complex_analysis': 0.75
      }
    };

    return taskSuitability[provider]?.[taskType] || 0.7;
  }

  private async estimateProviderCost(
    adapter: AIProviderAdapter,
    criteria: ProviderSelectionCriteria
  ): Promise<CostEstimate> {
    const mockRequest = {
      model: criteria.requestedModel ?? 'balanced',
      taskType: criteria.taskType,
      complexity: criteria.complexity,
      messages: [{ role: 'user' as const, content: 'x'.repeat(criteria.estimatedTokens * 4) }]
    };

    return adapter.estimateCost(mockRequest);
  }

  private estimateProviderLatency(provider: string, criteria: ProviderSelectionCriteria): number {
    const baseLatencies: Record<string, number> = {
      'openai': 1500,
      'anthropic': 2000,
      'google': 1200,
      'azure': 1800
    };

    const baseLatency = baseLatencies[provider] || 2000;
    const tokenMultiplier = Math.max(1, criteria.estimatedTokens / 1000);

    return baseLatency * tokenMultiplier;
  }

  private selectOptimalModel(adapter: AIProviderAdapter, criteria: ProviderSelectionCriteria, requestedModel?: string): string {
    // If a specific model was requested, use it (for OpenRouter models like x-ai/grok-4)
    if (requestedModel && !this.isUnifiedModelName(requestedModel)) {
      return requestedModel;
    }

    // Otherwise, use the unified model selection logic
    if (criteria.complexity === 'low' || criteria.taskType === 'simple_qa') {
      return 'fast';
    }

    if (criteria.complexity === 'high' || criteria.qualityRequirement === 'premium') {
      return 'powerful';
    }

    return 'balanced';
  }

  private isUnifiedModelName(model: string): boolean {
    return ['fast', 'balanced', 'powerful'].includes(model);
  }

  private estimateRequestTokens(request: AIRequest): number {
    if (request.messages) {
      return request.messages.reduce(
        (total, msg) => total + Math.ceil(msg.content.split(/\s+/).length * 1.3),
        0
      );
    }

    if (request.text) {
      return Math.ceil(request.text.split(/\s+/).length * 1.3);
    }

    return 500; // Default estimate
  }

  private determineQualityRequirement(request: AIRequest): 'standard' | 'high' | 'premium' {
    if (request.complexity === 'high' ||
        ['complex_analysis', 'document_analysis'].includes(request.taskType)) {
      return 'premium';
    }

    if (request.complexity === 'medium' ||
        ['content_generation', 'summarization'].includes(request.taskType)) {
      return 'high';
    }

    return 'standard';
  }

  private calculateConfidence(selected: ProviderEvaluation, all: ProviderEvaluation[]): number {
    if (all.length === 1) {
      return selected.score;
    }

    const secondBest = all[1];
    const margin = selected.score - secondBest.score;
    const maxMargin = 1.0;

    return Math.min(selected.score + (margin / maxMargin) * 0.2, 1.0);
  }

  private addReasoningForScores(scores: any, reasoning: string[], provider: string): void {
    if (scores.cost > 0.8) {
      reasoning.push('Very cost-effective');
    } else if (scores.cost < 0.3) {
      reasoning.push('Higher cost option');
    }

    if (scores.latency > 0.8) {
      reasoning.push('Low latency');
    }

    if (scores.quality > 0.9) {
      reasoning.push('Highest quality results');
    }

    if (scores.features === 1.0) {
      reasoning.push('Full feature compatibility');
    }

    if (scores.task > 0.9) {
      reasoning.push(`Optimized for ${provider}`);
    }
  }
}
