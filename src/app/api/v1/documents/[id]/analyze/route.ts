import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { inngest } from '@/lib/inngest/client';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';

/**
 * @swagger
 * /api/v1/documents/{id}/analyze:
 *   post:
 *     summary: Trigger full document analysis
 *     description: Manually trigger comprehensive AI analysis for a document (security, quality, entities, etc.)
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               options:
 *                 type: object
 *                 properties:
 *                   includeSecurityAnalysis:
 *                     type: boolean
 *                     default: true
 *                   includeEntityExtraction:
 *                     type: boolean
 *                     default: true
 *                   includeQualityScoring:
 *                     type: boolean
 *                     default: true
 *                   priority:
 *                     type: string
 *                     enum: [low, normal, high]
 *                     default: normal
 *     responses:
 *       200:
 *         description: Analysis job queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 documentId:
 *                   type: string
 *                 analysisJobId:
 *                   type: string
 *                 estimatedCompletion:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request or document not ready for analysis
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       409:
 *         description: Analysis already in progress
 *       500:
 *         description: Internal server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const permissionError = await guardDocumentMutation((await params).id, 'WRITE');
  if (permissionError) return permissionError;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const documentId = resolvedParams.id;

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { options = {} } = body;

    // Get user info
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get document and verify access
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        processing: true,
        filePath: true,
        mimeType: true,
        extractedText: true,
        analysis: true,
        content: true, // Include content for TipTap editor data
        documentType: true
      }
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Verify user has access to the document's organization
    if (document.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if document has content (either file or editor content)
    const documentContent = (document.content as any);
    const hasEditorContent = documentContent?.sections?.length > 0 || documentContent?.extractedText;
    const hasFileContent = document.filePath && document.extractedText;
    
    if (!document.filePath && !hasEditorContent) {
      return NextResponse.json(
        { error: 'Document has no file attached and no editor content. Please upload a file or add content to analyze.' },
        { status: 400 }
      );
    }

    // Check if analysis is already in progress
    const processingStatus = (document.processing as any)?.currentStatus;
    if (processingStatus === 'PROCESSING') {
      return NextResponse.json(
        { error: 'Analysis already in progress for this document' },
        { status: 409 }
      );
    }

    // Check if document has basic processing (extracted text or sections)
    // For editor-created documents, we don't require file processing
    const analysisData = document.analysis as any;
    const hasBasicProcessing = document.extractedText || 
                              (analysisData?.structure?.sections && analysisData.structure.sections.length > 0) ||
                              hasEditorContent; // Allow editor content without file processing

    if (!hasBasicProcessing && !hasEditorContent) {
      return NextResponse.json(
        { 
          error: 'Document must have basic processing (text extraction) completed before full analysis. Please wait for upload processing to complete or add content in the editor.' 
        },
        { status: 400 }
      );
    }

    console.log('🔬 Starting optimized document analysis for:', documentId, {
      hasFile: !!document.filePath,
      hasEditorContent: hasEditorContent,
      documentType: document.documentType
    });

    // Force synchronous processing to avoid Inngest issues
    console.log('🔄 Forcing synchronous document analysis processing...');
    
    try {
      // Update document processing status to indicate analysis is starting
      const currentProcessing = (document.processing as any) || {};
      
      // Clean processing object - only include valid fields to avoid Prisma errors
      const cleanProcessing = {
        currentStatus: 'PROCESSING',
        progress: 5,
        currentStep: 'Starting Synchronous Analysis',
        startedAt: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 minutes
        // Only include valid existing fields
        ...(currentProcessing.completedAt && { completedAt: currentProcessing.completedAt }),
        ...(currentProcessing.error && { error: currentProcessing.error }),
        events: [
          ...(currentProcessing.events || []),
          {
            id: `event_${Date.now()}`,
            userId: user.id,
            event: 'Synchronous Analysis Started',
            eventType: 'PROCESSING',
            success: true,
            error: null,
            timestamp: new Date().toISOString(),
            duration: null,
            metadata: { 
              options,
              hasFile: !!document.filePath,
              hasEditorContent: hasEditorContent,
              documentType: document.documentType
            }
          }
        ]
      };
      
      await prisma.document.update({
        where: { id: documentId },
        data: { processing: cleanProcessing }
      });

      // Send analysis job to Inngest
      const analysisJobId = await inngest.send({
        name: "document/process.analyze",
        data: {
          documentId,
          organizationId: user.organizationId,
          userId: user.id,
          options: {
            includeSecurityAnalysis: options.includeSecurityAnalysis ?? true,
            includeEntityExtraction: options.includeEntityExtraction ?? true,
            includeQualityScoring: options.includeQualityScoring ?? true,
            priority: options.priority || 'normal'
          },
          metadata: {
            hasFile: !!document.filePath,
            hasEditorContent: hasEditorContent,
            documentType: document.documentType,
            contentSource: document.filePath ? 'file' : 'editor'
          }
        }
      });

      console.log('✅ Analysis job queued successfully for document:', documentId, 'Job ID:', analysisJobId);

      // Track usage for document analysis (reanalyze)
      try {
        await UsageTrackingService.trackUsage({
          organizationId: user.organizationId,
          usageType: UsageType.DOCUMENT_PROCESSING,
          quantity: 1,
          resourceId: documentId,
          resourceType: 'document_analysis',
          metadata: {
            fileName: document.name,
            documentType: document.documentType,
            processingType: 'reanalyze',
            hasFile: !!document.filePath,
            hasEditorContent: hasEditorContent,
            contentSource: document.filePath ? 'file' : 'editor',
            options: {
              includeSecurityAnalysis: options.includeSecurityAnalysis ?? true,
              includeEntityExtraction: options.includeEntityExtraction ?? true,
              includeQualityScoring: options.includeQualityScoring ?? true,
              priority: options.priority || 'normal'
            }
          }
        })
        console.log('📊 Document analysis usage tracked successfully')
      } catch (trackingError) {
        console.error('Failed to track document analysis usage:', trackingError)
        // Don't fail the request if tracking fails
      }

      return NextResponse.json({
        success: true,
        message: 'Document analysis started successfully. Processing in background with Inngest.',
        documentId,
        analysisJobId: analysisJobId.ids?.[0] || `analyze_${documentId}_${Date.now()}`,
        analysisType: 'background',
        queuedAt: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        analysisFeatures: {
          securityAnalysis: options.includeSecurityAnalysis ?? true,
          entityExtraction: options.includeEntityExtraction ?? true,
          qualityScoring: options.includeQualityScoring ?? true,
          contentAnalysis: true,
          structureAnalysis: true
        },
        processingInfo: {
          hasFile: !!document.filePath,
          hasEditorContent: hasEditorContent,
          contentSource: document.filePath ? 'file' : 'editor',
          documentType: document.documentType
        }
      });

    } catch (jobError) {
      console.error('❌ Failed to queue analysis job:', jobError);
      console.log('🔄 Attempting synchronous fallback analysis...');
      
      try {
        // Fallback to synchronous analysis when Inngest fails
        const { documentProcessor } = await import('@/lib/ai/document-processor');
        
        // Update status to indicate fallback processing
        const currentProcessing = (document.processing as any) || {};
        
        // Clean processing object - only include valid fields
        const cleanProcessing = {
          currentStatus: 'PROCESSING',
          progress: 10,
          currentStep: 'Starting Synchronous Analysis (Fallback)',
          // Keep valid existing fields
          ...(currentProcessing.startedAt && { startedAt: currentProcessing.startedAt }),
          ...(currentProcessing.estimatedCompletion && { estimatedCompletion: currentProcessing.estimatedCompletion }),
          events: [
            ...(currentProcessing.events || []),
            {
              id: `event_${Date.now()}`,
              userId: user.id,
              event: 'Fallback Analysis Started',
              eventType: 'PROCESSING',
              success: true,
              error: null,
              timestamp: new Date().toISOString(),
              duration: null,
              metadata: { reason: 'Inngest queue failed', fallbackType: 'synchronous' }
            }
          ]
        };
        
        await prisma.document.update({
          where: { id: documentId },
          data: { processing: cleanProcessing }
        });

        // Add comprehensive timeout and cancellation for synchronous analysis
        console.log(`🕒 Starting synchronous analysis with 3-minute hard timeout for document ${documentId}`);
        
        // Create abort controller for the entire analysis operation
        const analysisAbortController = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error(`⏰ HARD TIMEOUT: Analysis for document ${documentId} exceeded 3 minutes - aborting all operations`);
          analysisAbortController.abort();
        }, 3 * 60 * 1000); // 3 minute hard timeout
        
        let analysisStartTime = Date.now();
        let result: any;
        
        try {
          // Run synchronous analysis with aggressive timeout and cancellation
          result = await Promise.race([
            documentProcessor.processDocument(
              documentId,
              async (step: string, progress: number) => {
                // Check if operation was aborted
                if (analysisAbortController.signal.aborted) {
                  console.error(`🚫 Analysis aborted during step: ${step}`);
                  throw new Error('Analysis operation was aborted');
                }
                
                console.log(`📊 Sync Analysis [${documentId}]: ${step} - ${progress}%`);
                
                // Update database progress in real-time so frontend can poll it
                try {
                  const currentProcessing = (document.processing as any) || {};
                  
                  // Clean processing object for progress update
                  const progressProcessing = {
                    currentStatus: 'PROCESSING',
                    progress: Math.min(progress, 99), // Cap at 99% until fully complete
                    currentStep: step,
                    // Keep valid existing fields
                    ...(currentProcessing.startedAt && { startedAt: currentProcessing.startedAt }),
                    ...(currentProcessing.estimatedCompletion && { estimatedCompletion: currentProcessing.estimatedCompletion }),
                    events: [
                      ...(currentProcessing.events || []),
                      {
                        id: `event_${Date.now()}`,
                        userId: user.id,
                        event: `Progress Update: ${step}`,
                        eventType: 'PROCESSING',
                        success: true,
                        error: null,
                        timestamp: new Date().toISOString(),
                        duration: null,
                        metadata: { progress, step }
                      }
                    ]
                  };
                  
                  await prisma.document.update({
                    where: { id: documentId },
                    data: { processing: progressProcessing }
                  });
                } catch (progressError) {
                  console.warn('⚠️ Failed to update progress in database:', progressError);
                  // Don't fail the analysis if progress update fails
                }
              }
            ),
            // Additional timeout promise that rejects after 2.5 minutes
            new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error('Analysis timeout after 2.5 minutes - preventing backend runaway'));
              }, 2.5 * 60 * 1000);
            })
          ]);
          
          // Clear timeout if analysis completes successfully
          clearTimeout(timeoutId);
          const analysisDuration = Date.now() - analysisStartTime;
          console.log(`✅ Analysis completed in ${analysisDuration}ms`);
          
        } catch (analysisError) {
          // Ensure we always clear the timeout
          clearTimeout(timeoutId);
          
          // Force cancel all document operations immediately
          try {
            documentProcessor.cancelDocumentOperations(documentId);
            console.log('🚫 Forcefully cancelled all document processor operations');
          } catch (cancelError) {
            console.warn('⚠️ Failed to cancel document operations:', cancelError);
          }
          
          // Update document status to failed immediately
          const currentProcessing = (document.processing as any) || {};
          const failedProcessing = {
            currentStatus: 'FAILED',
            progress: 0,
            currentStep: null,
            estimatedCompletion: null,
            completedAt: new Date().toISOString(),
            ...(currentProcessing.startedAt && { startedAt: currentProcessing.startedAt }),
            error: `Analysis failed: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`,
            events: [
              ...(currentProcessing.events || []),
              {
                id: `event_${Date.now()}`,
                userId: user.id,
                event: 'Analysis Failed - Backend Stopped',
                eventType: 'FAILED',
                success: false,
                error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
                timestamp: new Date().toISOString(),
                duration: Date.now() - analysisStartTime,
                metadata: { reason: 'timeout_or_abort', duration: Date.now() - analysisStartTime }
              }
            ]
          };
          
          await prisma.document.update({
            where: { id: documentId },
            data: { processing: failedProcessing }
          });
          
          throw analysisError; // Re-throw to be caught by outer catch block
        }

        if (result.success) {
          console.log('✅ Synchronous fallback analysis completed successfully for document:', documentId);

          // Track usage for synchronous fallback analysis
          try {
            await UsageTrackingService.trackUsage({
              organizationId: user.organizationId,
              usageType: UsageType.DOCUMENT_PROCESSING,
              quantity: 1,
              resourceId: documentId,
              resourceType: 'document_analysis_fallback',
              metadata: {
                fileName: document.name,
                documentType: document.documentType,
                processingType: 'reanalyze_synchronous_fallback',
                hasFile: !!document.filePath,
                hasEditorContent: hasEditorContent,
                contentSource: document.filePath ? 'file' : 'editor',
                fallbackReason: 'Inngest unavailable',
                options: {
                  includeSecurityAnalysis: options.includeSecurityAnalysis ?? true,
                  includeEntityExtraction: options.includeEntityExtraction ?? true,
                  includeQualityScoring: options.includeQualityScoring ?? true,
                  priority: options.priority || 'normal'
                }
              }
            })
            console.log('📊 Document analysis fallback usage tracked successfully')
          } catch (trackingError) {
            console.error('Failed to track document analysis fallback usage:', trackingError)
            // Don't fail the request if tracking fails
          }
          
          // Mark analysis as completed with 100% progress
          const currentProcessing = (document.processing as any) || {};
          
          // Clean processing object for completion
          const completedProcessing = {
            currentStatus: 'COMPLETED',
            progress: 100,
            currentStep: 'Analysis Complete',
            completedAt: new Date().toISOString(),
            // Keep valid existing fields
            ...(currentProcessing.startedAt && { startedAt: currentProcessing.startedAt }),
            error: null, // Clear any previous errors
            events: [
              ...(currentProcessing.events || []),
              {
                id: `event_${Date.now()}`,
                userId: user.id,
                event: 'Analysis Completed Successfully',
                eventType: 'COMPLETED',
                success: true,
                error: null,
                timestamp: new Date().toISOString(),
                duration: null,
                metadata: { progress: 100, analysisType: 'synchronous_fallback' }
              }
            ]
          };
          
          await prisma.document.update({
            where: { id: documentId },
            data: { processing: completedProcessing }
          });
          
          return NextResponse.json({
            success: true,
            message: 'Document analysis completed successfully using synchronous fallback.',
            documentId,
            analysisJobId: `sync_analyze_${documentId}_${Date.now()}`,
            analysisType: 'synchronous_fallback',
            completedAt: new Date().toISOString(),
            analysisFeatures: {
              securityAnalysis: options.includeSecurityAnalysis ?? true,
              entityExtraction: options.includeEntityExtraction ?? true,
              qualityScoring: options.includeQualityScoring ?? true,
              contentAnalysis: true,
              structureAnalysis: true
            },
            processingInfo: {
              hasFile: !!document.filePath,
              hasEditorContent: hasEditorContent,
              contentSource: document.filePath ? 'file' : 'editor',
              documentType: document.documentType,
              fallbackReason: 'Inngest unavailable'
            }
          });
        } else {
          throw new Error(result.error || 'Synchronous analysis failed');
        }
        
      } catch (fallbackError) {
        console.error('❌ Synchronous fallback analysis also failed:', fallbackError);
        
        // CRITICAL: Force cancel all operations immediately when fallback fails
        console.log('🚫 CRITICAL FAILURE: Forcing immediate cancellation of all operations');
        try {
          documentProcessor.cancelDocumentOperations(documentId);
          console.log('✅ Successfully cancelled all document processor operations');
        } catch (cancelError) {
          console.warn('⚠️ Failed to cancel document operations after fallback failure:', cancelError);
        }
        
        // Update document processing status to failed
        const currentProcessing = (document.processing as any) || {};
        
        // Clean processing object for failure
        const failedProcessing = {
          currentStatus: 'FAILED',
          progress: 0,
          currentStep: null,
          estimatedCompletion: null,
          completedAt: new Date().toISOString(),
          // Keep valid existing fields
          ...(currentProcessing.startedAt && { startedAt: currentProcessing.startedAt }),
          error: `Background: ${jobError instanceof Error ? jobError.message : 'Unknown'}; Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`,
          events: [
            ...(currentProcessing.events || []),
            {
              id: `event_${Date.now()}`,
              userId: user.id,
              event: 'Analysis Failed - Both Background and Fallback - Operations Cancelled',
              eventType: 'FAILED',
              success: false,
              error: `Background: ${jobError instanceof Error ? jobError.message : 'Unknown'}; Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown'}`,
              timestamp: new Date().toISOString(),
              duration: null,
              metadata: { operationsCancelled: true }
            }
          ]
        };
        
        await prisma.document.update({
          where: { id: documentId },
          data: { processing: failedProcessing }
        });

        return NextResponse.json(
          { 
            error: 'Failed to start document analysis - All operations cancelled',
            details: `Background processing failed: ${jobError instanceof Error ? jobError.message : 'Unknown error'}. Synchronous fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}. All backend operations have been cancelled.`,
            operationsCancelled: true
          },
          { status: 500 }
        );
      }
    }

  } catch (error) {
    console.error('Document analysis trigger error:', error);
    
    // CRITICAL: Force cancel all operations on any unhandled error
    console.log('🚫 UNHANDLED ERROR: Forcing immediate cancellation of all operations');
    try {
      const { documentProcessor } = await import('@/lib/ai/document-processor');
      documentProcessor.cancelDocumentOperations(documentId);
      console.log('✅ Successfully cancelled all operations due to unhandled error');
    } catch (cancelError) {
      console.warn('⚠️ Failed to cancel operations on unhandled error:', cancelError);
    }
    
    // Update document status to failed
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: { 
          processing: {
            currentStatus: 'FAILED',
            progress: 0,
            currentStep: null,
            estimatedCompletion: null,
            completedAt: new Date().toISOString(),
            error: `Unhandled error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            events: [{
              id: `event_${Date.now()}`,
              userId: null,
              event: 'Analysis Failed - Unhandled Error - Operations Cancelled',
              eventType: 'FAILED',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
              duration: null,
              metadata: { operationsCancelled: true, type: 'unhandled_error' }
            }]
          }
        }
      });
    } catch (updateError) {
      console.warn('⚠️ Failed to update document status after unhandled error:', updateError);
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error - All operations cancelled',
        details: error instanceof Error ? error.message : 'Unknown error',
        operationsCancelled: true
      },
      { status: 500 }
    );
  }
}