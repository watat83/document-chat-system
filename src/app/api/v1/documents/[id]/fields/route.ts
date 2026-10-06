import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

/**
 * Document Fields Update Schema
 */
const DocumentFieldsUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional()
    .describe("Update document name"),
  
  tags: z.array(z.string().min(1).max(50)).max(20).optional()
    .describe("Update document tags (max 20 tags, 50 chars each)"),
  
  setAsideType: z.string().max(50).optional()
    .describe("Update set-aside type (8(a), HUBZone, SDVOSB, WOSB, etc.)"),
  
  naicsCodes: z.array(z.string().regex(/^\d{6}$/)).max(10).optional()
    .describe("Update NAICS codes (6-digit codes, max 10)"),
  
  description: z.string().max(1000).optional()
    .describe("Update document description (max 1000 characters)"),
  
  documentType: z.string().max(100).optional()
    .describe("Update document type (CONTRACT, RFP, PROPOSAL, etc.)"),
  
  securityClassification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).optional()
    .describe("Update security classification level"),
  
  workflowStatus: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']).optional()
    .describe("Update workflow status")
})

/**
 * @swagger
 * /api/v1/documents/{id}/fields:
 *   patch:
 *     summary: Update document fields
 *     description: |
 *       Update basic document metadata fields without triggering processing.
 *       This endpoint is for updating user-managed fields like tags, description,
 *       set-aside type, NAICS codes, etc.
 *     tags:
 *       - Document Updates
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID to update
 *         example: "doc_123abc"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Update document name
 *                 example: "Updated Contract Document.pdf"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   maxLength: 50
 *                 maxItems: 20
 *                 description: Update document tags
 *                 example: ["contract", "reviewed", "government"]
 *               setAsideType:
 *                 type: string
 *                 maxLength: 50
 *                 description: Update set-aside type
 *                 example: "8(a)"
 *               naicsCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   pattern: "^\\d{6}$"
 *                 maxItems: 10
 *                 description: Update NAICS codes (6-digit)
 *                 example: ["541511", "541512"]
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Update document description
 *                 example: "Government IT services contract for cloud infrastructure"
 *               documentType:
 *                 type: string
 *                 maxLength: 100
 *                 description: Update document type
 *                 example: "CONTRACT"
 *               securityClassification:
 *                 type: string
 *                 enum: [PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED]
 *                 description: Update security classification
 *                 example: "INTERNAL"
 *               workflowStatus:
 *                 type: string
 *                 enum: [DRAFT, REVIEW, APPROVED, PUBLISHED, ARCHIVED]
 *                 description: Update workflow status
 *                 example: "APPROVED"
 *           example:
 *             name: "Updated Government Contract.pdf"
 *             tags: ["contract", "approved", "government"]
 *             setAsideType: "8(a)"
 *             naicsCodes: ["541511", "541512"]
 *             description: "Updated description for IT services contract"
 *             documentType: "CONTRACT"
 *             securityClassification: "INTERNAL"
 *     responses:
 *       200:
 *         description: Document fields updated successfully
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
 *                   example: "Document fields updated successfully"
 *                 updated:
 *                   type: object
 *                   properties:
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["name", "tags", "setAsideType"]
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 document:
 *                   type: object
 *                   description: Updated document with new field values
 *       400:
 *         description: Bad request - invalid field values
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const permissionError = await guardDocumentMutation((await params).id, 'WRITE');
  if (permissionError) return permissionError;

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await params
    const documentId = resolvedParams.id

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = DocumentFieldsUpdateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Invalid field data', 
          details: validation.error.format() 
        },
        { status: 400 }
      )
    }

    const updateData = validation.data

    console.log('📝 Document Fields Update:', {
      documentId,
      fields: Object.keys(updateData)
    })

    // Get user info
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get document and verify access
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        uploadedById: true,
        name: true,
        tags: true,
        setAsideType: true,
        naicsCodes: true,
        description: true,
        documentType: true,
        securityClassification: true,
        workflowStatus: true
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Verify user has access to the document's organization
    if (document.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if user has permission to update fields
    // For now, allow document owner and users in same organization
    // This could be enhanced with more granular permissions
    const canUpdate = document.uploadedById === user.id || true // Allow org members

    if (!canUpdate) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update document fields' }, 
        { status: 403 }
      )
    }

    // Prepare update data - only include fields that are provided
    const documentUpdate: any = {}
    const updatedFields: string[] = []

    if (updateData.name !== undefined) {
      documentUpdate.name = updateData.name
      updatedFields.push('name')
    }
    
    if (updateData.tags !== undefined) {
      documentUpdate.tags = updateData.tags
      updatedFields.push('tags')
    }
    
    if (updateData.setAsideType !== undefined) {
      documentUpdate.setAsideType = updateData.setAsideType
      updatedFields.push('setAsideType')
    }
    
    if (updateData.naicsCodes !== undefined) {
      documentUpdate.naicsCodes = updateData.naicsCodes
      updatedFields.push('naicsCodes')
    }
    
    if (updateData.description !== undefined) {
      documentUpdate.description = updateData.description
      updatedFields.push('description')
    }
    
    if (updateData.documentType !== undefined) {
      documentUpdate.documentType = updateData.documentType
      updatedFields.push('documentType')
    }
    
    if (updateData.securityClassification !== undefined) {
      documentUpdate.securityClassification = updateData.securityClassification
      updatedFields.push('securityClassification')
    }
    
    if (updateData.workflowStatus !== undefined) {
      documentUpdate.workflowStatus = updateData.workflowStatus
      updatedFields.push('workflowStatus')
    }

    // Always update timestamp
    documentUpdate.updatedAt = new Date()

    if (updatedFields.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    // Update the document
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: documentUpdate,
      include: {
        folder: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    })

    console.log('✅ Document fields updated:', {
      documentId,
      updatedFields,
      changes: updatedFields.map(field => ({
        field,
        oldValue: (document as any)[field],
        newValue: (updatedDocument as any)[field]
      }))
    })

    // Format response
    const responseDocument = {
      id: updatedDocument.id,
      name: updatedDocument.name,
      tags: updatedDocument.tags || [],
      setAsideType: updatedDocument.setAsideType,
      naicsCodes: updatedDocument.naicsCodes || [],
      description: updatedDocument.description,
      documentType: updatedDocument.documentType,
      securityClassification: updatedDocument.securityClassification,
      workflowStatus: updatedDocument.workflowStatus,
      updatedAt: updatedDocument.updatedAt.toISOString(),
      folder: updatedDocument.folder,
      uploadedBy: updatedDocument.uploadedBy,
      opportunity: updatedDocument.opportunity
    }

    return NextResponse.json({
      success: true,
      message: `Document fields updated successfully`,
      updated: {
        fields: updatedFields,
        timestamp: new Date().toISOString(),
        changes: updatedFields.length
      },
      document: responseDocument
    })

  } catch (error) {
    console.error('❌ Document fields update error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update document fields',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}