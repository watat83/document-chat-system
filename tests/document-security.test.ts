import { NextRequest } from 'next/server';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { GET, PUT } from '@/app/api/v1/conversations/[id]/route';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { document: { findFirst: jest.fn() }, conversation: { findFirst: jest.fn(), updateMany: jest.fn() } } }));
const user = { id: 'member-a', organizationId: 'org-a', role: 'MEMBER' };
const document = { id: 'doc-a', organizationId: 'org-a', uploadedById: 'owner-a', sharing: {}, deletedAt: null };
beforeEach(() => { jest.clearAllMocks(); (getCurrentUser as jest.Mock).mockResolvedValue(user); (prisma.document.findFirst as jest.Mock).mockResolvedValue(document); });
test('every guarded mutation rejects a same-organization non-owner without a grant', async () => {
  expect((await guardDocumentMutation('doc-a'))?.status).toBe(403);
});
test('deleted and foreign documents return 404 through the scoped database lookup', async () => {
  (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
  expect((await guardDocumentMutation('foreign-doc'))?.status).toBe(404);
  expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-doc', organizationId: 'org-a', deletedAt: null } });
});
test('document owner can edit but a WRITE grant cannot grant SHARE', async () => {
  (prisma.document.findFirst as jest.Mock).mockResolvedValue({ ...document, uploadedById: user.id });
  expect(await guardDocumentMutation('doc-a')).toBeNull();
  (prisma.document.findFirst as jest.Mock).mockResolvedValue({ ...document, sharing: { permissions: [{ userId: user.id, permission: 'WRITE' }] } });
  expect((await guardDocumentMutation('doc-a', 'SHARE'))?.status).toBe(403);
});
test('saved conversations are filtered by both internal user and organization', async () => {
  (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
  const response = await GET(new NextRequest('https://example.test/api/v1/conversations/foreign'), { params: Promise.resolve({ id: 'foreign' }) });
  expect(response.status).toBe(404);
  expect(prisma.conversation.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', userId: user.id, organizationId: user.organizationId } });
});
test('stale conversation revisions cannot overwrite another tab', async () => {
  (prisma.conversation.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  const request = new NextRequest('https://example.test/api/v1/conversations/chat-a', { method: 'PUT', body: JSON.stringify({ revision: 0, messages: [{ id: 'm1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() }] }) });
  const response = await PUT(request, { params: Promise.resolve({ id: 'chat-a' }) });
  expect(response.status).toBe(409);
  expect((prisma.conversation.updateMany as jest.Mock).mock.calls[0][0].where).toEqual({ id: 'chat-a', userId: user.id, organizationId: user.organizationId, revision: 0 });
});
