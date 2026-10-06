import { AIMetricsIntegration } from '@/lib/ai/monitoring/ai-metrics-integration';
import { db } from '@/lib/db';
import { UsageTrackingService } from '@/lib/usage-tracking';
jest.mock('@/lib/db', () => ({ db: { aIMetric: { upsert: jest.fn().mockResolvedValue({}) } } }));
jest.mock('@/lib/usage-tracking', () => ({ UsageTrackingService: { trackUsage: jest.fn() } }));
test('analytics persist one metric without incrementing the billing ledger', async () => {
  const metrics = new AIMetricsIntegration();
  await metrics.recordAIUsage('tenant-a', 'user-a', {
    provider: 'openrouter', model: 'chosen-model', operation: 'completion', latency: 42,
    tokenCount: { prompt: 10, completion: 20, total: 30 }, cost: 0.01, success: true,
    metadata: { taskType: 'simple_qa', requestId: 'request-a' },
  });
  expect(UsageTrackingService.trackUsage).not.toHaveBeenCalled();
  expect(db.aIMetric.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { requestId: 'request-a' }, create: expect.objectContaining({ organizationId: 'tenant-a', totalTokens: 30, cost: 0.01 }), update: {} }));
});
