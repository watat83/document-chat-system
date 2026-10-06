import {
  IFileProcessor,
  FileProcessingOptions,
  FileProcessingResult,
  ProcessingMethod,
} from './types'
import { DoclingProcessor } from './processors/docling-processor'
import { PDFProcessor } from './processors/pdf-processor'
import { OfficeProcessor } from './processors/office-processor'
import { OCRProcessor } from './processors/ocr-processor'
import { TextProcessor } from './processors/text-processor'
import { ArchiveProcessor } from './processors/archive-processor'
import { MediaProcessor } from './processors/media-processor'

/**
 * Main file processing adapter that coordinates all processors
 *
 * Processing Priority:
 * 1. DoclingProcessor (if enabled) - Advanced document understanding
 * 2. Fallback processors - pdf-parse, mammoth, tesseract.js, etc.
 */
export class FileProcessingAdapter {
  private processors: IFileProcessor[] = []
  private doclingProcessor: DoclingProcessor | null = null
  private readonly defaultOptions: FileProcessingOptions = {
    maxFileSize: 100 * 1024 * 1024, // 100MB - increased for larger documents
    ocrLanguage: 'eng',
    extractMetadata: true,
    preserveFormatting: true, // Changed to TRUE to preserve document structure
    maxTextLength: 100 * 1024 * 1024, // 100MB - removed text truncation limit to preserve full content
    timeout: 120000, // 120 seconds - increased for processing larger files
    processEmbeddedFiles: false,
  }

  constructor() {
    this.initializeProcessors()
  }

  /**
   * Initialize all file processors
   * Docling is added first for priority, with fallback to existing processors
   */
  private initializeProcessors(): void {
    // Initialize Docling processor (primary for supported formats)
    this.doclingProcessor = new DoclingProcessor()

    // Initialize fallback processors (used if Docling fails or is unavailable)
    this.processors = [
      new PDFProcessor(),
      new OfficeProcessor(),
      new OCRProcessor(),
      new TextProcessor(),
      new ArchiveProcessor(),
      new MediaProcessor(),
    ]
  }

  /**
   * Get all supported file types
   */
  getSupportedTypes(): string[] {
    const supportedTypes = new Set<string>()

    this.processors.forEach((processor) => {
      processor.getSupportedTypes().forEach((type) => {
        supportedTypes.add(type)
      })
    })

    return Array.from(supportedTypes)
  }

  /**
   * Check if a file type is supported
   */
  isSupported(mimeType: string): boolean {
    return this.processors.some((processor) => processor.canProcess(mimeType))
  }

  /**
   * Process a file and extract text
   * Tries Docling first (if enabled), then falls back to traditional processors
   */
  async processFile(
    buffer: Buffer,
    mimeType: string,
    options: Partial<FileProcessingOptions> = {}
  ): Promise<FileProcessingResult> {
    const processingOptions = { ...this.defaultOptions, ...options }

    try {
      // Validate input
      if (!buffer || buffer.length === 0) {
        throw new Error('Empty or invalid file buffer')
      }

      // Try Docling first if it supports this file type
      if (this.doclingProcessor && this.doclingProcessor.canProcess(mimeType)) {
        console.log(`🚀 Attempting Docling processing for ${mimeType}`)
        const doclingResult = await this.doclingProcessor.extractText(buffer, processingOptions)

        if (doclingResult.success && doclingResult.text.trim().length > 0) {
          console.log(`✅ Docling processing succeeded (${doclingResult.text.length} chars)`)
          return doclingResult
        } else {
          console.warn(`⚠️ Docling processing failed, falling back to traditional processors`)
        }
      }

      // Fallback to traditional processors
      const processor = this.findProcessor(mimeType)
      if (!processor) {
        throw new Error(`Unsupported file type: ${mimeType}`)
      }

      console.log(`📄 Using fallback processor: ${processor.getName()}`)
      const result = await processor.extractText(buffer, processingOptions)

      // Add processor information to metadata
      if (result.metadata) {
        result.metadata.processor = processor.getName()
      }

      return result
    } catch (error) {
      return {
        success: false,
        text: '',
        metadata: {
          size: buffer.length,
          mimeType,
          processor: 'None',
        },
        processing: {
          duration: 0,
          method: ProcessingMethod.METADATA_EXTRACTION,
          confidence: 0,
        },
        error: {
          code: 'ADAPTER_ERROR',
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
          stack: error instanceof Error ? error.stack : undefined,
        },
      }
    }
  }

  /**
   * Process a file with fallback mechanisms
   */
  async processFileWithFallback(
    buffer: Buffer,
    mimeType: string,
    options: Partial<FileProcessingOptions> = {}
  ): Promise<FileProcessingResult> {
    const processingOptions = { ...this.defaultOptions, ...options }

    // Prefer recognizable signatures to a generic or incorrect upload MIME type.
    const detectedMimeType = this.detectMimeType(buffer);
    const effectiveMimeType = detectedMimeType || mimeType;
    const result = await this.processFile(buffer, effectiveMimeType, processingOptions);
    if (result.success || detectedMimeType) return result;

    // Try with all compatible processors as fallback
    for (const processor of this.processors) {
      if (
        processor.canProcess(mimeType) ||
        processor.canProcess(detectedMimeType || '')
      ) {
        continue // Skip already tried processors
      }

      try {
        const fallbackResult = await processor.extractText(
          buffer,
          processingOptions
        )
        if (fallbackResult.success && fallbackResult.text.trim().length > 0) {
          fallbackResult.processing.warnings = [
            ...(fallbackResult.processing.warnings || []),
            'Used fallback processor',
          ]
          return fallbackResult
        }
      } catch {
        // Continue to next processor
        continue
      }
    }

    // If all else fails, return the original error
    return result
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    supportedTypes: number
    processors: Array<{ name: string; supportedTypes: string[] }>
  } {
    return {
      supportedTypes: this.getSupportedTypes().length,
      processors: this.processors.map((processor) => ({
        name: processor.getName(),
        supportedTypes: processor.getSupportedTypes(),
      })),
    }
  }

  /**
   * Find the appropriate processor for a MIME type
   */
  private findProcessor(mimeType: string): IFileProcessor | null {
    return (
      this.processors.find((processor) => processor.canProcess(mimeType)) ||
      null
    )
  }

  /**
   * Detect MIME type from buffer content
   */
  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 4) {
      return null
    }

    const header = buffer.subarray(0, 12)

    // PDF
    if (buffer.toString('ascii', 0, 4) === '%PDF') {
      return 'application/pdf'
    }

    // ZIP-based formats
    if (header[0] === 0x50 && header[1] === 0x4b) {
      const bufferString = buffer.toString('ascii', 0, 1000)
      if (bufferString.includes('word/')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      } else if (bufferString.includes('xl/')) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
      return 'application/zip'
    }

    // Images
    if (header[0] === 0xff && header[1] === 0xd8) {
      return 'image/jpeg'
    }
    if (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) {
      return 'image/png'
    }
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
      return 'image/gif'
    }

    // Try to detect text-based formats
    try {
      const text = buffer.toString('utf-8', 0, Math.min(1000, buffer.length))

      // JSON
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          JSON.parse(text)
          return 'application/json'
        } catch {
          // Not valid JSON
        }
      }

      // XML/HTML
      if (text.trim().startsWith('<')) {
        if (
          text.toLowerCase().includes('<!doctype html') ||
          text.toLowerCase().includes('<html')
        ) {
          return 'text/html'
        }
        return 'application/xml'
      }

      // Check if it's mostly text
      const nonPrintableChars = text.replace(/[\x20-\x7E\s]/g, '').length
      if (nonPrintableChars / text.length < 0.1) {
        return 'text/plain'
      }
    } catch {
      // Not text-based
    }

    return null
  }
}
