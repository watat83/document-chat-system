"use client"

import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle, Clock, AlertCircle, Loader2, FileText, Shield, Eye, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProcessingStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  icon?: React.ComponentType<{ className?: string }>
  estimatedDuration?: number // in seconds
  completedAt?: string
}

export interface ProcessingProgressProps {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'QUEUED' | 'PARTIAL' | 'CANCELLED'
  progress?: number // 0-100
  currentStep?: string
  steps?: ProcessingStep[]
  estimatedCompletion?: string
  processingType?: 'basic' | 'full' | 'vectorize'
  className?: string
  showDetails?: boolean
}

const defaultSteps: Record<'basic' | 'vectorize' | 'full', ProcessingStep[]> = {
  basic: [
    {
      id: 'extract',
      name: 'Text Extraction',
      description: 'Extracting text content from document',
      status: 'pending' as const,
      icon: FileText,
      estimatedDuration: 30
    },
    {
      id: 'sections',
      name: 'Section Analysis',
      description: 'Identifying document structure and sections',
      status: 'pending' as const,
      icon: Eye,
      estimatedDuration: 60
    }
  ],
  full: [
    {
      id: 'extract',
      name: 'Text Extraction',
      description: 'Extracting text content from document',
      status: 'pending' as const,
      icon: FileText,
      estimatedDuration: 30
    },
    {
      id: 'metadata',
      name: 'Metadata Analysis',
      description: 'Analyzing document metadata and classification',
      status: 'pending' as const,
      icon: Brain,
      estimatedDuration: 45
    },
    {
      id: 'sections',
      name: 'Section Analysis',
      description: 'Identifying document structure and sections',
      status: 'pending' as const,
      icon: Eye,
      estimatedDuration: 60
    },
    {
      id: 'entities',
      name: 'Entity Extraction',
      description: 'Finding people, organizations, dates, and key information',
      status: 'pending' as const,
      icon: Brain,
      estimatedDuration: 90
    },
    {
      id: 'content',
      name: 'Content Analysis',
      description: 'Analyzing quality, readability, and generating insights',
      status: 'pending' as const,
      icon: Brain,
      estimatedDuration: 120
    },
    {
      id: 'security',
      name: 'Security Analysis',
      description: 'Detecting sensitive information and security risks',
      status: 'pending' as const,
      icon: Shield,
      estimatedDuration: 90
    },
    {
      id: 'contract',
      name: 'Contract Analysis',
      description: 'Performing contract analysis and risk assessment',
      status: 'pending' as const,
      icon: Brain,
      estimatedDuration: 60
    },
    {
      id: 'compile',
      name: 'Compile Analysis',
      description: 'Compiling comprehensive AI analysis results',
      status: 'pending' as const,
      icon: CheckCircle,
      estimatedDuration: 30
    },
    {
      id: 'finalize',
      name: 'Finalize Processing',
      description: 'Saving results and completing analysis',
      status: 'pending' as const,
      icon: CheckCircle,
      estimatedDuration: 15
    }
  ],
  vectorize: [
    {
      id: 'prepare',
      name: 'Preparing Document',
      description: 'Validating document and preparing for vectorization',
      status: 'pending' as const,
      icon: FileText,
      estimatedDuration: 10
    },
    {
      id: 'chunk',
      name: 'Document Chunking',
      description: 'Breaking document into semantic chunks',
      status: 'pending' as const,
      icon: Brain,
      estimatedDuration: 30
    },
    {
      id: 'embed',
      name: 'Generate Embeddings',
      description: 'Creating vector embeddings for semantic search',
      status: 'pending' as const,
      icon: Brain,
      estimatedDuration: 90
    },
    {
      id: 'store',
      name: 'Store Vectors',
      description: 'Saving embeddings to vector database',
      status: 'pending' as const,
      icon: CheckCircle,
      estimatedDuration: 20
    }
  ]
}

export function ProcessingProgress({
  status,
  progress = 0,
  currentStep,
  steps,
  estimatedCompletion,
  processingType = 'basic',
  className,
  showDetails = true
}: ProcessingProgressProps) {
  const actualSteps = steps || defaultSteps[processingType]

  // Update step statuses based on current progress
  const updatedSteps = actualSteps.map((step, index) => {
    const stepProgress = ((index + 1) / actualSteps.length) * 100

    if (progress >= stepProgress) {
      return { ...step, status: 'completed' as const }
    } else if (progress > (index / actualSteps.length) * 100) {
      return { ...step, status: 'in-progress' as const }
    } else if (status === 'FAILED') {
      return { ...step, status: 'failed' as const }
    }

    return step
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-500'
      case 'PROCESSING': return 'bg-blue-500'
      case 'PARTIAL':
      case 'CANCELLED':
      case 'FAILED': return 'bg-red-500'
      case 'QUEUED': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return CheckCircle
      case 'PROCESSING': return Loader2
      case 'PARTIAL':
      case 'CANCELLED':
      case 'FAILED': return AlertCircle
      case 'QUEUED': return Clock
      default: return Clock
    }
  }

  const StatusIcon = getStatusIcon(status)
  const isAnimated = status === 'PROCESSING'

  return (
    <Card className={cn("w-full", className)}>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header with status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon
                className={cn(
                  "h-5 w-5",
                  isAnimated && "animate-spin",
                  status === 'COMPLETED' && "text-green-600",
                  status === 'PROCESSING' && "text-blue-600",
                  status === 'FAILED' && "text-red-600",
                  status === 'QUEUED' && "text-yellow-600"
                )}
              />
              <span className="font-medium">
                {status === 'QUEUED' && 'Processing Queued'}
                {status === 'PROCESSING' && `Processing (${progress}%)`}
                {status === 'COMPLETED' && 'Processing Complete'}
                {status === 'FAILED' && 'Processing Failed'}
                {status === 'PARTIAL' && 'Processing Partially Complete'}
                {status === 'CANCELLED' && 'Processing Cancelled'}
                {status === 'PENDING' && 'Awaiting Processing'}
              </span>
            </div>

            <Badge
              variant="secondary"
              className={cn("capitalize", getStatusColor(status), "text-white")}
            >
              {processingType} Analysis
            </Badge>
          </div>

          {/* Progress bar */}
          {status !== 'PENDING' && (
            <div className="space-y-2">
              <Progress
                value={status === 'COMPLETED' ? 100 : progress}
                className="h-3"
              />

              {estimatedCompletion && status === 'PROCESSING' && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    Estimated completion: {new Date(estimatedCompletion).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Detailed steps */}
          {showDetails && status !== 'PENDING' && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Processing Steps</h4>
              <div className="space-y-2">
                {updatedSteps.map((step) => {
                  const StepIcon = step.icon || FileText
                  const isCurrentStep = currentStep === step.id ||
                    (status === 'PROCESSING' && step.status === 'in-progress')

                  return (
                    <div
                      key={step.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md transition-colors",
                        isCurrentStep && "bg-blue-50 border border-blue-200",
                        step.status === 'completed' && "bg-green-50",
                        step.status === 'failed' && "bg-red-50"
                      )}
                    >
                      <div className={cn(
                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                        step.status === 'completed' && "bg-green-500 text-white",
                        step.status === 'in-progress' && "bg-blue-500 text-white",
                        step.status === 'failed' && "bg-red-500 text-white",
                        step.status === 'pending' && "bg-gray-200 text-gray-500"
                      )}>
                        {step.status === 'completed' ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : step.status === 'in-progress' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : step.status === 'failed' ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : (
                          <StepIcon className="h-3 w-3" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-medium",
                            step.status === 'completed' && "text-green-700",
                            step.status === 'in-progress' && "text-blue-700",
                            step.status === 'failed' && "text-red-700",
                            step.status === 'pending' && "text-gray-500"
                          )}>
                            {step.name}
                          </span>

                          {step.status === 'in-progress' && (
                            <Badge variant="outline" className="text-xs">
                              In Progress
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {step.description}
                        </p>

                        {step.completedAt && (
                          <p className="text-xs text-green-600">
                            Completed at {new Date(step.completedAt).toLocaleTimeString()}
                          </p>
                        )}
                      </div>

                      {step.estimatedDuration && step.status === 'pending' && (
                        <div className="text-xs text-muted-foreground">
                          ~{step.estimatedDuration}s
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
