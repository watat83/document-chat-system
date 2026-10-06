'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  ExternalLink, 
  Copy,
  Globe,
  Calendar,
  Clock,
  FileText
} from 'lucide-react';

interface Citation {
  url: string;
  title?: string;
  content?: string;
  start_index: number;
  end_index: number;
  type?: 'web' | 'file'; // Add type to distinguish file vs web citations
}

interface CitationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  citations: Citation[];
  onCopy?: (content: string) => void;
}

export function CitationsPanel({ 
  isOpen, 
  onClose, 
  citations,
  onCopy 
}: CitationsPanelProps) {
  if (!isOpen) return null;

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    onCopy?.(`Source URL copied: ${url}`);
  };

  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    onCopy?.('Source content copied to clipboard');
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-background border-l border-border shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base">Citations</h3>
          <Badge variant="secondary" className="h-5 px-2 text-xs">
            {citations.length} {citations.length === 1 ? 'source' : 'sources'}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {citations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No sources available</p>
              <p className="text-xs mt-1">Web search didn&apos;t return any citations for this response.</p>
            </div>
          ) : (
            citations.map((citation, index) => (
              <div
                key={index}
                className="border border-border rounded-lg p-4 space-y-3 hover:bg-muted/20 transition-colors"
              >
                {/* Source number and domain */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="h-5 w-5 p-0 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {citation.type === 'file' ? (
                          <>
                            <FileText className="w-3 h-3" />
                            <span className="truncate">Uploaded File</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-3 h-3" />
                            <span className="truncate">{getDomainFromUrl(citation.url)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyUrl(citation.url)}
                      className="h-6 w-6 p-0"
                      title="Copy URL"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    {citation.type !== 'file' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(citation.url, '_blank')}
                        className="h-6 w-6 p-0"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Title */}
                {citation.title && (
                  <div>
                    <h4 className="font-medium text-sm leading-snug line-clamp-2">
                      {citation.title}
                    </h4>
                  </div>
                )}

                {/* Content preview */}
                {citation.content && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {citation.content}
                    </p>
                    {citation.content.length > 150 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyContent(citation.content!)}
                        className="h-6 px-2 text-xs"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy content
                      </Button>
                    )}
                  </div>
                )}

                {/* URL */}
                <div className="pt-2 border-t border-muted/30">
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {citation.url}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Sources gathered from real-time web search</span>
        </div>
      </div>
    </div>
  );
}