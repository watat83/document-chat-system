'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuShortcut
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { 
  Bookmark, 
  BookmarkPlus, 
  Search, 
  Star, 
  Share2, 
  Edit3, 
  Trash2, 
  Clock, 
  ChevronDown,
  Loader2,
  Users,
  User,
  Hash,
  Sparkles
} from 'lucide-react'
import { SearchFilters } from '@/types'
import { useNotify } from '@/contexts/notification-context'
import { cn } from '@/lib/utils'

export interface SavedSearch {
  id: string
  name: string
  description?: string
  category?: string
  filters: SearchFilters
  usageCount: number
  lastUsedAt?: string
  isDefault: boolean
  isShared: boolean
  isFavorite: boolean
  color?: string
  icon?: string
  userId: string
  user?: {
    id: string
    firstName?: string
    lastName?: string
    email: string
  }
  createdAt: string
  updatedAt: string
}

interface SavedSearchDropdownProps {
  currentFilters: SearchFilters
  onApplySearch: (filters: SearchFilters, searchName: string) => void
  onCreateSearch: () => void
  onEditSearch: (search: SavedSearch) => void
  className?: string
  prefetchedSearches?: SavedSearch[] // Accept prefetched data
}

export function SavedSearchDropdown({
  currentFilters,
  onApplySearch,
  onCreateSearch,
  onEditSearch,
  className,
  prefetchedSearches = []
}: SavedSearchDropdownProps) {
  const { user, isLoaded } = useUser()
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(prefetchedSearches)
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasPrefetched, setHasPrefetched] = useState(prefetchedSearches.length > 0)
  const [hasAppliedDefault, setHasAppliedDefault] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean
    search?: SavedSearch
  }>({ isOpen: false })
  const notify = useNotify()

  // Load saved searches
  const loadSavedSearches = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/v1/saved-searches?shared=true&limit=50')
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log('User not authenticated - saved searches not available')
          setSavedSearches([])
          return
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        setSavedSearches(result.data || [])
      } else {
        console.error('Failed to load saved searches:', result.error)
        notify.error('Error', 'Failed to load saved searches')
      }
    } catch (error) {
      console.error('Error loading saved searches:', error)
      // Don't show error notification for auth issues
      if (error instanceof Error && !error.message.includes('401')) {
        notify.error('Error', 'Failed to load saved searches')
      }
    } finally {
      setIsLoading(false)
    }
  }, [notify])

  // Use prefetched data if available
  useEffect(() => {
    if (prefetchedSearches.length > 0 && !hasPrefetched) {
      setSavedSearches(prefetchedSearches)
      setHasPrefetched(true)
    }
  }, [prefetchedSearches, hasPrefetched])

  // Load searches if not prefetched
  useEffect(() => {
    if (user && !hasPrefetched && prefetchedSearches.length === 0) {
      loadSavedSearches().then(() => {
        setHasPrefetched(true)
      })
    }
  }, [user, hasPrefetched, prefetchedSearches.length, loadSavedSearches])

  // Apply favorite/default search on initial load
  useEffect(() => {
    if (hasPrefetched && !hasAppliedDefault && savedSearches.length > 0) {
      // Find and apply favorite or default search
      const favoriteSearch = savedSearches.find(s => s.isFavorite)
      const defaultSearch = savedSearches.find(s => s.isDefault)
      const searchToApply = favoriteSearch || defaultSearch
      
      if (searchToApply) {
        console.log('🌟 Applying favorite/default search on load:', searchToApply.name)
        executeSearch(searchToApply, true) // Silent execution on load
        setHasAppliedDefault(true)
      }
    }
  }, [hasPrefetched, hasAppliedDefault, savedSearches])

  // Refresh searches when dropdown opens (in case they changed)
  useEffect(() => {
    if (isOpen && hasPrefetched) {
      loadSavedSearches()
    }
  }, [isOpen])

  // Execute/apply a saved search
  const executeSearch = async (search: SavedSearch, silent = false) => {
    try {
      const response = await fetch(`/api/v1/saved-searches/${search.id}/execute`, {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        onApplySearch(result.data.filters, result.data.name)
        setIsOpen(false)
        if (!silent) {
          notify.success('Search Applied', `Applied search: ${search.name}`)
        }
      } else {
        throw new Error(result.error || 'Failed to execute search')
      }
    } catch (error) {
      console.error('Error executing saved search:', error)
      if (!silent) {
        notify.error('Error', 'Failed to execute saved search')
      }
    }
  }

  // Delete a saved search
  const deleteSavedSearch = async (search: SavedSearch) => {
    try {
      const response = await fetch(`/api/v1/saved-searches/${search.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        setSavedSearches(prev => prev.filter(s => s.id !== search.id))
        notify.success('Deleted', `Deleted search: ${search.name}`)
      } else {
        throw new Error(result.error || 'Failed to delete search')
      }
    } catch (error) {
      console.error('Error deleting saved search:', error)
      notify.error('Error', 'Failed to delete saved search')
    }
  }

  // Toggle favorite status
  const toggleFavorite = async (search: SavedSearch, e: React.MouseEvent) => {
    e.stopPropagation()
    
    try {
      const response = await fetch(`/api/v1/saved-searches/${search.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isFavorite: !search.isFavorite
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        setSavedSearches(prev => 
          prev.map(s => s.id === search.id ? { ...s, isFavorite: !s.isFavorite } : s)
        )
      } else {
        throw new Error(result.error || 'Failed to update search')
      }
    } catch (error) {
      console.error('Error toggling favorite:', error)
      notify.error('Error', 'Failed to update search')
    }
  }

  // Group searches by category
  const groupedSearches = savedSearches.reduce((groups, search) => {
    const category = search.category || 'Uncategorized'
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(search)
    return groups
  }, {} as Record<string, SavedSearch[]>)

  // Sort categories and searches
  const sortedCategories = Object.keys(groupedSearches).sort((a, b) => {
    if (a === 'Uncategorized') return 1
    if (b === 'Uncategorized') return -1
    return a.localeCompare(b)
  })

  const hasActiveFilters = Object.values(currentFilters).some(value => 
    (Array.isArray(value) && value.length > 0) || 
    (typeof value === 'string' && value) ||
    (typeof value === 'number' && value > 0)
  )

  const mySearches = savedSearches.filter(s => s.userId === s.user?.id)
  const sharedSearches = savedSearches.filter(s => s.isShared && s.userId !== s.user?.id)

  // Don't render for unauthenticated users
  if (!isLoaded || !user) {
    return null
  }

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className={cn("gap-2", className)}
          >
            <Bookmark className="w-4 h-4" />
            Saved Searches
            {savedSearches.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {savedSearches.length}
              </Badge>
            )}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto">
          <DropdownMenuLabel className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4" />
              Saved Searches
            </div>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          </DropdownMenuLabel>
          
          <DropdownMenuSeparator />
          
          {/* Create New Search Option */}
          <DropdownMenuItem
            onClick={onCreateSearch}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400"
          >
            <BookmarkPlus className="w-4 h-4" />
            <div className="flex-1">
              <div className="font-medium">Save Current Search</div>
              {hasActiveFilters && (
                <div className="text-xs text-muted-foreground">
                  {Object.values(currentFilters).filter(f => 
                    (Array.isArray(f) && f.length > 0) || 
                    (typeof f === 'string' && f) ||
                    (typeof f === 'number' && f > 0)
                  ).length} active filters
                </div>
              )}
            </div>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />

          {/* No searches message */}
          {savedSearches.length === 0 && !isLoading && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <div>No saved searches yet</div>
              <div className="text-xs">Create your first saved search above</div>
            </div>
          )}

          {/* My Searches */}
          {mySearches.length > 0 && (
            <>
              <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                <User className="w-3 h-3" />
                My Searches ({mySearches.length})
              </DropdownMenuLabel>
              
              {mySearches
                .sort((a, b) => {
                  if (a.isFavorite && !b.isFavorite) return -1
                  if (!a.isFavorite && b.isFavorite) return 1
                  if (a.isDefault && !b.isDefault) return -1
                  if (!a.isDefault && b.isDefault) return 1
                  return new Date(b.lastUsedAt || b.updatedAt).getTime() - 
                         new Date(a.lastUsedAt || a.updatedAt).getTime()
                })
                .map((search) => (
                  <DropdownMenuItem
                    key={search.id}
                    onClick={() => executeSearch(search)}
                    className="flex items-start gap-2 py-3"
                  >
                    <div className="flex items-center gap-1 mt-0.5">
                      {search.color && (
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: search.color }}
                        />
                      )}
                      {search.isDefault && (
                        <Sparkles className="w-3 h-3 text-yellow-500" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{search.name}</span>
                        {search.isShared && (
                          <Share2 className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        )}
                      </div>
                      
                      {search.description && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {search.description}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {search.category && (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {search.category}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {search.usageCount} uses
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-6 w-6"
                        onClick={(e) => toggleFavorite(search, e)}
                      >
                        <Star 
                          className={cn(
                            "w-3 h-3",
                            search.isFavorite 
                              ? "fill-yellow-400 text-yellow-400" 
                              : "text-muted-foreground"
                          )}
                        />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditSearch(search)
                          setIsOpen(false)
                        }}
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-6 w-6 text-red-500 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteDialog({ isOpen: true, search })
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </DropdownMenuItem>
                ))}
            </>
          )}

          {/* Shared Searches */}
          {sharedSearches.length > 0 && (
            <>
              {mySearches.length > 0 && <DropdownMenuSeparator />}
              
              <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                <Users className="w-3 h-3" />
                Shared Searches ({sharedSearches.length})
              </DropdownMenuLabel>
              
              {sharedSearches
                .sort((a, b) => new Date(b.lastUsedAt || b.updatedAt).getTime() - 
                               new Date(a.lastUsedAt || a.updatedAt).getTime())
                .map((search) => (
                  <DropdownMenuItem
                    key={search.id}
                    onClick={() => executeSearch(search)}
                    className="flex items-start gap-2 py-3"
                  >
                    <div className="flex items-center gap-1 mt-0.5">
                      {search.color && (
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: search.color }}
                        />
                      )}
                      <Share2 className="w-3 h-3 text-blue-500" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{search.name}</div>
                      
                      {search.description && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {search.description}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <div>
                          by {search.user?.firstName || search.user?.email}
                        </div>
                        {search.category && (
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {search.category}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {search.usageCount} uses
                        </div>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog 
        open={deleteDialog.isOpen} 
        onOpenChange={(open) => setDeleteDialog({ isOpen: open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Search</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDialog.search?.name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDialog.search) {
                  deleteSavedSearch(deleteDialog.search)
                }
                setDeleteDialog({ isOpen: false })
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}