import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { processingTransaction } from '@/lib/documents/processing-state'
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking'

/**
 * @swagger
 * /api/v1/saved-searches:
 *   get:
 *     summary: List saved searches for the authenticated user
 *     description: Retrieves all saved searches belonging to the authenticated user, ordered by last used date
 *     tags: [Saved Searches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: shared
 *         schema:
 *           type: boolean
 *         description: Include shared searches from organization
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of searches to return
 *     responses:
 *       200:
 *         description: List of saved searches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SavedSearch'
 *                 count:
 *                   type: integer
 *                   description: Total number of searches returned
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 *   post:
 *     summary: Create a new saved search
 *     description: Creates a new saved search with the provided filters and metadata
 *     tags: [Saved Searches]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, filters]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: User-friendly name for the search
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional description
 *               category:
 *                 type: string
 *                 maxLength: 50
 *                 description: Optional category for organization
 *               filters:
 *                 type: object
 *                 description: SearchFilters object containing filter criteria
 *               color:
 *                 type: string
 *                 pattern: '^#[0-9A-Fa-f]{6}$'
 *                 description: Hex color for visual organization
 *               icon:
 *                 type: string
 *                 maxLength: 50
 *                 description: Icon identifier
 *               isDefault:
 *                 type: boolean
 *                 description: Whether this should be the user's default search
 *               isShared:
 *                 type: boolean
 *                 description: Whether to share this search with organization
 *     responses:
 *       201:
 *         description: Saved search created successfully
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
 *       403:
 *         description: Usage limit exceeded
 *       500:
 *         description: Internal server error
 */

// Validation schemas
const CreateSavedSearchSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  category: z.string().max(50, 'Category must be 50 characters or less').optional(),
  filters: z.record(z.any()).describe('SearchFilters object containing filter criteria'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').optional(),
  icon: z.string().max(50, 'Icon must be 50 characters or less').optional(),
  isDefault: z.boolean().default(false),
  isShared: z.boolean().default(false)
})

const QueryParamsSchema = z.object({
  category: z.string().optional(),
  shared: z.string().transform(val => val === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
})

// GET /api/v1/saved-searches - List saved searches
export async function GET(request: NextRequest) {
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
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
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

    // Parse query parameters
    const url = new URL(request.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const { category, shared, limit = 50 } = QueryParamsSchema.parse(queryParams)

    // Build where clause
    const where: Prisma.SavedSearchWhereInput = {
      userId: user.id,
      organizationId: user.organizationId,
      deletedAt: null
    }

    if (category) {
      where.category = category
    }

    // If shared is requested, also include shared searches from the organization
    const searches = await prisma.savedSearch.findMany({
      where: shared ? {
        organizationId: user.organizationId,
        deletedAt: null,
        OR: [
          { userId: user.id }, // User's own searches
          { isShared: true } // Shared searches from organization
        ],
        ...(category && { category })
      } : where,
      orderBy: [
        { isFavorite: 'desc' },
        { isDefault: 'desc' },
        { lastUsedAt: 'desc' },
        { updatedAt: 'desc' }
      ],
      take: limit,
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
      data: searches,
      count: searches.length
    })

  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'Invalid query parameters', details: error.errors }, { status: 400 })
    console.error('Error fetching saved searches:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch saved searches'
    }, { status: 500 })
  }
}

// POST /api/v1/saved-searches - Create saved search
export async function POST(request: NextRequest) {
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
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
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
    const data = CreateSavedSearchSchema.parse(body)

    // Check usage limits
    const usageCheck = await UsageTrackingService.checkUsageLimit(
      user.organizationId,
      UsageType.SAVED_SEARCH,
      1
    )

    if (!usageCheck.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        details: {
          message: `Saved-search limit reached (${usageCheck.currentUsage}/${usageCheck.limit})`,
          currentUsage: usageCheck.currentUsage,
          limit: usageCheck.limit,
          upgradeRequired: true
        }
      }, { status: 403 })
    }

    const savedSearch = await processingTransaction(prisma, async tx => {
    // If this is being set as default, unset other defaults for this user
    if (data.isDefault) {
      await tx.savedSearch.updateMany({
        where: {
          userId: user.id,
          organizationId: user.organizationId,
          isDefault: true,
          deletedAt: null
        },
        data: {
          isDefault: false
        }
      })
    }

    // Create the saved search
    return tx.savedSearch.create({
      data: {
        ...data,
        userId: user.id,
        organizationId: user.organizationId,
        sharedBy: data.isShared ? user.id : null,
        usageCount: 0
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

    })

    // Track the usage - THIS WAS MISSING!
    try {
      await UsageTrackingService.trackUsage({
        organizationId: user.organizationId,
        usageType: UsageType.SAVED_SEARCH,
        quantity: 1,
        resourceId: savedSearch.id,
        resourceType: 'saved_search',
        metadata: {
          name: savedSearch.name,
          category: savedSearch.category,
          isShared: savedSearch.isShared,
          isDefault: savedSearch.isDefault
        }
      })
    } catch (trackingError) {
      console.error('Failed to track saved search usage:', trackingError)
      // Don't fail the request if tracking fails, but log the error
    }

    return NextResponse.json({
      success: true,
      data: savedSearch
    }, { status: 201 })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 })
    }

    console.error('Error creating saved search:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create saved search'
    }, { status: 500 })
  }
}
