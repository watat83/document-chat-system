import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { auditCrudLogger } from '@/lib/audit/crud-audit-logger'

/**
 * @swagger
 * /api/v1/saved-searches/{id}:
 *   get:
 *     summary: Get a specific saved search by ID
 *     description: Retrieves a saved search by its ID. Users can only access their own searches or shared searches from their organization.
 *     tags: [Saved Searches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The saved search ID
 *     responses:
 *       200:
 *         description: Saved search details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SavedSearch'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Saved search not found
 *       500:
 *         description: Internal server error
 *   put:
 *     summary: Update a saved search
 *     description: Updates a saved search. Users can only update their own searches.
 *     tags: [Saved Searches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The saved search ID
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
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               category:
 *                 type: string
 *                 maxLength: 50
 *               filters:
 *                 type: object
 *               color:
 *                 type: string
 *                 pattern: '^#[0-9A-Fa-f]{6}$'
 *               icon:
 *                 type: string
 *                 maxLength: 50
 *               isDefault:
 *                 type: boolean
 *               isShared:
 *                 type: boolean
 *               isFavorite:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Saved search updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SavedSearch'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Saved search not found
 *       500:
 *         description: Internal server error
 *   delete:
 *     summary: Delete a saved search
 *     description: Soft deletes a saved search. Users can only delete their own searches.
 *     tags: [Saved Searches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The saved search ID
 *     responses:
 *       200:
 *         description: Saved search deleted successfully
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
 *                   example: Saved search deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Saved search not found
 *       500:
 *         description: Internal server error
 */

// Validation schemas
const UpdateSavedSearchSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  category: z.string().max(50, 'Category must be 50 characters or less').optional(),
  filters: z.record(z.any()).describe('SearchFilters object containing filter criteria').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').optional(),
  icon: z.string().max(50, 'Icon must be 50 characters or less').optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
  isFavorite: z.boolean().optional()
})

// Helper function to find saved search with access control
async function findSavedSearchWithAccess(id: string, userId: string, orgId: string) {
  const savedSearch = await prisma.savedSearch.findFirst({
    where: {
      id,
      organizationId: orgId,
      deletedAt: null,
      OR: [
        { userId }, // User's own search
        { isShared: true } // Shared search from organization
      ]
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  })

  return savedSearch
}

// Helper function to find user's own saved search (for updates/deletes)
async function findOwnSavedSearch(id: string, userId: string, orgId: string) {
  const savedSearch = await prisma.savedSearch.findFirst({
    where: {
      id,
      userId,
      organizationId: orgId,
      deletedAt: null
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  })

  return savedSearch
}

// GET /api/v1/saved-searches/[id] - Get saved search by ID
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await auth()
    const userId = authResult?.userId
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { 
        id: true,
        clerkId: true,
        organizationId: true
      }
    })

    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 })
    }

    const savedSearch = await findSavedSearchWithAccess(params.id, user.id, user.organizationId)

    if (!savedSearch) {
      return NextResponse.json({ 
        success: false, 
        error: 'Saved search not found' 
      }, { status: 404 })
    }

    // Update last used timestamp
    await prisma.savedSearch.update({
      where: { id: params.id },
      data: { 
        lastUsedAt: new Date(),
        usageCount: { increment: 1 }
      }
    })

    return NextResponse.json({
      success: true,
      data: savedSearch
    })

  } catch (error) {
    console.error('Error fetching saved search:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch saved search' 
    }, { status: 500 })
  }
}

// PUT /api/v1/saved-searches/[id] - Update saved search
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await auth()
    const userId = authResult?.userId
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { 
        id: true,
        clerkId: true,
        organizationId: true
      }
    })

    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 })
    }

    // Parse and validate request body
    const body = await request.json()
    const data = UpdateSavedSearchSchema.parse(body)

    // Find the saved search (must be user's own search for updates)
    const existingSavedSearch = await findOwnSavedSearch(params.id, user.id, user.organizationId)

    if (!existingSavedSearch) {
      return NextResponse.json({ 
        success: false, 
        error: 'Saved search not found or access denied' 
      }, { status: 404 })
    }

    // If this is being set as default, unset other defaults for this user
    if (data.isDefault) {
      await prisma.savedSearch.updateMany({
        where: {
          userId: user.id,
          organizationId: user.organizationId,
          isDefault: true,
          id: { not: params.id }
        },
        data: {
          isDefault: false
        }
      })
    }

    // Update the saved search
    const updatedSavedSearch = await prisma.savedSearch.update({
      where: { id: params.id },
      data: {
        ...data,
        updatedAt: new Date(),
        sharedBy: data.isShared ? user.id : null
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedSavedSearch
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 })
    }

    console.error('Error updating saved search:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update saved search' 
    }, { status: 500 })
  }
}

// DELETE /api/v1/saved-searches/[id] - Delete saved search
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await auth()
    const userId = authResult?.userId
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 })
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { 
        id: true,
        clerkId: true,
        organizationId: true
      }
    })

    if (!user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 })
    }

    // Find the saved search (must be user's own search for deletion)
    const existingSavedSearch = await findOwnSavedSearch(params.id, user.id, user.organizationId)

    if (!existingSavedSearch) {
      return NextResponse.json({ 
        success: false, 
        error: 'Saved search not found or access denied' 
      }, { status: 404 })
    }

    // Soft delete the saved search
    await prisma.savedSearch.update({
      where: { id: params.id },
      data: {
        deletedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Saved search deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting saved search:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to delete saved search' 
    }, { status: 500 })
  }
}