'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

// TypeScript declarations for PDF.js
declare global {
  interface Window {
    pdfjsLib: any
  }
}

interface ResponsiveCanvasPreviewProps {
  file: File
  fileName: string
  className?: string
}

export const ResponsiveCanvasPreview: React.FC<ResponsiveCanvasPreviewProps> = ({
  file,
  fileName,
  className = ''
}) => {
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 })

  // File type detection based on extension (more reliable than MIME type)
  const getFileTypeCategory = useCallback((fileName: string): string => {
    const extension = fileName.toLowerCase().split('.').pop() || ''

    const extensionMap: Record<string, string> = {
      // Text files
      'txt': 'text', 'md': 'text', 'log': 'text', 'readme': 'text', 'rtf': 'text',
      'text': 'text', 'conf': 'text', 'cfg': 'text',  'env': 'text',
      'gitignore': 'text', 'license': 'text', 'dockerfile': 'text', 'makefile': 'text',
      // Code files
      'js': 'code',  'jsx': 'code', 'tsx': 'code', 'mjs': 'code', 'cjs': 'code',
      'py': 'code', 'pyw': 'code', 'pyc': 'code', 'pyo': 'code', 'pyd': 'code',
      'java': 'code', 'class': 'code', 'jar': 'code', 'war': 'code',
      'cpp': 'code', 'cxx': 'code', 'cc': 'code', 'c': 'code', 'h': 'code', 'hpp': 'code',
      'cs': 'code', 'vb': 'code', 'fs': 'code', 'dll': 'code',
      'php': 'code', 'phtml': 'code', 'php3': 'code', 'php4': 'code', 'php5': 'code',
      'rb': 'code', 'rbw': 'code', 'gem': 'code',
      'go': 'code', 'mod': 'code', 'sum': 'code',
      'rs': 'code', 'rlib': 'code',
      'swift': 'code', 'kt': 'code', 'kts': 'code',
      'sql': 'code', 'sqlite': 'code', 'db': 'code',
      'yml': 'code', 'yaml': 'code', 'toml': 'code', 'ini': 'code',
      'json': 'code', 'jsonc': 'code', 'json5': 'code',
      'xml': 'code', 'xsl': 'code', 'xsd': 'code', 'dtd': 'code',
      'html': 'code', 'htm': 'code', 'xhtml': 'code',
      'css': 'code', 'scss': 'code', 'sass': 'code', 'less': 'code', 'styl': 'code',
      'vue': 'code', 'svelte': 'code', 'angular': 'code',
      'sh': 'code', 'bash': 'code', 'zsh': 'code', 'fish': 'code',
      'bat': 'code', 'cmd': 'code', 'ps1': 'code', 'psm1': 'code',
      'r': 'code', 'rmd': 'code', 'stata': 'code', 'sas': 'code',
      'matlab': 'code', 'm': 'code', 'scala': 'code', 'clj': 'code',
      // Images
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
      'svg': 'image', 'bmp': 'image', 'tiff': 'image', 'tif': 'image', 'ico': 'image',
      'heic': 'image', 'heif': 'image', 'avif': 'image', 'jfif': 'image',
      'raw': 'image', 'cr2': 'image', 'nef': 'image', 'arw': 'image', 'dng': 'image',
      'psd': 'image', 'ai': 'image', 'eps': 'image', 'sketch': 'image',
      // Documents
      'pdf': 'pdf',
      'docx': 'document', 'doc': 'document', 'docm': 'document', 'dotx': 'document', 'dotm': 'document',
      'odt': 'document', 'ott': 'document', 'fodt': 'document',
      'pages': 'document',
      'wpd': 'document', 'wps': 'document',
      // Spreadsheets
      'xlsx': 'spreadsheet', 'xls': 'spreadsheet', 'xlsm': 'spreadsheet', 'xlsb': 'spreadsheet',
      'xltx': 'spreadsheet', 'xltm': 'spreadsheet', 'xlam': 'spreadsheet',
      'ods': 'spreadsheet', 'ots': 'spreadsheet', 'fods': 'spreadsheet',
      'numbers': 'spreadsheet',
      // CSV and data
      'csv': 'csv', 'tsv': 'csv', 'tab': 'csv', 'psv': 'csv',
      'dat': 'csv', 'data': 'csv', 'dsv': 'csv',
      // Presentations
      'pptx': 'presentation', 'ppt': 'presentation', 'pptm': 'presentation',
      'potx': 'presentation', 'potm': 'presentation', 'ppsx': 'presentation', 'ppsm': 'presentation',
      'odp': 'presentation', 'otp': 'presentation', 'fodp': 'presentation',
      'key': 'presentation',
      // Video
      'mp4': 'video', 'webm': 'video', 'mov': 'video', 'avi': 'video', 'wmv': 'video',
      'flv': 'video', 'mkv': 'video', '3gp': 'video', '3g2': 'video', 'm4v': 'video',
      'ogv': 'video', 'mxf': 'video', 'ts': 'video', 'm2ts': 'video', 'vob': 'video',
      'asf': 'video', 'rm': 'video', 'rmvb': 'video', 'divx': 'video', 'xvid': 'video',
      // Audio
      'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'oga': 'audio', 'aac': 'audio',
      'flac': 'audio', 'm4a': 'audio', 'wma': 'audio', 'opus': 'audio',
      'aiff': 'audio', 'au': 'audio', 'ra': 'audio', 'amr': 'audio', 'awb': 'audio',
      'dsd': 'audio', 'dsf': 'audio', 'dff': 'audio',
      // Archives
      'zip': 'archive', 'rar': 'archive', 'tar': 'archive', 'gz': 'archive', 'tgz': 'archive',
      '7z': 'archive', 'bz2': 'archive', 'tbz2': 'archive', 'xz': 'archive', 'txz': 'archive',
      'lz': 'archive', 'lzma': 'archive', 'lzo': 'archive', 'z': 'archive',
        'iso': 'archive', 'img': 'archive',
      'cab': 'archive',   'ace': 'archive',
      // Fonts
      'ttf': 'font', 'otf': 'font', 'woff': 'font', 'woff2': 'font', 'eot': 'font',
      // Executables and binaries
      'exe': 'executable', 'msi': 'executable', 'app': 'executable', 'deb': 'executable',
      'rpm': 'executable', 'dmg': 'executable', 'pkg': 'executable', 'apk': 'executable',
      'ipa': 'executable', 'bin': 'executable', 'run': 'executable',
      // CAD and 3D
      'dwg': 'cad', 'dxf': 'cad', 'step': 'cad', 'stp': 'cad', 'iges': 'cad', 'igs': 'cad',
      'obj': 'cad', 'stl': 'cad', 'ply': 'cad', '3ds': 'cad', 'fbx': 'cad', 'dae': 'cad',
      // eBooks
      'epub': 'ebook', 'mobi': 'ebook', 'azw': 'ebook', 'azw3': 'ebook', 'fb2': 'ebook',
      'lit': 'ebook', 'pdb': 'ebook', 'prc': 'ebook', 'lrf': 'ebook', 'ibooks': 'ebook'
    }

    return extensionMap[extension] || 'unknown'
  }, [])

  // Responsive container size detection
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({
          width: Math.max(300, rect.width - 20), // Min width 300px, with 20px padding
          height: Math.max(200, rect.height - 20) // Min height 200px, with 20px padding
        })
      }
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Generic preview for unsupported file types
  const generateGenericPreview = useCallback(async (file: File, category: string): Promise<{ dataURL: string; additionalInfo: any }> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Cannot get canvas context')
    }

    // Use reliable fixed dimensions
    const baseWidth = Math.max(400, dimensions.width)
    const baseHeight = Math.max(500, dimensions.height)

    canvas.width = baseWidth
    canvas.height = baseHeight

    // Category-specific styling
    const categoryStyles: Record<string, any> = {
      font: { bg: '#f0f9ff', icon: '🔤', color: '#0369a1' },
      ebook: { bg: '#fef7cd', icon: '📚', color: '#a16207' },
      cad: { bg: '#f0fdf4', icon: '📐', color: '#166534' },
      executable: { bg: '#fef2f2', icon: '⚙️', color: '#dc2626' },
      data: { bg: '#f8fafc', icon: '🗄️', color: '#475569' },
      design: { bg: '#fdf4ff', icon: '🎨', color: '#a21caf' },
      document: { bg: '#eff6ff', icon: '📄', color: '#2563eb' },
      spreadsheet: { bg: '#f0fdf4', icon: '📊', color: '#16a34a' },
      presentation: { bg: '#fef3c7', icon: '📈', color: '#d97706' },
      pdf: { bg: '#fef2f2', icon: '📋', color: '#dc2626' },
      default: { bg: '#f9fafb', icon: '📄', color: '#6b7280' }
    }

    const style = categoryStyles[category] || categoryStyles.default

    // Background
    ctx.fillStyle = style.bg
    ctx.fillRect(0, 0, baseWidth, baseHeight)

    // Border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, baseWidth, baseHeight)

    // Icon
    ctx.font = 'bold 64px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(style.icon, baseWidth / 2, 150)

    // File type
    const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE'
    ctx.fillStyle = style.color
    ctx.font = 'bold 32px Arial'
    ctx.fillText(extension, baseWidth / 2, 220)

    // Category
    ctx.font = 'bold 18px Arial'
    ctx.fillText(category.charAt(0).toUpperCase() + category.slice(1) + ' File', baseWidth / 2, 250)

    // File info
    ctx.fillStyle = '#6b7280'
    ctx.font = '16px Arial'
    ctx.fillText(file.name, baseWidth / 2, 300)
    ctx.fillText(`${(file.size / 1024).toFixed(1)} KB`, baseWidth / 2, 330)

    // Additional info
    ctx.font = '14px Arial'
    ctx.fillStyle = '#9ca3af'
    ctx.fillText('Preview available', baseWidth / 2, 380)
    ctx.fillText('Click to view full content', baseWidth / 2, 400)

    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: {}
    }
  }, [dimensions.width, dimensions.height])

  // Enhanced image preview with error handling and optimization
  const generateImagePreview = useCallback(async (file: File): Promise<{ dataURL: string; additionalInfo: any }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        const img = new Image()

        img.onload = () => {
          // Create canvas to optimize image size and quality
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            resolve({
              dataURL: e.target?.result as string,
              additionalInfo: { width: img.width, height: img.height }
            })
            return
          }

          // Calculate optimal dimensions for container while maintaining aspect ratio
          const maxWidth = dimensions.width
          const maxHeight = dimensions.height

          let { width, height } = img

          // Scale down large images for better performance
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height)
            width = Math.floor(width * ratio)
            height = Math.floor(height * ratio)
          }

          canvas.width = width
          canvas.height = height

          // Use better image smoothing
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'

          ctx.drawImage(img, 0, 0, width, height)

          resolve({
            dataURL: canvas.toDataURL('image/jpeg', 0.9), // Optimize quality/size
            additionalInfo: {
              originalWidth: img.width,
              originalHeight: img.height,
              displayWidth: width,
              displayHeight: height,
              fileSize: file.size
            }
          })
        }

        img.onerror = () => {
          resolve({
            dataURL: e.target?.result as string,
            additionalInfo: { error: 'Failed to process image' }
          })
        }

        img.src = e.target?.result as string
      }

      reader.onerror = () => {
        reject(new Error('Failed to read image file'))
      }

      reader.readAsDataURL(file)
    })
  }, [dimensions.width, dimensions.height])

  // Robust PDF preview with better error handling and fallback
  const generatePDFPreview = useCallback(async (file: File): Promise<{ dataURL: string; additionalInfo: any }> => {
    try {
      // Load PDF.js from CDN with timeout and error handling
      if (!window.pdfjsLib) {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        document.head.appendChild(script)

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('PDF.js loading timeout'))
          }, 10000)

          script.onload = () => {
            clearTimeout(timeout)
            resolve(true)
          }
          script.onerror = () => {
            clearTimeout(timeout)
            reject(new Error('Failed to load PDF.js'))
          }
        })

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      }

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await window.pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
      }).promise

      const page = await pdf.getPage(1)

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Cannot get canvas context for PDF rendering')
      }

      // Calculate optimal scale for container
      const viewport = page.getViewport({ scale: 1.0 })
      const scale = Math.min(
        dimensions.width / viewport.width,
        dimensions.height / viewport.height,
        2.0 // Max scale for quality
      )

      const scaledViewport = page.getViewport({ scale })
      canvas.width = scaledViewport.width
      canvas.height = scaledViewport.height

      await page.render({
        canvasContext: context,
        viewport: scaledViewport
      }).promise

      return {
        dataURL: canvas.toDataURL('image/png'),
        additionalInfo: { pages: pdf.numPages, scale }
      }
    } catch (error) {
      console.warn('PDF rendering failed, using fallback:', error)
      // Fallback to generic preview if PDF.js fails
      return await generateGenericPreview(file, 'pdf')
    }
  }, [dimensions, generateGenericPreview])

  // Enhanced text preview with better encoding and layout handling
  const generateTextPreview = useCallback(async (file: File): Promise<{ dataURL: string; additionalInfo: any }> => {
    try {
      // Try multiple encoding methods for text files
      let text: string
      try {
        text = await file.text()
      } catch (encodingError) {
        // Fallback for files with problematic encoding
        const arrayBuffer = await file.arrayBuffer()
        const decoder = new TextDecoder('utf-8', { fatal: false })
        text = decoder.decode(arrayBuffer)
      }

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('Cannot get canvas context')
      }

      // Responsive dimensions with minimum sizes
      const baseWidth = Math.max(400, dimensions.width)
      const baseHeight = Math.max(300, dimensions.height)

      canvas.width = baseWidth
      canvas.height = baseHeight

      // Background with subtle gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, baseHeight)
      gradient.addColorStop(0, '#ffffff')
      gradient.addColorStop(1, '#fafafa')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, baseWidth, baseHeight)

      // Border
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 1
      ctx.strokeRect(0, 0, baseWidth, baseHeight)

      // Header with file info
      ctx.fillStyle = '#1f2937'
      ctx.font = 'bold 14px Arial'
      ctx.fillText(`📄 ${fileName}`, 10, 25)

      // Text content with better formatting
      ctx.fillStyle = '#374151'
      ctx.font = '11px "Monaco", "Consolas", monospace'

      const lines = text.split('\n')
      const maxLines = Math.floor((baseHeight - 80) / 14) // Dynamic line count
      const displayLines = lines.slice(0, maxLines)
      const maxCharsPerLine = Math.floor((baseWidth - 20) / 7) // Dynamic line width

      displayLines.forEach((line, index) => {
        // Handle long lines by wrapping
        if (line.length > maxCharsPerLine) {
          const truncated = line.substring(0, maxCharsPerLine - 3) + '...'
          ctx.fillText(truncated, 10, 50 + (index * 14))
        } else {
          ctx.fillText(line || ' ', 10, 50 + (index * 14)) // Handle empty lines
        }
      })

      // File stats at bottom
      ctx.fillStyle = '#6b7280'
      ctx.font = '12px Arial'
      const totalLines = lines.length
      const totalChars = text.length
      const fileSize = (file.size / 1024).toFixed(1)
      ctx.fillText(`${totalLines} lines • ${totalChars} chars • ${fileSize} KB`, 10, baseHeight - 15)

      // Truncation indicator
      if (lines.length > maxLines) {
        ctx.fillStyle = '#f59e0b'
        ctx.font = 'italic 11px Arial'
        ctx.fillText(`... and ${lines.length - maxLines} more lines`, 10, baseHeight - 35)
      }

      return {
        dataURL: canvas.toDataURL('image/png'),
        additionalInfo: {
          lines: totalLines,
          characters: totalChars,
          displayed: displayLines.length,
          truncated: lines.length > maxLines
        }
      }
    } catch (error) {
      console.warn('Text rendering failed, using fallback:', error)
      return await generateGenericPreview(file, 'text')
    }
  }, [dimensions, fileName, generateGenericPreview])

  // Fixed generateCSVPreview based on working example.canvas.tsx
  const generateCSVPreview = useCallback(async (file: File): Promise<{ dataURL: string; additionalInfo: any }> => {
    const text = await file.text()
    const lines = text.split('\n')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Cannot get canvas context')
    }

    // Use reliable fixed dimensions that work, then scale responsively
    const baseWidth = Math.max(800, dimensions.width)
    const baseHeight = Math.max(500, dimensions.height)

    canvas.width = baseWidth
    canvas.height = baseHeight

    // Background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, baseWidth, baseHeight)

    // Border
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, baseWidth, baseHeight)

    // Title
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('📊 CSV Data Preview', baseWidth / 2, 30)

    // Parse CSV data (simple parsing) - use first 15 rows like example
    const rows = lines.slice(0, 15).map(line =>
      line.split(',').map(cell => cell.trim().replace(/"/g, ''))
    )

    // Draw table - use fixed values that work
    ctx.font = '11px Monaco, monospace'
    ctx.textAlign = 'left'

    const colWidth = 120
    const rowHeight = 25
    const startX = 20
    const startY = 60

    rows.forEach((row, rowIndex) => {
      const isHeader = rowIndex === 0

      // Header styling
      if (isHeader) {
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(startX, startY + rowIndex * rowHeight - 15, baseWidth - 40, rowHeight)
        ctx.fillStyle = '#1f2937'
        ctx.font = 'bold 11px Monaco, monospace'
      } else {
        ctx.fillStyle = '#374151'
        ctx.font = '11px Monaco, monospace'
      }

      // Draw grid lines
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 0.5
      ctx.strokeRect(startX, startY + rowIndex * rowHeight - 15, baseWidth - 40, rowHeight)

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
    ctx.fillText(`${lines.length} rows × ${rows[0]?.length || 0} columns`, baseWidth / 2, baseHeight - 20)

    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: {
        rows: lines.length,
        columns: rows[0]?.length || 0,
        estimatedSize: text.length
      }
    }
  }, [dimensions.width, dimensions.height])

  // Enhanced Office document preview with actual content rendering
  const generateOfficePreview = useCallback(async (file: File, category: string): Promise<{ dataURL: string; additionalInfo: any }> => {
    // For Word documents, try to use mammoth to extract text and render it
    if (category === 'document') {
      try {
        // Dynamically import mammoth
        const mammoth = await import('mammoth')
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        const text = result.value

        if (text && text.trim().length > 0) {
          // Create canvas with document text
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            throw new Error('Cannot get canvas context')
          }

          const baseWidth = Math.max(600, dimensions.width)
          const baseHeight = Math.max(700, dimensions.height)

          canvas.width = baseWidth
          canvas.height = baseHeight

          // White background like a document
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, baseWidth, baseHeight)

          // Document border
          ctx.strokeStyle = '#e5e7eb'
          ctx.lineWidth = 2
          ctx.strokeRect(0, 0, baseWidth, baseHeight)

          // Header bar
          ctx.fillStyle = '#2b579a'
          ctx.fillRect(0, 0, baseWidth, 40)
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 14px Arial'
          ctx.textAlign = 'left'
          ctx.fillText('📄 ' + file.name, 15, 25)

          // Document content
          ctx.fillStyle = '#1f2937'
          ctx.font = '13px Georgia, serif'
          ctx.textAlign = 'left'

          const lines = text.split('\n')
          const maxLines = Math.floor((baseHeight - 80) / 18)
          const displayLines = lines.slice(0, maxLines)
          const maxCharsPerLine = Math.floor((baseWidth - 60) / 7.5)

          let yPos = 70
          displayLines.forEach((line) => {
            const trimmedLine = line.trim()
            if (trimmedLine.length > 0) {
              // Word wrap long lines
              if (trimmedLine.length > maxCharsPerLine) {
                const wrapped = trimmedLine.substring(0, maxCharsPerLine - 3) + '...'
                ctx.fillText(wrapped, 30, yPos)
              } else {
                ctx.fillText(trimmedLine, 30, yPos)
              }
            } else {
              // Empty line - add small space
              yPos += 9
            }
            yPos += 18
          })

          // Footer with stats
          ctx.fillStyle = '#6b7280'
          ctx.font = '11px Arial'
          ctx.textAlign = 'center'
          const totalChars = text.length
          const totalWords = text.split(/\s+/).filter(w => w.length > 0).length
          ctx.fillText(`${lines.length} lines • ${totalWords} words • ${totalChars} characters • ${(file.size / 1024).toFixed(1)} KB`, baseWidth / 2, baseHeight - 15)

          // Truncation indicator
          if (lines.length > maxLines) {
            ctx.fillStyle = '#f59e0b'
            ctx.font = 'italic 11px Arial'
            ctx.fillText(`... and ${lines.length - maxLines} more lines`, baseWidth / 2, baseHeight - 35)
          }

          return {
            dataURL: canvas.toDataURL('image/png'),
            additionalInfo: {
              category,
              fileSize: file.size,
              lines: lines.length,
              words: totalWords,
              characters: totalChars,
              extracted: true
            }
          }
        }
      } catch (error) {
        console.warn('Failed to extract Word document content with mammoth:', error)
        // Fall through to generic preview
      }
    }

    // Fallback: Generic preview for Office files (used when mammoth fails or for other office types)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Cannot get canvas context')
    }

    const baseWidth = Math.max(400, dimensions.width)
    const baseHeight = Math.max(500, dimensions.height)

    canvas.width = baseWidth
    canvas.height = baseHeight

    // Office-specific styling
    const officeStyles: Record<string, any> = {
      document: {
        bg: '#2b579a',
        accent: '#ffffff',
        icon: '📝',
        name: 'Word Document',
        features: ['Rich Text', 'Tables', 'Images']
      },
      spreadsheet: {
        bg: '#217346',
        accent: '#ffffff',
        icon: '📊',
        name: 'Excel Spreadsheet',
        features: ['Formulas', 'Charts', 'Data Analysis']
      },
      presentation: {
        bg: '#d24726',
        accent: '#ffffff',
        icon: '📽️',
        name: 'PowerPoint Presentation',
        features: ['Slides', 'Animations', 'Media']
      }
    }

    const style = officeStyles[category] || officeStyles.document

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, baseHeight)
    gradient.addColorStop(0, style.bg)
    gradient.addColorStop(1, '#000000')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, baseWidth, baseHeight)

    // Office-style header
    ctx.fillStyle = style.accent
    ctx.fillRect(0, 0, baseWidth, 60)
    ctx.fillStyle = style.bg
    ctx.font = 'bold 18px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(style.name, 20, 35)

    // Large icon
    ctx.font = 'bold 80px Arial'
    ctx.textAlign = 'center'
    ctx.fillStyle = style.accent
    ctx.fillText(style.icon, baseWidth / 2, 180)

    // File info
    ctx.font = 'bold 20px Arial'
    ctx.fillText(file.name, baseWidth / 2, 240)

    ctx.font = '16px Arial'
    ctx.fillText(`${(file.size / (1024 * 1024)).toFixed(1)} MB`, baseWidth / 2, 270)

    // Features
    ctx.font = '14px Arial'
    ctx.fillStyle = '#e0e0e0'
    style.features.forEach((feature: string, index: number) => {
      ctx.fillText(`✓ ${feature}`, baseWidth / 2, 320 + (index * 25))
    })

    // Preview notice
    ctx.font = 'italic 12px Arial'
    ctx.fillStyle = '#cccccc'
    ctx.fillText('Download to view full document', baseWidth / 2, baseHeight - 30)

    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: {
        category,
        fileSize: file.size,
        features: style.features
      }
    }
  }, [dimensions.width, dimensions.height])

  // Video file preview
  const generateVideoPreview = useCallback(async (file: File): Promise<{ dataURL: string; additionalInfo: any }> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Cannot get canvas context')
    }

    const baseWidth = Math.max(400, dimensions.width)
    const baseHeight = Math.max(300, dimensions.height)

    canvas.width = baseWidth
    canvas.height = baseHeight

    // Video player-like background
    const gradient = ctx.createLinearGradient(0, 0, 0, baseHeight)
    gradient.addColorStop(0, '#1f2937')
    gradient.addColorStop(1, '#111827')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, baseWidth, baseHeight)

    // Play button circle
    const centerX = baseWidth / 2
    const centerY = baseHeight / 2
    const radius = 40

    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.fill()

    // Play triangle
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(centerX - 15, centerY - 20)
    ctx.lineTo(centerX - 15, centerY + 20)
    ctx.lineTo(centerX + 20, centerY)
    ctx.closePath()
    ctx.fill()

    // Video info
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 16px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('🎬 Video File', centerX, centerY - 80)

    ctx.font = '14px Arial'
    ctx.fillText(file.name, centerX, centerY + 80)

    const duration = 'Unknown duration' // Would need video metadata
    ctx.font = '12px Arial'
    ctx.fillStyle = '#d1d5db'
    ctx.fillText(`${(file.size / (1024 * 1024)).toFixed(1)} MB • ${duration}`, centerX, centerY + 100)

    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: { fileSize: file.size }
    }
  }, [dimensions.width, dimensions.height])

  // Audio file preview
  const generateAudioPreview = useCallback(async (file: File): Promise<{ dataURL: string; additionalInfo: any }> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Cannot get canvas context')
    }

    const baseWidth = Math.max(400, dimensions.width)
    const baseHeight = Math.max(300, dimensions.height)

    canvas.width = baseWidth
    canvas.height = baseHeight

    // Audio player background
    const gradient = ctx.createLinearGradient(0, 0, 0, baseHeight)
    gradient.addColorStop(0, '#7c3aed')
    gradient.addColorStop(1, '#5b21b6')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, baseWidth, baseHeight)

    // Waveform visualization (decorative)
    ctx.strokeStyle = '#e0e7ff'
    ctx.lineWidth = 3
    const centerY = baseHeight / 2
    const waveWidth = baseWidth - 40
    const waveStart = 20

    for (let i = 0; i < 20; i++) {
      const x = waveStart + (i * (waveWidth / 20))
      const height = Math.random() * 40 + 10
      ctx.beginPath()
      ctx.moveTo(x, centerY - height / 2)
      ctx.lineTo(x, centerY + height / 2)
      ctx.stroke()
    }

    // Audio icon
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('🎵', baseWidth / 2, centerY - 60)

    // Audio info
    ctx.font = 'bold 16px Arial'
    ctx.fillText('Audio File', baseWidth / 2, centerY + 20)

    ctx.font = '14px Arial'
    ctx.fillText(file.name, baseWidth / 2, centerY + 45)

    ctx.font = '12px Arial'
    ctx.fillStyle = '#e0e7ff'
    ctx.fillText(`${(file.size / (1024 * 1024)).toFixed(1)} MB`, baseWidth / 2, centerY + 65)

    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: { fileSize: file.size }
    }
  }, [dimensions.width, dimensions.height])

  // Archive file preview
  const generateArchivePreview = useCallback(async (file: File): Promise<{ dataURL: string; additionalInfo: any }> => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Cannot get canvas context')
    }

    const baseWidth = Math.max(400, dimensions.width)
    const baseHeight = Math.max(400, dimensions.height)

    canvas.width = baseWidth
    canvas.height = baseHeight

    // Archive background
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, baseWidth, baseHeight)

    // Border
    ctx.strokeStyle = '#d1d5db'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, baseWidth, baseHeight)

    // Archive icon stack effect
    const boxSize = 120
    const centerX = baseWidth / 2
    const centerY = baseHeight / 2

    // Back boxes
    ctx.fillStyle = '#9ca3af'
    ctx.fillRect(centerX - boxSize/2 + 8, centerY - boxSize/2 + 8, boxSize, boxSize)
    ctx.fillStyle = '#6b7280'
    ctx.fillRect(centerX - boxSize/2 + 4, centerY - boxSize/2 + 4, boxSize, boxSize)

    // Front box
    ctx.fillStyle = '#374151'
    ctx.fillRect(centerX - boxSize/2, centerY - boxSize/2, boxSize, boxSize)

    // Archive icon
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 40px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('📦', centerX, centerY + 10)

    // Archive info
    ctx.fillStyle = '#1f2937'
    ctx.font = 'bold 18px Arial'
    ctx.fillText('Archive File', centerX, centerY + 80)

    const extension = file.name.split('.').pop()?.toUpperCase() || 'ARCHIVE'
    ctx.font = 'bold 16px Arial'
    ctx.fillStyle = '#ef4444'
    ctx.fillText(extension, centerX, centerY + 105)

    ctx.font = '14px Arial'
    ctx.fillStyle = '#4b5563'
    ctx.fillText(file.name, centerX, centerY + 130)

    ctx.font = '12px Arial'
    ctx.fillText(`${(file.size / (1024 * 1024)).toFixed(1)} MB compressed`, centerX, centerY + 150)

    return {
      dataURL: canvas.toDataURL('image/png'),
      additionalInfo: {
        fileSize: file.size,
        format: extension
      }
    }
  }, [dimensions.width, dimensions.height])

  // Generate preview based on file type
  const generatePreview = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const category = getFileTypeCategory(fileName)
      let result: { dataURL: string; additionalInfo: any }

      switch (category) {
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
        case 'pdf':
          result = await generatePDFPreview(file)
          break
        case 'document':
        case 'spreadsheet':
        case 'presentation':
          result = await generateOfficePreview(file, category)
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
        case 'font':
        case 'executable':
        case 'cad':
        case 'ebook':
          result = await generateGenericPreview(file, category)
          break
        default:
          // For unsupported types, generate generic preview
          result = await generateGenericPreview(file, 'unknown')
      }

      setPreview(result.dataURL)
      setLoading(false)
    } catch (error) {
      console.warn('Canvas preview generation failed, showing fallback:', error)
      setError('Preview generation failed')
      setLoading(false)
    }
  }, [fileName, file, getFileTypeCategory, generateImagePreview, generateTextPreview, generateCSVPreview, generatePDFPreview, generateOfficePreview, generateVideoPreview, generateAudioPreview, generateArchivePreview, generateGenericPreview])

  // Regenerate preview when dimensions change or file changes
  useEffect(() => {
    // Add a small delay to ensure dimensions are properly set
    const timeoutId = setTimeout(() => {
      if (dimensions.width > 0 && dimensions.height > 0) {
        generatePreview()
      }
    }, 100)

    return () => clearTimeout(timeoutId)
    // Only trigger when actual dimension values change, not object reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height])

  if (loading) {
    return (
      <div ref={containerRef} className={`w-full h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <div className="text-xs text-gray-500">Loading preview...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div ref={containerRef} className={`w-full h-full flex items-center justify-center text-gray-500 ${className}`}>
        <div className="text-center">
          <div className="text-xs">Preview not available</div>
          <div className="text-xs mt-1">{fileName}</div>
        </div>
      </div>
    )
  }

  if (!preview) {
    return (
      <div ref={containerRef} className={`w-full h-full flex items-center justify-center text-gray-500 ${className}`}>
        <div className="text-center text-xs">
          No preview available
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <img
        src={preview}
        alt={`Preview of ${fileName}`}
        className="w-full h-full object-cover"
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      />
    </div>
  )
}
