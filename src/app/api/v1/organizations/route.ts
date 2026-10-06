import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { OrganizationCreateSchema, OrganizationUpdateSchema, createValidationError } from '@/lib/validations'
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking'

// GET /api/organizations - Get user's organization
export async function GET() {
  try {
    // Check authentication
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized. Please sign in to access organization information.'
      }, { status: 401 })
    }

    // Get user with organization
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        organization: {
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
              }
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
            }
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    if (!user.organization) {
      return NextResponse.json({
        success: false,
        error: 'Organization not found'
      }, { status: 404 })
    }

    // Track this API call
    try {
      await UsageTrackingService.trackUsage({
        organizationId: user.organizationId,
        usageType: UsageType.API_CALL,
        quantity: 1,
        resourceType: 'organizations',
        metadata: {
          endpoint: '/api/organizations'
        }
      });
    } catch (trackingError) {
      console.warn('Failed to track organizations API usage:', trackingError);
      // Don't fail the request if tracking fails
    }

    return NextResponse.json({
      success: true,
      data: user.organization
    })

  } catch (error) {
    console.error('Error fetching organization:', error)

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// POST /api/organizations - Create new organization (admin only)
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized. Please sign in to create an organization.'
      }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()

    let validatedData
    try {
      validatedData = OrganizationCreateSchema.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationError(error), { status: 400 })
      }
      throw error
    }

    // Check if slug is already taken
    const existingOrg = await db.organization.findUnique({
      where: { slug: validatedData.slug }
    })

    if (existingOrg) {
      return NextResponse.json({
        success: false,
        error: 'Organization slug already exists',
        message: 'Please choose a different slug for your organization.'
      }, { status: 409 })
    }

    const clerkUser = await currentUser()
    const email = clerkUser?.primaryEmailAddress?.emailAddress
    if (!clerkUser || !email) return NextResponse.json({ success: false, error: 'Verified account email required' }, { status: 401 })
    // A user already belongs to one organization. Creation must never move an existing account.
    const organization = await db.$transaction(async tx => {
      const existingUser = await tx.user.findUnique({ where: { clerkId: userId } })
      if (existingUser) throw new Error('ACCOUNT_ALREADY_PROVISIONED')
      const created = await tx.organization.create({ data: { name: validatedData.name, slug: validatedData.slug } })
      await tx.user.create({ data: { clerkId: userId, email, firstName: clerkUser.firstName, lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl, organizationId: created.id, role: 'OWNER', lastActiveAt: new Date() } })
      return created
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json({
      success: true,
      data: organization
    }, { status: 201 })

  } catch (error) {
    if (error instanceof Error && error.message === 'ACCOUNT_ALREADY_PROVISIONED') return NextResponse.json({ success: false, error: 'Account already belongs to an organization' }, { status: 409 })
    console.error('Error creating organization:', error)

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// PATCH /api/organizations - Update organization (admin/owner only)
export async function PATCH(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized. Please sign in to update organization.'
      }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()

    let validatedData
    try {
      validatedData = OrganizationUpdateSchema.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationError(error), { status: 400 })
      }
      throw error
    }

    // Get user with organization
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    if (!user.organization) {
      return NextResponse.json({
        success: false,
        error: 'Organization not found'
      }, { status: 404 })
    }

    // Check permissions (only OWNER and ADMIN can update organization)
    if (!['OWNER', 'ADMIN'].includes(user.role)) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions. Only organization owners and admins can update organization settings.'
      }, { status: 403 })
    }

    // Update organization
    const updatedOrganization = await db.organization.update({
      where: { id: user.organization.id },
      data: {
        ...validatedData,
        updatedAt: new Date()
      },
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
          }
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
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedOrganization
    })

  } catch (error) {
    console.error('Error updating organization:', error)

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// DELETE /api/organizations - Delete organization (owner only)
export async function DELETE() {
  try {
    // Check authentication
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized. Please sign in to delete organization.'
      }, { status: 401 })
    }

    // Get user with organization
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 })
    }

    if (!user.organization) {
      return NextResponse.json({
        success: false,
        error: 'Organization not found'
      }, { status: 404 })
    }

    // Check permissions (only OWNER can delete organization)
    if (user.role !== 'OWNER') {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions. Only organization owners can delete the organization.'
      }, { status: 403 })
    }

    // Soft delete all organization profiles first
    await db.profile.updateMany({
      where: {
        organizationId: user.organization.id,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    })

    // Delete the organization (this will cascade delete users due to foreign key constraints)
    await db.organization.delete({
      where: { id: user.organization.id }
    })

    return NextResponse.json({
      success: true,
      message: 'Organization deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting organization:', error)

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
