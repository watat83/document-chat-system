'use client'
import { normalizeError } from '@/lib/errors/normalize-error';

import React, { useState, useCallback, useRef, useEffect } from 'react'

// Simple Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode; onError?: (error: Error) => void }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}
import Link from 'next/link'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { AIEditor } from '@/components/ui/ai-editor'
import { StableEditor } from '@/components/ui/stable-editor'
import { applySectionEdits } from '@/lib/documents/section-edits'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FolderHierarchyItem, useFolderHierarchy } from '@/components/ui/folder-hierarchy-item'
import { ProcessingProgress } from '@/components/ui/processing-progress'
import { triggerDocumentAnalysis, cancelDocumentProcessing, canCancelProcessing, canAnalyzeDocument } from '@/lib/document-analysis'
import { useNotify } from '@/contexts/notification-context'
import { useSoundEffects, SoundEffect } from '@/lib/sound-effects'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  Undo,
  Redo,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Save,
  Share,
  Eye,
  Edit3,
  ChevronRight,
  FileText,
  Sparkles,
  Calendar,
  DollarSign,
  Tag,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Info,
  CheckSquare,
  Highlighter,
  Strikethrough,
  Minus,
  Type,
  Image as ImageIcon,
  Table as TableIcon,
  MoreVertical,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  FileDown,
  FilePlus,
  Printer,
  Menu,
  X,
  Shield,
  Brain,
  Activity,
  Search,
  TrendingUp,
  Edit2,
  Check,
  Plus,
  Trash2,
  FileSpreadsheet,
  FileImage,
  File,
  ArrowLeft,
  Move,
  ChevronDown,
  HardDrive,
  Upload
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FilePreview } from './file-preview'
import { FileViewerModal } from './file-viewer-modal'
import { DocumentChatInterface, ChatToggleButton } from './document-chat-interface'
import { EditableBadgeInput } from '@/components/ui/editable-badge-input'
import { useFileManager } from '@/lib/providers/file-manager-provider'
import { useTree, useDocumentOperations, useTreeNavigation, useDocumentChatStore } from '@/stores/document-chat-store'
import { UI_CONSTANTS } from '@/lib/constants'
import type { Document, DocumentEmbeddings } from '@/types/documents'
import { DocumentType, EntityType } from '@/types/documents'
import { formatFileSize, getFileTypeFromMimeType } from '@/components/documents/file-type-utils'

// No more hardcoded mock data - component will use only real API data

// Utility function to remove file extension from display title
const removeFileExtension = (filename: string): string => {
  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return filename.substring(0, lastDotIndex)
  }
  return filename
}

// Utility function to get original filename from filePath (always use this for preview logic)
const getOriginalFileName = (document: Document): string => {
  if (!document.filePath) return ''
  const pathParts = document.filePath.split('/')
  return pathParts[pathParts.length - 1] || ''
}

// Utility function to check if document has valid embeddings/chunks for chat
const hasValidEmbeddings = (document: Document | null): boolean => {
  if (!document?.embeddings) return false
  const embeddings = document.embeddings as DocumentEmbeddings
  return !!(embeddings.chunks && Array.isArray(embeddings.chunks) && embeddings.chunks.length > 0)
}

// Utility function to get file extension from original filename (not editable name)
const getOriginalFileExtension = (document: Document): string => {
  // First try to get extension from the document name
  if (document.name && document.name.includes('.')) {
    return document.name.split('.').pop()?.toLowerCase() || ''
  }

  // Fallback to filePath if document name has no extension
  const originalFileName = getOriginalFileName(document)
  if (originalFileName && originalFileName.includes('.')) {
    return originalFileName.split('.').pop()?.toLowerCase() || ''
  }

  // If no extension found anywhere, derive from MIME type
  if (document.mimeType) {
    const mimeToExt: { [key: string]: string } = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3'
    }
    return mimeToExt[document.mimeType] || ''
  }

  return ''
}

// Generate sections from real document data - handles both processed and unprocessed documents
const generateSectionsFromDocument = (document: Document | null) => {
  console.log('🔍 [generateSectionsFromDocument] Called with document:', {
    id: document?.id,
    hasContent: !!document?.content,
    hasSections: !!document?.content?.sections,
    sectionsLength: document?.content?.sections?.length || 0,
    firstSectionTitle: document?.content?.sections?.[0]?.title || 'N/A'
  });

  // Handle case where document doesn't exist
  if (!document) {
    return [{
      id: '1',
      title: 'No Document',
      content: `<h2>Document Not Found</h2><p>The requested document could not be loaded.</p>`
    }];
  }

  // Check if document has minimal processing (just uploaded, no AI data)
  const hasMinimalData = !document.content ||
    (!document.content?.sections || document.content.sections.length === 0) &&
    (!document.extractedText) &&
    (!document.entities?.entities || document.entities.entities.length === 0);

  // If truly minimal data, show simple content
  if (hasMinimalData) {
    const status = document.processing?.currentStatus || 'PENDING';
    const isProcessing = status === 'PROCESSING';
    const hasFailed = status === 'FAILED';

    let content = '<h2>Document Content</h2>';

    if (isProcessing) {
      content += '<p>🔄 Document is being processed. AI analysis and content extraction are in progress...</p>';
    } else if (hasFailed) {
      content += '<p>❌ Document processing failed. Please try reprocessing this document.</p>';
    } else {
      content += '<p>📄 Document uploaded successfully. Click "Analyze Document" to extract content and generate insights.</p>';
    }

    return [{
      id: '1',
      title: 'Document Content',
      content: content
    }];
  }

  // Helper function to format text content properly with enhanced readability
  const formatTextContent = (content: string): string => {
    if (!content) return ''

    // Enhanced text formatting for better readability
    return content
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Clean up excessive whitespace while preserving single spaces
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      // Handle multiple consecutive newlines (preserve intentional spacing)
      .replace(/\n{3,}/g, '\n\n')
      // Split into paragraphs and process each one
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph.length > 0)
      .map(paragraph => {
        // Handle bullet points and lists more robustly
        const lines = paragraph.split('\n').map(line => line.trim())

        // Check for bullet lists (•, -, *, or starting with numbers)
        const isBulletList = lines.some(line => line.match(/^[•\-*]\s+/) || line.match(/^\d+\.\s+/))
        const isNumberedList = lines.some(line => line.match(/^\d+\.\s+/))

        if (isBulletList) {
          const listItems = lines
            .filter(line => line.match(/^[•\-*]\s+/) || line.match(/^\d+\.\s+/))
            .map(item => {
              const cleanItem = item
                .replace(/^[•\-*]\s+/, '')
                .replace(/^\d+\.\s+/, '')
                .trim()
              return `<li style="margin-bottom: 8px; line-height: 1.5;">${cleanItem}</li>`
            })
            .join('')

          const listTag = isNumberedList ? 'ol' : 'ul'
          const listStyle = isNumberedList
            ? 'style="margin: 16px 0; padding-left: 24px; line-height: 1.6;"'
            : 'style="margin: 16px 0; padding-left: 24px; line-height: 1.6; list-style-type: disc;"'

          return `<${listTag} ${listStyle}>${listItems}</${listTag}>`
        }

        // Handle headers (lines that look like titles)
        if (paragraph.length < 100 && !paragraph.includes('.') && paragraph.match(/^[A-Z][A-Za-z\s]+$/)) {
          return `<h3 style="margin: 24px 0 16px 0; font-size: 1.1em; font-weight: 600; color: #374151;">${paragraph}</h3>`
        }

        // Regular paragraphs with improved styling
        return `<p style="margin: 16px 0; line-height: 1.6; color: #4b5563; text-align: justify;">${paragraph}</p>`
      })
      .join('')
      // Post-process to fix any formatting issues
      .replace(/<p[^>]*>\s*<\/p>/g, '') // Remove empty paragraphs
      .replace(/(<\/[uo]l>)\s*(<[uo]l[^>]*>)/g, '$1$2') // Merge consecutive lists
  }

  // Handle documents with partial AI data but no structured sections
  // This creates sections from available content like extracted text, entities, etc.
  if (!document.content?.sections || document.content.sections.length === 0) {
    const sections = [];

    // Create a main content section from extracted text if available
    if (document.extractedText) {
      let content = '<h2>Document Content</h2>';
      content += `<div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px;">
        <p>${formatTextContent(document.extractedText)}</p>
      </div>`;

      sections.push({
        id: '1',
        title: 'Document Content',
        content: content
      });
    }

    // Create an entities section if entities exist
    if (document.entities?.entities && document.entities.entities.length > 0) {
      let content = '<h2>Extracted Information</h2>';
      content += '<div style="margin-top: 20px; padding: 15px; background-color: #f0f9ff; border-radius: 8px;">';
      content += '<h3>Key Entities Found</h3>';
      content += '<ul>';
      document.entities.entities.slice(0, 10).forEach(entity => {
        content += `<li><strong>${entity.type.toUpperCase()}:</strong> ${entity.text} (${Math.round(entity.confidence * 100)}% confidence)</li>`;
      });
      content += '</ul></div>';

      sections.push({
        id: '2',
        title: 'Extracted Information',
        content: content
      });
    }

    // If we created any sections, return them
    if (sections.length > 0) {
      return sections;
    }

    // Otherwise, fall back to basic content
    return [{
      id: '1',
      title: 'Document Content',
      content: '<h2>Document Content</h2><p>Document is available but content analysis is pending. Please check back later for detailed analysis.</p>'
    }];
  }

  // Handle fully processed documents with content data
  return document.content.sections.map((section, index) => {
    const formattedContent = /<\/?[a-z][\s>]/i.test(section.content)
      ? section.content
      : formatTextContent(section.content)
    let content = `<h2>${section.title.replace(/^\d+\.\d+\s*/, '')}</h2>${formattedContent}`;

    // Add tables to appropriate sections if they exist
    if (document.content?.tables && document.content.tables.length > 0) {
      const shouldAddTable = section.title.toLowerCase().includes('project') ||
                            section.title.toLowerCase().includes('plan') ||
                            index === Math.min(2, document.content.sections.length - 1);

      if (shouldAddTable) {
        const table = document.content.tables[0];
        const tableTitle = table.caption || 'Data Table';
        const tableHtml = `
          <h3>${tableTitle}</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
                ${table.headers.map(header => `<th style="padding: 12px; text-align: left; font-weight: 600;">${header}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${table.rows.map((row, idx) => `
                <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 1 ? 'background-color: #f9fafb;' : ''}">
                  ${row.map(cell => `<td style="padding: 12px;">${cell}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        content = content.replace('</h2>', `</h2>${tableHtml}`);
      }
    }

    return {
      id: section.id,
      title: section.title,
      content: content
    };
  });
}

// Color palette for highlighting
const highlightColors = [
  { name: 'Yellow', value: '#fde047' },
  { name: 'Green', value: '#86efac' },
  { name: 'Blue', value: '#93c5fd' },
  { name: 'Purple', value: '#c4b5fd' },
  { name: 'Pink', value: '#fda4af' },
  { name: 'Orange', value: '#fdba74' },
]

// Helper function to get file icon and colors based on type
const getFileTypeInfo = (type: string) => {
  const fileType = type.toLowerCase()

  switch (fileType) {
    case 'pdf':
      return {
        icon: FileText,
        bgGradient: 'from-red-50 to-red-100 dark:from-red-950 dark:to-red-900',
        borderColor: 'border-red-200 dark:border-red-800',
        iconColor: 'text-red-600 dark:text-red-400',
        textColor: 'text-red-600 dark:text-red-400'
      }
    case 'docx':
    case 'doc':
      return {
        icon: FileText,
        bgGradient: 'from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900',
        borderColor: 'border-blue-200 dark:border-blue-800',
        iconColor: 'text-blue-600 dark:text-blue-400',
        textColor: 'text-blue-600 dark:text-blue-400'
      }
    case 'xlsx':
    case 'xls':
    case 'csv':
      return {
        icon: FileSpreadsheet,
        bgGradient: 'from-green-50 to-green-100 dark:from-green-950 dark:to-green-900',
        borderColor: 'border-green-200 dark:border-green-800',
        iconColor: 'text-green-600 dark:text-green-400',
        textColor: 'text-green-600 dark:text-green-400'
      }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return {
        icon: FileImage,
        bgGradient: 'from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900',
        borderColor: 'border-purple-200 dark:border-purple-800',
        iconColor: 'text-purple-600 dark:text-purple-400',
        textColor: 'text-purple-600 dark:text-purple-400'
      }
    default:
      return {
        icon: File,
        bgGradient: 'from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900',
        borderColor: 'border-gray-200 dark:border-gray-800',
        iconColor: 'text-gray-600 dark:text-gray-400',
        textColor: 'text-gray-600 dark:text-gray-400'
      }
  }
}

// Text colors
const textColors = [
  { name: 'Default', value: null },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
]

interface DocumentDetailsViewProps {
  documentId: string
}

export function DocumentDetailsView({ documentId }: DocumentDetailsViewProps) {
  // Store hooks
  const { findDocument, updateDocument } = useDocumentOperations()
  const { moveDocument } = useDocumentOperations()
  const { navigateToFolder, currentFolderId } = useTreeNavigation()
  const { state } = useTree()

  // Notification and sound hooks
  const notify = useNotify()
  const { play: playSound } = useSoundEffects()
  const setDocuments = useDocumentChatStore((state) => state.documents.setDocuments)

  // Loading state
  const [loadingDocument, setIsLoading] = useState(true)
  const isLoading = Boolean(documentId) && loadingDocument
  const [fetchedDocument, setFetchedDocument] = useState<Document | null>(null)

  // Chat interface state
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Build folder hierarchy for dropdown
  const folderHierarchy = useFolderHierarchy(state.folders)

  // Use findDocument to get the actual document data
  const foundDocument = findDocument(documentId)

  // Prioritize fetchedDocument (fresh API data) over foundDocument (potentially stale store data)
  const document = fetchedDocument || foundDocument

  // Debug document availability
  console.log('🔍 [DOCUMENT_DEBUG] Component state:', {
    documentId,
    storeHasDocuments: state.documents.length > 0,
    fetchedDocument: !!fetchedDocument,
    foundDocument: !!foundDocument,
    finalDocument: !!document,
    isLoading,
    storeDocuments: state.documents.map(d => ({ id: d.id, name: d.name }))
  })

  if (!document && !isLoading) {
    console.log('🔍 [DOCUMENT_DEBUG] No document in store, API fetch should be triggered')
  } else if (document) {
    console.log('✅ [DOCUMENT_FOUND] Document available:', document.name)
    console.log('🔍 [CONTRACT_DEBUG] Analysis data structure:', {
      hasAnalysis: !!document.analysis,
      analysisKeys: document.analysis ? Object.keys(document.analysis) : [],
      hasContractAnalysis: !!(document.analysis as any)?.contractAnalysis,
      contractAnalysisKeys: (document.analysis as any)?.contractAnalysis ? Object.keys((document.analysis as any).contractAnalysis) : [],
      requirementsCount: (document.analysis as any)?.contractAnalysis?.requirements?.length || 0,
      opportunitiesCount: (document.analysis as any)?.contractAnalysis?.opportunities?.length || 0,
      requirements: (document.analysis as any)?.contractAnalysis?.requirements || 'none',
      opportunities: (document.analysis as any)?.contractAnalysis?.opportunities || 'none'
    })
  }



  // Force immediate API fetch on component mount - bypassing useEffect dependency issues
  React.useEffect(() => {
    console.log('🔄 [FETCH EFFECT] Document fetch useEffect triggered for documentId:', documentId)
    console.log('🔄 [FETCH EFFECT] useEffect dependencies:', { documentId, setDocuments: !!setDocuments })
    console.log('🔄 [FETCH EFFECT] Current store state:', { storeDocuments: state.documents.length })

    if (!documentId) {
      console.warn('⚠️ [FETCH EFFECT] No documentId provided, skipping API fetch')
      return
    }

    // Force execution regardless of store state since hydration is broken
    const fetchDocument = async () => {
      // Always fetch from API to get complete document data including vectorProperties
      try {
        const apiUrl = `/api/v1/documents/${documentId}`
        console.log('🌐 Making API request to fetch document:', apiUrl)
        console.log('🌐 Full URL will be:', window.location.origin + apiUrl)

        const response = await fetch(apiUrl, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        })

        console.log('🌐 API Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          url: response.url
        })

        if (response.ok) {
          const documentData = await response.json()
          console.log('✅ Document fetched from API:', documentData)
          setFetchedDocument(documentData)

          // Update the Zustand store with the complete document data
          // This ensures the store has the latest data including vectorProperties
          try {
            console.log('🔄 Updating Zustand store with complete fetched document data')

            // Find the document in the current documents array and replace it
            const currentDocuments = state.documents
            const documentIndex = currentDocuments.findIndex((d: any) => d.id === documentId)

            if (documentIndex >= 0) {
              // Create a new documents array with the updated document
              const updatedDocuments = [...currentDocuments]
              updatedDocuments[documentIndex] = {
                ...updatedDocuments[documentIndex],
                ...documentData,  // Replace with complete fetched data including vectorProperties
                id: documentId    // Ensure the document maintains its ID
              }

              // Update the store with the new documents array
              setDocuments(updatedDocuments)
              console.log('✅ Successfully updated store with complete document data including vectorProperties')
            } else {
              console.warn('⚠️ Document not found in store to update')
            }
          } catch (storeError) {
            console.warn('⚠️ Store update failed:', storeError)
            // Don't fail the whole operation if store update fails
          }
        } else {
          const responseText = await response.text()
          console.error('❌ Failed to fetch document:', response.status, response.statusText)
          console.error('❌ Response body:', responseText)
          if (response.status === 401) {
            console.error('🔒 Authentication failed - user may not be logged in')
          } else if (response.status === 404) {
            console.error('📄 Document not found - ID may be invalid:', documentId)
          }
          setFetchedDocument(null)
        }
      } catch (error) {
        console.error('❌ Error fetching document:', error)
        setFetchedDocument(null)
      } finally {
        setIsLoading(false)
      }
    }

    console.log('🚀 [FETCH EFFECT] Starting fetchDocument() call')
    fetchDocument()
  }, [documentId, setDocuments]) // Always fetch when documentId changes

  // BACKUP: Also try to fetch document immediately if useEffect doesn't run
  React.useEffect(() => {
    console.log('🆘 [BACKUP FETCH] Backup fetch mechanism triggered')
    console.log('🆘 [BACKUP FETCH] Document state:', { document: !!document, fetchedDocument: !!fetchedDocument, isLoading })

    // If no document is found and we're not already loading, try to fetch
    if (!document && !isLoading && documentId) {
      console.log('🆘 [BACKUP FETCH] No document found, triggering backup API fetch')

      const backupFetch = async () => {
        setIsLoading(true)
        try {
          const response = await fetch(`/api/v1/documents/${documentId}`, {
            credentials: 'include'
          })

          if (response.ok) {
            const documentData = await response.json()
            console.log('✅ [BACKUP FETCH] Document fetched successfully:', documentData.name)
            setFetchedDocument(documentData)
          } else {
            console.error('❌ [BACKUP FETCH] Failed to fetch document:', response.status)
          }
        } catch (error) {
          console.error('❌ [BACKUP FETCH] Error:', error)
        } finally {
          setIsLoading(false)
        }
      }

      backupFetch()
    }
    // Only trigger on documentId or loading state changes, not document object changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, isLoading])

  // Only warn if store has documents loaded but our document isn't found
  if (!foundDocument && !isLoading && state.documents.length > 0) {
    console.warn('⚠️ Document not found in store, DocumentId:', documentId)
    console.warn('⚠️ Store state:', {
      documentsLoaded: state.documents.length > 0,
      foldersLoaded: state.folders.length > 0,
      documentIds: state.documents.map(d => d.id)
    })
  }

  // Get folder path for breadcrumb (full hierarchy)
  const getFolderPath = useCallback((folderId: string | null): Array<{id: string | null, name: string}> => {
    if (!folderId) return [{id: null, name: 'Root'}];

    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return [{id: null, name: 'Root'}];

    const parentPath = folder.parentId ? getFolderPath(folder.parentId) : [{id: null, name: 'Root'}];
    return [...parentPath, {id: folder.id, name: folder.name}];
  }, [state.folders]);

  const folderPath = getFolderPath(document?.folderId || null)

  // Move document handler - PRESERVED
  const handleMoveDocument = useCallback((targetFolderId: string) => {
    if (!document) return

    const actualTargetId = targetFolderId === UI_CONSTANTS.ROOT_FOLDER_ID ? null : targetFolderId
    moveDocument(document.id, actualTargetId)

    // Navigate to the target folder to show the moved document
    if (actualTargetId) {
      navigateToFolder(actualTargetId)
    } else {
      navigateToFolder(null) // Navigate to root
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDocument, navigateToFolder])

  // Generate sections dynamically from document data
  // Use deep dependency tracking to ensure sections update when AI data changes
  const sections = React.useMemo(() => {
    console.log('🔄 [SECTIONS MEMO] Regenerating sections from document:', {
      documentId: document?.id,
      hasContent: !!document?.content,
      sectionsCount: document?.content?.sections?.length || 0,
      documentStatus: document?.processing?.currentStatus,
      timestamp: new Date().toISOString()
    });

    // Debug logging for sections
    if (document?.content?.sections) {
      console.log('📚 [SECTIONS DEBUG] Found sections in content:',
        document.content.sections.map(s => ({
          title: s.title,
          contentLength: s.content?.length || 0,
          pageNumber: s.pageNumber
        }))
      );
    }

    const generatedSections = generateSectionsFromDocument(document ?? null);
    console.log('📚 [SECTIONS DEBUG] Generated sections:',
      generatedSections.map(s => ({
        id: s.id,
        title: s.title,
        contentLength: s.content?.length || 0
      }))
    );

    return generatedSections;
  }, [
    document?.id,
    document?.content?.sections,
    document?.extractedText,
    document?.entities?.entities,
    document?.processing?.currentStatus
  ])
  const [sectionSelection, setSelectedSection] = useState<any>(null)
  const selectedSection = sections.find(section => section.id === sectionSelection?.id) ?? sections[0] ?? null
  const [documentTitle, setDocumentTitle] = useState(removeFileExtension(document?.name || ''))
  const [previousTitleSource, setPreviousTitleSource] = useState({ id: document?.id, name: document?.name })
  if (previousTitleSource.id !== document?.id || previousTitleSource.name !== document?.name) {
    setPreviousTitleSource({ id: document?.id, name: document?.name })
    setDocumentTitle(removeFileExtension(document?.name || ''))
  }
  const [isEditing, setIsEditing] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<Partial<Document>>({})
  const [sectionEdits, setSectionEdits] = useState<Record<string, string>>({})
  const applyDocumentToStore = (id: string, patch: Partial<Document>) => {
    const current = useDocumentChatStore.getState().documents.documents;
    setDocuments(current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [useStableEditor, setUseStableEditor] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [characterCount, setCharacterCount] = useState(0)
  const [wordCount, setWordCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [isVectorizing, setIsVectorizing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get file manager services
  const { fileOps, isUploading } = useFileManager()
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [rightPanelWidth, setRightPanelWidth] = useState(0)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  // Only set isAnalyzing to true when explicitly triggered by user action
  // NOT automatically based on document status to prevent infinite polling loops
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Emergency stop for polling - set this to true to force stop all polling
  const [forceStopPolling, setForceStopPolling] = useState(false)

  // Track if we've already notified about analysis completion to prevent duplicates
  const [hasNotifiedCompletion, setHasNotifiedCompletion] = useState(false)

  const [notificationDocumentId, setNotificationDocumentId] = useState(document?.id)
  if (notificationDocumentId !== document?.id) {
    setNotificationDocumentId(document?.id)
    setHasNotifiedCompletion(false)
  }

  // Component mount/unmount logging
  React.useEffect(() => {
    console.log('🏗️ DocumentDetailsView mounted for document:', document?.id)
    return () => {
      console.log('🏗️ DocumentDetailsView unmounting for document:', document?.id)
    }
  }, [document?.id])

  // Debug logging for isAnalyzing state changes
  React.useEffect(() => {
    console.log('📊 isAnalyzing state changed:', {
      isAnalyzing,
      documentId: document?.id,
      documentStatus: document?.processing?.currentStatus,
      timestamp: new Date().toISOString()
    })
  }, [isAnalyzing, document?.id, document?.processing?.currentStatus])
  const [isCancelling, setIsCancelling] = useState(false)
  const [showFileViewer, setShowFileViewer] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<{
    progress: number
    currentStep?: string
    estimatedCompletion?: string
  }>({ progress: 0 })

  const [observedProcessing, setObservedProcessing] = useState<{ id?: string; status?: string }>({})
  if (observedProcessing.id !== document?.id || observedProcessing.status !== document?.processing?.currentStatus) {
    setObservedProcessing({ id: document?.id, status: document?.processing?.currentStatus })
    if (document?.processing?.currentStatus === 'PROCESSING') {
      setIsAnalyzing(true)
      setHasNotifiedCompletion(false)
      setProcessingStatus({ progress: 0, currentStep: 'Analysis in progress...' })
    }
  }

  // Handler for starting AI analysis
  const handleStartAnalysis = async () => {
    console.log('🚀 [ANALYSIS START] handleStartAnalysis called for document:', document?.name);
    if (!document) {
      console.log('❌ [ANALYSIS START] No document available');
      return;
    }

    // Check if document has extracted text available
    const hasExtractedText = document.extractedText;
    if (!hasExtractedText) {
      console.log('⚠️ [ANALYSIS START] Document missing extracted text, showing warning');
      console.log('🔍 [ANALYSIS START] Document debug info:', {
        documentId: document.id,
        status: document.processing?.currentStatus,
        hasFilePath: !!document.filePath,
        hasExtractedText: !!document.extractedText,
        canAnalyzeFromFunction: canAnalyzeDocument(document),
        hasContent: document.content ? 'exists' : 'missing'
      });
      notify.warning('AI Analysis', 'Document must have basic processing completed first. Please wait for upload processing to finish.')
      return
    }

    console.log('🔄 [ANALYSIS START] User clicked analyze button - Setting isAnalyzing to true');
    console.log('🔄 [ANALYSIS START] Current isAnalyzing state before setting:', isAnalyzing);
    setIsAnalyzing(true)
    setHasNotifiedCompletion(false) // Reset notification flag for new analysis
    console.log('🔄 [ANALYSIS START] setIsAnalyzing(true) called, should trigger ProcessingProgress visibility');

    // Initialize processing status immediately for better UX
    setProcessingStatus({
      progress: 0,
      currentStep: 'Initializing AI analysis...',
      estimatedCompletion: new Date(Date.now() + 2 * 60 * 1000).toISOString() // 2 minutes estimate
    })

    try {
      // Remove intermediate notification - only show final completion
      // notify.info('AI Analysis', `Starting full AI analysis for "${document.name}"...`)

      // Update status to show request is being sent
      setProcessingStatus({
        progress: 5,
        currentStep: 'Sending analysis request to server...',
        estimatedCompletion: new Date(Date.now() + 2 * 60 * 1000).toISOString()
      })

      const result = await triggerDocumentAnalysis(document.id, {
        includeSecurityAnalysis: true,
        includeEntityExtraction: true,
        includeQualityScoring: true,
        priority: 'normal'
      })

      if (result.success) {
        // Update status to show analysis has started on server
        setProcessingStatus({
          progress: 10,
          currentStep: 'Analysis started on server - processing document...',
          estimatedCompletion: result.estimatedCompletion || new Date(Date.now() + 2 * 60 * 1000).toISOString()
        })

        // Add processing history entry for analysis start
        await updateDocumentField({
          processingHistory: [
            {
              timestamp: new Date().toISOString(),
              event: 'AI Analysis Started',
              success: true,
              details: {
                type: 'full_analysis',
                jobId: result.analysisJobId,
                options: {
                  includeSecurityAnalysis: true,
                  includeEntityExtraction: true,
                  includeQualityScoring: true
                }
              }
            }
          ],
          source: 'processing',
          debounce: false
        })

        console.log('✅ [ANALYSIS START] Analysis triggered successfully, keeping isAnalyzing=true');
        // Remove intermediate notification - only show final completion
        // notify.success('AI Analysis', `Analysis started for "${document.name}". Processing in background...`)
        // playSound(SoundEffect.SUCCESS)
      } else {
        console.log('❌ [ANALYSIS START] Analysis failed to start, setting isAnalyzing=false');
        notify.error('AI Analysis', result.message || 'Failed to start analysis')
        playSound(SoundEffect.ERROR)
        setIsAnalyzing(false)
      }
    } catch (error) {
      console.error('❌ [ANALYSIS START] Error triggering document analysis:', error)
      notify.error('AI Analysis', 'Failed to start analysis. Please try again.')
      playSound(SoundEffect.ERROR)
      console.log('❌ [ANALYSIS START] Setting isAnalyzing=false due to error');
      setIsAnalyzing(false)
    }
  }

  // Handler for cancelling processing
  const handleCancelProcessing = async () => {
    if (!document) return

    setIsCancelling(true)
    try {
      notify.info('Cancelling', `Cancelling processing for "${document.name}"...`)

      const result = await cancelDocumentProcessing(document.id)

      if (result.success) {
        notify.success('Processing Cancelled', result.message)
        playSound(SoundEffect.SUCCESS)
        setIsAnalyzing(false)
        setIsCancelling(false)
        // Refresh document data to reflect changes
        await refreshDocumentData()
      } else {
        notify.error('Cancel Failed', result.message || 'Failed to cancel processing')
        playSound(SoundEffect.ERROR)
        setIsCancelling(false)
      }
    } catch (error) {
      console.error('Error cancelling document processing:', error)
      notify.error('Cancel Failed', 'Failed to cancel processing. Please try again.')
      playSound(SoundEffect.ERROR)
      setIsCancelling(false)
    }
  }

  // Function to refresh document data from API and update store
  const refreshDocumentData = useCallback(async () => {
    try {
      console.log('🔄 Refreshing document data from API...')
      const response = await fetch(`/api/v1/documents/${documentId}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const documentData = await response.json()
        console.log('✅ Document refreshed from API:', documentData)
        console.log('🔍 [REFRESH] Complete Analysis data in refreshed document:', {
          qualityScore: documentData.analysis?.qualityScore,
          readabilityScore: documentData.analysis?.readabilityScore,
          securityClassification: documentData.analysis?.security?.classification,
          securityConfidence: documentData.analysis?.security?.confidenceScore,
          entitiesCount: documentData.analysis?.entities?.length || 0,
          sectionsCount: documentData.content?.sections?.length || 0,
          hasAnalysisData: !!documentData.analysis,
          analysisKeys: documentData.analysis ? Object.keys(documentData.analysis) : []
        })
        setFetchedDocument(documentData)

        // Update the Zustand store with the fresh document data
        const currentDocuments = state.documents
        const documentIndex = currentDocuments.findIndex((d: any) => d.id === documentId)

        if (documentIndex >= 0) {
          const updatedDocuments = [...currentDocuments]
          updatedDocuments[documentIndex] = {
            ...currentDocuments[documentIndex],
            ...documentData,
            // Note: metadata field removed from Document interface - using JSON fields instead
          }
          setDocuments(updatedDocuments)
        }

        return documentData
      } else {
        console.error('Failed to refresh document data:', response.statusText)
      }
    } catch (error) {
      console.error('Error refreshing document data:', error)
    }
  }, [documentId, setFetchedDocument, state.documents, setDocuments])

  // Handler for vectorizing document (synchronous)
  const handleVectorizeDocument = useCallback((useBackgroundJob = false) => {
    if (!document) return

    // Set loading state immediately
    console.log('🚀 Setting vectorizing state to true...')
    setIsVectorizing(true)

    // Start async processing in separate function
    const processVectorization = async () => {
      try {
        console.log('🔄 Starting vectorization process...', { useBackgroundJob })

        notify.info('Vectorizing', `${useBackgroundJob ? 'Queueing' : 'Generating'} embeddings for "${document.name}"...`)

        // Use the new document-specific endpoint
        const response = await fetch(`/api/v1/documents/${document.id}/vectorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            forceReprocess: true,
            useBackgroundJob
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }

        const result = await response.json()

        if (result.success) {
          if (useBackgroundJob) {
            // Background job queued
            notify.success('Vectorization Queued',
              `Job queued: ${result.jobId}. Processing will complete in background.`)
            playSound(SoundEffect.SUCCESS)

            // Start polling for progress updates
            startProgressPolling(result.jobId)
          } else {
            // Synchronous completion
            notify.success('Vectorization Complete',
              `Generated ${result.embeddings.totalChunks} chunks using ${result.embeddings.model}`)
            playSound(SoundEffect.SUCCESS)

            // Update document in store with new embeddings
            applyDocumentToStore(document.id, {
              ...document,
              embeddings: result.embeddings,
              updatedAt: new Date().toISOString()
            })

            // Refresh document data to ensure consistency
            await refreshDocumentData()
          }
        } else {
          throw new Error(result.error || 'Vectorization failed')
        }
      } catch (error) {
        console.error('Error vectorizing document:', error)
        notify.error('Vectorization Failed',
          error instanceof Error ? error.message : 'Failed to generate embeddings. Please try again.')
        playSound(SoundEffect.ERROR)
      } finally {
        if (!useBackgroundJob) {
          console.log('✅ Setting vectorizing state to false...')
          setIsVectorizing(false)
        }
      }
    }

    // Start the async process
    processVectorization()
    // Only depend on document.id to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id, updateDocument, refreshDocumentData, notify, playSound])

  // Progress polling for background jobs
  const startProgressPolling = useCallback((jobId: string) => {
    console.log('📊 Starting progress polling for job:', jobId)

    const pollInterval = setInterval(async () => {
      try {
        // Check document processing status
        const response = await fetch(`/api/v1/documents/${document?.id}/status`, {
          credentials: 'include'
        })

        if (response.ok) {
          const statusData = await response.json()
          const processing = statusData.processing

          if (processing?.currentStatus === 'COMPLETED') {
            clearInterval(pollInterval)
            setIsVectorizing(false)
            notify.success('Background Vectorization Complete',
              `Document "${document?.name}" has been successfully vectorized`)
            playSound(SoundEffect.SUCCESS)
            await refreshDocumentData()
          } else if (processing?.currentStatus === 'FAILED') {
            clearInterval(pollInterval)
            setIsVectorizing(false)
            notify.error('Background Vectorization Failed',
              processing?.error || 'Vectorization job failed')
            playSound(SoundEffect.ERROR)
          } else if (processing?.currentStatus === 'VECTORIZING') {
            // Update progress if needed
            console.log('📈 Vectorization progress:', processing.progress, processing.currentStep)
          }
        }
      } catch (error) {
        console.error('Error polling progress:', error)
      }
    }, 2000) // Poll every 2 seconds

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval)
      if (isVectorizing) {
        setIsVectorizing(false)
        notify.warning('Progress Polling Stopped',
          'Background job may still be running. Check document status later.')
      }
    }, 300000) // 5 minutes
    // Only depend on document.id to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id, isVectorizing, notify, playSound, refreshDocumentData])

  // Handler for deleting document vectors
  const handleDeleteVectors = useCallback(async () => {
    if (!document) return

    const confirmed = window.confirm(
      `Are you sure you want to delete all vector embeddings for "${document.name}"? This action cannot be undone.`
    )

    if (!confirmed) return

    setIsVectorizing(true) // Reuse the same loading state

    try {
      console.log('🗑️ Deleting vectors for document:', document.id)

      notify.info('Deleting Vectors', `Removing embeddings for "${document.name}"...`)

      const response = await fetch('/api/v1/vectors/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          documentId: document.id
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Vectors deleted successfully:', result)

      notify.success('Vectors Deleted', `Deleted ${result.deletedCount} embeddings for "${document.name}"`)
      playSound(SoundEffect.SUCCESS)

      // Refresh document data to update UI
      await refreshDocumentData()

    } catch (error) {
      console.error('Error deleting vectors:', error)
      notify.error('Deletion Failed',
        error instanceof Error ? error.message : 'Failed to delete vectors. Please try again.')
      playSound(SoundEffect.ERROR)
    } finally {
      setIsVectorizing(false)
    }
    // Only depend on document.id to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id, refreshDocumentData, notify, playSound])

  // Polling function to check analysis progress and update when complete
  React.useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null

    // Emergency stop - force stop all polling if flag is set
    if (forceStopPolling) {
      console.log('🛑 EMERGENCY STOP: Polling forcibly disabled')
      return
    }

    if (isAnalyzing && document) {
      console.log('📊 Starting analysis progress polling...', {
        isAnalyzing,
        documentId: document.id,
        documentStatus: document.processing?.currentStatus,
        forceStopPolling,
        timestamp: new Date().toISOString()
      })

      // Only stop polling if document has failed and we weren't already analyzing
      // Allow polling to continue if isAnalyzing is true (user initiated analysis)
      if (document.processing?.currentStatus === 'FAILED' && !isAnalyzing) {
        console.log('📊 Document failed and not analyzing, stopping polling', {
          currentStatus: document.processing?.currentStatus,
          isAnalyzing
        })
        return
      }

      // If document is completed but we're still analyzing, continue polling (analysis may be in progress)
      if (document.processing?.currentStatus === 'COMPLETED' && isAnalyzing) {
        console.log('📊 Document completed but analysis in progress, continuing polling to check for updates');
      }

      pollInterval = setInterval(async () => {
        try {
          console.log('📊 Polling document status for:', document.id)
          const response = await fetch(`/api/v1/documents/${document.id}/status`, {
            credentials: 'include'
          })

          if (response.ok) {
            const statusData = await response.json()
            console.log('📊 Analysis progress update:', statusData)

            // Update processing status
            setProcessingStatus({
              progress: statusData.processingProgress || 0,
              currentStep: statusData.currentStep,
              estimatedCompletion: statusData.estimatedCompletion
            })

            // Check if analysis is complete
            if (statusData.status === 'COMPLETED' && !hasNotifiedCompletion) {
              console.log('✅ Analysis completed! Updating document data...')
              setIsAnalyzing(false)
              setHasNotifiedCompletion(true) // Mark as notified to prevent duplicates

              // Add processing history entry for completion
              await updateDocumentField({
                processingHistory: [
                  {
                    timestamp: new Date().toISOString(),
                    event: 'AI Analysis Completed',
                    success: true,
                    details: {
                      type: 'full_analysis',
                      duration: processingStatus.currentStep ? 'completed' : 'unknown'
                    }
                  }
                ],
                source: 'processing',
                debounce: false
              })

              // Refresh document data to get latest AI analysis results
              console.log('🔄 [ANALYSIS COMPLETE] Refreshing document data after successful analysis')
              const updatedDoc = await refreshDocumentData()

              if (updatedDoc) {
                console.log('✅ [ANALYSIS COMPLETE] Document refreshed successfully:', {
                  documentId: updatedDoc.id,
                  hasAnalysisData: !!updatedDoc.analysis,
                  sectionsCount: updatedDoc.content?.sections?.length || 0,
                  entitiesCount: updatedDoc.analysis?.entities?.length || 0,
                  qualityScore: updatedDoc.analysis?.qualityScore,
                  readabilityScore: updatedDoc.analysis?.readabilityScore,
                  securityClassification: updatedDoc.analysis?.security?.classification,
                  contractAnalysisExists: !!(updatedDoc.analysis as any)?.contractAnalysis,
                  requirementsCount: (updatedDoc.analysis as any)?.contractAnalysis?.requirements?.length || 0,
                  opportunitiesCount: (updatedDoc.analysis as any)?.contractAnalysis?.opportunities?.length || 0
                })
                notify.success('AI Analysis Complete', `Analysis completed for "${updatedDoc.name}". Document updated with AI insights.`)
                playSound(SoundEffect.SUCCESS)
              } else {
                console.warn('⚠️ [ANALYSIS COMPLETE] Document refresh returned null - data may not have updated properly')
                notify.warning('Analysis Complete', 'Analysis finished but document data may need manual refresh.')
              }

              // Clear polling
              if (pollInterval) {
                clearInterval(pollInterval)
                pollInterval = null
              }
            } else if (statusData.status === 'FAILED') {
              console.log('❌ Analysis failed')
              setIsAnalyzing(false)
              notify.error('AI Analysis Failed', (statusData.processing as any)?.error || 'Analysis failed. Please try again.')
              playSound(SoundEffect.ERROR)

              // Clear polling
              if (pollInterval) {
                clearInterval(pollInterval)
                pollInterval = null
              }
            }
          }
        } catch (error) {
          console.error('Error polling analysis status:', error)

          // If it's a network error, don't stop polling but reduce frequency
          if (error instanceof Error && (error.message.includes('Failed to fetch') || error.name === 'TypeError')) {
            console.warn('📊 Network error during polling, will retry...')
            // Continue polling but maybe reduce frequency or add exponential backoff
          } else {
            // For other errors, stop polling
            console.error('📊 Stopping polling due to persistent error')
            if (pollInterval) {
              clearInterval(pollInterval)
              pollInterval = null
            }
            setIsAnalyzing(false)
          }
        }
      }, 3000) // Poll every 3 seconds
    }

    // Cleanup polling on unmount or when analysis stops
    return () => {
      if (pollInterval) {
        console.log('📊 Cleaning up analysis polling interval')
        clearInterval(pollInterval)
        pollInterval = null
      }
    }
  }, [isAnalyzing, document?.id, forceStopPolling])

  // Log document source and metadata check
  console.log('📋 DocumentDetailsView Component State:', {
    documentSource: foundDocument ? 'store' : fetchedDocument ? 'api' : 'none',
    documentId: document?.id || 'no-id',
    hasContent: !!(document?.content)
  })

  // Section ordering state for drag-and-drop
  const [editableSectionOrder, setEditableSectionOrder] = useState(['contract-details', 'tags-keywords', 'entities'])
  const [nonEditableSectionOrder, setNonEditableSectionOrder] = useState(['ai-analysis', 'security-analysis', 'processing-history', 'vector-analysis'])

  // Editing states for document fields - gracefully handles documents without AI data
  const [editableData, setEditableData] = useState(() => ({
    tags: [] as string[], // Will be populated when document loads
    contractValue: '', // Will be populated when document loads
    deadline: '', // Will be populated when document loads
    documentType: 'OTHER', // Will be populated when document loads
    urgencyLevel: 'medium', // User-defined priority
    entities: [] as Array<Document['entities']['entities'][number] & { value: string }> // Will be populated when document loads
  }))

  // Auto-save state management
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set())
  const autoSaveTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const [lastSavedData, setLastSavedData] = useState<typeof editableData>(editableData)

  const [editingField, setEditingField] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState<string>('')

  // Track document ID to prevent unnecessary resets
  const [lastDocumentId, setLastDocumentId] = React.useState<string | null>(null)

  // Local state for AI keywords to prevent UI resets
  const [localAIKeywords, setLocalAIKeywords] = useState<string[]>([])

  const keywordSource = JSON.stringify(document?.content?.keywords ?? [])
  const [previousKeywords, setPreviousKeywords] = useState(keywordSource)
  if (!hasUnsavedChanges && previousKeywords !== keywordSource) {
    setPreviousKeywords(keywordSource)
    setLocalAIKeywords(document?.content?.keywords ?? [])
  }

  if (document && document.id !== lastDocumentId) {
      setEditableData({
        tags: document.tags || [], // User tags from database
        contractValue: document.analysis?.contract?.estimatedValue ||
                      document.analysis?.contractAnalysis?.estimatedValue ||
                      document.contractValue || '', // From AI contract analysis or alternative sources
        deadline: document.analysis?.contract?.deadlines?.[0] ||
                 document.analysis?.contract?.timeline ||
                 document.deadline || '', // From AI contract analysis or alternative sources
        documentType: document.documentType || 'OTHER', // Basic document type from database
        urgencyLevel: 'medium', // User-defined priority
        entities: document.entities?.entities?.map(entity => ({
          ...entity,
            type: entity.type,
          value: entity.text
        })) || [] // AI-extracted entities (empty if not processed)
      })

      setSectionEdits({});
      setPendingChanges({});
      setHasUnsavedChanges(false);
      setLastDocumentId(document.id)
      // Update last saved data to match initial document state
      setLastSavedData({
        tags: document.tags || [],
        contractValue: document.analysis?.contract?.estimatedValue ||
                      document.analysis?.contractAnalysis?.estimatedValue ||
                      document.contractValue || '',
        deadline: document.analysis?.contract?.deadlines?.[0] ||
                 document.analysis?.contract?.timeline ||
                 document.deadline || '',
        documentType: document.documentType || 'OTHER',
        urgencyLevel: 'medium',
        entities: document.entities?.entities?.map(entity => ({
          ...entity,
            type: entity.type,
          value: entity.text
        })) || []
      })

  }


  // Cleanup auto-save timeouts on unmount
  React.useEffect(() => {
    return () => {
      // Clear all pending timeouts
      autoSaveTimeouts.current.forEach(timeout => clearTimeout(timeout))
      autoSaveTimeouts.current.clear()
    }
  }, [])

  React.useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) {
        setLeftSidebarOpen(false)
        setRightSidebarOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  React.useEffect(() => {
    const observePanelResize = () => {
      if (rightPanelRef.current) {
        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const width = entry.contentRect.width
            console.log('🔧 Panel width changed:', width)
            setRightPanelWidth(width)
          }
        })

        resizeObserver.observe(rightPanelRef.current)

        // Set initial width with a slight delay to ensure proper measurement
        setTimeout(() => {
          if (rightPanelRef.current) {
            const initialWidth = rightPanelRef.current.offsetWidth
            console.log('🔧 Initial panel width:', initialWidth)
            setRightPanelWidth(initialWidth)
          }
        }, 100)

        return resizeObserver
      }
    }

    const observer = observePanelResize()
    return () => {
      if (observer) {
        observer.disconnect()
      }
    }
  }, [rightSidebarOpen])

  React.useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  // TODO: Replace with PlateEditor implementation
  const editor = null

  // Track if the section change was user-initiated or automatic
  const [lastUserSelectedSectionId, setLastUserSelectedSectionId] = React.useState<string | null>(null)

  // TODO: Replace with PlateEditor logic
  // React.useEffect(() => {
  //   if (editor && selectedSection) {
  //     // Only update editor content if this is a user-initiated section change
  //     // or if the editor is empty/different from the selected section
  //     const currentContent = editor.getHTML()
  //     const isContentEmpty = currentContent === '<p></p>' || currentContent.trim() === ''
  //     const isUserSelection = selectedSection.id === lastUserSelectedSectionId
  //
  //     // Update editor content only when:
  //     // 1. User explicitly selected a section, OR
  //     // 2. Editor is empty and needs initial content, OR
  //     // 3. Selected section content is significantly different from editor content
  //     if (isUserSelection || isContentEmpty || currentContent !== selectedSection.content) {
  //       console.log('📝 Setting editor content for section:', selectedSection.id, {
  //         isUserSelection,
  //         isContentEmpty,
  //         contentChanged: currentContent !== selectedSection.content
  //       })
  //       editor.commands.setContent(selectedSection.content)
  //     }
  //   }
  // }, [selectedSection, editor, lastUserSelectedSectionId])

  // React.useEffect(() => {
  //   if (editor) {
  //     editor.setEditable(isEditing)
  //   }
  // }, [isEditing, editor])

  const ToolbarButton = ({ onClick, isActive = false, disabled = false, children, tooltip }: {
    onClick: () => void
    isActive?: boolean
    disabled?: boolean
    children: React.ReactNode
    tooltip?: string
  }) => (
    <Button
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 flex-shrink-0"
      title={tooltip}
    >
      {children}
    </Button>
  )

  const handleTitleSubmit = async () => {
    setIsEditingTitle(false)
    if (document && documentTitle !== document.name) {
      await handleSaveDocument()
    }
  }

  const handleSaveDocument = async (overrideData?: Partial<typeof editableData>) => {
    if (!document) return

    // Use override data if provided, otherwise use current state
    const dataToSave = overrideData ? { ...editableData, ...overrideData } : editableData

    console.log('💾 Saving document with data:', {
      contractValue: dataToSave.contractValue,
      deadline: dataToSave.deadline
    })

    try {
      const updatedSections = Object.keys(sectionEdits).length
        ? applySectionEdits(document.content?.sections ?? [], sectionEdits)
        : null;

      // Prepare the payload for the API
      const payload: any = {
        name: documentTitle === removeFileExtension(document.name) ? document.name : documentTitle,
        documentType: dataToSave.documentType,
        tags: dataToSave.tags,
        description: document.description, // Preserve existing description
        entities: dataToSave.entities // Add entities to payload
      }

      // Always include contract analysis to preserve existing data
      payload.analysis = {
        ...document.analysis,
        contract: {
          ...document.analysis?.contract,
          estimatedValue: dataToSave.contractValue,
          deadlines: dataToSave.deadline ? [dataToSave.deadline] : []
        }
      }

      // Include updated sections if editor content was modified
      if (pendingChanges.content) payload.content = { ...document.content, ...pendingChanges.content };
      if (updatedSections && document.content) {
        const databaseSections = updatedSections;
        payload.content = { ...document.content, ...pendingChanges.content, sections: databaseSections };
        console.log('📝 Including updated sections in payload:', databaseSections)
      }

      console.log('📤 Sending PATCH request to update document:', document.id)

      // Update the document via API using PATCH for partial updates
      const response = await fetch(`/api/v1/documents/${document.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to update document')
      }

      const result = await response.json()
      console.log('📥 API Response:', result)

      if (!result.success || !result.document) {
        throw new Error(result.error || 'The server did not confirm the document update');
      }
      if (result.success && result.document) {
        // Use the full document data from the API response
        const updatedDoc = result.document

        console.log('🔄 PATCH Response - Full Updated Document:', updatedDoc)
        console.log('🔍 PATCH Response - Key Fields Check:', {
          tags: updatedDoc.tags,
          contractAnalysis: updatedDoc.analysis?.contractAnalysis
        })

        // CRITICAL FIX: Create a complete merged document that preserves all data
        const completeUpdatedDoc = {
          ...document, // Start with current document (preserves all existing fields)
          ...updatedDoc, // Override with API response data
          // Ensure critical fields are preserved if missing from API response
          content: updatedDoc.content || document.content,
          analysis: updatedDoc.analysis || document.analysis,
          entities: updatedDoc.entities || document.entities,
          processing: updatedDoc.processing || document.processing,
          lastModified: new Date().toISOString()
        }

        console.log('📝 Content sections in response:', completeUpdatedDoc.content?.sections)

        console.log('🔍 Complete merged document:', {
          hasContent: !!completeUpdatedDoc.content,
          hasSections: !!completeUpdatedDoc.content?.sections?.length,
          hasAnalysis: !!completeUpdatedDoc.analysis,
          sectionsCount: completeUpdatedDoc.content?.sections?.length || 0,
          analysisKeys: completeUpdatedDoc.analysis ? Object.keys(completeUpdatedDoc.analysis) : []
        })

        // Update fetchedDocument with complete merged data
        setFetchedDocument(completeUpdatedDoc)

        // The PATCH above already persisted the update. Refresh local state only.
        const currentDocuments = useDocumentChatStore.getState().documents.documents;
        setDocuments(currentDocuments.some(item => item.id === document.id)
          ? currentDocuments.map(item => item.id === document.id ? completeUpdatedDoc : item)
          : [...currentDocuments, completeUpdatedDoc]);

        // CRITICAL FIX: Update editableData using the complete merged document
        setEditableData(prev => ({
          ...prev, // Preserve all existing editable data
          // Update fields from the complete merged document
          tags: completeUpdatedDoc.tags || prev.tags || [],
          documentType: completeUpdatedDoc.documentType || prev.documentType || 'OTHER',
          contractValue: completeUpdatedDoc.analysis?.contractAnalysis?.estimatedValue ||
                        completeUpdatedDoc.analysis?.contract?.estimatedValue ||
                        prev.contractValue || '',
          deadline: completeUpdatedDoc.analysis?.contractAnalysis?.deadlines?.[0] ||
                   completeUpdatedDoc.analysis?.contract?.deadlines?.[0] ||
                   prev.deadline || '',
          entities: completeUpdatedDoc.entities?.entities?.map((entity: any) => ({
            ...entity,
            type: entity.type,
            value: entity.text
          })) || prev.entities || []
        }))

        console.log('✅ UI State Updated - Document should now display fresh PATCH data')
      }

      // If we updated sections and there's a selected section, update the current section content
      if (updatedSections && selectedSection) {
        const updatedSection = updatedSections.find(s => s.id === selectedSection.id)
        if (updatedSection) {
          console.log('📝 Updating selected section with saved content')
          setSelectedSection(updatedSection)
        }
      }

      // Show success notification
      setSectionEdits({});
      setHasUnsavedChanges(false);
      notify.success('Document Saved', 'All changes have been saved to the database.')
      console.log('✅ Document saved successfully and store updated')
    } catch (err) {
      console.error('❌ Failed to save document:', err)
      notify.error('Failed to Save Document', 'Please check your connection and try again.')
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit()
    } else if (e.key === 'Escape') {
      setDocumentTitle(removeFileExtension(document?.name ?? ''))
      setIsEditingTitle(false)
    }
  }

  // File upload handler for created documents
  const handleFileUpload = async (file: File) => {
    if (!document || !file) return

    try {
      setIsUploadingFile(true)
      notify.info('Uploading File', `Uploading "${file.name}" to document...`)

      // Validate file using the file manager
      const validation = fileOps.validateFile(file)
      if (!validation.isValid) {
        notify.error('Invalid File', validation.error || 'File type not supported')
        return
      }

      // Create FormData for upload
      const formData = new FormData()
      formData.append('file', file)

      // Upload file via the new API endpoint
      const response = await fetch(`/api/v1/documents/${document.id}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'File upload failed')
      }

      const result = await response.json()
      notify.success('File Uploaded', `"${file.name}" has been uploaded successfully!`)

      // Refresh the page to show the updated document with file
      window.location.reload()

    } catch (error) {
      console.error('File upload error:', error)
      notify.error('Upload Failed', error instanceof Error ? error.message : 'Failed to upload file')
    } finally {
      setIsUploadingFile(false)
    }
  }

  // File input handler
  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
    // Reset input
    event.target.value = ''
  }

  // Field editing handlers
  const startEditing = (field: string, currentValue: string = '') => {
    console.log(`✏️ Starting edit for field '${field}' with current value:`, currentValue)
    setEditingField(field)
    setTempValue(currentValue)
  }

  const saveField = (field: string) => {
    console.log(`🔄 saveField called for '${field}' with tempValue:`, tempValue)

    let newValue: any

    if (field === 'tags') {
      newValue = tempValue.split(',').map(item => item.trim()).filter(item => item)
    } else if (field === 'entities') {
      return // Entity arrays are handled by the dedicated entity editor
    } else {
      newValue = tempValue
    }

    // Close editing mode immediately
    setEditingField(null)
    setTempValue('')

    // Store change in pending changes - will save when user clicks Save
    setPendingChanges(prev => ({ ...prev, [field]: newValue }))
    setHasUnsavedChanges(true)
  }

  // cancelEditing function moved below - see comprehensive version with pending changes handling

  const saveFieldDirectly = (field: string, value: any) => {
    console.log(`🔄 saveFieldDirectly called for '${field}' with value:`, value)

    // Update local state immediately
    setEditableData(prev => ({ ...prev, [field]: value }))

    // Store change in pending changes - will save when user clicks Save
    setPendingChanges(prev => ({ ...prev, [field]: value }))
    setHasUnsavedChanges(true)
  }

  const updateAIKeywords = (updatedKeywords: string[]) => {
    console.log(`🔄 updateAIKeywords called with:`, updatedKeywords)
    console.log('Current localAIKeywords before update:', localAIKeywords)

    // Only update local state for UI feedback - no API calls during editing
    setLocalAIKeywords(updatedKeywords)
    console.log('✅ setLocalAIKeywords called with:', updatedKeywords)

    // Track as pending change
    setPendingChanges(prev => {
      const newChanges = {
        ...prev,
        content: {
          ...document!.content,
          ...prev.content,
          keywords: updatedKeywords
        }
      }
      console.log('✅ setPendingChanges called with:', newChanges)
      return newChanges
    })
    setHasUnsavedChanges(true)
    console.log('✅ setHasUnsavedChanges(true) called')
  }

  const updateAIKeywordsImmediate = async (updatedKeywords: string[]) => {
    console.log(`🚀 updateAIKeywordsImmediate called with:`, updatedKeywords)

    if (!document?.id) {
      console.error('❌ No document ID available for immediate save')
      return
    }

    // Update local state immediately for UI feedback
    setLocalAIKeywords(updatedKeywords)

    try {
      // Save immediately to database
      const response = await fetch(`/api/v1/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            keywords: updatedKeywords
          }
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Immediate keywords save failed:', response.status, errorText)
        throw new Error(`Save failed: ${response.status} - ${errorText}`)
      }

      const responseData = await response.json()
      console.log('✅ Keywords saved immediately to database')

      // Update store with response to keep everything in sync
      if (responseData.document) {
        applyDocumentToStore(document.id, responseData.document)
      }

    } catch (error) {
      console.error('❌ Error saving keywords immediately:', error)
      // Revert local state on error
      setLocalAIKeywords(document?.content?.keywords || [])
      // Could show a toast notification here if available
    }
  }

  const saveAllChanges = async () => {
    if (!document || !document.id || !hasUnsavedChanges) {
      console.log('🔄 No changes to save')
      return
    }

    console.log('💾 Saving all pending changes:', pendingChanges)

    try {
      const response = await fetch(`/api/v1/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingChanges)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Save failed:', response.status, errorText)
        throw new Error(`Save failed: ${response.status} - ${errorText}`)
      }

      const responseData = await response.json()
      console.log('✅ All changes saved successfully')

      // Update store with response
      if (responseData.document) {
        applyDocumentToStore(document.id, responseData.document)
      }

      // Clear pending changes
      setPendingChanges({})
      setHasUnsavedChanges(false)

      // Show success message
      if (notify) {
        notify.success('Changes saved successfully!')
      }

      // Exit editing mode
      setIsEditing(false)

    } catch (error) {
      console.error('❌ Failed to save changes:', error)
      if (notify) {
        notify.error('Failed to save changes', 'Please try again.')
      }
    }
  }

  const cancelEditing = () => {
    console.log('❌ Canceling editing mode')

    // Revert all local changes
    if (document) {
      setLocalAIKeywords(document.content?.keywords || [])
      setEditableData({
        tags: document.tags || [],
        contractValue: document.analysis?.contract?.estimatedValue ||
                      document.analysis?.contractAnalysis?.estimatedValue ||
                      document.contractValue || '',
        deadline: document.analysis?.contract?.deadlines?.[0] ||
                 document.analysis?.contract?.timeline ||
                 document.deadline || '',
        documentType: document.documentType || 'OTHER',
        urgencyLevel: 'medium',
        entities: document.entities?.entities?.map(entity => ({
          ...entity,
            type: entity.type,
          value: entity.text
        })) || []
      })
    }

    // Clear all pending changes
    setPendingChanges({})
    setHasUnsavedChanges(false)
    setEditingField(null)
    setTempValue('')

    // Exit editing mode
    setIsEditing(false)
  }

  /**
   * FUTURE-READY: Centralized document update function for all field types
   * Supports user edits, AI analysis updates, security analysis, processing history, and vector properties
   * Designed to handle both immediate (AI/system) and debounced (user) updates
   *
   * USAGE EXAMPLES:
   *
   * 1. User field update (current functionality):
   *    await updateDocumentField({
   *      field: 'tags',
   *      value: ['contract', 'proposal'],
   *      source: 'user'
   *    })
   *
   * 2. AI analysis update (future):
   *    await updateDocumentField({
   *      aiAnalysis: {
   *        analysis: { entities: [...], confidence: 0.95 },
   *        contractAnalysis: { estimatedValue: '$500K', deadlines: [...] }
   *      },
   *      source: 'ai',
   *      debounce: false  // AI updates are immediate
   *    })
   *
   * 3. Security analysis update (future):
   *    await updateDocumentField({
   *      securityAnalysis: {
   *        classification: 'SENSITIVE',
   *        piiDetected: true,
   *        piiTypes: ['SSN', 'EMAIL'],
   *        complianceStatus: 'needs-review'
   *      },
   *      source: 'security',
   *      debounce: false
   *    })
   *
   * 4. Processing history update (future):
   *    await updateDocumentField({
   *      processingHistory: [{
   *        timestamp: new Date().toISOString(),
   *        event: 'AI Analysis Completed',
   *        success: true,
   *        details: { model: 'gpt-4', duration: '2.3s' }
   *      }],
   *      source: 'processing',
   *      debounce: false
   *    })
   *
   * 5. Batch update (multiple fields at once):
   *    await updateDocumentField({
   *      batchUpdates: {
   *        tags: ['important', 'priority']
   *      },
   *      source: 'batch',
   *      debounce: false
   *    })
   *
   * 6. Vector properties update (future AI integration):
   *    await updateDocumentField({
   *      aiAnalysis: {
   *        vectorProperties: {
   *          chunks: [...],
   *          embeddings: [...],
   *          lastIndexedAt: new Date().toISOString()
   *        }
   *      },
   *      source: 'ai',
   *      debounce: false
   *    })
   */
  const updateDocumentField = async (updates: {
    // User-editable fields (current functionality)
    field?: string
    value?: any

    // AI-driven update payload (for future AI analysis updates)
    aiAnalysis?: {
      content?: any           // AI content analysis updates
      analysis?: any          // AI analysis results
      contractAnalysis?: any  // AI contract analysis
      complianceCheck?: any   // AI compliance analysis
      vectorProperties?: any  // AI vector analysis
    }

    // Security analysis updates (for future security tools)
    securityAnalysis?: {
      classification?: string
      piiDetected?: boolean
      piiTypes?: string[]
      complianceStatus?: string
      redactionNeeded?: boolean
    }

    // Processing history updates (for future processing tracking)
    processingHistory?: Array<{
      timestamp: string
      event: string
      success: boolean
      details?: any
    }>

    // Batch updates (for multiple field updates at once)
    batchUpdates?: Record<string, any>

    // Update source tracking
    source?: 'user' | 'ai' | 'security' | 'processing' | 'batch'

    // Debounce control (user updates get debounced, AI/system updates are immediate)
    debounce?: boolean
  }) => {
    if (!document) return

    const {
      field,
      value,
      aiAnalysis,
      securityAnalysis,
      processingHistory,
      batchUpdates,
      source = 'user',
      debounce = source === 'user'
    } = updates

    console.log(`🔄 Document update triggered:`, {
      field,
      source,
      hasAiAnalysis: !!aiAnalysis,
      hasSecurityAnalysis: !!securityAnalysis,
      hasProcessingHistory: !!processingHistory,
      hasBatchUpdates: !!batchUpdates
    })

    // Determine update key for timeout management
    const updateKey = field || `${source}_${Date.now()}`

    // Handle debouncing for user updates
    if (debounce) {
      const existingTimeout = autoSaveTimeouts.current.get(updateKey)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }
      setSavingFields(prev => new Set([...prev, updateKey]))
    }

    // Update local state immediately for user field updates
    if (source === 'user' && field && value !== undefined) {
      setEditableData(prev => {
        const updated = { ...prev, [field]: value }
        console.log(`✅ UI updated immediately for field '${field}':`, updated)
        return updated
      })

      // CRITICAL FIX: Update store immediately with partial update (merge, don't replace)
      // Use existing document as base to preserve all other fields
      const existingDoc = findDocument(document.id)
      if (existingDoc) {
        applyDocumentToStore(document.id, {
          ...existingDoc, // Preserve all existing fields
          [field]: value, // Apply the immediate update
          lastModified: new Date().toISOString()
        })
      } else {
        // Fallback to partial update if document not in store
        applyDocumentToStore(document.id, { [field]: value })
      }
    }

    // Build update payload based on update type and source
    const buildUpdatePayload = () => {
      let saveData: any = {}

      // Handle user field updates (current functionality)
      if (source === 'user' && field && value !== undefined) {
        if (field === 'documentType') {
          // Validate document type against enum values
          const validDocumentTypes = Object.values(DocumentType)
          if (validDocumentTypes.includes(value as DocumentType)) {
            saveData[field] = value
            console.log('✅ [VALIDATION] Valid document type:', value)
          } else {
            console.warn('⚠️ [VALIDATION] Invalid document type rejected:', value, 'Valid types:', validDocumentTypes)
            notify.warning('Invalid Document Type', `"${value}" is not a valid document type. Using "OTHER" instead.`)
            saveData[field] = DocumentType.OTHER
          }
        } else if (field === 'tags') {
          saveData[field] = Array.isArray(value) ? value : value.split(',').map((item: string) => item.trim()).filter((item: string) => item)
        } else if (field === 'contractValue' || field === 'deadline') {
          saveData.contractAnalysis = {
            ...(field === 'contractValue' ? { estimatedValue: value } : {}),
            ...(field === 'deadline' ? { deadlines: [value] } : {})
          }
        } else if (field === 'entities') {
          saveData.entities = Array.isArray(value) ? value : []
        }
      }

      // Handle AI analysis updates (future AI integration)
      if (aiAnalysis) {
        if (aiAnalysis.content) {
          saveData.content = { ...saveData.content, ...aiAnalysis.content }
        }
        if (aiAnalysis.analysis) {
          saveData.analysis = { ...saveData.analysis, ...aiAnalysis.analysis }
        }
        if (aiAnalysis.contractAnalysis) {
          saveData.analysis = { ...saveData.analysis, contractAnalysis: aiAnalysis.contractAnalysis }
        }
        if (aiAnalysis.complianceCheck) {
          saveData.analysis = { ...saveData.analysis, complianceCheck: aiAnalysis.complianceCheck }
        }
        if (aiAnalysis.vectorProperties) {
          saveData.embeddings = { ...saveData.embeddings, ...aiAnalysis.vectorProperties }
        }
      }

      // Handle security analysis updates (future security tools)
      if (securityAnalysis) {
        if (securityAnalysis.classification) {
          saveData.securityClassification = securityAnalysis.classification
        }
        // Full security analysis object
        saveData.securityAnalysis = securityAnalysis
      }

      // Processing events are persisted by the server job; clients refresh them from the response.

      // Handle batch updates (multiple fields at once)
      if (batchUpdates) {
        saveData = { ...saveData, ...batchUpdates }
      }

      return saveData
    }

    // Execute the save operation
    const executeSave = async () => {
      try {
        console.log(`💾 Updating document from ${source}...`)

        const saveData = buildUpdatePayload()

        if (Object.keys(saveData).length === 0) {
          console.warn('No data to save, skipping update')
          return
        }

        // CRITICAL FIX: Add race condition protection
        // Store current document state before API call to detect if it changed during the request
        const documentStateBeforeApi = findDocument(document.id)

        console.log(`💾 Sending update request with data:`, saveData)
        console.log(`💾 Document ID:`, document.id)
        console.log(`💾 Request URL:`, `/api/v1/documents/${document.id}`)

        let requestBody: string
        try {
          requestBody = JSON.stringify(saveData)
          console.log(`💾 Request body:`, requestBody)
        } catch (caughtStringifyerror) {
      const stringifyError = normalizeError(caughtStringifyerror);
          console.error('❌ Failed to stringify save data:', stringifyError)
          console.error('❌ Save data causing issues:', saveData)
          throw new Error(`Failed to prepare request data: ${stringifyError.message}`)
        }

        const response = await fetch(`/api/v1/documents/${document.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: requestBody
        })

        console.log(`💾 Response status:`, response.status)
        console.log(`💾 Response statusText:`, response.statusText)
        console.log(`💾 Response headers:`, Object.fromEntries(response.headers.entries()))
        console.log(`💾 Response ok:`, response.ok)

        if (response.ok) {
          const updatedDoc = await response.json()
          console.log(`✅ Document updated successfully from ${source}:`, updatedDoc.document)

          // CRITICAL FIX: Race condition protection - check if document changed during API call
          const currentDocumentState = findDocument(document.id)
          const documentChangedDuringRequest = currentDocumentState &&
            documentStateBeforeApi &&
            currentDocumentState.lastModified !== documentStateBeforeApi.lastModified

          if (documentChangedDuringRequest) {
            console.warn('⚠️ Document was modified during API request, using careful merge to prevent data loss')
          }

          // Update fetchedDocument with fresh data
          setFetchedDocument(updatedDoc.document)

          // CRITICAL FIX: Merge updated data with existing document instead of replacing
          // Use the most current document state for merging to prevent race conditions
          const existingDoc = findDocument(document.id)
          const mergedDocument = {
            ...existingDoc, // Preserve all existing fields from current state
            ...updatedDoc.document, // Apply updates from API response
            // Ensure critical nested objects are preserved if not in response
            content: updatedDoc.document.content || existingDoc?.content,
            entities: updatedDoc.document.entities || existingDoc?.entities,
            analysis: updatedDoc.document.analysis || existingDoc?.analysis,
            aiData: updatedDoc.document.aiData || existingDoc?.aiData,
            lastModified: new Date().toISOString()
          }

          // Update the document in the store with merged data
          applyDocumentToStore(document.id, mergedDocument)

          // Update local editableData for user updates with proper data preservation
          if (source === 'user') {
            setEditableData(prev => ({
              ...prev, // CRITICAL: Preserve all existing editable data
              // Only update fields that were actually returned in the response
              ...(updatedDoc.document.tags !== undefined && {
                tags: updatedDoc.document.tags || []
              }),
              ...(updatedDoc.document.documentType !== undefined && {
                documentType: updatedDoc.document.documentType || 'OTHER'
              }),
              // Preserve contract analysis values if available
              ...(updatedDoc.document.analysis?.contractAnalysis?.estimatedValue !== undefined && {
                contractValue: updatedDoc.document.analysis.contractAnalysis.estimatedValue || ''
              }),
              ...(updatedDoc.document.analysis?.contractAnalysis?.deadlines?.[0] !== undefined && {
                deadline: updatedDoc.document.analysis.contractAnalysis.deadlines[0] || ''
              }),
              // Preserve entities if available
              ...(updatedDoc.document.analysis?.entities !== undefined && {
                entities: updatedDoc.document.analysis.entities.map((entity: any) => ({
                  ...entity,
            type: entity.type,
                  value: entity.text
                })) || prev.entities // Fallback to previous entities
              })
            }))

            // Update last saved data for user updates
            if (field) {
              setLastSavedData(prev => ({ ...prev, [field]: value }))
            }
          }

        } else {
          let errorData: any = {}
          let errorText = ''

          console.error(`❌ API Request failed with status:`, response.status, response.statusText)

          try {
            const responseText = await response.text()
            errorText = responseText
            console.error(`❌ Raw response text:`, responseText)

            if (responseText.trim()) {
              errorData = JSON.parse(responseText)
            } else {
              errorData = { error: 'Empty response body' }
            }
          } catch (parseError) {
            console.error('❌ Failed to parse error response:', parseError)
            errorData = { error: `Response parsing failed. Raw response: "${errorText}"` }
          }

          const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`
          console.error(`❌ API Error Response:`, {
            status: response.status,
            statusText: response.statusText,
            errorData,
            responseText: errorText,
            url: `/api/v1/documents/${document.id}`,
            method: 'PATCH',
            requestBody: requestBody.substring(0, 500) + (requestBody.length > 500 ? '...' : '')
          })
          throw new Error(`Failed to update document: ${errorMessage}`)
        }
      } catch (error) {
        console.error(`❌ Document update failed for ${source}:`, error)
        console.error(`❌ Save data attempted:`, buildUpdatePayload())
        console.error(`❌ Document ID:`, document.id)
        console.error(`❌ Field:`, field, 'Value:', value)

        // CRITICAL FIX: Revert UI state on error for user updates (partial revert)
        if (source === 'user' && field) {
          const lastValue = lastSavedData[field as keyof typeof lastSavedData]

          // Revert local editable data to last saved value
          setEditableData(prev => ({
            ...prev,
            [field]: lastValue
          }))

          // Revert store to last saved value (partial update, preserve other fields)
          const existingDoc = findDocument(document.id)
          if (existingDoc) {
            applyDocumentToStore(document.id, {
              ...existingDoc,
              [field]: lastValue,
              lastModified: new Date().toISOString()
            })
          }
        }
      } finally {
        if (debounce) {
          setSavingFields(prev => {
            const newSet = new Set(prev)
            newSet.delete(updateKey)
            return newSet
          })
          autoSaveTimeouts.current.delete(updateKey)
        }
      }
    }

    // Execute with or without debounce based on source
    if (debounce) {
      const timeoutId = setTimeout(executeSave, 1000)
      autoSaveTimeouts.current.set(updateKey, timeoutId)
    } else {
      // Execute immediately for AI/system updates
      await executeSave()
    }
  }

  // autoSaveField removed - all changes now stored in pendingChanges and saved explicitly


  /**
   * Handle dropdown/select changes - store in pending changes
   */
  const handleSelectChange = (field: string, value: string) => {
    console.log(`🔄 Select change for field '${field}':`, value)

    // Close any open editing state
    setEditingField(null)
    setTempValue('')

    // Store change in pending changes - will save when user clicks Save
    setPendingChanges(prev => ({ ...prev, [field]: value }))
    setHasUnsavedChanges(true)
  }


  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      saveField(field)
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  const addEntity = () => {
    const newEntity = {
      id: crypto.randomUUID(), type: EntityType.ORGANIZATION, text: 'New Entity',
      value: 'New Entity', confidence: 1, startOffset: 0, endOffset: 0, context: null, metadata: null,
    }

    // Update state first
    setEditableData(prev => {
      const updatedEntities = [...prev.entities, newEntity]

      // Store entities change in pending changes - will save when user clicks Save
      setTimeout(() => {
        setPendingChanges(prev => ({ ...prev, entities: { entities: updatedEntities } }))
        setHasUnsavedChanges(true)
      }, 0)

      return {
        ...prev,
        entities: updatedEntities
      }
    })
  }

  const removeEntity = (index: number) => {
    setEditableData(prev => {
      const updatedEntities = prev.entities.filter((_, i) => i !== index)

      // Store entities change in pending changes - will save when user clicks Save
      setTimeout(() => {
        setPendingChanges(prev => ({ ...prev, entities: { entities: updatedEntities } }))
        setHasUnsavedChanges(true)
      }, 0)

      return {
        ...prev,
        entities: updatedEntities
      }
    })
  }

  const updateEntity = (index: number, field: 'type' | 'value', value: string) => {
    setEditableData(prev => {
      const updatedEntities = prev.entities.map((entity, i) =>
        i === index ? (field === 'value' ? { ...entity, value, text: value } : { ...entity, type: Object.values(EntityType).find(type => type === value.toUpperCase()) ?? EntityType.MISC }) : entity
      )

      // Store entities change in pending changes - will save when user clicks Save
      setTimeout(() => {
        setPendingChanges(prev => ({ ...prev, entities: { entities: updatedEntities } }))
        setHasUnsavedChanges(true)
      }, 0)

      return {
        ...prev,
        entities: updatedEntities
      }
    })
  }

  const addImage = useCallback(() => {
    // TODO: Replace with PlateEditor image insertion
    const url = window.prompt('Enter image URL')
    if (url) {
      console.log('Image URL:', url) // Placeholder for now
    }
  }, [])

  const setLink = useCallback(() => {
    // TODO: Replace with PlateEditor link functionality
    const url = window.prompt('URL', '')

    if (url === null) {
      return
    }

    if (url === '') {
      console.log('Remove link') // Placeholder for now
      return
    }

    console.log('Set link:', url) // Placeholder for now
  }, [])

  const formatUrgency = (level: string) => {
    const colors = {
      low: 'default',
      medium: 'secondary',
      high: 'destructive',
      critical: 'destructive'
    } as const
    return colors[level as keyof typeof colors] || 'default'
  }

  const formatSentiment = (sentiment: string) => {
    const colors = {
      positive: 'default',
      negative: 'destructive',
      neutral: 'secondary'
    }
    return colors[sentiment as keyof typeof colors] || 'secondary'
  }

  // Determine if we should use 2-column layout based on panel width
  const useColumnLayout = rightPanelWidth > 400 && !isMobile

  // Debug: log when layout should change
  React.useEffect(() => {
    console.log('🔧 Layout Update:', {
      panelWidth: rightPanelWidth,
      isMobile,
      useColumnLayout,
      threshold: 400,
      rightSidebarOpen
    })
  }, [rightPanelWidth, isMobile, useColumnLayout, rightSidebarOpen])

  // Main status polling is handled above in the comprehensive polling effect

  // Define sections with their editable status - only calculate when document exists
  const cardSections = React.useMemo(() => {
    if (!document) return [];

    return [
    // Editable sections (show at top)
    {
      id: 'contract-details',
      isEditable: true,
      component: (
        <Card key="contract-details">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Contract Details
              {isEditing && (
                <Badge variant="outline" className="ml-auto text-xs">
                  Editable
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-3">
              {/* Contract Value */}
              <div className="flex justify-between items-center text-sm min-w-0">
                <span className="text-muted-foreground shrink-0">Value</span>
                {isEditing && editingField === 'contractValue' ? (
                  <div className="flex items-center gap-1 min-w-0">
                    <Input
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'contractValue')}
                      className="h-6 w-16 min-w-12 flex-1 text-xs"
                      placeholder="$2.5M"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveField('contractValue')}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-semibold text-lg truncate">
                      {editableData.contractValue || <span className="text-muted-foreground text-sm">Not set</span>}
                    </span>
                    {isEditing && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => startEditing('contractValue', editableData.contractValue)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Deadline */}
              <div className="flex justify-between items-center text-sm min-w-0">
                <span className="text-muted-foreground shrink-0">Deadline</span>
                {isEditing && editingField === 'deadline' ? (
                  <div className="flex items-center gap-1 min-w-0">
                    <Input
                      type="date"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'deadline')}
                      className="h-6 w-24 min-w-20 flex-1 text-xs"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveField('deadline')}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 min-w-0">
                    <Badge variant="outline" className="gap-1 truncate">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">{editableData.deadline || 'Not set'}</span>
                    </Badge>
                    {isEditing && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => startEditing('deadline', editableData.deadline)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Document Type */}
              <div className="flex justify-between items-center text-sm min-w-0">
                <span className="text-muted-foreground shrink-0">Document Type</span>
                {isEditing && editingField === 'documentType' ? (
                  <div className="flex items-center gap-1 min-w-0">
                    <Select
                      value={tempValue}
                      onValueChange={(value) => setTempValue(value)}
                    >
                      <SelectTrigger className="h-6 w-28 min-w-20 flex-1 text-xs">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PROPOSAL">Government Proposal</SelectItem>
                        <SelectItem value="CONTRACT">Contract/Solicitation</SelectItem>
                        <SelectItem value="CERTIFICATION">Certification/Capability</SelectItem>
                        <SelectItem value="COMPLIANCE">Compliance</SelectItem>
                        <SelectItem value="TEMPLATE">Reusable Template</SelectItem>
                        <SelectItem value="SOLICITATION">Solicitation</SelectItem>
                        <SelectItem value="AMENDMENT">Amendment</SelectItem>
                        <SelectItem value="CAPABILITY_STATEMENT">Capability Statement</SelectItem>
                        <SelectItem value="PAST_PERFORMANCE">Past Performance</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveField('documentType')}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {(() => {
                        const typeMap: Record<string, string> = {
                          'PROPOSAL': 'Government Proposal',
                          'CONTRACT': 'Contract/Solicitation',
                          'CERTIFICATION': 'Certification/Capability',
                          'COMPLIANCE': 'Compliance',
                          'TEMPLATE': 'Reusable Template',
                          'OTHER': 'Other',
                          'SOLICITATION': 'Contract/Solicitation',
                          'AMENDMENT': 'Contract Amendment',
                          'CAPABILITY_STATEMENT': 'Capability Statement',
                          'PAST_PERFORMANCE': 'Past Performance'
                        }
                        return typeMap[editableData.documentType || 'OTHER'] || editableData.documentType || 'Other'
                      })()}
                    </Badge>
                    {isEditing && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => startEditing('documentType', editableData.documentType)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )
    },
    {
      id: 'tags-keywords',
      isEditable: true,
      component: (
        <Card key="tags-keywords">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags & Keywords
              {isEditing && (
                <Badge variant="outline" className="ml-auto text-xs">
                  Editable
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-3">
              {/* Document Tags */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-muted-foreground">DOCUMENT TAGS</div>
                </div>
                {isEditing ? (
                  <EditableBadgeInput
                    items={(editableData.tags || []).map((tag, index) => ({
                      id: `tag-${tag}-${index}`,
                      label: tag
                    }))}
                    onItemsChange={(items) => {
                      const newTags = items.map(item => item.label)
                      setEditableData(prev => ({
                        ...prev,
                        tags: newTags
                      }))
                      setHasUnsavedChanges(true)
                    }}
                    placeholder="Type and press Enter to add tags..."
                    variant="default"
                    className="text-xs"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(editableData.tags || []).map((tag, i) => (
                      <Badge key={i} variant="default" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {(!editableData.tags || editableData.tags.length === 0) && (
                      <span className="text-muted-foreground text-xs">No tags set</span>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* AI Keywords */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-muted-foreground">AI KEYWORDS</div>
                </div>
                {isEditing ? (
                  <EditableBadgeInput
                    items={localAIKeywords.map((keyword, index) => ({
                      id: `keyword-${keyword}-${index}`,
                      label: keyword
                    }))}
                    onItemsChange={(items) => {
                      const newKeywords = items.map(item => item.label)
                      updateAIKeywordsImmediate(newKeywords)
                    }}
                    placeholder="Type and press Enter to add keywords..."
                    variant="secondary"
                    className="text-xs"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {localAIKeywords.map((keyword, i) => (
                      <Badge
                        key={`keyword-${i}-${keyword}`}
                        variant="secondary"
                        className="text-xs"
                      >
                        {keyword}
                      </Badge>
                    ))}
                    {localAIKeywords.length === 0 && (
                      <span className="text-muted-foreground text-xs">No AI keywords extracted yet</span>
                    )}
                  </div>
                )}
              </div>

            </div>
          </CardContent>
        </Card>
      )
    },
    {
      id: 'entities',
      isEditable: true,
      component: (
        <Card key="entities">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="h-4 w-4" />
              Extracted Entities
              <Badge variant="secondary" className="ml-auto text-xs">
                {editableData.entities.length}
              </Badge>
              {isEditing && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Editable
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {isEditing ? (
              <div className="space-y-2">
                {editableData.entities.map((entity, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Select
                      value={entity.type || ''}
                      onValueChange={(value) => updateEntity(i, 'type', value)}
                    >
                      <SelectTrigger className="h-6 w-24 text-xs">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(EntityType).map((entityType) => (
                          <SelectItem key={entityType} value={entityType}>
                            {entityType.charAt(0) + entityType.slice(1).toLowerCase().replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={entity.value}
                      onChange={(e) => updateEntity(i, 'value', e.target.value)}
                      className="h-6 flex-1 text-xs"
                      placeholder="Entity value"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-500 hover:text-red-700"
                      onClick={() => removeEntity(i)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {editableData.entities.map((entity, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {entity.type}
                    </Badge>
                    <span className="font-medium truncate">{entity.value}</span>
                  </div>
                ))}
              </div>
            )}
            {isEditing && (
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2"
                onClick={addEntity}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Entity
              </Button>
            )}
          </CardContent>
        </Card>
      )
    },
    // Non-editable sections (show at bottom)
    {
      id: 'ai-analysis',
      isEditable: false,
      component: (
        <Card key="ai-analysis">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Analysis
              <Badge variant="secondary" className="ml-auto">
                {((document.analysis?.confidence || 0) * 100).toFixed(0)}% confidence
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-3 text-xs">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
                <TabsTrigger value="contract">Contract</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-4 space-y-3">
                <div className="space-y-2">
                  <p className="text-sm">{document.content?.summary || ''}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={formatUrgency('medium')} className="text-xs">
                      medium
                    </Badge>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase">Key Points</div>
                  <ul className="space-y-1">
                    {document.content?.keyPoints?.slice(0, 3).map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-xs">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="insights" className="mt-4 space-y-3">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase">Document Quality</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(document.analysis?.qualityScore || 0)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{document.analysis?.qualityScore || 0}/100</span>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase">Readability</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${(document.analysis?.readabilityScore || 0)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{document.analysis?.readabilityScore || 0}/100</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contract" className="mt-4 space-y-3">
                {(document.analysis as any)?.contractAnalysis ? (
                  <div className="space-y-3">
                    {/* Contract Type and Value */}
                    <div className="grid grid-cols-2 gap-3">
                      {(document.analysis as any)?.contractAnalysis?.contractType && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium">Contract Type</div>
                          <Badge variant="outline" className="text-xs">
                            {(document.analysis as any).contractAnalysis.contractType}
                          </Badge>
                        </div>
                      )}
                      {(document.analysis as any)?.contractAnalysis?.estimatedValue && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium">Estimated Value</div>
                          <div className="text-xs text-green-600 font-medium">
                            {(document.analysis as any).contractAnalysis.estimatedValue}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Timeline */}
                    {(document.analysis as any)?.contractAnalysis?.timeline && (
                      <>
                        <Separator />
                        <div className="space-y-1">
                          <div className="text-xs font-medium">Timeline</div>
                          <div className="text-xs text-muted-foreground">
                            {(document.analysis as any).contractAnalysis.timeline}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Requirements */}
                    {(document.analysis as any)?.contractAnalysis?.requirements?.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-1">
                          <div className="text-xs font-medium">Key Requirements ({(document.analysis as any)?.contractAnalysis?.requirements?.length || 0})</div>
                          <ul className="space-y-1">
                            {(document.analysis as any)?.contractAnalysis?.requirements?.slice(0, 10).map((requirement: string, index: number) => (
                              <li key={index} className="flex items-start gap-2 text-xs">
                                <CheckCircle className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                <span>{requirement}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}

                    {/* Risk Assessment */}
                    {(document.analysis as any)?.contractAnalysis?.risks?.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-1">
                          <div className="text-xs font-medium">Risk Assessment ({(document.analysis as any)?.contractAnalysis?.risks?.length})</div>
                          <ul className="space-y-1">
                            {(document.analysis as any)?.contractAnalysis?.risks?.slice(0, 10).map((risk: string, index: number) => (
                              <li key={index} className="flex items-start gap-2 text-xs">
                                <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                                <span>{risk}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}

                    {/* Opportunities */}
                    {(document.analysis as any)?.contractAnalysis?.opportunities?.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-1">
                          <div className="text-xs font-medium">Opportunities ({(document.analysis as any)?.contractAnalysis?.opportunities?.length || 0})</div>
                          <ul className="space-y-1">
                            {(document.analysis as any)?.contractAnalysis?.opportunities?.slice(0, 10).map((opportunity: string, index: number) => (
                              <li key={index} className="flex items-start gap-2 text-xs">
                                <TrendingUp className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                <span>{opportunity}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-3 p-6">
                    <div className="text-muted-foreground text-sm">
                      Contract analysis not available
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Click &quot;Analyze Document&quot; to generate contract insights including requirements, opportunities, risk assessments, and timeline analysis.
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )
    },
    {
      id: 'security-analysis',
      isEditable: false,
      component: (
        <Card key="security-analysis">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security Analysis
              <Badge variant="secondary" className="ml-auto text-xs">
                {(document.analysis as any)?.security?.classification || 'Not analyzed'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-3">
              {/* Security Overview */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Security Overview</div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk Level</span>
                    <Badge variant={(document.analysis as any)?.security?.securityRisks?.length > 2 ? "destructive" : (document.analysis as any)?.security?.securityRisks?.length > 0 ? "default" : "secondary"} className="text-xs">
                      {(document.analysis as any)?.security?.securityRisks?.length > 2 ? 'High' : (document.analysis as any)?.security?.securityRisks?.length > 0 ? 'Medium' : 'Low'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Classification</span>
                    <Badge variant="outline" className="text-xs">
                      {(document.analysis as any)?.security?.classification || 'Not analyzed'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confidence</span>
                    <Badge variant="secondary" className="text-xs">
                      {(document.analysis as any)?.security?.confidenceScore || 'N/A'}%
                    </Badge>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Data Privacy</div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PII Detected</span>
                    <Badge variant={(document.analysis as any)?.security?.sensitiveDataDetected ? "destructive" : "secondary"} className="text-xs">
                      {(document.analysis as any)?.security?.sensitiveDataDetected ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sensitive Data</span>
                    <Badge variant={(document.analysis as any)?.security?.sensitiveDataDetected ? 'destructive' : 'secondary'} className="text-xs">
                      {(document.analysis as any)?.security?.sensitiveDataDetected ? 'Detected' : 'None'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Redaction</span>
                    <Badge variant={(document.analysis as any)?.security?.recommendations?.some((r: string) => r.toLowerCase().includes('redact')) ? "destructive" : "secondary"} className="text-xs">
                      {(document.analysis as any)?.security?.recommendations?.some((r: string) => r.toLowerCase().includes('redact')) ? "Required" : "None"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Security Risks */}
              {(document.analysis as any)?.security?.securityRisks?.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">Security Risks ({(document.analysis as any)?.security?.securityRisks?.length})</div>
                    <ul className="space-y-1">
                      {(document.analysis as any)?.security?.securityRisks?.map((risk: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-xs">
                          <AlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Compliance Issues */}
              {(document.analysis as any)?.security?.complianceIssues?.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">Compliance Issues ({(document.analysis as any)?.security?.complianceIssues?.length})</div>
                    <ul className="space-y-1">
                      {(document.analysis as any)?.security?.complianceIssues?.map((issue: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-xs">
                          <AlertCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Security Recommendations */}
              {(document.analysis as any)?.security?.recommendations?.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">Security Recommendations ({(document.analysis as any)?.security?.recommendations?.length})</div>
                    <ul className="space-y-1">
                      {(document.analysis as any)?.security?.recommendations?.map((recommendation: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-xs">
                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Sensitive Data Types */}
              {(document.analysis as any)?.security?.sensitiveDataTypes?.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">Detected Data Types ({(document.analysis as any)?.security?.sensitiveDataTypes?.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {(document.analysis as any)?.security?.sensitiveDataTypes?.map((type: string, index: number) => (
                        <Badge key={index} variant="destructive" className="text-xs">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}


            </div>
          </CardContent>
        </Card>
      )
    },
    {
      id: 'processing-history',
      isEditable: false,
      component: (
        <Card key="processing-history">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Processing History
              <Badge variant="secondary" className="ml-auto text-xs">
                {(0) + (document.processing?.events?.length || 0)} events
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {/* Display processing history or events */}
              {(document.processing?.events || [])
                .slice().reverse().map((event, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full mt-1.5 flex-shrink-0",
                    event.success ? "bg-green-500" : "bg-red-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{event.event}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {event.error && (
                      <div className="text-xs text-red-500">
                        {event.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Show message if no processing history available */}
              {!((document.processing?.events?.length ?? 0) > 0) && (
                <div className="text-xs text-muted-foreground">
                  No processing history available yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )
    },
    {
      id: 'vector-analysis',
      isEditable: false,
      component: (
        <Card key="vector-analysis">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Vector Analysis
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleVectorizeDocument(false)}
                  disabled={isVectorizing || !document.extractedText}
                  className="h-6 px-2 text-xs"
                >
                  {isVectorizing ? (
                    <>
                      <div className="h-3 w-3 mr-1 animate-spin rounded-full border border-current border-t-transparent" />
                      Processing...
                    </>
                  ) : (
                    'Vectorize Now'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleVectorizeDocument(true)}
                  disabled={isVectorizing || !document.extractedText}
                  className="h-6 px-2 text-xs"
                >
                  Queue Job
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteVectors}
                  disabled={isVectorizing || !document.embeddings || Object.keys(document.embeddings).length === 0}
                  className="h-6 px-2 text-xs"
                >
                  Delete Vectors
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Chunks</span>
                    <span className="font-medium">{(document.embeddings as DocumentEmbeddings)?.chunks?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Chunks</span>
                    <span className="font-medium">{(document.embeddings as DocumentEmbeddings)?.totalChunks || 0}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model</span>
                    <span className="font-medium text-xs">{(document.embeddings as DocumentEmbeddings)?.model || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dimensions</span>
                    <span className="font-medium">{(document.embeddings as DocumentEmbeddings)?.dimensions || 1536}</span>
                  </div>
                </div>
              </div>

              {/* Document Context Information */}
              {(document.embeddings as DocumentEmbeddings)?.documentId && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">Document Context</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Document ID</span>
                        <span className="font-mono text-xs bg-muted px-1 rounded text-right flex-1 min-w-0 truncate" title={(document.embeddings as DocumentEmbeddings)?.documentId}>
                          {(document.embeddings as DocumentEmbeddings)?.documentId || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Document Title</span>
                        <span className="text-xs text-right flex-1 min-w-0 truncate" title={(document.embeddings as DocumentEmbeddings)?.documentTitle}>
                          {(document.embeddings as DocumentEmbeddings)?.documentTitle || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Organization</span>
                        <span className="text-xs text-right flex-1 min-w-0 truncate" title={(document.embeddings as DocumentEmbeddings)?.organizationNamespace}>
                          {(document.embeddings as DocumentEmbeddings)?.organizationNamespace || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Last Processed</div>
                <div className="text-xs text-muted-foreground">
                  {(document.embeddings as DocumentEmbeddings)?.lastProcessed ? new Date((document.embeddings as DocumentEmbeddings).lastProcessed!).toLocaleString() : 'Never'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }
  ];
    // Only depend on document.id to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id, editableData, isEditing, editingField, tempValue])

  // Separate editable and non-editable sections
  const allSections = cardSections.reduce((acc, section) => {
    acc[section.id] = section
    return acc
  }, {} as Record<string, typeof cardSections[0]>)

  const editableSections = editableSectionOrder.map(id => allSections[id]).filter(Boolean)

  // Filter non-editable sections based on available data
  const nonEditableSections = nonEditableSectionOrder.map(id => {
    const section = allSections[id]
    if (!section) return null

    // Only show AI Analysis section if document has any AI data or analysis
    if (id === 'ai-analysis') {
      const hasAiAnalysis = document?.content?.summary ||
                          (document?.content?.keyPoints?.length ?? 0) > 0 ||
                          document?.analysis?.qualityScore ||
                          document?.analysis?.readabilityScore ||
                          document?.analysis?.contractAnalysis ||
                          (document?.analysis?.entities?.length ?? 0) > 0 ||
                          (document?.content?.sections?.length ?? 0) > 0 ||
                          document?.extractedText // Show if we have basic extracted text
      if (!hasAiAnalysis) return null
    }

    // Only show Security Analysis section if document has security data
    if (id === 'security-analysis') {
      const hasSecurityAnalysis = document?.analysis?.security ||
                                 document?.securityAnalysis ||
                                 document?.securityClassification ||
                                 document?.extractedText // Show if we have content to analyze
      if (!hasSecurityAnalysis) return null
    }

    // Only show Processing History if it has entries or processing status
    if (id === 'processing-history') {
      const hasProcessingHistory = document?.processing?.currentStatus ||
                                  (document?.processing?.events?.length ?? 0) > 0
      if (!hasProcessingHistory) return null
    }

    // Always show Vector Analysis section - users need to see the vectorize button
    if (id === 'vector-analysis') {
      // Always visible so users can generate embeddings
      return section
    }

    return section
  }).filter((section): section is NonNullable<typeof section> => section !== null)

  // Log section data and layout variables

  // Drag and drop handlers
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result

    console.log('🎯 Drag & Drop Event:', {
      result,
      destination,
      source,
      draggableId,
      editableSectionOrder,
      nonEditableSectionOrder
    })

    // If dropped outside or no movement, do nothing
    if (!destination ||
        (destination.droppableId === source.droppableId && destination.index === source.index)) {
      console.log('❌ Drop cancelled - no destination or no movement')
      return
    }

    // Only allow reordering within the same group
    if (destination.droppableId !== source.droppableId) {
      console.log('❌ Drop cancelled - different droppable areas')
      return
    }

    if (source.droppableId === 'editable-sections') {
      const newOrder = [...editableSectionOrder]
      const [reorderedItem] = newOrder.splice(source.index, 1)
      newOrder.splice(destination.index, 0, reorderedItem)
      console.log('✅ Reordered editable sections:', { oldOrder: editableSectionOrder, newOrder })
      setEditableSectionOrder(newOrder)
    } else if (source.droppableId === 'non-editable-sections') {
      const newOrder = [...nonEditableSectionOrder]
      const [reorderedItem] = newOrder.splice(source.index, 1)
      newOrder.splice(destination.index, 0, reorderedItem)
      console.log('✅ Reordered non-editable sections:', { oldOrder: nonEditableSectionOrder, newOrder })
      setNonEditableSectionOrder(newOrder)
    }
  }

  // TEMPORARILY REMOVED: Editor check that was causing blank pages
  // TODO: Re-implement proper editor validation once PlateEditor is fully integrated
  // if (!editor) {
  //   return null
  // }

  // Show loading state while fetching document
  if (isLoading) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      </div>
    )
  }

  // Show not found state if document doesn't exist after loading completes
  if (!document) {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📄</div>
          <h2 className="text-2xl font-semibold mb-2">Document Not Found</h2>
          <p className="text-muted-foreground">The requested document could not be found.</p>
        </div>
      </div>
    )
  }

  // Show loading state while document is being fetched
  if (!document && isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Loading document...</p>
          </div>
        </div>
      </div>
    )
  }

  // If no document and not loading, show error state
  if (!document) {
    return (
      <div className="flex h-screen bg-background">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Document not found</p>
            <p className="text-sm text-muted-foreground/70">The document may have been deleted or moved.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">

      <PanelGroup direction="horizontal">
        {/* Left Sidebar - Document Sections */}
        {(leftSidebarOpen || !isMobile) && (
          <>
            <Panel defaultSize={20} minSize={15} maxSize={30} className={cn(
              "flex flex-col",
              isMobile && leftSidebarOpen
                ? "absolute inset-y-0 left-0 z-50 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out shadow-xl"
                : "bg-muted/10"
            )}>
              <div className="p-4 border-b bg-background">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Document Sections
                  </h3>
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLeftSidebarOpen(false)}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <ScrollArea className="flex-1 bg-background">
                <div className="p-3 space-y-1">
                  {sections.map((section) => (
                    <Button
                      key={section.id}
                      variant={selectedSection?.id === section.id ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        selectedSection?.id === section.id && "bg-secondary font-medium"
                      )}
                      onClick={() => {
                        setSelectedSection(section)
                        setLastUserSelectedSectionId(section.id)
                        if (isMobile) setLeftSidebarOpen(false)
                      }}
                    >
                      <span className="truncate">{section.title}</span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-4 border-t bg-background">
                <Button variant="outline" className="w-full" size="sm">
                  <FilePlus className="h-4 w-4 mr-2" />
                  Add Section
                </Button>
              </div>
            </Panel>
            {!isMobile && <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />}
          </>
        )}

        {/* Main Content Area */}
        <Panel defaultSize={55} minSize={35} className="flex flex-col min-w-0">
          {/* Header */}
          <div className="border-b bg-background">
            <div className="p-4">
              {/* Mobile Navigation and Breadcrumb */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center text-sm text-muted-foreground">
                  {isMobile && (
                    <div className="flex items-center gap-2 mr-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLeftSidebarOpen(true)}
                        className="h-8 w-8"
                      >
                        <Menu className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRightSidebarOpen(true)}
                        className="h-8 w-8"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {/* Back to Documents Button - PRESERVED */}
                  <Link href="/documents" prefetch={true}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground mr-2"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Documents
                    </Button>
                  </Link>
                  {folderPath.map((pathItem, index) => (
                    <React.Fragment key={pathItem.id || 'root'}>
                      <ChevronRight className="h-4 w-4 mx-1" />
                      {index === folderPath.length - 1 ? (
                        // Current folder - not clickable
                        <span className="text-foreground">
                          {pathItem.name}
                        </span>
                      ) : (
                        // Parent folders - clickable and navigate to /documents with folder selected
                        <Link
                          href={pathItem.id ? `/documents?folder=${pathItem.id}` : '/documents'}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {pathItem.name}
                        </Link>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Title and Actions */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {isEditingTitle ? (
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={documentTitle}
                      onChange={(e) => setDocumentTitle(e.target.value)}
                      onBlur={handleTitleSubmit}
                      onKeyDown={handleTitleKeyDown}
                      className="text-2xl font-bold bg-transparent border-none outline-none w-full max-w-2xl"
                    />
                  ) : (
                    <h1
                      className="text-2xl font-bold cursor-pointer hover:bg-muted/50 rounded px-1 -ml-1 max-w-2xl truncate"
                      onClick={() => setIsEditingTitle(true)}
                      title="Click to edit title"
                    >
                      {documentTitle || (document ? 'Loading...' : 'Document not found')}
                    </h1>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Move to Folder Button - PRESERVED */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" title="Move to Folder">
                        <Move className="h-4 w-4" />
                        <ChevronDown className="h-3 w-3 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem
                        onClick={() => handleMoveDocument(UI_CONSTANTS.ROOT_FOLDER_ID)}
                        disabled={!currentFolderId}
                      >
                        <HardDrive size={14} className="mr-2" />
                        Root
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {folderHierarchy.map(folder => (
                        <DropdownMenuItem
                          key={folder.id}
                          onClick={() => handleMoveDocument(folder.id)}
                          disabled={folder.id === currentFolderId}
                          className="p-0"
                        >
                          <FolderHierarchyItem
                            folder={folder}
                            disabled={folder.id === currentFolderId}
                            className="w-full px-2 py-1"
                          />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* AI Analysis Controls */}
                  <div className="flex gap-2">

                    {/* Cancel Processing Button */}
                    {document && canCancelProcessing(document) && (
                      <Button
                        variant="outline"
                        size="default"
                        className="shadow-md border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                        onClick={async () => {
                          if (document) {
                            try {
                              notify.info('Cancelling', `Cancelling processing for "${document.name}"...`)

                              const result = await cancelDocumentProcessing(document.id)

                              if (result.success) {
                                notify.success('Processing Cancelled', result.message)
                                playSound(SoundEffect.SUCCESS)
                                setIsAnalyzing(false)
                                // Refresh document data
                                window.location.reload()
                              } else {
                                notify.error('Cancel Failed', result.message || 'Failed to cancel processing')
                                playSound(SoundEffect.ERROR)
                              }
                            } catch (error) {
                              console.error('Error cancelling document processing:', error)
                              notify.error('Cancel Failed', 'Failed to cancel processing. Please try again.')
                              playSound(SoundEffect.ERROR)
                            }
                          }
                        }}
                        title="Cancel processing and start from scratch"
                      >
                        <X className="h-4 w-4" />
                        {!isMobile && <span className="ml-2">Cancel</span>}
                      </Button>
                    )}
                  </div>

                  {!isMobile && (
                    <>
                      <div className="h-8 w-px bg-border" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsPreviewMode(!isPreviewMode)}
                        title={isPreviewMode ? 'Edit View' : 'Preview'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isEditing ? (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={saveAllChanges}
                            disabled={!hasUnsavedChanges || savingFields.has('all')}
                            title="Save Changes"
                          >
                            <Save className="h-4 w-4 mr-1" />
                            {savingFields.has('all') ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={cancelEditing}
                            title="Cancel Changes"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setIsEditing(true)}
                          title="Edit Document"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      )}
                      <div className="h-8 w-px bg-border" />
                      <Button
                        variant="outline"
                        size="icon"
                        title="Save"
                        onClick={() => void handleSaveDocument()}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      {/* Upload File option for all documents on desktop */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingFile || isUploading}
                        title={isUploadingFile || isUploading ? 'Uploading...' : 'Upload File'}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        title={isMobile ? "More actions" : "Export"}
                      >
                        {isMobile ? <MoreVertical className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {isMobile && (
                        <>
                          <DropdownMenuItem onClick={() => setIsPreviewMode(!isPreviewMode)}>
                            <Eye className="h-4 w-4 mr-2" />
                            {isPreviewMode ? 'Edit View' : 'Preview'}
                          </DropdownMenuItem>
                          {isEditing ? (
                            <>
                              <DropdownMenuItem onClick={saveAllChanges} disabled={!hasUnsavedChanges || savingFields.has('all')}>
                                <Save className="h-4 w-4 mr-2" />
                                {savingFields.has('all') ? 'Saving...' : 'Save Changes'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={cancelEditing}>
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onClick={() => setIsEditing(true)}>
                              <Edit3 className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => void handleSaveDocument()}>
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </DropdownMenuItem>
                          {/* Upload File option for all documents */}
                          <DropdownMenuItem
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingFile || isUploading}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {isUploadingFile || isUploading ? 'Uploading...' : 'Upload File'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as Word
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as Markdown
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Printer className="h-4 w-4 mr-2" />
                        Print
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Share className="h-4 w-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Document Metadata Row */}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Modified </span>
                  <span>{document.lastModified}</span>
                </div>
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>{document.updatedBy}</span>
                </div>
                {isEditing && (
                  <div className="flex items-center gap-2 text-xs">
                    <span>{wordCount} words</span>
                    <span>•</span>
                    <span>{characterCount} chars</span>
                    {hasUnsavedChanges && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1 text-amber-600">
                          <div className="h-2 w-2 bg-amber-500 rounded-full animate-pulse" />
                          <span>Unsaved changes</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>


          </div>

          {/* Editor Content */}
          <ScrollArea className="flex-1">
            <div className={cn(
              "transition-all duration-200",
              isEditing ? "" : "p-4 sm:p-6 lg:p-8"
            )}>

              <div className={cn(
                "w-full max-w-full",
                isEditing ? "overflow-x-auto overflow-y-visible" : "prose prose-lg dark:prose-invert max-w-none mx-auto px-4"
              )}>
                <StableEditor
                  content={sectionEdits[selectedSection?.id] ?? (isEditing
                    ? document.content?.sections?.find(section => section.id === selectedSection?.id)?.content
                    : selectedSection?.content) ?? ''}
                  onChange={(content) => {
                    if (!isEditing || !document.content?.sections?.some(section => section.id === selectedSection?.id)) return;
                    setSectionEdits(previous => ({ ...previous, [selectedSection.id]: content }));
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Start writing your document content..."
                  editable={isEditing && !!document.content?.sections?.length}
                  minHeight={isEditing ? '400px' : '300px'}
                  maxHeight="600px"
                  showToolbar={isEditing}
                  readOnly={!isEditing || !document.content?.sections?.length}
                  className="w-full max-w-full focus:outline-none"
                />
              </div>
            </div>
          </ScrollArea>
        </Panel>

        {/* Right Sidebar - Document Information */}
        {(rightSidebarOpen || !isMobile) && (
          <>
            {!isMobile && <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />}
            <Panel defaultSize={25} minSize={15} maxSize={45} className={cn(
              "flex flex-col",
              isMobile && rightSidebarOpen
                ? "absolute inset-y-0 right-0 z-50 w-80 bg-background border-l transform transition-transform duration-200 ease-in-out shadow-xl"
                : "bg-muted/10"
            )} style={{ minWidth: '435px' }}>
              <div className="p-4 border-b bg-background">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Document Information
                    {useColumnLayout && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        2-Column
                      </Badge>
                    )}
                  </h3>
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRightSidebarOpen(false)}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1 bg-background" ref={rightPanelRef}>
                <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="p-4">
                    {/* File Details Card (Always at top, non-editable) */}
                    <Card className="mb-4">
                      <CardHeader className="p-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            File Details
                          </CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowFileViewer(true)}
                            className="h-7 px-2 text-xs"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="grid grid-cols-[80px_1fr] gap-4 items-start">
                          {/* File Preview Box */}
                          <div className="flex flex-col items-center gap-2">
                            {(() => {
                              // Use original filename to determine file type (not document.type which may be generic)
                              const originalFileName = getOriginalFileName(document)
                              const fileType = getFileTypeFromMimeType(document.mimeType, originalFileName)
                              console.log('🎯 File type detection:', {
                                documentId: document.id,
                                originalFileName,
                                mimeType: document.mimeType,
                                detectedFileType: fileType,
                                documentType: document.type
                              })
                              const fileInfo = getFileTypeInfo(fileType)
                              const FileIcon = fileInfo.icon

                              // Check if we should show a preview instead of just an icon
                              // ALWAYS use original filename from filePath for preview logic (never use editable document.name)
                              const fileExtension = getOriginalFileExtension(document)

                              const isImageFile = document.mimeType?.startsWith('image/')
                              const isTextFile = document.mimeType?.startsWith('text/') || ['txt', 'csv', 'md', 'log', 'json', 'xml'].includes(fileExtension)
                              const isPdfFile = document.mimeType === 'application/pdf'
                              const isOfficeFile = document.mimeType?.includes('word') || document.mimeType?.includes('sheet') || document.mimeType?.includes('presentation') || document.mimeType?.includes('officedocument')
                              const isVideoFile = document.mimeType?.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(fileExtension)
                              const isAudioFile = document.mimeType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(fileExtension)

                              // Check if this is a created document (no actual file)
                              const isCreatedDocument = document.filePath?.startsWith('/documents/') || (!document.originalFile && !document.filePath?.includes('/api/v1/documents/'))

                              const hasPreview = !isCreatedDocument && (isImageFile || isTextFile || isPdfFile || isOfficeFile || isVideoFile || isAudioFile)

                              return (
                                <>
                                  <div className={cn(
                                    "w-20 h-20 rounded-lg overflow-hidden flex items-center justify-center",
                                    hasPreview ? "bg-white border border-gray-200" : `bg-gradient-to-br ${fileInfo.bgGradient}`,
                                    hasPreview ? "" : `border ${fileInfo.borderColor}`,
                                    "shadow-sm transition-transform hover:scale-105"
                                  )}>
                                    {hasPreview ? (
                                      <FilePreview
                                        document={{...document, type: fileType}}
                                        className="w-full h-full"
                                      />
                                    ) : (
                                      <FileIcon className={`h-10 w-10 ${fileInfo.iconColor}`} />
                                    )}
                                  </div>
                                  <div className="text-center">
                                    <div className={`text-xs font-semibold ${fileInfo.textColor}`}>
                                      {(() => {
                                        const displayExt = fileExtension.toUpperCase() || fileType.toUpperCase();
                                        console.log('🎯 File extension display:', {
                                          docId: document.id,
                                          docName: document.name,
                                          fileExtension,
                                          fileType,
                                          displayExt,
                                          mimeType: document.mimeType
                                        });
                                        return displayExt;
                                      })()}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatFileSize(document.size)}
                                    </div>
                                  </div>
                                </>
                              )
                            })()}
                          </div>

                          {/* File Details */}
                          <div className="space-y-2">
                            {/* Title and Description */}
                            <div className="space-y-1">
                              <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Description</div>
                                <div className="text-sm text-muted-foreground">
                                  {document.description || document.content?.summary || 'No description available'}
                                </div>
                              </div>
                            </div>

                            {/* Date Information */}
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Uploaded</div>
                                <div className="font-medium">{new Date(document.uploadDate).toLocaleDateString()}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Modified</div>
                                <div className="font-medium">{new Date(document.lastModified).toLocaleDateString()}</div>
                              </div>
                            </div>

                            {/* Status and Type Information */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Processing Status</div>
                                <Badge
                                  variant={document.processing?.currentStatus === 'COMPLETED' ? 'default' : document.processing?.currentStatus === 'FAILED' ? 'destructive' : 'secondary'}
                                  className="text-xs"
                                >
                                  {document.processing?.currentStatus === 'COMPLETED' && <CheckCircle className="h-3 w-3 mr-1" />}
                                  {document.processing?.currentStatus === 'PROCESSING' && <Clock className="h-3 w-3 mr-1" />}
                                  {document.processing?.currentStatus === 'FAILED' && <AlertCircle className="h-3 w-3 mr-1" />}
                                  {document.processing?.currentStatus || 'PENDING'}
                                </Badge>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Document Type</div>
                                <Badge variant="outline" className="text-xs">
                                  {(() => {
                                    const typeMap: Record<string, string> = {
                                      'PROPOSAL': 'Government Proposal',
                                      'CONTRACT': 'Contract/Solicitation',
                                      'CERTIFICATION': 'Certification/Capability',
                                      'COMPLIANCE': 'Compliance',
                                      'TEMPLATE': 'Reusable Template',
                                      'OTHER': 'Other',
                                      // Legacy mappings
                                      'SOLICITATION': 'Contract/Solicitation',
                                      'AMENDMENT': 'Contract Amendment',
                                      'CAPABILITY_STATEMENT': 'Capability Statement',
                                      'PAST_PERFORMANCE': 'Past Performance'
                                    }
                                    return typeMap[document.documentType || 'OTHER'] || document.documentType || 'Other'
                                  })()}
                                </Badge>
                              </div>
                            </div>

                            <div className="space-y-2">
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Processing Status Section */}
                    <Card className="mb-4">
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Processing Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        {(isAnalyzing || isVectorizing) && document ? (
                          <>
                            {console.log('🔄 [PROCESSING TRACKER] Showing ProcessingProgress component:', {
                              isAnalyzing,
                              isVectorizing,
                              hasDocument: !!document,
                              progress: processingStatus.progress,
                              currentStep: processingStatus.currentStep
                            })}
                            <ProcessingProgress
                              status="PROCESSING"
                              progress={isVectorizing ? 50 : processingStatus.progress}
                              currentStep={isVectorizing ? 'Generating vector embeddings...' : processingStatus.currentStep}
                              processingType={isVectorizing ? "vectorize" : "full"}
                              estimatedCompletion={processingStatus.estimatedCompletion}
                            />

                          </>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Analysis Status</span>
                              <Badge variant={
                                document.processing?.currentStatus === 'COMPLETED' ? 'default' :
                                document.processing?.currentStatus === 'PROCESSING' ? 'secondary' :
                                document.processing?.currentStatus === 'FAILED' ? 'destructive' : 'outline'
                              }>
                                {document.processing?.currentStatus === 'COMPLETED' ? 'Ready' :
                                 document.processing?.currentStatus === 'PROCESSING' ? 'Processing' :
                                 document.processing?.currentStatus === 'FAILED' ? 'Failed' :
                                 document.processing?.currentStatus === 'PENDING' ? 'Processing' : document.processing?.currentStatus}
                              </Badge>
                            </div>

                            {document.processedAt && (
                              <div className="text-xs text-muted-foreground">
                                Last processed: {new Date(document.processedAt).toLocaleString()}
                              </div>
                            )}

                            {(document.processing as any)?.error && (
                              <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                                {(document.processing as any).error}
                              </div>
                            )}

                            {/* AI Analysis Button - Prominent Style */}
                            {canAnalyzeDocument(document) && (
                              <Button
                                onClick={handleStartAnalysis}
                                disabled={isAnalyzing || document?.processing?.currentStatus === 'PROCESSING'}
                                className={cn(
                                  "shadow-md transition-all duration-200 w-full",
                                  isAnalyzing || document?.processing?.currentStatus === 'PROCESSING'
                                    ? "bg-gradient-to-r from-violet-500 to-indigo-500 cursor-not-allowed opacity-90"
                                    : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700",
                                  "text-white"
                                )}
                                size="default"
                              >
                                {isAnalyzing || document?.processing?.currentStatus === 'PROCESSING' ? (
                                  <>
                                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    {isMobile ? 'Analyzing...' : 'Analyzing Document...'}
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    {document.analysis ? 'Re-analyze Document' : (isMobile ? 'Analyze' : 'AI Analysis')}
                                  </>
                                )}
                              </Button>
                            )}

                            {/* Cancel Processing Button - Only show if document status allows cancellation */}
                            {canCancelProcessing(document) && document.processing?.currentStatus === 'PROCESSING' && (
                              <Button
                                onClick={handleCancelProcessing}
                                variant="outline"
                                size="sm"
                                disabled={isCancelling}
                                className="w-full"
                              >
                                {isCancelling ? (
                                  <>
                                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                                    Cancelling...
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="h-4 w-4 mr-2" />
                                    Cancel Processing
                                  </>
                                )}
                              </Button>
                            )}

                            {document.processing?.currentStatus === 'FAILED' && (
                              <div className="text-xs text-muted-foreground">
                                Analysis failed. You can try again by clicking &ldquo;Start AI Analysis&rdquo;.
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Editable Sections */}
                    {editableSections.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                          <Edit2 className="h-3 w-3" />
                          Editable Sections
                          <Badge variant="outline" className="ml-2 text-xs">
                            Draggable
                          </Badge>
                          {useColumnLayout && (
                            <Badge variant="default" className="ml-1 text-xs bg-green-500">
                              2-Column
                            </Badge>
                          )}
                        </h4>
                        <Droppable droppableId="editable-sections">
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={cn(
                                "space-y-4",
                                useColumnLayout && "grid grid-cols-2 gap-4 space-y-0 border-2 border-dashed border-green-300 bg-green-50/30",
                                snapshot.isDraggingOver && "bg-primary/5 rounded-lg p-2"
                              )}
                            >
                              {editableSections.map((section, index) => (
                                <Draggable key={section.id} draggableId={section.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={cn(
                                        "h-fit transition-all duration-200",
                                        snapshot.isDragging && "rotate-2 scale-105 shadow-lg z-50",
                                        snapshot.isDragging && "cursor-grabbing",
                                        !snapshot.isDragging && "cursor-grab"
                                      )}
                                    >
                                      {section.component}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    )}

                    {/* Non-Editable Sections */}
                    {nonEditableSections.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                          <Eye className="h-3 w-3" />
                          Analysis & Information
                          <Badge variant="outline" className="ml-2 text-xs">
                            Draggable
                          </Badge>
                          {useColumnLayout && (
                            <Badge variant="default" className="ml-1 text-xs bg-green-500">
                              2-Column
                            </Badge>
                          )}
                        </h4>
                        <Droppable droppableId="non-editable-sections">
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={cn(
                                "space-y-4",
                                useColumnLayout && "grid grid-cols-2 gap-4 space-y-0 border-2 border-dashed border-blue-300 bg-blue-50/30",
                                snapshot.isDraggingOver && "bg-primary/5 rounded-lg p-2"
                              )}
                            >
                              {nonEditableSections.map((section, index) => (
                                <Draggable key={section.id} draggableId={section.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={cn(
                                        "h-fit transition-all duration-200",
                                        snapshot.isDragging && "rotate-2 scale-105 shadow-lg z-50",
                                        snapshot.isDragging && "cursor-grabbing",
                                        !snapshot.isDragging && "cursor-grab"
                                      )}
                                    >
                                      {section.component}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    )}
                  </div>
                </DragDropContext>
              </ScrollArea>
            </Panel>
          </>
        )}

        {/* Chat Interface Panel - only show if document is vectorized and chat is open */}
        {hasValidEmbeddings(document) && isChatOpen && (
          <>
            <PanelResizeHandle className="w-2 bg-border hover:bg-muted-foreground/20 transition-colors" />
            <Panel defaultSize={30} minSize={20} maxSize={40} className="flex flex-col">
              <DocumentChatInterface
                document={document}
                isOpen={isChatOpen}
                onToggle={() => setIsChatOpen(!isChatOpen)}
              />
            </Panel>
          </>
        )}
      </PanelGroup>

      {/* Mobile overlay */}
      {isMobile && (leftSidebarOpen || rightSidebarOpen) && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => {
            setLeftSidebarOpen(false)
            setRightSidebarOpen(false)
          }}
        />
      )}

      {/* Hidden file input for uploading files to created documents */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.pages,.xls,.xlsx,.csv,.ppt,.pptx"
      />

      {/* File Viewer Modal */}
      {document && (
        <FileViewerModal
          open={showFileViewer}
          onOpenChange={setShowFileViewer}
          document={document}
        />
      )}

      {/* Chat Toggle Button - only show if document is vectorized and chat is closed */}
      {hasValidEmbeddings(document) && !isChatOpen && (
        <ChatToggleButton
          onClick={() => setIsChatOpen(true)}
          isOpen={isChatOpen}
        />
      )}
    </div>
  )
}

export default DocumentDetailsView
