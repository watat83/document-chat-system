'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { useCSRF } from '@/hooks/useCSRF';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect, FilterOption } from '@/components/ui/filter-select';
import {
  Filter,
  Download,
  Search,
  Eye,
  User,
  Shield,
  AlertCircle,
  CheckCircle2,
  Info,
  FileText,
  Activity
} from 'lucide-react';
import { DateTimePicker, DateRange } from '@/components/ui/date-time-picker';
import { AuditEventType, AuditCategory, AuditSeverity } from '@prisma/client';
import { subDays } from 'date-fns';
import { LogsActivityFeed } from '@/components/logs/logs-activity-feed';
import { LogsStatsCards } from '@/components/logs/logs-stats-cards';
import { LogsInsights } from '@/components/logs/logs-insights';

interface LogsFilter {
  startDate?: Date;
  endDate?: Date;
  categories?: AuditCategory[];
  searchTerm?: string;
  eventTypes?: AuditEventType[];
}

export function LogsPageClient() {
  const { user } = useUser();
  const { token: csrfToken, loading: csrfLoading, addToHeaders } = useCSRF();
  const [filters, setFilters] = useState<LogsFilter>({
    startDate: subDays(new Date(), 30),
    endDate: new Date(),
  });
  const [view, setView] = useState<'feed' | 'insights'>('feed');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  };

  const handleFilterChange = (newFilters: Partial<LogsFilter>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPage(1);
  };

  // Category options adapted for Document Chat
  const categoryOptions: FilterOption[] = [
    {
      value: AuditCategory.USER_MANAGEMENT,
      label: 'User Actions',
      description: 'User-initiated actions and account management activities',
      icon: <User className="h-4 w-4" />,
      category: 'User Activity'
    },
    {
      value: AuditCategory.AUTHENTICATION,
      label: 'Authentication',
      description: 'Login, logout, and authentication-related events',
      icon: <Shield className="h-4 w-4" />,
      category: 'Security'
    },
    {
      value: AuditCategory.AUTHORIZATION,
      label: 'Authorization',
      description: 'Permission checks and access control events',
      icon: <Shield className="h-4 w-4" />,
      category: 'Security'
    },
    {
      value: AuditCategory.DATA_ACCESS,
      label: 'Data Access',
      description: 'Data retrieval, viewing, and access operations',
      icon: <Eye className="h-4 w-4" />,
      category: 'Data Operations'
    },
    {
      value: AuditCategory.SECURITY,
      label: 'Security Events',
      description: 'Security-related incidents and monitoring events',
      icon: <Shield className="h-4 w-4" />,
      category: 'Security'
    },
    {
      value: AuditCategory.SYSTEM_ADMINISTRATION,
      label: 'System Events',
      description: 'System operations and administrative activities',
      icon: <Activity className="h-4 w-4" />,
      category: 'System'
    },
    {
      value: AuditCategory.DOCUMENT_MANAGEMENT,
      label: 'Document Management',
      description: 'Document uploads, edits, deletions, and sharing activities',
      icon: <FileText className="h-4 w-4" />,
      category: 'Document Operations'
    },
    {
      value: AuditCategory.COMPLIANCE,
      label: 'Compliance',
      description: 'Regulatory compliance and audit trail events',
      icon: <CheckCircle2 className="h-4 w-4" />,
      category: 'Compliance'
    },
  ];

  // Query user's logs
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['user-logs', user?.id, filters, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
        ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
        ...(filters.categories?.length && { categories: filters.categories.join(',') }),
        ...(filters.searchTerm && { searchTerm: filters.searchTerm }),
        ...(filters.eventTypes?.length && { eventTypes: filters.eventTypes.join(',') }),
      });

      const response = await fetch(`/api/v1/audit-logs?${params}`, {
        headers: addToHeaders({
          'Content-Type': 'application/json'
        }),
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
    enabled: !!user?.id && !!csrfToken && !csrfLoading,
  });

  // Query user activity summary
  const { data: summaryData } = useQuery({
    queryKey: ['user-activity-summary', user?.id, filters.startDate, filters.endDate],
    queryFn: async () => {
      const startDate = filters.startDate || subDays(new Date(), 30);
      const endDate = filters.endDate || new Date();

      const params = new URLSearchParams({
        type: 'user',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const response = await fetch(`/api/v1/audit-logs/summary?${params}`, {
        headers: addToHeaders({
          'Content-Type': 'application/json'
        }),
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch summary');
      return response.json();
    },
    enabled: !!user?.id && !!csrfToken && !csrfLoading,
  });

  const handleExport = async () => {
    try {
      const response = await fetch('/api/v1/audit-logs/export', {
        method: 'POST',
        headers: addToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...filters,
          userId: user?.id,
          format: 'csv',
        }),
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-activity-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const getCategoryIcon = (category: AuditCategory) => {
    switch (category) {
      case AuditCategory.SECURITY: return <Shield className="h-4 w-4" />;
      case AuditCategory.USER_MANAGEMENT: return <User className="h-4 w-4" />;
      case AuditCategory.SYSTEM_ADMINISTRATION: return <Activity className="h-4 w-4" />;
      case AuditCategory.DATA_ACCESS: return <Eye className="h-4 w-4" />;
      case AuditCategory.COMPLIANCE: return <CheckCircle2 className="h-4 w-4" />;
      case AuditCategory.AUTHENTICATION: return <Shield className="h-4 w-4" />;
      case AuditCategory.AUTHORIZATION: return <Shield className="h-4 w-4" />;
      case AuditCategory.DOCUMENT_MANAGEMENT: return <FileText className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: AuditSeverity): 'destructive' | 'secondary' | 'default' => {
    switch (severity) {
      case AuditSeverity.CRITICAL: return 'destructive';
      case AuditSeverity.ERROR: return 'destructive';
      case AuditSeverity.WARN: return 'secondary';
      case AuditSeverity.INFO: return 'default';
      default: return 'default';
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">Please sign in to view your activity logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Activity Logs</h2>
          <p className="text-muted-foreground">
            Track your actions and monitor account activity over time
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {summaryData?.data && (
        <LogsStatsCards data={summaryData.data} />
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Activity
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant={view === 'feed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('feed')}
              >
                Feed
              </Button>
              <Button
                variant={view === 'insights' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('insights')}
              >
                Insights
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Activity</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search your activity..."
                  value={filters.searchTerm || ''}
                  onChange={(e) => handleFilterChange({ searchTerm: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Activity Type</label>
              <FilterSelect
                value={filters.categories || []}
                onChange={(categories) =>
                  handleFilterChange({
                    categories: Array.isArray(categories) && categories.length > 0
                      ? categories as AuditCategory[]
                      : undefined
                  })
                }
                options={categoryOptions}
                placeholder="All activities"
                multiple={true}
                groupByCategory={true}
                searchable={true}
                showDescription={true}
                className="w-full"
              />
            </div>

            <DateTimePicker
              mode="range"
              fromLabel="From"
              toLabel="To"
              fromPlaceholder="Start date"
              toPlaceholder="End date"
              value={{
                from: filters.startDate,
                to: filters.endDate
              } as DateRange}
              onChange={(dateRange) => {
                const range = dateRange as DateRange
                handleFilterChange({
                  startDate: range?.from,
                  endDate: range?.to
                })
              }}
              compact={true}
              toDate={new Date()}
              className="w-full"
            />
          </div>

          {/* Quick date filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFilterChange({
                startDate: new Date(),
                endDate: new Date(),
              })}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFilterChange({
                startDate: subDays(new Date(), 1),
                endDate: new Date(),
              })}
            >
              Yesterday
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFilterChange({
                startDate: subDays(new Date(), 7),
                endDate: new Date(),
              })}
            >
              Last 7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFilterChange({
                startDate: subDays(new Date(), 30),
                endDate: new Date(),
              })}
            >
              Last 30 days
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Content based on view */}
      {view === 'feed' && (
        <LogsActivityFeed
          logs={logsData?.logs || []}
          isLoading={isLoading}
          hasNext={logsData?.hasNext}
          onLoadMore={() => setPage(prev => prev + 1)}
          getCategoryIcon={getCategoryIcon}
          getSeverityColor={getSeverityColor}
          currentPage={page}
          totalPages={logsData?.totalPages || 1}
          totalCount={logsData?.total || 0}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {view === 'insights' && (
        <LogsInsights
          summaryData={summaryData?.data}
          logs={logsData?.logs || []}
          timeframe={{
            start: filters.startDate || subDays(new Date(), 30),
            end: filters.endDate || new Date(),
          }}
        />
      )}
    </div>
  );
}
