'use client';
import { normalizeError } from '@/lib/errors/normalize-error';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlanSelectionCards } from './plan-selection-cards';
import { UsageChart } from './usage-chart';
import { BillingHistory } from './billing-history';
import { BillingStatusDebug } from './billing-status-debug';
import { TrialCountdown, TrialCountdownText } from './trial-countdown';
import { useCSRF } from '@/hooks/useCSRF';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useNotify } from '@/contexts/notification-context';
import { UsageWarning } from '@/components/ui/usage-warning';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle,
  CreditCard,
  Crown,
  Download,
  FileText,
  Filter,
  Package,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';
import { formatCurrency, getSubscriptionPlans } from '@/lib/stripe';

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
    savedSearches: number;
    aiCreditsPerMonth: number;
    matchScoreCalculations: number;
  };
  planDetails: {
    name: string;
    description: string;
    features: string[];
  };
}

interface Usage {
  period: {
    start: string;
    end: string;
  };
  totals: {
    OPPORTUNITY_MATCH: number;
    AI_QUERY: number;
    DOCUMENT_PROCESSING: number;
    API_CALL: number;
    EXPORT: number;
    MATCH_SCORE_CALCULATION: number;
    SAVED_SEARCH: number;
  };
  limits: {
    seats: number;
    savedSearches: number;
    aiCreditsPerMonth: number;
    matchScoreCalculations: number;
  };
  percentUsed: {
    matches: number;
    aiQueries: number;
    documents: number;
    matchScoreCalculations: number;
    savedSearches: number;
  };
}

export function BillingDashboard() {
  const { user } = useUser();
  const { token: csrfToken, addToHeaders } = useCSRF();
  const notify = useNotify();

  // Use real-time subscription hook for immediate updates
  const {
    subscription,
    loading: subscriptionLoading,
    error: subscriptionError,
    refetch: refetchSubscription,
    invalidateCache,
    lastUpdated
  } = useRealtimeSubscription({
    pollInterval: 300000, // Poll every 5 minutes (much less frequent)
    enableBackgroundSync: true,
    onPlanChange: (newPlan, oldPlan) => {
      notify.success('Plan Updated', `Successfully switched from ${oldPlan} to ${newPlan}`);
    }
  });

  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Usage warning state
  const [usageWarning, setUsageWarning] = useState<{
    message?: string
    upgradeMessage?: string
    isDeveloperOverride?: boolean
  }>({});

  // Check usage limits and set warning if needed
  const checkUsageLimits = async () => {
    try {
      // Check different usage types that are commonly at risk of limits
      const usageTypesToCheck = ['DOCUMENT_PROCESSING', 'AI_QUERY', 'EXPORT'];

      for (const usageType of usageTypesToCheck) {
        const response = await fetch('/api/v1/billing/usage/check', {
          method: 'POST',
          headers: addToHeaders({
            'Content-Type': 'application/json',
          }),
          credentials: 'include',
          body: JSON.stringify({
            usageType,
            quantity: 1
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.warningMessage) {
            setUsageWarning({
              message: data.warningMessage,
              upgradeMessage: data.upgradeMessage,
              isDeveloperOverride: data.isDeveloperOverride
            });
            return; // Show the first warning we find
          }
        }
      }

      // If no warnings found, clear any existing warning
      setUsageWarning({});
    } catch (error) {
      console.error('Failed to check usage limits:', error);
    }
  };

  // Handle upgrade navigation
  const handleUpgrade = () => {
    // We're already on the billing page, so scroll to plan selection
    const planSection = document.getElementById('plan-selection');
    if (planSection) {
      planSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Fetch usage data (subscription data is handled by useRealtimeSubscription hook)
  useEffect(() => {
    async function fetchUsageData() {
      if (!user) {
        setLoading(false);
        setError('Please sign in to access billing information');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch usage data
        const usageResponse = await fetch('/api/v1/billing/usage', {
          headers: addToHeaders({
            'Content-Type': 'application/json',
          }),
          credentials: 'include',
        });

        if (usageResponse.ok) {
          const usageData = await usageResponse.json();
          setUsage(usageData.usage);
        } else if (usageResponse.status === 401) {
          setUsage(null);
        } else {
          console.warn('Failed to fetch usage data:', usageResponse.status);
          setUsage(null);
        }

        // Check usage limits and warnings
        await checkUsageLimits();

      } catch (err) {
        console.error('Error fetching usage data:', err);
        setUsage(null);
      } finally {
        setLoading(false);
      }
    }

    fetchUsageData();
  }, [user, addToHeaders]);

  const handleCreateCheckout = async (planType: string) => {
    if (!csrfToken) {
      const message = 'Security token not available. Please refresh the page and try again.';
      setError(message);
      notify.error('Security Error', message);
      return;
    }

    try {
      notify.info('Creating Checkout', `Setting up your ${planType} subscription...`);

      const response = await fetch('/api/v1/billing/subscription', {
        method: 'POST',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          planType,
          successUrl: `${window.location.origin}/billing?success=true`,
          cancelUrl: `${window.location.origin}/billing?canceled=true`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.code === 'STRIPE_NOT_CONFIGURED') {
          throw new Error('Stripe is not configured. Please contact support.');
        }
        const errorMessage = errorData?.message || errorData?.error || `HTTP ${response.status}: Failed to create checkout session`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.checkoutUrl) {
        notify.success('Redirecting to Stripe', 'Taking you to secure checkout...');
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL received from server');
      }
    } catch (err) {
      console.error('Error creating checkout:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start checkout process';
      setError(errorMessage);
      notify.error('Checkout Failed', errorMessage);
    }
  };

  const handleUpdateSubscription = async (newPlanType: string) => {
    // Skip CSRF check for now to debug the main issue
    // if (!csrfToken) {
    //   setError('Security token not available. Please refresh the page and try again.');
    //   return;
    // }

    // Show usage preservation confirmation
    const currentUsage = usage?.totals || {};
    const hasUsage = Object.values(currentUsage).some(value => (value as number) > 0);

    if (hasUsage) {
      const confirmMessage = `You're switching from ${subscription?.planType} to ${newPlanType}.\n\nGood news! Your current usage data will be preserved:\n${Object.entries(currentUsage).map(([type, count]) => `• ${type}: ${count}`).join('\n')}\n\nDo you want to continue?`;

      if (!confirm(confirmMessage)) {
        return;
      }
    }

    // Clear any previous errors and set updating state
    setError(null);
    setUpdating(true);

    try {
      notify.info('Updating Plan', `Switching to ${newPlanType} plan... Your usage data will be preserved.`);
      console.log('🔄 Starting subscription update to plan:', newPlanType);
      console.log('CSRF token available:', !!csrfToken);

      const requestHeaders = addToHeaders({
        'Content-Type': 'application/json',
      });
      const requestBody = JSON.stringify({
        planType: newPlanType,
      });

      console.log('Request headers:', requestHeaders);
      console.log('Request body:', requestBody);

      let response;
      try {
        response = await fetch('/api/v1/billing/subscription', {
          method: 'PATCH',
          headers: requestHeaders,
          credentials: 'include',
          body: requestBody,
        });
        console.log('✅ Fetch completed successfully');
      } catch (caughtFetcherror) {
      const fetchError = normalizeError(caughtFetcherror);
        console.error('❌ Fetch failed:', fetchError);
        throw new Error(`Network request failed: ${fetchError.message || String(fetchError)}`);
      }

      console.log('Response status:', response.status, response.statusText);
      console.log('Response OK?:', response.ok);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorData = null;
        let responseText = '';

        try {
          responseText = await response.text();
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          console.error('Raw response text:', responseText);
        }

        const errorMessage = errorData?.error || errorData?.message || `HTTP ${response.status}: ${response.statusText}`;
        const errorCode = errorData?.code;

        console.error('Subscription update error:', {
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorCode,
          errorData,
          responseText
        });

        // Handle specific error cases
        if (errorCode === 'SUBSCRIPTION_NOT_FOUND') {
          throw new Error('No active subscription found. Please create a subscription first by selecting a plan below.');
        }

        if (errorCode === 'UNAUTHORIZED') {
          throw new Error('Please sign in to manage your subscription.');
        }

        if (errorCode === 'ORGANIZATION_NOT_FOUND') {
          throw new Error('Organization setup incomplete. Please contact support.');
        }

        if (errorCode === 'STRIPE_NOT_CONFIGURED') {
          throw new Error('Billing system not configured. Please contact support.');
        }

        if (errorCode === 'SAME_PLAN_SELECTED') {
          throw new Error(errorMessage || 'You are already on this plan.');
        }

        throw new Error(errorMessage);
      }

      let data;
      try {
        console.log('📥 Reading response...');
        const responseText = await response.text();
        console.log('📄 Response text (first 500 chars):', responseText.substring(0, 500));
        console.log('📄 Response text length:', responseText.length);

        if (!responseText) {
          throw new Error('Empty response from server');
        }

        console.log('🔄 Parsing JSON...');
        data = JSON.parse(responseText);
        console.log('✅ JSON parsed successfully:', data);
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        console.error('Parse error type:', typeof parseError);
        console.error('Parse error details:', {
          message: parseError instanceof Error ? parseError.message : 'No message',
          stack: parseError instanceof Error ? parseError.stack : 'No stack',
          raw: parseError
        });
        throw new Error(`Invalid response format from server: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      // If there's a checkout URL, redirect to complete the plan change
      if (data.checkoutUrl) {
        console.log('✅ Checkout session created, redirecting to Stripe:', data.checkoutUrl);
        notify.success('Redirecting to Stripe', 'Taking you to complete your plan change...');
        window.location.href = data.checkoutUrl;
      } else {
        console.log('✅ Direct subscription update completed');

        // IMMEDIATE UI UPDATE - fetch fresh data (no cache to invalidate)
        console.log('🚀 Performing immediate UI update...');
        notify.success('Plan Updated', 'Your subscription has been updated successfully!');

        try {
          // Fetch fresh data immediately (no cache since caching is disabled)
          await refetchSubscription();

          console.log('✅ Immediate UI update completed');
          notify.success('Update Complete', 'Your new plan is now active!');

        } catch (refreshError) {
          console.warn('⚠️ Immediate refresh failed, performing background sync...', refreshError);

          // Fallback to background sync if immediate refresh fails
          try {
            const syncResponse = await fetch('/api/v1/billing/sync', {
              method: 'POST',
              headers: addToHeaders({
                'Content-Type': 'application/json',
              }),
              credentials: 'include',
            });

            if (syncResponse.ok) {
              console.log('✅ Background sync completed successfully');
              await refetchSubscription();
              notify.success('Update Complete', 'Your subscription has been updated successfully.');
            } else {
              console.warn('⚠️ Background sync failed, changes should still be active');
              notify.warning('Update Completed', 'Your changes have been saved. If the UI doesn\'t update, please refresh the page.');
            }
          } catch (syncError) {
            console.error('❌ Background sync error:', syncError);
            notify.warning('Update Completed', 'Your changes have been saved. Please refresh the page to see updates.');
          }
        }
      }
    } catch (err) {
      console.error('Subscription update error:', err);
      console.error('Error type:', typeof err);
      console.error('Error constructor:', err?.constructor?.name);
      console.error('Error toString:', String(err));
      console.error('Error JSON:', JSON.stringify(err, null, 2));
      console.error('Error details:', {
        message: err instanceof Error ? err.message : 'No message',
        stack: err instanceof Error ? err.stack : 'No stack',
        raw: err,
        keys: Object.keys(err || {}),
        values: Object.values(err || {})
      });

      let errorMessage = 'Failed to update subscription';

      if (err instanceof Error) {
        errorMessage = err.message || 'Unknown error occurred';
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.error || 'Unknown error occurred';
      }

      setError(`Unable to update subscription: ${errorMessage}`);
      notify.error('Update Failed', errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelSubscription = async () => {
    // Skip CSRF check for now to debug the main issue
    // if (!csrfToken) {
    //   setError('Security token not available. Please refresh the page and try again.');
    //   return;
    // }

    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? It will remain active until the end of your current billing period.'
    );

    if (!confirmed) return;

    setUpdating(true);
    setError(null);

    try {
      notify.info('Canceling Subscription', 'Processing your cancellation request...');
      console.log('🔄 Canceling subscription...');

      const response = await fetch('/api/v1/billing/subscription', {
        method: 'PATCH',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          cancelAtPeriodEnd: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || errorData?.message || 'Failed to cancel subscription';
        throw new Error(errorMessage);
      }

      console.log('✅ Subscription cancelled, syncing data...');
      notify.success('Subscription Canceled', 'Your subscription will end at the end of your current billing period.');

      // Sync data from Stripe before updating UI
      try {
        const syncResponse = await fetch('/api/v1/billing/sync', {
          method: 'POST',
          headers: addToHeaders({
            'Content-Type': 'application/json',
          }),
          credentials: 'include',
        });

        if (syncResponse.ok) {
          console.log('✅ Data synced successfully');
        } else {
          console.warn('⚠️ Sync failed, but cancellation may have succeeded');
        }
      } catch (syncError) {
        console.error('❌ Sync error:', syncError);
      }

      // Refresh the page to show updated subscription
      window.location.reload();
    } catch (err) {
      console.error('Error canceling subscription:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel subscription';
      setError(`Unable to cancel subscription: ${errorMessage}`);
      notify.error('Cancellation Failed', errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleReactivateSubscription = async () => {
    setUpdating(true);
    setError(null);

    try {
      notify.info('Reactivating Subscription', 'Restoring your subscription...');
      console.log('🔄 Reactivating subscription...');

      const response = await fetch('/api/v1/billing/subscription', {
        method: 'PATCH',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          cancelAtPeriodEnd: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || errorData?.message || 'Failed to reactivate subscription';
        throw new Error(errorMessage);
      }

      console.log('✅ Subscription reactivated, syncing data...');
      notify.success('Subscription Reactivated', 'Your subscription is now active and will continue automatically.');

      // Sync data from Stripe before updating UI
      try {
        const syncResponse = await fetch('/api/v1/billing/sync', {
          method: 'POST',
          headers: addToHeaders({
            'Content-Type': 'application/json',
          }),
          credentials: 'include',
        });

        if (syncResponse.ok) {
          console.log('✅ Data synced successfully');
        } else {
          console.warn('⚠️ Sync failed, but reactivation may have succeeded');
        }
      } catch (syncError) {
        console.error('❌ Sync error:', syncError);
      }

      // Refresh the page to show updated subscription
      window.location.reload();
    } catch (err) {
      console.error('Error reactivating subscription:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to reactivate subscription';
      setError(`Unable to reactivate subscription: ${errorMessage}`);
      notify.error('Reactivation Failed', errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!csrfToken) {
      const message = 'Security token not available. Please refresh the page and try again.';
      setError(message);
      notify.error('Security Error', message);
      return;
    }

    try {
      notify.info('Opening Billing Portal', 'Taking you to manage your subscription...');
      const response = await fetch('/api/v1/billing/portal', {
        method: 'POST',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || errorData?.message || 'Failed to create portal session';
        const errorCode = errorData?.code;

        // Handle specific error codes
        if (errorCode === 'PORTAL_NOT_CONFIGURED') {
          setError(
            'The Stripe customer portal is not configured yet. ' +
            'You can still cancel your subscription using the "Cancel Subscription" button below, ' +
            'or change plans using the plan selector.'
          );
          return;
        }

        if (errorCode === 'NO_STRIPE_CUSTOMER') {
          setError('No billing account found. Please select a plan below to get started.');
          return;
        }

        if (errorCode === 'STRIPE_CUSTOMER_NOT_FOUND') {
          setError('Billing account not found. Please contact support or select a plan below.');
          return;
        }

        // Handle generic Stripe errors
        if (errorCode === 'STRIPE_ERROR') {
          setError('Unable to access billing portal. Please try again later or contact support.');
          return;
        }

        // Fallback for other errors
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.portalUrl) {
        notify.success('Redirecting', 'Opening Stripe billing portal...');
        window.location.href = data.portalUrl;
      } else {
        throw new Error('No portal URL received from server');
      }
    } catch (err) {
      console.error('Error opening customer portal:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to open customer portal';

      // Set a user-friendly error message
      setError(`Unable to open billing portal: ${errorMessage}`);
      notify.error('Portal Error', errorMessage);
    }
  };

  const handleTestApi = async () => {
    try {
      console.log('🧪 Testing API connection...');
      setError(null);

      const response = await fetch('/api/v1/billing/test', {
        method: 'POST',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          test: true,
          planType: 'PROFESSIONAL'
        })
      });

      const data = await response.json();
      console.log('Test API result:', data);

      if (response.ok) {
        alert('✅ API connection working! Check console for details.');
      } else {
        alert(`❌ API test failed: ${data.error || data.message}`);
      }
    } catch (err) {
      console.error('Test API error:', err);
      alert(`❌ Test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSyncSubscription = async () => {
    if (!csrfToken) {
      const message = 'Security token not available. Please refresh the page and try again.';
      setError(message);
      notify.error('Security Error', message);
      return;
    }

    try {
      setSyncing(true);
      setError(null);

      notify.info('Syncing Data', 'Fetching latest subscription data from Stripe...');
      console.log('Syncing subscription data from Stripe...');

      const response = await fetch('/api/v1/billing/sync', {
        method: 'POST',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || errorData?.message || 'Failed to sync subscription data';
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Sync result:', data);

      notify.success('Sync Complete', 'Subscription data has been updated successfully.');

      // Refresh the page to show updated data
      window.location.reload();
    } catch (err) {
      console.error('Error syncing subscription:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync subscription data';
      setError(`Sync failed: ${errorMessage}`);
      notify.error('Sync Failed', errorMessage);
    } finally {
      setSyncing(false);
    }
  };

  if (loading || (subscriptionLoading && !subscription)) {
    return (
      <div className="min-h-[600px] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-lg font-medium text-muted-foreground">Loading your billing information...</p>
        </div>
      </div>
    );
  }

  if (error || subscriptionError) {
    return (
      <div className="space-y-6">
        <BillingStatusDebug />
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="max-w-md w-full space-y-6">
            <div className="text-center">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Unable to Load Billing</h3>
              <p className="text-muted-foreground mb-6">{error}</p>
              {error.includes('sign in') ? (
                <Button asChild size="lg" className="w-full">
                  <a href="/sign-in">Sign In to Continue</a>
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleTestApi}
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    🧪 Test API Connection
                  </Button>
                  <Button
                    onClick={handleSyncSubscription}
                    size="lg"
                    className="w-full"
                    disabled={syncing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing from Stripe...' : 'Sync from Stripe'}
                  </Button>
                  <Button
                    onClick={() => window.location.reload()}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    Refresh Page
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show plan selection if no subscription
  if (!subscription) {
    return (
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="text-center py-12 bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-2xl border border-gray-100">
          <div className="max-w-2xl mx-auto">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6">
              <Crown className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Welcome to Document Chat System
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Choose a plan to unlock AI-powered document chat and analysis features
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm text-muted-foreground">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                14-day free trial
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                Cancel anytime
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                No setup fees
              </div>
            </div>
          </div>
        </div>

        <PlanSelectionCards onSelectPlan={handleCreateCheckout} disabled={updating} />
      </div>
    );
  }

  const nextBillingDate = new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Enhanced trial detection - check both status and trial dates
  const isTrialing = (() => {
    // Direct trial status from Stripe
    if (subscription.status === 'TRIALING') {
      return true;
    }

    // Check if subscription has trial dates and trial hasn't ended yet
    if (subscription.trialEnd) {
      const trialEndDate = new Date(subscription.trialEnd);
      const now = new Date();
      return now < trialEndDate; // Still in trial period
    }

    return false;
  })();

  // Only show as canceled if the subscription is actually canceled (status = CANCELED)
  const isCanceled = subscription.status === 'CANCELED';
  // Show cancellation for both ACTIVE and TRIALING subscriptions that are scheduled to cancel
  const isScheduledForCancellation = subscription.cancelAtPeriodEnd &&
    (subscription.status === 'ACTIVE' || subscription.status === 'TRIALING' || isTrialing);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800 border-green-200';
      case 'TRIALING': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'PAST_DUE': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-muted text-muted-foreground border-muted';
    }
  };

  const usageMetrics = [
    {
      name: 'AI Chat Messages',
      icon: Zap,
      current: usage?.totals.AI_QUERY || 0,
      limit: subscription?.limits?.aiCreditsPerMonth ?? 0,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      progressColor: 'bg-orange-500'
    },
    {
      name: 'Documents',
      icon: FileText,
      current: usage?.totals.DOCUMENT_PROCESSING || 0,
      limit: subscription?.limits?.matchScoreCalculations ?? 0, // Will be updated to document limit
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      progressColor: 'bg-blue-500'
    },
    {
      name: 'Pages Processed',
      icon: FileText,
      current: usage?.totals.SAVED_SEARCH || 0, // Will be updated to pages processed
      limit: subscription?.limits?.savedSearches ?? 0, // Will be updated to pages limit
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      progressColor: 'bg-green-500'
    }
  ];

  const activityMetrics = [
    {
      name: 'Documents Uploaded',
      value: usage?.totals.DOCUMENT_PROCESSING || 0,
      icon: FileText,
      color: 'text-purple-600'
    },
    {
      name: 'Chat Sessions',
      value: usage?.totals.AI_QUERY || 0,
      icon: Zap,
      color: 'text-indigo-600'
    },
    {
      name: 'Data Exports',
      value: usage?.totals.EXPORT || 0,
      icon: Download,
      color: 'text-cyan-600'
    },
    {
      name: 'API Requests',
      value: usage?.totals.API_CALL || 0,
      icon: Activity,
      color: 'text-pink-600'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Trial Status - Enhanced Display */}
      {isTrialing && !isScheduledForCancellation && (
        <div className="bg-gradient-to-r from-blue-50 via-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full">
                <Zap className="h-6 w-6 text-blue-600 animate-pulse" />
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-bold text-blue-900 mb-1">
                    🎉 Free Trial Active
                  </h3>
                  <p className="text-blue-700">
                    You're enjoying all premium features at no cost.
                    <span className="font-medium"> Trial ends on {nextBillingDate}</span>
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <TrialCountdown
                    trialEnd={subscription.trialEnd || subscription.currentPeriodEnd}
                    size="medium"
                  />
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-600 font-medium mb-1">Current Value</div>
              <div className="text-2xl font-bold text-blue-900">
                {formatCurrency(subscription.amount / 100)}
                <span className="text-sm font-normal text-blue-600">/month</span>
              </div>
              <div className="text-xs text-blue-600">You're saving during trial!</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-blue-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-blue-700">
                💡 <strong>Tip:</strong> No payment required until trial ends. Cancel anytime!
              </div>
              <button
                onClick={() => {
                  // Scroll to plans tab
                  const plansTab = document.querySelector('[value="plans"]');
                  if (plansTab) {
                    (plansTab as HTMLElement).click();
                    setTimeout(() => {
                      const plansSection = document.querySelector('[data-state="active"][role="tabpanel"]');
                      if (plansSection) {
                        plansSection.scrollIntoView({ behavior: 'smooth' });
                      }
                    }, 100);
                  }
                }}
                className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Continue with this plan
              </button>
            </div>
          </div>
        </div>
      )}

      {isCanceled && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <AlertDescription className="text-red-800 font-medium">
            <div className="space-y-2">
              <div>
                <strong>Subscription Canceled</strong> · Your subscription ended on {nextBillingDate}.
              </div>
              <div className="text-sm text-red-700">
                Your subscription has been canceled. To continue using premium features, please select a new plan below.
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isScheduledForCancellation && (
        <div className={`border rounded-xl p-6 ${
          isTrialing
            ? 'bg-gradient-to-r from-orange-50 via-orange-50 to-red-50 border-orange-200'
            : 'bg-gradient-to-r from-orange-50 via-orange-50 to-yellow-50 border-orange-200'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="flex items-center justify-center w-12 h-12 bg-orange-100 rounded-full">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="text-xl font-bold text-orange-900 mb-1">
                    {isTrialing ? '⏰ Trial Canceled' : '📅 Subscription Ending'}
                  </h3>
                  <p className="text-orange-700">
                    Your {isTrialing ? 'trial' : 'subscription'} will end on{' '}
                    <span className="font-medium">{nextBillingDate}</span>
                    {isTrialing ? '. You can still continue with a paid plan!' : '.'}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <TrialCountdown
                    trialEnd={subscription.trialEnd || subscription.currentPeriodEnd}
                    size="medium"
                  />
                </div>
              </div>
            </div>
            <div className="text-right space-y-2">
              <button
                onClick={handleReactivateSubscription}
                disabled={updating}
                className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white px-6 py-3 rounded-lg font-medium transition-colors text-sm dark:text-white"
              >
                {updating ? 'Processing...' : isTrialing ? 'Continue with Paid Plan' : 'Reactivate Subscription'}
              </button>
              <div className="text-xs text-orange-600">
                {isTrialing ? 'Keep all your trial benefits' : 'Resume your subscription'}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-orange-200">
            <div className="text-sm text-orange-700">
              <strong>Good news:</strong> You'll retain access to all premium features until {nextBillingDate}.
              {(() => {
                const endDate = new Date(subscription.currentPeriodEnd);
                const now = new Date();
                const diffTime = endDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                  return " That's tomorrow!";
                } else if (diffDays > 0) {
                  return ` That's ${diffDays} days from now.`;
                } else {
                  return ` Your ${isTrialing ? 'trial' : 'subscription'} ends today.`;
                }
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Usage Warning */}
      {usageWarning.message && (
        <UsageWarning
          warning={usageWarning.message}
          upgradeMessage={usageWarning.upgradeMessage}
          isDeveloperOverride={usageWarning.isDeveloperOverride}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Main Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Current Plan - 2 columns */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                      <Crown className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-bold text-foreground">
                        {subscription.planDetails.name} Plan
                      </CardTitle>
                      <CardDescription className="text-base">
                        {subscription.planDetails.description}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <Badge className={`${getStatusColor(subscription.status)} font-medium`}>
                      {subscription.status}
                    </Badge>
                    {subscription.status === 'TRIALING' && !isScheduledForCancellation && (
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                        Trial - <TrialCountdownText trialEnd={subscription.trialEnd || subscription.currentPeriodEnd} />
                      </Badge>
                    )}
                    {isCanceled && (
                      <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                        Canceled
                      </Badge>
                    )}
                    {isScheduledForCancellation && (
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-200">
                        {isTrialing ? 'Trial Canceled' : 'Canceling'} {(() => {
                          const endDate = new Date(subscription.currentPeriodEnd);
                          const now = new Date();
                          const diffTime = endDate.getTime() - now.getTime();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                          if (diffDays === 1) {
                            return "Tomorrow";
                          } else if (diffDays > 0) {
                            return `in ${diffDays} days`;
                          } else {
                            return "Today";
                          }
                        })()}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    onClick={handleSyncSubscription}
                    variant="outline"
                    size="sm"
                    disabled={syncing || updating}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : updating ? 'Processing...' : 'Sync'}
                  </Button>
                  <Button
                    onClick={handleManageSubscription}
                    variant="outline"
                    size="sm"
                    disabled={updating || syncing}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Manage
                  </Button>
                  <Button
                    onClick={() => {
                      // Scroll to plans tab
                      const plansTab = document.querySelector('[value="plans"]');
                      if (plansTab) {
                        (plansTab as HTMLElement).click();
                        setTimeout(() => {
                          const plansSection = document.querySelector('[data-state="active"][role="tabpanel"]');
                          if (plansSection) {
                            plansSection.scrollIntoView({ behavior: 'smooth' });
                          }
                        }, 100);
                      }
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700"
                    disabled={updating || syncing}
                  >
                    {updating ? 'Processing...' : 'Change Plan'}
                  </Button>
                  {isCanceled ? (
                    <div className="text-sm text-muted-foreground">
                      Select a plan below to reactivate
                    </div>
                  ) : isScheduledForCancellation ? (
                    <Button
                      onClick={handleReactivateSubscription}
                      variant="ghost"
                      size="sm"
                      className="text-green-600 hover:text-green-700"
                      disabled={updating || syncing}
                    >
                      {updating ? 'Processing...' : 'Continue'}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCancelSubscription}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      disabled={updating || syncing}
                    >
                      {updating ? 'Processing...' : 'Cancel'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Billing Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Billing Details</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        {isTrialing ? 'Plan Value' : 'Monthly Cost'}
                      </span>
                      <div className="text-right">
                        <span className="font-semibold text-lg">
                          {formatCurrency(subscription.amount / 100)}
                        </span>
                        {isTrialing && (
                          <div className="text-xs text-green-600 font-medium">
                            FREE during trial
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        {isCanceled ? 'Subscription Ended' : isScheduledForCancellation ? (isTrialing ? 'Trial Ends' : 'Ends On') : (isTrialing ? 'Trial Ends' : 'Next Payment')}
                      </span>
                      <div className="flex items-center space-x-2">
                        <Calendar className={`h-4 w-4 ${isCanceled || isScheduledForCancellation ? 'text-red-400' : 'text-gray-400'}`} />
                        <span className={`font-medium ${isCanceled || isScheduledForCancellation ? 'text-red-600' : ''}`}>
                          {nextBillingDate}
                        </span>
                      </div>
                    </div>
                    {(isCanceled || isScheduledForCancellation) && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Status</span>
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                          <span className="font-medium text-red-600">
                            {isCanceled ? 'Canceled' : isTrialing ? `Trial canceled - ${(() => {
                              const endDate = new Date(subscription.currentPeriodEnd);
                              const now = new Date();
                              const diffTime = endDate.getTime() - now.getTime();
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                              if (diffDays === 1) {
                                return "ends tomorrow";
                              } else if (diffDays > 0) {
                                return `${diffDays} days left`;
                              } else {
                                return "ends today";
                              }
                            })()}` : `Scheduled for cancellation - ${(() => {
                              const endDate = new Date(subscription.currentPeriodEnd);
                              const now = new Date();
                              const diffTime = endDate.getTime() - now.getTime();
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                              if (diffDays === 1) {
                                return "ends tomorrow";
                              } else if (diffDays > 0) {
                                return `${diffDays} days left`;
                              } else {
                                return "ends today";
                              }
                            })()}`}
                          </span>
                        </div>
                      </div>
                    )}
                    {isTrialing && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Trial Status</span>
                        <div className="text-right">
                          <div className="text-sm font-medium text-blue-600">
                            <TrialCountdownText trialEnd={subscription.trialEnd || subscription.currentPeriodEnd} />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            No payment until trial ends
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">Plan Features</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {subscription.planDetails.features.slice(0, 4).map((feature, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </div>
                    ))}
                    {subscription.planDetails.features.length > 4 && (
                      <div className="text-xs text-muted-foreground pl-6">
                        +{subscription.planDetails.features.length - 4} more features
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Overview - 1 column */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Usage This Month
            </h3>
            <div className="space-y-4">
              {usageMetrics.map((metric) => {
                const Icon = metric.icon;
                const safeLimit = metric.limit ?? 0;
                const percentage = safeLimit > 0 && safeLimit !== -1
                  ? Math.min((metric.current / safeLimit) * 100, 100)
                  : 0;

                return (
                  <Card key={metric.name} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                          <Icon className={`h-4 w-4 ${metric.color}`} />
                        </div>
                        <span className="font-medium text-foreground">{metric.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-lg text-foreground">
                          {metric.current.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          of {metric.limit === -1 ? '∞' : (metric.limit ?? 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {safeLimit > 0 && safeLimit !== -1 && (
                      <div className="space-y-1">
                        <Progress
                          value={percentage}
                          className="h-2"
                          style={{
                            backgroundColor: '#f3f4f6'
                          }}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{percentage.toFixed(0)}% used</span>
                          <span>{(safeLimit - metric.current).toLocaleString()} remaining</span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Overview */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Activity Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {activityMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.name} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-12 h-12 bg-gray-50 rounded-lg">
                    <Icon className={`h-6 w-6 ${metric.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{metric.value.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">{metric.name}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="plans" className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="h-14 w-full grid grid-cols-3 p-0 bg-background justify-start rounded-none flex-1 mr-4">
            <TabsTrigger value="plans" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
              <Package className="shrink-0" />
              <code className="mt-1.5 text-[13px]">Available Plans</code>
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
              <BarChart3 className="shrink-0" />
              <code className="mt-1.5 text-[13px]">Usage Analytics</code>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
              <Receipt className="shrink-0" />
              <code className="mt-1.5 text-[13px]">Billing History</code>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center space-x-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <TabsContent value="plans" className="space-y-6" id="plan-selection">
          <div className="text-center py-4">
            <h3 className="text-xl font-semibold text-foreground mb-2">Upgrade or Change Your Plan</h3>
            <p className="text-muted-foreground">Switch to a different plan that better fits your needs</p>
          </div>

          {/* Usage Preservation Information */}
          {usage && Object.values(usage.totals || {}).some(value => (value as number) > 0) && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Your usage data will be preserved</strong> when switching plans.
                Current usage: {Object.entries(usage.totals || {}).map(([type, count]) => `${type}: ${count}`).join(', ')}
              </AlertDescription>
            </Alert>
          )}

          <PlanSelectionCards
            currentPlan={subscription.planType}
            onSelectPlan={handleUpdateSubscription}
            disabled={updating}
          />
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          {usage && <UsageChart usage={usage} />}
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <BillingHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
