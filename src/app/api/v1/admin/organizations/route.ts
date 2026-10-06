import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

/**
 * @swagger
 * /api/v1/admin/organizations:
 *   get:
 *     summary: List all organizations (Admin only)
 *     description: Retrieve a comprehensive list of all organizations in the system with their associated data including users, documents, folders, and subscription information. This endpoint is for administrative purposes only.
 *     tags:
 *       - Admin
 *       - Organizations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Maximum number of organizations to return
 *       - in: query
 *         name: offset
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of organizations to skip for pagination
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [TRIALING, ACTIVE, PAST_DUE, CANCELED, UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED]
 *         description: Filter by subscription status
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Search organizations by name or slug
 *     responses:
 *       200:
 *         description: Successfully retrieved organizations list
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
 *                     organizations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "cln5xr8yz0001me08y7j4x9yx"
 *                           name:
 *                             type: string
 *                             example: "Acme Corporation"
 *                           slug:
 *                             type: string
 *                             example: "acme-corp"
 *                           subscriptionStatus:
 *                             type: string
 *                             example: "ACTIVE"
 *                           planType:
 *                             type: string
 *                             example: "PROFESSIONAL"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                           stripeCustomerId:
 *                             type: string
 *                             nullable: true
 *                           billingEmail:
 *                             type: string
 *                             nullable: true
 *                           users:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 email:
 *                                   type: string
 *                                 firstName:
 *                                   type: string
 *                                 lastName:
 *                                   type: string
 *                                 role:
 *                                   type: string
 *                                   enum: [OWNER, ADMIN, MEMBER, VIEWER]
 *                                 lastActiveAt:
 *                                   type: string
 *                                   format: date-time
 *                                   nullable: true
 *                           _count:
 *                             type: object
 *                             properties:
 *                               users:
 *                                 type: integer
 *                               documents:
 *                                 type: integer
 *                               folders:
 *                                 type: integer
 *                               opportunities:
 *                                 type: integer
 *                               subscriptions:
 *                                 type: integer
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 150
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         offset:
 *                           type: integer
 *                           example: 0
 *                         totalPages:
 *                           type: integer
 *                           example: 8
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Unauthorized. Please sign in to access this resource."
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Insufficient permissions. Admin access required."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */

// GET /api/v1/admin/organizations - List all organizations (Admin only)
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized. Please sign in to access this resource.'
      }, { status: 401 })
    }

    // Get current user to check admin permissions
    const currentUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })

    if (!currentUser) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    // Check if user has admin permissions (you may need to adjust this logic based on your admin system)
    // For now, assuming OWNER role has admin privileges for this demo
    if (currentUser.role !== 'OWNER') {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions. Admin access required.'
      }, { status: 403 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    // Build where clause
    const where: any = {
      deletedAt: null // Only active organizations
    }

    if (status) {
      where.subscriptionStatus = status
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Get total count for pagination
    const totalCount = await db.organization.count({ where })

    // Fetch organizations with associated data
    const organizations = await db.organization.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            lastActiveAt: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        },
        profiles: {
          where: { deletedAt: null },
          select: {
            id: true,
            companyName: true,
            profileCompleteness: true,
            createdAt: true,
            updatedAt: true
          }
        },
        subscriptions: {
          select: {
            id: true,
            planType: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            amount: true,
            currency: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1 // Latest subscription only
        },
        _count: {
          select: {
            users: true,
            documents: true,
            folders: true,
            subscriptions: true
          }
        }
      }
    })

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)
    const currentPage = Math.floor(offset / limit) + 1

    return NextResponse.json({
      success: true,
      data: {
        organizations,
        pagination: {
          total: totalCount,
          limit,
          offset,
          totalPages,
          currentPage
        }
      }
    })

  } catch (error) {
    console.error('Error fetching organizations:', error)

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
