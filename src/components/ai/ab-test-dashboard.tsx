'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useABTestManager } from '@/hooks/ai/use-ab-test';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { 
  Zap, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  Users, 
  AlertCircle,
  CheckCircle,
  Trophy,
  Play,
  Pause,
  StopCircle
} from 'lucide-react';

export function ABTestDashboard({ demoMode = true }: { demoMode?: boolean }) {
  const { tests, isLoading, endTest, getWinner } = useABTestManager(demoMode);
  const [selectedTest, setSelectedTest] = useState<any>(null);
  const [winnerData, setWinnerData] = useState<any>(null);

  const handleGetWinner = async (testId: string) => {
    const winner = await getWinner(testId);
    setWinnerData(winner);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading A/B tests...</div>;
  }

  const activeTests = tests.filter(t => t.enabled);
  const completedTests = tests.filter(t => !t.enabled);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">A/B Testing Dashboard</h2>
        <p className="text-muted-foreground">
          Compare Vercel AI SDK performance with traditional AI services
        </p>
      </div>

      {/* Active Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Active Tests</CardTitle>
          <CardDescription>Currently running A/B tests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {activeTests.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                onSelect={() => setSelectedTest(test)}
                onEnd={() => endTest(test.id)}
                onGetWinner={() => handleGetWinner(test.id)}
              />
            ))}
            {activeTests.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No active A/B tests
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Test Details */}
      {selectedTest && (
        <TestDetails 
          test={selectedTest} 
          winnerData={winnerData}
        />
      )}

      {/* Completed Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Completed Tests</CardTitle>
          <CardDescription>Historical A/B test results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {completedTests.map((test) => (
              <CompletedTestCard
                key={test.id}
                test={test}
                onView={() => setSelectedTest(test)}
              />
            ))}
            {completedTests.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No completed tests yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TestCard({ test, onSelect, onEnd, onGetWinner }) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex-1 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-2">
          <h4 className="font-semibold">{test.name}</h4>
          <Badge variant="outline" className="text-xs">
            <Play className="w-3 h-3 mr-1" />
            Active
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{test.description}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>{test.variants.length} variants</span>
          <span>Started {new Date(test.startDate).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onGetWinner();
          }}
        >
          <Trophy className="w-4 h-4 mr-1" />
          Get Winner
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            onEnd();
          }}
        >
          <StopCircle className="w-4 h-4 mr-1" />
          End Test
        </Button>
      </div>
    </div>
  );
}

function CompletedTestCard({ test, onView }) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={onView}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold">{test.name}</h4>
          <Badge variant="secondary" className="text-xs">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{test.description}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>{test.variants.length} variants tested</span>
          <span>Ended {new Date(test.endDate).toLocaleDateString()}</span>
        </div>
      </div>
      <Button size="sm" variant="outline">
        View Results
      </Button>
    </div>
  );
}

function TestDetails({ test, winnerData }) {
  const metricsData = React.useMemo(() => {
    if (test.metrics) {
      return test.variants.map(variant => {
        const metrics = test.metrics.find(m => m.variantId === variant.id) || {};
        return {
          name: variant.name,
          provider: variant.provider,
          latency: metrics.averageLatency || 0,
          cost: metrics.averageCost || 0,
          tokensPerSecond: metrics.averageTokensPerSecond || 0,
          successRate: metrics.totalRequests > 0 
            ? (metrics.successfulRequests / metrics.totalRequests) * 100 
            : 0,
          satisfaction: metrics.userSatisfaction || 0,
          totalRequests: metrics.totalRequests || 0
        };
      });
    }
    return [];
  }, [test]);

  const radarData = metricsData.map(d => ({
    variant: d.name,
    performance: 100 - (d.latency / 10), // Normalize latency to 0-100
    cost: 100 - (d.cost * 1000), // Normalize cost to 0-100
    reliability: d.successRate,
    satisfaction: d.satisfaction,
    speed: d.tokensPerSecond / 10 // Normalize tokens/s to 0-100
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{test.name}</CardTitle>
        <CardDescription>{test.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
            <TabsTrigger value="winner">Winner Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {metricsData.map((variant) => (
                <Card key={variant.name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {variant.name}
                      </CardTitle>
                      <Badge variant={variant.provider === 'vercel' ? 'default' : 'secondary'}>
                        {variant.provider}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Requests</span>
                      <span className="font-medium">{variant.totalRequests}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Success Rate</span>
                      <span className="font-medium">{variant.successRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Avg Latency</span>
                      <span className="font-medium">{variant.latency.toFixed(0)}ms</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Avg Cost</span>
                      <span className="font-medium">${variant.cost.toFixed(4)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Latency Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Average Latency</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={metricsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="latency" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Tokens/Second Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tokens per Second</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={metricsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="tokensPerSecond" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Multi-Factor Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="variant" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    {test.variants.map((variant, index) => (
                      <Radar
                        key={variant.id}
                        name={variant.name}
                        dataKey={variant.name.toLowerCase().replace(' ', '_')}
                        stroke={index === 0 ? '#8884d8' : '#82ca9d'}
                        fill={index === 0 ? '#8884d8' : '#82ca9d'}
                        fillOpacity={0.6}
                      />
                    ))}
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="winner" className="space-y-4">
            {winnerData ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Winner: {winnerData.variant.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Confidence Level</span>
                    <div className="flex items-center gap-2">
                      <Progress value={winnerData.confidence} className="w-32" />
                      <span className="font-medium">{winnerData.confidence.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Performance Advantages</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        <li>• {winnerData.metrics.averageLatency.toFixed(0)}ms average latency</li>
                        <li>• {winnerData.metrics.successfulRequests} successful requests</li>
                        <li>• ${winnerData.metrics.averageCost.toFixed(4)} per request</li>
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Recommendation</h4>
                      <p className="text-sm text-muted-foreground">
                        Based on the test results, {winnerData.variant.provider} provider
                        shows {winnerData.confidence > 80 ? 'significant' : 'moderate'} performance
                        improvements for this use case.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mb-2" />
                  <p>Click &quot;Get Winner&quot; to analyze test results</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}