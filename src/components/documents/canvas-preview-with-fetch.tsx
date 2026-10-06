'use client'

import React from 'react'
import { useDocumentFile } from '@/hooks/use-document-file'
import { ResponsiveCanvasPreview } from './responsive-canvas-preview'

interface CanvasPreviewWithFetchProps {
  document: {
    id: string
    name: string
    mimeType?: string
    originalFile?: File
  }
  className?: string
}

// Component for handling canvas preview with fetched file content
export const CanvasPreviewWithFetch: React.FC<CanvasPreviewWithFetchProps> = ({
  document: doc,
  className = ''
}) => {
  const { fetchedFile, loading, error, retryCount } = useDocumentFile(doc)
  const maxRetries = 3
  const isFailed = Boolean(error)

  if (loading) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <div className="text-xs text-gray-500">
            {retryCount > 0 ? `Retrying... (${retryCount + 1}/${maxRetries})` : 'Loading...'}
          </div>
        </div>
      </div>
    );
  }

  if (error || !fetchedFile) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-gray-500 ${className}`}>
        <div className="text-center p-4">
          <div className="text-6xl mb-4 text-gray-400">📄</div>
          <div className="text-sm font-medium mb-2">Preview not available</div>
          <div className="text-xs text-gray-600 mb-3">{doc.name}</div>
          {error && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2 max-w-sm mx-auto">
              {error}
                  {isFailed && (
                <div className="text-xs text-gray-600 mt-1">
                  ⛔ No more retry attempts will be made
                </div>
              )}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-3">
            Document exists but preview cannot be loaded
          </div>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveCanvasPreview
      file={fetchedFile}
      fileName={doc.name}
      className={className}
    />
  );
};
