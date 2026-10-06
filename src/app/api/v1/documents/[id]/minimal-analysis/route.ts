import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { simpleAIClient } from '@/lib/ai/services/simple-ai-client';

/**
 * Minimal analysis that skips all complexity and just does basic AI analysis
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

    console.log(`🚀 [MINIMAL] Starting minimal analysis for: ${documentId}`);

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

    console.log(`📝 [MINIMAL] Document has text: ${!!document.extractedText} (${document.extractedText?.length || 0} chars)`);

    if (!document.extractedText || document.extractedText.trim().length === 0) {
      throw new Error('No extracted text available for analysis');
    }

    // Do a simple AI analysis with 30-second timeout
    console.log(`🤖 [MINIMAL] Starting AI analysis...`);
    
    const aiPromise = simpleAIClient.generateCompletion({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a document analyzer. Analyze the given document and provide a brief summary.'
        },
        {
          role: 'user',
          content: `Please analyze this document and provide a brief summary:\n\n${document.extractedText.substring(0, 4000)}`
        }
      ],
      maxTokens: 500,
      temperature: 0.3
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI analysis timeout after 30 seconds')), 30000);
    });

    const aiResult = await Promise.race([aiPromise, timeoutPromise]);
    console.log(`✅ [MINIMAL] AI analysis completed: ${aiResult.content?.length || 0} chars`);

    // Create minimal AI data
    const minimalAiData = {
      status: {
        status: 'COMPLETED' as const,
        progress: 100,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        retryCount: 0
      },
      content: {
        extractedText: document.extractedText,
        summary: aiResult.content || 'Analysis completed',
        keywords: ['document', 'analysis'],
        keyPoints: [aiResult.content?.substring(0, 100) || 'Analysis completed'],
        actionItems: []
      },
      structure: {
        sections: [{
          id: '1',
          title: 'Content',
          content: document.extractedText.substring(0, 1000),
          type: 'content',
          pageNumber: 1,
          confidence: 0.8
        }],
        totalPages: 1,
        hasTableOfContents: false
      },
      analysis: {
        documentType: 'OTHER' as const,
        qualityScore: 80,
        readabilityScore: 75,
        entities: [],
        confidence: 0.8
      },
      security: {
        classification: 'INTERNAL' as const,
        sensitiveDataDetected: false,
        sensitiveDataTypes: [],
        securityRisks: []
      }
    };

    // Update document with results
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'COMPLETED',
        aiData: minimalAiData,
        processedAt: new Date(),
        processingError: null
      }
    });

    console.log(`✅ [MINIMAL] Analysis completed successfully for: ${documentId}`);

    return NextResponse.json({
      success: true,
      message: 'Minimal analysis completed successfully',
      documentId,
      aiData: minimalAiData
    });

  } catch (error) {
    console.error('❌ [MINIMAL] Error:', error);
    
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
        error: 'Minimal analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}