'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  Zap, 
  Crown, 
  Info,
  ExternalLink 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsageWarningProps {
  warning?: string;
  upgradeMessage?: string;
  isDeveloperOverride?: boolean;
  onUpgrade?: () => void;
  className?: string;
  variant?: 'warning' | 'error' | 'info';
}

export function UsageWarning({ 
  warning, 
  upgradeMessage, 
  isDeveloperOverride, 
  onUpgrade,
  className,
  variant = 'warning'
}: UsageWarningProps) {
  if (!warning) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'error':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'info':
        return 'border-blue-200 bg-blue-50 text-blue-800';
      default:
        return isDeveloperOverride 
          ? 'border-orange-200 bg-orange-50 text-orange-800'
          : 'border-yellow-200 bg-yellow-50 text-yellow-800';
    }
  };

  const getIcon = () => {
    if (isDeveloperOverride) {
      return <Info className="h-4 w-4 text-orange-600" />;
    }
    switch (variant) {
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    }
  };

  return (
    <Alert className={cn(getVariantStyles(), className)}>
      {getIcon()}
      <AlertDescription className="flex-1">
        <div className="space-y-2">
          <p>{warning}</p>
          {upgradeMessage && (
            <p className="text-sm">{upgradeMessage}</p>
          )}
          {isDeveloperOverride && (
            <p className="text-xs font-medium">
              👨‍💻 Developer Mode: This action is allowed for testing
            </p>
          )}
          {onUpgrade && upgradeMessage && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={onUpgrade}
              className="mt-2"
            >
              <Crown className="h-3 w-3 mr-1" />
              Upgrade Plan
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

interface UsageLimitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  usageType: string;
  currentUsage: number;
  limit: number;
  onUpgrade?: () => void;
  isDeveloperMode?: boolean;
}

export function UsageLimitDialog({
  isOpen,
  onClose,
  usageType,
  currentUsage,
  limit,
  onUpgrade,
  isDeveloperMode = false
}: UsageLimitDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-card rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className={cn(
            "p-2 rounded-full",
            isDeveloperMode ? "bg-orange-100" : "bg-yellow-100"
          )}>
            {isDeveloperMode ? (
              <Info className="h-5 w-5 text-orange-600" />
            ) : (
              <Zap className="h-5 w-5 text-yellow-600" />
            )}
          </div>
          <h3 className="text-lg font-semibold">
            {isDeveloperMode ? 'Developer Mode Warning' : 'Usage Limit Reached'}
          </h3>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-gray-600">
            {isDeveloperMode ? (
              <>
                For regular users, this action would exceed your <strong>{usageType}</strong> limit.
                <br />
                Current usage: <strong>{currentUsage}/{limit}</strong>
              </>
            ) : (
              <>
                You&apos;ve reached your monthly limit for <strong>{usageType}</strong>.
                <br />
                Current usage: <strong>{currentUsage}/{limit}</strong>
              </>
            )}
          </p>

          {!isDeveloperMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Upgrade to continue</h4>
              <p className="text-sm text-blue-700">
                Get more capacity and unlock advanced features with a higher plan.
              </p>
            </div>
          )}

          {isDeveloperMode && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h4 className="font-medium text-orange-900 mb-2">👨‍💻 Developer Mode</h4>
              <p className="text-sm text-orange-700">
                This action is allowed for developer testing, but would be blocked for regular users.
              </p>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            {isDeveloperMode ? 'Continue Anyway' : 'Close'}
          </Button>
          
          {onUpgrade && !isDeveloperMode && (
            <Button
              onClick={() => {
                onUpgrade();
                onClose();
              }}
              className="flex-1"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade Plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface UsageProgressProps {
  current: number;
  limit: number;
  label: string;
  showWarning?: boolean;
  className?: string;
}

export function UsageProgress({ 
  current, 
  limit, 
  label, 
  showWarning = true,
  className 
}: UsageProgressProps) {
  const percentage = limit === -1 ? 0 : Math.min((current / limit) * 100, 100);
  const isUnlimited = limit === -1;
  const isNearLimit = percentage >= 80;
  const isOverLimit = percentage >= 100;

  const getProgressColor = () => {
    if (isOverLimit) return 'bg-red-500';
    if (isNearLimit) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getTextColor = () => {
    if (isOverLimit) return 'text-red-600';
    if (isNearLimit) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={cn('text-sm font-medium', getTextColor())}>
          {isUnlimited ? (
            `${current} (Unlimited)`
          ) : (
            `${current}/${limit}`
          )}
        </span>
      </div>
      
      {!isUnlimited && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={cn('h-2 rounded-full transition-all duration-300', getProgressColor())}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}

      {showWarning && isNearLimit && !isUnlimited && (
        <p className="text-xs text-yellow-600 flex items-center">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {isOverLimit ? 'Limit exceeded' : `${Math.round(percentage)}% of limit used`}
        </p>
      )}
    </div>
  );
}