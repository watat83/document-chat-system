import { guardDocumentMutation } from '@/lib/security/document-route-guard';
/**
 * @swagger
 * /api/v1/documents/{id}/vectorize:
 *   post:
 *     summary: Generate embeddings for a specific document
 *     description: Process a document to generate vector embeddings for semantic search using document ID in URL
 *     tags: [Document Processing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to vectorize
 *         example: "doc_123abc"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceReprocess:
 *                 type: boolean
 *                 description: Force reprocessing even if embeddings exist
 *                 default: false
 *               chunkSize:
 *                 type: number
 *                 description: Custom chunk size in tokens
 *                 minimum: 100
 *                 maximum: 2000
 *                 default: 1500
 *               overlap:
 *                 type: number
 *                 description: Custom overlap between chunks in tokens
 *                 minimum: 0
 *                 maximum: 500
 *                 default: 200
 *               useBackgroundJob:
 *                 type: boolean
 *                 description: Process in background using Inngest job queue
 *                 default: false
 *           example:
 *             forceReprocess: true
 *             chunkSize: 1500
 *             overlap: 200
 *             useBackgroundJob: false
 *     responses:
 *       200:
 *         description: Embeddings generated successfully (synchronous)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 embeddings:
 *                   $ref: '#/components/schemas/DocumentEmbeddings'
 *                 stats:
 *                   type: object
 *                   properties:
 *                     chunksCreated:
 *                       type: number
 *                       example: 12
 *                     tokensProcessed:
 *                       type: number
 *                       example: 18450
 *                     costEstimate:
 *                       type: number
 *                       example: 0.000369
 *                     processingTimeMs:
 *                       type: number
 *                       example: 4523
 *       202:
 *         description: Vectorization job queued (asynchronous)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 jobId:
 *                   type: string
 *                   example: "job_vectorize_doc123_20241203"
 *                 message:
 *                   type: string
 *                   example: "Vectorization job queued successfully"
 *                 estimatedCompletion:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-12-03T10:15:30Z"
 *       400:
 *         description: Bad request - invalid options or document not ready
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       409:
 *         description: Document already being vectorized
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { defaultEmbeddingProcessor } from '@/lib/ai/services/document-embedding-processor'
import { inngest } from '@/lib/inngest/client'
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking'

const VectorizeRequestSchema = z.object({
  forceReprocess: z.boolean().optional().default(false)
    .describe('Force reprocessing even if embeddings exist'),
  chunkSize: z.number().min(100).max(2000).optional()
    .describe('Custom chunk size in tokens (100-2000)'),
  overlap: z.number().min(0).max(500).optional()
    .describe('Custom overlap between chunks in tokens (0-500)'),
  useBackgroundJob: z.boolean().optional().default(false)
    .describe('Process in background using Inngest job queue')
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const permissionError = await guardDocumentMutation((await params).id, 'WRITE');
  if (permissionError) return permissionError;

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const documentId = resolvedParams.id

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      )
    }

    // Parse and validate request
    const body = await request.json().catch(() => ({}))
    const validation = VectorizeRequestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid request data', 
          details: validation.error.format() 
        },
        { status: 400 }
      )
    }

    const options = validation.data

    console.log('🚀 Document Vectorization Request:', {
      documentId,
      options,
      userId
    })

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Get document and verify access
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: user.organizationId,
        deletedAt: null
      }
    })

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Check if document has extracted text
    if (!document.extractedText || document.extractedText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Document has no extracted text. Please process the document first.' },
        { status: 400 }
      )
    }

    // Check if embeddings already exist (unless forcing reprocess)
    if (!options.forceReprocess && document.embeddings && Object.keys(document.embeddings).length > 0) {
      console.log('✅ Document already has embeddings, skipping vectorization')
      const embeddings = document.embeddings as any
      return NextResponse.json({
        success: true,
        message: 'Document already vectorized',
        embeddings: {
          chunkCount: embeddings?.chunks?.length || 0,
          lastVectorized: document.updatedAt,
          hasEmbeddings: true
        }
      })
    }

    // Check if already being vectorized
    const processing = document.processing as any
    if (processing?.currentStatus === 'VECTORIZING' && !options.forceReprocess) {
      return NextResponse.json(
        { error: 'Document is already being vectorized' },
        { status: 409 }
      )
    }

    // Route to background job or synchronous processing
    if (options.useBackgroundJob) {
      // Check if Inngest is configured
      const inngestConfigured = process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY

      if (!inngestConfigured) {
        console.warn('⚠️ Background job requested but Inngest not configured, falling back to synchronous processing')
        return NextResponse.json(
          {
            error: 'Background processing not available. Inngest API keys not configured.',
            suggestion: 'Try processing without the background job option, or configure INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY in your environment variables.'
          },
          { status: 503 }
        )
      }

      // Queue Inngest background job
      console.log('📋 Queueing vectorization background job...')

      const jobId = `vectorize_${documentId}_${Date.now()}`

      try {
        // Send event to Inngest
        await inngest.send({
          name: "document/vectorize.requested",
          data: {
            documentId,
            organizationId: user.organizationId,
            userId: user.id,
            jobId,
            options: {
              forceReprocess: options.forceReprocess,
              chunkSize: options.chunkSize,
              overlap: options.overlap
            }
          }
        })
      } catch (inngestError) {
        console.error('Inngest error:', inngestError)
        return NextResponse.json(
          {
            error: 'Failed to queue background job',
            details: inngestError instanceof Error ? inngestError.message : 'Unknown error'
          },
          { status: 500 }
        )
      }

      // Update document status to indicate queued vectorization
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processing: {
            ...processing,
            currentStatus: 'VECTORIZING',
            progress: 0,
            startedAt: new Date(),
            events: [
              ...(processing?.events || []),
              {
                id: `evt_${Date.now()}_vectorize_queued`,
                eventType: 'QUEUED',
                status: 'VECTORIZING',
                message: 'Vectorization job queued',
                timestamp: new Date().toISOString(),
                success: true,
                metadata: { jobId, useBackgroundJob: true }
              }
            ]
          },
          updatedAt: new Date()
        }
      })

      console.log('✅ Vectorization job queued successfully:', jobId)

      // Track usage for background vectorization
      try {
        await UsageTrackingService.trackUsage({
          organizationId: user.organizationId,
          usageType: UsageType.DOCUMENT_PROCESSING,
          quantity: 1,
          resourceId: documentId,
          resourceType: 'document_vectorization_background',
          metadata: {
            fileName: document.name,
            processingType: 'vectorize_background',
            jobId: jobId,
            options: {
              forceReprocess: options.forceReprocess,
              chunkSize: options.chunkSize,
              overlap: options.overlap
            },
            hasExistingEmbeddings: !!(document.embeddings && Object.keys(document.embeddings).length > 0),
            extractedTextLength: document.extractedText?.length || 0
          }
        })
        console.log('📊 Background vectorization usage tracked successfully')
      } catch (trackingError) {
        console.error('Failed to track background vectorization usage:', trackingError)
        // Don't fail the request if tracking fails
      }

      return NextResponse.json({
        success: true,
        jobId,
        message: 'Vectorization job queued successfully',
        estimatedCompletion: new Date(Date.now() + 2 * 60 * 1000).toISOString() // 2 minutes estimate
      }, { status: 202 })

    } else {
      // Process synchronously
      console.log('⚡ Processing vectorization synchronously...')
      
      // Update status to indicate processing started
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processing: {
            ...processing,
            currentStatus: 'VECTORIZING',
            progress: 0,
            startedAt: new Date(),
            events: [
              ...(processing?.events || []),
              {
                id: `evt_${Date.now()}_vectorize_started`,
                eventType: 'STARTED',
                status: 'VECTORIZING',
                message: 'Synchronous vectorization started',
                timestamp: new Date().toISOString(),
                success: true,
                metadata: { useBackgroundJob: false }
              }
            ]
          },
          updatedAt: new Date()
        }
      })

      // Process embeddings
      const result = await defaultEmbeddingProcessor.processDocument(
        document as any,
        {
          forceReprocess: options.forceReprocess,
          chunkSize: options.chunkSize,
          overlap: options.overlap
        }
      )

      // Update final status
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processing: {
            ...processing,
            currentStatus: result.success ? 'COMPLETED' : 'FAILED',
            progress: 100,
            completedAt: new Date(),
            events: [
              ...(processing?.events || []),
              {
                id: `evt_${Date.now()}_vectorize_${result.success ? 'completed' : 'failed'}`,
                eventType: result.success ? 'COMPLETED' : 'FAILED',
                status: result.success ? 'COMPLETED' : 'FAILED',
                message: result.success 
                  ? `Vectorization completed: ${result.stats.chunksCreated} chunks` 
                  : `Vectorization failed: ${result.error}`,
                timestamp: new Date().toISOString(),
                success: result.success,
                metadata: { 
                  useBackgroundJob: false,
                  stats: result.stats
                }
              }
            ]
          },
          updatedAt: new Date()
        }
      })

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Vectorization failed' },
          { status: 500 }
        )
      }

      console.log('✅ Synchronous vectorization completed')

      // Track usage for synchronous vectorization
      try {
        await UsageTrackingService.trackUsage({
          organizationId: user.organizationId,
          usageType: UsageType.DOCUMENT_PROCESSING,
          quantity: 1,
          resourceId: documentId,
          resourceType: 'document_vectorization_sync',
          metadata: {
            fileName: document.name,
            processingType: 'vectorize_synchronous',
            options: {
              forceReprocess: options.forceReprocess,
              chunkSize: options.chunkSize,
              overlap: options.overlap
            },
            hasExistingEmbeddings: !!(document.embeddings && Object.keys(document.embeddings).length > 0),
            extractedTextLength: document.extractedText?.length || 0,
            chunksCreated: result.stats?.chunksCreated || 0,
            tokensProcessed: result.stats?.tokensProcessed || 0,
            costEstimate: result.stats?.costEstimate || 0,
            processingTimeMs: result.processingTimeMs || 0
          }
        })
        console.log('📊 Synchronous vectorization usage tracked successfully')
      } catch (trackingError) {
        console.error('Failed to track synchronous vectorization usage:', trackingError)
        // Don't fail the request if tracking fails
      }

      return NextResponse.json({
        success: true,
        embeddings: result.embeddings,
        stats: {
          ...result.stats,
          processingTimeMs: result.processingTimeMs
        }
      })
    }

  } catch (error) {
    console.error('Vectorization error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}