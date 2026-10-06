'use client'

import React from 'react'
import { Trash2, AlertTriangle, Folder, FolderOpen, X, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Folder as FolderType } from '@/types/documents'

interface FolderDeleteConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  folder: FolderType | null
  isDeleting?: boolean
  documentCount?: number
  subfolderCount?: number
}

export const FolderDeleteConfirmationModal: React.FC<FolderDeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  folder,
  isDeleting = false,
  documentCount = 0,
  subfolderCount = 0
}) => {
  if (!folder) return null

  const getFolderIcon = (isProtected: boolean) => {
    return isProtected ? (
      <FolderOpen className="h-5 w-5 text-blue-600" />
    ) : (
      <Folder className="h-5 w-5 text-blue-600" />
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const isEmpty = documentCount === 0 && subfolderCount === 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Folder
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this folder? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="space-y-4">
            {/* Permanent Deletion Warning */}
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-destructive mb-1">
                    Permanent Deletion
                  </h3>
                  <p className="text-sm text-destructive/80">
                    This folder will be permanently deleted from your system. You will not be able to recover it.
                  </p>
                </div>
              </div>
            </div>

            {/* Folder Information */}
            <div className="bg-card border rounded-lg p-4 space-y-4">
              <h3 className="font-medium text-foreground border-b pb-2">
                Folder Information
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${folder.color}20`, border: `1px solid ${folder.color}40` }}
                  >
                    {getFolderIcon(folder.isProtected)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">
                        {folder.name}
                      </span>
                      {folder.isProtected && (
                        <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">
                          PROTECTED
                        </Badge>
                      )}
                    </div>
                    {folder.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {folder.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <span className="ml-2 font-medium">{formatDate(folder.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Modified:</span>
                    <span className="ml-2 font-medium">{formatDate(folder.updatedAt)}</span>
                  </div>
                </div>

                {/* Contents Summary */}
                <div className="pt-2 border-t">
                  <h4 className="text-sm font-medium text-foreground mb-2">Contents</h4>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Documents:</span>
                      <span className="font-medium">{documentCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Subfolders:</span>
                      <span className="font-medium">{subfolderCount}</span>
                    </div>
                  </div>
                  
                  {isEmpty && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                      ✓ This folder is empty and safe to delete
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Warning Section */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 mb-1">
                    Before you delete
                  </h4>
                  <ul className="text-sm text-amber-700 space-y-1">
                    <li>• Make sure you don&apos;t need this folder structure</li>
                    <li>• Check if any workflows depend on this folder</li>
                    <li>• This action cannot be undone</li>
                    {!isEmpty && (
                      <li>• <strong>Move all contents first</strong> - folder must be empty to delete</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isDeleting}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={onConfirm}
            disabled={isDeleting || !isEmpty}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Deleting...' : 'Delete Folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}