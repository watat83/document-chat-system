import { analyzeDocument } from '@/lib/inngest/functions/analyze-document';
import { prisma } from '@/lib/db';
import { documentContentAnalyzer } from '@/lib/ai/services/document-content-analyzer';
import { documentSecurityAnalyzer } from '@/lib/ai/services/document-security-analyzer';
import { updateProcessingDocument } from '@/lib/documents/processing-state';

jest.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: (_config: unknown, _trigger: unknown, handler: unknown) => ({ handler }) } }));
jest.mock('@/lib/db', () => ({ prisma: { document: { findFirst: jest.fn() } } }));
jest.mock('@/lib/ai/document-processor', () => ({ documentProcessor: { extractTextOnly: jest.fn() } }));
jest.mock('@/lib/ai/services/document-sections-analyzer', () => ({ documentSectionsAnalyzer: { analyzeSections: jest.fn().mockResolvedValue({ success: true, sections: [{ title: 'Section', content: 'Original text', type: 'content' }] }) } }));
jest.mock('@/lib/ai/services/document-metadata-analyzer', () => ({ documentMetadataAnalyzer: { analyzeMetadata: jest.fn().mockResolvedValue({ success: true, metadata: { documentType: 'CONTRACT', tags: ['business'] } }) } }));
jest.mock('@/lib/ai/services/document-content-analyzer', () => ({ documentContentAnalyzer: { analyzeContent: jest.fn() } }));
jest.mock('@/lib/ai/services/document-security-analyzer', () => ({ documentSecurityAnalyzer: { analyzeSecurity: jest.fn() } }));
jest.mock('@/lib/ai/services/entity-extractor', () => ({ entityExtractor: { extractEntities: jest.fn().mockResolvedValue({ success: true, entities: [] }), determineProperEntityType: jest.fn() } }));
jest.mock('@/lib/ai/services/contract-analyzer', () => ({ contractAnalyzer: { analyzeContract: jest.fn().mockResolvedValue({ success: true, analysis: { requirements: [] } }) } }));
jest.mock('@/lib/ai/document-scoring', () => ({ DocumentScoringService: { getInstance: jest.fn() } }));
jest.mock('@/lib/documents/processing-state', () => ({ ...jest.requireActual('@/lib/documents/processing-state'), updateProcessingState: jest.fn().mockResolvedValue({ processing: { currentStatus: 'PROCESSING', runId: 'run-a' } }), updateProcessingDocument: jest.fn() }));

const original = { id: 'doc-a', organizationId: 'tenant-a', name: 'Contract', documentType: 'CONTRACT', extractedText: 'Original text', content: { sections: [] }, processing: { currentStatus: 'QUEUED', runId: 'run-a', events: [{ id: 'queued' }] }, analysis: { security: { sensitiveDataDetected: true, classification: 'CONFIDENTIAL' } } };
const handler = (analyzeDocument as unknown as { handler: (context: unknown) => Promise<unknown> }).handler;
const run = (options: Record<string, boolean> = {}) => handler({ event: { data: { documentId: 'doc-a', organizationId: 'tenant-a', runId: 'run-a', options: { includeQualityScoring: false, ...options } } }, step: { run: (_id: string, callback: () => unknown) => callback() } });
let saved: Record<string, any>;
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.document.findFirst as jest.Mock).mockResolvedValue(original);
  (documentContentAnalyzer.analyzeContent as jest.Mock).mockResolvedValue({ success: true, analysis: { summary: 'Actual summary', keyPoints: [] } });
  (documentSecurityAnalyzer.analyzeSecurity as jest.Mock).mockResolvedValue({ success: true, analysis: { classification: 'CONFIDENTIAL', sensitiveDataDetected: true } });
  (updateProcessingDocument as jest.Mock).mockImplementation(async (_id, _org, transform) => { saved = transform(original); return { ...original, ...saved }; });
});

test('analysis stores actual summary and security findings without fabricated scores', async () => {
  await expect(run()).resolves.toEqual(expect.objectContaining({ success: true, status: 'COMPLETED' }));
  expect(saved.summary).toBe('Actual summary');
  expect(saved.analysis.security.sensitiveDataDetected).toBe(true);
  expect(saved.analysis).not.toHaveProperty('confidence');
  expect(saved.analysis).not.toHaveProperty('qualityScore');
  expect(saved.content.sections[0].id).toBeTruthy();
});
test('disabled security analysis preserves previous findings', async () => {
  await run({ includeSecurityAnalysis: false });
  expect(documentSecurityAnalyzer.analyzeSecurity).not.toHaveBeenCalled();
  expect(saved.analysis.security).toEqual(original.analysis.security);
});
test('failed security analysis reports a partial result and preserves previous findings', async () => {
  (documentSecurityAnalyzer.analyzeSecurity as jest.Mock).mockResolvedValue({ success: false, error: 'Provider unavailable' });
  await expect(run()).resolves.toEqual(expect.objectContaining({ success: false, status: 'PARTIAL', unavailableOperations: ['security'] }));
  expect(saved.analysis.security).toEqual(original.analysis.security);
  expect(saved.processing.events.at(-1).success).toBe(false);
});
test('a missing tenant document stops before any AI request', async () => {
  (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
  await expect(run()).rejects.toThrow('Document not found');
  expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: 'doc-a', organizationId: 'tenant-a', deletedAt: null } });
  expect(documentContentAnalyzer.analyzeContent).not.toHaveBeenCalled();
});
test('concurrent text edits prevent old analysis from being stored', async () => {
  (updateProcessingDocument as jest.Mock).mockImplementation(async (_id, _org, transform) => transform({ ...original, extractedText: 'Changed text' }));
  await expect(run()).rejects.toThrow('content changed');
});
