import {
  IFileProcessor,
  FileProcessingOptions,
  FileProcessingResult,
} from '../types'

/**
 * Docling Processor - Advanced document processing using IBM Docling
 *
 * This processor calls an external Python microservice running Docling for
 * superior document understanding, table extraction, and structure preservation.
 *
 * Features:
 * - Advanced PDF layout analysis
 * - Table structure extraction
 * - Formula recognition
 * - OCR for scanned documents
 * - Structure preservation (headings, lists, etc.)
 * - Better than pdf-parse, mammoth, and tesseract.js combined
 */
export class DoclingProcessor implements IFileProcessor {
  private serviceUrl: string
  private enabled: boolean
  private timeout: number

  constructor() {
    // Always use the full URL from environment variable
    // For production: Set to your Vercel domain + /api/docling or Railway URL
    // For development: Use localhost
    this.serviceUrl = process.env.DOCLING_SERVICE_URL || 'http://localhost:8001'

    this.enabled = process.env.DOCLING_ENABLED !== 'false'
    this.timeout = parseInt(process.env.DOCLING_TIMEOUT || '30000', 10)
  }

  getName(): string {
    return 'DoclingProcessor'
  }

  getSupportedTypes(): string[] {
    return [
      // Documents
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/msword', // DOC
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
      'application/vnd.ms-powerpoint', // PPT
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
      'application/vnd.ms-excel', // XLS
      // Images (with OCR)
      'image/png',
      'image/jpeg',
      'image/tiff',
      'image/bmp',
      // Text/Web
      'text/html',
      'application/xhtml+xml',
    ]
  }

  canProcess(mimeType: string): boolean {
    return this.enabled && this.getSupportedTypes().includes(mimeType)
  }

  /**
   * Check if Docling service is available
   */
  async isServiceAvailable(): Promise<boolean> {
    if (!this.enabled) {
      return false
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second health check timeout

      const response = await fetch(`${this.serviceUrl}/health`, {
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      console.warn('⚠️ Docling service unavailable:', error instanceof Error ? error.message : 'Unknown error')
      return false
    }
  }

  async extractText(
    buffer: Buffer,
    options: FileProcessingOptions
  ): Promise<FileProcessingResult> {
    const startTime = Date.now()

    try {
      // Check if service is available
      const isAvailable = await this.isServiceAvailable()
      if (!isAvailable) {
        throw new Error('Docling service is not available')
      }

      // Create multipart form data manually using boundary
      const boundary = '----DoclingFormBoundary' + Date.now()
      const formData: Buffer[] = []

      // Add file field
      formData.push(Buffer.from(`--${boundary}\r\n`))
      formData.push(Buffer.from('Content-Disposition: form-data; name="file"; filename="document.pdf"\r\n'))
      formData.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'))
      formData.push(buffer)
      formData.push(Buffer.from('\r\n'))

      // Add other form fields
      const fields = {
        export_format: 'markdown',
        ocr_enabled: String(options.ocrLanguage !== 'none'),
        extract_tables: 'true',
        extract_images: String(options.extractMetadata || false),
        preserve_layout: String(options.preserveFormatting || true)
      }

      for (const [key, value] of Object.entries(fields)) {
        formData.push(Buffer.from(`--${boundary}\r\n`))
        formData.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`))
        formData.push(Buffer.from(`${value}\r\n`))
      }

      formData.push(Buffer.from(`--${boundary}--\r\n`))

      const body = Buffer.concat(formData)

      // Call Docling service
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(`${this.serviceUrl}/process`, {
        method: 'POST',
        headers: {
          ...(process.env.DOCLING_API_TOKEN ? { Authorization: `Bearer ${process.env.DOCLING_API_TOKEN}` } : {}),
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length)
        },
        body: body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Docling service returned ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Processing failed')
      }

      const duration = Date.now() - startTime

      return {
        success: true,
        text: result.content || '',
        metadata: {
          size: buffer.length,
          mimeType: result.metadata?.content_type || 'application/octet-stream',
          filename: result.metadata?.filename,
          processor: this.getName(),
          document: {
            pages: result.metadata?.num_pages,
            ...(result.metadata || {}),
          },
          // Store structured data for enhanced processing
          docling: {
            sections: result.sections || [],
            tables: result.tables || [],
            images: result.images || [],
            processingTime: result.processing_time_ms,
          },
        },
        processing: {
          duration,
          method: 'docling',
          confidence: 0.95, // Docling is highly reliable
          warnings: result.warnings || [],
        },
      }
    } catch (error) {
      const duration = Date.now() - startTime

      // Return error result that can trigger fallback
      return {
        success: false,
        text: '',
        metadata: {
          size: buffer.length,
          mimeType: 'application/octet-stream',
          processor: this.getName(),
        },
        processing: {
          duration,
          method: 'docling',
          confidence: 0,
        },
        error: {
          code: 'DOCLING_PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      }
    }
  }

  /**
   * Process document from URL (leverages Docling's native URL support)
   */
  async processUrl(url: string): Promise<FileProcessingResult> {
    const startTime = Date.now()

    try {
      const isAvailable = await this.isServiceAvailable()
      if (!isAvailable) {
        throw new Error('Docling service is not available')
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(`${this.serviceUrl}/process-url`, {
        method: 'POST',
        headers: {
          ...(process.env.DOCLING_API_TOKEN ? { Authorization: `Bearer ${process.env.DOCLING_API_TOKEN}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          export_format: 'markdown',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Docling service returned ${response.status}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'URL processing failed')
      }

      const duration = Date.now() - startTime

      return {
        success: true,
        text: result.content || '',
        metadata: {
          size: result.content?.length || 0,
          mimeType: 'application/pdf',
          processor: this.getName(),
          source: url,
        },
        processing: {
          duration,
          method: 'docling-url',
          confidence: 0.95,
        },
      }
    } catch (error) {
      const duration = Date.now() - startTime

      return {
        success: false,
        text: '',
        metadata: {
          size: 0,
          mimeType: 'application/pdf',
          processor: this.getName(),
        },
        processing: {
          duration,
          method: 'docling-url',
          confidence: 0,
        },
        error: {
          code: 'DOCLING_URL_PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }

  /**
   * Extract page images from PDF
   * Used for visual AI analysis and OCR fallback
   */
  async extractPageImages(
    buffer: Buffer,
    maxPages: number = 10,
    dpi: number = 150
  ): Promise<Array<{ page: number; base64: string; width: number; height: number }>> {
    try {
      const isAvailable = await this.isServiceAvailable()
      if (!isAvailable) {
        return []
      }

      // Create multipart form data
      const boundary = '----DoclingImageBoundary' + Date.now()
      const formData: Buffer[] = []

      // Add file field
      formData.push(Buffer.from(`--${boundary}\r\n`))
      formData.push(Buffer.from('Content-Disposition: form-data; name="file"; filename="document.pdf"\r\n'))
      formData.push(Buffer.from('Content-Type: application/pdf\r\n\r\n'))
      formData.push(buffer)
      formData.push(Buffer.from('\r\n'))

      // Add form fields
      const fields = {
        max_pages: String(maxPages),
        dpi: String(dpi)
      }

      for (const [key, value] of Object.entries(fields)) {
        formData.push(Buffer.from(`--${boundary}\r\n`))
        formData.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`))
        formData.push(Buffer.from(`${value}\r\n`))
      }

      formData.push(Buffer.from(`--${boundary}--\r\n`))
      const body = Buffer.concat(formData)

      // Call Docling service
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(`${this.serviceUrl}/extract-page-images`, {
        method: 'POST',
        headers: {
          ...(process.env.DOCLING_API_TOKEN ? { Authorization: `Bearer ${process.env.DOCLING_API_TOKEN}` } : {}),
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        console.warn(`⚠️ Page image extraction failed: ${response.status}`)
        return []
      }

      const result = await response.json()

      if (!result.success || !result.images) {
        return []
      }

      return result.images.map((img: any) => ({
        page: img.page,
        base64: img.base64,
        width: img.width,
        height: img.height,
      }))
    } catch (error) {
      console.warn('⚠️ Page image extraction error:', error instanceof Error ? error.message : 'Unknown error')
      return []
    }
  }
}
