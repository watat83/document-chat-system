jest.mock('ai', () => ({ ...jest.requireActual('ai'), generateText: jest.fn(), streamText: jest.fn(), embed: jest.fn(), embedMany: jest.fn() }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { AI_QUERY: 'AI_QUERY' }, UsageTrackingService: { enforceUsageLimit: jest.fn().mockResolvedValue(undefined), trackUsage: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('@/lib/ai/monitoring/ai-metrics-integration', () => ({ AIMetricsIntegration: jest.fn().mockImplementation(() => ({ recordAIUsage: jest.fn().mockResolvedValue(undefined) })) }));
jest.mock('@/lib/cache', () => ({ cacheManager: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), delete: jest.fn() } }));
jest.mock('@ai-sdk/openai', () => ({ createOpenAI: jest.fn(() => ({ chat: jest.fn((model: string) => ({ modelId: model })), embedding: jest.fn((model: string) => ({ modelId: model })) })) }));
jest.mock('@/lib/config/env', () => ({ ai: { modelFast: 'gpt-4o-mini', modelBalanced: 'gpt-4o', modelPowerful: 'gpt-4o' } }));

import { OpenAIAdapter } from '../openai-adapter';
import { sdkAdapterContracts } from '../../__tests__/shared/sdk-contracts';
import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

sdkAdapterContracts('openai', () => new OpenAIAdapter({ apiKey: 'unit-key', organizationId: 'provider-org', maxRetries: 0 }));
test('the SDK factory receives provider credentials at construction', () => {
  new OpenAIAdapter({ apiKey: 'unit-key', organizationId: 'provider-org' });
  expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'unit-key', organization: 'provider-org' });
});
test('empty credentials fail before constructing an SDK client', () => {
  expect(() => new OpenAIAdapter({ apiKey: ' ' })).toThrow(/API key/);
});
test('single embeddings pass dimensions in provider options and preserve actual usage', async () => {
  (embed as jest.Mock).mockResolvedValue({ embedding: [0.1, 0.2], usage: { tokens: 8 } });
  const response = await new OpenAIAdapter({ apiKey: 'unit-key' }).generateEmbedding({ text: 'Text', model: 'embedding-small', dimensions: 2 });
  expect(response.embedding).toEqual([0.1, 0.2]);
  expect(response.usage).toEqual({ totalTokens: 8 });
  expect(response.metadata.dimensions).toBe(2);
  expect(embed).toHaveBeenCalledWith(expect.objectContaining({ value: 'Text', providerOptions: { openai: { dimensions: 2 } } }));
});
test('batch embeddings call embedMany and preserve input order', async () => {
  (embedMany as jest.Mock).mockResolvedValue({ embeddings: [[0.1], [0.2]], usage: { tokens: 2 } });
  const response = await new OpenAIAdapter({ apiKey: 'unit-key' }).generateEmbedding({ text: ['first', 'second'], model: 'embedding-small' });
  expect(response.embedding).toEqual([[0.1], [0.2]]);
  expect(embedMany).toHaveBeenCalledWith(expect.objectContaining({ values: ['first', 'second'] }));
});
