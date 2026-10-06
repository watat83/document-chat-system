jest.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: jest.fn() } }));
import { prisma } from '@/lib/prisma';
import { incrementDatabaseRateLimit } from '@/lib/database-rate-limit';

const query = prisma.$queryRaw as jest.Mock;
afterEach(() => query.mockReset());

test('increments a counter with bound parameters and bounded cleanup', async () => {
  query.mockResolvedValue([{ count: 2 }]);
  const reset = new Date('2026-10-06T12:00:00Z');
  expect(await incrementDatabaseRateLimit('tenant:user:window', reset)).toBe(2);
  expect(query.mock.calls[0][0].join('')).toContain('ON CONFLICT (key) DO UPDATE');
  expect(query.mock.calls[0][0].join('')).toContain('LIMIT 100');
  expect(query.mock.calls[0].slice(1)).toEqual(['tenant:user:window', reset]);
});
test.each([{ rows: [] }, { rows: [{ count: 0 }] }, { rows: [{ count: -1 }] }, { rows: [{ count: 1.5 }] }])('rejects invalid database counters ($rows)', async ({ rows }) => {
  query.mockResolvedValue(rows);
  await expect(incrementDatabaseRateLimit('key', new Date())).rejects.toThrow('Invalid rate-limit counter');
});
test('propagates database failures to the fail-closed limiter', async () => {
  query.mockRejectedValue(new Error('database unavailable'));
  await expect(incrementDatabaseRateLimit('key', new Date())).rejects.toThrow('database unavailable');
});
