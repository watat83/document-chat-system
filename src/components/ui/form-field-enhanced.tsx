'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export interface FormFieldEnhancedProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'password' | 'number'
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  success?: string
  isValidating?: boolean
  showFloatingLabel?: boolean
  className?: string
}

export function FormFieldEnhanced({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  disabled = false,
  error,
  success,
  isValidating = false,
  showFloatingLabel = false,
  className
}: FormFieldEnhancedProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [hasBeenFocused, setHasBeenFocused] = useState(false)
  const [validatedValue, setValidatedValue] = useState<string | null>(null)
  const showValidation = hasBeenFocused && value.length > 0 && validatedValue === value

  const hasValue = value.length > 0
  const hasError = error && hasBeenFocused
  const hasSuccess = success && hasBeenFocused && !error
  const shouldFloat = showFloatingLabel && (hasValue || isFocused)

  useEffect(() => {
    if (hasBeenFocused && value) {
      const timer = setTimeout(() => setValidatedValue(value), 300)
      return () => clearTimeout(timer)
    }
  }, [value, hasBeenFocused])

  const handleFocus = () => {
    setIsFocused(true)
    setHasBeenFocused(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
  }

  return (
    <div className={cn("relative space-y-2", className)}>
      {/* Label */}
      {showFloatingLabel ? (
        <Label
          htmlFor={id}
          className={cn(
            "absolute left-3 transition-all duration-200 pointer-events-none",
            "text-muted-foreground",
            shouldFloat
              ? "-top-2 text-xs bg-background px-1 z-10"
              : "top-3 text-sm",
            hasError && "text-destructive",
            hasSuccess && "text-match-good",
            isFocused && !hasError && "text-primary"
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      ) : (
        <Label
          htmlFor={id}
          className={cn(
            "text-sm font-medium",
            hasError && "text-destructive",
            hasSuccess && "text-match-good"
          )}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}

      {/* Input Container */}
      <div className="relative">
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={showFloatingLabel ? undefined : placeholder}
          disabled={disabled}
          className={cn(
            "transition-all duration-200",
            showFloatingLabel && "pt-6 pb-2",
            hasError && [
              "border-destructive focus-visible:ring-destructive",
              "animate-shake"
            ],
            hasSuccess && [
              "border-match-good focus-visible:ring-match-good",
              showValidation && "animate-pulse-success"
            ],
            isFocused && !hasError && "ring-2 ring-primary/20 border-primary",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />

        {/* Status Icons */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
          {isValidating && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {!isValidating && hasSuccess && showValidation && (
            <CheckCircle className="h-4 w-4 text-match-good animate-scale-in" />
          )}
          {!isValidating && hasError && (
            <AlertCircle className="h-4 w-4 text-destructive animate-scale-in" />
          )}
        </div>
      </div>

      {/* Validation Messages */}
      <div className="min-h-[1.25rem]">
        {hasError && (
          <p className="text-xs text-destructive animate-slide-down">
            {error}
          </p>
        )}
        {hasSuccess && !error && showValidation && (
          <p className="text-xs text-match-good animate-slide-down">
            {success}
          </p>
        )}
      </div>
    </div>
  )
}

// Multi-step form progress indicator
export interface MultiStepProgressProps {
  steps: string[]
  currentStep: number
  completedSteps: number[]
  errorSteps?: number[]
  className?: string
}

export function MultiStepProgress({
  steps,
  currentStep,
  completedSteps,
  errorSteps = [],
  className
}: MultiStepProgressProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isCompleted = completedSteps.includes(stepNumber)
          const isCurrent = stepNumber === currentStep
          const hasError = errorSteps.includes(stepNumber)
          const isUpcoming = stepNumber > currentStep

          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300",
                    isCompleted && [
                      "bg-match-good text-white",
                      "animate-scale-in"
                    ],
                    isCurrent && !hasError && [
                      "bg-primary text-primary-foreground",
                      "animate-pulse"
                    ],
                    hasError && [
                      "bg-destructive text-destructive-foreground",
                      "animate-shake"
                    ],
                    isUpcoming && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : hasError ? (
                    <AlertCircle className="h-5 w-5" />
                  ) : (
                    stepNumber
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs mt-2 text-center max-w-20 transition-colors duration-300",
                    isCompleted && "text-match-good font-medium",
                    isCurrent && "text-primary font-medium",
                    hasError && "text-destructive font-medium",
                    isUpcoming && "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-4 transition-colors duration-300",
                    stepNumber <= Math.max(...completedSteps) ? "bg-match-good" : "bg-muted"
                  )}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

// Validation summary component
export interface ValidationSummaryProps {
  errors: Record<string, string>
  fieldLabels: Record<string, string>
  className?: string
}

export function ValidationSummary({
  errors,
  fieldLabels,
  className
}: ValidationSummaryProps) {
  const errorCount = Object.keys(errors).length

  if (errorCount === 0) return null

  return (
    <div className={cn(
      "border border-destructive/20 bg-destructive/5 rounded-lg p-4 animate-slide-down",
      className
    )}>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <h4 className="text-sm font-medium text-destructive">
          {errorCount === 1 ? 'There is 1 error' : `There are ${errorCount} errors`} with your submission
        </h4>
      </div>
      <ul className="space-y-1">
        {Object.entries(errors).map(([field, error]) => (
          <li key={field} className="text-xs text-destructive">
            <strong>{fieldLabels[field] || field}:</strong> {error}
          </li>
        ))}
      </ul>
    </div>
  )
}