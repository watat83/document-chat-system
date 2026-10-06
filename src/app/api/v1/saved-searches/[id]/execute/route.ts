import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { auditCrudLogger } from '@/lib/audit/crud-audit-logger'

/**
 * @swagger
 * /api/v1/saved-searches/{id}/execute:
 *   post:
 *     summary: Execute a saved search
 *     description: Executes a saved search and returns the filters. Updates usage statistics.
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
 *         description: Saved search executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     category:
 *                       type: string
 *                     filters:
 *                       type: object
 *                       description: SearchFilters object to apply
 *                     usageCount:
 *                       type: integer
 *                     lastUsedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Saved search not found
 *       500:
 *         description: Internal server error
 */

// POST /api/v1/saved-searches/[id]/execute - Execute saved search
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Find the saved search with access control
    const savedSearch = await prisma.savedSearch.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        deletedAt: null,
        OR: [
          { userId: user.id }, // User's own search
          { isShared: true } // Shared search from organization
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        filters: true,
        usageCount: true,
        lastUsedAt: true,
        userId: true,
        isShared: true,
        color: true,
        icon: true,
        isFavorite: true
      }
    })

    if (!savedSearch) {
      return NextResponse.json({ 
        success: false, 
        error: 'Saved search not found' 
      }, { status: 404 })
    }

    // Update usage statistics
    const updatedSearch = await prisma.savedSearch.update({
      where: { id: params.id },
      data: { 
        lastUsedAt: new Date(),
        usageCount: { increment: 1 }
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        filters: true,
        usageCount: true,
        lastUsedAt: true,
        userId: true,
        isShared: true,
        color: true,
        icon: true,
        isFavorite: true
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedSearch
    })

  } catch (error) {
    console.error('Error executing saved search:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to execute saved search' 
    }, { status: 500 })
  }
}