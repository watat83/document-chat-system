'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Settings, 
  Shield, 
  Zap, 
  DollarSign, 
  Clock, 
  Target, 
  Activity, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Brain,
  Gauge,
  PlayCircle,
  PauseCircle,
  RotateCcw,
  Save,
  Upload,
  Download,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Database,
  Network,
  Server,
  Cpu,
  BarChart3,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface RoutingConfig {
  id: string;
  organizationId?: string;
  strategy: 'COST_OPTIMIZED' | 'PERFORMANCE' | 'BALANCED' | 'CUSTOM';
  preferredProviders: string[];
  blockedProviders: string[];
  maxCostPerRequest: number;
  monthlyCostLimit: number;
  costAlertThreshold: number;
  maxLatency: number;
  minQualityScore: number;
  enableFallback: boolean;
  maxFallbackAttempts: number;
  fallbackDelay: number;
  abTestEnabled: boolean;
  abTestPercentage: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProviderConfig {
  provider: string;
  isEnabled: boolean;
  priority: number;
  costMultiplier: number;
  maxConcurrentRequests: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
  models: string[];
  features: string[];
}

interface SystemStatus {
  totalRequests: number;
  activeConfigs: number;
  healthyProviders: number;
  totalProviders: number;
  avgLatency: number;
  successRate: number;
  totalCost: number;
  costEfficiency: number;
  lastUpdated: Date;
}

  // Demo data
  const demoConfig: RoutingConfig = {
    id: 'system-config-1',
    organizationId: null,
    strategy: 'BALANCED',
    preferredProviders: ['openai', 'anthropic', 'google'],
    blockedProviders: [],
    maxCostPerRequest: 0.05,
    monthlyCostLimit: 10000,
    costAlertThreshold: 8000,
    maxLatency: 5000,
    minQualityScore: 0.8,
    enableFallback: true,
    maxFallbackAttempts: 3,
    fallbackDelay: 1000,
    abTestEnabled: true,
    abTestPercentage: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const demoProviders: ProviderConfig[] = [
    {
      provider: 'openai',
      isEnabled: true,
      priority: 10,
      costMultiplier: 1.0,
      maxConcurrentRequests: 100,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      models: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'],
      features: ['chat', 'completion', 'embedding'],
    },
    {
      provider: 'anthropic',
      isEnabled: true,
      priority: 9,
      costMultiplier: 1.1,
      maxConcurrentRequests: 80,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      features: ['chat', 'completion'],
    },
    {
      provider: 'google',
      isEnabled: true,
      priority: 8,
      costMultiplier: 0.8,
      maxConcurrentRequests: 60,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      models: ['gemini-pro', 'gemini-pro-vision'],
      features: ['chat', 'completion', 'vision'],
    },
    {
      provider: 'azure',
      isEnabled: false,
      priority: 7,
      costMultiplier: 1.0,
      maxConcurrentRequests: 50,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      models: ['gpt-35-turbo', 'gpt-4'],
      features: ['chat', 'completion'],
    },
  ];

  const demoSystemStatus: SystemStatus = {
    totalRequests: 45287,
    activeConfigs: 3,
    healthyProviders: 3,
    totalProviders: 4,
    avgLatency: 1247,
    successRate: 99.2,
    totalCost: 2847.52,
    costEfficiency: 89.3,
    lastUpdated: new Date(),
  };


export function RoutingConfigAdmin() {
  const [config, setConfig] = useState<RoutingConfig | null>(demoConfig);
  const [providers, setProviders] = useState<ProviderConfig[]>(demoProviders);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(demoSystemStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('routing');

  const handleConfigChange = (field: keyof RoutingConfig, value: any) => {
    if (config) {
      setConfig({ ...config, [field]: value });
      setHasUnsavedChanges(true);
    }
  };

  const handleProviderChange = (providerName: string, field: keyof ProviderConfig, value: any) => {
    setProviders(prev => 
      prev.map(p => 
        p.provider === providerName 
          ? { ...p, [field]: value }
          : p
      )
    );
    setHasUnsavedChanges(true);
  };

  const saveConfiguration = async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setHasUnsavedChanges(false);
      toast.success('Configuration saved successfully');
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const resetConfiguration = () => {
    setConfig(demoConfig);
    setProviders(demoProviders);
    setHasUnsavedChanges(false);
    toast.info('Configuration reset to defaults');
  };

  const exportConfiguration = () => {
    const exportData = {
      config,
      providers,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `routing-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Configuration exported');
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'openai': return <Brain className="w-4 h-4" />;
      case 'anthropic': return <Target className="w-4 h-4" />;
      case 'google': return <Activity className="w-4 h-4" />;
      case 'azure': return <Shield className="w-4 h-4" />;
      default: return <Server className="w-4 h-4" />;
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'openai': return 'bg-green-500';
      case 'anthropic': return 'bg-purple-500';
      case 'google': return 'bg-yellow-500';
      case 'azure': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case 'COST_OPTIMIZED': return 'Minimize costs while maintaining acceptable quality';
      case 'PERFORMANCE': return 'Optimize for lowest latency and highest reliability';
      case 'BALANCED': return 'Balance cost, performance, and quality';
      case 'CUSTOM': return 'Use custom routing rules and weights';
      default: return 'Unknown strategy';
    }
  };

  if (!config || !systemStatus) {
    return <div className="flex items-center justify-center p-8">Loading configuration...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-500" />
            AI Routing Configuration
          </h2>
          <p className="text-muted-foreground">
            System-wide controls for AI provider routing and performance optimization
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={systemStatus.successRate > 95 ? "default" : "destructive"}>
            {systemStatus.healthyProviders}/{systemStatus.totalProviders} Providers Healthy
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportConfiguration}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetConfiguration}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button 
            onClick={saveConfiguration}
            disabled={!hasUnsavedChanges || isLoading}
          >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Unsaved Changes Alert */}
      {hasUnsavedChanges && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Please save your configuration before navigating away.
          </AlertDescription>
        </Alert>
      )}

      {/* System Status */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.totalRequests.toLocaleString()}</div>
            <div className="text-xs text-green-600">+5.2% from last hour</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.successRate}%</div>
            <div className="text-xs text-green-600">Excellent</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.avgLatency}ms</div>
            <div className="text-xs text-green-600">Within target</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.costEfficiency}%</div>
            <div className="text-xs text-green-600">Optimized</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="routing">Routing Strategy</TabsTrigger>
          <TabsTrigger value="providers">Provider Settings</TabsTrigger>
          <TabsTrigger value="limits">Limits & Thresholds</TabsTrigger>
          <TabsTrigger value="advanced">Advanced Config</TabsTrigger>
        </TabsList>

        <TabsContent value="routing" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Routing Strategy</CardTitle>
                <CardDescription>Select how requests should be routed to AI providers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Strategy</Label>
                  <Select 
                    value={config.strategy} 
                    onValueChange={(value) => handleConfigChange('strategy', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COST_OPTIMIZED">Cost Optimized</SelectItem>
                      <SelectItem value="PERFORMANCE">Performance</SelectItem>
                      <SelectItem value="BALANCED">Balanced</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {getStrategyDescription(config.strategy)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Preferred Providers</Label>
                  <div className="space-y-2">
                    {providers.map((provider, index) => (
                      <div key={provider.provider} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getProviderColor(provider.provider)}`} />
                          {getProviderIcon(provider.provider)}
                          <span className="font-medium capitalize">{provider.provider}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Priority:</Label>
                          <Select 
                            value={String(provider.priority)} 
                            onValueChange={(value) => handleProviderChange(provider.provider, 'priority', parseInt(value))}
                          >
                            <SelectTrigger className="w-16">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(priority => (
                                <SelectItem key={priority} value={String(priority)}>
                                  {priority}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="enable-fallback"
                      checked={config.enableFallback}
                      onCheckedChange={(checked) => handleConfigChange('enableFallback', checked)}
                    />
                    <Label htmlFor="enable-fallback">Enable Fallback</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically fallback to other providers if the primary fails
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>A/B Testing</CardTitle>
                <CardDescription>Configure routing experiments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="ab-testing"
                      checked={config.abTestEnabled}
                      onCheckedChange={(checked) => handleConfigChange('abTestEnabled', checked)}
                    />
                    <Label htmlFor="ab-testing">Enable A/B Testing</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Test different routing strategies with a subset of users
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Test Percentage</Label>
                  <Input
                    type="number"
                    value={config.abTestPercentage}
                    onChange={(e) => handleConfigChange('abTestPercentage', parseInt(e.target.value))}
                    min="0"
                    max="100"
                    disabled={!config.abTestEnabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    Percentage of requests to include in A/B tests
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Fallback Configuration</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Max Attempts</Label>
                      <Input
                        type="number"
                        value={config.maxFallbackAttempts}
                        onChange={(e) => handleConfigChange('maxFallbackAttempts', parseInt(e.target.value))}
                        min="1"
                        max="10"
                        disabled={!config.enableFallback}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Delay (ms)</Label>
                      <Input
                        type="number"
                        value={config.fallbackDelay}
                        onChange={(e) => handleConfigChange('fallbackDelay', parseInt(e.target.value))}
                        min="0"
                        max="10000"
                        disabled={!config.enableFallback}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <div className="grid gap-4">
            {providers.map((provider) => (
              <Card key={provider.provider}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getProviderColor(provider.provider)}`} />
                    {getProviderIcon(provider.provider)}
                    <span className="capitalize">{provider.provider}</span>
                    <Badge variant={provider.isEnabled ? "default" : "secondary"}>
                      {provider.isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <div className="flex items-center space-x-2">
                        <Switch 
                          checked={provider.isEnabled}
                          onCheckedChange={(checked) => handleProviderChange(provider.provider, 'isEnabled', checked)}
                        />
                        <Label className="text-sm">
                          {provider.isEnabled ? 'Enabled' : 'Disabled'}
                        </Label>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Input
                        type="number"
                        value={provider.priority}
                        onChange={(e) => handleProviderChange(provider.provider, 'priority', parseInt(e.target.value))}
                        min="1"
                        max="10"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Cost Multiplier</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={provider.costMultiplier}
                        onChange={(e) => handleProviderChange(provider.provider, 'costMultiplier', parseFloat(e.target.value))}
                        min="0.1"
                        max="10"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Max Concurrent</Label>
                      <Input
                        type="number"
                        value={provider.maxConcurrentRequests}
                        onChange={(e) => handleProviderChange(provider.provider, 'maxConcurrentRequests', parseInt(e.target.value))}
                        min="1"
                        max="1000"
                      />
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-2">
                    <Label>Supported Models</Label>
                    <div className="flex flex-wrap gap-2">
                      {provider.models.map(model => (
                        <Badge key={model} variant="outline">
                          {model}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2 mt-4">
                    <Label>Features</Label>
                    <div className="flex flex-wrap gap-2">
                      {provider.features.map(feature => (
                        <Badge key={feature} variant="secondary">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="limits" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cost Controls</CardTitle>
                <CardDescription>Set limits and thresholds for AI spending</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Max Cost Per Request ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.maxCostPerRequest}
                    onChange={(e) => handleConfigChange('maxCostPerRequest', parseFloat(e.target.value))}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum allowed cost for a single AI request
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Monthly Cost Limit ($)</Label>
                  <Input
                    type="number"
                    value={config.monthlyCostLimit}
                    onChange={(e) => handleConfigChange('monthlyCostLimit', parseInt(e.target.value))}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Monthly spending limit for AI services
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Cost Alert Threshold ($)</Label>
                  <Input
                    type="number"
                    value={config.costAlertThreshold}
                    onChange={(e) => handleConfigChange('costAlertThreshold', parseInt(e.target.value))}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Send alert when monthly costs reach this threshold
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Limits</CardTitle>
                <CardDescription>Configure performance and quality thresholds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Max Latency (ms)</Label>
                  <Input
                    type="number"
                    value={config.maxLatency}
                    onChange={(e) => handleConfigChange('maxLatency', parseInt(e.target.value))}
                    min="100"
                    max="30000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum acceptable response time
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Min Quality Score</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.minQualityScore}
                    onChange={(e) => handleConfigChange('minQualityScore', parseFloat(e.target.value))}
                    min="0"
                    max="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum required quality score (0-1)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Circuit Breaker Settings</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Failure Threshold</Label>
                      <Input
                        type="number"
                        value={5}
                        min="1"
                        max="20"
                        readOnly
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Timeout (ms)</Label>
                      <Input
                        type="number"
                        value={60000}
                        min="5000"
                        max="300000"
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Configuration</CardTitle>
              <CardDescription>Raw configuration and emergency controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Configuration JSON</Label>
                <Textarea
                  value={JSON.stringify(config, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setConfig(parsed);
                      setHasUnsavedChanges(true);
                    } catch (error) {
                      // Invalid JSON, ignore
                    }
                  }}
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Emergency Controls</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="w-full">
                    <Shield className="w-4 h-4 mr-2" />
                    Reset Circuit Breakers
                  </Button>
                  <Button variant="outline" className="w-full">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Clear Cache
                  </Button>
                  <Button variant="outline" className="w-full">
                    <PauseCircle className="w-4 h-4 mr-2" />
                    Pause All Requests
                  </Button>
                  <Button variant="destructive" className="w-full">
                    <XCircle className="w-4 h-4 mr-2" />
                    Emergency Stop
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}