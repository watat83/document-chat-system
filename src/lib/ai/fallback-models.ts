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

const FALLBACK_TEXT_MODELS: FallbackTextModel[] = [
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
    name: 'openai/gpt-4o',
    provider: 'openrouter',
    displayName: 'GPT-4o',
    description: 'High-quality multimodal OpenAI model via OpenRouter',
    maxTokens: 128000,
    costPer1KTokens: { prompt: 2.5, completion: 10 },
    averageLatency: null,
    qualityScore: 0.95,
    tier: 'powerful',
    features: ['chat', 'vision', 'code-generation', 'function-calling', 'json-mode'],
  },
  {
    name: 'anthropic/claude-3-5-sonnet',
    provider: 'openrouter',
    displayName: 'Claude 3.5 Sonnet',
    description: 'Strong reasoning and long-context model via OpenRouter',
    maxTokens: 200000,
    costPer1KTokens: { prompt: 3, completion: 15 },
    averageLatency: null,
    qualityScore: 0.95,
    tier: 'powerful',
    features: ['chat', 'vision', 'code-generation', 'multimodal'],
  },
  {
    name: 'meta-llama/llama-3.1-8b-instruct',
    provider: 'openrouter',
    displayName: 'Llama 3.1 8B Instruct',
    description: 'Fast open-weight instruction model via OpenRouter',
    maxTokens: 131072,
    costPer1KTokens: { prompt: 0.05, completion: 0.08 },
    averageLatency: null,
    qualityScore: 0.8,
    tier: 'fast',
    features: ['chat', 'code-generation'],
  },
  {
    name: 'google/gemini-pro',
    provider: 'openrouter',
    displayName: 'Gemini Pro',
    description: 'Google general-purpose model via OpenRouter',
    maxTokens: 32768,
    costPer1KTokens: { prompt: 0.5, completion: 1.5 },
    averageLatency: null,
    qualityScore: 0.88,
    tier: 'balanced',
    features: ['chat', 'code-generation', 'multimodal'],
  },
  {
    name: 'mistral/mistral-7b-instruct',
    provider: 'openrouter',
    displayName: 'Mistral 7B Instruct',
    description: 'Efficient open-weight instruction model via OpenRouter',
    maxTokens: 32768,
    costPer1KTokens: { prompt: 0.06, completion: 0.06 },
    averageLatency: null,
    qualityScore: 0.78,
    tier: 'fast',
    features: ['chat', 'code-generation'],
  },
];

export function getFallbackTextModels(): FallbackTextModel[] {
  return FALLBACK_TEXT_MODELS.map((model) => ({
    ...model,
    costPer1KTokens: { ...model.costPer1KTokens },
    features: [...model.features],
  }));
}
