/**
 * Admin API for Pinecone Namespace Management
 *
 * Provides administrative endpoints for managing Pinecone namespaces
 * and monitoring multi-tenant vector storage isolation.
 *
 * @swagger
 * tags:
 *   - name: Admin - Namespaces
 *     description: Administrative namespace management endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { defaultNamespaceManager } from '@/lib/ai/services/pinecone-namespace-manager'
import { getAuth } from '@clerk/nextjs/server'
import { isPlatformAdmin } from '@/lib/security/platform-admin'
import { prisma } from '@/lib/prisma'

// Validation schemas
const ListNamespacesQuerySchema = z.object({
  organizationId: z.string().optional().describe('Filter by specific organization ID'),
  limit: z.coerce.number().min(1).max(100).default(50).describe('Maximum number of results to return'),
  offset: z.coerce.number().min(0).default(0).describe('Number of results to skip for pagination'),
})

const CreateNamespaceBodySchema = z.object({
  organizationId: z.string().min(1).describe('Organization ID to create namespace for'),
})

const DeleteNamespaceBodySchema = z.object({
  namespace: z.string().min(1).describe('Namespace to delete'),
  organizationId: z.string().min(1).describe('Organization ID that owns the namespace'),
  confirm: z.boolean().describe('Confirmation that user wants to delete all vectors in namespace'),
})

/**
 * @swagger
 * /api/v1/admin/namespaces:
 *   get:
 *     summary: List Pinecone namespaces
 *     description: Get list of Pinecone namespaces with statistics and organization mapping
 *     tags: [Admin - Namespaces]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Filter by specific organization ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of results to skip for pagination
 *     responses:
 *       200:
 *         description: List of namespaces retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     namespaces:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           namespace:
 *                             type: string
 *                           organizationId:
 *                             type: string
 *                           organizationName:
 *                             type: string
 *                           vectorCount:
 *                             type: integer
 *                           indexFullness:
 *                             type: number
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         offset:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },

    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      )
    }

    // Global namespace operations require platform access.
    // const isAdmin = user.organizationMemberships.some(m => m.role === 'OWNER' || m.role === 'ADMIN')
    // if (!isAdmin) {
    //   return NextResponse.json(
    //     { success: false, error: 'Admin access required' },
    //     { status: 403 }
    //   )
    // }

    if (!isPlatformAdmin(userId)) return NextResponse.json({ success: false, error: 'Platform administrator access required' }, { status: 403 })

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const queryParams = ListNamespacesQuerySchema.parse({
      organizationId: searchParams.get('organizationId'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    })

    // Get organizations to map to namespaces
    const organizations = await prisma.organization.findMany({
      where: queryParams.organizationId ? { id: queryParams.organizationId } : undefined,
      select: { id: true, name: true, slug: true },
      take: queryParams.limit,
      skip: queryParams.offset,
    })

    const namespaces = []

    for (const org of organizations) {
      try {
        const namespaceInfo = await defaultNamespaceManager.getOrCreateNamespace(org.id)
        const stats = await defaultNamespaceManager.getNamespaceStats(namespaceInfo.namespace)

        namespaces.push({
          namespace: namespaceInfo.namespace,
          organizationId: org.id,
          organizationName: org.name,
          organizationSlug: org.slug,
          sanitizedName: namespaceInfo.sanitizedName,
          vectorCount: stats.vectorCount,
          indexFullness: stats.indexFullness,
          created: namespaceInfo.created
        })
      } catch (error) {
        console.error(`Error getting namespace info for org ${org.id}:`, error)
        // Continue with other organizations
      }
    }

    const total = await prisma.organization.count({
      where: queryParams.organizationId ? { id: queryParams.organizationId } : undefined,
    })

    return NextResponse.json({
      success: true,
      data: {
        namespaces,
        pagination: {
          total,
          limit: queryParams.limit,
          offset: queryParams.offset,
          hasMore: queryParams.offset + queryParams.limit < total
        }
      }
    })

  } catch (error) {
    console.error('Error listing namespaces:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to list namespaces',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * @swagger
 * /api/v1/admin/namespaces:
 *   post:
 *     summary: Create Pinecone namespace
 *     description: Create a new Pinecone namespace for an organization
 *     tags: [Admin - Namespaces]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *             properties:
 *               organizationId:
 *                 type: string
 *                 description: Organization ID to create namespace for
 *     responses:
 *       201:
 *         description: Namespace created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     namespace:
 *                       type: string
 *                     organizationId:
 *                       type: string
 *                     organizationName:
 *                       type: string
 *                     created:
 *                       type: boolean
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!isPlatformAdmin(userId)) return NextResponse.json({ success: false, error: 'Platform administrator access required' }, { status: 403 })

    // Parse request body
    const body = await request.json()
    const { organizationId } = CreateNamespaceBodySchema.parse(body)

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true }
    })

    if (!organization) {
      return NextResponse.json(
        { success: false, error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Create namespace
    const namespaceInfo = await defaultNamespaceManager.getOrCreateNamespace(organizationId)

    return NextResponse.json({
      success: true,
      data: {
        namespace: namespaceInfo.namespace,
        organizationId: namespaceInfo.organizationId,
        organizationName: namespaceInfo.organizationName,
        sanitizedName: namespaceInfo.sanitizedName,
        created: namespaceInfo.created
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating namespace:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create namespace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * @swagger
 * /api/v1/admin/namespaces:
 *   delete:
 *     summary: Delete Pinecone namespace
 *     description: Delete a Pinecone namespace and all its vectors (DANGEROUS)
 *     tags: [Admin - Namespaces]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - namespace
 *               - organizationId
 *               - confirm
 *             properties:
 *               namespace:
 *                 type: string
 *                 description: Namespace to delete
 *               organizationId:
 *                 type: string
 *                 description: Organization ID that owns the namespace
 *               confirm:
 *                 type: boolean
 *                 description: Confirmation that user wants to delete all vectors in namespace
 *     responses:
 *       200:
 *         description: Namespace deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!isPlatformAdmin(userId)) return NextResponse.json({ success: false, error: 'Platform administrator access required' }, { status: 403 })

    // Parse request body
    const body = await request.json()
    const { namespace, organizationId, confirm } = DeleteNamespaceBodySchema.parse(body)

    if (!confirm) {
      return NextResponse.json(
        { success: false, error: 'Confirmation required. Set confirm: true to proceed.' },
        { status: 400 }
      )
    }

    // Verify the namespace belongs to the organization
    const expectedNamespace = await defaultNamespaceManager.getNamespaceForOrganization(organizationId)
    if (namespace !== expectedNamespace) {
      return NextResponse.json(
        { success: false, error: 'Namespace does not belong to specified organization' },
        { status: 400 }
      )
    }

    // Delete namespace
    await defaultNamespaceManager.deleteNamespace(namespace)

    return NextResponse.json({
      success: true,
      message: `Namespace ${namespace} deleted successfully`
    })

  } catch (error) {
    console.error('Error deleting namespace:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete namespace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
