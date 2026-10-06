'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Settings, 
  Zap, 
  Shield, 
  DollarSign, 
  Clock, 
  Users, 
  Brain,
  Database,
  Cloud,
  Cpu,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Save,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-react';

interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  category: 'ai' | 'performance' | 'security' | 'billing' | 'ui';
  value: boolean | string | number;
  type: 'boolean' | 'string' | 'number' | 'select';
  options?: string[];
  defaultValue: boolean | string | number;
  impact: 'low' | 'medium' | 'high';
  requiresRestart?: boolean;
  environment?: 'development' | 'staging' | 'production' | 'all';
}

const DEMO_FLAGS: FeatureFlag[] = [
  // AI Features
  {
    key: 'useVercelForStreaming',
    name: 'Vercel AI SDK Streaming',
    description: 'Enable Vercel AI SDK for streaming operations with enhanced performance',
    category: 'ai',
    value: true,
    type: 'boolean',
    defaultValue: false,
    impact: 'high',
    environment: 'all'
  },
  {
    key: 'aiProviderFallback',
    name: 'AI Provider Fallback',
    description: 'Automatically fallback to secondary AI providers on failure',
    category: 'ai',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'high',
    environment: 'all'
  },
  {
    key: 'defaultAiProvider',
    name: 'Default AI Provider',
    description: 'Primary AI provider for new requests',
    category: 'ai',
    value: 'openai',
    type: 'select',
    options: ['openai', 'anthropic', 'google', 'azure'],
    defaultValue: 'openai',
    impact: 'medium',
    environment: 'all'
  },
  {
    key: 'aiCostOptimization',
    name: 'AI Cost Optimization',
    description: 'Enable intelligent cost-based provider routing',
    category: 'ai',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'medium',
    environment: 'all'
  },
  {
    key: 'documentChatRag',
    name: 'Document Chat RAG',
    description: 'Enable Retrieval-Augmented Generation for document chat',
    category: 'ai',
    value: true,
    type: 'boolean',
    defaultValue: false,
    impact: 'high',
    environment: 'all'
  },
  {
    key: 'aiResponseCaching',
    name: 'AI Response Caching',
    description: 'Cache AI responses to reduce costs and improve performance',
    category: 'ai',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'medium',
    environment: 'all'
  },
  
  // Performance Features
  {
    key: 'enableAdvancedCaching',
    name: 'Advanced Caching',
    description: 'Enable Redis-based caching for improved performance',
    category: 'performance',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'high',
    environment: 'all'
  },
  {
    key: 'cacheTtlSeconds',
    name: 'Cache TTL (seconds)',
    description: 'Default cache time-to-live in seconds',
    category: 'performance',
    value: 300,
    type: 'number',
    defaultValue: 300,
    impact: 'medium',
    environment: 'all'
  },
  {
    key: 'enableCompression',
    name: 'Response Compression',
    description: 'Enable gzip compression for API responses',
    category: 'performance',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'low',
    environment: 'production'
  },
  
  // Security Features
  {
    key: 'enableRateLimit',
    name: 'Rate Limiting',
    description: 'Enable API rate limiting to prevent abuse',
    category: 'security',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'high',
    environment: 'all'
  },
  {
    key: 'rateLimitPerMinute',
    name: 'Rate Limit (per minute)',
    description: 'Maximum requests per minute per user',
    category: 'security',
    value: 100,
    type: 'number',
    defaultValue: 100,
    impact: 'medium',
    environment: 'all'
  },
  {
    key: 'enableAuditLogging',
    name: 'Audit Logging',
    description: 'Log all user actions for security auditing',
    category: 'security',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'low',
    environment: 'all'
  },
  
  // Billing Features
  {
    key: 'enableUsageTracking',
    name: 'Usage Tracking',
    description: 'Track detailed usage metrics for billing',
    category: 'billing',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'high',
    environment: 'all'
  },
  {
    key: 'billingGracePeriod',
    name: 'Billing Grace Period (days)',
    description: 'Grace period before restricting over-limit usage',
    category: 'billing',
    value: 7,
    type: 'number',
    defaultValue: 7,
    impact: 'medium',
    environment: 'all'
  },
  
  // UI Features
  {
    key: 'enableDarkMode',
    name: 'Dark Mode Support',
    description: 'Enable dark mode theme switching',
    category: 'ui',
    value: true,
    type: 'boolean',
    defaultValue: true,
    impact: 'low',
    environment: 'all'
  }
];

const CATEGORY_ICONS = {
  ai: Brain,
  performance: Zap,
  security: Shield,
  billing: DollarSign,
  ui: Eye
};

const CATEGORY_COLORS = {
  ai: 'bg-purple-50 text-purple-700 border-purple-200',
  performance: 'bg-blue-50 text-blue-700 border-blue-200',
  security: 'bg-red-50 text-red-700 border-red-200',
  billing: 'bg-green-50 text-green-700 border-green-200',
  ui: 'bg-orange-50 text-orange-700 border-orange-200'
};

const IMPACT_COLORS = {
  low: 'bg-gray-50 text-gray-600',
  medium: 'bg-yellow-50 text-yellow-600',
  high: 'bg-red-50 text-red-600'
};

export function FeatureFlagManager({ organizationId, demoMode = true }: { organizationId: string; demoMode?: boolean }) {
  const { userId } = useAuth();
  const [flags, setFlags] = useState<FeatureFlag[]>(DEMO_FLAGS);
  const [originalFlags, setOriginalFlags] = useState<FeatureFlag[]>(DEMO_FLAGS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const hasChanges = flags.some((flag, index) => flag.value !== originalFlags[index]?.value);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filter flags based on category and search
  const filteredFlags = flags.filter(flag => {
    const matchesCategory = selectedCategory === 'all' || flag.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      flag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.key.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Group flags by category
  const flagsByCategory = filteredFlags.reduce((acc, flag) => {
    if (!acc[flag.category]) acc[flag.category] = [];
    acc[flag.category].push(flag);
    return acc;
  }, {} as Record<string, FeatureFlag[]>);

  const updateFlag = (key: string, value: boolean | string | number) => {
    setFlags(prev => prev.map(flag => 
      flag.key === key ? { ...flag, value } : flag
    ));
  };

  const resetFlags = () => {
    setFlags([...originalFlags]);
  };

  const saveFlags = async () => {
    if (demoMode) {
      setIsSaving(true);
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      setOriginalFlags([...flags]);
      setIsSaving(false);
      return;
    }

    // Real API call would go here
    try {
      setIsSaving(true);
      const response = await fetch('/api/v1/ai/feature-flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          flags: flags.reduce((acc, flag) => {
            acc[flag.key] = flag.value;
            return acc;
          }, {} as Record<string, any>)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save feature flags');
      }

      setOriginalFlags([...flags]);
    } catch (error) {
      console.error('Failed to save feature flags:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderFlagControl = (flag: FeatureFlag) => {
    const IconComponent = CATEGORY_ICONS[flag.category];

    return (
      <Card key={flag.key} className="transition-all hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className={`p-2 rounded-lg border ${CATEGORY_COLORS[flag.category]}`}>
                <IconComponent className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm">{flag.name}</h4>
                  <Badge variant="outline" className={`text-xs ${IMPACT_COLORS[flag.impact]}`}>
                    {flag.impact}
                  </Badge>
                  {flag.requiresRestart && (
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600">
                      Restart Required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{flag.description}</p>
                {showAdvanced && (
                  <div className="text-xs text-muted-foreground">
                    <code className="bg-gray-100 px-1 rounded">{flag.key}</code> | 
                    Default: <strong>{String(flag.defaultValue)}</strong> | 
                    Env: <strong>{flag.environment}</strong>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {flag.type === 'boolean' && (
                <Switch
                  checked={flag.value as boolean}
                  onCheckedChange={(checked) => updateFlag(flag.key, checked)}
                />
              )}
              
              {flag.type === 'number' && (
                <Input
                  type="number"
                  value={flag.value as number}
                  onChange={(e) => updateFlag(flag.key, parseInt(e.target.value) || 0)}
                  className="w-20 h-8 text-xs"
                />
              )}
              
              {flag.type === 'string' && (
                <Input
                  value={flag.value as string}
                  onChange={(e) => updateFlag(flag.key, e.target.value)}
                  className="w-32 h-8 text-xs"
                />
              )}
              
              {flag.type === 'select' && flag.options && (
                <Select
                  value={flag.value as string}
                  onValueChange={(value) => updateFlag(flag.key, value)}
                >
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {flag.options.map(option => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const getCategoryStats = () => {
    const stats = Object.entries(flagsByCategory).map(([category, categoryFlags]) => ({
      category,
      total: categoryFlags.length,
      enabled: categoryFlags.filter(f => f.type === 'boolean' ? f.value : true).length,
      icon: CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS]
    }));
    return stats;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-500" />
            Feature Flag Management
          </h2>
          <div className="text-muted-foreground flex items-center gap-2 mt-1">
            <span>Control AI features and system behavior at runtime</span>
            {demoMode && (
              <Badge variant="outline" className="text-xs">
                Demo Mode
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
            {showAdvanced ? 'Hide' : 'Show'} Advanced
          </Button>
          
          {hasChanges && (
            <>
              <Button variant="outline" size="sm" onClick={resetFlags}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
              <Button 
                size="sm" 
                onClick={saveFlags}
                disabled={isSaving}
              >
                <Save className="w-4 h-4 mr-1" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {getCategoryStats().map(({ category, total, enabled, icon: Icon }) => (
          <Card key={category} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedCategory(category)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium capitalize">{category}</p>
                  <p className="text-xs text-muted-foreground">
                    {enabled}/{total} enabled
                  </p>
                </div>
                <Icon className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search feature flags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="ai">AI Features</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="billing">Billing</SelectItem>
            <SelectItem value="ui">UI/UX</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Feature Flags */}
      <Tabs value={selectedCategory === 'all' ? 'grouped' : 'list'} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="grouped">Grouped View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        <TabsContent value="grouped" className="space-y-6">
          {Object.entries(flagsByCategory).map(([category, categoryFlags]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`p-2 rounded-lg border ${CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS]}`}>
                  {React.createElement(CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS], { className: "w-5 h-5" })}
                </div>
                <h3 className="text-lg font-semibold capitalize">{category} Features</h3>
                <Badge variant="outline">{categoryFlags.length} flags</Badge>
              </div>
              
              <div className="grid gap-3">
                {categoryFlags.map(renderFlagControl)}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="list" className="space-y-3">
          <ScrollArea className="h-[600px]">
            <div className="grid gap-3">
              {filteredFlags.map(renderFlagControl)}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Changes Summary */}
      {hasChanges && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <div>
                <p className="font-medium text-orange-800">Unsaved Changes</p>
                <p className="text-sm text-orange-600">
                  You have unsaved changes to your feature flags. Make sure to save your changes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}