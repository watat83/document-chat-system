import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { serializeDocument } from '@/lib/documents/document-response'
import { getFileTypeFromMimeType, formatFileSize } from '@/components/documents/file-type-utils'
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger'

/**
 * @swagger
 * /api/v1/documents:
 *   get:
 *     summary: Get all documents for the authenticated user's organization
 *     description: Retrieves all documents within the user's organization, optionally filtered by folder
 *     tags: [Documents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *         description: Filter documents by folder ID (null for root folder)
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted documents
 *     responses:
 *       200:
 *         description: Successfully retrieved documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 *                 count:
 *                   type: number
 *                   example: 42
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user not part of organization
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const folderId = searchParams.get('folderId')
    const includeDeleted = searchParams.get('includeDeleted') === 'true'
    const searchQuery = searchParams.get('search')

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
      select: { organizationId: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Create tenant context for organization-scoped queries


    // Build query filters
    const whereClause: any = {
      organizationId: user.organizationId
    }

    // Filter by folder if specified
    if (folderId !== null) {
      whereClause.folderId = folderId === 'null' ? null : folderId
    }

    // Include soft-deleted documents if requested
    if (!includeDeleted) {
      whereClause.deletedAt = null
    }

    // Add search filter if provided
    if (searchQuery && searchQuery.trim().length > 0) {
      const searchTerm = searchQuery.trim()
      // Replace the entire whereClause structure for search
      const baseWhere = { ...whereClause }
      whereClause.AND = [
        baseWhere,
        {
          OR: [
            {
              name: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            },
            {
              mimeType: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            },
            {
              extractedText: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            },
            {
              description: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          ]
        }
      ]
      // Remove the already added conditions from root level
      delete whereClause.organizationId
      delete whereClause.folderId
      delete whereClause.deletedAt
    }

    // Fetch documents with new consolidated JSON structure
    const documents = await prisma.document.findMany({
      where: whereClause,
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        folder: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    })

    const directMappedDocuments = documents.map(serializeDocument)

    return NextResponse.json({
      success: true,
      documents: directMappedDocuments,
      count: directMappedDocuments.length
    })

  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}

// TRANSFORMATION LAYER COMPLETELY ELIMINATED
// All database values now map DIRECTLY to interface with ZERO transformations
