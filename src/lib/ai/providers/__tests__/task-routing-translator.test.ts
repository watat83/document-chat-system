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

const originalFetch = global.fetch;
const request = { model: 'fast', messages: [{ role: 'user' as const, content: 'Analyze this document' }] };
const createAdapter = () => new CleanOpenRouterAdapter({ apiKey: 'test-only', appName: 'Test', siteUrl: 'https://example.test', enableSmartRouting: true, costOptimization: 'balanced', maxRetries: 0, timeout: 10000 });
beforeEach(() => {
  jest.clearAllMocks();
  (cacheManager.get as jest.Mock).mockResolvedValue(null);
  global.fetch = jest.fn().mockResolvedValue(Response.json({ id: 'generation-test', model: 'openai/gpt-4o-mini', choices: [{ message: { content: 'Result' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }));
});
afterAll(() => { global.fetch = originalFetch; });
const payload = () => JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);

test.each(['document_analysis', 'opportunity_matching', 'content_generation', 'simple_qa', 'classification'] as const)('native routing preserves privacy and price bounds for %s', async taskType => {
  await createAdapter().generateCompletion({ ...request, hints: { taskType, complexity: 'high' } });
  expect(payload().provider).toEqual({ sort: 'price', max_price: { prompt: 50, completion: 50 }, data_collection: 'deny' });
  expect(payload().model).toBe('openai/gpt-4o-mini');
});
test('JSON output mode reaches the actual provider request', async () => {
  await createAdapter().generateCompletion({ ...request, options: { jsonMode: true }, temperature: 0, maxTokens: 256 });
  expect(payload()).toMatchObject({ temperature: 0, max_tokens: 256, response_format: { type: 'json_object' } });
});
test('web search appends the online model suffix once and sends its result limit', async () => {
  await createAdapter().generateCompletion({ ...request, options: { webSearch: { enabled: true, max_results: 3 } } });
  expect(payload().model).toBe('openai/gpt-4o-mini:online');
  expect(payload().plugins).toContainEqual(expect.objectContaining({ id: 'web', max_results: 3 }));
});
test('PDF context uses inline data and explicit parser settings', async () => {
  await createAdapter().generateCompletion({ ...request, messages: [{ role: 'user', content: 'Read this', attachments: [{ type: 'pdf', mimeType: 'application/pdf', name: 'contract.pdf', data: 'JVBERg==' }] }], metadata: { pdfEngine: 'pdf-text' } });
  expect(payload().messages[0].content).toContainEqual({ type: 'file', file: { filename: 'contract.pdf', file_data: 'data:application/pdf;base64,JVBERg==' } });
  expect(payload().plugins).toContainEqual({ id: 'file-parser', pdf: { engine: 'pdf-text' } });
});
