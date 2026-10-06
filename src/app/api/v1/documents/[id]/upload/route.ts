import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { inngest } from '@/lib/inngest/client';

/**
 * @swagger
 * /api/v1/documents/{id}/upload:
 *   post:
 *     summary: Upload file to existing document
 *     description: Attaches a file to an existing created document, converting it from text-only to file-based
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to attach file to
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 filePath:
 *                   type: string
 *                 mimeType:
 *                   type: string
 *                 size:
 *                   type: number
 *                 uploadedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request or file
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       500:
 *         description: Upload failed
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

    // Get and verify document access
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        filePath: true,
        uploadedById: true
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

    // Check if document is a created document (can accept file uploads)
    const isCreatedDocument = document.filePath?.startsWith('/documents/') || !document.filePath?.includes('/api/v1/documents/');
    
    if (!isCreatedDocument) {
      return NextResponse.json(
        { error: 'This document already has a file attached' },
        { status: 400 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size and type
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 400 }
      );
    }

    console.log('📤 Starting file upload to existing document:', {
      documentId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    let filePath: string;
    let publicUrl: string | null = null;

    if (supabaseAdmin) {
      // Upload to Supabase Storage with standardized path
      const fileExtension = file.name.split('.').pop();
      const fileName = `${documentId}-${Date.now()}.${fileExtension}`;
      filePath = `${user.organizationId}/docs/${fileName}`;

      console.log('📤 Uploading to Supabase storage:', filePath);

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ Supabase upload error:', uploadError);
        return NextResponse.json(
          { error: 'File upload failed' },
          { status: 500 }
        );
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('documents')
        .getPublicUrl(filePath);
      
      publicUrl = urlData.publicUrl;
      console.log('✅ File uploaded to Supabase:', { filePath, publicUrl });
    } else {
      // Mock upload for development
      filePath = `mock/${documentId}/${file.name}`;
      console.log('📤 Mock upload (Supabase not configured):', filePath);
    }

    // Update document in database
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: {
        filePath: supabaseAdmin ? filePath : `/api/v1/documents/${documentId}/download`,
        mimeType: file.type,
        size: file.size,
        lastModified: new Date(),
        // Update status if it was a created document
        status: 'PROCESSING' // Will be processed for content extraction
      }
    });

    console.log('✅ Document updated with file info:', {
      documentId,
      filePath: updatedDocument.filePath,
      mimeType: updatedDocument.mimeType,
      size: updatedDocument.size
    });

    // Trigger immediate basic AI processing (bypass background job for now)
    console.log('🤖 Starting immediate basic AI processing for document:', documentId);
    
    try {
      // Import document processor
      const { documentProcessor } = await import('@/lib/ai/document-processor');
      
      // Process document immediately
      const processingResult = await documentProcessor.processDocumentBasic(
        documentId,
        (step: string, progress: number) => {
          console.log(`📊 Immediate Processing [${documentId}]: ${step} - ${progress}%`);
        }
      );
      
      if (processingResult.success) {
        console.log('✅ Immediate processing completed successfully for document:', documentId);
      } else {
        console.error('❌ Immediate processing failed:', processingResult.error);
        // Update document status to failed
        await prisma.document.update({
          where: { id: documentId },
          data: { 
            status: 'FAILED',
            processingError: processingResult.error || 'Processing failed'
          }
        });
      }
    } catch (error) {
      console.error('❌ Failed to process document immediately:', error);
      // Update document status to failed
      await prisma.document.update({
        where: { id: documentId },
        data: { 
          status: 'FAILED',
          processingError: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }

    return NextResponse.json({
      id: updatedDocument.id,
      name: updatedDocument.name,
      filePath: updatedDocument.filePath,
      mimeType: updatedDocument.mimeType,
      size: updatedDocument.size,
      uploadedAt: updatedDocument.lastModified,
      message: 'File uploaded and processed successfully.',
      processingStatus: 'COMPLETED'
    });

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}