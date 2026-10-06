import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { TenantContext } from '@/lib/db/tenant-context'

/**
 * @swagger
 * /api/v1/folders/{id}:
 *   get:
 *     summary: Get a specific folder by ID
 *     description: Retrieves detailed information about a folder
 *     tags: [Folders]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Folder ID
 *     responses:
 *       200:
 *         description: Successfully retrieved folder
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
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user doesn't have access to this folder
 *       404:
 *         description: Folder not found
 *       500:
 *         description: Internal server error
 */
export async function GET(
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

    const { id: folderId } = await params

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

    // Get folder with relationships
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
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
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            level: true
          }
        },
        documents: {
          where: { deletedAt: null },
          select: {
            id: true
          }
        }
      }
    })

    if (!folder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the folder's organization
    if (folder.organizationId !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

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
      documentCount: folder.documents.length,
      childrenCount: folder.children.length,
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
    })

  } catch (error) {
    console.error('Error fetching folder:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch folder' },
      { status: 500 }
    )
  }
}

/**
 * @swagger
 * /api/v1/folders/{id}:
 *   put:
 *     summary: Update a folder
 *     description: Updates folder information such as name, description, color, etc.
 *     tags: [Folders]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Folder ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Project Documents"
 *               description:
 *                 type: string
 *                 example: "Updated description for the project documents"
 *               color:
 *                 type: string
 *                 example: "#e11d48"
 *               icon:
 *                 type: string
 *                 example: "folder-open"
 *               parentId:
 *                 type: string
 *                 nullable: true
 *                 example: "parent_folder_123"
 *                 description: "ID of the parent folder. Use null for root level."
 *     responses:
 *       200:
 *         description: Folder updated successfully
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
 *       403:
 *         description: Forbidden - cannot update protected system folders
 *       404:
 *         description: Folder not found
 *       409:
 *         description: Conflict - folder name already exists in parent
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

    const { id: folderId } = await params
    const body = await request.json()
    const { name, description, color, icon, parentId } = body

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

    // Get existing folder to verify access and check protection
    const existingFolder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: {
        id: true,
        organizationId: true,
        isSystemFolder: true,
        name: true,
        parentId: true
      }
    })

    if (!existingFolder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the folder's organization
    if (existingFolder.organizationId !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check if protected folder is being renamed
    if (existingFolder.isSystemFolder && name && name !== existingFolder.name) {
      return NextResponse.json(
        { success: false, error: 'Cannot rename protected system folders' },
        { status: 403 }
      )
    }

    // Check for duplicate names in same parent if name is being changed
    if (name && name !== existingFolder.name) {
      const duplicateFolder = await prisma.folder.findFirst({
        where: {
          organizationId: user.organizationId,
          name: name.trim(),
          parentId: existingFolder.parentId,
          deletedAt: null,
          id: { not: folderId } // Exclude current folder from check
        }
      })

      if (duplicateFolder) {
        return NextResponse.json(
          { success: false, error: 'Folder with this name already exists in the same location' },
          { status: 409 }
        )
      }
    }

    // If moving to a different parent, validate the target parent folder
    if (parentId !== undefined && parentId !== existingFolder.parentId) {
      if (parentId !== null) {
        // Verify target parent exists and user has access
        const targetParent = await prisma.folder.findUnique({
          where: { id: parentId },
          select: { id: true, organizationId: true }
        })

        if (!targetParent) {
          return NextResponse.json(
            { success: false, error: 'Target parent folder not found' },
            { status: 404 }
          )
        }

        if (targetParent.organizationId !== user.organizationId) {
          return NextResponse.json(
            { success: false, error: 'Access denied to target parent folder' },
            { status: 403 }
          )
        }

        // Prevent moving folder into itself or its descendants
        if (parentId === folderId) {
          return NextResponse.json(
            { success: false, error: 'Cannot move folder into itself' },
            { status: 400 }
          )
        }
      }

      // Check for name conflicts in the new parent location
      const finalName = name?.trim() || existingFolder.name
      const duplicateInNewParent = await prisma.folder.findFirst({
        where: {
          organizationId: user.organizationId,
          name: finalName,
          parentId: parentId,
          deletedAt: null,
          id: { not: folderId }
        }
      })

      if (duplicateInNewParent) {
        return NextResponse.json(
          { success: false, error: 'Folder with this name already exists in the target location' },
          { status: 409 }
        )
      }
    }

    // Update the folder
    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(color && { color }),
        ...(icon !== undefined && { icon: icon || null }),
        ...(parentId !== undefined && { parentId }),
        updatedAt: new Date()
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
      id: updatedFolder.id,
      name: updatedFolder.name,
      description: updatedFolder.description || '',
      parentId: updatedFolder.parentId,
      color: updatedFolder.color || '#6b7280',
      createdAt: updatedFolder.createdAt.toISOString(),
      updatedAt: updatedFolder.updatedAt.toISOString(),
      isProtected: updatedFolder.isSystemFolder,
      organizationId: updatedFolder.organizationId,
      icon: updatedFolder.icon,
      level: updatedFolder.level,
      folderType: updatedFolder.folderType,
      isSystemFolder: updatedFolder.isSystemFolder,
      isPublic: updatedFolder.isPublic,
      path: updatedFolder.path,
      documentCount: 0, // Will be calculated if needed
      childrenCount: 0, // Will be calculated if needed
      createdBy: updatedFolder.createdBy ? {
        id: updatedFolder.createdBy.id,
        name: `${updatedFolder.createdBy.firstName || ''} ${updatedFolder.createdBy.lastName || ''}`.trim() || updatedFolder.createdBy.email,
        email: updatedFolder.createdBy.email
      } : null,
      parent: updatedFolder.parent ? {
        id: updatedFolder.parent.id,
        name: updatedFolder.parent.name
      } : null
    }

    return NextResponse.json({
      success: true,
      folder: transformedFolder
    })

  } catch (error) {
    console.error('Error updating folder:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update folder' },
      { status: 500 }
    )
  }
}

/**
 * @swagger
 * /api/v1/folders/{id}:
 *   delete:
 *     summary: Delete a folder
 *     description: Permanently deletes a folder (must be empty)
 *     tags: [Folders]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Folder ID to delete
 *     responses:
 *       200:
 *         description: Folder deleted successfully
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
 *                   example: Folder deleted successfully
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - cannot delete protected system folders or folders with content
 *       404:
 *         description: Folder not found
 *       409:
 *         description: Conflict - folder contains items and cannot be deleted
 *       500:
 *         description: Internal server error
 */
export async function DELETE(
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

    const { id: folderId } = await params

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

    // Get folder with children and documents count
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        children: {
          where: { deletedAt: null },
          select: { id: true }
        },
        documents: {
          where: { deletedAt: null },
          select: { id: true }
        }
      }
    })

    if (!folder) {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the folder's organization
    if (folder.organizationId !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check if protected
    if (folder.isSystemFolder) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete protected system folders' },
        { status: 403 }
      )
    }

    // Check for children or documents
    if (folder.children.length > 0 || folder.documents.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete folder that contains items',
          details: {
            childrenCount: folder.children.length,
            documentsCount: folder.documents.length
          }
        },
        { status: 409 }
      )
    }

    // Delete the folder
    await prisma.folder.delete({
      where: { id: folderId }
    })

    console.log(`✅ Successfully deleted folder: ${folder.name} (ID: ${folderId})`)

    return NextResponse.json({
      success: true,
      message: 'Folder deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting folder:', error)

    // Check if it's a Prisma "record not found" error
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Folder not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete folder',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
