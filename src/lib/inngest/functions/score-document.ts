import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { DocumentScoringService } from '@/lib/ai/document-scoring';
import { assertProcessingRun, jsonObject, processingSnapshot, processingTransition, updateProcessingDocument, updateProcessingState } from '@/lib/documents/processing-state';

export const scoreDocument = inngest.createFunction(
  { id: 'score-document', name: 'Score Document', retries: 3, concurrency: { limit: 5 },
    cancelOn: [{ event: 'document/process.cancelled', if: 'async.data.documentId == event.data.documentId && async.data.organizationId == event.data.organizationId && (!async.data.runId || async.data.runId == event.data.runId)' }],
  },
  { event: 'document/score.requested' },
  async ({ event, step }) => {
    const { documentId, organizationId, options = {}, runId: requestedRunId } = event.data;
    let runId: string | undefined = requestedRunId;
    try {
      const document = await step.run('fetch-document', async () => {
        const current = await prisma.document.findFirst({ where: { id: documentId, organizationId, deletedAt: null } });
        if (!current?.extractedText?.trim()) throw new Error('Document text unavailable');
        const started = await updateProcessingState(documentId, state => { assertProcessingRun(state, requestedRunId); return processingTransition(state, 'PROCESSING'); }, organizationId);
        return { ...current, processing: started.processing };
      });
      runId = processingSnapshot(document.processing).runId ?? undefined;
      const score = await step.run('score-document', () => DocumentScoringService.getInstance().scoreDocument({ content: document.extractedText!, title: document.name, documentType: document.documentType }, { weights: options.customCriteria, includeAnalysis: options.includeRecommendations, documentType: document.documentType, organizationId }));
      await step.run('save-score', () => updateProcessingDocument(documentId, organizationId, current => {
        if (current.extractedText !== document.extractedText) throw new Error('Document text changed during scoring');
        return { analysis: JSON.parse(JSON.stringify({ ...jsonObject(current.analysis), scoring: { ...score, assessedAt: new Date().toISOString() } })), processing: processingTransition(current.processing, 'COMPLETED') };
      }, runId));
      await step.sendEvent('score-completed', { name: 'document/score.completed', data: { documentId, organizationId, score } });
      return { success: true, documentId, score };
    } catch (error) {
      if (runId) await updateProcessingState(documentId, current => current.runId !== runId || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', 'Scoring failed'), organizationId);
      throw error;
    }
  }
);
