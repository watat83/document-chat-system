import { CleanOpenRouterAdapter } from '@/lib/ai/providers/clean-openrouter-adapter';
import { UsageTrackingService } from '@/lib/usage-tracking';
import { cacheManager } from '@/lib/cache';

jest.mock('@/lib/db', () => ({ db: { subscription: { findFirst: jest.fn().mockResolvedValue(null) } } }));
jest.mock('@/lib/config/env', () => ({ ai: { modelFast: 'gpt-4o-mini', modelBalanced: 'gpt-4o', modelPowerful: 'gpt-4o', openrouterPromptCacheEnabled: false } }));
jest.mock('@/lib/cache', () => ({ cacheManager: { get: jest.fn(), set: jest.fn(), delete: jest.fn() } }));
jest.mock('@/lib/cache/config', () => ({ CACHE_TTL: { MEDIUM: 300, LONG: 3600 } }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { AI_QUERY: 'AI_QUERY' }, UsageTrackingService: { enforceUsageLimit: jest.fn(), trackUsage: jest.fn(), checkUsageLimitWithDetails: jest.fn() } }));
jest.mock('@/lib/csrf', () => ({ validateCSRFInAPIRoute: jest.fn() }));
jest.mock('@/lib/ai/monitoring/openrouter-metrics-collector', () => ({ OpenRouterMetricsCollector: jest.fn().mockImplementation(() => ({})) }));
jest.mock('@/lib/ai/monitoring/ai-metrics-integration', () => ({ AIMetricsIntegration: jest.fn().mockImplementation(() => ({ recordAIUsage: jest.fn() })) }));
const createAdapter = () => new CleanOpenRouterAdapter({ apiKey: 'test-only', appName: 'Test', siteUrl: 'https://example.test', enableSmartRouting: true, costOptimization: 'balanced', maxRetries: 0, timeout: 10000 });
const wire = (text: string) => new Response(new ReadableStream({ start(controller) {
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
  controller.close();
} }));
const originalFetch = global.fetch;
beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });
afterAll(() => { global.fetch = originalFetch; });

test('the provider stream preserves byte-split Unicode, sends the selected model and settles usage once', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(wire('data: {"id":"generation-a","model":"openai/gpt-4o-mini","choices":[{"delta":{"content":"Hello 世界"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n'));
  const chunks = [];
  for await (const chunk of createAdapter().streamCompletion({ model: 'fast', temperature: 0, messages: [{ role: 'user', content: 'Hello' }], metadata: { organizationId: 'tenant-a' } })) chunks.push(chunk);
  expect(chunks.map(chunk => chunk.content).join('')).toBe('Hello 世界');
  const payload = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(payload).toEqual(expect.objectContaining({ model: 'openai/gpt-4o-mini', temperature: 0, stream: true }));
  expect(payload.provider.max_price).toEqual({ prompt: 20, completion: 20 });
  expect(UsageTrackingService.trackUsage).toHaveBeenCalledTimes(1);
  expect(chunks.at(-1)?.metadata?.usage).toEqual({ prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 });
});
test('truncated and failed streams do not settle successful usage', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(wire('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
  await expect((async () => { for await (const chunk of createAdapter().streamCompletion({ model: 'fast', messages: [{ role: 'user', content: 'Hello' }], metadata: { organizationId: 'tenant-a' } })) void chunk; })()).rejects.toThrow(/before completion/);
  expect(UsageTrackingService.trackUsage).not.toHaveBeenCalled();
});
test('embedding batches sort by input index and return actual dimensions', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(Response.json({ model: 'openai/text-embedding-3-small', data: [{ index: 1, embedding: [0.3, 0.4] }, { index: 0, embedding: [0.1, 0.2] }], usage: { total_tokens: 4 } }));
  const response = await createAdapter().generateEmbedding({ model: 'embedding-small', text: ['first', 'second'], dimensions: 2 });
  expect(response.embedding).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  expect(response.metadata.dimensions).toBe(2);
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ model: 'openai/text-embedding-3-small', input: ['first', 'second'], dimensions: 2 });
});
test('cached catalog prices convert dollars per token to dollars per thousand tokens', async () => {
  (cacheManager.get as jest.Mock).mockResolvedValue(null);
  (global.fetch as jest.Mock).mockResolvedValue(Response.json({ data: [{ id: 'openai/gpt-4o-mini', name: 'Test', context_length: 8192, pricing: { prompt: '0.000001', completion: '0.000002' } }] }));
  const adapter = createAdapter();
  const models = await adapter.loadAvailableModels();
  expect(models[0].costPer1KTokens).toEqual({ prompt: 0.001, completion: 0.002 });
  expect(adapter.getAvailableModels()).toEqual(models);
});
test('duplicate embedding indices fail before recording successful usage', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(Response.json({ data: [{ index: 0, embedding: [0.1] }, { index: 0, embedding: [0.2] }] }));
  await expect(createAdapter().generateEmbedding({ model: 'embedding-small', text: ['first', 'second'], metadata: { organizationId: 'tenant-a' } })).rejects.toThrow(/indices/);
  expect(UsageTrackingService.trackUsage).not.toHaveBeenCalled();
});
test('empty embedding batches never reach the provider', async () => {
  await expect(createAdapter().generateEmbedding({ model: 'embedding-small', text: [] })).rejects.toThrow(/empty/);
  expect(global.fetch).not.toHaveBeenCalled();
});
