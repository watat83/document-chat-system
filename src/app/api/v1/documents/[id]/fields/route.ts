import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { Prisma, DocumentType, SecurityClassification, WorkflowStatus } from '@prisma/client'
import { jsonObject, processingTransaction } from '@/lib/documents/processing-state'
import { serializeDocument } from '@/lib/documents/document-response'

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

  documentType: z.nativeEnum(DocumentType).optional()
    .describe("Update document type (CONTRACT, RFP, PROPOSAL, etc.)"),

  securityClassification: z.nativeEnum(SecurityClassification).optional()
    .describe("Update security classification level"),

  workflowStatus: z.nativeEnum(WorkflowStatus).optional()
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

    const updatedFields = Object.keys(updateData);
    if (!updatedFields.length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    const updatedDocument = await processingTransaction(prisma, async tx => {
      const current = await tx.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
      if (!current) throw new Error('Document not found');
      const { setAsideType, naicsCodes, ...fields } = updateData;
      const analysis = jsonObject(current.analysis);
      const metadata = jsonObject(analysis.metadata);
      return tx.document.update({ where: { id: documentId }, data: {
        ...fields,
        ...((setAsideType !== undefined || naicsCodes !== undefined) && { analysis: { ...analysis, metadata: { ...metadata, ...(setAsideType !== undefined && { setAsideType }), ...(naicsCodes !== undefined && { naicsCodes }) } } satisfies Prisma.InputJsonObject }),
      }, include: { folder: { select: { id: true, name: true } }, uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } } } });
    });
    const responseDocument = serializeDocument(updatedDocument);

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
