import { processingTransition, updateProcessingState, assertProcessingRun } from '@/lib/documents/processing-state';
import { inngest } from "../client";
import { documentProcessor } from "@/lib/ai/document-processor";
import { prisma } from "@/lib/db";

/**
 * Inngest function for basic document processing (text extraction + sections only)
 * This runs as a background job when documents are uploaded
 */
export const processDocumentBasic = inngest.createFunction(
  {
    id: "process-document-basic",
    name: "Process Document Basic",
    retries: 3,
    cancelOn: [{ event: 'document/process.cancelled', if: 'async.data.documentId == event.data.documentId && async.data.organizationId == event.data.organizationId && (!async.data.runId || async.data.runId == event.data.runId)' }],
    concurrency: {
      limit: 5, // Process max 5 documents concurrently (plan limit)
    },
  },
  { event: "document/process-basic.requested" },
  async ({ event, step }) => {
    const { documentId, organizationId, userId, options, runId } = event.data;
    const startTime = Date.now();
    let documentName = 'document';

    try {
      // Step 1: Verify document exists and update status
      const document = await step.run("fetch-and-update-document", async () => {
        const doc = await prisma.document.findUnique({
          where: {
            id: documentId,
            organizationId: organizationId,
          },
          include: {
            organization: true,
          },
        });

        if (!doc) {
          throw new Error(`Document ${documentId} not found`);
        }

        // Update status to processing
        await updateProcessingState(documentId, current => { assertProcessingRun(current, runId); return processingTransition(current, 'PROCESSING'); }, organizationId);

        return doc;
      });

      documentName = document.name;

      // Step 2: Process document with basic AI analysis
      const processingResult = await step.run("process-basic-content", async () => {
        const result = await documentProcessor.processDocumentBasic(
          documentId,
          (step: string, progress: number) => {
            console.log(`📊 Basic Processing [${documentId}]: ${step} - ${progress}%`);
          },
          runId
        );

        if (!result.success) {
          throw new Error(result.error || 'Basic processing failed');
        }

        return result;
      });

      // Step 3: Send completion event
      await step.sendEvent("send-completion-event", {
        name: "document/process-basic.completed",
        data: {
          documentId,
          organizationId,
          processingTime: Date.now() - startTime,
          extractedText: processingResult.aiData?.content.extractedText || '',
          sectionsCount: processingResult.aiData?.structure.sections.length || 0,
        },
      });

      // Step 4: Create notification if user is specified
      if (userId) {
        await step.run("create-notification", async () => {
          await prisma.notification.create({
            data: {
              organizationId,
              userId,
              type: 'SUCCESS',
              title: 'Document Upload Complete',
              message: `"${document.name}" has been processed and is ready for review`,
              metadata: {
                documentId,
                processingType: 'basic',
                sectionsCount: processingResult.aiData?.structure.sections.length || 0,
              },
              priority: 'LOW',
              category: 'GENERAL',
            },
          });
        });
      }

      return {
        success: true,
        documentId,
        processingType: 'basic',
        sectionsExtracted: processingResult.aiData?.structure.sections.length || 0,
        processingTime: Date.now() - startTime,
      };

    } catch (error) {
      console.error(`❌ Basic processing failed for document ${documentId}:`, error);

      // Update document status to failed
      await step.run("update-document-failed", async () => {
        await updateProcessingState(documentId, current => (runId && current.runId !== runId) || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', error instanceof Error ? error.message : 'Processing failed'), organizationId);
      });

      // Send failure event
      await step.sendEvent("send-failure-event", {
        name: "document/process-basic.failed",
        data: {
          documentId,
          organizationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      // Create error notification if user is specified
      if (userId) {
        await step.run("create-error-notification", async () => {
          await prisma.notification.create({
            data: {
              organizationId,
              userId,
              type: 'WARNING',
              title: 'Document Processing Failed',
              message: `Failed to process "${documentName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
              metadata: {
                documentId,
                processingType: 'basic',
                error: error instanceof Error ? error.message : 'Unknown error',
              },
              priority: 'HIGH',
              category: 'GENERAL',
            },
          });
        });
      }

      throw error;
    }
  }
);
