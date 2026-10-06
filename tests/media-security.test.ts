import { POST } from '@/app/api/v1/ai/media/route';
import { getAuth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { ImageRouterAdapter } from '@/lib/ai/providers/imagerouter-adapter';
import { NextRequest } from 'next/server';
jest.mock('@clerk/nextjs/server', () => ({ getAuth: jest.fn() }));
jest.mock('@/lib/db', () => ({ prisma: { user: { findFirst: jest.fn() } } }));
jest.mock('@/lib/ai/ai-service-manager', () => ({ AIServiceManager: { getInstance: jest.fn() } }));
jest.mock('@/lib/ai/providers/imagerouter-adapter', () => ({ ImageRouterAdapter: class {} }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('@/lib/api-validation', () => ({ validateRequest: jest.fn().mockResolvedValue({ success: true, data: { type: 'image', prompt: 'An orange tree', model: 'auto', count: 1 } }) }));
jest.mock('@/lib/billing/usage-guard', () => ({ guardUsage: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { AI_QUERY: 'AI_QUERY' } }));
const generateMedia = jest.fn();
const request = (headers: Record<string, string> = {}, url = 'https://example.test/api/v1/ai/media') => new NextRequest(url, { method: 'POST', headers, body: JSON.stringify({ type: 'image', prompt: 'An orange tree' }) });
beforeEach(() => {
  jest.clearAllMocks();
  (getAuth as jest.Mock).mockReturnValue({ userId: null });
  (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-a', organizationId: 'tenant-a' });
  const adapter = Object.assign(new ImageRouterAdapter({} as never), { estimateMediaCost: jest.fn().mockResolvedValue({ estimatedCost: 0.02 }), generateMedia });
  (AIServiceManager.getInstance as jest.Mock).mockReturnValue({ initialize: jest.fn(), getProvider: () => adapter });
  generateMedia.mockRejectedValue(new Error('Network connection failed'));
});
test.each([{ 'X-Internal-Call': 'true', 'X-Organization-Id': 'tenant-b' }, { 'user-agent': 'node' }, {}])('forged internal request headers cannot bypass authentication: %j', async headers => {
  expect((await POST(request(headers, 'http://localhost/api/v1/ai/media'))).status).toBe(401);
  expect(prisma.user.findFirst).not.toHaveBeenCalled();
  expect(generateMedia).not.toHaveBeenCalled();
});
test('provider failures never return a generated demo image', async () => {
  (getAuth as jest.Mock).mockReturnValue({ userId: 'clerk-a', orgId: 'clerk-org-b' });
  const result = await POST(request({ 'X-Organization-Id': 'tenant-b' }));
  expect(result.status).toBeGreaterThanOrEqual(500);
  expect(await result.json()).toMatchObject({ success: false });
  expect(generateMedia).toHaveBeenCalledWith(expect.objectContaining({ model: undefined, metadata: expect.objectContaining({ organizationId: 'tenant-a', userId: 'user-a' }) }));
});
