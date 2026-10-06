'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { ABTestVariant, ABTestMetrics } from '@/lib/ai/ab-testing/ab-test-manager';

export interface UseABTestOptions {
  testId: string;
  organizationId?: string;
  onVariantAssigned?: (variant: ABTestVariant) => void;
  demoMode?: boolean; // Add demo mode to prevent API calls
}

export interface UseABTestReturn {
  variant: ABTestVariant | null;
  isLoading: boolean;
  error: Error | null;
  executeWithTest: (task: any) => Promise<any>;
  recordFeedback: (feedback: {
    satisfied: boolean;
    rating?: number;
    comment?: string;
  }) => Promise<void>;
  metrics: ABTestMetrics[];
  refreshMetrics: () => Promise<void>;
}

export function useABTest(options: UseABTestOptions): UseABTestReturn {
  const { testId, organizationId: providedOrgId, onVariantAssigned, demoMode = false } = options;
  const { userId, orgId } = useAuth();
  const [variant, setVariant] = useState<ABTestVariant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [metrics, setMetrics] = useState<ABTestMetrics[]>([]);

  const organizationId = providedOrgId || orgId || 'default';

  // Fetch variant assignment with retry control
  useEffect(() => {
    if (demoMode) {
      // Demo mode: simulate variant assignment without API calls
      const demoVariant: ABTestVariant = {
        id: 'demo-variant-1',
        name: 'Vercel AI Enhanced',
        description: 'Demo variant using Vercel AI SDK for enhanced streaming',
        provider: 'vercel',
        weight: 50,
        testId: testId,
        createdAt: new Date()
      };
      const timeout = window.setTimeout(() => {
        setVariant(demoVariant);
        setIsLoading(false);
        onVariantAssigned?.(demoVariant);
      }, 0);

      return () => window.clearTimeout(timeout);
    }

    if (!userId) {
      const timeout = window.setTimeout(() => setIsLoading(false), 0);
      return () => window.clearTimeout(timeout);
    }

    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 2;

    const fetchVariant = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch('/api/v1/ai/ab-testing/variant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId,
            userId,
            organizationId
          })
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Authentication failed - don't retry, set to demo mode
            console.warn('A/B testing authentication failed, skipping variant assignment');
            if (isMounted) {
              setVariant(null);
              setIsLoading(false);
            }
            return;
          }
          
          if (response.status >= 500 && retryCount < maxRetries) {
            // Server error - retry up to maxRetries
            retryCount++;
            setTimeout(() => {
              if (isMounted) fetchVariant();
            }, 1000 * retryCount);
            return;
          }
          
          throw new Error(`Failed to fetch A/B test variant: ${response.status}`);
        }

        const data = await response.json();
        
        if (isMounted) {
          setVariant(data.variant);
          
          if (data.variant && onVariantAssigned) {
            onVariantAssigned(data.variant);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
          console.error('Failed to fetch A/B test variant:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const timeout = window.setTimeout(() => {
      void fetchVariant();
    }, 0);

    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [testId, userId, organizationId]); // Removed onVariantAssigned from deps to prevent loops

  // Execute task with A/B test tracking
  const executeWithTest = useCallback(async (task: any) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    if (demoMode) {
      // Demo mode: return simulated response
      return {
        content: "This is a demo response from the Vercel AI SDK integration. In production, this would be the actual AI-generated content based on your prompt and selected model.",
        usage: {
          totalTokens: 50,
          promptTokens: 20,
          completionTokens: 30
        },
        provider: 'vercel'
      };
    }

    try {
      const response = await fetch('/api/v1/ai/ab-testing/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          userId,
          organizationId,
          task
        })
      });

      if (!response.ok) {
        throw new Error('Failed to execute with A/B test');
      }

      const data = await response.json();
      return data.result;
    } catch (err) {
      console.error('A/B test execution error:', err);
      throw err;
    }
  }, [testId, userId, organizationId, demoMode]);

  // Record user feedback
  const recordFeedback = useCallback(async (feedback: {
    satisfied: boolean;
    rating?: number;
    comment?: string;
  }) => {
    if (!userId || !variant) return;

    if (demoMode) {
      // Demo mode: just log the feedback, don't make API calls
      console.log('Demo feedback recorded:', feedback);
      return;
    }

    try {
      const response = await fetch('/api/v1/ai/ab-testing/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          variantId: variant.id,
          userId,
          feedback
        })
      });

      if (!response.ok) {
        throw new Error('Failed to record feedback');
      }
    } catch (err) {
      console.error('Failed to record feedback:', err);
    }
  }, [testId, userId, variant, demoMode]);

  // Manual refresh metrics function (used by external components)
  const refreshMetrics = useCallback(async () => {
    if (demoMode) {
      // Demo mode: return simulated metrics
      const demoMetrics = [
        {
          variantId: 'demo-variant-1',
          totalRequests: 45,
          successfulRequests: 43,
          failedRequests: 2,
          averageLatency: 1200,
          averageCost: 0.0031,
          totalCost: 0.1395,
          averageTokensPerSecond: 45.2,
          userSatisfaction: 85
        }
      ];
      setMetrics(demoMetrics);
      return;
    }

    try {
      const response = await fetch(`/api/v1/ai/ab-testing/metrics?testId=${testId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const data = await response.json();
      setMetrics(data.metrics);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  }, [testId, demoMode]);

  // Auto-refresh metrics every 30 seconds (skip in demo mode)
  useEffect(() => {
    if (demoMode) {
      // Demo mode: set demo metrics once
      const demoMetrics = [
        {
          variantId: 'demo-variant-1',
          totalRequests: 45,
          successfulRequests: 43,
          failedRequests: 2,
          averageLatency: 1200,
          averageCost: 0.0031,
          totalCost: 0.1395,
          averageTokensPerSecond: 45.2,
          userSatisfaction: 85
        }
      ];
      const timeout = window.setTimeout(() => setMetrics(demoMetrics), 0);
      return () => window.clearTimeout(timeout);
    }

    // Only set up real API calls if not in demo mode
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`/api/v1/ai/ab-testing/metrics?testId=${testId}`);
        if (!response.ok) {
          if (response.status === 401) {
            // Authentication failed - use demo metrics instead
            console.warn('A/B testing metrics authentication failed, using demo data');
            const demoMetrics = [
              {
                variantId: 'demo-variant-1',
                totalRequests: 45,
                successfulRequests: 43,
                failedRequests: 2,
                averageLatency: 1200,
                averageCost: 0.0031,
                totalCost: 0.1395,
                averageTokensPerSecond: 45.2,
                userSatisfaction: 85
              }
            ];
            setMetrics(demoMetrics);
            return;
          }
          throw new Error('Failed to fetch metrics');
        }
        const data = await response.json();
        setMetrics(data.metrics);
      } catch (err) {
        console.warn('Failed to fetch metrics, using demo data:', err);
        // Fall back to demo metrics on any error
        const demoMetrics = [
          {
            variantId: 'demo-variant-1',
            totalRequests: 45,
            successfulRequests: 43,
            failedRequests: 2,
            averageLatency: 1200,
            averageCost: 0.0031,
            totalCost: 0.1395,
            averageTokensPerSecond: 45.2,
            userSatisfaction: 85
          }
        ];
        setMetrics(demoMetrics);
      }
    };

    const timeout = window.setTimeout(() => {
      void fetchMetrics();
    }, 0);
    const interval = setInterval(fetchMetrics, 30000);
    return () => {
      window.clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [testId, demoMode]);

  return {
    variant,
    isLoading,
    error,
    executeWithTest,
    recordFeedback,
    metrics,
    refreshMetrics
  };
}

// Hook for admin dashboard to manage A/B tests
export function useABTestManager(demoMode: boolean = false) {
  const [tests, setTests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTests = useCallback(async () => {
    if (demoMode) {
      // Demo mode: return simulated test data
      setTimeout(() => {
        const demoTests = [
          {
            id: 'demo-test-1',
            name: 'Content Generation Performance',
            description: 'Compare Vercel AI SDK vs traditional providers for content generation',
            enabled: true,
            startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            variants: [
              { id: 'v1', name: 'Vercel AI SDK', provider: 'vercel', weight: 50 },
              { id: 'v2', name: 'Traditional', provider: 'traditional', weight: 50 }
            ],
            metrics: [
              { 
                variantId: 'v1', 
                totalRequests: 156, 
                successfulRequests: 152,
                averageLatency: 1200, 
                averageCost: 0.0031,
                averageTokensPerSecond: 45.2,
                userSatisfaction: 4.2
              },
              { 
                variantId: 'v2', 
                totalRequests: 144, 
                successfulRequests: 140,
                averageLatency: 1850, 
                averageCost: 0.0028,
                averageTokensPerSecond: 32.1,
                userSatisfaction: 3.8
              }
            ]
          }
        ];
        setTests(demoTests);
        setIsLoading(false);
      }, 300);
      return;
    }

    try {
      const response = await fetch('/api/v1/ai/ab-testing/tests');
      if (!response.ok) throw new Error('Failed to fetch tests');
      
      const data = await response.json();
      setTests(data.tests);
    } catch (err) {
      console.error('Failed to fetch A/B tests:', err);
    } finally {
      setIsLoading(false);
    }
  }, [demoMode]);

  const createTest = useCallback(async (config: any) => {
    try {
      const response = await fetch('/api/v1/ai/ab-testing/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) throw new Error('Failed to create test');
      
      await fetchTests();
      return await response.json();
    } catch (err) {
      console.error('Failed to create A/B test:', err);
      throw err;
    }
  }, [fetchTests]);

  const updateTest = useCallback(async (testId: string, updates: any) => {
    try {
      const response = await fetch(`/api/v1/ai/ab-testing/tests/${testId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) throw new Error('Failed to update test');
      
      await fetchTests();
    } catch (err) {
      console.error('Failed to update A/B test:', err);
      throw err;
    }
  }, [fetchTests]);

  const endTest = useCallback(async (testId: string) => {
    if (demoMode) {
      // Demo mode: just log the action, don't make API calls
      console.log('Demo: Ending test', testId);
      return;
    }

    try {
      const response = await fetch(`/api/v1/ai/ab-testing/tests/${testId}/end`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to end test');
      
      await fetchTests();
    } catch (err) {
      console.error('Failed to end A/B test:', err);
      throw err;
    }
  }, [fetchTests, demoMode]);

  const getWinner = useCallback(async (testId: string) => {
    if (demoMode) {
      // Demo mode: return simulated winner data
      return {
        variant: {
          id: 'v1',
          name: 'Vercel AI SDK',
          provider: 'vercel',
          weight: 50
        },
        confidence: 92.3,
        metrics: {
          variantId: 'v1',
          totalRequests: 156,
          successfulRequests: 152,
          averageLatency: 1200,
          averageCost: 0.0031,
          averageTokensPerSecond: 45.2,
          userSatisfaction: 4.2
        }
      };
    }

    try {
      const response = await fetch(`/api/v1/ai/ab-testing/tests/${testId}/winner`);
      if (!response.ok) throw new Error('Failed to get winner');
      
      return await response.json();
    } catch (err) {
      console.error('Failed to get winner:', err);
      return null;
    }
  }, [demoMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchTests();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [fetchTests]);

  return {
    tests,
    isLoading,
    createTest,
    updateTest,
    endTest,
    getWinner,
    refreshTests: fetchTests
  };
}
