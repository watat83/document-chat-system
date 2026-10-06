'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { 
  FileText, 
  FileText as FileContract, 
  ShieldCheck, 
  Settings, 
  Briefcase,
  ScrollText,
  X,
  Sparkles,
  Upload,
  File,
  Trash2,
  Move,
  ChevronDown,
  HardDrive
} from 'lucide-react'
import { useFileManager } from '@/lib/providers/file-manager-provider'
import { FolderHierarchyItem, useFolderHierarchy } from '@/components/ui/folder-hierarchy-item'
import { useTree } from '@/stores/document-chat-store'
import { getFileTypeFromMimeType } from './file-type-utils'

interface DocumentTemplate {
  id: string
  name: string
  description: string
  type: string
  complexity: number
  urgencyLevel: string
  tags: string[]
  preview: string
}

interface CreateDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    title: string // Keep as title for now to maintain interface compatibility
    type: string
    content?: string
    file?: File
    templateId?: string
    tags: string[]
    urgencyLevel: string
    complexityScore: number
    selectedFolderId?: string
  }) => Promise<void>
  currentFolderId?: string
  isCreating: boolean
  initialFile?: File // New prop for pre-loaded file from drag & drop
  disabled?: boolean // New prop to disable submit when organization ID not available
}

const documentTypeIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  proposal: Briefcase,
  contract: FileContract,
  compliance: ShieldCheck,
  certification: ShieldCheck,
  technical: Settings,
  template: FileText,
  other: ScrollText
}

export function CreateDocumentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  currentFolderId,
  isCreating,
  initialFile,
  disabled = false
}: CreateDocumentModalProps) {
  const [title, setTitle] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [urgencyLevel, setUrgencyLevel] = useState('medium')
  const [complexityScore, setComplexityScore] = useState(5)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  
  // Get documents state from store (same pattern as documents page)
  const { state } = useTree()
  
  // Build folder hierarchy for dropdown (same as document details view)
  const folderHierarchy = useFolderHierarchy(state.folders || [])
  
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [fileValidation, setFileValidation] = useState<any>(null)
  const [detectedFileType, setDetectedFileType] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Use the file manager for file operations
  const { fileOps, formatFileSize } = useFileManager()

  // Load templates when modal opens
  useEffect(() => {
    if (isOpen) {
      const timeout = window.setTimeout(() => {
        void loadTemplates()
        setSelectedFolderId(currentFolderId || null)
      }, 0)

      return () => window.clearTimeout(timeout)
    }
  }, [isOpen, currentFolderId])

  // Handle initial file from drag & drop
  useEffect(() => {
    if (initialFile && isOpen) {
      const timeout = window.setTimeout(() => {
        void handleFileSelect(initialFile)
      }, 0)

      return () => window.clearTimeout(timeout)
    }
  }, [initialFile, isOpen])

  async function loadTemplates() {
    setLoadingTemplates(true)
    try {
      const response = await fetch('/api/v1/documents/create')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || [])
      } else {
        console.warn('Templates not available:', response.status, response.statusText)
        // Continue without templates - this is not a critical failure
        setTemplates([])
      }
    } catch (error) {
      console.error('Failed to load templates:', error)
      // Continue without templates - this is not a critical failure
      setTemplates([])
    } finally {
      setLoadingTemplates(false)
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setSelectedTemplate(templateId)
      setSelectedType(template.type)
      if (!title) {
        setTitle(template.name.replace(' Template', ''))
      }
      setTags(template.tags)
      setUrgencyLevel(template.urgencyLevel)
      setComplexityScore(template.complexity)
      setContent(template.preview)
    }
  }


  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  // File upload handlers
  function handleFileSelect(file: File) {
    // Validate file using the file manager
    const validation = fileOps.validateFile(file)
    setFileValidation(validation)
    
    if (validation.isValid) {
      setSelectedFile(file)
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, '')) // Remove file extension
      }
      
      // Detect file type from MIME type and extension
      const detectedType = getFileTypeFromMimeType(file.type, file.name)
      setDetectedFileType(detectedType)
      
      // Auto-detect document type based on file extension
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (extension && !selectedType) {
        if (['pdf', 'doc', 'docx'].includes(extension)) {
          setSelectedType('PROPOSAL')
        } else if (['xls', 'xlsx', 'csv'].includes(extension)) {
          setSelectedType('OTHER')
        }
      }
    } else {
      setSelectedFile(null)
      setDetectedFileType(null)
    }
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    setFileValidation(null)
    setDetectedFileType(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    if (!title.trim() || !selectedType) return

    await onSubmit({
      title: title.trim(),
      type: selectedType,
      content: selectedFile ? undefined : content, // Only include content if no file
      file: selectedFile || undefined,
      templateId: selectedTemplate || undefined,
      tags,
      urgencyLevel: urgencyLevel as 'low' | 'medium' | 'high' | 'critical',
      complexityScore,
      selectedFolderId: selectedFolderId || undefined
    })

    // Reset form
    setTitle('')
    setSelectedType('')
    setSelectedTemplate(null)
    setContent('')
    setSelectedFile(null)
    setFileValidation(null)
    setDetectedFileType(null)
    setTags([])
    setNewTag('')
    setUrgencyLevel('medium')
    setComplexityScore(5)
    setSelectedFolderId(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const isValid = title.trim() && selectedType

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Document</DialogTitle>
          <DialogDescription>
            Upload a file or create a new document from scratch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Upload Section */}
          <div className="space-y-3">
            <Label>File Upload (Optional)</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/40'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="space-y-2">
                  <File className="mx-auto h-8 w-8 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="font-medium">{selectedFile.name}</p>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{formatFileSize(selectedFile.size)}</span>
                      {detectedFileType && (
                        <>
                          <span>•</span>
                          <Badge variant="outline" className="text-xs">
                            {detectedFileType.toUpperCase()}
                          </Badge>
                        </>
                      )}
                    </div>
                    {fileValidation && fileValidation.isValid && (
                      <p className="text-green-600 text-xs">✓ File is valid</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeFile}
                    className="mt-2"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove File
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="text-muted-foreground">
                      Drag and drop a file here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports PDF, DOC, DOCX, TXT, and more
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2"
                  >
                    Choose File
                  </Button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
                accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.pages"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a file to create a document from existing content, or leave empty to create from scratch
            </p>
            {fileValidation && !fileValidation.isValid && (
              <p className="text-red-600 text-sm">
                ❌ {fileValidation.error}
              </p>
            )}
          </div>

          {/* Document Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Document Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter document title..."
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Document Type *</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROPOSAL">Proposal / Bid</SelectItem>
                    <SelectItem value="CONTRACT">Contract / Agreement</SelectItem>
                    <SelectItem value="SOLICITATION">RFP / RFQ / Solicitation</SelectItem>
                    <SelectItem value="AMENDMENT">Amendment / Addendum</SelectItem>
                    <SelectItem value="COMPLIANCE">Compliance Document</SelectItem>
                    <SelectItem value="CERTIFICATION">Certification / Accreditation</SelectItem>
                    <SelectItem value="CAPABILITY_STATEMENT">Capability Statement</SelectItem>
                    <SelectItem value="PAST_PERFORMANCE">Past Performance / References</SelectItem>
                    <SelectItem value="TEMPLATE">Template</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Folder Selection */}
            <div className="space-y-2">
              <Label htmlFor="folder">Folder Location</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <Move className="h-4 w-4 mr-2" />
                    {selectedFolderId ? 
                      (folderHierarchy.find(f => f.id === selectedFolderId)?.name || 'Unknown Folder') : 
                      'Select Folder'
                    }
                    <ChevronDown className="h-3 w-3 ml-auto" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem 
                    onClick={() => setSelectedFolderId(null)}
                  >
                    <HardDrive size={14} className="mr-2" />
                    Root (No folder)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {folderHierarchy.map(folder => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={() => setSelectedFolderId(folder.id)}
                      className="p-0"
                    >
                      <FolderHierarchyItem
                        folder={folder}
                        className="w-full px-2 py-1"
                      />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-xs text-muted-foreground">
                Choose where to create this document. The document will be placed in the selected folder when you click &quot;Create Document&quot;.
              </p>
            </div>

            {/* Initial Content - Only show if no file is selected */}
            {!selectedFile && (
              <div className="space-y-2">
                <Label htmlFor="content">Initial Content</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Enter initial document content (optional)..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to start with a blank document or use template content
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-4">
              <Label>Document Metadata</Label>
              
              {/* Tags */}
              <div className="space-y-2">
                <Label className="text-sm">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add tag..."
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                  />
                  <Button type="button" size="sm" onClick={addTag}>
                    Add
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="ml-1 hover:bg-secondary-foreground/20 rounded-sm"
                        >
                          <X size={10} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority and Complexity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Urgency Level</Label>
                  <Select value={urgencyLevel} onValueChange={setUrgencyLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Complexity (1-10)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={complexityScore}
                    onChange={(e) => setComplexityScore(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {disabled && (
          <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-200">
            <p className="text-sm text-yellow-700">
              Organization data is still loading. Please wait a moment before creating documents.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || isCreating || disabled}
            className="flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Create Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
