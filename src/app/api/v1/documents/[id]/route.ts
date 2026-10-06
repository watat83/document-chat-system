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
import { randomBytes } from 'crypto';
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

    // Transform the document to match the current frontend format (NO metadata field)
    // Use actual database fields and proper type derivation
    const getFileTypeFromMimeType = (mimeType: string, fileName: string) => {
      if (!mimeType && fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        return ext || 'unknown';
      }
      return mimeType?.split('/')[0] || 'unknown';
    };

    // Parse JSON fields safely
    const content = (document.content as any) || { sections: [], tables: [], images: [] }
    const entities = (document.entities as any) || { entities: [] }
    const sharing = (document.sharing as any) || { permissions: [], share: null, shareViews: [], comments: [] }
    const processing = (document.processing as any) || { currentStatus: 'COMPLETED', progress: 100, events: [] }
    const analysis = (document.analysis as any) || { contract: null, compliance: null }
    const embeddings = (document.embeddings as any) || { vectors: [] }

    const formattedDocument = {
      // Core document fields
      id: document.id,
      name: document.name,
      folderId: document.folderId,
      size: document.size || 0,
      mimeType: document.mimeType || 'application/octet-stream',
      organizationId: document.organizationId,
      uploadedById: document.uploadedById,
      description: document.description,
      documentType: document.documentType,
      securityClassification: document.securityClassification,
      workflowStatus: document.workflowStatus,
      tags: document.tags || [],
      isEditable: document.isEditable,
      
      // Extracted content
      extractedText: document.extractedText,
      summary: document.summary,
      
      // Computed/derived fields
      type: getFileTypeFromMimeType(document.mimeType, document.name),
      filePath: `/api/v1/documents/${document.id}/download`,
      uploadDate: document.uploadDate?.toISOString() || document.createdAt.toISOString(),
      lastModified: document.lastModified.toISOString(),
      updatedBy: document.uploadedBy ? 
        `${document.uploadedBy.firstName || ''} ${document.uploadedBy.lastName || ''}`.trim() || document.uploadedBy.email : 
        'Unknown',
      
      // Processing status from JSON field
      status: processing.currentStatus,
      progress: processing.progress,
      processedAt: processing.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp,
      processingError: processing.events?.find((e: any) => e.success === false)?.error,
      
      // JSON field data (consolidated structure)
      content: content,
      entities: entities,
      sharing: sharing,
      processing: processing,
      analysis: analysis,
      embeddings: embeddings,
      
      // Relations
      uploadedBy: document.uploadedBy,
      folder: document.folder,
      opportunity: document.opportunity,
      
      // Legacy compatibility (construct from JSON fields)
      aiData: {
        status: {
          status: processing.currentStatus,
          progress: processing.progress,
          startedAt: document.createdAt.toISOString(),
          completedAt: processing.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp,
          retryCount: processing.events?.filter((e: any) => e.success === false)?.length || 0
        },
        content: {
          extractedText: document.extractedText || '',
          summary: document.summary || '',
          keywords: [],
          keyPoints: [],
          actionItems: [],
          questions: []
        },
        structure: {
          sections: content.sections || [],
          tables: content.tables || [],
          images: content.images || [],
          ocrResults: []
        },
        analysis: {
          qualityScore: analysis.contract?.qualityScore || 0,
          readabilityScore: analysis.compliance?.score || 0,
          complexityMetrics: { readabilityScore: analysis.compliance?.score || 0 },
          entities: entities.entities || [],
          confidence: 0.8,
          suggestions: analysis.compliance?.recommendations || []
        },
        processedAt: processing.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp || new Date().toISOString(),
        modelVersion: 'consolidated-v2.0',
        processingHistory: processing.events || []
      },
      
      // Security analysis
      securityAnalysis: {
        classification: document.securityClassification,
        piiDetected: false,
        piiTypes: [],
        complianceStatus: analysis.compliance?.status || 'compliant',
        redactionNeeded: false
      }
    };

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
        document.type || 'unknown',
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

  } catch (error) {
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
export async function PUT(
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
    const { name, folderId, tags, documentType, contractAnalysis, description, entities } = body

    console.log('🚨🚨🚨 API RECEIVED DATA:')
    console.log('  - documentId:', documentId)
    console.log('  - tags:', tags, 'type:', typeof tags, 'isArray:', Array.isArray(tags))
    console.log('  - entities:', entities, 'type:', typeof entities, 'isArray:', Array.isArray(entities))
    console.log('  - contractAnalysis:', contractAnalysis)
    console.log('  - body_keys:', Object.keys(body))
    console.log('  - FULL BODY:', JSON.stringify(body, null, 2))

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
        uploadedById: true, sharing: true, deletedAt: true,
        folderId: true,
        name: true,
        mimeType: true,
        size: true,
        extractedText: true,
        summary: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!existingDocument) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the document's organization
    if (!canAccessDocument(user, existingDocument, 'WRITE')) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // If moving to a different folder, verify the target folder exists and user has access
    if (folderId !== undefined && folderId !== existingDocument.folderId) {
      if (folderId !== null) {
        const targetFolder = await prisma.folder.findUnique({
          where: { id: folderId },
          select: { id: true, organizationId: true }
        })

        if (!targetFolder) {
          return NextResponse.json(
            { success: false, error: 'Target folder not found' },
            { status: 404 }
          )
        }

        if (targetFolder.organizationId !== user.organizationId) {
          return NextResponse.json(
            { success: false, error: 'Access denied to target folder' },
            { status: 403 }
          )
        }
      }
    }

    // Build the update data object
    const updateData = {
      ...(name && { name: name }),
      ...(folderId !== undefined && { folderId }),
      ...(tags !== undefined && { tags: tags }),
      ...(documentType && { documentType: documentType }),
      ...(description && { description: description }),
      updatedAt: new Date()
    }

    console.log('🚨 FINAL UPDATE DATA BEING SENT TO DATABASE:', JSON.stringify(updateData, null, 2))
    
    // Update the document
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: updateData
    })

    console.log('🚨 DATABASE UPDATE RESULT:')
    console.log('  - updatedDocument.tags:', updatedDocument.tags)
    
    // Handle contract analysis update separately
    if (contractAnalysis) {
      // Update analysis JSON field with contract data
      const existingDocument = await prisma.document.findUnique({
        where: { id: documentId },
        select: { analysis: true }
      })
      
      const currentAnalysis = (existingDocument?.analysis as any) || {}
      const updatedAnalysis = {
        ...currentAnalysis,
        contract: {
          id: currentAnalysis.contract?.id || `contract_${documentId}`,
          contractType: contractAnalysis.contractType || 'OTHER',
          estimatedValue: contractAnalysis.estimatedValue || null,
          timeline: contractAnalysis.timeline || null,
          requirements: contractAnalysis.requirements || [],
          risks: contractAnalysis.risks || [],
          opportunities: contractAnalysis.opportunities || [],
          keyTerms: contractAnalysis.keyTerms || [],
          deadlines: contractAnalysis.deadlines || [],
          parties: contractAnalysis.parties || [],
          createdAt: currentAnalysis.contract?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
      
      await prisma.document.update({
        where: { id: documentId },
        data: { analysis: updatedAnalysis }
      })
    }

    // Handle entities update separately
    if (entities !== undefined && Array.isArray(entities)) {
      console.log('🔄 UPDATING ENTITIES:', entities)
      
      // Note: Entities are now stored in the document's entities JSON field
      // No separate entity model operations needed
      
      // Prepare entities data for JSON field storage
      if (entities.length > 0) {
        const entityData = entities.map((entity, index) => {
          const entityType = entity.type.toUpperCase() as 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'MISC'
          return {
            documentId: documentId,
            text: entity.value || entity.text || 'Unknown',
            type: ['PERSON', 'ORGANIZATION', 'LOCATION', 'DATE', 'MONEY', 'MISC'].includes(entityType) ? entityType : 'MISC',
            confidence: 1.0, // User-edited entities have full confidence
            startOffset: index * 10, // Arbitrary offsets for user-created entities
            endOffset: (index * 10) + (entity.value || entity.text || 'Unknown').length,
            context: `User-defined entity #${index + 1}`
          }
        })
        
        // Update the document's entities JSON field instead of creating separate records
        await prisma.document.update({
          where: { id: documentId },
          data: {
            entities: { entities: entityData }
          }
        })
        
        console.log('✅ ENTITIES UPDATED:', entityData.length, 'entities stored in JSON field')
      }
    }

    // Fetch the complete updated document with all relations
    const completeDocument = await prisma.document.findUnique({
      where: { id: documentId },
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
        },
        // contractAnalysis moved to analysis JSON field
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

    // Transform the document to match the current frontend format (same as GET)
    const getFileTypeFromMimeType = (mimeType: string, fileName: string) => {
      if (!mimeType && fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase()
        return ext || 'unknown'
      }
      return mimeType?.split('/')[0] || 'unknown'
    }

    const transformedDocument = {
      // Direct Prisma field mappings
      id: completeDocument.id,
      name: completeDocument.name,
      folderId: completeDocument.folderId,
      size: completeDocument.size || 0,
      mimeType: completeDocument.mimeType || 'application/octet-stream',
      organizationId: completeDocument.organizationId,
      uploadedById: completeDocument.uploadedById,
      status: ((completeDocument.processing as any)?.currentStatus || 'PENDING'),
      description: completeDocument.description,
      documentType: completeDocument.documentType,
      workflowStatus: completeDocument.workflowStatus,
      processedAt: ((completeDocument.processing as any)?.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp),
      processingError: ((completeDocument.processing as any)?.events?.find((e: any) => e.success === false)?.error),
      securityClassification: completeDocument.securityClassification,
      tags: completeDocument.tags || [],
      // Computed/derived fields
      type: getFileTypeFromMimeType(completeDocument.mimeType, completeDocument.name),
      filePath: `/api/v1/documents/${completeDocument.id}/download`,
      uploadDate: completeDocument.createdAt.toISOString(),
      lastModified: completeDocument.updatedAt.toISOString(),
      updatedBy: completeDocument.uploadedBy ? 
        `${completeDocument.uploadedBy.firstName || ''} ${completeDocument.uploadedBy.lastName || ''}`.trim() || completeDocument.uploadedBy.email : 
        'Unknown',
      isEditable: false,
      
      // AI Data (single source of truth - NO metadata field)
      aiData: {
        status: {
          status: ((completeDocument.processing as any)?.currentStatus || 'PENDING'),
          progress: ((completeDocument.processing as any)?.currentStatus === 'COMPLETED' ? 100 : (completeDocument.processing as any)?.currentStatus === 'PROCESSING' ? 50 : 0),
          startedAt: completeDocument.createdAt.toISOString(),
          completedAt: ((completeDocument.processing as any)?.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp),
          retryCount: 0
        },
        content: {
          extractedText: completeDocument.extractedText || '',
          summary: completeDocument.summary || '',
          keywords: (completeDocument.content as any)?.keywords || (completeDocument.aiData as any)?.content?.keywords || [],
          keyPoints: (completeDocument.aiData as any)?.content?.keyPoints || [],
          actionItems: (completeDocument.aiData as any)?.content?.actionItems || [],
          questions: (completeDocument.aiData as any)?.content?.questions || []
        },
        structure: {
          sections: ((completeDocument.content as any)?.sections || []).map((section: any) => ({
            title: section.title,
            content: section.content,
            pageNumber: section.pageNumber || 0
          })),
          tables: ((completeDocument.content as any)?.tables || []).map((table: any) => ({
            headers: table.headers,
            rows: table.rows as string[][],
            pageNumber: table.pageNumber || 0
          })),
          images: ((completeDocument.content as any)?.images || []).map((image: any) => ({
            id: image.id,
            description: image.description,
            altText: image.altText,
            imageType: image.imageType,
            pageNumber: image.pageNumber || 0,
            imageOrder: image.imageOrder || 0,
            filePath: image.filePath,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            extractedText: image.extractedText,
            extractedData: image.extractedData,
            boundingBox: image.boundingBox,
            fileSize: image.fileSize,
            quality: image.quality,
            isOcrProcessed: image.isOcrProcessed
          })),
          ocrResults: []
        },
        analysis: {
          qualityScore: (completeDocument.aiData as any)?.analysis?.qualityScore || 0,
          readabilityScore: (completeDocument.aiData as any)?.analysis?.readabilityScore || 0,
          complexityMetrics: { readabilityScore: (completeDocument.aiData as any)?.analysis?.readabilityScore || 0 },
          entities: ((completeDocument.entities as any)?.entities || []).map((entity: any) => ({
            text: entity.text,
            type: entity.type.toLowerCase() as 'person' | 'organization' | 'location' | 'date' | 'money' | 'misc',
            confidence: entity.confidence,
            startOffset: entity.startOffset,
            endOffset: entity.endOffset
          })),
          confidence: 0.8,
          suggestions: (completeDocument.aiData as any)?.analysis?.suggestions || (completeDocument.analysis as any)?.compliance?.recommendations || []
        },
        
        // Security Analysis (from stored AI data)
        security: (completeDocument.aiData as any)?.security || {
          classification: completeDocument.securityClassification || 'PUBLIC',
          sensitiveDataDetected: false,
          sensitiveDataTypes: [],
          securityRisks: [],
          complianceIssues: [],
          recommendations: [],
          confidenceScore: 0
        },
        
        // Contract Analysis (moved into aiData)
        contractAnalysis: (completeDocument.analysis as any)?.contract ? {
          contractType: (completeDocument.analysis as any).contract.contractType,
          estimatedValue: (completeDocument.analysis as any).contract.estimatedValue,
          timeline: (completeDocument.analysis as any).contract.timeline,
          requirements: (completeDocument.analysis as any).contract.requirements,
          risks: (completeDocument.analysis as any).contract.risks,
          opportunities: (completeDocument.analysis as any).contract.opportunities,
          deadlines: (completeDocument.analysis as any).contract.deadlines || []
        } : undefined,
        
        // Compliance Check (moved to analysis JSON field)
        complianceCheck: (completeDocument.analysis as any)?.compliance ? {
          status: (completeDocument.analysis as any).compliance.status.toLowerCase() as 'compliant' | 'non-compliant' | 'partial',
          issues: (completeDocument.analysis as any).compliance.issues,
          recommendations: (completeDocument.analysis as any).compliance.recommendations,
          lastCheckedAt: (completeDocument.analysis as any).compliance.lastCheckedAt
        } : undefined,
        
        // Vector Properties (moved into aiData where it belongs)
        vectorProperties: {
          chunks: [],
          embeddings: ((completeDocument.embeddings as any)?.vectors || []).map((vector: any) => ({
            chunkId: vector.id,
            vector: vector.vector || [],
            model: vector.model || 'text-embedding-ada-002',
            dimensions: vector.dimensions || 1536,
            generatedAt: vector.generatedAt || completeDocument.createdAt.toISOString()
          })),
          lastIndexedAt: completeDocument.processedAt?.toISOString(),
          indexVersion: 'v1.0'
        },
        
        processedAt: completeDocument.processedAt?.toISOString() || completeDocument.updatedAt.toISOString(),
        modelVersion: 'database-v1',
        processingHistory: [{
          timestamp: completeDocument.createdAt.toISOString(),
          event: 'Document Updated',
          success: true
        }]
      },
      
      // Security Analysis (separate from aiData as per types definition)
      securityAnalysis: {
        classification: (completeDocument.aiData as any)?.security?.classification || completeDocument.securityClassification || 'PUBLIC',
        piiDetected: (completeDocument.aiData as any)?.security?.sensitiveDataDetected || false,
        piiTypes: (completeDocument.aiData as any)?.security?.sensitiveDataTypes || [],
        complianceStatus: (completeDocument.analysis as any)?.compliance?.status?.toLowerCase() || 'unknown',
        redactionNeeded: (completeDocument.aiData as any)?.security?.recommendations?.some((r: string) => r.toLowerCase().includes('redact')) || false
      }
    }

    return NextResponse.json({
      success: true,
      document: transformedDocument
    })

  } catch (error) {
    console.error('❌ PUT error:', error)
    console.error('❌ PUT error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
    })
    
    const errorMessage = error?.message || 'Failed to update document'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
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

    // Legacy field updates (when no section specified)
    console.log('🔧 PATCH - Legacy field update mode')
    
    // Build the update data object - only include fields that are provided
    const updateData: any = {}
    
    // Only update fields that are explicitly provided
    if (body.name !== undefined) updateData.name = body.name
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.documentType !== undefined) updateData.documentType = body.documentType
    if (body.description !== undefined) updateData.description = body.description
    if (body.content !== undefined) {
      console.log('🔧 PATCH - Updating content field:', body.content)
      updateData.content = body.content
    }
    if (body.entities !== undefined) {
      // Handle entities - they'll be updated in the entities table separately
    }
    
    // Always update the timestamp
    updateData.updatedAt = new Date()
    
    console.log('🔧 PATCH update data:', updateData)
    
    // Update the document with only the provided fields
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: updateData
    })
    
    // Handle contract analysis update separately if provided
    if (body.contractAnalysis) {
      // Update analysis JSON field with contract data
      const existingDocument = await prisma.document.findUnique({
        where: { id: documentId },
        select: { analysis: true }
      })
      
      const currentAnalysis = (existingDocument?.analysis as any) || {}
      const updatedAnalysis = {
        ...currentAnalysis,
        contract: {
          id: currentAnalysis.contract?.id || `contract_${documentId}`,
          contractType: body.contractAnalysis.contractType || 'OTHER',
          estimatedValue: body.contractAnalysis.estimatedValue || null,
          timeline: body.contractAnalysis.timeline || null,
          requirements: body.contractAnalysis.requirements || [],
          risks: body.contractAnalysis.risks || [],
          opportunities: body.contractAnalysis.opportunities || [],
          keyTerms: body.contractAnalysis.keyTerms || [],
          deadlines: body.contractAnalysis.deadlines || [],
          parties: body.contractAnalysis.parties || [],
          createdAt: currentAnalysis.contract?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
      
      await prisma.document.update({
        where: { id: documentId },
        data: { analysis: updatedAnalysis }
      })
    }

    // Handle aiData updates (for sections and other AI analysis data)
    if (body.aiData) {
      console.log('🔄 PATCH UPDATING AI DATA:', body.aiData)
      console.log('📋 Update source:', body.source)
      
      // Only update sections table if this is NOT just a processing history update
      // When source is 'processing', we're only updating processingHistory, not sections
      const shouldUpdateSections = body.source !== 'processing' && 
                                  body.aiData.structure?.sections && 
                                  Array.isArray(body.aiData.structure.sections)
      
      if (shouldUpdateSections) {
        console.log('📝 PATCH UPDATING SECTIONS:', body.aiData.structure.sections)
        
        // Note: Sections are now stored in the document's content JSON field
        // No separate section model operations needed
        
        // Update sections in JSON field
        if (body.aiData.structure.sections.length > 0) {
          const sectionsData = body.aiData.structure.sections.map((section: any, index: number) => ({
            title: section.title || `Section ${index + 1}`,
            content: section.content || '',
            pageNumber: section.pageNumber || 1,
            sectionOrder: index
          }))
          
          // Update the document's content JSON field with sections
          await prisma.document.update({
            where: { id: documentId },
            data: {
              content: {
                ...((await prisma.document.findUnique({ where: { id: documentId }, select: { content: true } }))?.content as any || {}),
                sections: sectionsData
              }
            }
          })
          
          console.log('✅ PATCH SECTIONS UPDATED:', sectionsData.length, 'sections stored in JSON field')
        }
      }
      
      // Update the aiData JSON field on the document
      try {
        console.log('🔄 PATCH UPDATING DOCUMENT WITH AI DATA:', JSON.stringify(body.aiData, null, 2))
        await prisma.document.update({
          where: { id: documentId },
          data: {
            aiData: body.aiData,
            updatedAt: new Date()
          }
        })
        console.log('✅ PATCH AI DATA UPDATED')
      } catch (aiDataError) {
        console.error('❌ PATCH AI DATA UPDATE ERROR:', aiDataError)
        throw aiDataError
      }
    }

    // Handle entities update separately if provided
    if (body.entities !== undefined && Array.isArray(body.entities)) {
      console.log('🔄 PATCH UPDATING ENTITIES:', body.entities)
      
      // Note: Entities are now stored in the document's entities JSON field
      // No separate entity model operations needed
      
      // Update entities in JSON field
      if (body.entities.length > 0) {
        const entityData = body.entities.map((entity: any, index: number) => {
          const entityType = entity.type.toUpperCase() as 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'MISC'
          return {
            text: entity.value || entity.text || 'Unknown',
            type: ['PERSON', 'ORGANIZATION', 'LOCATION', 'DATE', 'MONEY', 'MISC'].includes(entityType) ? entityType : 'MISC',
            confidence: 1.0,
            startOffset: index * 10,
            endOffset: (index * 10) + (entity.value || entity.text || 'Unknown').length,
            context: `User-defined entity #${index + 1}`
          }
        })
        
        // Update the document's entities JSON field
        await prisma.document.update({
          where: { id: documentId },
          data: {
            entities: { entities: entityData }
          }
        })
        
        console.log('✅ PATCH ENTITIES UPDATED:', entityData.length, 'entities stored in JSON field')
      }
    }

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

    // Use the same transformation as GET endpoint
    const getFileTypeFromMimeType = (mimeType: string, fileName: string) => {
      if (!mimeType && fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase()
        return ext || 'unknown'
      }
      return mimeType?.split('/')[0] || 'unknown'
    }

    const transformedDocument = {
      id: completeDocument.id,
      name: completeDocument.name,
      folderId: completeDocument.folderId,
      size: completeDocument.size || 0,
      mimeType: completeDocument.mimeType || 'application/octet-stream',
      organizationId: completeDocument.organizationId,
      uploadedById: completeDocument.uploadedById,
      status: ((completeDocument.processing as any)?.currentStatus || 'PENDING'),
      description: completeDocument.description,
      documentType: completeDocument.documentType,
      workflowStatus: completeDocument.workflowStatus,
      processedAt: ((completeDocument.processing as any)?.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp),
      processingError: ((completeDocument.processing as any)?.events?.find((e: any) => e.success === false)?.error),
      securityClassification: completeDocument.securityClassification,
      tags: completeDocument.tags || [],

      type: getFileTypeFromMimeType(completeDocument.mimeType, completeDocument.name),
      filePath: `/api/v1/documents/${completeDocument.id}/download`,
      uploadDate: completeDocument.createdAt.toISOString(),
      lastModified: completeDocument.updatedAt.toISOString(),
      updatedBy: completeDocument.uploadedBy ? 
        `${completeDocument.uploadedBy.firstName || ''} ${completeDocument.uploadedBy.lastName || ''}`.trim() || completeDocument.uploadedBy.email : 
        'Unknown',
      isEditable: false,
      
      aiData: {
        status: {
          status: ((completeDocument.processing as any)?.currentStatus || 'PENDING'),
          progress: ((completeDocument.processing as any)?.currentStatus === 'COMPLETED' ? 100 : (completeDocument.processing as any)?.currentStatus === 'PROCESSING' ? 50 : 0),
          startedAt: completeDocument.createdAt.toISOString(),
          completedAt: ((completeDocument.processing as any)?.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp),
          retryCount: 0
        },
        content: {
          extractedText: completeDocument.extractedText || '',
          summary: completeDocument.summary || '',
          keywords: (completeDocument.content as any)?.keywords || (completeDocument.aiData as any)?.content?.keywords || [],
          keyPoints: (completeDocument.aiData as any)?.content?.keyPoints || [],
          actionItems: (completeDocument.aiData as any)?.content?.actionItems || [],
          questions: (completeDocument.aiData as any)?.content?.questions || []
        },
        structure: {
          sections: ((completeDocument.content as any)?.sections || []).map((section: any) => ({
            title: section.title,
            content: section.content,
            pageNumber: section.pageNumber || 0
          })),
          tables: ((completeDocument.content as any)?.tables || []).map((table: any) => ({
            headers: table.headers,
            rows: table.rows as string[][],
            pageNumber: table.pageNumber || 0
          })),
          images: ((completeDocument.content as any)?.images || []).map((image: any) => ({
            id: image.id,
            description: image.description,
            altText: image.altText,
            imageType: image.imageType,
            pageNumber: image.pageNumber || 0,
            imageOrder: image.imageOrder || 0,
            filePath: image.filePath,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            extractedText: image.extractedText,
            extractedData: image.extractedData,
            boundingBox: image.boundingBox,
            fileSize: image.fileSize,
            quality: image.quality,
            isOcrProcessed: image.isOcrProcessed
          })),
          ocrResults: []
        },
        analysis: {
          qualityScore: (completeDocument.aiData as any)?.analysis?.qualityScore || 0,
          readabilityScore: (completeDocument.aiData as any)?.analysis?.readabilityScore || 0,
          complexityMetrics: { readabilityScore: (completeDocument.aiData as any)?.analysis?.readabilityScore || 0 },
          entities: ((completeDocument.entities as any)?.entities || []).map((entity: any) => ({
            text: entity.text,
            type: entity.type.toLowerCase() as 'person' | 'organization' | 'location' | 'date' | 'money' | 'misc',
            confidence: entity.confidence,
            startOffset: entity.startOffset,
            endOffset: entity.endOffset
          })),
          confidence: 0.8,
          suggestions: (completeDocument.aiData as any)?.analysis?.suggestions || (completeDocument.analysis as any)?.compliance?.recommendations || []
        },
        // Security Analysis (from stored AI data)
        security: (completeDocument.aiData as any)?.security || {
          classification: completeDocument.securityClassification || 'PUBLIC',
          sensitiveDataDetected: false,
          sensitiveDataTypes: [],
          securityRisks: [],
          complianceIssues: [],
          recommendations: [],
          confidenceScore: 0
        },
        contractAnalysis: (completeDocument.analysis as any)?.contract ? {
          contractType: (completeDocument.analysis as any).contract.contractType,
          estimatedValue: (completeDocument.analysis as any).contract.estimatedValue,
          timeline: (completeDocument.analysis as any).contract.timeline,
          requirements: (completeDocument.analysis as any).contract.requirements,
          risks: (completeDocument.analysis as any).contract.risks,
          opportunities: (completeDocument.analysis as any).contract.opportunities,
          deadlines: (completeDocument.analysis as any).contract.deadlines || []
        } : undefined,
        complianceCheck: completeDocument.complianceCheck ? {
          status: completeDocument.complianceCheck.status.toLowerCase() as 'compliant' | 'non-compliant' | 'partial',
          issues: completeDocument.complianceCheck.issues,
          recommendations: completeDocument.complianceCheck.recommendations,
          lastCheckedAt: completeDocument.complianceCheck.lastCheckedAt.toISOString()
        } : undefined,
        vectorProperties: {
          chunks: [],
          embeddings: ((completeDocument.embeddings as any)?.vectors || []).map((vector: any) => ({
            chunkId: vector.id,
            vector: vector.vector || [],
            model: vector.model || 'text-embedding-ada-002',
            dimensions: vector.dimensions || 1536,
            generatedAt: vector.generatedAt || completeDocument.createdAt.toISOString()
          })),
          lastIndexedAt: completeDocument.processedAt?.toISOString(),
          indexVersion: 'v1.0'
        },
        processedAt: completeDocument.processedAt?.toISOString() || completeDocument.updatedAt.toISOString(),
        modelVersion: 'database-v1',
        processingHistory: [{
          timestamp: completeDocument.createdAt.toISOString(),
          event: 'Document Updated via PATCH',
          success: true
        }]
      },
      
      // Security Analysis (separate from aiData as per types definition)
      securityAnalysis: {
        classification: (completeDocument.aiData as any)?.security?.classification || completeDocument.securityClassification || 'PUBLIC',
        piiDetected: (completeDocument.aiData as any)?.security?.sensitiveDataDetected || false,
        piiTypes: (completeDocument.aiData as any)?.security?.sensitiveDataTypes || [],
        complianceStatus: (completeDocument.analysis as any)?.compliance?.status?.toLowerCase() || 'unknown',
        redactionNeeded: (completeDocument.aiData as any)?.security?.recommendations?.some((r: string) => r.toLowerCase().includes('redact')) || false
      }
    }

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

  } catch (error) {
    console.error('❌ PATCH error:', error)
    console.error('❌ PATCH error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
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

  } catch (error) {
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

  // Parse JSON fields safely
  const content = (document.content as any) || { sections: [], tables: [], images: [] }
  const entities = (document.entities as any) || { entities: [] }
  const sharing = (document.sharing as any) || { permissions: [], share: null, shareViews: [], comments: [] }
  const processing = (document.processing as any) || { currentStatus: 'COMPLETED', progress: 100, events: [] }
  const analysis = (document.analysis as any) || { contract: null, compliance: null }
  const embeddings = (document.embeddings as any) || { vectors: [] }
  const revisions = (document.revisions as any) || { revisions: [] }

  const getFileTypeFromMimeType = (mimeType: string, fileName: string) => {
    if (!mimeType && fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase()
      return ext || 'unknown'
    }
    return mimeType?.split('/')[0] || 'unknown'
  }

  return {
    // Core document fields
    id: document.id,
    name: document.name,
    folderId: document.folderId,
    size: document.size || 0,
    mimeType: document.mimeType || 'application/octet-stream',
    organizationId: document.organizationId,
    uploadedById: document.uploadedById,
    description: document.description,
    documentType: document.documentType,
    securityClassification: document.securityClassification,
    workflowStatus: document.workflowStatus,
    tags: document.tags || [],
    isEditable: document.isEditable,

    // Extracted content
    extractedText: document.extractedText,
    summary: document.summary,
    
    // Computed/derived fields
    type: getFileTypeFromMimeType(document.mimeType, document.name),
    filePath: `/api/v1/documents/${document.id}/download`,
    uploadDate: document.uploadDate?.toISOString() || document.createdAt.toISOString(),
    lastModified: document.lastModified.toISOString(),
    updatedBy: document.uploadedBy ? 
      `${document.uploadedBy.firstName || ''} ${document.uploadedBy.lastName || ''}`.trim() || document.uploadedBy.email : 
      'Unknown',
    
    // Processing status from JSON field
    status: processing.currentStatus,
    progress: processing.progress,
    processedAt: processing.events?.find((e: any) => e.eventType === 'COMPLETED')?.timestamp,
    processingError: processing.events?.find((e: any) => e.success === false)?.error,
    
    // JSON field data (consolidated structure)
    content: content,
    entities: entities,
    sharing: sharing,
    processing: processing,
    analysis: analysis,
    embeddings: embeddings,
    revisions: revisions,
    
    // Relations
    uploadedBy: document.uploadedBy,
    folder: document.folder,
    opportunity: document.opportunity
  }
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
    } catch (error) {
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
        } catch (error) {
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

  } catch (error) {
    console.error(`❌ Document deletion error:`, error);
    
    // Check if it's a Prisma "record not found" error
    if (error?.code === 'P2025') {
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