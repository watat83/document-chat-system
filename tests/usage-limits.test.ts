import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { db } from '@/lib/db';

jest.mock('@/lib/db', () => ({ db: { subscription: { findFirst: jest.fn(), findMany: jest.fn() }, usageRecord: { aggregate: jest.fn() } } }));
jest.mock('@/lib/stripe', () => ({ getSubscriptionPlans: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(UsageTrackingService, 'getBillingPeriod').mockResolvedValue({ periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-11-01') });
  (db.subscription.findFirst as jest.Mock).mockResolvedValue({ limits: { documentsPerMonth: 10, aiCreditsPerMonth: 0, savedSearches: 1, seats: 1 } });
  (db.usageRecord.aggregate as jest.Mock).mockResolvedValue({ _sum: { quantity: 10 } });
});
afterEach(() => jest.restoreAllMocks());
test('document processing respects the subscribed document limit', async () => {
  expect(await UsageTrackingService.checkUsageLimit('tenant-a', UsageType.DOCUMENT_PROCESSING)).toMatchObject({ allowed: false, limit: 10, remainingUsage: 0 });
  expect(db.usageRecord.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'tenant-a', usageType: 'DOCUMENT_PROCESSING' }) }));
});
test('details never bypass denied usage', async () => {
  expect(await UsageTrackingService.checkUsageLimitWithDetails('tenant-a', UsageType.AI_QUERY)).toMatchObject({ allowed: false, canProceed: false, isDeveloperOverride: false });
});
test('missing quotas fail closed rather than comparing undefined limits', async () => {
  (db.subscription.findFirst as jest.Mock).mockResolvedValue({ limits: {} });
  expect(await UsageTrackingService.checkUsageLimit('tenant-a', UsageType.SAVED_SEARCH)).toMatchObject({ allowed: false, limit: 0 });
});
test('unlimited quotas retain actual usage', async () => {
  (db.subscription.findFirst as jest.Mock).mockResolvedValue({ limits: { documentsPerMonth: -1 } });
  expect(await UsageTrackingService.checkUsageLimit('tenant-a', UsageType.DOCUMENT_PROCESSING)).toMatchObject({ allowed: true, limit: -1, currentUsage: 10 });
});
