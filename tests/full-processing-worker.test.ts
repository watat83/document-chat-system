import { processDocumentFull } from '@/lib/inngest/functions/process-document-full';
import { prisma } from '@/lib/db';
import { defaultEmbeddingProcessor } from '@/lib/ai/services/document-embedding-processor';
import { updateProcessingDocument } from '@/lib/documents/processing-state';

jest.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: (_config: unknown, _trigger: unknown, handler: unknown) => ({ handler }) } }));
jest.mock('@/lib/inngest/functions/analyze-document', () => ({ analyzeDocument: {} }));
jest.mock('@/lib/db', () => ({ prisma: { document: { findFirst: jest.fn() }, user: { findFirst: jest.fn().mockResolvedValue(null) }, notification: { create: jest.fn() } } }));
jest.mock('@/lib/ai/services/document-embedding-processor', () => ({ defaultEmbeddingProcessor: { processDocument: jest.fn() } }));
jest.mock('@/lib/documents/processing-state', () => ({ ...jest.requireActual('@/lib/documents/processing-state'), updateProcessingDocument: jest.fn() }));
const handler = (processDocumentFull as unknown as { handler: (context: unknown) => Promise<any> }).handler;
const document = { id: 'doc-a', organizationId: 'tenant-a', processing: { runId: 'run-a', currentStatus: 'PROCESSING' } };
const invoke = jest.fn();
const sendEvent = jest.fn();
const run = (analysis = {}) => handler({ event: { data: { documentId: 'doc-a', organizationId: 'tenant-a', runId: 'run-a', options: {}, analysis } }, step: { invoke, sendEvent, run: (_id: string, callback: () => unknown) => callback() } });
let saved: any;
beforeEach(() => {
  jest.clearAllMocks();
  invoke.mockResolvedValue({ success: true, documentId: 'doc-a', runId: 'run-a', status: 'PROCESSING', unavailableOperations: [] });
  (prisma.document.findFirst as jest.Mock).mockResolvedValue(document);
  (defaultEmbeddingProcessor.processDocument as jest.Mock).mockResolvedValue({ success: true });
  (updateProcessingDocument as jest.Mock).mockImplementation(async (_id, _org, transform) => { saved = transform(document); return { ...document, ...saved }; });
});
test('full processing forwards selected flags and finishes only after indexing', async () => {
  const result = await run({ securityAnalysis: false, complianceCheck: false });
  expect(invoke.mock.calls[0][1].data.options).toEqual(expect.objectContaining({ deferCompletion: true, includeSecurityAnalysis: false, includeComplianceCheck: false }));
  expect(defaultEmbeddingProcessor.processDocument).toHaveBeenCalledWith(document, { forceReprocess: undefined });
  expect(result.status).toBe('COMPLETED');
  expect(saved.processing.currentStatus).toBe('COMPLETED');
  expect(sendEvent).toHaveBeenCalledWith('analysis-finished', expect.objectContaining({ name: 'document/process-full.completed' }));
});
test('disabled embeddings never invoke the vector provider', async () => {
  await run({ generateEmbeddings: false });
  expect(defaultEmbeddingProcessor.processDocument).not.toHaveBeenCalled();
});
test('failed embeddings are reported as partial rather than complete', async () => {
  (defaultEmbeddingProcessor.processDocument as jest.Mock).mockResolvedValue({ success: false });
  expect(await run()).toEqual(expect.objectContaining({ success: false, status: 'PARTIAL', unavailableOperations: ['embeddings'] }));
  expect(saved.processing.currentStatus).toBe('PARTIAL');
});
test('a superseded run stops before indexing or completion notifications', async () => {
  (prisma.document.findFirst as jest.Mock).mockResolvedValue({ ...document, processing: { ...document.processing, runId: 'run-b' } });
  await expect(run()).rejects.toThrow(/superseded/);
  expect(defaultEmbeddingProcessor.processDocument).not.toHaveBeenCalled();
  expect(sendEvent).not.toHaveBeenCalled();
});
