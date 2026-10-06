import { inngest } from "../client";
import { DocumentScoringService } from "@/lib/ai/document-scoring";
import { fileProcessor } from "@/lib/file-processing";
import { prisma } from "@/lib/db";
import { z } from 'zod';

/**
 * Inngest function to score a single document
 * This runs as a background job when triggered by the API
 */
export const scoreDocument = inngest.createFunction(
  {
    id: "score-document",
    name: "Score Document",
    retries: 3,
    concurrency: {
      limit: 5, // Process max 5 documents concurrently
    },
  },
  { event: "document/score.requested" },
  async ({ event, step }) => {
    const { documentId, organizationId, userId, options } = event.data;

    try {
      // Step 1: Fetch document from database
      const document = await step.run("fetch-document", async () => {
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

        return doc;
      });

      // Step 2: Extract content from document
      const extractedContent = await step.run("extract-content", async () => {

        // Use existing extracted text if available, otherwise return empty content
        if (document.extractedText) {
          return {
            success: true,
            content: document.extractedText,
            metadata: {
              fileName: document.name,
              fileSize: 0,
              pageCount: 1,
              processingMethod: 'existing_text' as const,
              extractedAt: new Date()
            }
          };
        }

        throw new Error('No extracted text available for document scoring');
      });

      // Step 3: Score the document
      const scoringResult = await step.run("score-document", async () => {
        const scoringService = new DocumentScoringService();

        const result = await scoringService.scoreDocument({
          content: extractedContent.text,
          metadata: {
            fileName: document.name,
            fileType: document.mimeType,
            fileSize: document.size,
            uploadDate: document.createdAt.toISOString(),
            tags: document.tags || [],
          },
          options: {
            includeRecommendations: options?.includeRecommendations ?? true,
            includeCompliance: options?.includeCompliance ?? true,
            customCriteria: options?.customCriteria,
          },
        });

        return result;
      });

      // Step 4: Update document with scoring results
      await step.run("update-document", async () => {
        // Get current document data
        const currentDoc = await prisma.document.findUnique({
          where: { id: documentId },
          select: { processing: true, analysis: true, content: true }
        });

        const currentProcessing = (currentDoc?.processing as any) || {};
        const currentAnalysis = (currentDoc?.analysis as any) || {};
        const currentContent = (currentDoc?.content as any) || {};

        await prisma.document.update({
          where: { id: documentId },
          data: {
            // Update processing status
            processing: {
              ...currentProcessing,
              currentStatus: 'COMPLETED',
              progress: 100,
              currentStep: 'Scoring Complete',
              estimatedCompletion: null,
              events: [
                ...(currentProcessing.events || []),
                {
                  id: `event_${Date.now()}`,
                  userId: null,
                  event: 'Document Scoring Complete',
                  eventType: 'COMPLETED',
                  success: true,
                  error: null,
                  timestamp: new Date().toISOString(),
                  duration: null,
                  metadata: { overallScore: scoringResult.overallScore }
                }
              ]
            },

            // Update analysis data
            analysis: {
              ...currentAnalysis,
              // Add scoring results to existing analysis
              scoring: {
                qualityScore: scoringResult.overallScore,
                readabilityScore: 7,
                complexityMetrics: { readabilityScore: 7 },
                confidence: scoringResult.confidence,
                suggestions: [],
                scoringResults: scoringResult as any,
                scoredAt: new Date().toISOString()
              }
            },

            // Update content if needed
            content: {
              ...currentContent,
              // Ensure basic content structure exists
              sections: currentContent.sections || [],
              tables: currentContent.tables || [],
              images: currentContent.images || []
            },
            // Keep legacy fields for backward compatibility during transition
            aiProcessingStatus: 'completed',
            aiAnalysis: scoringResult as any,
            scoreValue: scoringResult.overallScore,
            lastProcessedAt: new Date(),
            metadata: {
              ...(document.metadata as any || {}),
              aiScoring: {
                overallScore: scoringResult.overallScore,
                confidence: scoringResult.confidence,
                processedAt: new Date().toISOString(),
              },
            },
          },
        });
      });

      // Step 5: Send completion event
      await step.sendEvent("send-completion-event", {
        name: "document/score.completed",
        data: {
          documentId,
          organizationId,
          score: scoringResult,
          processingTime: Date.now() - new Date(event.ts).getTime(),
        },
      });

      // Step 6: Create notification for user
      await step.run("create-notification", async () => {
        await prisma.notification.create({
          data: {
            organizationId,
            userId,
            type: 'DOCUMENT_SCORED',
            title: 'Document Analysis Complete',
            message: `Analysis completed for "${document.name}" with a score of ${scoringResult.overallScore}`,
            metadata: {
              documentId,
              score: scoringResult.overallScore,
              confidence: scoringResult.confidence,
            },
            priority: 'medium',
            category: 'document',
          },
        });
      });

      return {
        success: true,
        documentId,
        score: scoringResult.overallScore,
        confidence: scoringResult.confidence,
      };

    } catch (error) {
      // Send failure event
      await step.sendEvent("send-failure-event", {
        name: "document/score.failed",
        data: {
          documentId,
          organizationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      // Create error notification
      await step.run("create-error-notification", async () => {
        await prisma.notification.create({
          data: {
            organizationId,
            userId,
            type: 'DOCUMENT_SCORING_FAILED',
            title: 'Document Analysis Failed',
            message: `Failed to analyze document: ${error instanceof Error ? error.message : 'Unknown error'}`,
            metadata: {
              documentId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            priority: 'high',
            category: 'document',
          },
        });
      });

      throw error;
    }
  }
);
