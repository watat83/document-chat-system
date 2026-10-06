import { processingTransition, updateProcessingState } from '@/lib/documents/processing-state';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { inngest } from '@/lib/inngest/client';

/**
 * @swagger
 * /api/v1/documents/{id}/cancel:
 *   post:
 *     summary: Cancel document processing
 *     description: Cancel ongoing document processing and reset status to allow restarting
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
 *     responses:
 *       200:
 *         description: Processing cancelled successfully
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
 *                 previousStatus:
 *                   type: string
 *       400:
 *         description: Invalid request or document not processing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
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
        processing: true
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

    // Check if document is actually processing
    const processingStatus = (document.processing as any)?.currentStatus;
    if (processingStatus !== 'PROCESSING' && processingStatus !== 'QUEUED') {
      return NextResponse.json(
        {
          error: `Cannot cancel processing. Document status is '${processingStatus}'. Only PROCESSING or QUEUED documents can be cancelled.`
        },
        { status: 400 }
      );
    }

    console.log('🚫 Cancelling document processing for:', documentId);

    await updateProcessingState(documentId, current => {
      if (!['PROCESSING', 'QUEUED'].includes(current.currentStatus)) throw new Error('Document is no longer processing');
      return processingTransition(current, 'CANCELLED');
    }, user.organizationId);

    // Send cancellation event to Inngest
    try {
      await inngest.send({
        name: "document/process.cancelled",
        data: {
          documentId,
          organizationId: document.organizationId,
          userId: user.id,
          runId: (document.processing as { runId?: string } | null)?.runId,
          cancelledAt: new Date().toISOString(),
          previousStatus: processingStatus
        }
      });
    } catch (jobError) {
      console.warn('⚠️ Could not send cancellation event to Inngest:', jobError);
      // Continue with cancellation even if Inngest event fails
    }


    console.log('✅ Document processing cancelled for:', documentId);

    return NextResponse.json({
      success: true,
      message: 'Document processing has been cancelled. You can now restart processing.',
      documentId,
      previousStatus: processingStatus,
      newStatus: 'CANCELLED'
    });

  } catch (error) {
    console.error('Document processing cancellation error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
