import { useEffect, useState, useCallback } from 'react'
import { useUser, useAuth } from '@clerk/nextjs'
import { SearchFilters } from '@/types'
import { useOpportunitiesStore } from '@/stores/opportunities-store'
import { useNotify } from '@/contexts/notification-context'

interface SavedSearch {
  id: string
  name: string
  description?: string
  filters: SearchFilters
  isFavorite: boolean
  isDefault: boolean
  isShared: boolean
  lastUsedAt?: string
}

interface PrefetchData {
  savedSearches: SavedSearch[]
  defaultSearch?: SavedSearch
  cachedMatchScores: Record<string, any>
  recentOpportunityIds: string[]
}

export function useSavedSearchesPrefetch() {
  const { user, isLoaded } = useUser()
  const { getToken } = useAuth()
  const notify = useNotify()
  const [prefetchData, setPrefetchData] = useState<PrefetchData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasPrefetched, setHasPrefetched] = useState(false)
  const [hasAppliedDefault, setHasAppliedDefault] = useState(false)
  const [clerkLoadError, setClerkLoadError] = useState(false)

  // Store actions
  const setMatchScores = useOpportunitiesStore(state => state.setMatchScores)
  const setMatchScoreDetails = useOpportunitiesStore(state => state.setMatchScoreDetails)
  const setSearchFilters = useOpportunitiesStore(state => state.setSearchFilters)
  const fetchOpportunities = useOpportunitiesStore(state => state.fetchOpportunities)

  // Apply default search
  const applyDefaultSearch = useCallback(async (search: SavedSearch) => {
    try {
      // Get authentication token from Clerk
      const token = await getToken()

      if (!token) {
        console.log('No auth token available for applying default search')
        return
      }

      // Execute the saved search to get updated filters
      const response = await fetch(`/api/v1/saved-searches/${search.id}/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        // Apply filters and fetch opportunities
        setSearchFilters(result.data.filters)
        await fetchOpportunities(result.data.filters, 1, false)

        // Silent notification - don't interrupt the user
        console.log(`✅ Applied default search: ${search.name}`)
      }
    } catch (error) {
      console.error('Error applying default search:', error)
    }
  }, [setSearchFilters, fetchOpportunities, getToken])


  // Prefetch data on mount
  const performPrefetch = useCallback(async () => {
    if (!user || hasPrefetched) return

    setIsLoading(true)
    try {
      // Get authentication token from Clerk
      const token = await getToken()

      if (!token) {
        console.log('No auth token available for prefetch')
        setHasPrefetched(true) // Prevent retry
        setPrefetchData({
          savedSearches: [],
          cachedMatchScores: {},
          recentOpportunityIds: []
        })
        return
      }

      const response = await fetch('/api/v1/saved-searches/prefetch', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          console.log('User not authenticated for prefetch')
          setHasPrefetched(true) // Prevent retry
          return
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        setPrefetchData(result.data)
        setHasPrefetched(true)

        // Apply cached match scores immediately
        if (result.data.cachedMatchScores && Object.keys(result.data.cachedMatchScores).length > 0) {
          console.log('🚀 Applying prefetched match scores:', Object.keys(result.data.cachedMatchScores).length)

          // Convert to the format expected by the store
          const scores: Record<string, number> = {}
          const details: Record<string, any> = {}

          Object.entries(result.data.cachedMatchScores).forEach(([oppId, data]: [string, any]) => {
            scores[oppId] = data.score
            details[oppId] = data
          })

          setMatchScores(scores)
          setMatchScoreDetails(details)
        }

        // Apply default search if available and not yet applied
        if (!hasAppliedDefault && result.data.defaultSearch) {
          console.log('🌟 Auto-applying default search:', result.data.defaultSearch.name)
          await applyDefaultSearch(result.data.defaultSearch)
          setHasAppliedDefault(true)
        }
      } else {
        console.warn('Prefetch API returned success=false:', result.error)
        setHasPrefetched(true) // Prevent retry
      }
    } catch (error) {
      console.error('Error prefetching data:', error)
      // Mark as prefetched to prevent infinite retry
      setHasPrefetched(true)

      // Fallback to empty data structure
      setPrefetchData({
        savedSearches: [],
        cachedMatchScores: {},
        recentOpportunityIds: []
      })
    } finally {
      setIsLoading(false)
    }
  }, [user, hasPrefetched, hasAppliedDefault, setMatchScores, setMatchScoreDetails, getToken])

  // Handle Clerk loading issues
  useEffect(() => {
    // If Clerk fails to load after 5 seconds, mark as error and continue
    const timeout = setTimeout(() => {
      if (!isLoaded) {
        console.warn('Clerk failed to load, continuing without authentication')
        setClerkLoadError(true)
        setHasPrefetched(true)
        setPrefetchData({
          savedSearches: [],
          cachedMatchScores: {},
          recentOpportunityIds: []
        })
      }
    }, 5000)

    if (isLoaded) {
      clearTimeout(timeout)
    }

    return () => clearTimeout(timeout)
  }, [isLoaded])

  // Prefetch on user load
  useEffect(() => {
    if ((isLoaded && user && !hasPrefetched) || (clerkLoadError && !hasPrefetched)) {
      const timeout = window.setTimeout(() => {
        if (user) {
          void performPrefetch()
        } else {
          // No user (not authenticated), just set empty data
          setHasPrefetched(true)
          setPrefetchData({
            savedSearches: [],
            cachedMatchScores: {},
            recentOpportunityIds: []
          })
        }
      }, 0)

      return () => window.clearTimeout(timeout)
    }
  }, [isLoaded, user, hasPrefetched, clerkLoadError, performPrefetch])

  return {
    savedSearches: prefetchData?.savedSearches || [],
    defaultSearch: prefetchData?.defaultSearch,
    cachedMatchScores: prefetchData?.cachedMatchScores || {},
    isLoading,
    hasPrefetched,
    refetch: performPrefetch
  }
}
