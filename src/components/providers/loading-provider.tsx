'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { PageSkeleton } from '@/components/ui/page-skeleton'

interface LoadingContextType {
  isPageLoading: boolean
  setPageLoading: (loading: boolean) => void
  pageLoadingVariant: 'dashboard' | 'profile' | 'opportunities' | 'settings' | 'default'
  setPageLoadingVariant: (variant: 'dashboard' | 'profile' | 'opportunities' | 'settings' | 'default') => void
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined)

export function useLoading() {
  const context = useContext(LoadingContext)
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return context
}

interface LoadingProviderProps {
  children: React.ReactNode
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [manualVariant, setPageLoadingVariant] = useState<'dashboard' | 'profile' | 'opportunities' | 'settings' | 'default'>('default')
  const pathname = usePathname()

  const pageLoadingVariant = pathname.includes('/dashboard') ? 'dashboard' : pathname.includes('/profile') ? 'profile' : pathname.includes('/opportunities') ? 'opportunities' : pathname.includes('/settings') ? 'settings' : manualVariant

  const setPageLoading = (loading: boolean) => {
    setIsPageLoading(loading)
  }

  const value = {
    isPageLoading,
    setPageLoading,
    pageLoadingVariant,
    setPageLoadingVariant
  }

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  )
}

// Hook for manual page loading control
export function usePageLoading() {
  const { isPageLoading, setPageLoading, pageLoadingVariant, setPageLoadingVariant } = useLoading()
  
  return {
    isLoading: isPageLoading,
    startLoading: () => setPageLoading(true),
    stopLoading: () => setPageLoading(false),
    variant: pageLoadingVariant,
    setVariant: setPageLoadingVariant
  }
}

// Hook for component-level loading
export function useComponentLoading(initialState = false) {
  const [isLoading, setIsLoading] = useState(initialState)
  const [error, setError] = useState<string | null>(null)

  const startLoading = () => {
    setIsLoading(true)
    setError(null)
  }

  const stopLoading = () => {
    setIsLoading(false)
  }

  const setLoadingError = (errorMessage: string) => {
    setIsLoading(false)
    setError(errorMessage)
  }

  return {
    isLoading,
    error,
    startLoading,
    stopLoading,
    setError: setLoadingError
  }
}