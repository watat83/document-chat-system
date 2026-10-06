import { inngest } from '../client'
import { prisma } from '@/lib/prisma'
import { defaultEmbeddingProcessor } from '@/lib/ai/services/document-embedding-processor'

export const vectorizeDocument = inngest.createFunction(
  { 
    id: 'vectorize-document',
    name: 'Vectorize Document with Progress Tracking',
    concurrency: 3, // Limit concurrent embeddings to avoid rate limits
    onFailure: async ({ event, error }) => {
      console.error('❌ [INNGEST] Vectorization function failed:', error)
      
      // Send failure event
      await inngest.send({
        name: 'document/vectorize.failed',
        data: {
          documentId: event.data.event.data.documentId,
          organizationId: event.data.event.data.organizationId,
          jobId: event.data.event.data.jobId,
          error: error.message || 'Unknown error'
        }
      })
    }
  },
  { event: 'document/vectorize.requested' },
  async ({ event, step }) => {
    try {
      const { documentId, organizationId, userId, jobId, options = {} } = event.data
      const startTime = Date.now()

      console.log('🚀 [INNGEST] Starting vectorization job:', {
        documentId,
        organizationId,
        userId,
        jobId,
        options
      })

    // Step 1: Validate and fetch document
    const document = await step.run('fetch-document', async () => {
      console.log('📄 [INNGEST] Fetching document...')
      
      const doc = await prisma.document.findFirst({
        where: {
          id: documentId,
          organizationId,
          deletedAt: null
        }
      })

      if (!doc) {
        throw new Error(`Document not found: ${documentId}`)
      }

      if (!doc.extractedText || doc.extractedText.trim().length === 0) {
        throw new Error('Document has no extracted text to vectorize')
      }

      // Send progress update
      await inngest.send({
        name: 'document/vectorize.progress',
        data: {
          documentId,
          organizationId,
          jobId,
          progress: 10,
          currentStep: 'Document loaded, starting chunking...'
        }
      })

      return doc
    })

    // Step 2: Process embeddings with progress tracking
    const result = await step.run('process-embeddings', async () => {
      try {
        console.log('🧮 [INNGEST] Processing embeddings...')

        // Update document status
        const processing = (await prisma.document.findUnique({ where: { id: documentId }, select: { processing: true } }))?.processing as any || {}
        await prisma.document.update({
          where: { id: documentId },
          data: {
            processing: {
              ...processing,
              currentStatus: 'VECTORIZING',
              progress: 20,
              events: [
                ...(processing.events || []),
                {
                  id: `evt_${Date.now()}_vectorize_processing`,
                  eventType: 'PROCESSING',
                  status: 'VECTORIZING',
                  message: 'Background vectorization processing started',
                  timestamp: new Date().toISOString(),
                  success: true,
                  metadata: { jobId, step: 'processing-embeddings' }
                }
              ]
            },
            updatedAt: new Date()
          }
        })

      // Send progress update
      await inngest.send({
        name: 'document/vectorize.progress',
        data: {
          documentId,
          organizationId,
          jobId,
          progress: 30,
          currentStep: 'Chunking document text...'
        }
      })

      // Create custom embedding processor with progress callbacks
      const progressCallback = async (step: string, progress: number, chunksProcessed?: number, totalChunks?: number) => {
        console.log(`📊 [INNGEST] Progress: ${step} - ${progress}% (${chunksProcessed}/${totalChunks} chunks)`)
        
        // Update database
        const currentProcessing = (await prisma.document.findUnique({
          where: { id: documentId },
          select: { processing: true }
        }))?.processing as any || {}

        // Don't double-scale progress - EmbeddingService already provides 30-100% range
        const finalProgress = Math.min(progress, 100)
        
        await prisma.document.update({
          where: { id: documentId },
          data: {
            processing: {
              ...currentProcessing,
              progress: finalProgress,
              currentStep: step,
              events: [
                ...(currentProcessing.events || []),
                {
                  id: `evt_${Date.now()}_vectorize_progress`,
                  eventType: 'PROGRESS',
                  status: 'VECTORIZING',
                  message: step,
                  timestamp: new Date().toISOString(),
                  success: true,
                  metadata: { 
                    jobId, 
                    progress: finalProgress,
                    chunksProcessed,
                    totalChunks
                  }
                }
              ]
            },
            updatedAt: new Date()
          }
        })

        // Send progress event
        await inngest.send({
          name: 'document/vectorize.progress',
          data: {
            documentId,
            organizationId,
            jobId,
            progress: finalProgress,
            currentStep: step,
            chunksProcessed,
            totalChunks
          }
        })
      }

      // Process with progress tracking
      const embeddingResult = await defaultEmbeddingProcessor.processDocument(
        document as any,
        {
          forceReprocess: options.forceReprocess,
          chunkSize: options.chunkSize,
          overlap: options.overlap,
          progressCallback
        }
      )

      if (!embeddingResult.success) {
        throw new Error(embeddingResult.error || 'Embedding processing failed')
      }

        console.log('✅ [INNGEST] Embedding processing completed:', embeddingResult.stats)
        return embeddingResult
      } catch (error) {
        console.error('❌ [INNGEST] Embedding processing error:', error)
        
        // Update document with error status
        const currentProcessing = (await prisma.document.findUnique({
          where: { id: documentId },
          select: { processing: true }
        }))?.processing as any || {}
        
        await prisma.document.update({
          where: { id: documentId },
          data: {
            processing: {
              ...currentProcessing,
              currentStatus: 'FAILED',
              progress: 0,
              error: error instanceof Error ? error.message : 'Unknown error',
              failedAt: new Date(),
              events: [
                ...(currentProcessing.events || []),
                {
                  id: `evt_${Date.now()}_vectorize_failed`,
                  eventType: 'FAILED',
                  status: 'FAILED',
                  message: `Background vectorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  timestamp: new Date().toISOString(),
                  success: false,
                  metadata: { jobId, error: error instanceof Error ? error.message : 'Unknown error' }
                }
              ]
            },
            updatedAt: new Date()
          }
        })
        
        throw error // Re-throw to trigger Inngest failure handling
      }
    })

    // Step 3: Finalize and send completion event
    await step.run('finalize-vectorization', async () => {
      console.log('🏁 [INNGEST] Finalizing vectorization...')
      
      const processingTime = Date.now() - startTime
      const processing = (await prisma.document.findUnique({ where: { id: documentId }, select: { processing: true } }))?.processing as any || {}

      // Update final document status
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processing: {
            ...processing,
            currentStatus: 'COMPLETED',
            progress: 100,
            completedAt: new Date(),
            events: [
              ...(processing.events || []),
              {
                id: `evt_${Date.now()}_vectorize_background_completed`,
                eventType: 'COMPLETED',
                status: 'COMPLETED',
                message: `Vectorization completed: ${result.stats.chunksCreated} chunks, ${Math.round(result.stats.tokensProcessed / 1000)}k tokens`,
                timestamp: new Date().toISOString(),
                success: true,
                metadata: { 
                  jobId, 
                  stats: result.stats,
                  processingTimeMs: processingTime,
                  backgroundJob: true
                }
              }
            ]
          },
          updatedAt: new Date()
        }
      })

      // Send completion event
      await inngest.send({
        name: 'document/vectorize.completed',
        data: {
          documentId,
          organizationId,
          jobId,
          processingTime: processingTime,
          chunksCreated: result.stats.chunksCreated,
          tokensProcessed: result.stats.tokensProcessed,
          costEstimate: result.stats.costEstimate
        }
      })

      console.log('✅ [INNGEST] Vectorization job completed successfully')
      
      return {
        success: true,
        jobId,
        processingTime,
        stats: result.stats
      }
    })

      return result
    } catch (error) {
      console.error('❌ [INNGEST] Main vectorization function error:', error)
      
      // Send failure event
      await inngest.send({
        name: 'document/vectorize.failed',
        data: {
          documentId: event.data.documentId,
          organizationId: event.data.organizationId,
          jobId: event.data.jobId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
      
      throw error // Re-throw to ensure Inngest marks the function as failed
    }
  }
)

// Error handling function
export const handleVectorizeError = inngest.createFunction(
  { 
    id: 'vectorize-document-error',
    name: 'Handle Vectorization Errors'
  },
  { event: 'document/vectorize.failed' },
  async ({ event }) => {
    const { documentId, organizationId, jobId, error } = event.data

    console.error('❌ [INNGEST] Vectorization failed:', { documentId, jobId, error })

    // Update document status to failed
    try {
      const processing = (await prisma.document.findUnique({
        where: { id: documentId },
        select: { processing: true }
      }))?.processing as any || {}

      await prisma.document.update({
        where: { id: documentId },
        data: {
          processing: {
            ...processing,
            currentStatus: 'FAILED',
            progress: 0,
            error: error,
            failedAt: new Date(),
            events: [
              ...(processing.events || []),
              {
                id: `evt_${Date.now()}_vectorize_background_failed`,
                eventType: 'FAILED',
                status: 'FAILED',
                message: `Background vectorization failed: ${error}`,
                timestamp: new Date().toISOString(),
                success: false,
                metadata: { 
                  jobId, 
                  error,
                  backgroundJob: true
                }
              }
            ]
          },
          updatedAt: new Date()
        }
      })
    } catch (updateError) {
      console.error('❌ [INNGEST] Failed to update document status:', updateError)
    }

    return { success: false, error }
  }
)