'use client';

import { useClock } from '@/hooks/use-clock';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Brain,
  Zap,
  DollarSign,
  Shield,
  Clock,
  Activity,
  Target,
  BarChart3,
  Settings,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Cpu,
  Network,
  Timer,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface RoutingDecision {
  useVercel: boolean;
  provider: string;
  reasoningText: string;
  confidence: number;
  estimatedCost: number;
  estimatedLatency: number;
  fallbackChain: string[];
}

interface PerformanceMetrics {
  provider: string;
  averageLatency: number;
  successRate: number;
  averageCost: number;
  tokensPerSecond: number;
  requestCount: number;
}

interface CircuitBreakerStatus {
  provider: string;
  isOpen: boolean;
  failureCount: number;
  lastFailure?: Date;
}

export function IntelligentRoutingDashboard({ demoMode = true }: { demoMode?: boolean }) {
  const now = useClock();
  const [selectedOperation, setSelectedOperation] = useState('stream');
  const [taskComplexity, setTaskComplexity] = useState<'low' | 'medium' | 'high'>('medium');
  const [budgetRemaining, setBudgetRemaining] = useState([75]);
  const [latencyRequirement, setLatencyRequirement] = useState([2000]);
  const [complianceRequired, setComplianceRequired] = useState(false);
  const [costPriority, setCostPriority] = useState([0.5]);

  const [routingDecision, setRoutingDecision] = useState<RoutingDecision | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Demo data
  const demoPerformanceMetrics: PerformanceMetrics[] = [
    {
      provider: 'vercel',
      averageLatency: 850,
      successRate: 0.987,
      averageCost: 0.0031,
      tokensPerSecond: 45.2,
      requestCount: 1247
    },
    {
      provider: 'openai',
      averageLatency: 1250,
      successRate: 0.982,
      averageCost: 0.0025,
      tokensPerSecond: 32.1,
      requestCount: 2156
    },
    {
      provider: 'anthropic',
      averageLatency: 1400,
      successRate: 0.978,
      averageCost: 0.0029,
      tokensPerSecond: 28.7,
      requestCount: 891
    },
    {
      provider: 'google',
      averageLatency: 1150,
      successRate: 0.985,
      averageCost: 0.0022,
      tokensPerSecond: 35.4,
      requestCount: 743
    }
  ];

  const demoCircuitBreakers: CircuitBreakerStatus[] = [
    { provider: 'vercel', isOpen: false, failureCount: 0 },
    { provider: 'openai', isOpen: false, failureCount: 1 },
    { provider: 'anthropic', isOpen: false, failureCount: 0 },
    { provider: 'google', isOpen: true, failureCount: 5, lastFailure: new Date(now - 30000) },
    { provider: 'azure', isOpen: false, failureCount: 2 }
  ];

  const performanceMetrics = demoMode ? demoPerformanceMetrics : [];
  const circuitBreakers = demoMode ? demoCircuitBreakers : [];

  const makeRoutingDecision = async () => {
    setIsAnalyzing(true);

    // Simulate intelligent routing decision
    await new Promise(resolve => setTimeout(resolve, 800));

    const context = {
      operation: selectedOperation,
      taskComplexity,
      budgetRemaining: budgetRemaining[0],
      latencyRequirement: latencyRequirement[0],
      complianceRequired,
      costPriority: costPriority[0]
    };

    // Simulate decision logic
    let score = 0.5;

    // Operation type scoring
    if (selectedOperation === 'stream') score += 0.3;
    if (selectedOperation === 'chat') score += 0.2;
    if (selectedOperation === 'analysis') score -= 0.2;

    // Task complexity
    if (taskComplexity === 'low') score += 0.2;
    if (taskComplexity === 'high') score -= 0.3;

    // Budget considerations
    if (budgetRemaining[0] > 50) score += 0.1;
    if (budgetRemaining[0] < 20) score -= 0.3;

    // Latency requirements
    if (latencyRequirement[0] < 1000) score += 0.2;
    if (latencyRequirement[0] > 3000) score -= 0.1;

    // Compliance
    if (complianceRequired) score -= 0.4;

    // Cost priority
    score -= costPriority[0] * 0.3;

    const useVercel = score > 0.5;
    const confidence = Math.min(Math.abs(score - 0.5) * 2, 1);

    const reasons = [];
    if (selectedOperation === 'stream') reasons.push('Streaming optimized for Vercel AI SDK');
    if (taskComplexity === 'high') reasons.push('Complex tasks favor enterprise system');
    if (budgetRemaining[0] < 30) reasons.push('Budget constraints require cost optimization');
    if (latencyRequirement[0] < 1000) reasons.push('Low latency requirements favor Vercel');
    if (complianceRequired) reasons.push('Compliance requirements mandate enterprise system');
    if (costPriority[0] > 0.7) reasons.push('Cost priority favors enterprise providers');

    const decision: RoutingDecision = {
      useVercel,
      provider: useVercel ? 'vercel' : 'openai',
      reasoningText: reasons.length > 0 ? reasons.join(', ') : 'Balanced decision based on current parameters',
      confidence,
      estimatedCost: useVercel ? 0.0031 : 0.0025,
      estimatedLatency: useVercel ? 850 : 1250,
      fallbackChain: useVercel ? ['vercel', 'openai', 'anthropic'] : ['openai', 'anthropic', 'google']
    };

    setRoutingDecision(decision);
    setIsAnalyzing(false);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'vercel': return <Zap className="w-4 h-4" />;
      case 'openai': return <Brain className="w-4 h-4" />;
      case 'anthropic': return <Target className="w-4 h-4" />;
      case 'google': return <Activity className="w-4 h-4" />;
      case 'azure': return <Shield className="w-4 h-4" />;
      default: return <Cpu className="w-4 h-4" />;
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

  const getCircuitBreakerStatus = (provider: string) => {
    const breaker = circuitBreakers.find(cb => cb.provider === provider);
    if (!breaker) return { status: 'unknown', color: 'text-gray-500' };

    if (breaker.isOpen) return { status: 'open', color: 'text-red-500', icon: XCircle };
    if (breaker.failureCount > 0) return { status: 'degraded', color: 'text-yellow-500', icon: AlertTriangle };
    return { status: 'healthy', color: 'text-green-500', icon: CheckCircle };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="w-6 h-6 text-blue-500" />
            Intelligent Routing Dashboard
          </h3>
          <p className="text-muted-foreground">
            Real-time AI provider routing decisions based on performance, cost, and requirements
          </p>
        </div>

        <Button
          onClick={makeRoutingDecision}
          disabled={isAnalyzing}
          className="flex items-center gap-2"
        >
          {isAnalyzing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Target className="w-4 h-4" />
          )}
          {isAnalyzing ? 'Analyzing...' : 'Make Routing Decision'}
        </Button>
      </div>

      <Tabs defaultValue="decision" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="decision">Decision Engine</TabsTrigger>
          <TabsTrigger value="performance">Performance Metrics</TabsTrigger>
          <TabsTrigger value="circuit-breakers">Circuit Breakers</TabsTrigger>
          <TabsTrigger value="optimization">Cost vs Speed</TabsTrigger>
        </TabsList>

        <TabsContent value="decision" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Input Parameters */}
            <Card>
              <CardHeader>
                <CardTitle>Routing Parameters</CardTitle>
                <CardDescription>Configure request parameters for intelligent routing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Operation Type</Label>
                  <Select value={selectedOperation} onValueChange={setSelectedOperation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stream">Streaming</SelectItem>
                      <SelectItem value="chat">Chat</SelectItem>
                      <SelectItem value="analysis">Analysis</SelectItem>
                      <SelectItem value="generation">Generation</SelectItem>
                      <SelectItem value="embedding">Embedding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Task Complexity</Label>
                  <Select value={taskComplexity} onValueChange={(value: 'low' | 'medium' | 'high') => setTaskComplexity(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Budget Remaining</Label>
                    <span className="text-sm text-muted-foreground">${budgetRemaining[0]}</span>
                  </div>
                  <Slider
                    value={budgetRemaining}
                    onValueChange={setBudgetRemaining}
                    max={200}
                    min={5}
                    step={5}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Latency Requirement</Label>
                    <span className="text-sm text-muted-foreground">{latencyRequirement[0]}ms</span>
                  </div>
                  <Slider
                    value={latencyRequirement}
                    onValueChange={setLatencyRequirement}
                    max={5000}
                    min={500}
                    step={100}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={complianceRequired}
                    onChange={(e) => setComplianceRequired(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label>Compliance Required</Label>
                </div>
              </CardContent>
            </Card>

            {/* Routing Decision */}
            <Card>
              <CardHeader>
                <CardTitle>Routing Decision</CardTitle>
                <CardDescription>AI-powered routing recommendation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {routingDecision ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getProviderIcon(routingDecision.provider)}
                        <span className="font-medium">
                          {routingDecision.useVercel ? 'Vercel AI SDK' : 'Enterprise System'}
                        </span>
                      </div>
                      <Badge variant={routingDecision.useVercel ? "default" : "secondary"}>
                        {Math.round(routingDecision.confidence * 100)}% confidence
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <Label>Reasoning</Label>
                      <p className="text-sm text-muted-foreground">{routingDecision.reasoningText}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Estimated Cost</Label>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          <span className="text-sm font-mono">${routingDecision.estimatedCost.toFixed(4)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Estimated Latency</Label>
                        <div className="flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          <span className="text-sm font-mono">{routingDecision.estimatedLatency}ms</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Fallback Chain</Label>
                      <div className="flex items-center gap-1">
                        {routingDecision.fallbackChain.map((provider, index) => (
                          <React.Fragment key={provider}>
                            <div className="flex items-center gap-1">
                              {getProviderIcon(provider)}
                              <span className="text-xs">{provider}</span>
                            </div>
                            {index < routingDecision.fallbackChain.length - 1 && (
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Click &quot;Make Routing Decision&quot; to see intelligent routing in action</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4">
            {performanceMetrics.map((metrics) => (
              <Card key={metrics.provider}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getProviderColor(metrics.provider)}`} />
                      <span className="font-medium capitalize">{metrics.provider}</span>
                      {getProviderIcon(metrics.provider)}
                    </div>
                    <Badge variant="outline">{metrics.requestCount} requests</Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Avg Latency</Label>
                      <div className="text-sm font-mono">{metrics.averageLatency}ms</div>
                      <Progress value={Math.max(0, 100 - (metrics.averageLatency / 20))} className="h-1" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Success Rate</Label>
                      <div className="text-sm font-mono">{(metrics.successRate * 100).toFixed(1)}%</div>
                      <Progress value={metrics.successRate * 100} className="h-1" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Avg Cost</Label>
                      <div className="text-sm font-mono">${metrics.averageCost.toFixed(4)}</div>
                      <Progress value={Math.max(0, 100 - (metrics.averageCost * 25000))} className="h-1" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tokens/sec</Label>
                      <div className="text-sm font-mono">{metrics.tokensPerSecond}</div>
                      <Progress value={Math.min(100, (metrics.tokensPerSecond / 50) * 100)} className="h-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="circuit-breakers" className="space-y-4">
          <div className="grid gap-4">
            {circuitBreakers.map((breaker) => {
              const status = getCircuitBreakerStatus(breaker.provider);
              const StatusIcon = status.icon || CheckCircle;

              return (
                <Card key={breaker.provider}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getProviderColor(breaker.provider)}`} />
                        <span className="font-medium capitalize">{breaker.provider}</span>
                        {getProviderIcon(breaker.provider)}
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusIcon className={`w-4 h-4 ${status.color}`} />
                        <Badge variant={breaker.isOpen ? "destructive" : breaker.failureCount > 0 ? "outline" : "default"}>
                          {breaker.isOpen ? 'Circuit Open' : breaker.failureCount > 0 ? 'Degraded' : 'Healthy'}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-muted-foreground">
                      Failure count: {breaker.failureCount}/5
                      {breaker.lastFailure && (
                        <span className="ml-2">
                          Last failure: {breaker.lastFailure.toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    <Progress
                      value={(breaker.failureCount / 5) * 100}
                      className="h-1 mt-2"
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost vs Speed Optimization</CardTitle>
              <CardDescription>Fine-tune routing decisions based on cost and performance priorities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Cost Priority</Label>
                  <span className="text-sm text-muted-foreground">
                    {costPriority[0] < 0.3 ? 'Speed Focused' :
                     costPriority[0] > 0.7 ? 'Cost Focused' : 'Balanced'}
                  </span>
                </div>
                <Slider
                  value={costPriority}
                  onValueChange={setCostPriority}
                  max={1}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Speed Priority</span>
                  <span>Cost Priority</span>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    <Label>Speed Optimized</Label>
                  </div>
                  <Card className="p-3 bg-blue-50 border-blue-200">
                    <div className="text-sm">
                      <div>Provider: <strong>Vercel AI SDK</strong></div>
                      <div>Latency: <strong>~850ms</strong></div>
                      <div>Cost: <strong>$0.0031</strong></div>
                      <div>Tokens/sec: <strong>45.2</strong></div>
                    </div>
                  </Card>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-green-500" />
                    <Label>Cost Optimized</Label>
                  </div>
                  <Card className="p-3 bg-green-50 border-green-200">
                    <div className="text-sm">
                      <div>Provider: <strong>Google AI</strong></div>
                      <div>Latency: <strong>~1150ms</strong></div>
                      <div>Cost: <strong>$0.0022</strong></div>
                      <div>Tokens/sec: <strong>35.4</strong></div>
                    </div>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
