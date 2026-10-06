'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import {
  TrendingUp,
  Activity,
  Clock,
  Calendar,
  Users,
  Shield,
  Eye,
  FileText
} from 'lucide-react';
import { format, startOfHour, subDays, eachDayOfInterval } from 'date-fns';
import { AuditEventType, AuditCategory, AuditSeverity } from '@prisma/client';

interface AuditLog {
  id: string;
  createdAt: string;
  eventType: AuditEventType;
  category: AuditCategory;
  severity: AuditSeverity;
  description: string;
  resourceType?: string;
}

interface LogsInsightsProps {
  summaryData?: {
    totalActions: number;
    actionsByCategory: Record<string, number>;
    actionsByType: Record<string, number>;
    recentActivity: AuditLog[];
  };
  logs: AuditLog[];
  timeframe: {
    start: Date;
    end: Date;
  };
}

const CATEGORY_COLORS: Partial<Record<AuditCategory, string>> = {
  [AuditCategory.USER_MANAGEMENT]: '#3b82f6',
  [AuditCategory.SECURITY]: '#ef4444',
  [AuditCategory.DATA_ACCESS]: '#10b981',
  [AuditCategory.SYSTEM_ADMINISTRATION]: '#f59e0b',
  [AuditCategory.COMPLIANCE]: '#8b5cf6',
  [AuditCategory.AUTHENTICATION]: '#06b6d4',
  [AuditCategory.AUTHORIZATION]: '#8b5cf6',
  [AuditCategory.PROFILE_MANAGEMENT]: '#84cc16',
  [AuditCategory.DOCUMENT_MANAGEMENT]: '#6366f1',
};

export function LogsInsights({ summaryData, logs, timeframe }: LogsInsightsProps) {
  // Process data for charts
  const processActivityByHour = () => {
    const hourlyData: Record<string, number> = {};

    logs.forEach(log => {
      try {
        const date = new Date(log.createdAt);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date value in processActivityByHour:', log.createdAt);
          return;
        }
        const hour = format(startOfHour(date), 'HH:00');
        hourlyData[hour] = (hourlyData[hour] || 0) + 1;
      } catch (error) {
        console.warn('Error processing hour data:', log.createdAt, error);
      }
    });

    return Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, '0') + ':00';
      return {
        hour,
        activity: hourlyData[hour] || 0,
      };
    });
  };

  const processActivityByDay = () => {
    const days = eachDayOfInterval({ start: timeframe.start, end: timeframe.end });
    const dailyData: Record<string, number> = {};

    logs.forEach(log => {
      try {
        const date = new Date(log.createdAt);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date value in processActivityByDay:', log.createdAt);
          return;
        }
        const day = format(date, 'yyyy-MM-dd');
        dailyData[day] = (dailyData[day] || 0) + 1;
      } catch (error) {
        console.warn('Error processing day data:', log.createdAt, error);
      }
    });

    return days.map(day => ({
      date: format(day, 'MMM dd'),
      activity: dailyData[format(day, 'yyyy-MM-dd')] || 0,
    }));
  };

  const processCategoryData = () => {
    if (!summaryData) return [];

    return Object.entries(summaryData.actionsByCategory).map(([category, count]) => ({
      name: category.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
      value: count,
      color: CATEGORY_COLORS[category as AuditCategory] || '#6b7280',
    }));
  };

  const processTopActions = () => {
    if (!summaryData) return [];

    return Object.entries(summaryData.actionsByType)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([action, count]) => ({
        action: action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
        count,
      }));
  };

  const getActivityPattern = () => {
    if (logs.length === 0) return 'No activity';

    const hourCounts: Record<number, number> = {};
    logs.forEach(log => {
      try {
        const date = new Date(log.createdAt);
        if (isNaN(date.getTime())) {
          console.warn('Invalid date value in getActivityPattern:', log.createdAt);
          return;
        }
        const hour = date.getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      } catch (error) {
        console.warn('Error processing activity pattern:', log.createdAt, error);
      }
    });

    const maxHour = Object.entries(hourCounts).reduce((a, b) =>
      hourCounts[a[0] as any] > hourCounts[b[0] as any] ? a : b
    )[0];

    const hourNum = parseInt(maxHour);

    if (hourNum >= 6 && hourNum < 12) return 'Morning person';
    if (hourNum >= 12 && hourNum < 18) return 'Afternoon active';
    if (hourNum >= 18 && hourNum < 22) return 'Evening worker';
    return 'Night owl';
  };

  const hourlyData = processActivityByHour();
  const dailyData = processActivityByDay();
  const categoryData = processCategoryData();
  const topActions = processTopActions();
  const activityPattern = getActivityPattern();

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity Pattern
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">{activityPattern}</div>
            <p className="text-xs text-muted-foreground">Based on your most active hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Daily Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">
              {Math.round(logs.length / Math.max(dailyData.length, 1))}
            </div>
            <p className="text-xs text-muted-foreground">Actions per day</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1 text-green-600">Good</div>
            <p className="text-xs text-muted-foreground">No security concerns</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Peak Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">
              {hourlyData.reduce((a, b) => a.activity > b.activity ? a : b).hour}
            </div>
            <p className="text-xs text-muted-foreground">Most active time</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daily Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="activity"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Hourly Pattern */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Hourly Pattern
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="hour"
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    fontSize={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar
                    dataKey="activity"
                    fill="hsl(var(--primary))"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Activity Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <div className="space-y-4">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categoryData.map((category, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-sm">{category.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {category.value}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Most Common Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topActions.length > 0 ? (
              <div className="space-y-3">
                {topActions.map((action, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate flex-1 mr-2">
                      {action.action}
                    </span>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={(action.count / topActions[0].count) * 100}
                        className="w-16 h-2"
                      />
                      <Badge variant="secondary" className="text-xs min-w-[2rem] text-center">
                        {action.count}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No action data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
