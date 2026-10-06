'use client'

import React from 'react'
import { Info, AlertTriangle, Folder, FileText, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Folder as FolderType } from '@/types/documents'

interface FolderDeleteInfoModalProps {
  isOpen: boolean
  onClose: () => void
  folder: FolderType | null
  documentCount: number
  subfolderCount: number
}

export const FolderDeleteInfoModal: React.FC<FolderDeleteInfoModalProps> = ({
  isOpen,
  onClose,
  folder,
  documentCount,
  subfolderCount
}) => {
  if (!folder) return null

  const totalItems = documentCount + subfolderCount

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <Info className="h-5 w-5" />
            Cannot Delete Folder
          </DialogTitle>
          <DialogDescription>
            This folder contains items and cannot be deleted until it&apos;s empty.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Folder Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${folder.color}20`, border: `1px solid ${folder.color}40` }}
              >
                <Folder className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-amber-800 mb-1">
                  &quot;{folder.name}&quot; is not empty
                </h3>
                <div className="flex items-center gap-4 text-sm text-amber-700">
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    <span>{documentCount} document{documentCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Folder className="h-4 w-4" />
                    <span>{subfolderCount} subfolder{subfolderCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* What to do */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-800 mb-2">
                  To delete this folder:
                </h4>
                <div className="space-y-2 text-sm text-blue-700">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">1</div>
                    <span>Move or delete all {documentCount} document{documentCount !== 1 ? 's' : ''}</span>
                  </div>
                  {subfolderCount > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">2</div>
                      <span>Move or delete all {subfolderCount} subfolder{subfolderCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">{subfolderCount > 0 ? '3' : '2'}</div>
                    <span>Then try deleting the folder again</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Alternative suggestion */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ArrowRight className="h-5 w-5 text-gray-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-800 mb-1">
                  Alternative: Move contents
                </h4>
                <p className="text-sm text-gray-600">
                  You can drag and drop the {totalItems} item{totalItems !== 1 ? 's' : ''} to another folder or to the root level, then delete this empty folder.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            <X className="h-4 w-4 mr-2" />
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}