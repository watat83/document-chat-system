'use client'

import React, { useState, useCallback } from 'react'
import type { Document } from '@/types/documents'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { X, Edit3, Plus, Save, Trash2 } from 'lucide-react'
import { FilePreview } from './file-preview'
import {
  getFileTypeBadgeClass,
  getFileExtension,
  getFilenameWithoutExtension,
  formatDateOnly,
  formatFileSize
} from './file-type-utils'

interface DocumentModalProps {
  document: Document | null
  isOpen: boolean
  onClose: () => void
  onSave: (document: Document) => void
}

export const DocumentModal: React.FC<DocumentModalProps> = ({
  document,
  isOpen,
  onClose,
  onSave
}) => {
  const [editedDoc, setEditedDoc] = useState(document)
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')

  const [previousDocument, setPreviousDocument] = useState(document)
  if (previousDocument !== document) {
    setPreviousDocument(document)
    setEditedDoc(document)
    setIsEditingMetadata(false)
    setNewTagInput('')
  }

  if (!document || !editedDoc) return null

  const handleSave = () => {
    onSave(editedDoc)
    onClose()
  }

  const handleAddTag = () => {
    if (newTagInput.trim()) {
      const updatedTags = [...(editedDoc.tags || []), newTagInput.trim()]
      setEditedDoc({ 
        ...editedDoc, 
        tags: updatedTags
      })
      setNewTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = (editedDoc.tags || []).filter(tag => tag !== tagToRemove)
    setEditedDoc({ 
      ...editedDoc, 
      tags: updatedTags
    })
  }

  // Custom fields functionality removed - not supported in current Document interface

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">
            Document Details
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-1 gap-6 min-h-0">
          {/* File Preview */}
          <div className="flex-1 min-w-0 bg-gray-50 rounded-lg min-h-[300px] overflow-hidden">
            <FilePreview document={document} className="w-full h-full" />
          </div>
          
          {/* Document Information */}
          <div className="md:w-96 flex-shrink-0 space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">File Information</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingMetadata(!isEditingMetadata)}
                  className="text-blue-600 hover:text-blue-700 p-1 opacity-70 hover:opacity-100"
                >
                  <Edit3 size={16} />
                </Button>
              </div>
              
              <div className="space-y-3">
                {/* Filename */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Filename
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={getFilenameWithoutExtension(editedDoc.name)}
                      onChange={(e) => {
                        const extension = getFileExtension(editedDoc.name)
                        setEditedDoc({
                          ...editedDoc,
                          name: e.target.value + extension
                        })
                      }}
                      className="flex-1"
                      disabled={!isEditingMetadata}
                    />
                    <span className="text-sm text-gray-500 min-w-0">
                      {getFileExtension(editedDoc.name)}
                    </span>
                  </div>
                </div>
                
                {/* File Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    File Type
                  </label>
                  <Badge
                    variant="outline"
                    className={`text-sm px-3 py-1 ${getFileTypeBadgeClass(editedDoc.type)}`}
                  >
                    {editedDoc.type.toUpperCase()}
                  </Badge>
                </div>
                
                {/* Size and Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Size
                    </label>
                    <p className="text-sm text-gray-900">{formatFileSize(editedDoc.size)}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Uploaded
                    </label>
                    <p className="text-sm text-gray-900">
                      {formatDateOnly(editedDoc.uploadDate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Tags */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">Tags</h3>
              
              {/* Existing Tags */}
              {(editedDoc.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {editedDoc.tags?.map((tag) => (
                    <div key={tag} className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs px-2 py-1">
                        {tag}
                      </Badge>
                      {isEditingMetadata && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTag(tag)}
                          className="h-auto p-0.5 text-gray-400 hover:text-red-500"
                        >
                          <X size={12} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add New Tag */}
              {isEditingMetadata && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Add tag"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddTag}
                    disabled={!newTagInput.trim()}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              )}
            </div>
            
            {/* Custom metadata functionality removed - not supported in current Document interface */}
            
            {/* Action Buttons */}
            {isEditingMetadata && (
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSave}
                  className="flex-1 gap-2"
                >
                  <Save size={16} />
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditedDoc(document)
                    setIsEditingMetadata(false)
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
