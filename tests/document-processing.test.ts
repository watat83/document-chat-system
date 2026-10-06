import { POST } from '@/app/api/v1/documents/process/route';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { downloadFileWithFallback } from '@/lib/storage/path-utils';
import { NextRequest } from 'next/server';

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }));
jest.mock('@/lib/db', () => ({ prisma: { user: { findFirst: jest.fn() }, document: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() }, $transaction: jest.fn() } }));
jest.mock('@/lib/ai/ai-service-manager', () => ({ AIServiceManager: { getInstance: jest.fn() } }));
jest.mock('@/lib/storage/path-utils', () => ({ downloadFileWithFallback: jest.fn() }));
jest.mock('@/lib/billing/usage-guard', () => ({ guardUsage: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { DOCUMENT_PROCESSING: 'DOCUMENT_PROCESSING', AI_QUERY: 'AI_QUERY' } }));
jest.mock('@/lib/security/access-policy', () => ({ canAccessDocument: jest.fn().mockReturnValue(true) }));
jest.mock('@/lib/documents/document-response', () => ({ serializeDocument: (document: unknown) => document }));
jest.mock('@/lib/documents/processing-state', () => ({ ...jest.requireActual('@/lib/documents/processing-state'), updateProcessingState: jest.fn().mockResolvedValue({}) }));
const processDocument = jest.fn();
const document = { id: 'doc-a', organizationId: 'tenant-a', name: 'Document', filePath: 'private/doc', mimeType: 'text/plain', extractedText: 'original text', summary: '', processing: { currentStatus: 'PENDING' }, analysis: { security: { classification: 'INTERNAL' } } };
const request = (body: unknown) => new NextRequest('https://example.test/api/v1/documents/process', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  jest.clearAllMocks();
  (auth as unknown as jest.Mock).mockResolvedValue({ userId: 'clerk-a' });
  (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-a', organizationId: 'tenant-a' });
  (prisma.document.findFirst as jest.Mock).mockResolvedValue(document);
  (prisma.document.findUnique as jest.Mock).mockResolvedValue(document);
  (prisma.document.update as jest.Mock).mockResolvedValue(document);
  (prisma.$transaction as jest.Mock).mockImplementation(async callback => callback(prisma));
  (downloadFileWithFallback as jest.Mock).mockResolvedValue({ data: new Blob(['original text']), error: null });
  (AIServiceManager.getInstance as jest.Mock).mockReturnValue({ initialize: jest.fn(), getOpenRouterAdapter: () => ({ processDocument }) });
  processDocument.mockResolvedValue({ extractedText: 'Actual summary', metadata: { provider: 'openrouter', model: 'chosen' } });
});
test('unauthenticated processing never touches a provider', async () => {
  (auth as unknown as jest.Mock).mockResolvedValue({ userId: null });
  expect((await POST(request({ documentId: 'doc-a' }))).status).toBe(401);
  expect(processDocument).not.toHaveBeenCalled();
});
test('foreign organization assertions fail before downloading the file', async () => {
  expect((await POST(request({ documentId: 'doc-a', organizationId: 'tenant-b' }))).status).toBe(403);
  expect(downloadFileWithFallback).not.toHaveBeenCalled();
});
test('summarization preserves extracted text and existing security findings', async () => {
  expect((await POST(request({ documentId: 'doc-a', operation: 'summary' }))).status).toBe(200);
  const data = (prisma.document.update as jest.Mock).mock.calls[0][0].data;
  expect(data).toEqual(expect.objectContaining({ summary: 'Actual summary', analysis: expect.objectContaining({ security: document.analysis.security, processingResults: expect.objectContaining({ summary: expect.objectContaining({ content: 'Actual summary' }) }) }) }));
  expect(data).not.toHaveProperty('extractedText');
  expect(data).not.toHaveProperty('entities');
  expect(data.analysis).not.toHaveProperty('compliance');
});
test('provider errors never persist fabricated processing results', async () => {
  processDocument.mockRejectedValue(new Error('Provider failed'));
  expect((await POST(request({ documentId: 'doc-a' }))).status).toBe(503);
  expect(prisma.document.update).not.toHaveBeenCalled();
});
test('a late provider result cannot overwrite a cancelled document', async () => {
  (prisma.document.findFirst as jest.Mock).mockResolvedValueOnce(document).mockResolvedValueOnce({ ...document, processing: { currentStatus: 'CANCELLED' } });
  expect((await POST(request({ documentId: 'doc-a' }))).status).toBe(503);
  expect(prisma.document.update).not.toHaveBeenCalled();
});
