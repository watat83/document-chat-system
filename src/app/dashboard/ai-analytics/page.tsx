import { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { HybridAnalyticsDashboard } from '@/components/ai/hybrid-analytics-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, BarChart3, Brain, DollarSign, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Analytics Dashboard - Document Chat System',
  description: 'Comprehensive analytics and monitoring for AI routing decisions, provider performance, and cost optimization',
};

export default async function AIAnalyticsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in/');
  }

  // In a real implementation, you would get the organization ID from the user's session
  const organizationId = 'demo-org-id';

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="w-8 h-8 text-blue-600" />
              AI Analytics Dashboard
            </h1>
            <p className="text-muted-foreground">
              Monitor AI routing decisions, provider performance, and cost optimization in real-time
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Activity className="w-3 h-3 mr-1" />
              System Healthy
            </Badge>
            <Badge variant="secondary">
              Phase 5 - Analytics & Monitoring
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 py-4">
          <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700">Total Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">15,247</div>
              <p className="text-xs text-blue-600 mt-1">+12.3% from yesterday</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">99.2%</div>
              <p className="text-xs text-green-600 mt-1">Excellent performance</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-700">Avg Latency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">847ms</div>
              <p className="text-xs text-purple-600 mt-1">-8.2% improvement</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-700">Total Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-900">$127.45</div>
              <p className="text-xs text-yellow-600 mt-1">$23.12 saved today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-indigo-50 to-indigo-100 border-indigo-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-700">Quality Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-900">87%</div>
              <p className="text-xs text-indigo-600 mt-1">High quality responses</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Features Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Real-time Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Monitor AI routing decisions, provider performance, and system health in real-time with
              comprehensive dashboards and automated alerts.
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Cost Optimization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Automatic cost tracking, budget optimization, and intelligent recommendations to
              reduce AI spending while maintaining quality.
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-500" />
              A/B Testing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Test different AI routing strategies and provider configurations to optimize
              performance, cost, and user satisfaction.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Dashboard */}
      <HybridAnalyticsDashboard
        demoMode={true}
        organizationId={organizationId}
      />

      {/* Footer Info */}
      <div className="mt-8 p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            <strong>Phase 5 Features:</strong> Real-time monitoring, cost optimization, A/B testing,
            alerting system, and comprehensive reporting
          </div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>Analytics engine running</span>
          </div>
        </div>
      </div>
    </div>
  );
}
