import { POST } from '@/app/api/v1/documents/[id]/upload/route';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { inngest } from '@/lib/inngest/client';
import { updateProcessingState } from '@/lib/documents/processing-state';
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/security/document-route-guard', () => ({ guardDocumentMutation: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/billing/usage-guard', () => ({ guardUsage: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/db', () => ({ prisma: { document: { findFirst: jest.fn(), update: jest.fn() }, $transaction: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabaseAdmin: { storage: { getBucket: jest.fn(), from: jest.fn() } } }));
jest.mock('@/lib/inngest/client', () => ({ inngest: { send: jest.fn() } }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { DOCUMENT_PROCESSING: 'DOCUMENT_PROCESSING' } }));
jest.mock('@/lib/file-validation', () => ({ validateFile: () => ({ isValid: true }), getEffectiveMimeType: () => 'text/plain' }));
jest.mock('@/lib/documents/document-response', () => ({ serializeDocument: (document: { id: string; processing: unknown }) => ({ id: document.id, processing: document.processing }) }));
jest.mock('@/lib/documents/processing-state', () => ({ ...jest.requireActual('@/lib/documents/processing-state'), updateProcessingState: jest.fn() }));
const upload = jest.fn(); const remove = jest.fn();
const document = { id: 'doc-a', organizationId: 'tenant-a', filePath: '/documents/editor', processing: { currentStatus: 'PENDING' } };
const params = { params: Promise.resolve({ id: 'doc-a' }) };
const request = () => { const form = new FormData(); form.append('file', new Blob(['Contract'], { type: 'text/plain' }), 'contract.txt'); return new NextRequest('https://example.test/api', { method: 'POST', body: form }); };
beforeEach(() => {
  jest.clearAllMocks(); (getCurrentUser as jest.Mock).mockResolvedValue({ id: 'user-a', organizationId: 'tenant-a' });
  (prisma.document.findFirst as jest.Mock).mockResolvedValue(document);
  (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  (prisma.document.update as jest.Mock).mockImplementation(({ data }: { data: object }) => ({ ...document, ...data }));
  (supabaseAdmin!.storage.getBucket as jest.Mock).mockResolvedValue({ data: { public: false } });
  (supabaseAdmin!.storage.from as jest.Mock).mockReturnValue({ upload, remove });
  upload.mockResolvedValue({}); remove.mockResolvedValue({}); (inngest.send as jest.Mock).mockResolvedValue({});
});
test('attachment queues processing without marking extraction complete', async () => {
  const response = await POST(request(), params);
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ processingStatus: 'QUEUED', processing: { currentStatus: 'QUEUED' } });
  expect(inngest.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'tenant-a', userId: 'user-a' }) }));
  expect(upload.mock.calls[0][0]).toMatch(/^tenant-a\/docs\/doc-a-/);
});
test('public buckets are rejected before uploading private documents', async () => {
  (supabaseAdmin!.storage.getBucket as jest.Mock).mockResolvedValue({ data: { public: true } });
  expect((await POST(request(), params)).status).toBe(503); expect(upload).not.toHaveBeenCalled();
});
test('concurrent file changes reject attachment and remove the staged object', async () => {
  (prisma.document.findFirst as jest.Mock).mockResolvedValueOnce(document).mockResolvedValueOnce({ ...document, filePath: 'tenant-a/docs/existing.txt' });
  expect((await POST(request(), params)).status).toBe(409);
  expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]); expect(inngest.send).not.toHaveBeenCalled();
});
test('queue failures persist a failed run and preserve its attached file for retry', async () => {
  (inngest.send as jest.Mock).mockRejectedValue(new Error('Queue unavailable'));
  expect((await POST(request(), params)).status).toBe(503);
  expect(updateProcessingState).toHaveBeenCalledWith('doc-a', expect.any(Function), 'tenant-a');
  expect(remove).not.toHaveBeenCalled();
});
