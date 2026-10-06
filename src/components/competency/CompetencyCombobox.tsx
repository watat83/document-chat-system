'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Check, ChevronsUpDown, Search, X, Loader2, Star, Filter, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
// Removed Command imports - using regular divs for better focus management
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { searchCompetencies, getPopularCompetencies, getSearchSuggestions, type SearchResult } from '@/lib/competencies-search';
import type { CompetencyWithCategory } from '@/types/competencies';

interface CompetencyComboboxProps {
  competencies: CompetencyWithCategory[];
  selectedCompetencies: string[];
  onCompetenciesChange: (competencies: string[]) => void;
  placeholder?: string;
  className?: string;
  maxSelections?: number;
}

const CompetencyCombobox: React.FC<CompetencyComboboxProps> = ({
  competencies,
  selectedCompetencies,
  onCompetenciesChange,
  placeholder = "Search and select competencies...",
  className,
  maxSelections
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [functionalAreaFilter, setFunctionalAreaFilter] = useState<string>('all');
  const [complexityFilter, setComplexityFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Extract unique filter options from competencies
  const filterOptions = useMemo(() => {
    const categories = new Set<string>();
    const functionalAreas = new Set<string>();
    const complexityLevels = new Set<string>();

    competencies.forEach(comp => {
      const data = comp as any;
      categories.add(comp.categoryName);
      if (data.functionalArea) functionalAreas.add(data.functionalArea);
      if (data.complexityLevel) complexityLevels.add(data.complexityLevel);
    });

    return {
      categories: Array.from(categories).sort(),
      functionalAreas: Array.from(functionalAreas).sort(),
      complexityLevels: Array.from(complexityLevels).sort()
    };
  }, [competencies]);

  // Get popular competencies
  const popularCompetencies = useMemo(() => {
    return getPopularCompetencies(competencies);
  }, [competencies]);

  // Debounced search with intelligent results
  const searchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return {
        results: [],
        stats: {
          totalResults: 0,
          categoryBreakdown: {},
          functionalAreaBreakdown: {},
          complexityBreakdown: {}
        }
      };
    }

    const filters = {
      categoryFilter: categoryFilter !== 'all' ? [categoryFilter] : undefined,
      functionalAreaFilter: functionalAreaFilter !== 'all' ? [functionalAreaFilter] : undefined,
      complexityLevelFilter: complexityFilter !== 'all' ? [complexityFilter] : undefined
    };

    return searchCompetencies(competencies, {
      query: debouncedSearchQuery,
      ...filters,
      limit: 50
    });
  }, [debouncedSearchQuery, competencies, categoryFilter, functionalAreaFilter, complexityFilter]);

  // Debounce search query to avoid excessive re-renders
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchSuggestions = useMemo(() => debouncedSearchQuery.length >= 2 ? getSearchSuggestions(competencies, debouncedSearchQuery, 5) : [], [debouncedSearchQuery, competencies]);

  // Handle selection
  const handleSelect = useCallback((pscCode: string) => {
    const isSelected = selectedCompetencies.includes(pscCode);
    let newSelection: string[];

    if (isSelected) {
      newSelection = selectedCompetencies.filter(id => id !== pscCode);
    } else {
      if (maxSelections && selectedCompetencies.length >= maxSelections) {
        // Replace last selection if at max
        newSelection = [...selectedCompetencies.slice(0, -1), pscCode];
      } else {
        newSelection = [...selectedCompetencies, pscCode];
      }
    }

    onCompetenciesChange(newSelection);
    
    // Restore focus to search input after selection
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }, [selectedCompetencies, onCompetenciesChange, maxSelections]);

  // Clear all selections
  const clearAll = useCallback(() => {
    onCompetenciesChange([]);
  }, [onCompetenciesChange]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setCategoryFilter('all');
    setFunctionalAreaFilter('all');
    setComplexityFilter('all');
  }, []);

  // Get selected competency names for display
  const selectedCompetencyNames = useMemo(() => {
    return selectedCompetencies.map(pscCode => {
      const comp = competencies.find(c => c.pscCode === pscCode);
      return comp ? comp.name : pscCode;
    });
  }, [selectedCompetencies, competencies]);

  const hasActiveFilters = categoryFilter !== 'all' || functionalAreaFilter !== 'all' || complexityFilter !== 'all';
  const hasResults = searchResults.results.length > 0;
  const showPopular = !debouncedSearchQuery.trim() && !hasActiveFilters;
  const isSearching = searchQuery.length > 0 && searchQuery !== debouncedSearchQuery;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Selected competencies display */}
      {selectedCompetencies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              Selected Competencies ({selectedCompetencies.length})
              {maxSelections && ` / ${maxSelections}`}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-xs text-muted-foreground"
            >
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedCompetencyNames.map((name, index) => {
              const pscCode = selectedCompetencies[index];
              return (
                <Badge 
                  key={pscCode} 
                  variant="secondary" 
                  className="text-xs flex items-center gap-1"
                >
                  {name}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelect(pscCode)}
                    className="h-3 w-3 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="h-2 w-2" />
                  </Button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Search interface */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="truncate">
                {selectedCompetencies.length > 0 
                  ? `${selectedCompetencies.length} selected` 
                  : placeholder
                }
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-[600px] p-0" align="start">
          <div className="space-y-3 p-3">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                ref={searchInputRef}
                placeholder="Search by name, keywords, PSC code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin" />
              )}
            </div>

            {/* Search suggestions */}
            {searchSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {searchSuggestions.map(suggestion => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery(suggestion)}
                    className="h-6 text-xs"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}

            {/* Filters toggle */}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs"
              >
                <Filter className="w-3 h-3 mr-1" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2 h-4 text-[10px]">
                    {[categoryFilter, functionalAreaFilter, complexityFilter].filter(f => f !== 'all').length}
                  </Badge>
                )}
              </Button>
              
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground"
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Filter controls */}
            {showFilters && (
              <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {filterOptions.categories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Functional Area</Label>
                  <Select value={functionalAreaFilter} onValueChange={setFunctionalAreaFilter}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      {filterOptions.functionalAreas.map(area => (
                        <SelectItem key={area} value={area}>
                          {area}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Complexity</Label>
                  <Select value={complexityFilter} onValueChange={setComplexityFilter}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      {filterOptions.complexityLevels.map(level => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Search stats */}
            {debouncedSearchQuery.trim() && (
              <div className="text-xs text-muted-foreground flex items-center gap-4">
                <span>{searchResults.stats.totalResults} results found</span>
                {Object.keys(searchResults.stats.categoryBreakdown).length > 1 && (
                  <div className="flex items-center gap-2">
                    {Object.entries(searchResults.stats.categoryBreakdown)
                      .slice(0, 3)
                      .map(([category, count]) => (
                        <Badge key={category} variant="outline" className="h-4 text-[10px]">
                          {category}: {count}
                        </Badge>
                      ))
                    }
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results */}
          <div className="border-t">
            <div className="max-h-[300px] overflow-y-auto">
              {/* Popular competencies (shown when no search) */}
              {showPopular && (
                <div>
                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                    Popular Competencies
                  </div>
                  {popularCompetencies.slice(0, 10).map((competency) => (
                    <CompetencyItem
                      key={competency.pscCode}
                      competency={competency}
                      isSelected={selectedCompetencies.includes(competency.pscCode)}
                      onSelect={handleSelect}
                      showStar={true}
                    />
                  ))}
                </div>
              )}

              {/* Search results */}
              {hasResults && (
                <div>
                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                    Search Results ({searchResults.results.length})
                  </div>
                  {searchResults.results.map((result) => (
                    <CompetencySearchItem
                      key={result.pscCode}
                      result={result}
                      isSelected={selectedCompetencies.includes(result.pscCode)}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}

              {/* Loading state while typing */}
              {isSearching && (
                <div className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Searching competencies...</p>
                </div>
              )}

              {/* Empty state */}
              {debouncedSearchQuery.trim() && !hasResults && !isSearching && (
                <div className="py-8 text-center space-y-2">
                  <p>No competencies found for &quot;{debouncedSearchQuery}&quot;</p>
                  <p className="text-xs text-muted-foreground">
                    Try adjusting your search terms or clearing filters
                  </p>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Component for displaying regular competencies
const CompetencyItem: React.FC<{
  competency: CompetencyWithCategory;
  isSelected: boolean;
  onSelect: (pscCode: string) => void;
  showStar?: boolean;
}> = ({ competency, isSelected, onSelect, showStar }) => {
  const data = competency as any;
  
  return (
    <div
      onClick={() => onSelect(competency.pscCode)}
      className="flex items-center gap-3 py-3 px-2 cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-4 h-4 rounded border-2 flex items-center justify-center",
          isSelected ? "bg-primary border-primary" : "border-muted-foreground/50"
        )}>
          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
        </div>
        {showStar && <Star className="w-3 h-3 text-orange-500" />}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate">{competency.name}</span>
          <Badge variant="outline" className="h-4 text-[10px] shrink-0">
            {competency.pscCode}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{competency.categoryName}</span>
          {data.functionalArea && (
            <>
              <span>•</span>
              <span>{data.functionalArea}</span>
            </>
          )}
          {data.complexityLevel && (
            <>
              <span>•</span>
              <Badge variant="secondary" className="h-3 text-[9px]">
                {data.complexityLevel}
              </Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Component for displaying search results with highlighting
const CompetencySearchItem: React.FC<{
  result: SearchResult;
  isSelected: boolean;
  onSelect: (pscCode: string) => void;
}> = ({ result, isSelected, onSelect }) => {
  const data = result as any;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={() => onSelect(result.pscCode)}
            className="flex items-start gap-3 py-3 px-2 cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 mt-0.5">
              <div className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center",
                isSelected ? "bg-primary border-primary" : "border-muted-foreground/50"
              )}>
                {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span 
                  className="font-medium text-sm"
                  dangerouslySetInnerHTML={{ __html: result.highlightedName }}
                />
                <Badge variant="outline" className="h-4 text-[10px] shrink-0">
                  {result.pscCode}
                </Badge>
                <Badge variant="secondary" className="h-4 text-[9px] shrink-0">
                  Score: {result.relevanceScore}
                </Badge>
              </div>
              
              <p 
                className="text-xs text-muted-foreground mb-1 line-clamp-2"
                dangerouslySetInnerHTML={{ __html: result.highlightedDescription }}
              />
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{result.categoryName}</span>
                {data.functionalArea && (
                  <>
                    <span>•</span>
                    <span>{data.functionalArea}</span>
                  </>
                )}
                {data.complexityLevel && (
                  <>
                    <span>•</span>
                    <Badge variant="secondary" className="h-3 text-[9px]">
                      {data.complexityLevel}
                    </Badge>
                  </>
                )}
                {result.matchedFields.length > 0 && (
                  <>
                    <span>•</span>
                    <div className="flex gap-1">
                      {result.matchedFields.slice(0, 3).map(field => (
                        <Tag key={field} className="w-2 h-2" />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </TooltipTrigger>
        
        <TooltipContent className="max-w-md">
          <div className="space-y-2">
            <p className="font-medium">{result.name}</p>
            <p className="text-xs">{result.description}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="h-4 text-[10px]">
                {result.categoryName}
              </Badge>
              {data.functionalArea && (
                <Badge variant="outline" className="h-4 text-[10px]">
                  {data.functionalArea}
                </Badge>
              )}
              {data.complexityLevel && (
                <Badge variant="outline" className="h-4 text-[10px]">
                  {data.complexityLevel}
                </Badge>
              )}
            </div>
            {result.matchedFields.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Matched: {result.matchedFields.join(', ')}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default CompetencyCombobox;