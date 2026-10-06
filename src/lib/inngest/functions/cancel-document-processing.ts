import { inngest } from '../client';
import { processingTransition, updateProcessingState } from '@/lib/documents/processing-state';

export const cancelDocumentProcessing = inngest.createFunction(
  { id: 'cancel-document-processing' },
  { event: 'document/process.cancelled' },
  async ({ event, step }) => {
    const { documentId, organizationId, runId } = event.data;
    await step.run('record-cancellation', () => updateProcessingState(documentId, current => {
      // A delayed cancellation for a previous run must never cancel its replacement.
      if ((runId && current.runId !== runId) || current.currentStatus === 'CANCELLED' || !['PROCESSING', 'QUEUED'].includes(current.currentStatus)) return current;
      return processingTransition(current, 'CANCELLED');
    }, organizationId));
    return { success: true, documentId, status: 'CANCELLED' };
  }
);
