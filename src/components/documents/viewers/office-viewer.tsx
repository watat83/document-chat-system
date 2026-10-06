'use client'
import React from 'react'
import { FileText, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
interface OfficeViewerProps {
  file: File
  fileName: string
  fileType: 'docx' | 'xlsx' | 'pptx'
  onDownload: () => void
}
export const OfficeViewer: React.FC<OfficeViewerProps> = ({ fileName, fileType, onDownload }) => (
  <div className="flex flex-col h-full">
    <div className="flex items-center justify-between p-3 border-b bg-background">
      <div className="flex items-center gap-2 min-w-0"><FileText className="h-4 w-4" /><span className="text-sm font-medium truncate">{fileName}</span></div>
      <Button variant="outline" size="sm" onClick={onDownload}><Download className="h-4 w-4 mr-2" />Download</Button>
    </div>
    <div className="flex-1 flex items-center justify-center bg-muted/20 p-8 text-center">
      <p className="text-sm text-muted-foreground">Download this {fileType.toUpperCase()} file to view it in your Office application.</p>
    </div>
  </div>
)
