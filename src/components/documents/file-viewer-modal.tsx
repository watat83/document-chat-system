'use client'

import React, { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, FileIcon } from 'lucide-react'
import { getFileTypeFromMimeType } from './file-type-utils'

// Dynamically import PDFViewer to prevent SSR issues (react-pdf requires browser APIs)
const PDFViewer = dynamic(
  () => import('./pdf-viewer').then((mod) => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <div className="text-sm text-muted-foreground">Loading PDF viewer...</div>
        </div>
      </div>
    )
  }
)

interface FileViewerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: {
    id: string
    name: string
    mimeType?: string
    filePath?: string
    type?: string
    size: string | number
    extractedText?: string
    originalFile?: File
  }
}

export function FileViewerModal({ open, onOpenChange, document }: FileViewerModalProps) {
  const [error, setError] = useState<string | null>(null)
  const [fetchedFile, setFetchedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Derive file type from mimeType if type is missing
  const documentType = useMemo(() => {
    return document.type || getFileTypeFromMimeType(document.mimeType || '', document.name) || 'file'
  }, [document.id, document.type, document.mimeType, document.name])

  const isPDF = documentType === 'pdf' || document.mimeType === 'application/pdf'

  // Fetch file when modal opens for PDFs
  useEffect(() => {
    if (!open || !isPDF) {
      setFetchedFile(null)
      setError(null)
      setIsLoading(false)
      return
    }

    // Use original file if available
    if (document.originalFile) {
      setFetchedFile(document.originalFile)
      setIsLoading(false)
      return
    }

    // Fetch from API
    const fetchFile = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/v1/documents/${document.id}/download`)
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`)
        }

        const blob = await response.blob()
        const file = new File([blob], document.name, {
          type: document.mimeType || 'application/pdf'
        })

        setFetchedFile(file)
        setIsLoading(false)
      } catch (err) {
        console.error('Error fetching file:', err)
        setError(err instanceof Error ? err.message : 'Failed to load file')
        setIsLoading(false)
      }
    }

    fetchFile()
  }, [open, document.id, isPDF])

  const handleDownload = async () => {
    try {
      setError(null)
      const response = await fetch(`/api/v1/documents/${document.id}/download`)
      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = document.name
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download error:', err)
      setError('Failed to download file')
    }
  }

  const handleOpenExternal = () => {
    window.open(`/api/v1/documents/${document.id}/download`, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileIcon className="h-5 w-5" />
              {document.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {isPDF ? (
            isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-4">⏳</div>
                  <div className="text-sm text-muted-foreground">Loading PDF...</div>
                </div>
              </div>
            ) : error ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center max-w-md p-8">
                  <div className="text-6xl mb-4">⚠️</div>
                  <div className="text-base font-medium mb-2">Failed to load preview</div>
                  <div className="text-sm text-muted-foreground mb-4">{error}</div>
                  <Button onClick={handleDownload} variant="outline">
                    Download File
                  </Button>
                </div>
              </div>
            ) : fetchedFile ? (
              <PDFViewer
                file={fetchedFile}
                fileName={document.name}
                onDownload={handleDownload}
                onOpenExternal={handleOpenExternal}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-4">📄</div>
                  <div className="text-sm text-muted-foreground">No preview available</div>
                </div>
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center max-w-md p-8">
                <div className="text-6xl mb-4">📄</div>
                <div className="text-base font-medium mb-2">{document.name}</div>
                <div className="text-sm text-muted-foreground mb-4">
                  {document.mimeType || 'Unknown type'}
                </div>
                <div className="text-xs text-muted-foreground italic mb-4">
                  Preview only available for PDF files in Quick Preview modal
                </div>
                <Button onClick={handleDownload} variant="outline">
                  Download to View
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
