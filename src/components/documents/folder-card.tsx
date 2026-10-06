'use client'

import React from 'react'
import { Folder, MoreHorizontal, ChevronRight, ChevronDown } from 'lucide-react'
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
import { Edit3, Move, Trash2 } from 'lucide-react'
import type { Folder as FolderType } from '@/types/documents'

interface FolderCardProps {
  folder: FolderType
  isExpanded: boolean
  hasChildren: boolean
  childCount: number
  documentCount: number
  onToggleExpand: (folderId: string) => void
  onFolderClick: (folderId: string) => void
  onEditFolder: (folder: FolderType) => void
  onMoveFolder: (folderId: string) => void
  onDeleteFolder: (folderId: string) => void
  onDragStart: (e: React.DragEvent, folderId: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, targetFolderId: string) => void
  className?: string
  style?: React.CSSProperties
  allFolders: FolderType[]
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  isExpanded,
  hasChildren,
  childCount,
  documentCount,
  onToggleExpand,
  onFolderClick,
  onEditFolder,
  onMoveFolder,
  onDeleteFolder,
  onDragStart,
  onDragOver,
  onDrop,
  className = '',
  style,
  allFolders
}) => {
  const handleDragStart = (e: React.DragEvent) => {
    if (folder.isProtected) {
      e.preventDefault()
      return
    }
    onDragStart(e, folder.id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    onDragOver(e)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    onDrop(e, folder.id)
  }

  const canEdit = !folder.isProtected
  const canMove = !folder.isProtected
  const canDelete = !folder.isProtected && childCount === 0 && documentCount === 0

  return (
    <div
      className={`group relative bg-card border border-border rounded-lg p-3 hover:shadow-sm transition-all duration-200 ${className}`}
      style={style}
      draggable={!folder.isProtected}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-auto"
            onClick={() => onToggleExpand(folder.id)}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={16} className="text-gray-500" />
              ) : (
                <ChevronRight size={16} className="text-gray-500" />
              )
            ) : (
              <div className="w-4 h-4" />
            )}
          </Button>

          <div
            onClick={() => onFolderClick(folder.id)}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors"
          >
            <Folder
              size={20}
              style={{ color: folder.color || undefined }}
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm text-gray-900 truncate">
                {folder.name}
              </h3>
              {folder.description && (
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {folder.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500">
            {documentCount > 0 && `${documentCount} files`}
            {childCount > 0 && documentCount > 0 && ` • `}
            {childCount > 0 && `${childCount} folders`}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-auto opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onEditFolder(folder)}
                className="flex items-center gap-2"
              >
                <Edit3 size={16} />
                Edit
              </DropdownMenuItem>

              {canMove && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center gap-2">
                    <Move size={16} />
                    Move to folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => onMoveFolder(folder.id)}
                      className="flex items-center gap-2"
                    >
                      <Folder size={16} className="text-gray-500" />
                      Root folder
                    </DropdownMenuItem>
                    {allFolders
                      .filter(f => f.id !== folder.id && f.parentId !== folder.id)
                      .map((targetFolder) => (
                        <DropdownMenuItem
                          key={targetFolder.id}
                          onClick={() => onMoveFolder(folder.id)}
                          className="flex items-center gap-2"
                          style={{ color: targetFolder.color || undefined }}
                        >
                          <Folder size={16} style={{ color: targetFolder.color || undefined }} />
                          {targetFolder.name}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDeleteFolder(folder.id)}
                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 size={16} />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
