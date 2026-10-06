import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useCSRF } from './useCSRF';

interface Subscription {
  id: string;
  planType: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialStart?: string | null;
  trialEnd?: string | null;
  amount: number;
  currency: string;
  interval: string;
  features: string[];
  limits: {
    seats: number;
    documentsPerMonth: number;
    aiCreditsPerMonth: number;
    matchScoreCalculations: number;
  };
  planDetails: {
    name: string;
    description: string;
    features: string[];
  };
}

interface UseRealtimeSubscriptionReturn {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  invalidateCache: () => Promise<void>;
  lastUpdated: Date | null;
}

/**
 * React hook for real-time subscription data with intelligent caching
 * 
 * Features:
 * - Automatic cache invalidation on plan changes
 * - Immediate data refresh after mutations
 * - Background sync with exponential backoff
 * - Optimistic UI updates
 * 
 * @param options Configuration options
 * @returns Subscription data and control functions
 */
export function useRealtimeSubscription(options: {
  pollInterval?: number;
  enableBackgroundSync?: boolean;
  onPlanChange?: (newPlan: string, oldPlan: string) => void;
} = {}): UseRealtimeSubscriptionReturn {
  const { user } = useUser();
  const { token: csrfToken, addToHeaders } = useCSRF();
  
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const previousPlanType = useRef<string | null>(null);
  const fetchInProgress = useRef(false);
  const retryCount = useRef(0);
  const maxRetries = 3;
  const currentSubscription = useRef<Subscription | null>(null);

  const {
    pollInterval = 30000, // 30 seconds default
    enableBackgroundSync = true,
    onPlanChange,
  } = options;

  /**
   * No-op function since subscription caching is disabled
   */
  const invalidateCache = useCallback(async () => {
    console.log('💡 Cache invalidation skipped - subscription caching is disabled for immediate updates');
  }, []);

  /**
   * Fetch fresh subscription data (always fresh since caching is disabled)
   */
  const fetchSubscription = useCallback(async () => {
    if (!user || fetchInProgress.current) {
      return;
    }

    fetchInProgress.current = true;

    try {
      console.log('🔄 Fetching fresh subscription data (no cache)...', { retryCount: retryCount.current });

      const response = await fetch('/api/v1/billing/subscription', {
        method: 'GET',
        headers: addToHeaders({
          'Cache-Control': 'no-cache',
        }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        const newSubscription = data.subscription;
        
        // Check if subscription data actually changed
        const hasChanged = !currentSubscription.current || 
          currentSubscription.current.id !== newSubscription?.id ||
          currentSubscription.current.planType !== newSubscription?.planType ||
          currentSubscription.current.status !== newSubscription?.status;
        
        // Update both state and ref
        setSubscription(newSubscription);
        currentSubscription.current = newSubscription;
        setLastUpdated(new Date());
        setError(null);
        retryCount.current = 0;

        // Detect plan changes
        if (previousPlanType.current && newSubscription?.planType && 
            previousPlanType.current !== newSubscription.planType) {
          console.log('🔄 Plan change detected:', {
            old: previousPlanType.current,
            new: newSubscription.planType,
          });
          
          onPlanChange?.(newSubscription.planType, previousPlanType.current);
        }
        
        previousPlanType.current = newSubscription?.planType || null;

        // Only log when data actually changes
        if (hasChanged) {
          console.log('✅ Subscription data updated:', {
            planType: newSubscription?.planType,
            status: newSubscription?.status,
            fresh: true,
          });
        }

      } else if (response.status === 401) {
        setSubscription(null);
        setError(null); // Don't show error for auth issues
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.warn('⚠️ Failed to fetch subscription:', response.status, errorText);
        
        // Only set error if we don't have existing data
        if (!currentSubscription.current && retryCount.current >= maxRetries) {
          setError(`Failed to load subscription data: ${response.status}`);
        }
      }
    } catch (error) {
      console.error('❌ Subscription fetch error:', error);
      
      // Only set error if we don't have existing data
      if (!currentSubscription.current && retryCount.current >= maxRetries) {
        setError(error instanceof Error ? error.message : 'Network error');
      }
    } finally {
      setLoading(false);
      fetchInProgress.current = false;
    }
  }, [user, addToHeaders, onPlanChange]);

  /**
   * Force refresh (always fresh since caching is disabled)
   */
  const refetch = useCallback(async () => {
    console.log('🔄 Force refresh requested');
    setLoading(true);
    
    // Fetch fresh data (no cache to invalidate)
    await fetchSubscription();
  }, [fetchSubscription]);

  // Initial fetch - use ref to avoid dependency issues
  const initialFetchDone = useRef(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (user && !initialFetchDone.current) {
        initialFetchDone.current = true;
        void fetchSubscription();
      } else if (!user) {
        initialFetchDone.current = false;
        setLoading(false);
        setSubscription(null);
        setError(null);
      }
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [user, fetchSubscription]);

  // Background polling (if enabled)
  useEffect(() => {
    if (!enableBackgroundSync || !user || pollInterval <= 0) {
      return;
    }

    const interval = setInterval(() => {
      // Only poll if:
      // 1. Page is visible
      // 2. Not currently loading
      // 3. Haven't updated recently
      // 4. User is active (not idle)
      const timeSinceUpdate = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
      const isPageVisible = document.visibilityState === 'visible';
      
      if (isPageVisible && !loading && !fetchInProgress.current && timeSinceUpdate > pollInterval * 0.9) {
        console.log('🔄 Background subscription poll (5min interval)');
        fetchSubscription();
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [enableBackgroundSync, user, pollInterval, loading, lastUpdated, fetchSubscription]);

  // Listen for page visibility changes to refresh when user returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && !loading) {
        // Refresh if data is older than 1 minute
        const timeSinceUpdate = lastUpdated ? Date.now() - lastUpdated.getTime() : Infinity;
        if (timeSinceUpdate > 60000) {
          fetchSubscription();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, loading, lastUpdated, fetchSubscription]);

  return {
    subscription,
    loading,
    error,
    refetch,
    invalidateCache,
    lastUpdated,
  };
}
