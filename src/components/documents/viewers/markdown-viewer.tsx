'use client'

import React, { useState, useEffect } from 'react'
import { FileText, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

interface MarkdownViewerProps {
  file: File
  fileName: string
  onDownload: () => void
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ file, fileName, onDownload }) => {
  const [, setContent] = useState<string>('')
  const [renderedHtml, setRenderedHtml] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const markdownText = e.target?.result as string
        setContent(markdownText)

        // Configure marked options for security
        marked.setOptions({
          breaks: true,
          gfm: true,
        })

        // Render markdown to HTML
        const html = await marked(markdownText)
        setRenderedHtml(DOMPurify.sanitize(html))
        setLoading(false)
      } catch {
        setError('Failed to read or render markdown content')
        setLoading(false)
      }
    }

    reader.onerror = () => {
      setError('Error reading file')
      setLoading(false)
    }

    reader.readAsText(file)
  }, [file])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
        <p className="text-sm">Loading markdown content...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-12 w-12 mb-4 text-red-500" />
        <p className="text-sm text-red-500 mb-4">{error}</p>
        <Button variant="outline" size="sm" onClick={onDownload}>
          <Download size={16} className="mr-2" />
          Download File
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-background">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onDownload}>
          <Download size={16} className="mr-2" />
          Download
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-background">
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    </div>
  )
}
