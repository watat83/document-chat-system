"use client"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProcessingStatusProps {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'QUEUED' | 'PARTIAL' | 'CANCELLED'
  progress?: number // 0-100
  processingType?: 'basic' | 'full'
  variant?: 'compact' | 'detailed' | 'badge-only'
  className?: string
  showProgress?: boolean
}

export function ProcessingStatus({
  status,
  progress = 0,
  processingType = 'basic',
  variant = 'compact',
  className,
  showProgress = true
}: ProcessingStatusProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return {
          icon: CheckCircle,
          label: 'Complete',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          badgeVariant: 'default' as const,
          badgeColor: 'bg-green-500 text-white'
        }
      case 'PROCESSING':
        return {
          icon: Loader2,
          label: `Processing (${progress}%)`,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          badgeVariant: 'default' as const,
          badgeColor: 'bg-blue-500 text-white',
          animate: true
        }
      case 'CANCELLED':
      case 'PARTIAL':
      case 'FAILED':
        return {
          icon: AlertCircle,
          label: status === 'PARTIAL' ? 'Partially complete' : status === 'CANCELLED' ? 'Cancelled' : 'Failed',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          badgeVariant: 'destructive' as const,
          badgeColor: 'bg-red-500 text-white'
        }
      case 'QUEUED':
        return {
          icon: Clock,
          label: 'Queued',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          badgeVariant: 'secondary' as const,
          badgeColor: 'bg-yellow-500 text-white'
        }
      case 'PENDING':
      default:
        return {
          icon: Clock,
          label: 'Pending',
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          badgeVariant: 'outline' as const,
          badgeColor: 'bg-gray-500 text-white'
        }
    }
  }

  const config = getStatusConfig(status)
  const StatusIcon = config.icon

  // Badge-only variant for minimal space
  if (variant === 'badge-only') {
    return (
      <Badge
        variant={config.badgeVariant}
        className={cn("text-xs", config.badgeColor, className)}
      >
        <StatusIcon className={cn("h-3 w-3 mr-1", config.animate && "animate-spin")} />
        {processingType === 'full' ? 'Full' : 'Basic'}
      </Badge>
    )
  }

  // Compact variant for document cards
  if (variant === 'compact') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
          config.bgColor,
          config.borderColor,
          "border"
        )}>
          <StatusIcon className={cn(
            "h-3 w-3",
            config.color,
            config.animate && "animate-spin"
          )} />
          <span className={config.color}>
            {status === 'PROCESSING' ? `${progress}%` : config.label}
          </span>
        </div>

        {showProgress && status === 'PROCESSING' && (
          <div className="flex-1 min-w-0">
            <Progress value={progress} className="h-1" />
          </div>
        )}
      </div>
    )
  }

  // Detailed variant for document details page
  return (
    <div className={cn(
      "p-3 rounded-md border",
      config.bgColor,
      config.borderColor,
      className
    )}>
      <div className="flex items-center gap-3">
        <StatusIcon className={cn(
          "h-5 w-5",
          config.color,
          config.animate && "animate-spin"
        )} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("font-medium text-sm", config.color)}>
              {config.label}
            </span>

            <Badge variant="outline" className="text-xs">
              {processingType === 'full' ? 'Full Analysis' : 'Basic Processing'}
            </Badge>
          </div>

          {showProgress && status === 'PROCESSING' && (
            <div className="mt-2">
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {status === 'PROCESSING' && (
            <p className="text-xs text-muted-foreground mt-1">
              {processingType === 'full'
                ? 'Performing comprehensive analysis including security, quality, and entity extraction'
                : 'Extracting text content and identifying document structure'
              }
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// Hook for document status polling
export function useDocumentStatus(documentId: string, pollingInterval = 5000) {
  const [status, setStatus] = React.useState<ProcessingStatusProps | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let intervalId: NodeJS.Timeout

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/v1/documents/${documentId}/status`)
        if (!response.ok) {
          throw new Error('Failed to fetch status')
        }

        const data = await response.json()
        setStatus({
          status: data.status,
          progress: data.processingProgress,
          processingType: data.analysis ? 'full' : 'basic'
        })

        // Stop polling if processing is complete or failed
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          clearInterval(intervalId)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    // Initial fetch
    fetchStatus()

    // Start polling if document is processing
    if (status?.status === 'PROCESSING' || status?.status === 'QUEUED') {
      intervalId = setInterval(fetchStatus, pollingInterval)
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [documentId, pollingInterval, status?.status])

  return { status, isLoading, error }
}

// Import React for the hook
import React from "react"
