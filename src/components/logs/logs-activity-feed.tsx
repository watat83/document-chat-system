'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Eye,
  Clock,
  MoreHorizontal,
  MapPin,
  Monitor,
  Calendar,
  Activity,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { AuditEventType, AuditCategory, AuditSeverity } from '@prisma/client';
import { useState } from 'react';

interface AuditLog {
  id: string;
  createdAt: string;
  eventType: AuditEventType;
  category: AuditCategory;
  severity: AuditSeverity;
  description: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

interface LogsActivityFeedProps {
  logs: AuditLog[];
  isLoading: boolean;
  hasNext: boolean;
  onLoadMore: () => void;
  getCategoryIcon: (category: AuditCategory) => React.ReactNode;
  getSeverityColor: (severity: AuditSeverity) => React.ComponentProps<typeof Badge>['variant'];
  // Pagination props
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function LogsActivityFeed({
  logs,
  isLoading,
  hasNext,
  onLoadMore,
  getCategoryIcon,
  getSeverityColor,
  currentPage = 1,
  totalPages = 1,
  totalCount = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
}: LogsActivityFeedProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const formatEventType = (eventType: AuditEventType) => {
    return eventType.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const safeFormatDate = (dateString: string, formatStr: string, fallback: string = 'Invalid Date') => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date value:', dateString);
        return fallback;
      }
      return format(date, formatStr);
    } catch (error) {
      console.warn('Error formatting date:', dateString, error);
      return fallback;
    }
  };

  const getTimeLabel = (createdAt: string) => {
    const date = new Date(createdAt);

    // Check for invalid date
    if (isNaN(date.getTime())) {
      console.warn('Invalid date value:', createdAt);
      return 'Unknown Date';
    }

    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM dd, yyyy');
  };

  if (isLoading && logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading your activity...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Activity Found</h3>
            <p className="text-muted-foreground">
              No activity logs match your current filters. Try adjusting the date range or search terms.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Type</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24">Severity</TableHead>
                <TableHead className="w-32">Time</TableHead>
                <TableHead className="w-28">IP Address</TableHead>
                <TableHead className="w-12">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        {getCategoryIcon(log.category)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">
                      {formatEventType(log.eventType)}
                    </div>
                    {log.resourceType && (
                      <div className="text-xs text-muted-foreground">
                        {log.resourceType}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {log.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSeverityColor(log.severity)} className="text-xs">
                      {log.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <div>{safeFormatDate(log.createdAt, 'MMM dd', 'Invalid')}</div>
                      <div className="text-muted-foreground">
                        {safeFormatDate(log.createdAt, 'HH:mm:ss', '--:--:--')}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-mono">
                      {log.ipAddress || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Activity Details</DialogTitle>
                        </DialogHeader>
                        {selectedLog && (
                          <ScrollArea className="max-h-[600px]">
                            <div className="space-y-4 pr-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">Event Type</label>
                                  <div className="font-mono text-sm mt-1">
                                    {formatEventType(selectedLog.eventType)}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Category</label>
                                  <div className="flex items-center gap-2 mt-1">
                                    {getCategoryIcon(selectedLog.category)}
                                    <span className="text-sm">{selectedLog.category}</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Timestamp</label>
                                  <div className="text-sm mt-1">
                                    {safeFormatDate(selectedLog.createdAt, 'PPpp', 'Invalid Date')}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Severity</label>
                                  <Badge variant={getSeverityColor(selectedLog.severity)} className="mt-1">
                                    {selectedLog.severity}
                                  </Badge>
                                </div>
                              </div>

                              <div>
                                <label className="text-sm font-medium">Description</label>
                                <div className="mt-1 p-3 bg-muted rounded text-sm">
                                  {selectedLog.description}
                                </div>
                              </div>

                              {selectedLog.resourceType && (
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm font-medium">Resource Type</label>
                                    <div className="text-sm mt-1">{selectedLog.resourceType}</div>
                                  </div>
                                  {selectedLog.resourceId && (
                                    <div>
                                      <label className="text-sm font-medium">Resource ID</label>
                                      <div className="font-mono text-sm mt-1">{selectedLog.resourceId}</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {(selectedLog.ipAddress || selectedLog.userAgent) && (
                                <div className="space-y-2">
                                  {selectedLog.ipAddress && (
                                    <div>
                                      <label className="text-sm font-medium">IP Address</label>
                                      <div className="font-mono text-sm mt-1">{selectedLog.ipAddress}</div>
                                    </div>
                                  )}
                                  {selectedLog.userAgent && (
                                    <div>
                                      <label className="text-sm font-medium">User Agent</label>
                                      <div className="text-sm mt-1 break-all">{selectedLog.userAgent}</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                                <div>
                                  <label className="text-sm font-medium">Additional Details</label>
                                  <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-auto">
                                    {JSON.stringify(selectedLog.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        )}
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {onPageChange && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} entries
                  </span>
                </div>

                {onPageSizeChange && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Show:</span>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => onPageSizeChange(parseInt(value))}
                    >
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">per page</span>
                  </div>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage <= 1 || isLoading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-1">
                  {/* Show page numbers */}
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

                    // Adjust start if we're near the end
                    if (endPage - startPage + 1 < maxVisible) {
                      startPage = Math.max(1, endPage - maxVisible + 1);
                    }

                    // First page + ellipsis
                    if (startPage > 1) {
                      pages.push(
                        <Button
                          key={1}
                          variant={1 === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => onPageChange(1)}
                          disabled={isLoading}
                          className="w-10"
                        >
                          1
                        </Button>
                      );
                      if (startPage > 2) {
                        pages.push(
                          <span key="ellipsis1" className="px-2 text-muted-foreground">
                            ...
                          </span>
                        );
                      }
                    }

                    // Visible page numbers
                    for (let i = startPage; i <= endPage; i++) {
                      pages.push(
                        <Button
                          key={i}
                          variant={i === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => onPageChange(i)}
                          disabled={isLoading}
                          className="w-10"
                        >
                          {i}
                        </Button>
                      );
                    }

                    // Last page + ellipsis
                    if (endPage < totalPages) {
                      if (endPage < totalPages - 1) {
                        pages.push(
                          <span key="ellipsis2" className="px-2 text-muted-foreground">
                            ...
                          </span>
                        );
                      }
                      pages.push(
                        <Button
                          key={totalPages}
                          variant={totalPages === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => onPageChange(totalPages)}
                          disabled={isLoading}
                          className="w-10"
                        >
                          {totalPages}
                        </Button>
                      );
                    }

                    return pages;
                  })()}
                </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || isLoading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fallback to load more for backward compatibility */}
      {!onPageChange && hasNext && (
        <div className="text-center">
          <Button onClick={onLoadMore} variant="outline" disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Load More Activity'}
          </Button>
        </div>
      )}
    </div>
  );
}
