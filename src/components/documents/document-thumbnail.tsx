'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getDocumentIcon } from './file-type-utils'

function generatePdfCanvasPreview(ctx: CanvasRenderingContext2D, canvasSize: number) {
    const padding = canvasSize * 0.1

    // PDF background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(padding, padding, canvasSize - 2 * padding, canvasSize - 2 * padding)

    // PDF border
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 1
    ctx.strokeRect(padding, padding, canvasSize - 2 * padding, canvasSize - 2 * padding)

    // Simulate text lines
    ctx.fillStyle = '#6b7280'
    ctx.fillRect(padding + 4, padding + 8, canvasSize * 0.6, 2)
    ctx.fillRect(padding + 4, padding + 14, canvasSize * 0.7, 2)
    ctx.fillRect(padding + 4, padding + 20, canvasSize * 0.5, 2)
    ctx.fillRect(padding + 4, padding + 26, canvasSize * 0.65, 2)

    // PDF icon in corner
    ctx.fillStyle = '#ef4444'
    ctx.font = `${canvasSize * 0.12}px sans-serif`
    ctx.fillText('PDF', canvasSize - padding - 20, canvasSize - padding - 4)
  }

function generateMarkdownCanvasPreview(ctx: CanvasRenderingContext2D, canvasSize: number) {
    const padding = canvasSize * 0.1

    // Markdown background
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(padding, padding, canvasSize - 2 * padding, canvasSize - 2 * padding)

    // Border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.strokeRect(padding, padding, canvasSize - 2 * padding, canvasSize - 2 * padding)

    // Simulate markdown content
    // Header (# Title)
    ctx.fillStyle = '#374151'
    ctx.fillRect(padding + 4, padding + 8, 3, 6)
    ctx.fillRect(padding + 10, padding + 8, canvasSize * 0.4, 2)

    // Text lines
    ctx.fillStyle = '#6b7280'
    ctx.fillRect(padding + 4, padding + 20, canvasSize * 0.7, 1)
    ctx.fillRect(padding + 4, padding + 24, canvasSize * 0.6, 1)
    ctx.fillRect(padding + 4, padding + 28, canvasSize * 0.75, 1)

    // Bullet points
    ctx.fillStyle = '#9ca3af'
    ctx.fillRect(padding + 4, padding + 36, 2, 2)
    ctx.fillRect(padding + 4, padding + 42, 2, 2)
    ctx.fillRect(padding + 10, padding + 36, canvasSize * 0.5, 1)
    ctx.fillRect(padding + 10, padding + 42, canvasSize * 0.4, 1)

    // MD badge
    ctx.fillStyle = '#8b5cf6'
    ctx.font = `${canvasSize * 0.1}px sans-serif`
    ctx.fillText('MD', canvasSize - padding - 16, canvasSize - padding - 4)
  }

interface DocumentThumbnailProps {
  document: {
    id: string
    name: string
    type: string
    mimeType?: string
    filePath?: string
    extractedText?: string
    originalFile?: File
  }
  size?: number
  className?: string
}

export const DocumentThumbnail: React.FC<DocumentThumbnailProps> = ({
  document,
  size = 80,
  className = ""
}) => {
  const generateCanvasPreview = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = size
    canvas.height = size

    // Clear canvas
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)

    // Add border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, size, size)

    if (document.type === 'pdf') {
      // Generate PDF-like preview
      generatePdfCanvasPreview(ctx, size)
    } else if (document.type === 'md') {
      // Generate Markdown-like preview
      generateMarkdownCanvasPreview(ctx, size)
    }

  }, [document, size])

  return document.type === 'pdf' || document.type === 'md' ? (
    <canvas ref={generateCanvasPreview} width={size} height={size} className={`rounded ${className}`} style={{ width: size, height: size }} aria-label={`Preview of ${document.name}`} />
  ) : <div className={`flex items-center justify-center ${className}`}>{getDocumentIcon(document.type, size)}</div>
}
