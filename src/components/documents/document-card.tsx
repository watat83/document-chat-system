'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreHorizontal,
  Download,
  Share,
  Eye,
  Edit3,
  Move,
  Trash2,
  Folder as FolderIcon,
  Brain
} from 'lucide-react'
import {
  getDocumentIcon,
  getFileTypeBadgeClass,
  getFileTypeFromMimeType,
  formatDateOnly,
  formatFileSize
} from './file-type-utils'
import { DocumentThumbnail } from './document-thumbnail'
import { ProcessingStatus, useDocumentStatus } from '@/components/ui/processing-status'
import type { Document, Folder } from '@/types/documents'

interface DocumentCardProps {
  document: Document
  onEdit: (doc: Document) => void
  onMove: (docId: string) => void
  onDelete: (docId: string) => void
  onDownload: (doc: Document) => void
  onShare: (doc: Document) => void
  onPreview: (doc: Document) => void
  onAnalyze?: (doc: Document) => void
  onDragStart: (e: React.DragEvent, docId: string) => void
  className?: string
  style?: React.CSSProperties
  allFolders: Folder[]
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document: doc,
  onEdit,
  onMove,
  onDelete,
  onDownload,
  onShare,
  onPreview,
  onAnalyze,
  onDragStart,
  className = '',
  style,
  allFolders
}) => {
  const handleDragStart = (e: React.DragEvent) => {
    onDragStart(e, doc.id)
  }

  // Get file type for icons and badges from mimeType and name
  const fileType = getFileTypeFromMimeType(doc.mimeType, doc.name)

  return (
    <div
      className={`group relative bg-card border border-border rounded-lg p-4 hover:shadow-sm transition-all duration-200 cursor-pointer ${className}`}
      style={style}
      draggable
      onDragStart={handleDragStart}
      onClick={() => onPreview(doc)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <DocumentThumbnail
              document={doc}
              size={24}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm text-gray-900 truncate mb-1">
              {doc.name}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <span>{formatFileSize(doc.size)}</span>
              <span>•</span>
              <span>{formatDateOnly(doc.lastModified)}</span>
            </div>

            {/* Processing Status */}
            {doc.processing?.currentStatus && doc.processing.currentStatus !== 'COMPLETED' && (
              <div className="mt-1">
                <ProcessingStatus
                  status={doc.processing.currentStatus}
                  variant="compact"
                  showProgress={false}
                  className="max-w-fit"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs px-2 py-0.5 ${getFileTypeBadgeClass(fileType)}`}
          >
            {fileType.toUpperCase()}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-auto opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onPreview(doc)
                }}
                className="flex items-center gap-2"
              >
                <Eye size={16} />
                Preview
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(doc)
                }}
                className="flex items-center gap-2"
              >
                <Edit3 size={16} />
                Edit metadata
              </DropdownMenuItem>

              {onAnalyze && doc.processing?.currentStatus !== 'PROCESSING' && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onAnalyze(doc)
                  }}
                  className="flex items-center gap-2"
                >
                  <Brain size={16} />
                  AI Analysis
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDownload(doc)
                }}
                className="flex items-center gap-2"
              >
                <Download size={16} />
                Download
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onShare(doc)
                }}
                className="flex items-center gap-2"
              >
                <Share size={16} />
                Share
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2">
                  <Move size={16} />
                  Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onMove(doc.id)
                    }}
                    className="flex items-center gap-2"
                  >
                    <FolderIcon size={16} className="text-gray-500" />
                    Root folder
                  </DropdownMenuItem>
                  {allFolders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMove(doc.id)
                      }}
                      className="flex items-center gap-2"
                      style={{ color: folder.color || undefined }}
                    >
                      <FolderIcon size={16} style={{ color: folder.color || undefined }} />
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(doc.id)
                }}
                className="flex items-center gap-2 text-red-600 focus:text-red-600"
              >
                <Trash2 size={16} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {doc.tags && doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {doc.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs px-2 py-0.5"
            >
              {tag}
            </Badge>
          ))}
          {doc.tags.length > 3 && (
            <Badge
              variant="secondary"
              className="text-xs px-2 py-0.5 text-gray-500"
            >
              +{doc.tags.length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
