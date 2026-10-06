/**
 * Real-time Validation Hook
 *
 * Provides real-time validation capabilities for forms with:
 * - Debounced field validation
 * - Form-level validation
 * - Validation state management
 * - Error message formatting
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FieldValidator,
  FormValidator,
  type ValidationConfig,
  type ValidationContext,
  type FieldValidationResult,
  type FormValidationResult,
  type ValidationError,
  debounceValidation,
} from '@/lib/validation-utils'
import { useProfileStore } from '@/stores/profile-store'

// =============================================
// TYPES
// =============================================

interface ValidationState {
  isValidating: boolean
  hasValidated: boolean
  isDirty: boolean
  touchedFields: Set<string>
  fieldResults: Record<string, FieldValidationResult>
  formResult: FormValidationResult | null
  errors: Record<string, ValidationError[]>
  warnings: Record<string, ValidationError[]>
  suggestions: Record<string, ValidationError[]>
}

interface UseRealtimeValidationOptions {
  config?: Partial<ValidationConfig>
  context?: ValidationContext
  validateOnMount?: boolean
  validateOnChange?: boolean
  validateOnBlur?: boolean
  debounceMs?: number
  enableOptimisticUpdates?: boolean
}

interface UseRealtimeValidationReturn {
  // Validation state
  validationState: ValidationState
  isValid: boolean
  score: number

  // Field validation
  validateField: (field: string, value: any) => Promise<FieldValidationResult>
  getFieldError: (field: string) => string | null
  getFieldWarning: (field: string) => string | null
  getFieldSuggestion: (field: string) => string | null
  isFieldValid: (field: string) => boolean
  isFieldTouched: (field: string) => boolean

  // Form validation
  validateForm: (data: any) => Promise<FormValidationResult>
  validateAllFields: (data: any) => Promise<void>
  clearValidation: () => void
  clearFieldValidation: (field: string) => void

  // Field interaction tracking
  markFieldTouched: (field: string) => void
  markFormDirty: () => void

  // Validation helpers
  getValidationSummary: () => {
    totalIssues: number
    errorCount: number
    warningCount: number
    suggestionCount: number
    completionScore: number
  }

  // Error message formatting
  formatFieldMessages: (field: string) => {
    errors: string[]
    warnings: string[]
    suggestions: string[]
  }
}

// =============================================
// MAIN HOOK
// =============================================

export function useRealtimeValidation(
  formType: 'profile' | 'organization' | 'user' = 'profile',
  options: UseRealtimeValidationOptions = {}
): UseRealtimeValidationReturn {
  const {
    config = {},
    context = {},
    validateOnMount = false,
    validateOnChange = true,
    // validateOnBlur = true,
    debounceMs = 300,
    enableOptimisticUpdates = true,
  } = options

  // ==========================================
  // STATE
  // ==========================================

  const [validationState, setValidationState] = useState<ValidationState>({
    isValidating: false,
    hasValidated: false,
    isDirty: false,
    touchedFields: new Set(),
    fieldResults: {},
    formResult: null,
    errors: {},
    warnings: {},
    suggestions: {},
  })

  // Refs for validators
  const fieldValidatorRef = useRef<FieldValidator>()
  const formValidatorRef = useRef<FormValidator>()
  const debouncedValidateFieldRef = useRef<any>()

  // Store integration
  const profileStore = useProfileStore()

  // ==========================================
  // INTERNAL VALIDATION FUNCTIONS
  // ==========================================

  const validateFieldInternal = useCallback(
    async (field: string, value: any): Promise<FieldValidationResult> => {
      if (!fieldValidatorRef.current) {
        throw new Error('Field validator not initialized')
      }

      setValidationState((prev) => ({
        ...prev,
        isValidating: true,
      }))

      try {
        let result: FieldValidationResult

        // Use appropriate field validator based on field type
        switch (field) {
          case 'companyName':
            result = fieldValidatorRef.current.validateCompanyName(value)
            break
          case 'primaryContactEmail':
            result = fieldValidatorRef.current.validateEmail(value)
            break
          case 'primaryNaics':
            result = fieldValidatorRef.current.validateNaicsCode(value)
            break
          case 'uei':
            result = fieldValidatorRef.current.validateUEI(value)
            break
          case 'primaryContactPhone':
            result = fieldValidatorRef.current.validatePhoneNumber(value)
            break
          case 'state':
            result = fieldValidatorRef.current.validateStateCode(value)
            break
          case 'zipCode':
            result = fieldValidatorRef.current.validateZipCode(value)
            break
          default:
            // Generic validation for other fields
            result = {
              isValid: true,
              errors: [],
              warnings: [],
              suggestions: [],
              score: value ? 100 : 0,
            }
        }

        // Update validation state
        setValidationState((prev) => ({
          ...prev,
          isValidating: false,
          hasValidated: true,
          fieldResults: {
            ...prev.fieldResults,
            [field]: result,
          },
          errors: {
            ...prev.errors,
            [field]: result.errors,
          },
          warnings: {
            ...prev.warnings,
            [field]: result.warnings,
          },
          suggestions: {
            ...prev.suggestions,
            [field]: result.suggestions,
          },
        }))

        // Update store validation state if profile field
        if (formType === 'profile' && enableOptimisticUpdates) {
          profileStore.setOptimistic({ [field]: value })
        }

        return result
      } catch (error) {
        console.error('Field validation error:', error)

        const errorResult: FieldValidationResult = {
          isValid: false,
          errors: [
            {
              field,
              message: 'Validation failed',
              severity: 'error',
              code: 'VALIDATION_ERROR',
            },
          ],
          warnings: [],
          suggestions: [],
          score: 0,
        }

        setValidationState((prev) => ({
          ...prev,
          isValidating: false,
          fieldResults: {
            ...prev.fieldResults,
            [field]: errorResult,
          },
          errors: {
            ...prev.errors,
            [field]: errorResult.errors,
          },
        }))

        return errorResult
      }
    },
    [formType, enableOptimisticUpdates]
  )

  const getCurrentFormData = useCallback(() => {
    switch (formType) {
      case 'profile':
        return profileStore.current
      case 'organization':
        return profileStore.current
      default:
        return null
    }
  }, [formType, profileStore.current])

  const markFormDirty = useCallback(() => {
    setValidationState((prev) => ({
      ...prev,
      isDirty: true,
    }))
  }, [])

  const validateFormInternal = useCallback(
    async (data: any): Promise<FormValidationResult> => {
      if (!formValidatorRef.current) {
        throw new Error('Form validator not initialized')
      }

      setValidationState((prev) => ({
        ...prev,
        isValidating: true,
      }))

      try {
        let result: FormValidationResult

        // Use appropriate form validator based on form type
        switch (formType) {
          case 'profile':
            result = await formValidatorRef.current.validateProfileForm(data)
            break
          case 'organization':
            result =
              await formValidatorRef.current.validateOrganizationForm(data)
            break
          default:
            throw new Error(`Unsupported form type: ${formType}`)
        }

        // Update validation state
        setValidationState((prev) => ({
          ...prev,
          isValidating: false,
          hasValidated: true,
          formResult: result,
          fieldResults: result.fieldResults,
          errors: Object.fromEntries(
            Object.entries(result.fieldResults).map(([field, res]) => [
              field,
              res.errors,
            ])
          ),
          warnings: Object.fromEntries(
            Object.entries(result.fieldResults).map(([field, res]) => [
              field,
              res.warnings,
            ])
          ),
          suggestions: Object.fromEntries(
            Object.entries(result.fieldResults).map(([field, res]) => [
              field,
              res.suggestions,
            ])
          ),
        }))

        return result
      } catch (error) {
        console.error('Form validation error:', error)

        const errorResult: FormValidationResult = {
          isValid: false,
          overallScore: 0,
          fieldResults: {},
          errors: [
            {
              field: 'form',
              message: 'Form validation failed',
              severity: 'error',
              code: 'FORM_VALIDATION_ERROR',
            },
          ],
          warnings: [],
          suggestions: [],
          nextSteps: [],
        }

        setValidationState((prev) => ({
          ...prev,
          isValidating: false,
          formResult: errorResult,
        }))

        return errorResult
      }
    },
    [formType]
  )



  const validateForm = useCallback(
    async (data: any): Promise<FormValidationResult> => {
      markFormDirty()
      return await validateFormInternal(data)
    },
    [validateFormInternal]
  )




  // ==========================================
  // INITIALIZATION
  // ==========================================

  useEffect(() => {
    // Create validation configuration
    const validationConfig = {
      realTimeValidation: validateOnChange,
      debounceMs,
      ...config,
    }

    // Initialize validators
    fieldValidatorRef.current = new FieldValidator(validationConfig, context)
    formValidatorRef.current = new FormValidator(validationConfig, context)

    // Create debounced field validator
    debouncedValidateFieldRef.current = debounceValidation(
      async (field: string, value: any) => {
        return await validateFieldInternal(field, value)
      },
      debounceMs
    )

    // Validate on mount if requested
    if (validateOnMount) {
      const currentData = getCurrentFormData()
      if (currentData) {
        const timeout = window.setTimeout(() => {
          void validateForm(currentData)
        }, 0)

        return () => window.clearTimeout(timeout)
      }
    }
  }, [])

  const markFieldTouched = useCallback((field: string) => {
    setValidationState((prev) => ({
      ...prev,
      touchedFields: new Set([...prev.touchedFields, field]),
    }))
  }, [])


  // ==========================================
  // PUBLIC API FUNCTIONS
  // ==========================================

  const validateField = useCallback(
    async (field: string, value: any): Promise<FieldValidationResult> => {
      // Mark field as touched
      markFieldTouched(field)

      // Use debounced validation for real-time
      if (validateOnChange && debouncedValidateFieldRef.current) {
        return await debouncedValidateFieldRef.current(field, value)
      } else {
        return await validateFieldInternal(field, value)
      }
    },
    [validateOnChange, validateFieldInternal]
  )

  const validateAllFields = useCallback(
    async (data: any): Promise<void> => {
      // Validate all fields individually for granular feedback
      const fieldPromises = Object.entries(data).map(([field, value]) =>
        validateFieldInternal(field, value)
      )

      await Promise.all(fieldPromises)

      // Then validate the entire form
      await validateFormInternal(data)
    },
    [validateFieldInternal, validateFormInternal]
  )

  const clearValidation = useCallback(() => {
    setValidationState({
      isValidating: false,
      hasValidated: false,
      isDirty: false,
      touchedFields: new Set(),
      fieldResults: {},
      formResult: null,
      errors: {},
      warnings: {},
      suggestions: {},
    })
  }, [])

  const clearFieldValidation = useCallback((field: string) => {
    setValidationState((prev) => {
      const newState = { ...prev }
      delete newState.fieldResults[field]
      delete newState.errors[field]
      delete newState.warnings[field]
      delete newState.suggestions[field]
      newState.touchedFields.delete(field)
      return newState
    })
  }, [])

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  const getFieldError = useCallback(
    (field: string): string | null => {
      const errors = validationState.errors[field]
      return errors && errors.length > 0 ? errors[0].message : null
    },
    [validationState.errors]
  )

  const getFieldWarning = useCallback(
    (field: string): string | null => {
      const warnings = validationState.warnings[field]
      return warnings && warnings.length > 0 ? warnings[0].message : null
    },
    [validationState.warnings]
  )

  const getFieldSuggestion = useCallback(
    (field: string): string | null => {
      const suggestions = validationState.suggestions[field]
      return suggestions && suggestions.length > 0
        ? suggestions[0].message
        : null
    },
    [validationState.suggestions]
  )

  const isFieldValid = useCallback(
    (field: string): boolean => {
      const result = validationState.fieldResults[field]
      return result ? result.isValid : true
    },
    [validationState.fieldResults]
  )

  const isFieldTouched = useCallback(
    (field: string): boolean => {
      return validationState.touchedFields.has(field)
    },
    [validationState.touchedFields]
  )

  const getValidationSummary = useCallback(() => {
    const allErrors = Object.values(validationState.errors).flat()
    const allWarnings = Object.values(validationState.warnings).flat()
    const allSuggestions = Object.values(validationState.suggestions).flat()

    return {
      totalIssues:
        allErrors.length + allWarnings.length + allSuggestions.length,
      errorCount: allErrors.length,
      warningCount: allWarnings.length,
      suggestionCount: allSuggestions.length,
      completionScore: validationState.formResult?.overallScore || 0,
    }
  }, [validationState])

  const formatFieldMessages = useCallback(
    (field: string) => {
      return {
        errors: (validationState.errors[field] || []).map((e) => e.message),
        warnings: (validationState.warnings[field] || []).map((w) => w.message),
        suggestions: (validationState.suggestions[field] || []).map(
          (s) => s.message
        ),
      }
    },
    [validationState]
  )

  // ==========================================
  // COMPUTED VALUES
  // ==========================================

  const isValid = validationState.formResult?.isValid ?? true
  const score = validationState.formResult?.overallScore ?? 0

  // ==========================================
  // RETURN API
  // ==========================================

  return {
    // Validation state
    validationState,
    isValid,
    score,

    // Field validation
    validateField,
    getFieldError,
    getFieldWarning,
    getFieldSuggestion,
    isFieldValid,
    isFieldTouched,

    // Form validation
    validateForm,
    validateAllFields,
    clearValidation,
    clearFieldValidation,

    // Field interaction tracking
    markFieldTouched,
    markFormDirty,

    // Validation helpers
    getValidationSummary,
    formatFieldMessages,
  }
}

// =============================================
// FIELD-SPECIFIC HOOKS
// =============================================

export function useFieldValidation(
  fieldName: string,
  formType: 'profile' | 'organization' | 'user' = 'profile',
  options: UseRealtimeValidationOptions = {}
) {
  const validation = useRealtimeValidation(formType, options)

  return {
    validate: (value: any) => validation.validateField(fieldName, value),
    isValid: validation.isFieldValid(fieldName),
    isTouched: validation.isFieldTouched(fieldName),
    error: validation.getFieldError(fieldName),
    warning: validation.getFieldWarning(fieldName),
    suggestion: validation.getFieldSuggestion(fieldName),
    messages: validation.formatFieldMessages(fieldName),
    markTouched: () => validation.markFieldTouched(fieldName),
    clear: () => validation.clearFieldValidation(fieldName),
  }
}

// =============================================
// VALIDATION EVENT HANDLERS
// =============================================

export function createValidationHandlers(
  validation: UseRealtimeValidationReturn
) {
  return {
    // onChange handler with validation
    createOnChangeHandler: (field: string) => (value: any) => {
      validation.markFieldTouched(field)
      validation.markFormDirty()

      if (validation.validationState.touchedFields.has(field)) {
        validation.validateField(field, value)
      }
    },

    // onBlur handler with validation
    createOnBlurHandler: (field: string) => (value: any) => {
      validation.markFieldTouched(field)
      validation.validateField(field, value)
    },

    // onSubmit handler with full form validation
    createOnSubmitHandler:
      (onSubmit: (data: any, isValid: boolean) => void) =>
      async (data: any) => {
        const result = await validation.validateForm(data)
        onSubmit(data, result.isValid)
      },

    // Focus handler to track field interaction
    createOnFocusHandler: (field: string) => () => {
      validation.markFieldTouched(field)
    },
  }
}

export default useRealtimeValidation
