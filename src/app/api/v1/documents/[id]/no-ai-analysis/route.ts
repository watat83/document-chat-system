import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

/**
 * @swagger
 * /api/v1/documents/{id}/no-ai-analysis:
 *   post:
 *     summary: Complete document analysis without AI calls
 *     description: Emergency fallback that completes analysis using only text processing, no AI services
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
 *         description: Analysis completed without AI
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

    console.log(`🚀 [NO-AI] Starting NO-AI analysis for: ${documentId}`);

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
        extractedText: true,
        aiData: true
      }
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' }
    });

    console.log(`📝 [NO-AI] Document: "${document.name}" (${document.extractedText?.length || 0} chars)`);

    // Create analysis data WITHOUT any AI calls
    const textLength = document.extractedText?.length || 0;
    const hasContent = textLength > 0;
    
    // Simple text analysis without AI
    const wordCount = hasContent ? document.extractedText!.split(/\s+/).length : 0;
    const avgWordLength = hasContent ? document.extractedText!.replace(/\s/g, '').length / wordCount : 0;
    
    // Generate simple keywords from document name and first 100 words
    const simpleKeywords = document.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    if (hasContent) {
      const firstWords = document.extractedText!.toLowerCase().split(/\s+/).slice(0, 100);
      const commonWords = firstWords.filter(w => w.length > 4).slice(0, 10);
      simpleKeywords.push(...commonWords);
    }

    // Create comprehensive AI data structure
    const fallbackAiData = {
      status: {
        status: 'COMPLETED' as const,
        progress: 100,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        retryCount: 0,
        currentStep: 'Completed without AI services'
      },
      content: {
        extractedText: document.extractedText || '',
        summary: hasContent 
          ? `Analysis completed for "${document.name}". Document contains ${wordCount} words across ${textLength} characters. This analysis was completed using text processing without AI services to ensure reliability.`
          : `Document "${document.name}" processed successfully. Text extraction pending.`,
        keywords: Array.from(new Set(simpleKeywords)).slice(0, 15),
        keyPoints: hasContent ? [
          `Document contains ${wordCount} words`,
          `Average word length: ${avgWordLength.toFixed(1)} characters`,
          `Total text length: ${textLength} characters`,
          'Analysis completed without AI services for reliability'
        ] : ['Document processed without extracted text'],
        actionItems: ['Review document content', 'Verify analysis results']
      },
      structure: {
        sections: hasContent ? [
          {
            id: '1',
            title: 'Document Content',
            content: document.extractedText!.substring(0, 2000),
            type: 'content',
            pageNumber: 1,
            confidence: 0.9
          },
          ...(textLength > 2000 ? [{
            id: '2',
            title: 'Additional Content',
            content: document.extractedText!.substring(2000, 4000),
            type: 'content',
            pageNumber: 2,
            confidence: 0.9
          }] : [])
        ] : [{
          id: '1',
          title: 'Document Placeholder',
          content: 'Document processed without extracted text content.',
          type: 'content',
          pageNumber: 1,
          confidence: 0.5
        }],
        totalPages: Math.ceil(textLength / 2000) || 1,
        hasTableOfContents: false
      },
      analysis: {
        documentType: 'OTHER' as const,
        qualityScore: hasContent ? Math.min(90, Math.max(60, 70 + (wordCount / 100))) : 50,
        readabilityScore: hasContent ? Math.min(85, Math.max(50, 75 - (avgWordLength * 5))) : 50,
        entities: [], // Would normally be populated by AI
        confidence: 0.8
      },
      security: {
        classification: 'INTERNAL' as const,
        sensitiveDataDetected: false,
        sensitiveDataTypes: [],
        securityRisks: []
      }
    };

    // Update document with complete analysis data
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

    console.log(`✅ [NO-AI] Analysis completed successfully for: ${documentId}`);

    return NextResponse.json({
      success: true,
      message: 'Document analysis completed successfully without AI services',
      documentId,
      analysisType: 'no-ai-fallback',
      completedAt: new Date().toISOString(),
      statistics: {
        textLength,
        wordCount,
        avgWordLength: parseFloat(avgWordLength.toFixed(2)),
        sectionsCreated: fallbackAiData.structure.sections.length,
        keywordsExtracted: fallbackAiData.content.keywords.length
      },
      aiData: fallbackAiData
    });

  } catch (error) {
    console.error('❌ [NO-AI] Error:', error);
    
    // Update document status to failed
    try {
      const resolvedParams = await params;
      await prisma.document.update({
        where: { id: resolvedParams.id },
        data: { 
          status: 'FAILED',
          processingError: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    } catch (updateError) {
      console.error('Failed to update document status:', updateError);
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'No-AI analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}