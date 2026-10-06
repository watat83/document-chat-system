'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Check, X, ChevronDown, ChevronRight, Filter, Star, Zap, TrendingUp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import competenciesData from '@/data/government/competencies/competencies.json';
import { searchCompetencies, getPopularCompetencies, getSearchSuggestions, type SearchResult } from '@/lib/competencies-search';
import CompetencyCombobox from '@/components/competency/CompetencyCombobox';
import type {
  CompetenciesData,
  CompetencyLevel,
  CompetencyWithCategory,
  SelectedCompetency
} from '@/types/competencies';

interface ServiceCompetencySelectorProps {
  selectedCompetencies?: SelectedCompetency[];
  onCompetenciesChange?: (competencies: SelectedCompetency[]) => void;
  className?: string;
}

const ServiceCompetencySelector: React.FC<ServiceCompetencySelectorProps> = ({
  selectedCompetencies = [],
  onCompetenciesChange,
  className = ''
}) => {
  const data = competenciesData as CompetenciesData;

  // Flatten all services for easy lookup
  const allServicesMap = useMemo(() => {
    const servicesMap = new Map<string, CompetencyWithCategory>();
    Object.entries(data.services_catalog).forEach(([categoryId, category]) => {
      const categoryServices = category.competencies || category.services || [];
      categoryServices.forEach(service => {
        const serviceWithCategory: CompetencyWithCategory = {
          ...service,
          categoryId,
          categoryName: category.category,
          categoryIcon: category.icon,
          categoryTags: category.search_tags
        };
        servicesMap.set(service.pscCode, serviceWithCategory);
        // Also map by name for legacy support
        servicesMap.set(service.name, serviceWithCategory);
      });
    });
    return servicesMap;
  }, [data]);

  // Initialize state from props, handling both new format and legacy names
  const [selectedServices, setSelectedServices] = useState<Set<string>>(() => {
    const selected = new Set<string>();
    selectedCompetencies.forEach(c => {
      // Try to find by PSC code first
      if (allServicesMap.has(c.pscCode)) {
        selected.add(c.pscCode);
      }
      // Then try by name (for legacy data)
      else if (allServicesMap.has(c.competencyName)) {
        const service = allServicesMap.get(c.competencyName);
        if (service) {
          selected.add(service.pscCode);
        }
      }
    });
    return selected;
  });

  const [competencyLevels, setCompetencyLevels] = useState<Record<string, CompetencyLevel>>(() => {
    const levels: Record<string, CompetencyLevel> = {};
    selectedCompetencies.forEach(c => {
      // Try to find by PSC code first
      if (allServicesMap.has(c.pscCode)) {
        levels[c.pscCode] = c.level || 'intermediate';
      }
      // Then try by name (for legacy data)
      else if (allServicesMap.has(c.competencyName)) {
        const service = allServicesMap.get(c.competencyName);
        if (service) {
          levels[service.pscCode] = c.level || 'intermediate';
        }
      }
    });
    return levels;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'categorized' | 'list' | 'grid' | 'enhanced'>('enhanced');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showSelected, setShowSelected] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'popular' | 'categories'>('search');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [functionalAreaFilter, setFunctionalAreaFilter] = useState<string>('');
  const [complexityFilter, setComplexityFilter] = useState<string>('');

  // Create a stable reference to avoid infinite re-renders
  const [previousCompetenciesKey, setPreviousCompetenciesKey] = useState('');
  const competenciesKey = selectedCompetencies.map(c => `${c.pscCode}:${c.level}`).sort().join('|');

  // Update state when selectedCompetencies prop changes (for data persistence after save/reload)
  if (previousCompetenciesKey !== competenciesKey) {
    setPreviousCompetenciesKey(competenciesKey);

    const expectedSelected = new Set<string>();
    const expectedLevels: Record<string, CompetencyLevel> = {};

    selectedCompetencies.forEach(c => {
      // Try to find by PSC code first
      if (allServicesMap.has(c.pscCode)) {
        expectedSelected.add(c.pscCode);
        expectedLevels[c.pscCode] = c.level || 'intermediate';
      }
      // Then try by name (for legacy data)
      else if (allServicesMap.has(c.competencyName)) {
        const service = allServicesMap.get(c.competencyName);
        if (service) {
          expectedSelected.add(service.pscCode);
          expectedLevels[service.pscCode] = c.level || 'intermediate';
        }
      }
    });

    setSelectedServices(expectedSelected);
    setCompetencyLevels(expectedLevels);
  }

  // Flatten services for search
  const allServices = useMemo(() => {
    return Array.from(allServicesMap.values()).filter((service, index, self) =>
      // Remove duplicates (since we map both by PSC code and name)
      self.findIndex(s => s.pscCode === service.pscCode) === index
    );
  }, [allServicesMap]);

  // Enhanced search with relevance scoring
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) {
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

    return searchCompetencies(allServices, {
      query: searchTerm,
      limit: 100
    });
  }, [allServices, searchTerm]);

  // Get popular competencies
  const popularServices = useMemo(() => {
    return getPopularCompetencies(allServices);
  }, [allServices]);

  const searchSuggestions = useMemo(() => searchTerm.length >= 2 ? getSearchSuggestions(allServices, searchTerm, 5) : [], [searchTerm, allServices]);

  // Legacy filtered services for backward compatibility
  const filteredServices = useMemo(() => {
    if (!searchTerm) return allServices;
    return searchResults.results;
  }, [allServices, searchTerm, searchResults]);

  // Create stable references for parent updates
  const parentUpdateRef = useRef<string>('');
  const currentSelection = Array.from(selectedServices).sort().join(',');
  const currentLevels = Object.entries(competencyLevels).sort().map(([k,v]) => `${k}:${v}`).join('|');
  const updateKey = `${currentSelection}|${currentLevels}`;

  // Update parent when selection changes
  useEffect(() => {
    // Prevent infinite loops by checking if data actually changed
    if (parentUpdateRef.current === updateKey || !onCompetenciesChange) {
      return;
    }

    parentUpdateRef.current = updateKey;

    const competencies: SelectedCompetency[] = Array.from(selectedServices).map(serviceId => {
      const service = allServices.find(s => s.pscCode === serviceId);
      return {
        pscCode: serviceId,
        level: competencyLevels[serviceId] || 'intermediate',
        categoryId: service?.categoryId || '',
        categoryName: service?.categoryName || '',
        competencyName: service?.name || ''
      };
    });

    // Debug logging to help track skill level changes
    console.log('ServiceCompetencySelector: Updating parent with competencies:', {
      count: competencies.length,
      withLevels: competencies.filter(c => c.level !== 'intermediate').length,
      competencies: competencies.map(c => ({ name: c.competencyName, level: c.level }))
    });

    onCompetenciesChange(competencies);
  }, [updateKey, allServices, onCompetenciesChange]);

  const toggleService = (serviceId: string) => {
    const newSelected = new Set(selectedServices);
    if (newSelected.has(serviceId)) {
      newSelected.delete(serviceId);
      const newLevels = { ...competencyLevels };
      delete newLevels[serviceId];
      setCompetencyLevels(newLevels);
    } else {
      newSelected.add(serviceId);
      setCompetencyLevels(prev => ({
        ...prev,
        [serviceId]: 'intermediate'
      }));
    }
    setSelectedServices(newSelected);
  };

  const setCompetencyLevel = (serviceId: string, level: CompetencyLevel) => {
    console.log('ServiceCompetencySelector: Setting competency level:', { serviceId, level });
    setCompetencyLevels(prev => {
      const updated = {
        ...prev,
        [serviceId]: level
      };
      console.log('ServiceCompetencySelector: Updated competency levels:', updated);
      return updated;
    });
  };

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const renderCompetencyBadge: React.FC<{
    level: CompetencyLevel;
    serviceId: string;
    compact?: boolean
  }> = ({ level, serviceId, compact = false }) => {
    const levels = {
      beginner: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300', label: 'Beginner' },
      intermediate: { color: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300', label: 'Intermediate' },
      advanced: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300', label: 'Advanced' },
      expert: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300', label: 'Expert' }
    };

    if (compact) {
      return (
        <TooltipProvider>
          <div className="flex gap-1">
            {Object.entries(levels).map(([levelKey, levelData]) => (
              <Tooltip key={levelKey}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setCompetencyLevel(serviceId, levelKey as CompetencyLevel)
                    }}
                    className={`w-3 h-3 rounded-full transition-all border border-gray-300 dark:border-gray-600 ${
                      level === levelKey
                        ? levelData.color.replace('100', '500').replace('800', 'white')
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{levelData.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      );
    }

    return (
      <select
        value={level}
        onChange={(e) => {
          e.stopPropagation()
          setCompetencyLevel(serviceId, e.target.value as CompetencyLevel)
        }}
        onClick={(e) => e.stopPropagation()}
        className={`px-2 py-1 rounded-full text-xs font-medium border-none ${levels[level].color}`}
      >
        {Object.entries(levels).map(([key, data]) => (
          <option key={key} value={key}>{data.label}</option>
        ))}
      </select>
    );
  };

  const renderServiceCard: React.FC<{
    service: CompetencyWithCategory;
    compact?: boolean; key?: React.Key
  }> = ({ service, compact = false, key }) => {
    const isSelected = selectedServices.has(service.pscCode);

    if (compact) {
      return (
        <div key={key} className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
          isSelected ? 'border-blue-500 bg-blue-50 dark:bg-slate-800 dark:border-blue-400 dark:text-white' : 'border-border hover:border-muted-foreground/50'
        }`}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggleService(service.pscCode)
              }}
              className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-muted-foreground/50 hover:border-blue-400'
              }`}
            >
              {isSelected && <Check className="w-3 h-3" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground dark:!text-white truncate">
                  {service.name}
                </span>
                <Badge variant="outline" className="h-4 text-[10px] shrink-0">
                  {service.pscCode}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground dark:!text-gray-200">{service.categoryName}</span>
            </div>
          </div>
          {isSelected && (
            renderCompetencyBadge({level: competencyLevels[service.pscCode] || 'intermediate', serviceId: service.pscCode, compact: true})
          )}
        </div>
      );
    }

    return (
      <div className={`p-4 rounded-lg border transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50 dark:bg-slate-800 dark:border-blue-400 dark:text-white' : 'border-border hover:border-muted-foreground/50'
      }`}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleService(service.pscCode)
            }}
            className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-muted-foreground/50 hover:border-blue-400'
            }`}
          >
            {isSelected && <Check className="w-4 h-4" />}
          </button>

          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground dark:!text-white">{service.name}</h3>
                  <Badge variant="outline" className="h-4 text-[10px] shrink-0">
                    {service.pscCode}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground dark:!text-gray-200 mb-2">{service.description}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground dark:!text-gray-200">{service.categoryIcon}</span>
                  <span className="text-muted-foreground dark:!text-gray-200">{service.categoryName}</span>
                </div>
              </div>
            </div>

            {isSelected && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground/90">Competency Level:</span>
                  {renderCompetencyBadge({level: competencyLevels[service.pscCode] || 'intermediate', serviceId: service.pscCode})}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Extract unique filter options
  const filterOptions = useMemo(() => {
    const categories = new Set<string>();
    const functionalAreas = new Set<string>();
    const complexityLevels = new Set<string>();

    allServices.forEach(service => {
      const data = service as any;
      categories.add(service.categoryName);
      if (data.functionalArea) functionalAreas.add(data.functionalArea);
      if (data.complexityLevel) complexityLevels.add(data.complexityLevel);
    });

    return {
      categories: Array.from(categories).sort(),
      functionalAreas: Array.from(functionalAreas).sort(),
      complexityLevels: Array.from(complexityLevels).sort()
    };
  }, [allServices]);

  const selectedCount = selectedServices.size;

  // Enhanced view component
  const renderEnhancedSearchView = () => {
    return (
      <div className="space-y-4">
        <CompetencyCombobox
          competencies={allServices}
          selectedCompetencies={Array.from(selectedServices)}
          onCompetenciesChange={(competencies) => {
            const newSelected = new Set(competencies);
            setSelectedServices(newSelected);

            // Update levels for new selections
            const newLevels: Record<string, CompetencyLevel> = { ...competencyLevels };
            competencies.forEach(pscCode => {
              if (!newLevels[pscCode]) {
                newLevels[pscCode] = 'intermediate';
              }
            });

            // Remove levels for deselected competencies
            Object.keys(newLevels).forEach(pscCode => {
              if (!competencies.includes(pscCode)) {
                delete newLevels[pscCode];
              }
            });

            setCompetencyLevels(newLevels);
          }}
          maxSelections={20} // Reasonable limit for UI performance
        />

        {/* Competency level adjustment for selected items */}
        {selectedCount > 0 && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">
              Adjust Competency Levels ({selectedCount} selected)
            </h3>
            <div className="space-y-2">
              {Array.from(selectedServices).slice(0, 10).map(serviceId => {
                const service = allServices.find(s => s.pscCode === serviceId);
                if (!service) return null;

                return (
                  <div key={serviceId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm font-medium text-foreground truncate mr-4">
                        {service.name}
                      </span>
                      <Badge variant="outline" className="h-4 text-[10px] shrink-0">
                        {service.pscCode}
                      </Badge>
                    </div>
                    {renderCompetencyBadge({level: competencyLevels[serviceId] || 'intermediate', serviceId: serviceId})}
                  </div>
                );
              })}
              {selectedCount > 10 && (
                <div className="text-sm text-muted-foreground mt-2">
                  +{selectedCount - 10} more competencies selected
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Legacy Search Controls (for non-enhanced views)
  function LegacySearchControls() {
    return (
      <div className="space-y-4">
        {/* Search input with suggestions */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search services, categories, keywords, or PSC codes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-background text-foreground"
            />
          </div>

          {/* Search suggestions */}
          {searchSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-2">Suggestions:</span>
              {searchSuggestions.map(suggestion => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchTerm(suggestion)}
                  className="h-6 text-xs"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          )}

          {/* Search stats */}
          {searchTerm.trim() && searchResults.stats.totalResults > 0 && (
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

        {/* Selected Services Summary */}
        {selectedCount > 0 && (
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300">Selected Competencies ({selectedCount})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from(selectedServices).slice(0, 5).map(serviceId => {
                const service = allServices.find(s => s.pscCode === serviceId);
                const level = competencyLevels[serviceId];
                const levels = {
                  beginner: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
                  intermediate: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300',
                  advanced: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300',
                  expert: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300'
                };

                return (
                  <div key={serviceId} className={`px-2 py-1 rounded-full text-xs font-medium ${levels[level]} flex items-center gap-1`}>
                    <span>{service?.name}</span>
                    <Badge variant="secondary" className="h-3 text-[9px]">
                      {service?.pscCode}
                    </Badge>
                    <span>• {level}</span>
                  </div>
                );
              })}
              {selectedCount > 5 && (
                <span className="px-2 py-1 rounded-full text-xs bg-muted text-muted-foreground">
                  +{selectedCount - 5} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Categorized View Component
  function renderCategorizedView() {
    return (
      <div className="space-y-4">
        {Object.entries(data.services_catalog).map(([categoryId, category]) => {
          const categoryServices = (category.competencies || category.services || []).filter(service =>
            !searchTerm || filteredServices.some(fs => fs.pscCode === service.pscCode)
          );

          if (categoryServices.length === 0) return null;

          const isExpanded = expandedCategories.has(categoryId);

          return (
            <div key={categoryId} className="border border-border rounded-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleCategory(categoryId)
                }}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{category.icon}</span>
                  <span className="font-semibold text-foreground">{category.category}</span>
                  <span className="text-sm text-muted-foreground">({categoryServices.length} services)</span>
                </div>
                {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>

              {isExpanded && (
                <div className="border-t border-border p-4 space-y-3">
                  {categoryServices.map(service => (
                    renderServiceCard({key: service.pscCode, service: {
                        ...service,
                        categoryId,
                        categoryName: category.category,
                        categoryIcon: category.icon,
                        categoryTags: category.search_tags
                      }})
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // List View Component
  function renderListView() {
    return (
      <div className="space-y-2">
        {(showSelected ?
          allServices.filter(s => selectedServices.has(s.pscCode)) :
          filteredServices
        ).map(service => (
          renderServiceCard({key: service.pscCode, service: service, compact: true})
        ))}
      </div>
    );
  }

  // Grid View Component
  function renderGridView() {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(showSelected ?
          allServices.filter(s => selectedServices.has(s.pscCode)) :
          filteredServices
        ).map(service => (
          renderServiceCard({key: service.pscCode, service: service})
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as any)} className="w-full">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="enhanced" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              Enhanced
            </TabsTrigger>
            <TabsTrigger value="categorized" className="text-xs">
              <Filter className="w-3 h-3 mr-1" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="list" className="text-xs">
              List
            </TabsTrigger>
            <TabsTrigger value="grid" className="text-xs">
              Grid
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={showSelected ? "default" : "outline"}
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowSelected(!showSelected)
              }}
            >
              Selected ({selectedCount})
            </Button>

            {selectedCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSelectedServices(new Set());
                  setCompetencyLevels({});
                }}
              >
                <X className="w-3 h-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Enhanced Search View */}
        <TabsContent value="enhanced" className="mt-6">
          {renderEnhancedSearchView()}
        </TabsContent>

        {/* Legacy Views with Enhanced Search */}
        <TabsContent value="categorized" className="mt-6">
          {renderLegacySearchControls()}
          {renderCategorizedView()}
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          {renderLegacySearchControls()}
          {renderListView()}
        </TabsContent>

        <TabsContent value="grid" className="mt-6">
          {renderLegacySearchControls()}
          {renderGridView()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ServiceCompetencySelector;