import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/ai/enhanced-chat/route';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { guardUsage } from '@/lib/billing/usage-guard';

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: { user: { findUnique: jest.fn() } } }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { AI_QUERY: 'AI_QUERY' } }));
jest.mock('@/lib/billing/usage-guard', () => ({ guardUsage: jest.fn() }));
jest.mock('@/lib/ai/ai-service-manager', () => ({ AIServiceManager: { getInstance: jest.fn() } }));
const generateCompletion = jest.fn();
const request = (body: unknown) => new NextRequest('https://example.test/api/v1/ai/enhanced-chat', { method: 'POST', body: JSON.stringify(body) });
const message = { role: 'user', content: 'Explain this document' };
beforeEach(() => {
  jest.clearAllMocks();
  (auth as jest.Mock).mockResolvedValue({ userId: 'clerk-a' });
  (db.user.findUnique as jest.Mock).mockResolvedValue({ id: 'internal-a', organizationId: 'tenant-a' });
  (guardUsage as jest.Mock).mockResolvedValue(null);
  (AIServiceManager.getInstance as jest.Mock).mockReturnValue({ generateCompletion });
});
test('unauthenticated chat never initializes a provider or accesses a tenant', async () => {
  (auth as jest.Mock).mockResolvedValue({ userId: null });
  expect((await POST(request({ messages: [message] }))).status).toBe(401);
  expect(db.user.findUnique).not.toHaveBeenCalled();
  expect(AIServiceManager.getInstance).not.toHaveBeenCalled();
});
test('provider failures are failures and cannot produce a fabricated successful answer', async () => {
  generateCompletion.mockRejectedValue(new Error('provider unavailable'));
  const response = await POST(request({ messages: [message] }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual(expect.objectContaining({ success: false, code: 'AI_SERVICE_UNAVAILABLE' }));
});
test('the authenticated tenant overrides client organization input and preserves zero temperature', async () => {
  generateCompletion.mockResolvedValue({ content: 'Answer', model: 'chosen-model', usage: {}, metadata: { provider: 'openrouter' } });
  const response = await POST(request({ messages: [message], organizationId: 'foreign-tenant', provider: 'openrouter', model: 'chosen-model', temperature: 0 }));
  expect(response.status).toBe(200);
  expect(generateCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'chosen-model', temperature: 0, metadata: { organizationId: 'tenant-a', userId: 'internal-a', provider: 'openrouter' } }));
});
test('attachments cannot ask the server to read local filesystem paths', async () => {
  const response = await POST(request({ messages: [{ ...message, attachments: [{ type: 'pdf', url: '/etc/passwd', name: 'secret', mimeType: 'application/pdf' }] }] }));
  expect(response.status).toBe(400);
  expect(generateCompletion).not.toHaveBeenCalled();
});
test('quota failures prevent provider calls', async () => {
  (guardUsage as jest.Mock).mockResolvedValue(Response.json({ error: 'Quota exceeded' }, { status: 429 }));
  expect((await POST(request({ messages: [message] }))).status).toBe(429);
  expect(generateCompletion).not.toHaveBeenCalled();
});
