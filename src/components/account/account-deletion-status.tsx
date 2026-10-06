'use client';
import { useQuery } from '@tanstack/react-query';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useCSRF } from '@/hooks/useCSRF';
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  XCircle,
  RefreshCw
} from 'lucide-react';

interface DeletionStatus {
  hasPendingDeletion: boolean;
  deletion?: {
    id: string;
    status: string;
    requestedAt: string;
    softDeletedAt?: string;
    scheduledHardDeleteAt?: string;
    daysUntilHardDelete?: number;
  } | null;
}

export function AccountDeletionStatus() {
  const { user } = useUser();
  const { token: csrfToken, addToHeaders } = useCSRF();
  
  const [actionError, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const query = useQuery({
    queryKey: ['account-deletion-status', user?.id], enabled: Boolean(user), gcTime: 0,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/v1/account/delete', { credentials: 'include', signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Failed to load deletion status');
      return await response.json() as DeletionStatus;
    },
  });
  const status = query.data ?? null;
  const loading = query.isFetching;
  const error = actionError || query.error?.message;
  const fetchDeletionStatus = async () => { await query.refetch(); };

  const handleCancelDeletion = async () => {
    if (!status?.deletion || !csrfToken) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel the account deletion? Your account and data will remain active.'
    );

    if (!confirmed) return;

    setCancelling(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/account/delete/cancel', {
        method: 'POST',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          accountDeletionId: status.deletion.id,
          reason: 'User cancelled via UI'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to cancel deletion');
      }

      // Refresh status
      await fetchDeletionStatus();

      // Show success message
      alert('Account deletion has been cancelled successfully. Your account remains active.');

    } catch (err) {
      console.error('Error cancelling deletion:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel deletion');
    } finally {
      setCancelling(false);
    }
  };


  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            <span className="text-gray-600">Checking deletion status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
          <Button 
            onClick={fetchDeletionStatus}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!status?.hasPendingDeletion) {
    return null; // Don't show anything if no pending deletion
  }

  const { deletion } = status;
  if (!deletion) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'SOFT_DELETED':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'HARD_DELETED':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'CANCELLED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'SOFT_DELETED':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'HARD_DELETED':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'CANCELLED':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const isActive = deletion.status === 'REQUESTED' || deletion.status === 'SOFT_DELETED';
  const canCancel = isActive && deletion.status !== 'HARD_DELETED';

  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center text-red-700">
          <AlertTriangle className="h-5 w-5 mr-2" />
          Account Deletion in Progress
        </CardTitle>
        <CardDescription className="text-red-600">
          Your account is scheduled for deletion. Review the details below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Status:</span>
              <Badge className={getStatusColor(deletion.status)}>
                <span className="flex items-center">
                  {getStatusIcon(deletion.status)}
                  <span className="ml-1">{deletion.status.replace('_', ' ')}</span>
                </span>
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Requested:</span>
              <span className="text-sm">
                {new Date(deletion.requestedAt).toLocaleDateString()}
              </span>
            </div>

            {deletion.softDeletedAt && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Data Anonymized:</span>
                <span className="text-sm">
                  {new Date(deletion.softDeletedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {deletion.scheduledHardDeleteAt && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Permanent Deletion:</span>
                  <span className="text-sm font-medium">
                    {new Date(deletion.scheduledHardDeleteAt).toLocaleDateString()}
                  </span>
                </div>

                {deletion.daysUntilHardDelete !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Days Remaining:</span>
                    <span className={`text-sm font-medium ${
                      deletion.daysUntilHardDelete <= 7 ? 'text-red-600' : 
                      deletion.daysUntilHardDelete <= 14 ? 'text-orange-600' : 
                      'text-gray-900'
                    }`}>
                      {deletion.daysUntilHardDelete > 0 
                        ? `${deletion.daysUntilHardDelete} days`
                        : 'Overdue'
                      }
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between">
              <span className="text-gray-600">Deletion ID:</span>
              <span className="text-xs font-mono">{deletion.id.slice(-8)}</span>
            </div>
          </div>
        </div>

        {isActive && deletion.daysUntilHardDelete !== undefined && deletion.daysUntilHardDelete > 0 && (
          <Alert className="border-amber-200 bg-amber-50">
            <Clock className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Grace Period Active:</strong> You have {deletion.daysUntilHardDelete} days 
              to cancel this deletion. After that, all data will be permanently deleted and cannot be recovered.
            </AlertDescription>
          </Alert>
        )}

        {deletion.daysUntilHardDelete !== undefined && deletion.daysUntilHardDelete <= 0 && (
          <Alert className="border-red-200 bg-red-50">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Deletion Overdue:</strong> Your account should have been permanently deleted. 
              Contact support if you need assistance.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center space-x-3 pt-4">
          <Button 
            onClick={fetchDeletionStatus}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>

          {canCancel && (
            <Button 
              onClick={handleCancelDeletion}
              variant="default"
              size="sm"
              disabled={cancelling}
              className="bg-green-600 hover:bg-green-700"
            >
              {cancelling ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Cancel Deletion
                </>
              )}
            </Button>
          )}
        </div>

        <div className="text-xs text-gray-500 pt-2 border-t">
          <strong>What was deleted:</strong> Personal information has been anonymized, subscriptions cancelled, 
          and access revoked. Billing records are retained for compliance.
        </div>
      </CardContent>
    </Card>
  );
}