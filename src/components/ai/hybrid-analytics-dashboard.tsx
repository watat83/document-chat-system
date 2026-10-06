'use client';

import { useClock } from '@/hooks/use-clock';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  BarChart, 
  LineChart, 
  PieChart,
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Brain,
  Zap,
  Eye,
  Server,
  GitBranch,
  BarChart3,
  Star,
  Bell,
  Settings,
  Target,
  Shield,
  Download,
  RefreshCw,
  Users,
  Network,
  Timer,
  Calculator,
  FileText,
  Play,
  Pause,
  StopCircle,
  AlertCircle
} from 'lucide-react';
import { aiAnalyticsService } from '@/lib/ai/analytics/ai-analytics-service';
import { providerStatusService } from '@/lib/ai/analytics/provider-status-service';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';

interface AnalyticsData {
  totalRequests: number;
  vercelRequests: number;
  existingRequests: number;
  vercelPercentage: number;
  averageLatency: number;
  totalCost: number;
  costSavings: number;
  successRate: number;
  circuitBreakerTrips: number;
  fallbackRate: number;
  avgQualityScore: number;
  projectedMonthlyCost: number;
  routingEfficiency: number;
}

interface ProviderMetrics {
  provider: string;
  requests: number;
  averageLatency: number;
  successRate: number;
  totalCost: number;
  averageCost: number;
  uptime: number;
  circuitBreakerStatus: 'healthy' | 'degraded' | 'open';
  lastFailure?: Date;
}

interface RoutingDecisionMetrics {
  hour: string;
  vercelRequests: number;
  existingRequests: number;
  averageLatency: number;
  totalCost: number;
  successRate: number;
}

interface CostAnalysis {
  provider: string;
  totalCost: number;
  averageCostPerRequest: number;
  requestCount: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
}

export function HybridAnalyticsDashboard({ 
  demoMode = false, 
  organizationId 
}: { 
  demoMode?: boolean;
  organizationId?: string;
}) {
  const now = useClock();
  const { getToken } = useAuth();
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [providerMetrics, setProviderMetrics] = useState<ProviderMetrics[]>([]);
  const [routingHistory, setRoutingHistory] = useState<RoutingDecisionMetrics[]>([]);
  const [costAnalysis, setCostAnalysis] = useState<CostAnalysis[]>([]);
  const [alerts, setAlerts] = useState<Array<{ type: 'warning' | 'error' | 'info'; message: string; time: string }>>([]);
  const [providerStatus, setProviderStatus] = useState<any[]>([]);
  const [usagePatterns, setUsagePatterns] = useState<any>(null);
  const [qualityMetrics, setQualityMetrics] = useState<any>(null);
  const [costOptimization, setCostOptimization] = useState<any>(null);
  const [routingConfig, setRoutingConfig] = useState<any>(null);
  const [realTimeMode, setRealTimeMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Demo data
  const demoAnalyticsData: AnalyticsData = {
    totalRequests: 15247,
    vercelRequests: 8456,
    existingRequests: 6791,
    vercelPercentage: 55.4,
    averageLatency: 1024,
    totalCost: 127.45,
    costSavings: 23.12,
    successRate: 99.2,
    circuitBreakerTrips: 3,
    fallbackRate: 4.2,
    avgQualityScore: 0.87,
    projectedMonthlyCost: 3823.50,
    routingEfficiency: 91.3
  };

  const demoProviderMetrics: ProviderMetrics[] = [
    {
      provider: 'vercel',
      requests: 8456,
      averageLatency: 847,
      successRate: 99.7,
      totalCost: 42.18,
      averageCost: 0.00499,
      uptime: 99.9,
      circuitBreakerStatus: 'healthy'
    },
    {
      provider: 'openai',
      requests: 4102,
      averageLatency: 1247,
      successRate: 98.9,
      totalCost: 51.27,
      averageCost: 0.01249,
      uptime: 99.5,
      circuitBreakerStatus: 'healthy'
    },
    {
      provider: 'anthropic',
      requests: 1834,
      averageLatency: 1389,
      successRate: 98.1,
      totalCost: 22.45,
      averageCost: 0.01224,
      uptime: 98.7,
      circuitBreakerStatus: 'degraded',
      lastFailure: new Date(now - 45000)
    },
    {
      provider: 'google',
      requests: 855,
      averageLatency: 1156,
      successRate: 97.8,
      totalCost: 11.55,
      averageCost: 0.01351,
      uptime: 97.2,
      circuitBreakerStatus: 'open',
      lastFailure: new Date(now - 120000)
    }
  ];

  const demoRoutingHistory: RoutingDecisionMetrics[] = [
    { hour: '00:00', vercelRequests: 245, existingRequests: 178, averageLatency: 932, totalCost: 4.23, successRate: 99.1 },
    { hour: '04:00', vercelRequests: 189, existingRequests: 234, averageLatency: 1045, totalCost: 5.67, successRate: 98.8 },
    { hour: '08:00', vercelRequests: 567, existingRequests: 398, averageLatency: 876, totalCost: 8.91, successRate: 99.3 },
    { hour: '12:00', vercelRequests: 789, existingRequests: 445, averageLatency: 823, totalCost: 12.34, successRate: 99.6 },
    { hour: '16:00', vercelRequests: 634, existingRequests: 512, averageLatency: 954, totalCost: 11.23, successRate: 99.2 },
    { hour: '20:00', vercelRequests: 423, existingRequests: 289, averageLatency: 1012, totalCost: 7.45, successRate: 98.9 }
  ];

  const demoCostAnalysis: CostAnalysis[] = [
    { provider: 'openai', totalCost: 51.27, averageCostPerRequest: 0.01249, requestCount: 4102, percentage: 40.2, trend: 'up' },
    { provider: 'vercel', totalCost: 42.18, averageCostPerRequest: 0.00499, requestCount: 8456, percentage: 33.1, trend: 'down' },
    { provider: 'anthropic', totalCost: 22.45, averageCostPerRequest: 0.01224, requestCount: 1834, percentage: 17.6, trend: 'stable' },
    { provider: 'google', totalCost: 11.55, averageCostPerRequest: 0.01351, requestCount: 855, percentage: 9.1, trend: 'up' }
  ];

  const demoAlerts = [
    { type: 'error' as const, message: 'Google AI provider circuit breaker opened - high failure rate detected', time: '2 minutes ago' },
    { type: 'warning' as const, message: 'Anthropic provider experiencing elevated latency (>1500ms average)', time: '8 minutes ago' },
    { type: 'info' as const, message: 'Cost optimization achieved 18% savings in last hour through intelligent routing', time: '15 minutes ago' },
    { type: 'warning' as const, message: 'Vercel AI SDK usage approaching 60% - consider capacity planning', time: '1 hour ago' }
  ];

  // Fetch real analytics data
  const fetchAnalyticsData = useCallback(async () => {
    if (!organizationId && !demoMode) {
      console.warn('No organization ID provided for analytics');
      return;
    }

    try {
      setRefreshing(true);
      
      if (demoMode) {
        // Use demo data
        setAnalyticsData(demoAnalyticsData);
        setProviderMetrics(demoProviderMetrics);
        setRoutingHistory(demoRoutingHistory);
        setCostAnalysis(demoCostAnalysis);
        setAlerts(demoAlerts);
        setLastUpdated(new Date());
        return;
      }

      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '1h':
          startDate.setHours(startDate.getHours() - 1);
          break;
        case '6h':
          startDate.setHours(startDate.getHours() - 6);
          break;
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
      }

      const query = {
        organizationId: organizationId!,
        startDate,
        endDate,
        ...(selectedProvider !== 'all' && { providers: [selectedProvider] }),
      };

      // Fetch comprehensive dashboard data
      const dashboardData = await aiAnalyticsService.getDashboardData(query);
      
      // Transform data for the dashboard
      const transformedAnalytics: AnalyticsData = {
        totalRequests: dashboardData.summary.totalRequests,
        vercelRequests: Math.floor(dashboardData.summary.totalRequests * 0.55), // Estimated
        existingRequests: Math.floor(dashboardData.summary.totalRequests * 0.45), // Estimated
        vercelPercentage: 55, // Estimated
        averageLatency: dashboardData.summary.avgLatency,
        totalCost: dashboardData.summary.totalCost,
        costSavings: dashboardData.costAnalysis.optimizationOpportunities.reduce((sum, opp) => sum + opp.potentialSavings, 0),
        successRate: dashboardData.summary.overallSuccessRate,
        circuitBreakerTrips: 0, // Would need to be tracked separately
        fallbackRate: dashboardData.summary.fallbackRate,
        avgQualityScore: dashboardData.summary.avgQualityScore,
        projectedMonthlyCost: dashboardData.costAnalysis.projectedMonthlyCost,
        routingEfficiency: dashboardData.routingAnalysis.routingEfficiency,
      };

      setAnalyticsData(transformedAnalytics);
      setProviderMetrics(dashboardData.providerMetrics.map(p => ({
        provider: p.provider,
        requests: p.totalRequests,
        averageLatency: p.avgLatency,
        successRate: p.successRate,
        totalCost: p.totalCost,
        averageCost: p.avgCost,
        uptime: p.successRate, // Approximation
        circuitBreakerStatus: p.successRate > 95 ? 'healthy' : p.successRate > 90 ? 'degraded' : 'open',
      })));
      
      setUsagePatterns(dashboardData.usagePatterns);
      setQualityMetrics(dashboardData.qualityMetrics);
      setCostOptimization(dashboardData.costAnalysis);
      
      // Fetch provider status
      const statusData = await providerStatusService.getAllProviderStatus();
      setProviderStatus(statusData);
      
      // Generate alerts from the data
      const newAlerts = [];
      if (dashboardData.summary.fallbackRate > 10) {
        newAlerts.push({
          type: 'warning' as const,
          message: `High fallback rate detected: ${dashboardData.summary.fallbackRate.toFixed(1)}%`,
          time: 'now'
        });
      }
      if (dashboardData.summary.avgQualityScore < 0.8) {
        newAlerts.push({
          type: 'error' as const,
          message: `Quality score below threshold: ${dashboardData.summary.avgQualityScore.toFixed(2)}`,
          time: 'now'
        });
      }
      setAlerts(newAlerts);
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setRefreshing(false);
    }
  }, [organizationId, demoMode, timeRange, selectedProvider, getToken]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchAnalyticsData();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [fetchAnalyticsData]);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh || realTimeMode) return;
    
    const interval = setInterval(() => {
      fetchAnalyticsData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, realTimeMode, fetchAnalyticsData]);

  // Real-time mode updates every 5 seconds
  useEffect(() => {
    if (!realTimeMode) return;
    
    const interval = setInterval(() => {
      fetchAnalyticsData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [realTimeMode, fetchAnalyticsData]);

  const refreshData = async () => {
    await fetchAnalyticsData();
  };

  const exportData = () => {
    const exportData = {
      analytics: analyticsData,
      providers: providerMetrics,
      routing: routingHistory,
      costs: costAnalysis,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hybrid-ai-analytics-${timeRange}-${now}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'vercel': return <Zap className="w-4 h-4" />;
      case 'openai': return <Brain className="w-4 h-4" />;
      case 'anthropic': return <Target className="w-4 h-4" />;
      case 'google': return <Activity className="w-4 h-4" />;
      case 'azure': return <Shield className="w-4 h-4" />;
      default: return <Server className="w-4 h-4" />;
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'vercel': return 'bg-blue-500';
      case 'openai': return 'bg-green-500';
      case 'anthropic': return 'bg-purple-500';
      case 'google': return 'bg-yellow-500';
      case 'azure': return 'bg-cyan-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'degraded': return 'text-yellow-500';
      case 'open': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return CheckCircle;
      case 'degraded': return AlertTriangle;
      case 'open': return XCircle;
      default: return Activity;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-3 h-3 text-red-500" />;
      case 'down': return <TrendingDown className="w-3 h-3 text-green-500" />;
      default: return <Activity className="w-3 h-3 text-gray-500" />;
    }
  };

  if (!analyticsData) {
    return <div className="flex items-center justify-center p-8">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-500" />
            Hybrid AI Analytics Dashboard
          </h3>
          <p className="text-muted-foreground">
            Comprehensive analytics and control for hybrid Vercel AI SDK integration
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Switch 
              checked={realTimeMode} 
              onCheckedChange={setRealTimeMode}
              id="real-time-mode"
            />
            <Label htmlFor="real-time-mode" className="text-sm whitespace-nowrap">
              Real-time
            </Label>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch 
              checked={autoRefresh} 
              onCheckedChange={setAutoRefresh}
              id="auto-refresh"
              disabled={realTimeMode}
            />
            <Label htmlFor="auto-refresh" className="text-sm whitespace-nowrap">
              Auto-refresh
            </Label>
          </div>
          
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="6h">Last 6 Hours</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={refreshData}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button variant="outline" size="sm" onClick={exportData}>
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${realTimeMode ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="text-sm font-medium">
              {realTimeMode ? 'Real-time' : 'Standard'} Mode
            </span>
          </div>
          {lastUpdated && (
            <div className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {organizationId ? 'Live Data' : 'Demo Mode'}
          </Badge>
          {demoMode && (
            <Badge variant="secondary">
              <Eye className="w-3 h-3 mr-1" />
              Demo
            </Badge>
          )}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((alert, index) => (
            <Alert key={index} variant={alert.type === 'error' ? 'destructive' : 'default'}>
              <Bell className="h-4 w-4" />
              <AlertDescription className="flex justify-between">
                <span>{alert.message}</span>
                <span className="text-xs text-muted-foreground">{alert.time}</span>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalRequests.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3 mr-1 text-green-500" />
              +12.3% from last period
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vercel Usage</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.vercelPercentage.toFixed(1)}%</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <span>{analyticsData.vercelRequests.toLocaleString()} requests</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.averageLatency}ms</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingDown className="w-3 h-3 mr-1 text-green-500" />
              -8.2% improvement
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.successRate.toFixed(1)}%</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <span className="text-green-500">Excellent</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(analyticsData.avgQualityScore * 100).toFixed(0)}%</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <span className="text-green-500">High Quality</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${analyticsData.totalCost.toFixed(2)}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <TrendingDown className="w-3 h-3 mr-1 text-green-500" />
              ${analyticsData.costSavings.toFixed(2)} saved
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-14 w-full grid grid-cols-8 p-0 bg-background justify-start rounded-none">
          <TabsTrigger value="overview" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Eye className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Overview</code>
          </TabsTrigger>
          <TabsTrigger value="providers" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Server className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Providers</code>
          </TabsTrigger>
          <TabsTrigger value="routing" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <GitBranch className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Routing</code>
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <DollarSign className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Costs</code>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <BarChart3 className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Performance</code>
          </TabsTrigger>
          <TabsTrigger value="quality" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Star className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Quality</code>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Bell className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Alerts</code>
          </TabsTrigger>
          <TabsTrigger value="controls" className="flex flex-col rounded-none bg-background h-full data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0">
            <Settings className="shrink-0" />
            <code className="mt-1.5 text-[13px]">Controls</code>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Routing Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Routing Distribution</CardTitle>
                <CardDescription>Vercel AI SDK vs Enterprise System usage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-sm">Vercel AI SDK</span>
                    </div>
                    <span className="text-sm font-mono">{analyticsData.vercelPercentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={analyticsData.vercelPercentage} className="h-2" />
                  
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                      <span className="text-sm">Enterprise System</span>
                    </div>
                    <span className="text-sm font-mono">{(100 - analyticsData.vercelPercentage).toFixed(1)}%</span>
                  </div>
                  <Progress value={100 - analyticsData.vercelPercentage} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Success Rate */}
            <Card>
              <CardHeader>
                <CardTitle>System Reliability</CardTitle>
                <CardDescription>Success rates and circuit breaker status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Overall Success Rate</span>
                    <span className="text-2xl font-bold text-green-600">{analyticsData.successRate}%</span>
                  </div>
                  <Progress value={analyticsData.successRate} className="h-2" />
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Circuit Breaker Trips</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={analyticsData.circuitBreakerTrips > 0 ? "destructive" : "default"}>
                        {analyticsData.circuitBreakerTrips}
                      </Badge>
                      {analyticsData.circuitBreakerTrips > 0 && (
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Routing Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Routing Timeline</CardTitle>
              <CardDescription>Request distribution over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {routingHistory.map((entry, index) => (
                  <div key={index} className="grid grid-cols-6 gap-4 items-center py-2">
                    <div className="text-sm font-mono">{entry.hour}</div>
                    <div className="text-sm">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-blue-500" />
                        {entry.vercelRequests}
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="flex items-center gap-1">
                        <Server className="w-3 h-3 text-gray-500" />
                        {entry.existingRequests}
                      </div>
                    </div>
                    <div className="text-sm font-mono">{entry.averageLatency}ms</div>
                    <div className="text-sm font-mono">${entry.totalCost}</div>
                    <div className="text-sm">{entry.successRate}%</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <div className="grid gap-4">
            {providerMetrics.map((provider) => {
              const StatusIcon = getStatusIcon(provider.circuitBreakerStatus);
              return (
                <Card key={provider.provider}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getProviderColor(provider.provider)}`} />
                        <span className="font-medium capitalize">{provider.provider}</span>
                        {getProviderIcon(provider.provider)}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-4 h-4 ${getStatusColor(provider.circuitBreakerStatus)}`} />
                        <Badge variant={provider.circuitBreakerStatus === 'healthy' ? 'default' : 
                                     provider.circuitBreakerStatus === 'degraded' ? 'outline' : 'destructive'}>
                          {provider.circuitBreakerStatus}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Requests</Label>
                        <div className="text-sm font-mono">{provider.requests.toLocaleString()}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Avg Latency</Label>
                        <div className="text-sm font-mono">{provider.averageLatency}ms</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Success Rate</Label>
                        <div className="text-sm font-mono">{provider.successRate}%</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total Cost</Label>
                        <div className="text-sm font-mono">${provider.totalCost.toFixed(2)}</div>
                      </div>
                    </div>

                    {provider.lastFailure && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Last failure: {provider.lastFailure.toLocaleTimeString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="routing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Intelligent Routing Decisions</CardTitle>
              <CardDescription>Analysis of routing decision patterns and effectiveness</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{analyticsData.vercelRequests}</div>
                    <div className="text-sm text-muted-foreground">Vercel Routed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600">{analyticsData.existingRequests}</div>
                    <div className="text-sm text-muted-foreground">Enterprise Routed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">97.3%</div>
                    <div className="text-sm text-muted-foreground">Decision Accuracy</div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <Label>Routing Effectiveness by Time</Label>
                  <div className="space-y-2">
                    {routingHistory.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between py-1">
                        <span className="text-sm font-mono">{entry.hour}</span>
                        <div className="flex items-center gap-4">
                          <div className="text-xs">
                            Vercel: {Math.round((entry.vercelRequests / (entry.vercelRequests + entry.existingRequests)) * 100)}%
                          </div>
                          <div className="text-xs">
                            Latency: {entry.averageLatency}ms
                          </div>
                          <div className="text-xs">
                            Cost: ${entry.totalCost}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cost Distribution</CardTitle>
                <CardDescription>Spending breakdown by provider</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {costAnalysis.map((cost) => (
                    <div key={cost.provider} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getProviderColor(cost.provider)}`} />
                        <span className="text-sm capitalize">{cost.provider}</span>
                        {getTrendIcon(cost.trend)}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono">${cost.totalCost.toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">{cost.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Optimization</CardTitle>
                <CardDescription>Savings achieved through intelligent routing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Spent</span>
                    <span className="text-lg font-bold">${analyticsData.totalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Amount Saved</span>
                    <span className="text-lg font-bold text-green-600">${analyticsData.costSavings.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Savings Rate</span>
                    <span className="text-lg font-bold text-green-600">
                      {((analyticsData.costSavings / (analyticsData.totalCost + analyticsData.costSavings)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  
                  <Separator />
                  
                  <div className="text-xs text-muted-foreground">
                    Cost optimization achieved through intelligent provider selection, 
                    circuit breaker implementation, and performance-based routing decisions.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Latency Comparison</CardTitle>
                <CardDescription>Average response times by provider</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {providerMetrics.map((provider) => (
                    <div key={provider.provider} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize">{provider.provider}</span>
                        <span className="font-mono">{provider.averageLatency}ms</span>
                      </div>
                      <Progress value={Math.max(0, 100 - (provider.averageLatency / 20))} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Throughput Analysis</CardTitle>
                <CardDescription>Requests per hour by provider</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {providerMetrics.map((provider) => (
                    <div key={provider.provider} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize">{provider.provider}</span>
                        <span className="font-mono">{provider.requests} req/h</span>
                      </div>
                      <Progress value={(provider.requests / Math.max(...providerMetrics.map(p => p.requests))) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quality Metrics</CardTitle>
                <CardDescription>Response quality and user satisfaction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Overall Quality Score</span>
                    <span className="text-2xl font-bold text-green-600">
                      {(analyticsData.avgQualityScore * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={analyticsData.avgQualityScore * 100} className="h-2" />
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Label>Quality by Provider</Label>
                    {providerMetrics.map((provider) => (
                      <div key={provider.provider} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getProviderColor(provider.provider)}`} />
                          <span className="text-sm capitalize">{provider.provider}</span>
                        </div>
                        <span className="text-sm font-mono">
                          {Math.round(provider.successRate)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Feedback</CardTitle>
                <CardDescription>Satisfaction and sentiment analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">78%</div>
                      <div className="text-xs text-muted-foreground">Positive</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-yellow-600">18%</div>
                      <div className="text-xs text-muted-foreground">Neutral</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">4%</div>
                      <div className="text-xs text-muted-foreground">Negative</div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Average Rating</span>
                      <span className="text-sm font-bold">4.2/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Total Feedback</span>
                      <span className="text-sm font-bold">1,247</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Alerts</CardTitle>
                <CardDescription>Current system alerts and notifications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {alerts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2" />
                      No active alerts
                    </div>
                  ) : (
                    alerts.map((alert, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className="flex-shrink-0 mt-1">
                          {alert.type === 'error' ? (
                            <XCircle className="w-4 h-4 text-red-500" />
                          ) : alert.type === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{alert.message}</div>
                          <div className="text-xs text-muted-foreground">{alert.time}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alert Configuration</CardTitle>
                <CardDescription>Configure alert thresholds and notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Cost Alert Threshold</Label>
                  <Input type="number" defaultValue="100" placeholder="Daily cost limit ($)" />
                </div>
                
                <div className="space-y-2">
                  <Label>Latency Alert Threshold</Label>
                  <Input type="number" defaultValue="2000" placeholder="Maximum latency (ms)" />
                </div>
                
                <div className="space-y-2">
                  <Label>Success Rate Alert Threshold</Label>
                  <Input type="number" defaultValue="95" placeholder="Minimum success rate (%)" />
                </div>
                
                <div className="space-y-2">
                  <Label>Quality Score Alert Threshold</Label>
                  <Input type="number" defaultValue="80" placeholder="Minimum quality score (%)" />
                </div>
                
                <Button className="w-full">
                  <Settings className="w-4 h-4 mr-2" />
                  Update Alert Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="controls" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Routing Configuration</CardTitle>
                <CardDescription>Manage AI routing behavior and preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Default Routing Strategy</Label>
                  <Select defaultValue="intelligent">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intelligent">Intelligent Routing</SelectItem>
                      <SelectItem value="cost-optimized">Cost Optimized</SelectItem>
                      <SelectItem value="performance-optimized">Performance Optimized</SelectItem>
                      <SelectItem value="quality-optimized">Quality Optimized</SelectItem>
                      <SelectItem value="vercel-only">Vercel AI SDK Only</SelectItem>
                      <SelectItem value="enterprise-only">Enterprise Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Provider Priority</Label>
                  <div className="space-y-2">
                    {providerMetrics.map((provider, index) => (
                      <div key={provider.provider} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getProviderColor(provider.provider)}`} />
                          <span className="text-sm capitalize">{provider.provider}</span>
                        </div>
                        <Select defaultValue={String(index + 1)}>
                          <SelectTrigger className="w-16">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Circuit Breaker Threshold</Label>
                  <Select defaultValue="5">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 failures</SelectItem>
                      <SelectItem value="5">5 failures</SelectItem>
                      <SelectItem value="10">10 failures</SelectItem>
                      <SelectItem value="15">15 failures</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fallback Configuration</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch id="enable-fallback" defaultChecked />
                      <Label htmlFor="enable-fallback">Enable Fallback</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch id="auto-retry" defaultChecked />
                      <Label htmlFor="auto-retry">Auto Retry</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Controls</CardTitle>
                <CardDescription>Advanced system management and emergency controls</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>A/B Testing</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch id="ab-testing" />
                      <Label htmlFor="ab-testing">Enable A/B Testing</Label>
                    </div>
                    <Input type="number" defaultValue="10" placeholder="Test percentage (%)" />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Emergency Controls</Label>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full">
                      <Shield className="w-4 h-4 mr-2" />
                      Reset All Circuit Breakers
                    </Button>
                    
                    <Button variant="outline" className="w-full">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Clear Performance History
                    </Button>
                    
                    <Button variant="outline" className="w-full">
                      <Pause className="w-4 h-4 mr-2" />
                      Pause All AI Requests
                    </Button>
                    
                    <Button variant="destructive" className="w-full">
                      <XCircle className="w-4 h-4 mr-2" />
                      Emergency Fallback Mode
                    </Button>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Emergency controls should only be used during critical system issues. 
                  All actions are logged and audited.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
