import { UsageTrackingService } from '@/lib/usage-tracking';
import { db } from '@/lib/db';
jest.mock('@/lib/db', () => ({ db: { subscription: { findFirst: jest.fn() } } }));
jest.mock('@/lib/stripe', () => ({ getSubscriptionPlans: jest.fn() }));
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-31T23:59:59Z')); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());
test('calendar billing includes the whole last day and ends at the next UTC month', async () => {
  (db.subscription.findFirst as jest.Mock).mockResolvedValue(null);
  expect(await UsageTrackingService.getBillingPeriod('tenant-a')).toEqual({ periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-11-01T00:00:00Z') });
});
test('active subscription periods are not extended to include canceled subscriptions', async () => {
  (db.subscription.findFirst as jest.Mock).mockResolvedValue({ currentPeriodStart: new Date('2026-10-20'), currentPeriodEnd: new Date('2026-11-20') });
  expect(await UsageTrackingService.getBillingPeriod('tenant-a')).toEqual({ periodStart: new Date('2026-10-20'), periodEnd: new Date('2026-11-20') });
});
test('stale subscription periods fail closed until synchronized', async () => {
  (db.subscription.findFirst as jest.Mock).mockResolvedValue({ currentPeriodStart: new Date('2026-09-01'), currentPeriodEnd: new Date('2026-10-01') });
  await expect(UsageTrackingService.getBillingPeriod('tenant-a')).rejects.toThrow('synchronized');
});
test('database failures cannot reset subscribed usage to a calendar fallback', async () => {
  (db.subscription.findFirst as jest.Mock).mockRejectedValue(new Error('Database unavailable'));
  await expect(UsageTrackingService.getBillingPeriod('tenant-a')).rejects.toThrow('Database unavailable');
});
