'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  Bookmark, 
  BookmarkPlus, 
  Loader2, 
  Hash, 
  Palette, 
  Share2, 
  Star,
  Sparkles,
  AlertTriangle,
  Filter,
  Tags
} from 'lucide-react'
import { SearchFilters } from '@/types'
import { SavedSearch } from './SavedSearchDropdown'
import { useNotify } from '@/contexts/notification-context'
import { cn } from '@/lib/utils'

interface SavedSearchModalProps {
  isOpen: boolean
  onClose: () => void
  currentFilters: SearchFilters
  editingSearch?: SavedSearch
  onSaved: () => void
}

// Predefined categories for consistency
const PREDEFINED_CATEGORIES = [
  'Federal Contracts',
  'State & Local',
  'Grants',
  'IT Services',
  'Construction',
  'Professional Services',
  'Research & Development',
  'Defense',
  'Healthcare',
  'Education'
]

// Color options for visual organization
const COLOR_OPTIONS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6B7280'  // Gray
]

export function SavedSearchModal({
  isOpen,
  onClose,
  currentFilters,
  editingSearch,
  onSaved
}: SavedSearchModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    color: COLOR_OPTIONS[0],
    isDefault: false,
    isShared: false,
    isFavorite: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [customCategory, setCustomCategory] = useState('')
  const [useCustomCategory, setUseCustomCategory] = useState(false)
  const notify = useNotify()

  // Reset form when modal opens/closes or editing search changes
  const [previousOpen, setPreviousOpen] = useState(false)
  const [previousSearch, setPreviousSearch] = useState(editingSearch)
  if (previousOpen !== isOpen || previousSearch !== editingSearch) {
    setPreviousOpen(isOpen)
    setPreviousSearch(editingSearch)
    if (isOpen) {
      if (editingSearch) {
        setFormData({
          name: editingSearch.name,
          description: editingSearch.description || '',
          category: editingSearch.category || '',
          color: editingSearch.color || COLOR_OPTIONS[0],
          isDefault: editingSearch.isDefault,
          isShared: editingSearch.isShared,
          isFavorite: editingSearch.isFavorite
        })
        
        // Check if category is custom
        const isCustom = editingSearch.category && 
                        !PREDEFINED_CATEGORIES.includes(editingSearch.category)
        setUseCustomCategory(isCustom)
        if (isCustom) {
          setCustomCategory(editingSearch.category || '')
        }
      } else {
        setFormData({
          name: '',
          description: '',
          category: '',
          color: COLOR_OPTIONS[0],
          isDefault: false,
          isShared: false,
          isFavorite: false
        })
        setUseCustomCategory(false)
        setCustomCategory('')
      }
    }
  }

  // Count active filters
  const activeFilterCount = Object.values(currentFilters).filter(value => 
    (Array.isArray(value) && value.length > 0) || 
    (typeof value === 'string' && value) ||
    (typeof value === 'number' && value > 0)
  ).length

  // Generate a suggested name based on filters
  const generateSuggestedName = () => {
    const suggestions = []
    
    if (currentFilters.agencies?.length) {
      suggestions.push(currentFilters.agencies[0])
    }
    
    if (currentFilters.setAsideTypes?.length) {
      suggestions.push(currentFilters.setAsideTypes[0].replace(/_/g, ' '))
    }
    
    if (currentFilters.states?.length) {
      suggestions.push(currentFilters.states[0])
    }
    
    if (currentFilters.naicsCodes?.length) {
      suggestions.push(`NAICS ${currentFilters.naicsCodes[0]}`)
    }
    
    if (currentFilters.opportunityTypes?.length) {
      suggestions.push(currentFilters.opportunityTypes[0])
    }

    if (suggestions.length === 0) {
      return 'My Search'
    }
    
    return suggestions.slice(0, 3).join(' • ')
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      notify.error('Validation Error', 'Please enter a name for your search')
      return
    }

    setIsLoading(true)
    
    try {
      const category = useCustomCategory ? customCategory : formData.category
      
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category: category.trim() || undefined,
        filters: currentFilters,
        color: formData.color,
        isDefault: formData.isDefault,
        isShared: formData.isShared,
        isFavorite: formData.isFavorite
      }

      const url = editingSearch 
        ? `/api/v1/saved-searches/${editingSearch.id}`
        : '/api/v1/saved-searches'
      
      const method = editingSearch ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        if (response.status === 403) {
          const errorData = await response.json()
          if (errorData.code === 'USAGE_LIMIT_EXCEEDED') {
            notify.error(
              'Usage Limit Reached', 
              errorData.details?.message || 'Please upgrade your plan to save more searches'
            )
            return
          }
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        notify.success(
          editingSearch ? 'Search Updated' : 'Search Saved', 
          `${editingSearch ? 'Updated' : 'Saved'} search: ${formData.name}`
        )
        onSaved()
        onClose()
      } else {
        throw new Error(result.error || 'Failed to save search')
      }
    } catch (error) {
      console.error('Error saving search:', error)
      notify.error('Error', 'Failed to save search')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editingSearch ? (
              <>
                <Bookmark className="w-5 h-5" />
                Edit Saved Search
              </>
            ) : (
              <>
                <BookmarkPlus className="w-5 h-5" />
                Save Current Search
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {editingSearch ? (
              `Update the details for your saved search.`
            ) : (
              `Save your current search with ${activeFilterCount} active filter${activeFilterCount !== 1 ? 's' : ''} for quick access later.`
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Active Filters Preview */}
          {!editingSearch && activeFilterCount > 0 && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Active Filters ({activeFilterCount})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(currentFilters).map(([key, value]) => {
                  if (Array.isArray(value) && value.length > 0) {
                    return value.slice(0, 3).map((item, index) => (
                      <Badge key={`${key}-${index}`} variant="secondary" className="text-xs">
                        {String(item)}
                      </Badge>
                    ))
                  } else if (typeof value === 'string' && value) {
                    return (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {value}
                      </Badge>
                    )
                  }
                  return null
                }).filter(Boolean)}
                {activeFilterCount > 6 && (
                  <Badge variant="outline" className="text-xs">
                    +{activeFilterCount - 6} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="name"
                placeholder="Enter a name for your search"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                maxLength={100}
                required
              />
              {!editingSearch && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, name: generateSuggestedName() }))}
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description (e.g., 'Federal IT contracts in Virginia')"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              maxLength={500}
              rows={2}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="use-custom-category"
                  checked={useCustomCategory}
                  onCheckedChange={setUseCustomCategory}
                />
                <Label htmlFor="use-custom-category" className="text-sm">
                  Use custom category
                </Label>
              </div>
              
              {useCustomCategory ? (
                <Input
                  placeholder="Enter custom category"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  maxLength={50}
                />
              ) : (
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREDEFINED_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    formData.color === color 
                      ? "border-foreground scale-110" 
                      : "border-muted-foreground/20 hover:border-muted-foreground/40"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData(prev => ({ ...prev, color }))}
                />
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label>Options</Label>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is-default"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) => setFormData(prev => ({ 
                    ...prev, 
                    isDefault: Boolean(checked) 
                  }))}
                />
                <Label htmlFor="is-default" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                  Set as default search
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is-shared"
                  checked={formData.isShared}
                  onCheckedChange={(checked) => setFormData(prev => ({ 
                    ...prev, 
                    isShared: Boolean(checked) 
                  }))}
                />
                <Label htmlFor="is-shared" className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-blue-500" />
                  Share with organization
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is-favorite"
                  checked={formData.isFavorite}
                  onCheckedChange={(checked) => setFormData(prev => ({ 
                    ...prev, 
                    isFavorite: Boolean(checked) 
                  }))}
                />
                <Label htmlFor="is-favorite" className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500" />
                  Add to favorites
                </Label>
              </div>
            </div>
          </div>

          {/* Warning for no active filters */}
          {!editingSearch && activeFilterCount === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm text-yellow-800 dark:text-yellow-200">
                No filters are currently active. This search will return all opportunities.
              </span>
            </div>
          )}

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !formData.name.trim()}
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingSearch ? 'Update Search' : 'Save Search'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}