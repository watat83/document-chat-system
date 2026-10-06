import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createValidationError, IdParamSchema } from '@/lib/validations'

// Member update schema
const UpdateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER'])
})

// GET /api/organizations/members/[id] - Get specific member
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Validate ID parameter
    let validatedParams
    try {
      validatedParams = IdParamSchema.parse({ id: params.id })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationError(error), { status: 400 })
      }
      throw error
    }

    // Check authentication
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized. Please sign in to view member information.' 
      }, { status: 401 })
    }

    // Get current user with organization
    const currentUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })

    if (!currentUser || !currentUser.organization) {
      return NextResponse.json({
        success: false,
        error: 'Organization not found'
      }, { status: 404 })
    }

    // Get the requested member
    const member = await db.user.findFirst({
      where: {
        id: validatedParams.id,
        organizationId: currentUser.organization.id
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        imageUrl: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!member) {
      return NextResponse.json({
        success: false,
        error: 'Member not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: member
    })

  } catch (error) {
    console.error('Error fetching member:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// PATCH /api/organizations/members/[id] - Update member role (admin/owner only)
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Validate ID parameter
    let validatedParams
    try {
      validatedParams = IdParamSchema.parse({ id: params.id })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationError(error), { status: 400 })
      }
      throw error
    }

    // Check authentication
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized. Please sign in to update member information.' 
      }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    
    let validatedData
    try {
      validatedData = UpdateMemberSchema.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationError(error), { status: 400 })
      }
      throw error
    }

    // Get current user with organization
    const currentUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })

    if (!currentUser || !currentUser.organization) {
      return NextResponse.json({
        success: false,
        error: 'Organization not found'
      }, { status: 404 })
    }

    // Check permissions (only OWNER and ADMIN can update member roles)
    if (!['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions. Only organization owners and admins can update member roles.'
      }, { status: 403 })
    }

    // Get the member to update
    const memberToUpdate = await db.user.findFirst({
      where: {
        id: validatedParams.id,
        organizationId: currentUser.organization.id
      }
    })

    if (!memberToUpdate) {
      return NextResponse.json({
        success: false,
        error: 'Member not found'
      }, { status: 404 })
    }

    // Prevent changing owner role
    if (memberToUpdate.role === 'OWNER') {
      return NextResponse.json({
        success: false,
        error: 'Cannot change the role of the organization owner'
      }, { status: 403 })
    }

    // Prevent non-owners from updating admin roles
    if (currentUser.role !== 'OWNER' && memberToUpdate.role === 'ADMIN') {
      return NextResponse.json({
        success: false,
        error: 'Only organization owners can update admin roles'
      }, { status: 403 })
    }

    // Update member role
    const updatedMember = await db.user.update({
      where: { id: validatedParams.id },
      data: {
        role: validatedData.role,
        updatedAt: new Date()
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        imageUrl: true,
        lastActiveAt: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedMember,
      message: 'Member role updated successfully'
    })

  } catch (error) {
    console.error('Error updating member:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

// DELETE /api/organizations/members/[id] - Remove member (admin/owner only)
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Validate ID parameter
    let validatedParams
    try {
      validatedParams = IdParamSchema.parse({ id: params.id })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(createValidationError(error), { status: 400 })
      }
      throw error
    }

    // Check authentication
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized. Please sign in to remove members.' 
      }, { status: 401 })
    }

    // Get current user with organization
    const currentUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { organization: true }
    })

    if (!currentUser || !currentUser.organization) {
      return NextResponse.json({
        success: false,
        error: 'Organization not found'
      }, { status: 404 })
    }

    // Check permissions (only OWNER and ADMIN can remove members)
    if (!['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions. Only organization owners and admins can remove members.'
      }, { status: 403 })
    }

    // Get the member to remove
    const memberToRemove = await db.user.findFirst({
      where: {
        id: validatedParams.id,
        organizationId: currentUser.organization.id
      }
    })

    if (!memberToRemove) {
      return NextResponse.json({
        success: false,
        error: 'Member not found'
      }, { status: 404 })
    }

    // Prevent removing the organization owner
    if (memberToRemove.role === 'OWNER') {
      return NextResponse.json({
        success: false,
        error: 'Cannot remove the organization owner'
      }, { status: 403 })
    }

    // Prevent non-owners from removing admins
    if (currentUser.role !== 'OWNER' && memberToRemove.role === 'ADMIN') {
      return NextResponse.json({
        success: false,
        error: 'Only organization owners can remove admin members'
      }, { status: 403 })
    }

    // Prevent users from removing themselves (they should use a separate endpoint for leaving)
    if (memberToRemove.clerkId === userId) {
      return NextResponse.json({
        success: false,
        error: 'Cannot remove yourself. Use the leave organization endpoint instead.'
      }, { status: 403 })
    }

    // Remove the member from the organization
    await db.user.delete({
      where: { id: validatedParams.id }
    })

    return NextResponse.json({
      success: true,
      message: 'Member removed successfully'
    })

  } catch (error) {
    console.error('Error removing member:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}