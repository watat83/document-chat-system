'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { FileText, AlertCircle, Image, Code, FileSpreadsheet, Play, Archive, BookOpen } from 'lucide-react'

interface ExperimentalCanvasPreviewProps {
  document: {
    id: string
    name: string
    type: string
    size: string
    mimeType?: string
    originalFile?: File
  }
  className?: string
  width?: number
  height?: number
}

export const ExperimentalCanvasPreview: React.FC<ExperimentalCanvasPreviewProps> = ({
  document: doc,
  className = "",
  width,
  height
}) => {
  // Generate unique ID for this component instance
  const instanceId = React.useId()
  
  const containerRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 })

  // Handle responsive sizing
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: containerWidth, height: containerHeight } = entry.contentRect
        setDimensions({
          width: width || Math.max(200, containerWidth),
          height: height || Math.max(150, containerHeight)
        })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [width, height])

  // Comprehensive file type mapping (adapted from your friend's code)
  const getSupportedFileTypes = () => {
    return {
      pdf: ['application/pdf'],
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff', 'image/ico'],
      text: ['text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json', 'text/xml', 'text/rtf', 'text/markdown'],
      code: ['application/javascript', 'text/typescript', 'text/x-python', 'text/x-java-source', 'text/x-c', 'text/x-c++src', 'text/x-csharp', 'application/x-php', 'text/x-ruby', 'text/x-go', 'text/x-rust', 'text/x-swift', 'text/x-kotlin', 'application/x-yaml', 'text/x-sql'],
      csv: ['text/csv', 'application/csv'],
      spreadsheet: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.oasis.opendocument.spreadsheet'],
      document: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.oasis.opendocument.text', 'application/rtf'],
      presentation: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint', 'application/vnd.oasis.opendocument.presentation'],
      video: ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/mkv', 'video/3gp'],
      audio: ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/m4a', 'audio/wma', 'audio/opus', 'audio/mpeg'],
      archive: ['application/zip', 'application/x-rar-compressed', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed'],
      ebook: ['application/epub+zip', 'application/x-mobipocket-ebook'],
      font: ['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-sfnt']
    }
  }

  const getFileTypeCategory = (mimeType?: string, fileName?: string) => {
    const supportedTypes = getSupportedFileTypes()
    
    // Check by MIME type first
    if (mimeType) {
      for (const [category, types] of Object.entries(supportedTypes)) {
        if (types.includes(mimeType)) {
          return category
        }
      }
    }
    
    // Check by file extension as fallback
    if (fileName) {
      const extension = fileName.toLowerCase().split('.').pop()
      const extensionMap = {
        // Text files
        'txt': 'text', 'md': 'text', 'log': 'text', 'readme': 'text', 'rtf': 'text',
        // Code files
        'js': 'code', 'ts': 'code', 'jsx': 'code', 'tsx': 'code', 'py': 'code', 'java': 'code', 
        'cpp': 'code', 'c': 'code', 'h': 'code', 'cs': 'code', 'php': 'code', 'rb': 'code', 
        'go': 'code', 'rs': 'code', 'swift': 'code', 'kt': 'code', 'sql': 'code', 'yml': 'code', 'yaml': 'code',
        // Images
        'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image', 
        'svg': 'image', 'bmp': 'image', 'tiff': 'image', 'ico': 'image',
        // Documents
        'pdf': 'pdf',
        'docx': 'document', 'doc': 'document', 'odt': 'document',
        // Spreadsheets
        'xlsx': 'spreadsheet', 'xls': 'spreadsheet', 'ods': 'spreadsheet',
        // CSV
        'csv': 'csv',
        // Presentations
        'pptx': 'presentation', 'ppt': 'presentation', 'odp': 'presentation',
        // Video
        'mp4': 'video', 'webm': 'video', 'mov': 'video', 'avi': 'video', 'wmv': 'video', 
        'flv': 'video', 'mkv': 'video', '3gp': 'video',
        // Audio
        'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'aac': 'audio', 'flac': 'audio', 
        'm4a': 'audio', 'wma': 'audio', 'opus': 'audio',
        // Archives
        'zip': 'archive', 'rar': 'archive', 'tar': 'archive', 'gz': 'archive', '7z': 'archive',
        // E-books
        'epub': 'ebook', 'mobi': 'ebook',
        // Fonts
        'ttf': 'font', 'otf': 'font', 'woff': 'font', 'woff2': 'font'
      }
      
      return extensionMap[extension as keyof typeof extensionMap] || 'unknown'
    }
    
    return 'unknown'
  }

  // Image preview generator
  const generateImagePreview = async (file: File): Promise<{dataURL: string, additionalInfo: any}> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        resolve({
          dataURL: e.target?.result as string,
          additionalInfo: {}
        })
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Text preview generator (adapted and made responsive)
  const generateTextPreview = async (file: File): Promise<{dataURL: string, additionalInfo: any}> => {
    const text = await file.text()
    const canvas = document.createElement('canvas')
    canvas.id = `${instanceId}-text-canvas`
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context for text preview')
    }
    
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    
    // Background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)
    
    // Border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, dimensions.width, dimensions.height)
    
    // Text content
    ctx.fillStyle = '#374151'
    const fontSize = Math.max(10, Math.min(14, dimensions.width / 40))
    ctx.font = `${fontSize}px Monaco, monospace`
    
    const lineHeight = fontSize * 1.4
    const maxLines = Math.floor((dimensions.height - 40) / lineHeight)
    const maxCharsPerLine = Math.floor((dimensions.width - 20) / (fontSize * 0.6))
    
    const lines = text.split('\n').slice(0, maxLines)
    lines.forEach((line, index) => {
      const truncated = line.length > maxCharsPerLine ? line.substring(0, maxCharsPerLine) + '...' : line
      ctx.fillText(truncated, 10, 20 + (index * lineHeight))
    })
    
    // Add file type indicator
    ctx.fillStyle = '#9ca3af'
    ctx.font = `bold ${Math.max(10, fontSize - 2)}px Arial`
    ctx.fillText(`${file.name}`, 10, dimensions.height - 10)
    
    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: { lines: text.split('\n').length, characters: text.length }
    }
  }

  // CSV preview generator (adapted and made responsive)
  const generateCSVPreview = async (file: File): Promise<{dataURL: string, additionalInfo: any}> => {
    const text = await file.text()
    const lines = text.split('\n')
    const canvas = document.createElement('canvas')
    canvas.id = `${instanceId}-csv-canvas`
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context for CSV preview')
    }
    
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    
    // Background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)
    
    // Border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, dimensions.width, dimensions.height)
    
    // Title
    ctx.fillStyle = '#374151'
    const titleFontSize = Math.max(12, Math.min(18, dimensions.width / 30))
    ctx.font = `bold ${titleFontSize}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('📊 CSV Data Preview', dimensions.width / 2, titleFontSize + 10)
    
    // Parse CSV data (simple parsing)
    const rows = lines.slice(0, 15).map(line => 
      line.split(',').map(cell => cell.trim().replace(/"/g, ''))
    )
    
    // Draw table
    const fontSize = Math.max(9, Math.min(12, dimensions.width / 60))
    ctx.font = `${fontSize}px Monaco, monospace`
    ctx.textAlign = 'left'
    
    const maxCols = Math.min(6, Math.max(...rows.map(row => row.length)))
    const colWidth = Math.max(60, (dimensions.width - 40) / maxCols)
    const rowHeight = Math.max(15, fontSize + 8)
    const startX = 20
    const startY = titleFontSize + 30
    
    rows.forEach((row, rowIndex) => {
      const isHeader = rowIndex === 0
      
      // Header styling
      if (isHeader) {
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(startX, startY + rowIndex * rowHeight - 15, 760, rowHeight)
        ctx.fillStyle = '#1f2937'
        ctx.font = 'bold 11px Monaco, monospace'
      } else {
        ctx.fillStyle = '#374151'
        ctx.font = '11px Monaco, monospace'
      }
      
      // Draw grid lines
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 0.5
      ctx.strokeRect(startX, startY + rowIndex * rowHeight - 15, 760, rowHeight)
      
      row.slice(0, 6).forEach((cell, colIndex) => {
        const truncated = cell.length > 15 ? cell.substring(0, 15) + '...' : cell
        ctx.fillText(truncated, startX + colIndex * colWidth + 5, startY + rowIndex * rowHeight)
        
        // Vertical lines
        ctx.beginPath()
        ctx.moveTo(startX + (colIndex + 1) * colWidth, startY + rowIndex * rowHeight - 15)
        ctx.lineTo(startX + (colIndex + 1) * colWidth, startY + rowIndex * rowHeight + 10)
        ctx.stroke()
      })
    })
    
    // Stats
    ctx.fillStyle = '#6b7280'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(`${lines.length} rows × ${rows[0]?.length || 0} columns`, 400, 480)
    
    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: { 
        rows: lines.length, 
        columns: rows[0]?.length || 0,
        estimatedSize: text.length 
      }
    }
  }

  // Audio preview generator (adapted and made responsive)
  const generateAudioPreview = async (file: File): Promise<{dataURL: string, additionalInfo: any}> => {
    const canvas = document.createElement('canvas')
    canvas.id = `${instanceId}-audio-canvas`
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context for audio preview')
    }
    
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    
    // Background
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)
    
    // Audio waveform simulation
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = Math.max(1, dimensions.width / 300)
    ctx.beginPath()
    
    const centerY = dimensions.height / 2
    const waveData = []
    for (let i = 0; i < 100; i++) {
      waveData.push(Math.sin(i * 0.1) * Math.random() * (dimensions.height / 12))
    }
    
    waveData.forEach((amplitude, index) => {
      const x = (index / 100) * (dimensions.width - 40) + 20
      const y = centerY + amplitude
      
      if (index === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()
    
    // Play button
    const buttonRadius = Math.min(30, dimensions.width / 15, dimensions.height / 10)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.beginPath()
    ctx.arc(dimensions.width / 2, dimensions.height / 2, buttonRadius, 0, 2 * Math.PI)
    ctx.fill()
    
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    const playX = dimensions.width / 2 - buttonRadius * 0.3
    const playY1 = dimensions.height / 2 - buttonRadius * 0.4
    const playY2 = dimensions.height / 2 + buttonRadius * 0.4
    const playX2 = dimensions.width / 2 + buttonRadius * 0.3
    ctx.moveTo(playX, playY1)
    ctx.lineTo(playX, playY2)
    ctx.lineTo(playX2, dimensions.height / 2)
    ctx.closePath()
    ctx.fill()
    
    // File info
    ctx.fillStyle = '#ffffff'
    const titleFontSize = Math.max(12, Math.min(20, dimensions.width / 25))
    ctx.font = `bold ${titleFontSize}px Arial`
    ctx.textAlign = 'center'
    const fileName = file.name.length > 30 ? file.name.substring(0, 30) + '...' : file.name
    ctx.fillText('🎵 ' + fileName, dimensions.width / 2, titleFontSize + 20)
    
    const infoFontSize = Math.max(10, titleFontSize - 4)
    ctx.font = `${infoFontSize}px Arial`
    ctx.fillStyle = '#9ca3af'
    ctx.fillText(`Audio File • ${(file.size / 1024).toFixed(1)} KB`, dimensions.width / 2, dimensions.height - 30)
    
    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: {}
    }
  }

  // PDF preview generator (adapted from friend's implementation)
  const generatePDFPreview = async (file: File): Promise<{dataURL: string, additionalInfo: any}> => {
    // Dynamically load PDF.js if not available
    if (!(window as any).pdfjsLib) {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.setAttribute('data-instance', instanceId)
      document.head.appendChild(script)
      
      await new Promise((resolve, reject) => {
        script.onload = resolve
        script.onerror = reject
      });
      
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await (window as any).pdfjsLib.getDocument(arrayBuffer).promise
    const page = await pdf.getPage(1)
    
    const canvas = document.createElement('canvas')
    canvas.id = `${instanceId}-pdf-canvas`
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to get canvas context for PDF preview')
    }
    
    // Calculate scale to fit dimensions
    const viewport = page.getViewport({ scale: 1.0 })
    const scale = Math.min(
      dimensions.width / viewport.width,
      dimensions.height / viewport.height,
      1.5
    )
    const scaledViewport = page.getViewport({ scale })
    
    canvas.height = scaledViewport.height
    canvas.width = scaledViewport.width
    
    await page.render({ canvasContext: context, viewport: scaledViewport }).promise
    
    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: { pages: pdf.numPages }
    }
  }

  // Video preview generator (adapted from friend's implementation)
  const generateVideoPreview = async (file: File): Promise<{dataURL: string, additionalInfo: any}> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      const canvas = document.createElement('canvas')
      canvas.id = `${instanceId}-video-canvas`
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context for video preview'))
        return
      }
      
      canvas.width = dimensions.width
      canvas.height = dimensions.height
      
      video.onloadeddata = () => {
        // Set video time to 1 second for thumbnail
        video.currentTime = 1
        
        video.onseeked = () => {
          // Calculate scale to fit video while maintaining aspect ratio
          const scale = Math.min(
            dimensions.width / video.videoWidth,
            dimensions.height / video.videoHeight
          )
          
          const scaledWidth = video.videoWidth * scale
          const scaledHeight = video.videoHeight * scale
          const x = (dimensions.width - scaledWidth) / 2
          const y = (dimensions.height - scaledHeight) / 2
          
          // Background
          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, dimensions.width, dimensions.height)
          
          // Draw video frame
          ctx.drawImage(video, x, y, scaledWidth, scaledHeight)
          
          // Add play button overlay
          const buttonSize = Math.min(40, dimensions.width / 10, dimensions.height / 8)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
          ctx.beginPath()
          ctx.arc(dimensions.width / 2, dimensions.height / 2, buttonSize, 0, 2 * Math.PI)
          ctx.fill()
          
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          const playX = dimensions.width / 2 - buttonSize * 0.3
          const playY1 = dimensions.height / 2 - buttonSize * 0.4
          const playY2 = dimensions.height / 2 + buttonSize * 0.4
          const playX2 = dimensions.width / 2 + buttonSize * 0.3
          ctx.moveTo(playX, playY1)
          ctx.lineTo(playX, playY2)
          ctx.lineTo(playX2, dimensions.height / 2)
          ctx.closePath()
          ctx.fill()
          
          URL.revokeObjectURL(video.src)
          resolve({
            dataURL: canvas.toDataURL('image/png'),
            additionalInfo: { 
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight 
            }
          })
        }
      }
      
      video.onerror = () => {
        try {
          // Fallback to generic video preview
          ctx.fillStyle = '#1f2937'
          ctx.fillRect(0, 0, dimensions.width, dimensions.height)
          
          const iconSize = Math.min(60, dimensions.width / 6)
          ctx.font = `bold ${iconSize}px Arial`
          ctx.textAlign = 'center'
          ctx.fillStyle = '#a21caf'
          ctx.fillText('🎥', dimensions.width / 2, dimensions.height / 2)
          
          ctx.fillStyle = '#ffffff'
          const fontSize = Math.max(14, iconSize / 4)
          ctx.font = `bold ${fontSize}px Arial`
          ctx.fillText('Video Preview', dimensions.width / 2, dimensions.height / 2 + iconSize)
          
          resolve({
            dataURL: canvas.toDataURL('image/png'),
            additionalInfo: {}
          })
        } catch (err) {
          reject(err)
        }
      }
      
      video.src = URL.createObjectURL(file)
    })
  }

  // Archive preview generator (adapted from friend's implementation)  
  const generateArchivePreview = async (file: File): Promise<{dataURL: string, additionalInfo: any}> => {
    const canvas = document.createElement('canvas')
    canvas.id = `${instanceId}-archive-canvas`
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context for archive preview')
    }
    
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    
    // Background
    ctx.fillStyle = '#fef3c7'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)
    
    // Border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, dimensions.width, dimensions.height)
    
    // Archive icon
    ctx.fillStyle = '#d97706'
    const iconSize = Math.max(40, Math.min(80, dimensions.width / 6))
    ctx.font = `bold ${iconSize}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('📦', dimensions.width / 2, dimensions.height / 2 - 20)
    
    // File info
    const extension = file.name.split('.').pop()?.toUpperCase() || 'ARCHIVE'
    ctx.fillStyle = '#92400e'
    const titleFontSize = Math.max(16, Math.min(28, dimensions.width / 20))
    ctx.font = `bold ${titleFontSize}px Arial`
    ctx.fillText(extension + ' Archive', dimensions.width / 2, dimensions.height / 2 + 20)
    
    ctx.font = `${Math.max(12, titleFontSize - 6)}px Arial`
    ctx.fillStyle = '#a16207'
    const fileName = file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name
    ctx.fillText(fileName, dimensions.width / 2, dimensions.height / 2 + 45)
    ctx.fillText(`${(file.size / (1024 * 1024)).toFixed(1)} MB`, dimensions.width / 2, dimensions.height / 2 + 65)
    
    // Info text
    ctx.font = `${Math.max(10, titleFontSize - 8)}px Arial`
    ctx.fillStyle = '#78716c'
    ctx.fillText('Extract to view contents', dimensions.width / 2, dimensions.height - 30)
    
    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: { 
        extension: extension,
        size: (file.size / (1024 * 1024)).toFixed(1) + ' MB'
      }
    }
  }

  // Generic preview generator for unsupported types
  const generateGenericPreview = async (file: File, category: string): Promise<{dataURL: string, additionalInfo: any}> => {
    const canvas = document.createElement('canvas')
    canvas.id = `${instanceId}-generic-canvas`
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context for generic preview')
    }
    
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    
    // Category-specific styling
    const categoryStyles = {
      document: { bg: '#dbeafe', icon: '📄', color: '#2563eb' },
      spreadsheet: { bg: '#dcfce7', icon: '📊', color: '#16a34a' },
      presentation: { bg: '#fed7aa', icon: '📈', color: '#ea580c' },
      font: { bg: '#f0f9ff', icon: '🔤', color: '#0369a1' },
      ebook: { bg: '#fef7cd', icon: '📚', color: '#a16207' },
      cad: { bg: '#f0fdf4', icon: '📐', color: '#166534' },
      executable: { bg: '#fef2f2', icon: '⚙️', color: '#dc2626' },
      data: { bg: '#f8fafc', icon: '🗄️', color: '#475569' },
      design: { bg: '#fdf4ff', icon: '🎨', color: '#a21caf' },
      default: { bg: '#f9fafb', icon: '📄', color: '#6b7280' }
    }
    
    const style = categoryStyles[category as keyof typeof categoryStyles] || categoryStyles.default
    
    // Background
    ctx.fillStyle = style.bg
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)
    
    // Border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, dimensions.width, dimensions.height)
    
    // Icon
    const iconSize = Math.max(32, Math.min(64, dimensions.width / 8))
    ctx.font = `bold ${iconSize}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText(style.icon, dimensions.width / 2, dimensions.height / 2 - iconSize / 2)
    
    // File type
    const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE'
    ctx.fillStyle = style.color
    const typeFontSize = Math.max(16, Math.min(32, dimensions.width / 15))
    ctx.font = `bold ${typeFontSize}px Arial`
    ctx.fillText(extension, dimensions.width / 2, dimensions.height / 2 + typeFontSize)
    
    // Category
    const categoryFontSize = Math.max(12, typeFontSize - 6)
    ctx.font = `${categoryFontSize}px Arial`
    ctx.fillText(category.charAt(0).toUpperCase() + category.slice(1) + ' File', dimensions.width / 2, dimensions.height / 2 + typeFontSize + categoryFontSize + 5)
    
    // File info
    ctx.fillStyle = '#6b7280'
    const infoFontSize = Math.max(10, categoryFontSize - 2)
    ctx.font = `${infoFontSize}px Arial`
    const fileName = file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name
    ctx.fillText(fileName, dimensions.width / 2, dimensions.height - infoFontSize * 3)
    ctx.fillText(`${(file.size / 1024).toFixed(1)} KB`, dimensions.width / 2, dimensions.height - infoFontSize)
    
    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: { 
        category: category,
        extension: extension,
        size: (file.size / 1024).toFixed(1) + ' KB'
      }
    }
  }

  // Main preview generation function
  const generateFilePreview = useCallback(async (file: File) => {
    try {
      console.log(`[${instanceId}] Starting preview generation for:`, file.name, 'Type:', file.type)
      setLoading(true)
      setError('')
      
      const category = getFileTypeCategory(file.type, file.name)
      console.log(`[${instanceId}] Detected category:`, category)
      let result: {dataURL: string, additionalInfo: any}
      
      switch (category) {
        case 'pdf':
          result = await generatePDFPreview(file)
          break
        case 'image':
          result = await generateImagePreview(file)
          break
        case 'text':
        case 'code':
          result = await generateTextPreview(file)
          break
        case 'csv':
          result = await generateCSVPreview(file)
          break
        case 'video':
          result = await generateVideoPreview(file)
          break
        case 'audio':
          result = await generateAudioPreview(file)
          break
        case 'archive':
          result = await generateArchivePreview(file)
          break
        case 'spreadsheet':
        case 'document':
        case 'presentation':
        case 'font':
        case 'ebook':
        case 'cad':
        case 'executable':
        case 'data':
        case 'design':
          result = await generateGenericPreview(file, category)
          break
        default:
          result = await generateGenericPreview(file, 'unknown')
      }
      
      console.log(`[${instanceId}] Preview generation successful, result length:`, result.dataURL.length)
      console.log(`[${instanceId}] Additional info:`, result.additionalInfo)
      setPreview(result.dataURL)
      
    } catch (err) {
      console.error(`[${instanceId}] Canvas Preview Error:`, err)
      setError(`Failed to generate preview: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [dimensions, instanceId])

  // Generate preview when file or dimensions change
  useEffect(() => {
    console.log(`[${instanceId}] ExperimentalCanvasPreview Effect:`, {
      hasOriginalFile: !!doc.originalFile,
      fileName: doc.originalFile?.name,
      dimensions,
      docName: doc.name
    })
    if (doc.originalFile && dimensions.width > 0 && dimensions.height > 0) {
      console.log(`[${instanceId}] Generating preview for:`, doc.originalFile.name)
      const timeout = window.setTimeout(() => {
        void generateFilePreview(doc.originalFile!)
      }, 0)

      return () => window.clearTimeout(timeout)
    }
  }, [doc.originalFile, dimensions, generateFilePreview, instanceId])

  // Cleanup function
  useEffect(() => {
    return () => {
      console.log(`[${instanceId}] Cleaning up canvas preview component`)
      // Clean up any blob URLs that might have been created
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [instanceId, preview])

  const getFileIcon = (category: string) => {
    switch (category) {
      case 'pdf':
      case 'document': return <FileText className="h-4 w-4 text-blue-500" />
      case 'image': return <Image className="h-4 w-4 text-green-500" />
      case 'text':
      case 'code': return <Code className="h-4 w-4 text-purple-500" />
      case 'csv':
      case 'spreadsheet': return <FileSpreadsheet className="h-4 w-4 text-orange-500" />
      case 'video': return <Play className="h-4 w-4 text-red-500" />
      case 'audio': return <Play className="h-4 w-4 text-pink-500" />
      case 'archive': return <Archive className="h-4 w-4 text-yellow-600" />
      case 'ebook': return <BookOpen className="h-4 w-4 text-indigo-500" />
      case 'presentation': return <FileText className="h-4 w-4 text-orange-600" />
      case 'font': return <FileText className="h-4 w-4 text-indigo-600" />
      case 'cad': return <FileText className="h-4 w-4 text-teal-500" />
      case 'executable': return <FileText className="h-4 w-4 text-red-700" />
      case 'data': return <FileText className="h-4 w-4 text-slate-500" />
      case 'design': return <Image className="h-4 w-4 text-purple-600" />
      default: return <FileText className="h-4 w-4 text-gray-500" />
    }
  }

  const category = getFileTypeCategory(doc.mimeType, doc.name)

  if (error) {
    return (
      <div ref={containerRef} className={`w-full h-full flex flex-col items-center justify-center p-4 bg-red-50 border border-red-200 rounded ${className}`}>
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <p className="text-red-700 text-sm text-center">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div ref={containerRef} className={`w-full h-full flex flex-col items-center justify-center bg-blue-50 border border-blue-200 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-blue-700 text-sm font-medium">Generating canvas preview...</p>
        <p className="text-blue-600 text-xs mt-1">{doc.name}</p>
      </div>
    )
  }

  if (!doc.originalFile) {
    return (
      <div ref={containerRef} className={`w-full h-full flex flex-col items-center justify-center p-4 bg-gray-50 border border-gray-200 rounded ${className}`}>
        {getFileIcon(category)}
        <p className="text-gray-600 text-sm mt-2 text-center">{doc.name}</p>
        <p className="text-gray-500 text-xs mt-1">Canvas preview requires uploaded file</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`w-full h-full bg-white rounded ${className}`}>
      {preview ? (
        <img
          src={preview}
          alt={`Preview of ${doc.name}`}
          className="w-full h-full object-contain rounded"
          style={{ imageRendering: 'crisp-edges' }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-50">
          {getFileIcon(category)}
          <p className="text-gray-600 text-sm mt-2 text-center">{doc.name}</p>
          <p className="text-gray-500 text-xs mt-1">Preparing canvas preview...</p>
        </div>
      )}
    </div>
  )
}
