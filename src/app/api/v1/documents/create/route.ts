import { serializeDocument } from '@/lib/documents/document-response';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { DocumentCreatorService } from '@/lib/documents/document-creator'
import { DocumentCreationRequest } from '@/types/document-processing'

const createSchema = z.object({
  name: z.string().min(1).max(255).describe("Document name"),
  type: z.enum(['PROPOSAL', 'CONTRACT', 'CERTIFICATION', 'COMPLIANCE', 'TEMPLATE', 'OTHER', 'SOLICITATION', 'AMENDMENT', 'CAPABILITY_STATEMENT', 'PAST_PERFORMANCE']).describe("Document type"),
  content: z.string().default('').describe("Initial document content"),
  organizationId: z.string().min(1).describe("Organization identifier"),
  folderId: z.string().nullable().optional().describe("Folder ID to place the document in (null for root folder)"),
  templateId: z.string().optional().describe("Template ID to use for initial content"),
  // Direct fields (no metadata wrapper)
  tags: z.array(z.string()).default([]).describe("Document tags"),
  urgencyLevel: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  complexityScore: z.number().min(1).max(10).default(5)
})

/**
 * @swagger
 * /api/v1/documents/create:
 *   post:
 *     summary: Create a new document from scratch or template
 *     description: |
 *       Create documents from scratch or using predefined templates.
 *       Supports government contracting document types with intelligent content generation.
 *       Documents are created as editable and can be enhanced with AI analysis.
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - organizationId
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Document name
 *                 example: "Government Contract Proposal - Phase 1"
 *               type:
 *                 type: string
 *                 enum: [PROPOSAL, CONTRACT, CERTIFICATION, COMPLIANCE, TEMPLATE, OTHER, SOLICITATION, AMENDMENT, CAPABILITY_STATEMENT, PAST_PERFORMANCE]
 *                 description: Document type for template selection
 *                 example: "PROPOSAL"
 *               content:
 *                 type: string
 *                 description: Initial document content (Markdown/HTML)
 *                 example: "# Project Overview\\n\\nThis document outlines..."
 *               organizationId:
 *                 type: string
 *                 description: Organization identifier
 *                 example: "org_456def"
 *               folderId:
 *                 type: string
 *                 nullable: true
 *                 description: Folder ID to place the document in (null for root folder)
 *                 example: "folder_123"
 *               templateId:
 *                 type: string
 *                 description: Template ID for initial content
 *                 example: "gov-proposal-template"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["government", "proposal", "phase-1"]
 *               urgencyLevel:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 default: medium
 *               complexityScore:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 5
 *     responses:
 *       201:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: Generated document ID
 *                 name:
 *                   type: string
 *                   description: Document name
 *                 type:
 *                   type: string
 *                   description: Document type
 *                 content:
 *                   type: string
 *                   description: Initial content
 *                 isEditable:
 *                   type: boolean
 *                   description: Whether document can be edited
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "draft"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 metadata:
 *                   type: object
 *                   description: Document metadata and AI properties
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to organization
 *       500:
 *         description: Document creation failed
 *   get:
 *     summary: Get available document templates
 *     description: Retrieve list of available document templates for creation
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       type:
 *                         type: string
 *                       complexity:
 *                         type: number
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    console.log('📝 Received request body:', body)

    const validation = createSchema.safeParse(body)

    if (!validation.success) {
      console.error('❌ Validation failed:', validation.error.format())
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: validation.error.format(),
          receivedData: body
        },
        { status: 400 }
      )
    }

    const { name, type, content, organizationId, folderId, templateId, tags, urgencyLevel, complexityScore } = validation.data

    // Verify user access to organization
    const userOrg = await prisma.user.findFirst({
      where: {
        clerkId: userId,
        organizationId
      }
    })

    if (!userOrg) {
      return NextResponse.json(
        { error: 'Access denied to organization' },
        { status: 403 }
      )
    }

    if (folderId && folderId !== 'null') {
      const folder = await prisma.folder.findFirst({ where: { id: folderId, organizationId } });
      if (!folder) return NextResponse.json({ error: 'Target folder not found' }, { status: 404 });
    }

    // Create document creation request
    const creationRequest = DocumentCreationRequest.parse({
      name,
      type,
      content,
      organizationId,
      createdBy: userOrg.id, // Use internal user ID, not Clerk ID
      tags: tags || [],
      urgencyLevel: urgencyLevel || 'medium',
      complexityScore: complexityScore || 5,
      isEditable: true
    })

    // Initialize document creator service
    const creatorService = DocumentCreatorService.getInstance()

    // Create document using the service
    const document = await creatorService.createDocument(creationRequest, {
      templateId,
      autoSave: true,
      generateInitialContent: !content && !templateId
    })

    const savedDocument = await prisma.document.create({
      data: {
        id: document.id, organizationId, uploadedById: userOrg.id,
        folderId: folderId === 'null' ? null : folderId,
        name, uploadDate: new Date(), lastModified: new Date(), size: document.size,
        filePath: document.filePath, mimeType: document.mimeType, isEditable: true,
        extractedText: document.extractedText, summary: document.summary, tags: tags ?? [], documentType: type,
        securityClassification: document.securityClassification, workflowStatus: document.workflowStatus,
        content: JSON.parse(JSON.stringify(document.content)), processing: JSON.parse(JSON.stringify(document.processing)),
        analysis: JSON.parse(JSON.stringify(document.analysis)), entities: JSON.parse(JSON.stringify(document.entities)),
        sharing: JSON.parse(JSON.stringify(document.sharing)), revisions: JSON.parse(JSON.stringify(document.revisions)),
        embeddings: JSON.parse(JSON.stringify(document.embeddings)),
      },
    });
    return NextResponse.json({
      ...serializeDocument(savedDocument), document: serializeDocument(savedDocument),
      urgencyLevel, complexityScore, templateUsed: templateId,
    }, { status: 201 });

  } catch (error) {
    console.error('Document creation error:', error)
    return NextResponse.json(
      {
        error: 'Document creation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize document creator service
    const creatorService = DocumentCreatorService.getInstance()

    // Get available templates
    const templates = await creatorService.getAvailableTemplates()

    return NextResponse.json({
      templates: templates.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        type: template.type,
        complexity: template.metadata.complexityScore,
        urgencyLevel: template.metadata.urgencyLevel,
        tags: template.metadata.tags,
        preview: template.content.substring(0, 200) + (template.content.length > 200 ? '...' : '')
      }))
    })

  } catch (error) {
    console.error('Template retrieval error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve templates' },
      { status: 500 }
    )
  }
}
