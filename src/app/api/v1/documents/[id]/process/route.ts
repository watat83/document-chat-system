import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { documentProcessor } from '@/lib/ai/document-processor';

/**
 * @swagger
 * /api/v1/documents/{id}/process:
 *   post:
 *     summary: Trigger AI processing for a document
 *     description: Manually trigger AI analysis to extract sections, entities, and metadata from a document
 *     tags: [Documents, AI Processing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to process
 *     responses:
 *       202:
 *         description: Processing started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "AI processing started"
 *                 documentId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "PROCESSING"
 *       400:
 *         description: Document already processed or invalid
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       500:
 *         description: Processing failed to start
 *   get:
 *     summary: Get AI processing status for a document
 *     description: Check the current AI processing status and results for a document
 *     tags: [Documents, AI Processing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to check
 *     responses:
 *       200:
 *         description: Processing status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documentId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [PENDING, PROCESSING, COMPLETED, FAILED]
 *                 progress:
 *                   type: number
 *                   minimum: 0
 *                   maximum: 100
 *                 processedAt:
 *                   type: string
 *                   format: date-time
 *                 error:
 *                   type: string
 *                 aiData:
 *                   type: object
 *                   description: AI analysis results (only if completed)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
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
    
    // Check for force reprocessing
    const { searchParams } = new URL(request.url);
    const forceReprocess = searchParams.get('force') === 'true';

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

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

    // Get and verify document access
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        filePath: true,
        status: true,
        processedAt: true,
        mimeType: true
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

    // Check if document has a file
    if (!document.filePath) {
      return NextResponse.json(
        { error: 'Document has no file to process' },
        { status: 400 }
      );
    }

    // Check if already processed (allow force reprocessing)
    if (document.status === 'COMPLETED' && document.processedAt && !forceReprocess) {
      return NextResponse.json(
        { 
          error: 'Document already processed',
          message: 'Use force=true query parameter to reprocess',
          processedAt: document.processedAt
        },
        { status: 400 }
      );
    }

    // Check if already processing
    if (document.status === 'PROCESSING') {
      return NextResponse.json(
        { 
          error: 'Document is already being processed',
          status: document.status
        },
        { status: 400 }
      );
    }

    console.log('🤖 Starting AI processing for document:', {
      documentId,
      documentName: document.name,
      mimeType: document.mimeType,
      forceReprocess
    });

    // Always use full AI analysis by default (basic processing only when specifically requested)
    const processingPromise = documentProcessor.processDocument(documentId, (step, progress) => {
      console.log(`📊 AI Processing [${documentId}]: ${step} - ${progress}%`);
    });
    
    processingPromise.then(result => {
      if (result.success) {
        console.log('✅ AI processing completed for document:', documentId);
      } else {
        console.error('❌ AI processing failed for document:', documentId, result.error);
      }
    }).catch(error => {
      console.error('❌ AI processing error for document:', documentId, error);
    });

    return NextResponse.json({
      message: 'AI processing started',
      documentId: document.id,
      status: 'PROCESSING'
    }, { status: 202 });

  } catch (error) {
    console.error('Process document error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Get document with AI data
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        processedAt: true,
        processingError: true,
        aiData: true
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

    // Calculate progress from AI data if available
    let progress = 0;
    if (document.status === 'COMPLETED') {
      progress = 100;
    } else if (document.status === 'PROCESSING' && document.aiData) {
      const aiData = document.aiData as any;
      progress = aiData.status?.progress || 50;
    }

    return NextResponse.json({
      documentId: document.id,
      status: document.status || 'PENDING',
      progress,
      processedAt: document.processedAt,
      error: document.processingError,
      aiData: document.status === 'COMPLETED' ? document.aiData : undefined
    });

  } catch (error) {
    console.error('Get process status error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}