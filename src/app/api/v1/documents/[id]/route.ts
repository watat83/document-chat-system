import type { Prisma } from '@prisma/client';
import { DocumentUpdateSchema } from '@/lib/documents/update-schema';
import { serializeDocument } from '@/lib/documents/document-response';
import { normalizeError } from '@/lib/errors/normalize-error';
import { defaultEmbeddingService } from '@/lib/ai/services/embedding-service';
import { defaultVectorSearchCache } from '@/lib/ai/services/vector-search-cache';
import { canAccessDocument } from '@/lib/security/access-policy';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase';
import {
  UnifiedUpdateSchema,
  AddPermissionSchema,
  CreateShareSchema,
  UpdateStatusSchema,
  AddEntitiesSchema
} from '@/lib/validation/document-sections';
import { randomBytes, randomUUID } from 'crypto';
import { normalizeFilePath } from '@/lib/storage/path-utils';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';
import { getClientIP } from '@/lib/audit/middleware';

/**
 * @swagger
 * /api/v1/documents/{id}:
 *   get:
 *     summary: Get a single document by ID
 *     description: Retrieves complete document information including metadata and AI data
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to retrieve
 *     responses:
 *       200:
 *         description: Document retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 folderId:
 *                   type: string
 *                   nullable: true
 *                 type:
 *                   type: string
 *                 size:
 *                   type: number
 *                 mimeType:
 *                   type: string
 *                 filePath:
 *                   type: string
 *                 uploadDate:
 *                   type: string
 *                 lastModified:
 *                   type: string
 *                 updatedBy:
 *                   type: string
 *                 isEditable:
 *                   type: boolean
 *                 aiData:
 *                   type: object
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: documentId } = await params;

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Find the document
    console.log('🔍 GET /api/v1/documents/[id] - Finding document:', documentId)
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: user.organizationId,
        deletedAt: null
      },
      include: {
        folder: {
          select: {
            id: true,
            name: true
          }
        },
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    console.log('🔍 Document found with consolidated JSON structure:', {
      id: document.id,
      name: document.name,
      hasContent: !!document.content,
      hasEntities: !!document.entities,
      hasSharing: !!document.sharing,
      hasProcessing: !!document.processing,
      hasAnalysis: !!document.analysis,
      hasEmbeddings: !!document.embeddings,
      contentSections: ((document.content as any)?.sections || []).length,
      entitiesCount: ((document.entities as any)?.entities || []).length
    })

    const formattedDocument = serializeDocument(document);

    console.log('📤 Sending consolidated document structure:', {
      id: formattedDocument.id,
      name: formattedDocument.name,
      status: formattedDocument.status,
      sectionsCount: formattedDocument.content?.sections?.length || 0,
      entitiesCount: formattedDocument.entities?.entities?.length || 0,
      hasSharing: !!formattedDocument.sharing,
      hasAnalysis: !!formattedDocument.analysis
    })

    // Log document access for audit trail
    try {
      await crudAuditLogger.logDocumentOperation(
        'READ',
        document.id,
        document.name,
        formattedDocument.type || 'unknown',
        null,
        {
          documentId: document.id,
          status: ((document.processing as any)?.currentStatus || 'PENDING'),
          folderId: document.folderId
        },
        {
          endpoint: `/api/v1/documents/${documentId}`,
          method: 'GET',
          userAgent: request.headers.get('user-agent'),
          ipAddress: getClientIP(request),
          isConfidential: document.securityClassification !== 'PUBLIC',
          fileSize: document.size,
          hasAnalysis: !!formattedDocument.analysis
        }
      );
    } catch (auditError) {
      console.error('Failed to create document access audit log:', auditError);
      // Don't fail the request
    }

    return NextResponse.json(formattedDocument);

  } catch (caughtError) {
    const error = normalizeError(caughtError);
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/documents/{id}:
 *   put:
 *     summary: Update a document
 *     description: Updates document information such as name, folder location, metadata
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Document Name.pdf"
 *               folderId:
 *                 type: string
 *                 nullable: true
 *                 example: "folder_123"
 *               metadata:
 *                 type: object
 *                 properties:
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["important", "contract"]
 *     responses:
 *       200:
 *         description: Document updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 document:
 *                   $ref: '#/components/schemas/Document'
 *       400:
 *         description: Bad request - invalid input
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user doesn't have access to this document
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return PATCH(request, context);
}

/**
 * @swagger
 * /api/v1/documents/{id}:
 *   patch:
 *     summary: Unified document update endpoint
 *     description: |
 *       Update any section of a document through a unified API. This endpoint replaces multiple separate endpoints
 *       for entities, permissions, sharing, processing, analysis, etc. Use query parameters to specify the section
 *       and action to perform.
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to update
 *       - in: query
 *         name: section
 *         required: false
 *         schema:
 *           type: string
 *           enum: [content, entities, sharing, processing, analysis, embeddings, revisions]
 *         description: |
 *           Document section to update. If not provided, performs legacy field updates.
 *           - content: Document sections, tables, images
 *           - entities: Extracted entities
 *           - sharing: Permissions, shares, comments
 *           - processing: Status and events
 *           - analysis: Contract and compliance analysis
 *           - embeddings: Vector embeddings
 *           - revisions: Version history
 *       - in: query
 *         name: action
 *         required: false
 *         schema:
 *           type: string
 *           enum: [replace, add, update, remove, add_permission, remove_permission, create_share, update_share, delete_share, update_status, add_event]
 *         description: |
 *           Specific action to perform on the section.
 *           - replace: Replace entire section
 *           - add: Add new items to section
 *           - update: Update existing items
 *           - remove: Remove items from section
 *           - add_permission: Add user permission
 *           - remove_permission: Remove user permission
 *           - create_share: Create share link
 *           - update_share: Update share settings
 *           - delete_share: Delete share link
 *           - update_status: Update processing status
 *           - add_event: Add processing event
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - title: Legacy Update
 *                 type: object
 *                 description: Legacy document field updates (name, tags, etc.)
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "Updated Document Name.pdf"
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["important", "contract"]
 *               - title: Section Update
 *                 type: object
 *                 description: JSON field section update
 *                 required: [section, data]
 *                 properties:
 *                   section:
 *                     type: string
 *                     enum: [content, entities, sharing, processing, analysis, embeddings, revisions]
 *                   action:
 *                     type: string
 *                     enum: [replace, add, update, remove, add_permission, remove_permission, create_share, update_share, delete_share, update_status, add_event]
 *                   data:
 *                     type: object
 *                     description: Section-specific data based on section type
 *               - title: Add Permission
 *                 type: object
 *                 required: [section, action, data]
 *                 properties:
 *                   section:
 *                     type: string
 *                     enum: [sharing]
 *                   action:
 *                     type: string
 *                     enum: [add_permission]
 *                   data:
 *                     type: object
 *                     properties:
 *                       permission:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                             example: "user_456"
 *                           permission:
 *                             type: string
 *                             enum: [READ, WRITE, DELETE, SHARE, COMMENT]
 *                             example: "READ"
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-12-31T23:59:59Z"
 *               - title: Create Share
 *                 type: object
 *                 required: [section, action, data]
 *                 properties:
 *                   section:
 *                     type: string
 *                     enum: [sharing]
 *                   action:
 *                     type: string
 *                     enum: [create_share]
 *                   data:
 *                     type: object
 *                     properties:
 *                       share:
 *                         type: object
 *                         properties:
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-12-31T23:59:59Z"
 *                           allowDownload:
 *                             type: boolean
 *                             default: true
 *                           allowPreview:
 *                             type: boolean
 *                             default: true
 *                           trackViews:
 *                             type: boolean
 *                             default: true
 *                           password:
 *                             type: string
 *                             example: "secretpassword"
 *               - title: Update Entities
 *                 type: object
 *                 required: [section, data]
 *                 properties:
 *                   section:
 *                     type: string
 *                     enum: [entities]
 *                   action:
 *                     type: string
 *                     enum: [replace, add]
 *                     default: replace
 *                   data:
 *                     type: object
 *                     properties:
 *                       entities:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               enum: [PERSON, ORGANIZATION, LOCATION, DATE, MONEY, MISC]
 *                             value:
 *                               type: string
 *                             confidence:
 *                               type: number
 *                               minimum: 0
 *                               maximum: 1
 *                             startOffset:
 *                               type: number
 *                             endOffset:
 *                               type: number
 *                         example:
 *                           - type: "PERSON"
 *                             value: "John Doe"
 *                             confidence: 0.95
 *                             startOffset: 100
 *                             endOffset: 108
 *     responses:
 *       200:
 *         description: Document updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document section updated successfully"
 *                 document:
 *                   $ref: '#/components/schemas/Document'
 *                 updated:
 *                   type: object
 *                   properties:
 *                     section:
 *                       type: string
 *                       example: "entities"
 *                     action:
 *                       type: string
 *                       example: "replace"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - invalid input or unsupported section/action
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - insufficient permissions for requested action
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
// Helper functions for unified API
function generateShareToken(): string {
  return randomBytes(32).toString('hex')
}

function generateShareUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/shared/${token}`
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: documentId } = await params
    const body = await request.json()
    const url = new URL(request.url)
    const section = url.searchParams.get('section')
    const action = url.searchParams.get('action')

    console.log('🔧 PATCH /api/v1/documents/[id] - Unified update:', {
      documentId,
      section,
      action,
      fields: Object.keys(body),
      hasSection: !!section
    })

    // Get user info
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true, role: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Get existing document to verify access
    const existingDocument = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        uploadedById: true, deletedAt: true,
        name: true,
        tags: true,
        documentType: true,
        description: true,
        content: true,
        entities: true,
        sharing: true,
        processing: true,
        analysis: true,
        embeddings: true,
        revisions: true
      }
    })

    if (!existingDocument) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the document's organization
    if (!canAccessDocument(user, existingDocument, section === 'sharing' ? 'SHARE' : 'WRITE')) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check if this is a section-based update (unified API)
    if (section) {
      return await handleSectionUpdate({
        documentId,
        section,
        action,
        body,
        user,
        existingDocument
      })
    }

    const parsed = DocumentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid document update', details: parsed.error.flatten() }, { status: 400 });
    }
    const updates = parsed.data;
    if (updates.folderId !== undefined && updates.folderId !== null) {
      const folder = await prisma.folder.findFirst({ where: { id: updates.folderId, organizationId: user.organizationId } });
      if (!folder) return NextResponse.json({ success: false, error: 'Target folder not found' }, { status: 404 });
    }
    const updateData: Prisma.DocumentUpdateInput = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      ...(updates.documentType !== undefined && { documentType: updates.documentType }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.folderId !== undefined && { folder: updates.folderId === null ? { disconnect: true } : { connect: { id: updates.folderId } } }),
      updatedAt: new Date(),
      lastModified: new Date(),
    };
    const currentContent = jsonObject(existingDocument.content);
    const currentAnalysis = jsonObject(existingDocument.analysis);
    if (updates.content) updateData.content = jsonInput({ ...currentContent, ...updates.content });
    if (updates.analysis || updates.contractAnalysis) {
      updateData.analysis = jsonInput({
        ...currentAnalysis, ...updates.analysis,
        ...(updates.contractAnalysis && { contract: { ...jsonObject(currentAnalysis.contract), ...updates.contractAnalysis } }),
      });
    }
    if (updates.entities !== undefined) {
      const supplied = Array.isArray(updates.entities) ? updates.entities : updates.entities.entities;
      const previous = jsonObject(existingDocument.entities);
      const previousEntities = Array.isArray(previous.entities) ? previous.entities : [];
      updateData.entities = jsonInput({
        ...previous,
        entities: supplied.map((entity, index) => ({
          ...jsonObject(previousEntities.find((previous: any) => previous.id === entity.id)), ...entity,
          id: entity.id || jsonObject(previousEntities.find((previous: any) => previous.id === entity.id)).id || randomUUID(),
          text: entity.text ?? entity.value ?? '',
          confidence: entity.confidence ?? 1,
          startOffset: entity.startOffset ?? 0,
          endOffset: entity.endOffset ?? 0,
          context: entity.context ?? null,
          metadata: entity.metadata ?? null,
        })),
        totalCount: supplied.length,
      });
    }
    // Compatibility input is mapped to existing columns, never to the removed aiData column.
    if (updates.aiData) {
      const legacyContent = jsonObject(updates.aiData.content);
      const legacyStructure = jsonObject(updates.aiData.structure);
      if (typeof legacyContent.extractedText === 'string') updateData.extractedText = legacyContent.extractedText;
      if (typeof legacyContent.summary === 'string') updateData.summary = legacyContent.summary;
      if (Array.isArray(legacyStructure.sections) && updates.source !== 'processing') {
        updateData.content = jsonInput({ ...currentContent, sections: legacyStructure.sections });
      }
      const legacyAnalysis = jsonObject(updates.aiData.analysis);
      if (Object.keys(legacyAnalysis).length) updateData.analysis = jsonInput({ ...currentAnalysis, ...legacyAnalysis, ...updates.analysis });
    }
    await prisma.document.update({ where: { id: documentId }, data: updateData });

    // Fetch the complete updated document to return (same as GET endpoint)
    const completeDocument = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        folder: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        // All deprecated models moved to JSON fields:
        // complianceCheck -> analysis.compliance
        // extractedEntities -> entities.entities
        // documentChunks -> content.chunks (deprecated)
        // sections -> content.sections
        // tables -> content.tables
        // images -> content.images
      }
    })

    if (!completeDocument) {
      throw new Error('Document not found after update')
    }

    const transformedDocument = serializeDocument(completeDocument);

    console.log('✅ PATCH completed successfully:', {
      documentId,
      updatedFields: Object.keys(updateData),
      finalDocument: {
        tags: transformedDocument.tags
      },
      contentKeywords: transformedDocument.aiData?.content?.keywords,
      directContentKeywords: (completeDocument.content as any)?.keywords
    })

    // Log document update for audit trail
    try {
      await crudAuditLogger.logDocumentOperation(
        'UPDATE',
        documentId,
        transformedDocument.name,
        transformedDocument.type || 'unknown',
        existingDocument, // Previous data
        transformedDocument, // Current data
        {
          endpoint: `/api/v1/documents/${documentId}`,
          method: 'PATCH',
          userAgent: request.headers.get('user-agent'),
          ipAddress: getClientIP(request),
          section: section || 'general',
          action: action || 'update',
          changedFields: Object.keys(updateData),
          isConfidential: transformedDocument.securityAnalysis?.classification !== 'PUBLIC'
        }
      );
    } catch (auditError) {
      console.error('Failed to create document update audit log:', auditError);
      // Don't fail the request
    }

    return NextResponse.json({
      success: true,
      document: transformedDocument
    })

  } catch (caughtError) {
    const error = normalizeError(caughtError);
    console.error('❌ PATCH error:', error)
    console.error('❌ PATCH error details:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
    })

    const errorMessage = error?.message || 'Failed to update document'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

// Section update handler for unified API
async function handleSectionUpdate({
  documentId,
  section,
  action,
  body,
  user,
  existingDocument
}: {
  documentId: string
  section: string
  action: string | null
  body: any
  user: { id: string; organizationId: string }
  existingDocument: any
}) {
  console.log(`🔧 Unified API - Section: ${section}, Action: ${action}`)

  // Permission checks based on section
  const hasPermission = await checkSectionPermission(section, action, user, existingDocument)
  if (!hasPermission.allowed) {
    return NextResponse.json(
      { success: false, error: hasPermission.error },
      { status: 403 }
    )
  }

  let updateResult: any = null
  let message = ''
  const timestamp = new Date().toISOString()

  try {
    switch (section) {
      case 'entities':
        updateResult = await updateEntitiesSection(documentId, body, action)
        message = `Entities ${action || 'updated'} successfully`
        break

      case 'sharing':
        updateResult = await updateSharingSection(documentId, body, action, user)
        message = `Sharing ${action || 'updated'} successfully`
        break

      case 'processing':
        updateResult = await updateProcessingSection(documentId, body, action)
        message = `Processing ${action || 'updated'} successfully`
        break

      case 'content':
        updateResult = await updateContentSection(documentId, body, action)
        message = `Content ${action || 'updated'} successfully`
        break

      case 'analysis':
        updateResult = await updateAnalysisSection(documentId, body, action)
        message = `Analysis ${action || 'updated'} successfully`
        break

      case 'embeddings':
        updateResult = await updateEmbeddingsSection(documentId, body, action)
        message = `Embeddings ${action || 'updated'} successfully`
        break

      case 'revisions':
        updateResult = await updateRevisionsSection(documentId, body, action)
        message = `Revisions ${action || 'updated'} successfully`
        break

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported section: ${section}` },
          { status: 400 }
        )
    }

    // Fetch the complete updated document
    const updatedDocument = await fetchCompleteDocument(documentId)

    return NextResponse.json({
      success: true,
      message,
      document: updatedDocument,
      updated: {
        section,
        action: action || 'update',
        timestamp
      }
    })

  } catch (caughtError) {
    const error = normalizeError(caughtError);
    console.error(`❌ Section update error (${section}):`, error)
    return NextResponse.json(
      {
        success: false,
        error: `Failed to update ${section}: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      { status: 500 }
    )
  }
}

// Permission checking function
async function checkSectionPermission(
  section: string,
  action: string | null,
  user: { id: string; organizationId: string },
  document: any
): Promise<{ allowed: boolean; error?: string }> {
  const permission = section === 'sharing' ? 'SHARE' : 'WRITE';
  return canAccessDocument(user, document, permission)
    ? { allowed: true }
    : { allowed: false, error: `${permission} permission required` };
}

// Section update implementations
async function updateEntitiesSection(documentId: string, body: any, action: string | null) {
  const validation = AddEntitiesSchema.safeParse({
    section: 'entities',
    action: action || 'replace',
    data: { entities: body.entities || body.data?.entities || [] }
  })

  if (!validation.success) {
    throw new Error(`Invalid entities data: ${JSON.stringify(validation.error.format())}`)
  }

  const { entities } = validation.data.data
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { entities: true }
  })

  let updatedEntities
  if (action === 'add') {
    const currentEntities = (existingDocument?.entities as any)?.entities || []
    updatedEntities = { entities: [...currentEntities, ...entities] }
  } else {
    updatedEntities = { entities }
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      entities: updatedEntities,
      updatedAt: new Date()
    }
  })

  return updatedEntities
}

async function updateSharingSection(documentId: string, body: any, action: string | null, user: { id: string; organizationId: string }) {
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { sharing: true }
  })

  const currentSharing = (existingDocument?.sharing as any) || {
    permissions: [],
    share: null,
    shareViews: [],
    comments: []
  }

  switch (action) {
    case 'add_permission':
      const permissionData = body.data?.permission || body.permission
      if (!permissionData || !['READ', 'WRITE', 'DELETE', 'SHARE'].includes(permissionData.permission)) throw new Error('Valid permission data required');
      const recipient = await prisma.user.findFirst({ where: { id: permissionData.userId, organizationId: user.organizationId, deletedAt: null } });
      if (!recipient) throw new Error('Recipient must belong to this organization');

      const newPermission = {
        id: `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: permissionData.userId,
        permission: permissionData.permission,
        grantedBy: user.id,
        grantedAt: new Date().toISOString(),
        expiresAt: permissionData.expiresAt || null
      }

      currentSharing.permissions.push(newPermission)
      break

    case 'remove_permission':
      const permissionId = body.data?.permissionId || body.permissionId
      currentSharing.permissions = currentSharing.permissions.filter((p: any) => p.id !== permissionId)
      break

    case 'create_share':
    case 'update_share':
    case 'delete_share':
      throw new Error('Use the document /share endpoint to manage share links');

    default:
      throw new Error('Specify add_permission or remove_permission');
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      sharing: currentSharing,
      updatedAt: new Date()
    }
  })

  return currentSharing
}

async function updateProcessingSection(documentId: string, body: any, action: string | null) {
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { processing: true }
  })

  const currentProcessing = (existingDocument?.processing as any) || {
    currentStatus: 'PENDING',
    progress: 0,
    events: []
  }

  switch (action) {
    case 'update_status':
      const statusData = body.data || body
      currentProcessing.currentStatus = statusData.currentStatus
      if (statusData.progress !== undefined) {
        currentProcessing.progress = statusData.progress
      }
      if (statusData.events) {
        currentProcessing.events.push(...statusData.events)
      }
      break

    case 'add_event':
      const eventData = body.data?.event || body.event
      if (!eventData) throw new Error('Event data required')

      const newEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...eventData,
        timestamp: eventData.timestamp || new Date().toISOString()
      }
      currentProcessing.events.push(newEvent)
      break

    default:
      // Replace entire processing section
      Object.assign(currentProcessing, body.data || body)
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      processing: currentProcessing,
      updatedAt: new Date()
    }
  })

  return currentProcessing
}

async function updateContentSection(documentId: string, body: any, action: string | null) {
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { content: true }
  })

  const currentContent = (existingDocument?.content as any) || {
    sections: [],
    tables: [],
    images: []
  }

  if (action === 'add') {
    const addData = body.data || body
    if (addData.sections) currentContent.sections.push(...addData.sections)
    if (addData.tables) currentContent.tables.push(...addData.tables)
    if (addData.images) currentContent.images.push(...addData.images)
  } else {
    // Replace entire content section
    Object.assign(currentContent, body.data || body)
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      content: currentContent,
      updatedAt: new Date()
    }
  })

  return currentContent
}

async function updateAnalysisSection(documentId: string, body: any, action: string | null) {
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { analysis: true }
  })

  const currentAnalysis = (existingDocument?.analysis as any) || {
    contract: null,
    compliance: null
  }

  // Replace or merge analysis data
  Object.assign(currentAnalysis, body.data || body)

  await prisma.document.update({
    where: { id: documentId },
    data: {
      analysis: currentAnalysis,
      updatedAt: new Date()
    }
  })

  return currentAnalysis
}

async function updateEmbeddingsSection(documentId: string, body: any, action: string | null) {
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { embeddings: true }
  })

  const currentEmbeddings = (existingDocument?.embeddings as any) || { vectors: [] }

  if (action === 'add') {
    const addData = body.data || body
    if (addData.vectors) currentEmbeddings.vectors.push(...addData.vectors)
  } else {
    Object.assign(currentEmbeddings, body.data || body)
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      embeddings: currentEmbeddings,
      updatedAt: new Date()
    }
  })

  return currentEmbeddings
}

async function updateRevisionsSection(documentId: string, body: any, action: string | null) {
  const existingDocument = await prisma.document.findUnique({
    where: { id: documentId },
    select: { revisions: true }
  })

  const currentRevisions = (existingDocument?.revisions as any) || { revisions: [] }

  if (action === 'add') {
    const revisionData = body.data?.revision || body.revision
    if (!revisionData) throw new Error('Revision data required')

    const newRevision = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      version: (currentRevisions.revisions?.length || 0) + 1,
      ...revisionData,
      createdAt: revisionData.createdAt || new Date().toISOString()
    }
    currentRevisions.revisions.push(newRevision)
  } else {
    Object.assign(currentRevisions, body.data || body)
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      revisions: currentRevisions,
      updatedAt: new Date()
    }
  })

  return currentRevisions
}

// Helper to fetch complete document for response
async function fetchCompleteDocument(documentId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      folder: { select: { id: true, name: true } },
      uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
    }
  })

  if (!document) throw new Error('Document not found after update')

  return serializeDocument(document);
}

/**
 * @swagger
 * /api/v1/documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     description: Permanently deletes a document from storage and database
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to delete
 *     responses:
 *       200:
 *         description: Successfully deleted document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Document deleted successfully
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user doesn't have access to this document
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: documentId } = await params;

    // Get user info
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true, role: true }
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
        uploadedById: true, sharing: true, deletedAt: true,
        filePath: true,
        name: true
      }
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Verify user has access to the document's organization
    if (!canAccessDocument(user, { ...document, deletedAt: null }, 'DELETE')) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    await prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    defaultVectorSearchCache.clear();
    try {
      await defaultEmbeddingService.deleteDocumentEmbeddings(documentId, document.organizationId);
    } catch (caughtError) {
    const error = normalizeError(caughtError);
      // Keep the tombstone so all retrieval paths reject stale vector content. Retryable cleanup.
      console.error('Document vector cleanup failed', error);
      return NextResponse.json({ error: 'Document access revoked; cleanup failed. Please retry deletion.' }, { status: 503 });
    }

    console.log(`🗑️  Starting deletion process for document: ${document.name} (ID: ${documentId})`);

    // Step 1: Delete from Supabase Storage (if configured and file exists)
    // Try multiple path formats to ensure cleanup during migration
    let storageDeleted = false;
    if (supabaseAdmin && document.filePath) {
      const pathsToTry: string[] = [document.filePath];

      // Generate alternative paths to try
      const normalizedPath = normalizeFilePath(document.filePath, document.organizationId);
      if (normalizedPath !== document.filePath) {
        pathsToTry.push(normalizedPath);
      }

      // If it's new format, try old formats
      if (document.filePath.includes('/docs/') || document.filePath.includes('/images/')) {
        const pathParts = document.filePath.split('/');
        if (pathParts.length >= 2) {
          const orgId = pathParts[0];
          const subPath = pathParts.slice(1).join('/');

          // Try with documents/ prefix (migration issue)
          pathsToTry.push(`documents/${orgId}/${subPath}`);
          pathsToTry.push(`documents/${document.filePath}`);

          // Try without docs/ subfolder (old format)
          if (document.filePath.includes('/docs/')) {
            const fileName = pathParts.slice(2).join('/');
            pathsToTry.push(`${orgId}/${fileName}`);
            pathsToTry.push(`documents/${orgId}/${fileName}`);
          }
        }
      }

      console.log(`🔄 Attempting storage deletion at ${pathsToTry.length} possible paths:`, pathsToTry);

      for (const pathToTry of pathsToTry) {
        try {
          const { error: deleteError } = await supabaseAdmin.storage
            .from('documents')
            .remove([pathToTry]);

          if (!deleteError) {
            storageDeleted = true;
            console.log(`✅ Successfully deleted file from storage: ${pathToTry}`);
            break; // Stop trying other paths once we successfully delete
          } else {
            console.log(`ℹ️  Path ${pathToTry} - ${deleteError.message}`);
          }
        } catch (caughtError) {
    const error = normalizeError(caughtError);
          console.log(`ℹ️  Path ${pathToTry} failed:`, error?.message);
        }
      }

      if (!storageDeleted) {
        console.warn(`⚠️  Could not delete file from storage at any path. File may not exist or paths may be incorrect.`);
        // Continue with database deletion even if storage fails
      }
    } else {
      console.log(`ℹ️  Skipping storage deletion (Supabase not configured or no filePath)`);
    }

    // Log document deletion for audit trail (before actual deletion)
    try {
      await crudAuditLogger.logDocumentOperation(
        'DELETE',
        documentId,
        document.name,
        'unknown', // We don't have full document data here
        document, // Previous data (what we're deleting)
        null, // No current data after deletion
        {
          endpoint: `/api/v1/documents/${documentId}`,
          method: 'DELETE',
          userAgent: request.headers.get('user-agent'),
          ipAddress: getClientIP(request),
          storageDeleted,
          filePath: document.filePath
        }
      );
    } catch (auditError) {
      console.error('Failed to create document deletion audit log:', auditError);
      // Don't fail the deletion
    }

    // Step 2: Delete from Prisma Database
    await prisma.document.delete({
      where: { id: documentId }
    });

    console.log(`✅ Successfully deleted document from database: ${documentId}`);

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully',
      details: {
        storageDeleted,
        databaseDeleted: true
      }
    });

  } catch (caughtError) {
    const error = normalizeError(caughtError);
    console.error(`❌ Document deletion error:`, error);

    // Check if it's a Prisma "record not found" error
    if ('code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to delete document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
function jsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function jsonInput(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
