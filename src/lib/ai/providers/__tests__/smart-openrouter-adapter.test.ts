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

import { SmartOpenRouterAdapter } from '../smart-openrouter-adapter';
const originalFetch = global.fetch;
const config = { apiKey: 'test-only', appName: 'Test', siteUrl: 'https://example.test', enableSmartRouting: true, costOptimization: 'balanced' as const, maxRetries: 0, timeout: 10000 };
const catalog = { data: [{ id: 'openai/gpt-4o-mini', name: 'Mini', context_length: 128000, pricing: { prompt: '0.000001', completion: '0.000002' } }] };
beforeEach(() => { jest.clearAllMocks(); (cacheManager.get as jest.Mock).mockResolvedValue(null); global.fetch = jest.fn().mockImplementation(async () => Response.json(catalog)); });
afterAll(() => { global.fetch = originalFetch; });
test('the compatibility adapter resolves to the current implementation', () => {
  expect(SmartOpenRouterAdapter).toBe(CleanOpenRouterAdapter);
});
test('initialization loads a real catalog and checks provider connectivity', async () => {
  const adapter = new SmartOpenRouterAdapter(config);
  await adapter.initialize();
  expect(adapter.getAvailableModels()).toHaveLength(1);
  expect(global.fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-only', 'X-Title': 'Test' }) }));
});
test('initialization rejects missing credentials', async () => {
  await expect(new SmartOpenRouterAdapter({ ...config, apiKey: '' }).initialize()).rejects.toThrow(/API key/);
});
test('catalog API errors never fabricate model availability', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(new Response('Provider unavailable', { status: 503 }));
  const adapter = new SmartOpenRouterAdapter(config);
  await expect(adapter.loadAvailableModels()).rejects.toThrow(/Failed to load/);
  expect(adapter.getAvailableModels()).toEqual([]);
});
test('catalog cache is reused and prices retain their documented units', async () => {
  const adapter = new SmartOpenRouterAdapter(config);
  const models = await adapter.loadAvailableModels();
  expect(models[0].costPer1KTokens).toEqual({ prompt: 0.001, completion: 0.002 });
  (cacheManager.get as jest.Mock).mockResolvedValue(models);
  (global.fetch as jest.Mock).mockClear();
  expect(await new SmartOpenRouterAdapter(config).loadAvailableModels()).toEqual(models);
  expect(global.fetch).not.toHaveBeenCalled();
});
test('refresh invalidates the shared catalog before loading updated models', async () => {
  const adapter = new SmartOpenRouterAdapter(config);
  await adapter.refreshModels();
  expect(cacheManager.delete).toHaveBeenCalledWith('ai:openrouter:models:available');
  expect(adapter.getAvailableModels()).toHaveLength(1);
});
test('health failures are reported without throwing to callers', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(new Response('Down', { status: 500 }));
  const adapter = new SmartOpenRouterAdapter(config);
  expect(await adapter.checkHealth()).toBe(false);
  expect(adapter.getHealthMetrics()).toMatchObject({ healthy: false });
});
test('capabilities describe supported request forms', () => {
  expect(new SmartOpenRouterAdapter(config).getCapabilities()).toMatchObject({ supportsStreaming: true, supportsFunctionCalling: true, supportsVision: true, supportsJsonMode: true });
});
