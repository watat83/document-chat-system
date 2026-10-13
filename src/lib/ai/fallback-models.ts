export interface FallbackTextModel {
  name: string;
  provider: 'openrouter';
  displayName: string;
  description: string;
  maxTokens: number;
  costPer1KTokens: { prompt: number; completion: number };
  averageLatency: number | null;
  qualityScore: number | null;
  tier: 'fast' | 'balanced' | 'powerful';
  features: string[];
}

export const DEFAULT_TEXT_MODEL = 'openrouter/auto';

const FALLBACK_TEXT_MODELS: FallbackTextModel[] = [
  {
    name: DEFAULT_TEXT_MODEL,
    provider: 'openrouter',
    displayName: 'Auto (Recommended)',
    description: 'Automatically selects the best available model for each request',
    maxTokens: 2000000,
    costPer1KTokens: { prompt: 0, completion: 0 },
    averageLatency: null,
    qualityScore: null,
    tier: 'balanced',
    features: ['chat', 'vision', 'code-generation', 'function-calling', 'json-mode'],
  },
  {
    name: 'openai/gpt-4o-mini',
    provider: 'openrouter',
    displayName: 'GPT-4o Mini',
    description: 'Fast, cost-effective OpenAI model via OpenRouter',
    maxTokens: 128000,
    costPer1KTokens: { prompt: 0.15, completion: 0.6 },
    averageLatency: null,
    qualityScore: 0.85,
    tier: 'fast',
    features: ['chat', 'vision', 'code-generation', 'function-calling', 'json-mode'],
  },
  {
    name: 'openai/gpt-5.4-mini',
    provider: 'openrouter',
    displayName: 'GPT-5.4 Mini',
    description: 'Fast OpenAI reasoning and coding model via OpenRouter',
    maxTokens: 400000,
    costPer1KTokens: { prompt: 0.75, completion: 4.5 },
    averageLatency: null,
    qualityScore: 0.92,
    tier: 'balanced',
    features: ['chat', 'vision', 'code-generation', 'function-calling', 'json-mode'],
  },
  {
    name: 'anthropic/claude-sonnet-4.6',
    provider: 'openrouter',
    displayName: 'Claude Sonnet 4.6',
    description: 'Strong reasoning and long-context model via OpenRouter',
    maxTokens: 1000000,
    costPer1KTokens: { prompt: 3, completion: 15 },
    averageLatency: null,
    qualityScore: 0.95,
    tier: 'powerful',
    features: ['chat', 'vision', 'code-generation', 'multimodal'],
  },
  {
    name: 'google/gemini-3.8-flash',
    provider: 'openrouter',
    displayName: 'Gemini 3.8 Flash',
    description: 'Fast multimodal Google model via OpenRouter',
    maxTokens: 1048576,
    costPer1KTokens: { prompt: 0.75, completion: 3.75 },
    averageLatency: null,
    qualityScore: 0.9,
    tier: 'fast',
    features: ['chat', 'vision', 'code-generation', 'function-calling', 'json-mode'],
  },
  {
    name: 'meta-llama/llama-4-maverick',
    provider: 'openrouter',
    displayName: 'Llama 4 Maverick',
    description: 'Open-weight multimodal Meta model via OpenRouter',
    maxTokens: 1048576,
    costPer1KTokens: { prompt: 0.1875, completion: 0.6525 },
    averageLatency: null,
    qualityScore: 0.84,
    tier: 'balanced',
    features: ['chat', 'vision', 'code-generation', 'multimodal'],
  },
  {
    name: 'mistralai/mistral-small-2603',
    provider: 'openrouter',
    displayName: 'Mistral Small 4',
    description: 'Efficient reasoning and multimodal model via OpenRouter',
    maxTokens: 262144,
    costPer1KTokens: { prompt: 0.15, completion: 0.6 },
    averageLatency: null,
    qualityScore: 0.82,
    tier: 'fast',
    features: ['chat', 'vision', 'code-generation', 'json-mode'],
  },
];

export function getFallbackTextModels(): FallbackTextModel[] {
  return FALLBACK_TEXT_MODELS.map((model) => ({
    ...model,
    costPer1KTokens: { ...model.costPer1KTokens },
    features: [...model.features],
  }));
}
