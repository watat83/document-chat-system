'use client'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, FileText, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { DialogTitle } from '@/components/ui/dialog'
import { useDebounce } from '@/hooks/useDebounce'
import { Badge } from '@/components/ui/badge'

interface SearchResult {
  documents: any[]
  total: number
}

interface HeaderSearchProps {
  triggerOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function HeaderSearch({ triggerOpen, onOpenChange }: HeaderSearchProps = {}) {
  const router = useRouter()
  const [localOpen, setOpen] = useState(false)
  const open = triggerOpen ?? localOpen
  const [query, setQuery] = useState('')

  const debouncedQuery = useDebounce(query, 300)

  // Notify parent of open state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    onOpenChange?.(newOpen)
  }

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleOpenChange(!open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open])

  const { userId, orgId } = useAuth()
  const search = useQuery({
    queryKey: ['header-search', userId, orgId, debouncedQuery],
    enabled: open && Boolean(userId) && debouncedQuery.length >= 2, gcTime: 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/documents?search=${encodeURIComponent(debouncedQuery)}`, { signal })
      if (!response.ok) throw new Error('Search failed')
      const data = await response.json()
      return { documents: data.documents || [], total: data.count || 0 } as SearchResult
    },
  })
  const loading = search.isFetching
  const results = debouncedQuery.length >= 2 ? search.data ?? { documents: [], total: 0 } : { documents: [], total: 0 }

  const handleSelect = (documentId: string) => {
    handleOpenChange(false)
    setQuery('')
    router.push(`/documents/${documentId}`)
  }

  const handleViewAll = () => {
    handleOpenChange(false)
    router.push('/documents')
  }

  return (
    <>
      {/* Desktop Search Bar */}
      <div className="hidden md:flex flex-1 max-w-lg mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search documents... (⌘K)"
            className="w-full pl-10 pr-4 py-2.5"
            onClick={() => handleOpenChange(true)}
            readOnly
          />
          <kbd className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Mobile Search Button */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="md:hidden"
        onClick={() => handleOpenChange(true)}
      >
        <Search className="h-5 w-5" />
        <span className="sr-only">Search</span>
      </Button>

      {/* Search Dialog */}
      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <DialogTitle className="sr-only">Search Documents</DialogTitle>
        <Command className="rounded-lg border shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-0 focus-visible:ring-0"
            />
            {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="ml-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <CommandList>
            {query.length >= 2 && !loading && results.documents.length === 0 && (
              <CommandEmpty>No documents found.</CommandEmpty>
            )}

            {results.documents.length > 0 && (
              <CommandGroup heading={`Documents (${results.total} found)`}>
                {results.documents.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    value={doc.id}
                    onSelect={() => handleSelect(doc.id)}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start gap-3 w-full">
                      <FileText className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="font-medium line-clamp-1">{doc.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">
                            {doc.type?.toUpperCase() || 'FILE'}
                          </Badge>
                          <span>•</span>
                          <span>{doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : 'Unknown size'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(doc.uploadDate || doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.total > 5 && (
              <div className="p-2 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleViewAll}
                >
                  View all {results.total} documents
                </Button>
              </div>
            )}

            {query.length < 2 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}