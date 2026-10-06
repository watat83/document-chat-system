import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cacheManager } from '@/lib/cache';
import { cacheConfig } from '@/lib/cache/config';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filters = {
      minScore: parseFloat(searchParams.get('minScore') || '0'),
      maxScore: parseFloat(searchParams.get('maxScore') || '100'),
      status: searchParams.get('status'),
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '10'),
    };

    // Generate user-specific cache key
    const cacheKey = cacheManager.userCacheKeyFor(userId, 'matches', filters);

    // Use cache wrapper to get matches
    const result = await cacheManager.withCache(
      cacheKey,
      async () => {
        // Simulate AI-powered matching API call
        // In real implementation, this would call your AI matching service
        return await generateMatchesFromAI(userId, filters);
      },
      {
        ttl: cacheConfig.ttl.short, // 5 minutes for AI results
        userId,
        prefix: cacheConfig.prefixes.match,
      }
    );

    return NextResponse.json({
      matches: result.data,
      cached: result.cached,
      cacheKey: result.key,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: result.data.length,
      },
    });
  } catch (error) {
    console.error('Cached matches API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function generateMatchesFromAI(userId: string, filters: any) {
  // Mock implementation - replace with actual AI matching service
  const mockMatches = [
    {
      id: '1',
      opportunityId: '1',
      userId,
      score: 87.5,
      status: 'pending',
      reasoningText: 'Strong match based on NAICS code and past performance',
      opportunity: {
        id: '1',
        title: 'IT Services Contract',
        agency: 'Department of Defense',
        amount: 500000,
        deadline: '2024-12-31',
      },
      matchFactors: [
        { factor: 'NAICS Code Match', score: 95, weight: 0.3 },
        { factor: 'Past Performance', score: 85, weight: 0.25 },
        { factor: 'Capability Alignment', score: 80, weight: 0.25 },
        { factor: 'Geographic Preference', score: 90, weight: 0.2 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      opportunityId: '2',
      userId,
      score: 72.3,
      status: 'pending',
      reasoningText: 'Good match with some capability gaps',
      opportunity: {
        id: '2',
        title: 'Consulting Services',
        agency: 'Department of Health',
        amount: 250000,
        deadline: '2024-11-30',
      },
      matchFactors: [
        { factor: 'NAICS Code Match', score: 70, weight: 0.3 },
        { factor: 'Past Performance', score: 80, weight: 0.25 },
        { factor: 'Capability Alignment', score: 65, weight: 0.25 },
        { factor: 'Geographic Preference', score: 85, weight: 0.2 },
      ],
      createdAt: new Date().toISOString(),
    },
  ];

  // Apply filters
  let filteredMatches = mockMatches;

  if (filters.minScore > 0) {
    filteredMatches = filteredMatches.filter(
      match => match.score >= filters.minScore
    );
  }

  if (filters.maxScore < 100) {
    filteredMatches = filteredMatches.filter(
      match => match.score <= filters.maxScore
    );
  }

  if (filters.status) {
    filteredMatches = filteredMatches.filter(
      match => match.status === filters.status
    );
  }

  // Apply pagination
  const startIndex = (filters.page - 1) * filters.limit;
  const endIndex = startIndex + filters.limit;

  return filteredMatches.slice(startIndex, endIndex);
}
