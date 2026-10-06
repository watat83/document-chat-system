import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
  try {
    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } } })
    if (!user) return NextResponse.json({ success: false, error: 'Account unavailable' }, { status: 403 })
    const savedSearches = await prisma.savedSearch.findMany({
      where: { organizationId: user.organizationId, userId: user.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }], take: 100,
    })
    return NextResponse.json({ success: true, data: {
      savedSearches, defaultSearch: savedSearches.find(search => search.isDefault) || null,
      cachedMatchScores: {}, recentOpportunityIds: [], matchScoresAvailable: false,
    } })
  } catch (error) {
    console.error('Saved search prefetch failed:', error)
    return NextResponse.json({ success: false, error: 'Saved searches unavailable' }, { status: 503 })
  }
}
