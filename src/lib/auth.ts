import { provisionUser } from './auth/provision-user'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from './db'
import { User, UserRole } from '@prisma/client'
import { redirect } from 'next/navigation'

/**
 * Get the current authenticated user from the database
 * This function ensures the user exists in our database and is properly synced
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { userId } = await auth()

    if (!userId) {
      console.log('getCurrentUser: No userId from auth')
      return null
    }

    console.log('getCurrentUser: Looking up user with clerkId:', userId)
    const user = await db.user.findUnique({
      where: {
        clerkId: userId,
        deletedAt: null,
      },
      include: {
        organization: true,
      },
    })

    console.log('getCurrentUser: Found user:', user ? 'yes' : 'no', user ? `org: ${user.organization ? 'yes' : 'no'}` : '')

    // If user doesn't exist in our database, try to sync from Clerk
    if (!user) {
      const clerkUser = await currentUser()
      if (clerkUser) {
        // User exists in Clerk but not in our database
        // This should be handled by webhooks, but as a fallback, we'll create the user
        console.warn('User exists in Clerk but not in database, creating fallback user...')

        return await provisionUser(clerkUser)
      }
    }

    return user
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Get the current user's organization ID
 */
export async function getCurrentOrganizationId(): Promise<string | null> {
  const user = await getCurrentUser()
  return user?.organizationId || null
}

/**
 * Require authentication - redirects to sign-in if not authenticated
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/sign-in/')
  }

  return user
}

/**
 * Require specific role - redirects to unauthorized if insufficient permissions
 */
export async function requireRole(requiredRole: UserRole): Promise<User> {
  const user = await requireAuth()

  const roleHierarchy: Record<UserRole, number> = {
    VIEWER: 1,
    MEMBER: 2,
    ADMIN: 3,
    OWNER: 4,
  }

  if (roleHierarchy[user.role] < roleHierarchy[requiredRole]) {
    redirect('/unauthorized')
  }

  return user
}

/**
 * Check if user has specific role or higher
 */
export async function hasRole(requiredRole: UserRole): Promise<boolean> {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return false
    }

    const roleHierarchy: Record<UserRole, number> = {
      VIEWER: 1,
      MEMBER: 2,
      ADMIN: 3,
      OWNER: 4,
    }

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole]
  } catch {
    return false
  }
}

/**
 * Check if user is admin or owner
 */
export async function isAdmin(): Promise<boolean> {
  return await hasRole('ADMIN')
}

/**
 * Check if user is owner
 */
export async function isOwner(): Promise<boolean> {
  return await hasRole('OWNER')
}

/**
 * Update user's last active timestamp
 */
export async function updateLastActive(): Promise<void> {
  try {
    const { userId } = await auth()

    if (!userId) {
      return
    }

    await db.user.update({
      where: { clerkId: userId },
      data: { lastActiveAt: new Date() },
    })
  } catch (error) {
    console.error('Error updating last active:', error)
  }
}

/**
 * Get user by Clerk ID
 */
export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  try {
    return await db.user.findUnique({
      where: {
        clerkId,
        deletedAt: null,
      },
      include: {
        organization: true,
      },
    })
  } catch (error) {
    console.error('Error getting user by Clerk ID:', error)
    return null
  }
}

/**
 * Create or update user from Clerk data
 */
export async function syncUserFromClerk(clerkUser: any, organizationId?: string): Promise<User> {
  const userData = {
    email: clerkUser.emailAddresses[0]?.emailAddress || '',
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    imageUrl: clerkUser.imageUrl,
    lastActiveAt: new Date(),
  }

  if (!organizationId) return await provisionUser(clerkUser)

  return await db.user.upsert({
    where: { clerkId: clerkUser.id },
    update: userData,
    create: {
      clerkId: clerkUser.id,
      organizationId,
      role: 'MEMBER',
      ...userData,
    },
    include: {
      organization: true,
    },
  })
}
