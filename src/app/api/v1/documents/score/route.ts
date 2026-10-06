import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { processingSnapshot, processingTransition, updateProcessingState, ProcessingConflictError } from '@/lib/documents/processing-state';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DocumentScoringService } from '@/lib/ai/document-scoring'
import { DocumentProcessingRequest } from '@/types/document-processing'
import { inngest } from '@/lib/inngest/client'

const scoreSchema = z.object({
  documentId: z.string().min(1).describe("Unique identifier of the document to score"),
  organizationId: z.string().min(1).describe("Organization identifier for access control"),
  options: z.object({
    performScoring: z.boolean().default(true).describe("Whether to perform AI scoring"),
    performAnalysis: z.boolean().default(true).describe("Whether to perform content analysis"),
    scoringWeights: z.object({
      relevance: z.number().min(0).max(1).default(0.3),
      compliance: z.number().min(0).max(1).default(0.25),
      completeness: z.number().min(0).max(1).default(0.2),
      technicalMerit: z.number().min(0).max(1).default(0.15),
      riskAssessment: z.number().min(0).max(1).default(0.1)
    }).optional(),
    aiProvider: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high']).default('normal')
  }).optional()
})

/**
 * @swagger
 * /api/v1/documents/score:
 *   post:
 *     summary: Score document with AI-powered analysis
 *     description: |
 *       Score and analyze documents using advanced AI models to evaluate:
 *       - Relevance to government contracting opportunities
 *       - Compliance with regulations and requirements
 *       - Document completeness and quality
 *       - Technical merit and feasibility
 *       - Risk assessment and mitigation
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *               - organizationId
 *             properties:
 *               documentId:
 *                 type: string
 *                 description: Document identifier to score
 *                 example: "doc_123abc"
 *               organizationId:
 *                 type: string
 *                 description: Organization identifier
 *                 example: "org_456def"
 *               options:
 *                 type: object
 *                 properties:
 *                   performScoring:
 *                     type: boolean
 *                     default: true
 *                     description: Enable AI scoring analysis
 *                   performAnalysis:
 *                     type: boolean
 *                     default: true
 *                     description: Enable detailed content analysis
 *                   scoringWeights:
 *                     type: object
 *                     description: Custom scoring weights (must sum to 1.0)
 *                     properties:
 *                       relevance:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                         default: 0.3
 *                       compliance:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                         default: 0.25
 *                       completeness:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                         default: 0.2
 *                       technicalMerit:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                         default: 0.15
 *                       riskAssessment:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                         default: 0.1
 *                   aiProvider:
 *                     type: string
 *                     description: Specific AI provider to use
 *                   priority:
 *                     type: string
 *                     enum: [low, normal, high]
 *                     default: normal
 *     responses:
 *       200:
 *         description: Document scored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documentId:
 *                   type: string
 *                 score:
 *                   type: object
 *                   properties:
 *                     overallScore:
 *                       type: number
 *                       minimum: 0
 *                       maximum: 100
 *                     criteria:
 *                       type: object
 *                       properties:
 *                         relevance:
 *                           type: number
 *                         compliance:
 *                           type: number
 *                         completeness:
 *                           type: number
 *                         technicalMerit:
 *                           type: number
 *                         riskAssessment:
 *                           type: number
 *                     confidence:
 *                       type: number
 *                       minimum: 0
 *                       maximum: 1
 *                 analysis:
 *                   type: object
 *                   properties:
 *                     keyTerms:
 *                       type: array
 *                       items:
 *                         type: string
 *                     requirements:
 *                       type: array
 *                       items:
 *                         type: string
 *                     opportunities:
 *                       type: array
 *                       items:
 *                         type: string
 *                     risks:
 *                       type: array
 *                       items:
 *                         type: string
 *                     summary:
 *                       type: string
 *                 processingTimeMs:
 *                   type: number
 *                 status:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Document not found
 *       500:
 *         description: Scoring failed
 */
export async function POST(request: NextRequest) {
  let activeDocumentId: string | undefined;
  let runId: string | undefined;
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validation = scoreSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.format() },
        { status: 400 }
      )
    }

    const { documentId, organizationId, options } = validation.data

    // Get internal user ID from Clerk ID
    const user = await prisma.user.findFirst({
      where: {
        clerkId: userId,
        organizationId
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Access denied to organization' },
        { status: 403 }
      );
    }

    // Verify user access to document
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId,
        deletedAt: null
      }
    })

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      )
    }

    const denied = await guardDocumentMutation(documentId, 'WRITE');
    if (denied) return denied;

    // Ensure document has text available
    if (!document.extractedText?.trim()) {
      return NextResponse.json(
        { error: 'Document must be processed before scoring' },
        { status: 400 }
      )
    }

    const usageError = await guardUsage(organizationId, UsageType.DOCUMENT_PROCESSING);
    if (usageError) return usageError;
    const queued = await updateProcessingState(documentId, current => {
      if (['PROCESSING', 'QUEUED'].includes(current.currentStatus)) throw new ProcessingConflictError();
      return processingTransition(current, 'QUEUED');
    }, organizationId);
    activeDocumentId = documentId;
    runId = processingSnapshot(queued.processing).runId ?? undefined;

    // Trigger Inngest background job for document scoring
    const { ids } = await inngest.send({
      name: "document/score.requested",
      data: {
        documentId,
        organizationId,
        userId: user.id,
        runId,
        options: {
          includeRecommendations: options?.performAnalysis ?? true,
          includeCompliance: options?.performAnalysis ?? true,
          customCriteria: options?.scoringWeights,
        }
      }
    })

    return NextResponse.json({
      documentId,
      status: 'QUEUED',
      message: 'Document scoring job queued successfully',
      trackingUrl: `/api/v1/documents/${documentId}/process`,
      inngestEventIds: ids,
      queuedAt: new Date().toISOString()
    }, { status: 202 })

  } catch (error) {
    if (error instanceof ProcessingConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (activeDocumentId && runId) await updateProcessingState(activeDocumentId, current => current.runId !== runId || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', 'Unable to queue scoring')).catch(() => undefined);
    console.error('Document scoring error:', error)
    return NextResponse.json(
      {
        error: 'Scoring failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
