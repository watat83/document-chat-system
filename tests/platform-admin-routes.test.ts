import { NextRequest } from 'next/server';
import { auth, getAuth } from '@clerk/nextjs/server';
import { isPlatformAdmin } from '@/lib/security/platform-admin';
import { POST as invalidate, DELETE as flush } from '@/app/api/v1/cache/invalidate/route';
import { GET, POST, DELETE } from '@/app/api/v1/admin/namespaces/route';
import { cacheManager } from '@/lib/cache';
import { defaultNamespaceManager } from '@/lib/ai/services/pinecone-namespace-manager';
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn(), getAuth: jest.fn() }));
jest.mock('@/lib/security/platform-admin', () => ({ isPlatformAdmin: jest.fn() }));
jest.mock('@/lib/cache', () => ({ cacheManager: { flush: jest.fn(), invalidate: jest.fn() } }));
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u' }) }, organization: { findUnique: jest.fn() } } }));
jest.mock('@/lib/ai/services/pinecone-namespace-manager', () => ({ defaultNamespaceManager: { getOrCreateNamespace: jest.fn(), deleteNamespace: jest.fn() } }));
const request = () => new NextRequest('https://example.test/api', { method: 'POST', body: JSON.stringify({ organizationId: 'foreign', namespace: 'foreign', confirm: true }) });
beforeEach(() => { jest.clearAllMocks(); (auth as jest.Mock).mockResolvedValue({ userId: 'member' }); (getAuth as jest.Mock).mockReturnValue({ userId: 'member' }); (isPlatformAdmin as jest.Mock).mockReturnValue(false); });
test.each([invalidate, flush, GET, POST, DELETE])('ordinary members cannot perform global operations', async handler => {
  expect((await handler(request())).status).toBe(403);
  expect(cacheManager.flush).not.toHaveBeenCalled();
  expect(cacheManager.invalidate).not.toHaveBeenCalled();
  expect(defaultNamespaceManager.getOrCreateNamespace).not.toHaveBeenCalled();
  expect(defaultNamespaceManager.deleteNamespace).not.toHaveBeenCalled();
});
test('a failed cache flush is never reported as successful', async () => {
  (isPlatformAdmin as jest.Mock).mockReturnValue(true);
  (cacheManager.flush as jest.Mock).mockResolvedValue(false);
  expect((await flush(request())).status).toBe(500);
});
