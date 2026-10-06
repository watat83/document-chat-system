'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Check, ChevronsUpDown, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterOption {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
  category?: string
  disabled?: boolean
}

interface FilterSelectProps {
  value?: string | string[]
  onChange: (value: string | string[]) => void
  options: FilterOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  allowClear?: boolean
  multiple?: boolean
  searchable?: boolean
  showDescription?: boolean
  groupByCategory?: boolean
  maxDisplayed?: number
  emptyText?: string
}

export function FilterSelect({
  multiple = false,
  value = multiple ? [] : '',
  onChange,
  options,
  placeholder = 'Select option...',
  className,
  disabled = false,
  allowClear = true,
  searchable = true,
  showDescription = true,
  groupByCategory = false,
  maxDisplayed = 3,
  emptyText = 'No options found.',
}: FilterSelectProps) {
  const [open, setOpen] = useState(false)

  // Normalize value to always work with arrays for consistent logic
  const normalizedValue = useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value : value ? [value] : []
    }
    return Array.isArray(value) ? value[0] || '' : value || ''
  }, [value, multiple])

  // Get selected options for display
  const selectedOptions = useMemo(() => {
    const selectedValues = multiple ? normalizedValue as string[] : [normalizedValue as string]
    return options.filter(option => selectedValues.includes(option.value))
  }, [normalizedValue, options, multiple])

  // Group options by category if requested
  const groupedOptions = useMemo(() => {
    if (!groupByCategory) {
      return [{ category: null, options }]
    }

    const groups = options.reduce((acc, option) => {
      const category = option.category || 'Other'
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(option)
      return acc
    }, {} as Record<string, FilterOption[]>)

    return Object.entries(groups).map(([category, options]) => ({
      category,
      options,
    }))
  }, [options, groupByCategory])

  const handleSelect = (optionValue: string) => {
    if (multiple) {
      const currentValues = normalizedValue as string[]
      const newValues = currentValues.includes(optionValue)
        ? currentValues.filter(v => v !== optionValue)
        : [...currentValues, optionValue]
      onChange(newValues)
    } else {
      onChange(optionValue)
      setOpen(false)
    }
  }

  const handleClear = () => {
    onChange(multiple ? [] : '')
  }

  const getDisplayText = () => {
    if (selectedOptions.length === 0) {
      return placeholder
    }

    if (!multiple) {
      return selectedOptions[0]?.label || ''
    }

    if (selectedOptions.length <= maxDisplayed) {
      return `${selectedOptions.length} selected`
    }

    return `${selectedOptions.length} selected`
  }

  const OptionWithInfo = ({ option, children }: { option: FilterOption; children: React.ReactNode }) => {
    if (!showDescription || !option.description) {
      return <>{children}</>
    }

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          {children}
        </HoverCardTrigger>
        <HoverCardContent className="w-80">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {option.icon}
              <h4 className="text-sm font-medium">{option.label}</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              {option.description}
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>
    )
  }

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between",
              selectedOptions.length === 0 && "text-muted-foreground"
            )}
          >
            <span className="truncate">{getDisplayText()}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            {searchable && (
              <CommandInput placeholder="Search options..." />
            )}
            <CommandList className="max-h-64">
              <CommandEmpty>{emptyText}</CommandEmpty>

              {groupedOptions.map(({ category, options: groupOptions }) => (
                <CommandGroup
                  key={category || 'default'}
                  heading={category && category !== 'Other' ? category : undefined}
                >
                  {groupOptions.map((option) => {
                    const isSelected = multiple
                      ? (normalizedValue as string[]).includes(option.value)
                      : normalizedValue === option.value

                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                        onSelect={() => handleSelect(option.value)}
                        className="cursor-pointer"
                      >
                        <OptionWithInfo option={option}>
                          <div className="flex items-center gap-2 flex-1">
                            {option.icon}
                            <span className="flex-1">{option.label}</span>
                            {showDescription && option.description && (
                              <Info className="h-3 w-3 text-muted-foreground" />
                            )}
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </OptionWithInfo>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected items display for multiple selection */}
      {multiple && selectedOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <Badge key={option.value} variant="secondary" className="text-xs">
              <span className="flex items-center gap-1">
                {option.icon}
                {option.label}
                {allowClear && (
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelect(option.value)
                    }}
                  />
                )}
              </span>
            </Badge>
          ))}
          {allowClear && selectedOptions.length > 1 && (
            <Badge
              variant="outline"
              className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleClear}
            >
              Clear all
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
