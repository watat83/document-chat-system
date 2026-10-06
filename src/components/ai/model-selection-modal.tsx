'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, RefreshCw, Zap, Clock, DollarSign, Star, ChevronRight, Eye, Globe, Search as SearchIcon, Image, Code, Layers, MessageSquare, Video, Edit3 } from 'lucide-react';
import { useDocumentChatStore } from '@/stores/document-chat-store';

interface ModelInfo {
  id?: string;
  name: string;
  displayName?: string;
  description: string;
  maxTokens: number;
  costPerPromptToken?: number;
  costPerCompletionToken?: number;
  costPer1KTokens?: { prompt: number; completion: number };
  features: string[];
  provider: string;
  tier: 'fast' | 'balanced' | 'powerful';
  quality?: number;
  speed?: number;
  cost?: number;
}

interface Provider {
  id: string;
  name: string;
  models: ModelInfo[];
}

interface ModelSelectionModalProps {
  selectedProvider: string;
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  providers?: Provider[];
  trigger?: React.ReactNode;
  mode?: 'text' | 'media';
  onModeChange?: (mode: 'text' | 'media') => void;
}

export function ModelSelectionModal({
  selectedProvider,
  selectedModel,
  onModelSelect,
  providers,
  trigger,
  mode = 'text',
  onModeChange
}: ModelSelectionModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Use optimized search from Zustand store
  const {
    search: { query, selectedTier, selectedCapabilities, filteredModels, isSearching },
    setSearchQuery,
    setSelectedTier,
    setSelectedCapabilities,
    toggleCapability,
    clearSearch,
    refreshModels: storeRefreshModels,
    forceRefreshModels
  } = useDocumentChatStore((state) => state.ai);

  // Load models when modal opens or provider changes
  useEffect(() => {
    if (open && selectedProvider) {
      if (!providers && useDocumentChatStore.getState().ai.models.length === 0) {
        void storeRefreshModels();
      }
    }
  }, [open, selectedProvider, providers, storeRefreshModels]);

  // Clear search when modal closes
  useEffect(() => {
    if (!open) {
      clearSearch();
    }
  }, [open, clearSearch]);

  // Old functions removed - now using optimized store functions

  const handleModelSelect = (modelId: string) => {
    onModelSelect(modelId);
    setOpen(false);
  };

  // Filter models based on current mode
  const getFilteredModelsForMode = (allModels: ModelInfo[]) => {
    if (mode === 'media') {
      // Show only media generation models (ImageRouter models)
      return allModels.filter(model => 
        model.provider === 'imagerouter' || 
        model.features?.includes('image-generation') ||
        model.features?.includes('video-generation') ||
        model.features?.includes('media-generation')
      );
    } else {
      // Show text generation models (exclude pure media models)
      return allModels.filter(model => 
        model.provider !== 'imagerouter' && 
        !model.features?.includes('media-generation')
      );
    }
  };

  // Get filtered models for current mode
  const currentModeModels = getFilteredModelsForMode(filteredModels);
  const allStoreModeModels = getFilteredModelsForMode(useDocumentChatStore.getState().ai.models);
  
  // Debug logging
  console.log(`🔍 Modal Debug - Mode: ${mode}, All models: ${filteredModels.length}, Current mode: ${currentModeModels.length}`);
  console.log(`🔍 Modal Debug - Store models for ${mode}:`, allStoreModeModels.length);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'fast': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'balanced': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'powerful': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  const formatCost = (cost: number | undefined | null) => {
    if (!cost || cost === 0) return 'Free';
    if (cost < 0.001) return `$${(cost * 1000).toFixed(3)}/1K`;
    return `$${cost.toFixed(3)}/1K`;
  };

  // toggleCapability now comes from store

  const getCapabilityIcon = (capability: string) => {
    switch (capability) {
      case 'vision': return <Eye className="h-3 w-3" />;
      case 'web-search': return <Globe className="h-3 w-3" />;
      case 'deep-research': return <SearchIcon className="h-3 w-3" />;
      case 'image-generation': return <Image className="h-3 w-3" />;
      case 'video-generation': return <Video className="h-3 w-3" />;
      case 'image-editing': return <Edit3 className="h-3 w-3" />;
      case 'media-generation': return <Image className="h-3 w-3" />;
      case 'code-generation': return <Code className="h-3 w-3" />;
      case 'multimodal': return <Layers className="h-3 w-3" />;
      default: return <Zap className="h-3 w-3" />;
    }
  };

  // Mode-specific capabilities
  const textCapabilities = ['vision', 'web-search', 'deep-research', 'code-generation', 'multimodal', 'function-calling', 'json-mode'];
  const mediaCapabilities = ['image-generation', 'video-generation', 'image-editing', 'media-generation'];
  
  const capabilityLabels: Record<string, string> = {
    'vision': 'Vision',
    'web-search': 'Web Search',
    'deep-research': 'Deep Research',
    'image-generation': 'Image Generation',
    'video-generation': 'Video Generation',
    'image-editing': 'Image Editing',
    'media-generation': 'Media Generation',
    'code-generation': 'Code Generation',
    'multimodal': 'Multimodal',
    'function-calling': 'Function Calling',
    'json-mode': 'JSON Mode',
    'streaming': 'Streaming',
    'chat': 'Chat'
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="w-full justify-between">
            <span>Select Model</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] sm:h-[85vh] flex flex-col p-3 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {mode === 'text' ? <MessageSquare className="h-5 w-5" /> : <Image className="h-5 w-5" />}
            Select AI Model - {mode === 'text' ? 'Text Generation' : 'Media Generation'}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                setLoading(true);
                try {
                  await forceRefreshModels();
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || isSearching}
              className="ml-auto"
            >
              <RefreshCw className={`h-4 w-4 ${loading || isSearching ? 'animate-spin' : ''}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        
        <div className="flex flex-col gap-3 sm:gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Mode Selection Tabs */}
          <Tabs value={mode} onValueChange={(value) => onModeChange?.(value as 'text' | 'media')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Text Generation</span>
                <span className="sm:hidden">Text</span>
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Image className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Media Generation</span>
                <span className="sm:hidden">Media</span>
              </TabsTrigger>
            </TabsList>
            
            {/* Text Generation Tab */}
            <TabsContent value="text" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
              {/* Text Mode Description */}
              <div className="text-xs sm:text-sm text-muted-foreground bg-blue-50 p-2 sm:p-3 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
                  <span className="font-medium text-blue-900">Text Generation Models</span>
                </div>
                <span className="hidden sm:inline">Chat, analysis, code generation, and document processing models from OpenAI, Anthropic, Google, and other providers.</span>
                <span className="sm:hidden">Chat, analysis, code generation, and document processing models.</span>
              </div>
              
              {/* Search and Filters for Text Tab */}
              <div className="flex flex-col gap-3 sm:gap-4 flex-shrink-0">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search text models..."
                    value={query}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 sm:pl-10 text-sm"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                {/* Tier Filters */}
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-medium self-center">Tier:</span>
                  <Button
                    variant={selectedTier === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('all')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    All
                  </Button>
                  <Button
                    variant={selectedTier === 'fast' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('fast')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    Fast
                  </Button>
                  <Button
                    variant={selectedTier === 'balanced' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('balanced')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    <span className="hidden sm:inline">Balanced</span>
                    <span className="sm:hidden">Bal</span>
                  </Button>
                  <Button
                    variant={selectedTier === 'powerful' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('powerful')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    <span className="hidden sm:inline">Powerful</span>
                    <span className="sm:hidden">Pow</span>
                  </Button>
                </div>
                
                {/* Text Capability Filters */}
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-medium self-center">Caps:</span>
                  {textCapabilities.map(capability => (
                    <Button
                      key={capability}
                      variant={selectedCapabilities.includes(capability) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleCapability(capability)}
                      className="flex items-center gap-1 h-7 px-2 sm:h-8 sm:px-3 text-xs"
                    >
                      {getCapabilityIcon(capability)}
                      <span className="hidden sm:inline">{capabilityLabels[capability]}</span>
                    </Button>
                  ))}
                  {selectedCapabilities.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCapabilities([])}
                      className="text-muted-foreground h-7 px-2 sm:h-8 sm:px-3 text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Text Models List */}
              <div className="flex-1 min-h-0">
                <ScrollArea className="h-[400px] sm:h-[500px] w-full">
                  <div className="space-y-2 pr-4 pb-4">
                    {loading || isSearching ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                        <span>{loading ? 'Loading models...' : 'Searching...'}</span>
                      </div>
                    ) : currentModeModels.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {allStoreModeModels.length === 0 
                          ? 'No models available' 
                          : 'No text models match your search'
                        }
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {currentModeModels.map((model) => (
                          <div
                            key={(model as any).name || model.id}
                            className={`p-3 sm:p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                              selectedModel === ((model as any).name || model.id) 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => handleModelSelect((model as any).name || model.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h3 className="font-medium text-sm sm:text-base truncate">{(model as any).displayName || model.name}</h3>
                                  <Badge variant="outline" className={`${getTierColor(model.tier)} text-xs`}>
                                    {model.tier}
                                  </Badge>
                                  {selectedModel === ((model as any).name || model.id) && (
                                    <Badge variant="default" className="bg-primary text-xs">
                                      ✓
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2">
                                  {model.description}
                                </p>
                                
                                {/* Capabilities */}
                                {model.features && model.features.length > 0 && (
                                  <div className="flex items-center gap-1 mb-2 flex-wrap">
                                    {model.features.filter(f => f !== 'chat' && f !== 'streaming').slice(0, 3).map(feature => (
                                      <Badge key={feature} variant="secondary" className="text-xs flex items-center gap-1 px-1 sm:px-2">
                                        {getCapabilityIcon(feature)}
                                        <span className="hidden sm:inline">{capabilityLabels[feature] || feature}</span>
                                      </Badge>
                                    ))}
                                    {model.features.filter(f => f !== 'chat' && f !== 'streaming').length > 3 && (
                                      <Badge variant="secondary" className="text-xs">
                                        +{model.features.filter(f => f !== 'chat' && f !== 'streaming').length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground flex-wrap">
                                  {model.maxTokens && model.maxTokens > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Zap className="h-3 w-3" />
                                      <span className="hidden sm:inline">{model.maxTokens?.toLocaleString()} tokens</span>
                                      <span className="sm:hidden">{(model.maxTokens / 1000).toFixed(0)}K</span>
                                    </div>
                                  )}
                                  {model.quality && (
                                    <div className="flex items-center gap-1">
                                      <Star className="h-3 w-3" />
                                      {model.quality}%
                                    </div>
                                  )}
                                  {model.speed && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {model.speed}%
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {formatCost(model.costPerPromptToken || (model as any).costPer1KTokens?.prompt || 0)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Text Model Count */}
              <div className="text-xs sm:text-sm text-muted-foreground text-center flex-shrink-0 px-2 mt-2">
                Showing {mode === 'text' ? currentModeModels.length : 0} of {mode === 'text' ? allStoreModeModels.length : 0} text models
              </div>
            </TabsContent>

            {/* Media Generation Tab */}
            <TabsContent value="media" className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
              {/* Media Mode Description */}
              <div className="text-xs sm:text-sm text-muted-foreground bg-purple-50 p-2 sm:p-3 rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-1">
                  <Image className="h-3 w-3 sm:h-4 sm:w-4 text-purple-600" />
                  <span className="font-medium text-purple-900">Media Generation Models</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 mt-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Image className="h-3 w-3" />
                    <span className="text-xs">Image</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    <span className="text-xs">Video</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Edit3 className="h-3 w-3" />
                    <span className="text-xs">Editing</span>
                  </div>
                </div>
              </div>
              
              {/* Search and Filters for Media Tab */}
              <div className="flex flex-col gap-3 sm:gap-4 flex-shrink-0">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search media models..."
                    value={query}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 sm:pl-10 text-sm"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                {/* Tier Filters */}
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-medium self-center">Tier:</span>
                  <Button
                    variant={selectedTier === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('all')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    All
                  </Button>
                  <Button
                    variant={selectedTier === 'fast' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('fast')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    Fast
                  </Button>
                  <Button
                    variant={selectedTier === 'balanced' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('balanced')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    <span className="hidden sm:inline">Balanced</span>
                    <span className="sm:hidden">Bal</span>
                  </Button>
                  <Button
                    variant={selectedTier === 'powerful' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTier('powerful')}
                    className="h-7 px-2 sm:h-8 sm:px-3 text-xs"
                  >
                    <span className="hidden sm:inline">Powerful</span>
                    <span className="sm:hidden">Pow</span>
                  </Button>
                </div>
                
                {/* Media Capability Filters */}
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-medium self-center">Caps:</span>
                  {mediaCapabilities.map(capability => (
                    <Button
                      key={capability}
                      variant={selectedCapabilities.includes(capability) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleCapability(capability)}
                      className="flex items-center gap-1 h-7 px-2 sm:h-8 sm:px-3 text-xs"
                    >
                      {getCapabilityIcon(capability)}
                      <span className="hidden sm:inline">{capabilityLabels[capability]}</span>
                    </Button>
                  ))}
                  {selectedCapabilities.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCapabilities([])}
                      className="text-muted-foreground h-7 px-2 sm:h-8 sm:px-3 text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Media Models List */}
              <div className="flex-1 min-h-0">
                <ScrollArea className="h-[400px] sm:h-[500px] w-full">
                  <div className="space-y-2 pr-4 pb-4">
                    {loading || isSearching ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                        <span>{loading ? 'Loading models...' : 'Searching...'}</span>
                      </div>
                    ) : currentModeModels.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <div className="space-y-2">
                          <Image className="h-12 w-12 mx-auto text-muted-foreground/50" />
                          <p>No media generation models available.</p>
                          <p className="text-xs">ImageRouter models will appear here when loaded.</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={async () => {
                              setLoading(true);
                              try {
                                await forceRefreshModels();
                              } finally {
                                setLoading(false);
                              }
                            }}
                            disabled={loading}
                            className="mt-2"
                          >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh Models
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {currentModeModels.map((model) => (
                          <div
                            key={(model as any).name || model.id}
                            className={`p-3 sm:p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                              selectedModel === ((model as any).name || model.id) 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => handleModelSelect((model as any).name || model.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h3 className="font-medium text-sm sm:text-base truncate">{(model as any).displayName || model.name}</h3>
                                  <Badge variant="outline" className={`${getTierColor(model.tier)} text-xs`}>
                                    {model.tier}
                                  </Badge>
                                  {selectedModel === ((model as any).name || model.id) && (
                                    <Badge variant="default" className="bg-primary text-xs">
                                      ✓
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2">
                                  {model.description}
                                </p>
                                
                                {/* Capabilities */}
                                {model.features && model.features.length > 0 && (
                                  <div className="flex items-center gap-1 mb-2 flex-wrap">
                                    {model.features.slice(0, 3).map(feature => (
                                      <Badge key={feature} variant="secondary" className="text-xs flex items-center gap-1 px-1 sm:px-2">
                                        {getCapabilityIcon(feature)}
                                        <span className="hidden sm:inline">{capabilityLabels[feature] || feature}</span>
                                      </Badge>
                                    ))}
                                    {model.features.length > 3 && (
                                      <Badge variant="secondary" className="text-xs">
                                        +{model.features.length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-2 sm:gap-4 text-xs text-muted-foreground flex-wrap">
                                  {model.quality && (
                                    <div className="flex items-center gap-1">
                                      <Star className="h-3 w-3" />
                                      {model.quality}%
                                    </div>
                                  )}
                                  {model.speed && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {model.speed}%
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {formatCost(model.costPerPromptToken || (model as any).costPer1KTokens?.prompt || 0)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Media Model Count */}
              <div className="text-xs sm:text-sm text-muted-foreground text-center flex-shrink-0 px-2 mt-2">
                Showing {mode === 'media' ? currentModeModels.length : 0} of {mode === 'media' ? allStoreModeModels.length : 0} media models
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}