jest.mock('ai', () => ({ ...jest.requireActual('ai'), generateText: jest.fn(), streamText: jest.fn(), embed: jest.fn(), embedMany: jest.fn() }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { AI_QUERY: 'AI_QUERY' }, UsageTrackingService: { enforceUsageLimit: jest.fn().mockResolvedValue(undefined), trackUsage: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('@/lib/ai/monitoring/ai-metrics-integration', () => ({ AIMetricsIntegration: jest.fn().mockImplementation(() => ({ recordAIUsage: jest.fn().mockResolvedValue(undefined) })) }));
jest.mock('@/lib/cache', () => ({ cacheManager: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), delete: jest.fn() } }));
jest.mock('@ai-sdk/anthropic', () => ({ createAnthropic: jest.fn(() => jest.fn((model: string) => ({ modelId: model }))) }));

import { AnthropicAdapter } from '../anthropic-adapter';
import { sdkAdapterContracts } from '../../__tests__/shared/sdk-contracts';
import { createAnthropic } from '@ai-sdk/anthropic';

sdkAdapterContracts('anthropic', () => new AnthropicAdapter({ apiKey: 'unit-key', maxRetries: 0 }));
test('the SDK factory receives the configured provider key', () => {
  new AnthropicAdapter({ apiKey: 'unit-key' });
  expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'unit-key' });
});
test('empty credentials fail early', () => {
  expect(() => new AnthropicAdapter({ apiKey: '' })).toThrow(/API key/);
});
test('unsupported embeddings fail explicitly', async () => {
  await expect(new AnthropicAdapter({ apiKey: 'unit-key' }).generateEmbedding({ text: 'Text', model: 'embedding-small' })).rejects.toThrow();
});
