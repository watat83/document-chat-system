import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

/**
 * @swagger
 * /api/v1/documents/{id}/force-complete:
 *   post:
 *     summary: Force complete stuck document analysis
 *     description: Emergency endpoint to force complete a stuck document analysis with fallback data
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
 *         description: Document force completed
 *       401:
 *         description: Unauthorized
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

    console.log(`🚨 [FORCE COMPLETE] Force completing document: ${documentId}`);

    // Get user info
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        status: true,
        extractedText: true
      }
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Create minimal fallback AI data
    const fallbackAiData = {
      status: {
        status: 'COMPLETED' as const,
        progress: 100,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        retryCount: 0
      },
      content: {
        extractedText: document.extractedText || '',
        summary: `Analysis completed for ${document.name}. This document has been processed with fallback analysis due to system timeout.`,
        keywords: ['government', 'contract', 'document'],
        keyPoints: ['Document processed successfully'],
        actionItems: []
      },
      structure: {
        sections: [{
          id: '1',
          title: 'Document Content',
          content: document.extractedText?.substring(0, 1000) || 'No content available',
          type: 'content',
          pageNumber: 1,
          confidence: 0.8
        }],
        totalPages: 1,
        hasTableOfContents: false
      },
      analysis: {
        documentType: 'OTHER' as const,
        qualityScore: 75,
        readabilityScore: 70,
        entities: [],
        confidence: 0.7
      },
      security: {
        classification: 'INTERNAL' as const,
        sensitiveDataDetected: false,
        sensitiveDataTypes: [],
        securityRisks: []
      }
    };

    // Update document with fallback data and mark as completed
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'COMPLETED',
        aiData: fallbackAiData,
        processedAt: new Date(),
        processingError: null,
        documentType: 'OTHER',
        securityClassification: 'INTERNAL'
      }
    });

    console.log(`✅ [FORCE COMPLETE] Document force completed: ${documentId}`);

    return NextResponse.json({
      success: true,
      message: 'Document analysis force completed with fallback data',
      documentId,
      status: 'COMPLETED',
      aiData: fallbackAiData
    });

  } catch (error) {
    console.error('❌ [FORCE COMPLETE] Error:', error);
    return NextResponse.json(
      { 
        error: 'Force complete failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}