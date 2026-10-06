'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCSRF } from '@/hooks/useCSRF';
import { 
  AlertTriangle, 
  Trash2, 
  Clock, 
  Shield, 
  FileText,
  CreditCard,
  User,
  Building,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { user } = useUser();
  const router = useRouter();
  const { token: csrfToken, addToHeaders } = useCSRF();
  
  const [step, setStep] = useState<'warning' | 'confirmation' | 'processing' | 'success'>('warning');
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [gracePeriodDays, setGracePeriodDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [deletionResult, setDeletionResult] = useState<any>(null);

  const REQUIRED_CONFIRM_TEXT = 'DELETE MY ACCOUNT';

  const handleClose = () => {
    if (step === 'processing') return; // Prevent closing during processing
    
    onOpenChange(false);
    // Reset state when closing
    setTimeout(() => {
      setStep('warning');
      setReason('');
      setConfirmText('');
      setGracePeriodDays(30);
      setError(null);
      setDeletionResult(null);
    }, 200);
  };

  const handleContinueToConfirmation = () => {
    setStep('confirmation');
    setError(null);
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== REQUIRED_CONFIRM_TEXT) {
      setError(`Please type "${REQUIRED_CONFIRM_TEXT}" exactly as shown.`);
      return;
    }

    if (!csrfToken) {
      setError('Security token not available. Please refresh and try again.');
      return;
    }

    setStep('processing');
    setError(null);

    try {
      const response = await fetch('/api/v1/account/delete', {
        method: 'POST',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          confirmText,
          gracePeriodDays
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }

      setDeletionResult(data);
      setStep('success');

      // After successful deletion, the user will be signed out
      // We'll handle the redirect in the success step

    } catch (err) {
      console.error('Account deletion error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setStep('confirmation'); // Go back to confirmation step
    }
  };

  const renderWarningStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center text-red-600">
          <AlertTriangle className="h-5 w-5 mr-2" />
          Delete Account
        </DialogTitle>
        <DialogDescription>
          This action will permanently delete your account and all associated data. Please read this carefully.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        {/* What happens immediately */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <Clock className="h-4 w-4 mr-2 text-orange-600" />
            What happens immediately:
          </h4>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>All active subscriptions will be cancelled</span>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Your account access will be immediately revoked</span>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Personal information will be anonymized</span>
            </div>
            <div className="flex items-start space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>API keys and access tokens will be revoked</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* What happens after grace period */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <Trash2 className="h-4 w-4 mr-2 text-red-600" />
            After {gracePeriodDays} days (permanent deletion):
          </h4>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span>All saved opportunities and applications</span>
            </div>
            <div className="flex items-start space-x-2">
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span>Company profiles and past performance data</span>
            </div>
            <div className="flex items-start space-x-2">
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span>Documents and uploaded files</span>
            </div>
            <div className="flex items-start space-x-2">
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span>Match scores and analytics data</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* What we keep */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <Shield className="h-4 w-4 mr-2 text-blue-600" />
            What we retain (legal requirement):
          </h4>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <FileText className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>Billing records and transaction history (7+ years)</span>
            </div>
            <div className="flex items-start space-x-2">
              <FileText className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>Anonymized usage analytics for service improvement</span>
            </div>
            <div className="flex items-start space-x-2">
              <FileText className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>Audit logs (anonymized) for security and compliance</span>
            </div>
          </div>
        </div>

        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Important:</strong> You have {gracePeriodDays} days to cancel this deletion request. 
            After that, the deletion is permanent and cannot be undone.
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button 
          variant="destructive"
          onClick={handleContinueToConfirmation}
          className="bg-red-600 hover:bg-red-700"
        >
          I Understand, Continue
        </Button>
      </DialogFooter>
    </>
  );

  const renderConfirmationStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center text-red-600">
          <AlertTriangle className="h-5 w-5 mr-2" />
          Confirm Account Deletion
        </DialogTitle>
        <DialogDescription>
          Please confirm that you want to delete your account by providing the required information.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        {/* Grace period selector */}
        <div>
          <Label htmlFor="gracePeriod">Grace Period (days)</Label>
          <div className="mt-2 space-y-2">
            <Input
              id="gracePeriod"
              type="number"
              min="1"
              max="90"
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(parseInt(e.target.value) || 30)}
              className="w-32"
            />
            <p className="text-sm text-gray-600">
              Days before permanent deletion (1-90). Default is 30 days.
            </p>
          </div>
        </div>

        {/* Reason (optional) */}
        <div>
          <Label htmlFor="reason">Reason for deletion (optional)</Label>
          <Textarea
            id="reason"
            placeholder="Help us improve by telling us why you're leaving..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2"
            rows={3}
          />
        </div>

        {/* Confirmation text */}
        <div>
          <Label htmlFor="confirmText" className="text-red-600 font-semibold">
            Type &quot;{REQUIRED_CONFIRM_TEXT}&quot; to confirm *
          </Label>
          <Input
            id="confirmText"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-2 border-red-200 focus:border-red-500"
            placeholder={REQUIRED_CONFIRM_TEXT}
            autoComplete="off"
          />
          {confirmText && confirmText !== REQUIRED_CONFIRM_TEXT && (
            <p className="text-sm text-red-600 mt-1">
              Text must match exactly: &quot;{REQUIRED_CONFIRM_TEXT}&quot;
            </p>
          )}
        </div>

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Final Warning:</strong> This action cannot be undone after the grace period. 
            All your data will be permanently deleted.
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('warning')}>
          Back
        </Button>
        <Button 
          variant="destructive"
          onClick={handleDeleteAccount}
          disabled={confirmText !== REQUIRED_CONFIRM_TEXT}
          className="bg-red-600 hover:bg-red-700"
        >
          Delete My Account Forever
        </Button>
      </DialogFooter>
    </>
  );

  const renderProcessingStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600 mr-2"></div>
          Deleting Account...
        </DialogTitle>
        <DialogDescription>
          Please wait while we process your account deletion request.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            This may take a few moments. Please do not close this window.
          </p>
        </div>
      </div>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center text-green-600">
          <CheckCircle className="h-5 w-5 mr-2" />
          Account Deletion Initiated
        </DialogTitle>
        <DialogDescription>
          Your account deletion has been successfully processed.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-800 mb-2">What happened:</h4>
          <div className="space-y-1 text-sm text-green-700">
            {deletionResult?.auditTrail?.map((item: string, index: number) => (
              <div key={index}>{item}</div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-gray-600">Account Status:</span>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              Soft Deleted
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-gray-600">Grace Period Ends:</span>
            <span className="font-medium">
              {deletionResult?.scheduledHardDeleteAt 
                ? new Date(deletionResult.scheduledHardDeleteAt).toLocaleDateString()
                : 'Unknown'
              }
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Deletion ID:</span>
            <span className="font-mono text-sm">{deletionResult?.accountDeletionId}</span>
          </div>
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <AlertTriangle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Important:</strong> You will be signed out shortly. If you change your mind, 
            you can contact support within the grace period to restore your account.
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button 
          onClick={() => {
            handleClose();
            // Sign out and redirect
            window.location.href = '/sign-in?message=account-deleted';
          }}
          className="w-full"
        >
          I Understand - Sign Me Out
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {step === 'warning' && renderWarningStep()}
        {step === 'confirmation' && renderConfirmationStep()}
        {step === 'processing' && renderProcessingStep()}
        {step === 'success' && renderSuccessStep()}
      </DialogContent>
    </Dialog>
  );
}