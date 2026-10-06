import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

export interface CachedResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  refetch: () => Promise<void>;
}

export function useCachedData<T>(
  url: string,
  options: RequestInit = {}
): CachedResponse<T> {
  const { userId, orgId } = useAuth();
  const query = useQuery({
    queryKey: ['cached-response', userId, orgId, url, options.method, options.body],
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const headers = new Headers(options.headers);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      const response = await fetch(url, { ...options, headers, signal });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      return { data: (result.data ?? result) as T, cached: Boolean(result.cached) };
    },
  });
  return { data: query.data?.data ?? null, loading: query.isFetching, error: query.error?.message ?? null,
    cached: query.data?.cached ?? false, refetch: async () => { await query.refetch(); } };
}

export function useCachedOpportunities(filters: any = {}) {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  const url = `/api/v1/opportunities/cached?${params.toString()}`;
  
  return useCachedData(url);
}

export function useCachedMatches(filters: any = {}) {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  const url = `/api/v1/matches/cached?${params.toString()}`;
  
  return useCachedData(url);
}

export function useUsageStats(startDate?: string, endDate?: string) {
  // For demo: Return mock data instead of making API call
  const [data] = useState({
    totalRequests: 1247,
    totalCost: 45.60,
    averageLatency: 250,
    cacheHitRate: 94.2,
    topEndpoints: [
      { path: '/api/opportunities', requests: 456, avgLatency: 120 },
      { path: '/api/match-scores', requests: 321, avgLatency: 380 },
      { path: '/api/enhanced-chat', requests: 234, avgLatency: 200 }
    ]
  });
  
  return {
    data,
    loading: false,
    error: null,
    cached: true,
    refetch: async () => {}
  };
}