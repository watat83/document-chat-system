import { processingSnapshot } from '@/lib/documents/processing-state';
import { serializeDocument } from '@/lib/documents/document-response';
import { normalizeError } from '@/lib/errors/normalize-error';
import { checkRateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { getCurrentUser } from '@/lib/auth';
import { canAccessOrganization } from '@/lib/security/access-policy';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadToLocal } from '@/lib/local-storage';
import { nanoid } from 'nanoid';
import { fileUpload } from '@/lib/config/env';
import { ALLOWED_FILE_TYPES } from '@/lib/constants';
import { validateFile, getEffectiveMimeType, createCorrectedFile } from '@/lib/file-validation';
import { inngest } from '@/lib/inngest/client';

const ALLOWED_TYPES = [
  ...ALLOWED_FILE_TYPES,
  'image/jpg' // Additional type
];

const uploadSchema = z.object({
  organizationId: z.string().min(1)
    .describe("Organization identifier for document access control and isolation. Must be a valid organization ID that the user has access to. Used for multi-tenant document management."),
  documentType: z.enum(['PROPOSAL', 'CONTRACT', 'CERTIFICATION', 'COMPLIANCE', 'TEMPLATE', 'OTHER', 'SOLICITATION', 'AMENDMENT', 'CAPABILITY_STATEMENT', 'PAST_PERFORMANCE']).optional()
    .describe("Document type classification. Must be one of the predefined DocumentType enum values.")
})
  .describe("Schema for validating document upload requests. Ensures proper organization-level access control and document isolation.");

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!(file instanceof File)) return NextResponse.json({ error: 'File required' }, { status: 400 });
    const organizationId = formData.get('organizationId') as string;
    const folderId = formData.get('folderId') as string | null;
    const tagsParam = formData.get('tags') as string | null;
    const documentTypeParam = formData.get('documentType') as string | null;

    // Parse tags if provided
    let tags: string[] = [];
    if (tagsParam) {
      try {
        tags = z.array(z.string().max(100)).max(50).parse(JSON.parse(tagsParam));
      } catch (error) {
        console.warn('Failed to parse tags:', error);
        return NextResponse.json({ error: 'Tags must be a JSON array of strings' }, { status: 400 });
      }
    }

    console.log('📥 Upload request parameters:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      organizationId,
      folderId,
      tags,
      documentType: documentTypeParam,
      userId
    });

    // Validate input
    const inputValidation = uploadSchema.safeParse({
      organizationId,
      documentType: documentTypeParam ?? undefined
    });
    if (!inputValidation.success) {
      console.error('❌ Input validation failed:', inputValidation.error.format());
      return NextResponse.json(
        {
          error: 'Invalid input parameters',
          details: inputValidation.error.format()
        },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Enhanced file validation with extension fallback
    console.log(`[API DEBUG] Upload attempt - File: ${file.name}, Type: "${file.type}", Size: ${file.size} bytes`);

    const fileValidation = validateFile(file, fileUpload.maxSize);

    if (!fileValidation.isValid) {
      console.error(`[API DEBUG] File validation failed: ${fileValidation.error}`);
      return NextResponse.json(
        { error: fileValidation.error || `Unsupported file: ${file.name}` },
        { status: 400 }
      );
    }

    // Use the effective MIME type (corrected if necessary)
    const effectiveMimeType = getEffectiveMimeType(fileValidation);
    console.log(`[API DEBUG] Using effective MIME type: "${effectiveMimeType}" for file: ${file.name}`);

    // Create corrected file if needed
    let processedFile = file;
    if (fileValidation.correctedMimeType) {
      processedFile = createCorrectedFile(file, fileValidation.correctedMimeType);
      console.log(`[API DEBUG] File MIME type corrected: "${file.type}" → "${fileValidation.correctedMimeType}"`);
    }

    // Resolve the verified identity and require an exact tenant match.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Account unavailable' }, { status: 403 });
    const hasAccess = canAccessOrganization(user, organizationId);

    if (!hasAccess) {
      console.error('❌ Organization access denied:', {
        userOrgId: user.organizationId,
        requestOrgId: organizationId,
        isDefault: organizationId === 'default'
      });
      return NextResponse.json(
        {
          error: 'Access denied to organization',
          details: `User belongs to organization '${user.organizationId}' but trying to access '${organizationId}'`
        },
        { status: 403 }
      );
    }

    if (user.role === 'VIEWER') return NextResponse.json({ error: 'Upload permission required' }, { status: 403 });
    const rateLimit = await checkRateLimit(request, rateLimitConfigs.upload, 'document-upload');
    if (!rateLimit.success) return NextResponse.json({ error: 'Please try again later' }, { status: 429 });
    const usageError = await guardUsage(organizationId, UsageType.DOCUMENT_PROCESSING);
    if (usageError) return usageError;

    // Generate unique file ID and path with new structure
    const documentId = nanoid();
    const fileExtension = file.name.split('.').pop() || 'bin';
    const fileName = `${documentId}.${fileExtension}`;
    let filePath = `${organizationId}/docs/${fileName}`;

    // Upload to storage (Supabase if configured, otherwise local)
    let uploadData = null;
    let storageUrl: string;

    if (supabaseAdmin) {
      const bucket = await supabaseAdmin.storage.getBucket('documents');
      if (bucket.error || bucket.data?.public !== false) return NextResponse.json({ error: 'Documents require a private storage bucket' }, { status: 503 });

      // Use Supabase storage
      const fileBuffer = await file.arrayBuffer();
      const { data, error: uploadError } = await supabaseAdmin.storage
        .from('documents')
        .upload(filePath, fileBuffer, {
          contentType: effectiveMimeType,
          upsert: false
        });

      if (uploadError) {
        console.error('Supabase upload error details:', {
          message: uploadError.message,
          name: uploadError.name
        });
        return NextResponse.json(
          {
            error: 'Failed to upload file to storage',
            details: uploadError.message,
          },
          { status: 500 }
        );
      }
      uploadData = data;

      // Update filePath with the actual path returned by Supabase
      filePath = data.path;

      storageUrl = `/api/v1/documents/${documentId}/download`;
    } else {
      if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Private document storage is not configured' }, { status: 503 });
      // Fallback to local storage for development
      console.log('📁 Using local file storage (Supabase not configured)');
      const localResult = await uploadToLocal(processedFile, organizationId);

      if (!localResult.success) {
        console.error('Local storage upload error:', localResult.error);
        return NextResponse.json(
          {
            error: 'Failed to upload file to local storage',
            details: localResult.error
          },
          { status: 500 }
        );
      }

      filePath = localResult.path || filePath;
      storageUrl = localResult.url || `/uploads/${fileName}`;
      console.log('✅ File uploaded to local storage:', storageUrl);
    }

    // Validate and prepare document type
    const validDocumentTypes = ['PROPOSAL', 'CONTRACT', 'CERTIFICATION', 'COMPLIANCE', 'TEMPLATE', 'OTHER', 'SOLICITATION', 'AMENDMENT', 'CAPABILITY_STATEMENT', 'PAST_PERFORMANCE'];
    const validDocumentType = inputValidation.data.documentType || 'OTHER';

    // Validate folderId if provided
    let validFolderId = folderId === 'null' || folderId === '' ? null : folderId;
    if (validFolderId) {
      try {
        const folderExists = await prisma.folder.findFirst({
          where: {
            id: validFolderId,
            organizationId: organizationId
          }
        });
        if (!folderExists) {
          validFolderId = null;
        }
      } catch (error) {
        validFolderId = null;
      }
    }

    // Save document metadata to database with the Supabase path - following same pattern as update route
    console.log('💾 Creating document in database with data:', {
      id: documentId,
      organizationId,
      uploadedById: user.id,
      uploadedByUserId: userId, // For comparison
      userFromDb: user,
      folderId: validFolderId,
      name: file.name,
      size: file.size,
      filePath,
      mimeType: file.type,
      status: 'PENDING',
      tags,
      documentType: validDocumentType
    });

    try {
      const document = await prisma.document.create({
        data: {
          id: documentId,
          organizationId,
          uploadedById: user.id,
          folderId: validFolderId, // Use validated folder ID

          // Direct field mappings (no metadata field)
          name: file.name,
          uploadDate: new Date(),
          lastModified: new Date(),
          size: file.size,
          filePath, // Storage path from Supabase
          mimeType: effectiveMimeType,
          tags: tags || [], // Ensure tags is always an array
          documentType: validDocumentType, // Use validated document type without 'as any'

          // Initialize processing status in JSON field
          processing: {
            status: 'PENDING',
            startedAt: null,
            completedAt: null,
            error: null
          },

          // Initialize other required JSON fields with empty objects
          content: {},
          embeddings: {},
          entities: {},
          sharing: {},
          revisions: {},
          analysis: {}
        }
      });

      console.log('✅ Document created successfully:', document.id);

      // Trigger immediate basic processing (text extraction + sections only, no AI analysis)
      console.log('🤖 Starting immediate basic processing for document:', documentId);

      try {
        // Import document processor
        const { documentProcessor } = await import('@/lib/ai/document-processor');

        // Process document with basic processing only (text extraction + sections)
        const processingResult = await documentProcessor.processDocumentBasic(
          documentId,
          (step: string, progress: number) => {
            console.log(`📊 Basic Processing [${documentId}]: ${step} - ${progress}%`);
          }
        );

        if (processingResult.success) {
          console.log('✅ Basic processing completed successfully for document:', documentId);
        } else {
          console.error('❌ Basic processing failed:', processingResult.error);
          // Update document status to failed
          await prisma.document.update({
            where: { id: documentId },
            data: {
              processing: {
                status: 'FAILED',
                error: processingResult.error || 'Processing failed',
                completedAt: new Date()
              }
            }
          });
        }
      } catch (error) {
        console.error('❌ Failed to process document with basic processing:', error);
        // Update document status to failed
        await prisma.document.update({
          where: { id: documentId },
          data: {
            processing: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : 'Unknown error',
              completedAt: new Date()
            }
          }
        });
      }

      // Get signed URL for access (if Supabase configured)
      let urlData = null;
      if (supabaseAdmin) {
        const { data } = await supabaseAdmin.storage
          .from('documents')
          .createSignedUrl(filePath, 3600); // 1 hour expiry
        urlData = data;
      }

      return NextResponse.json({
        document: serializeDocument(document),
        id: document.id,
        name: document.name,
        size: document.size,
        type: effectiveMimeType,
        uploadedAt: document.createdAt,
        status: (document.processing as any)?.status || 'PENDING',
        url: urlData?.signedUrl,
        message: 'Document uploaded. Processing status is available on the document.',
        processingStatus: processingSnapshot(document.processing).currentStatus
      });

    } catch (caughtDberror) {
      const dbError = normalizeError(caughtDberror);
      const code = caughtDberror && typeof caughtDberror === 'object' && 'code' in caughtDberror && typeof caughtDberror.code === 'string' ? caughtDberror.code : undefined;
      if (supabaseAdmin) {
        const cleanup = await supabaseAdmin.storage.from('documents').remove([filePath]);
        if (cleanup.error) console.error('Orphan upload cleanup failed', cleanup.error);
      }
      console.error('❌ Database error creating document:', dbError);
      console.error('❌ Database error details:', {
        message: dbError.message,
        code: code,
        stack: dbError.stack
      });

      // Provide more specific error messages based on error type
      let errorMessage = 'Failed to save document to database';
      let errorDetails = dbError.message;

      if (code === 'P2002') {
        errorMessage = 'Document with this ID already exists';
        errorDetails = 'Please try uploading again';
      } else if (code === 'P2003') {
        errorMessage = 'Invalid reference to organization or folder';
        errorDetails = 'Please refresh the page and try again';
      } else if (code === 'P2025') {
        errorMessage = 'Referenced organization or folder not found';
        errorDetails = 'Please refresh the page and try again';
      } else if (dbError.message?.includes('violates check constraint')) {
        errorMessage = 'Invalid document type or other field value';
        errorDetails = 'Please check your input and try again';
      }

      return NextResponse.json(
        {
          error: errorMessage,
          details: errorDetails,
          code: code || 'UNKNOWN'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }

    // Resolve the verified identity and require an exact tenant match.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Account unavailable' }, { status: 403 });
    const hasAccess = canAccessOrganization(user, organizationId);

    if (!hasAccess) {
      console.error('❌ Organization access denied:', {
        userOrgId: user.organizationId,
        requestOrgId: organizationId,
        isDefault: organizationId === 'default'
      });
      return NextResponse.json(
        {
          error: 'Access denied to organization',
          details: `User belongs to organization '${user.organizationId}' but trying to access '${organizationId}'`
        },
        { status: 403 }
      );
    }

    // Get user's documents in this organization
    const documents = await prisma.document.findMany({
      where: {
        organizationId,
        uploadedById: user.id // Use internal user ID, not Clerk ID
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        name: true,
        size: true,
        mimeType: true,
        processing: true,
        createdAt: true,
        updatedAt: true,
        extractedText: true
      }
    });

    return NextResponse.json({
      documents: documents.map(doc => ({
        id: doc.id,
        name: doc.name,          // Direct field alignment
        size: doc.size,          // Direct field alignment
        type: doc.mimeType,
        status: (doc.processing as any)?.status || 'PENDING',  // Get status from processing JSON
        uploadedAt: doc.createdAt,
        processedAt: (doc.processing as any)?.completedAt || null,
        hasContent: !!doc.extractedText
      }))
    });

  } catch (error) {
    console.error('Documents list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
