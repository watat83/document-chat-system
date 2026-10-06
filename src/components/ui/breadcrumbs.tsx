'use client'

import * as React from "react"
import { ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface BreadcrumbItem {
  id: string
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  maxItems?: number
  onItemClick?: (itemId: string) => void
  className?: string
}

export function Breadcrumbs({ 
  items, 
  maxItems = 3, 
  onItemClick,
  className 
}: BreadcrumbsProps) {
  const displayItems = React.useMemo(() => {
    if (items.length <= maxItems) {
      return items
    }

    // Show first item, ellipsis, and last few items
    const firstItem = items[0]
    const lastItems = items.slice(-(maxItems - 1))
    
    return [
      firstItem,
      { id: 'ellipsis', label: '...' },
      ...lastItems
    ]
  }, [items, maxItems])

  const handleItemClick = (item: BreadcrumbItem) => {
    if (item.id === 'ellipsis') return
    
    if (onItemClick) {
      onItemClick(item.id)
    } else if (item.href) {
      window.location.assign(item.href)
    }
  }

  return (
    <nav className={cn("flex items-center space-x-2 text-sm", className)}>
      {displayItems.map((item, index) => {
        const isLast = index === displayItems.length - 1
        const isEllipsis = item.id === 'ellipsis'
        const isClickable = !isLast && !isEllipsis && (onItemClick || item.href)

        return (
          <React.Fragment key={item.id}>
            {isEllipsis ? (
              <span className="flex items-center">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </span>
            ) : (
              <span
                className={cn(
                  "truncate",
                  isLast ? "text-foreground font-medium" : "text-muted-foreground",
                  isClickable && "hover:text-foreground cursor-pointer"
                )}
                onClick={() => handleItemClick(item)}
              >
                {item.label}
              </span>
            )}
            
            {!isLast && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}