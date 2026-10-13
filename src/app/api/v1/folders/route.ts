import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { TenantContext } from '@/lib/db/tenant-context'

/**
 * @swagger
 * /api/v1/folders:
 *   get:
 *     summary: Get all folders for the authenticated user's organization
 *     description: Retrieves all folders within the user's organization with hierarchical structure
 *     tags: [Folders]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *         description: Filter folders by parent ID (null for root folders)
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted folders
 *       - in: query
 *         name: flat
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return flat array instead of hierarchical structure
 *     responses:
 *       200:
 *         description: Successfully retrieved folders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 folders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Folder'
 *                 count:
 *                   type: number
 *                   example: 12
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
    const parentId = searchParams.get('parentId')
    const includeDeleted = searchParams.get('includeDeleted') === 'true'
    const flat = searchParams.get('flat') === 'true'

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true, id: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Create tenant context for organization-scoped queries
    const tenantContext = new TenantContext(user.organizationId)

    // Ensure default folders exist for this organization
    await ensureDefaultFolders(user.organizationId, user.id)

    // Build query filters
    const whereClause: any = {
      organizationId: user.organizationId
    }

    // Filter by parent if specified
    if (parentId !== null) {
      whereClause.parentId = parentId === 'null' ? null : parentId
    }

    // Include soft-deleted folders if requested
    if (!includeDeleted) {
      whereClause.deletedAt = null
    }

    // Fetch folders with related data
    const folders = await prisma.folder.findMany({
      where: whereClause,
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true
          }
        },
        children: {
          where: includeDeleted ? {} : { deletedAt: null },
          select: {
            id: true,
            name: true,
            level: true
          }
        },
        documents: {
          where: includeDeleted ? {} : { deletedAt: null },
          select: {
            id: true
          }
        }
      },
      orderBy: [
        { isSystemFolder: 'desc' }, // System folders first
        { level: 'asc' },
        { name: 'asc' }
      ]
    })

    // Transform database folders to frontend format
    const transformedFolders = folders.map(folder => ({
      id: folder.id,
      name: folder.name,
      description: folder.description || '',
      parentId: folder.parentId,
      color: folder.color || '#6b7280',
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      isProtected: folder.isSystemFolder, // Map isSystemFolder to isProtected for frontend
      organizationId: folder.organizationId,
      
      // Additional metadata
      icon: folder.icon,
      level: folder.level,
      folderType: folder.folderType,
      isSystemFolder: folder.isSystemFolder,
      isPublic: folder.isPublic,
      path: folder.path,
      
      // Counts and relationships
      documentCount: folder.documents.length,
      childrenCount: folder.children.length,
      
      // Creator info
      createdBy: folder.createdBy ? {
        id: folder.createdBy.id,
        name: `${folder.createdBy.firstName || ''} ${folder.createdBy.lastName || ''}`.trim() || folder.createdBy.email,
        email: folder.createdBy.email
      } : null,
      
      // Parent info
      parent: folder.parent ? {
        id: folder.parent.id,
        name: folder.parent.name
      } : null
    }))

    return NextResponse.json({
      success: true,
      folders: transformedFolders,
      count: transformedFolders.length
    })

  } catch (error) {
    console.error('Error fetching folders:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch folders' },
      { status: 500 }
    )
  }
}

/**
 * @swagger
 * /api/v1/folders:
 *   post:
 *     summary: Create a new folder
 *     description: Creates a new folder within the user's organization
 *     tags: [Folders]
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Project Documents"
 *               description:
 *                 type: string
 *                 example: "Documents for the XYZ project"
 *               parentId:
 *                 type: string
 *                 nullable: true
 *                 example: "folder_123"
 *               color:
 *                 type: string
 *                 example: "#3b82f6"
 *               icon:
 *                 type: string
 *                 example: "folder"
 *               folderType:
 *                 type: string
 *                 example: "PROPOSALS"
 *     responses:
 *       201:
 *         description: Folder created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 folder:
 *                   $ref: '#/components/schemas/Folder'
 *       400:
 *         description: Bad request - invalid input
 *       401:
 *         description: Unauthorized - user not authenticated
 *       409:
 *         description: Conflict - folder name already exists in parent
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, description, parentId, color, icon, folderType } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Folder name is required' },
        { status: 400 }
      )
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true, id: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if folder with same name exists in the same parent
    const existingFolder = await prisma.folder.findFirst({
      where: {
        organizationId: user.organizationId,
        name: name.trim(),
        parentId: parentId || null,
        deletedAt: null
      }
    })

    if (existingFolder) {
      return NextResponse.json(
        { success: false, error: 'Folder with this name already exists in the same location' },
        { status: 409 }
      )
    }

    // Calculate level and path
    let level = 0
    let path: string[] = []
    
    if (parentId) {
      const parentFolder = await prisma.folder.findFirst({
        where: {
          id: parentId,
          organizationId: user.organizationId,
          deletedAt: null
        },
        select: { level: true, path: true, name: true }
      })

      if (!parentFolder) {
        return NextResponse.json(
          { success: false, error: 'Parent folder not found' },
          { status: 404 }
        )
      }

      level = parentFolder.level + 1
      path = [...parentFolder.path, parentFolder.name]
    }

    // Create the folder
    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        parentId: parentId || null,
        color: color || '#6b7280',
        icon: icon || null,
        folderType: folderType || null,
        level,
        path,
        organizationId: user.organizationId,
        createdById: user.id,
        isSystemFolder: false,
        isPublic: false
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        parent: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    // Transform to frontend format
    const transformedFolder = {
      id: folder.id,
      name: folder.name,
      description: folder.description || '',
      parentId: folder.parentId,
      color: folder.color || '#6b7280',
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      isProtected: folder.isSystemFolder,
      organizationId: folder.organizationId,
      icon: folder.icon,
      level: folder.level,
      folderType: folder.folderType,
      isSystemFolder: folder.isSystemFolder,
      isPublic: folder.isPublic,
      path: folder.path,
      documentCount: 0,
      childrenCount: 0,
      createdBy: folder.createdBy ? {
        id: folder.createdBy.id,
        name: `${folder.createdBy.firstName || ''} ${folder.createdBy.lastName || ''}`.trim() || folder.createdBy.email,
        email: folder.createdBy.email
      } : null,
      parent: folder.parent ? {
        id: folder.parent.id,
        name: folder.parent.name
      } : null
    }

    return NextResponse.json({
      success: true,
      folder: transformedFolder
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating folder:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create folder' },
      { status: 500 }
    )
  }
}

// Helper function to ensure default folders exist
async function ensureDefaultFolders(organizationId: string, userId: string) {
  const defaultFolders = [
    {
      name: 'My Documents',
      description: 'Your personal document collection',
      color: '#3b82f6',
      folderType: 'DOCUMENTS',
      icon: 'file-text'
    },
    {
      name: 'Shared Documents',
      description: 'Documents shared with your team',
      color: '#10b981',
      folderType: 'DOCUMENTS',
      icon: 'users'
    },
    {
      name: 'Templates',
      description: 'Document templates for quick access',
      color: '#8b5cf6',
      folderType: 'TEMPLATES',
      icon: 'template'
    }
  ]

  for (const folderData of defaultFolders) {
    // Check if folder already exists
    const existingFolder = await prisma.folder.findFirst({
      where: {
        organizationId,
        name: folderData.name,
        isSystemFolder: true,
        deletedAt: null
      }
    })

    if (!existingFolder) {
      await prisma.folder.create({
        data: {
          ...folderData,
          organizationId,
          createdById: userId,
          parentId: null,
          level: 0,
          path: [],
          isSystemFolder: true,
          isPublic: false
        }
      })
    }
  }
}
