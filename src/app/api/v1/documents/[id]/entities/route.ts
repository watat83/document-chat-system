import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

const createEntitySchema = z.object({
  text: z.string().min(1)
    .describe("The extracted entity text. Must be a non-empty string."),
  
  type: z.enum(['PERSON', 'ORGANIZATION', 'LOCATION', 'DATE', 'MONEY', 'MISC'])
    .describe("Type of entity: 'PERSON' for people names, 'ORGANIZATION' for companies/agencies, 'LOCATION' for places, 'DATE' for dates/times, 'MONEY' for monetary values, 'MISC' for other entities."),
  
  confidence: z.number().min(0).max(1)
    .describe("Confidence score between 0 and 1, where 1 is highest confidence."),
  
  startOffset: z.number().min(0)
    .describe("Character offset where the entity starts in the document text."),
  
  endOffset: z.number().min(0)
    .describe("Character offset where the entity ends in the document text."),
  
  context: z.string().optional()
    .describe("Optional surrounding context text that helps identify the entity.")
})

const updateEntitySchema = z.object({
  text: z.string().min(1).optional()
    .describe("Updated entity text."),
  
  type: z.enum(['PERSON', 'ORGANIZATION', 'LOCATION', 'DATE', 'MONEY', 'MISC']).optional()
    .describe("Updated entity type."),
  
  confidence: z.number().min(0).max(1).optional()
    .describe("Updated confidence score."),
  
  context: z.string().optional()
    .describe("Updated context information.")
})

/**
 * @swagger
 * /api/v1/documents/{id}/entities:
 *   get:
 *     summary: Get document entities
 *     description: Retrieve all extracted entities from a specific document
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *         example: "doc_123abc"
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [PERSON, ORGANIZATION, LOCATION, DATE, MONEY, MISC]
 *         description: Filter entities by type
 *         example: "PERSON"
 *       - name: minConfidence
 *         in: query
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Minimum confidence threshold (0-1)
 *         example: 0.7
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Maximum number of entities to return
 *     responses:
 *       200:
 *         description: Document entities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 entities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       text:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [PERSON, ORGANIZATION, LOCATION, DATE, MONEY, MISC]
 *                       confidence:
 *                         type: number
 *                         minimum: 0
 *                         maximum: 1
 *                       startOffset:
 *                         type: number
 *                       endOffset:
 *                         type: number
 *                       context:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: number
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalEntities:
 *                       type: number
 *                     byType:
 *                       type: object
 *                       additionalProperties:
 *                         type: number
 *                     averageConfidence:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to document
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 *   post:
 *     summary: Add document entity
 *     description: Add a new extracted entity to a document
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - type
 *               - confidence
 *               - startOffset
 *               - endOffset
 *             properties:
 *               text:
 *                 type: string
 *                 description: The extracted entity text
 *                 example: "John Smith"
 *               type:
 *                 type: string
 *                 enum: [PERSON, ORGANIZATION, LOCATION, DATE, MONEY, MISC]
 *                 description: Type of entity
 *                 example: "PERSON"
 *               confidence:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *                 description: Confidence score
 *                 example: 0.95
 *               startOffset:
 *                 type: number
 *                 minimum: 0
 *                 description: Start character position
 *                 example: 125
 *               endOffset:
 *                 type: number
 *                 minimum: 0
 *                 description: End character position
 *                 example: 135
 *               context:
 *                 type: string
 *                 description: Optional context information
 *                 example: "The project manager John Smith will oversee"
 *     responses:
 *       201:
 *         description: Entity created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId } = params
    const searchParams = request.nextUrl.searchParams
    
    // Parse query parameters
    const type = searchParams.get('type') as any
    const minConfidence = searchParams.get('minConfidence')
    const limit = parseInt(searchParams.get('limit') || '100')

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify document exists and user has access
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: user.organizationId
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if user has permission to view document (must have READ or be owner)
    const canViewDocument = document.uploadedById === user.id || 
      (await prisma.documentPermission.findFirst({
        where: {
          documentId,
          userId: user.id,
          permission: { in: ['READ', 'WRITE', 'DELETE', 'SHARE', 'COMMENT'] }
        }
      }))

    if (!canViewDocument) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Build query filters
    const whereClause: any = { documentId }
    
    if (type) {
      whereClause.type = type
    }
    
    if (minConfidence) {
      whereClause.confidence = { gte: parseFloat(minConfidence) }
    }

    // Get entities with filtering and limiting
    const entities = await prisma.extractedEntity.findMany({
      where: whereClause,
      orderBy: [
        { confidence: 'desc' },
        { startOffset: 'asc' }
      ],
      take: Math.min(limit, 1000) // Cap at 1000 entities max
    })

    // Get summary statistics
    const allEntities = await prisma.extractedEntity.findMany({
      where: { documentId },
      select: { type: true, confidence: true }
    })

    const summary = {
      totalEntities: allEntities.length,
      byType: allEntities.reduce((acc, entity) => {
        acc[entity.type] = (acc[entity.type] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      averageConfidence: allEntities.length > 0 
        ? allEntities.reduce((sum, entity) => sum + entity.confidence, 0) / allEntities.length 
        : 0
    }

    const formattedEntities = entities.map(entity => ({
      id: entity.id,
      text: entity.text,
      type: entity.type,
      confidence: entity.confidence,
      startOffset: entity.startOffset,
      endOffset: entity.endOffset,
      context: entity.context,
      createdAt: entity.createdAt.toISOString()
    }))

    return NextResponse.json({
      success: true,
      entities: formattedEntities,
      count: formattedEntities.length,
      summary
    })

  } catch (error) {
    console.error('Error fetching document entities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const permissionError = await guardDocumentMutation((await props.params).id, 'WRITE');
  if (permissionError) return permissionError;

  const params = await props.params;
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId } = params
    const body = await request.json()
    const validation = createEntitySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.format() },
        { status: 400 }
      )
    }

    const { text, type, confidence, startOffset, endOffset, context } = validation.data

    // Validate offset ranges
    if (endOffset <= startOffset) {
      return NextResponse.json(
        { error: 'endOffset must be greater than startOffset' },
        { status: 400 }
      )
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, organizationId: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify document exists and user has access
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: user.organizationId
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check if user has permission to modify document (must have WRITE or be owner)
    const canModifyDocument = document.uploadedById === user.id || 
      (await prisma.documentPermission.findFirst({
        where: {
          documentId,
          userId: user.id,
          permission: { in: ['WRITE', 'DELETE'] }
        }
      }))

    if (!canModifyDocument) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Create the entity
    const newEntity = await prisma.extractedEntity.create({
      data: {
        documentId,
        text,
        type,
        confidence,
        startOffset,
        endOffset,
        context
      }
    })

    return NextResponse.json({
      success: true,
      entity: {
        id: newEntity.id,
        text: newEntity.text,
        type: newEntity.type,
        confidence: newEntity.confidence,
        startOffset: newEntity.startOffset,
        endOffset: newEntity.endOffset,
        context: newEntity.context,
        createdAt: newEntity.createdAt.toISOString()
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating document entity:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}