import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { analyzeDocument } from './analyze-document';
import { defaultEmbeddingProcessor } from '@/lib/ai/services/document-embedding-processor';
import { assertProcessingRun, processingTransition, updateProcessingDocument } from '@/lib/documents/processing-state';

/** Full processing uses the same durable, truthful analysis pipeline as manual analysis. */
export const processDocumentFull = inngest.createFunction(
  { id: 'process-document-full', name: 'Process Document Full', retries: 3, concurrency: { limit: 5 },
    cancelOn: [{ event: 'document/process.cancelled', if: 'async.data.documentId == event.data.documentId && async.data.organizationId == event.data.organizationId && (!async.data.runId || async.data.runId == event.data.runId)' }],
  },
  { event: 'document/process-full.requested' },
  async ({ event, step }) => {
    const { documentId, organizationId, userId, analysis = {}, options = {} } = event.data;
    const result = await step.invoke('analyze-content', { function: analyzeDocument, data: {
      ...event.data, options: { ...options, deferCompletion: true,
        includeEntityExtraction: analysis.extractEntities !== false,
        includeSecurityAnalysis: analysis.securityAnalysis !== false,
        includeContractAnalysis: analysis.contractAnalysis !== false,
        includeQualityScoring: analysis.qualityScoring !== false,
        includeComplianceCheck: analysis.complianceCheck !== false,
      },
    } });
    const runId = result.runId;
    if (analysis.generateEmbeddings !== false) {
      const embeddings = await step.run('generate-embeddings', async () => {
        const document = await prisma.document.findFirst({ where: { id: documentId, organizationId, deletedAt: null } });
        if (!document) throw new Error('Document not found');
        assertProcessingRun(document.processing, runId);
        const processed = await defaultEmbeddingProcessor.processDocument(document, { forceReprocess: options.forceReprocess });
        if (!processed.success) return { success: false };
        return { success: true };
      });
      if (!embeddings.success) {
        result.success = false; result.unavailableOperations.push('embeddings');
      }
    }
    result.status = result.success ? 'COMPLETED' : 'PARTIAL';
    await step.run('finish-processing', () => updateProcessingDocument(documentId, organizationId, current => ({
      processing: { ...processingTransition(current.processing, result.status), progress: 100, unavailableOperations: result.unavailableOperations },
    }), runId));
    await step.sendEvent('analysis-finished', { name: result.success ? 'document/process-full.completed' : 'document/process-full.partial', data: { organizationId, ...result } });
    if (userId) await step.run('notify-analysis', async () => {
      const user = await prisma.user.findFirst({ where: { id: userId, organizationId, deletedAt: null }, select: { id: true } });
      if (!user) return;
      const document = await prisma.document.findFirst({ where: { id: documentId, organizationId, deletedAt: null }, select: { name: true } });
      if (!document) return;
      await prisma.notification.create({ data: { userId: user.id, organizationId, type: result.success ? 'SUCCESS' : 'WARNING', priority: 'MEDIUM', category: 'GENERAL', title: result.success ? 'Document analysis completed' : 'Document analysis partially completed', message: result.success ? `Analysis completed for "${document.name}".` : `Some analysis steps could not finish for "${document.name}".`, metadata: { documentId, unavailableOperations: result.unavailableOperations }, actionUrl: `/documents/${documentId}` } });
    });
    return result;
  }
);
