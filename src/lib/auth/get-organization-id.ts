import { db } from '@/lib/db'

/**
 * Get organization ID for a user by their Clerk user ID
 * @param userId - Clerk user ID
 * @returns Organization ID or null if user not found
 */
export async function getOrganizationId(userId: string): Promise<string | null> {
  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId, deletedAt: null },
      select: { organizationId: true }
    })
    
    return user?.organizationId || null
  } catch (error) {
    console.error('Error fetching organization ID:', error)
    return null
  }
}