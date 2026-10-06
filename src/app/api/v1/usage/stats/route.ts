import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { usageTracker } from '@/lib/cache/usage-tracker';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    if ((startDate && !Number.isFinite(startDate.getTime())) || (endDate && !Number.isFinite(endDate.getTime())) || (startDate && endDate && startDate > endDate)) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } } });
    if (!user) return NextResponse.json({ error: 'Account unavailable' }, { status: 403 });
    // Get usage statistics
    const stats = await usageTracker.getUserUsageStats(user.id, startDate, endDate, user.organizationId);

    // Get top resources by usage
    const topResources = await usageTracker.getTopResourcesByUsage(user.id, user.organizationId, 10, startDate, endDate);

    return NextResponse.json({
      stats,
      topResources,
      period: {
        startDate: startDate?.toISOString() || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: endDate?.toISOString() || new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Usage stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Usage events are recorded by server operations' }, { status: 405, headers: { Allow: 'GET' } });
}
