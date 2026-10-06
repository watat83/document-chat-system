import { z } from 'zod'

/**
 * Supported file types for text extraction
 */
export const SupportedFileType = z.enum([
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',

  // Documents
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json',
  'application/xml',
  'text/xml',

  // Presentations
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt

  // Videos
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo', // .avi
  'video/webm',
  'video/ogg',
  'video/3gpp',
  'video/x-ms-wmv',

  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/mp3',
  'audio/ogg',
  'audio/webm',
  'audio/m4a',
  'audio/aac',

  // Archives (for content extraction)
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
])

export type SupportedFileType = z.infer<typeof SupportedFileType>

/**
 * File processing options
 */
export const FileProcessingOptions = z.object({
  /**
   * Maximum file size in bytes (default: 50MB)
   */
  maxFileSize: z
    .number()
    .min(1)
    .max(500 * 1024 * 1024)
    .default(50 * 1024 * 1024)
    .describe('Maximum file size in bytes. Default: 50MB'),

  /**
   * OCR language for image text extraction (default: 'eng')
   */
  ocrLanguage: z
    .string()
    .default('eng')
    .describe("OCR language code for image text extraction. Default: 'eng'"),

  /**
   * Whether to extract metadata (default: true)
   */
  extractMetadata: z
    .boolean()
    .default(true)
    .describe('Whether to extract file metadata. Default: true'),

  /**
   * Whether to preserve formatting (default: false)
   */
  preserveFormatting: z
    .boolean()
    .default(false)
    .describe('Whether to preserve text formatting. Default: false'),

  /**
   * Maximum text length to extract (default: 100MB - no practical limit)
   */
  maxTextLength: z
    .number()
    .min(1)
    .max(200 * 1024 * 1024)
    .default(100 * 1024 * 1024)
    .describe(
      'Maximum text length to extract in characters. Default: 100MB - no practical truncation limit'
    ),

  /**
   * Timeout for processing in milliseconds (default: 30s)
   */
  timeout: z
    .number()
    .min(1000)
    .max(300000)
    .default(30000)
    .describe('Processing timeout in milliseconds. Default: 30s'),

  /**
   * Whether to process embedded files in archives (default: false)
   */
  processEmbeddedFiles: z
    .boolean()
    .default(false)
    .describe('Whether to process files within archives. Default: false'),
})

export type FileProcessingOptions = z.infer<typeof FileProcessingOptions>

/**
 * File processing result
 */
export const FileProcessingResult = z.object({
  /**
   * Success flag
   */
  success: z.boolean().describe('Whether the processing was successful'),

  /**
   * Extracted text content
   */
  text: z.string().describe('Extracted text content from the file'),

  /**
   * File metadata
   */
  metadata: z
    .object({
      /**
       * File size in bytes
       */
      size: z.number().describe('File size in bytes'),

      /**
       * MIME type
       */
      mimeType: z.string().describe('MIME type of the file'),

      /**
       * File name
       */
      filename: z.string().optional().describe('Original filename'),
      source: z.string().optional(),
      docling: z.object({ sections: z.array(z.unknown()), tables: z.array(z.unknown()), images: z.array(z.unknown()), processingTime: z.number().optional() }).optional(),

      /**
       * Creation date
       */
      created: z.date().optional().describe('File creation date'),

      /**
       * Last modified date
       */
      modified: z.date().optional().describe('File last modified date'),

      /**
       * Processor name
       */
      processor: z.string().optional().describe('Name of the processor used'),

      /**
       * Document-specific metadata
       */
      document: z
        .object({
          title: z.string().optional().describe('Document title'),
          author: z.string().optional().describe('Document author'),
          subject: z.string().optional().describe('Document subject'),
          keywords: z.string().optional().describe('Document keywords'),
          pages: z.number().optional().describe('Number of pages'),
          words: z.number().optional().describe('Estimated word count'),
          characters: z.number().optional().describe('Character count'),
        })
        .optional()
        .describe('Document-specific metadata'),

      /**
       * Image-specific metadata
       */
      image: z
        .object({
          width: z.number().optional().describe('Image width in pixels'),
          height: z.number().optional().describe('Image height in pixels'),
          colorSpace: z
            .string()
            .optional()
            .describe('Color space (RGB, CMYK, etc.)'),
          hasAlpha: z
            .boolean()
            .optional()
            .describe('Whether image has alpha channel'),
          dpi: z.number().optional().describe('Image resolution in DPI'),
          exif: z.record(z.any()).optional().describe('EXIF metadata'),
        })
        .optional()
        .describe('Image-specific metadata'),

      /**
       * Video-specific metadata
       */
      video: z
        .object({
          duration: z.number().optional().describe('Video duration in seconds'),
          width: z.number().optional().describe('Video width in pixels'),
          height: z.number().optional().describe('Video height in pixels'),
          frameRate: z.number().optional().describe('Video frame rate (fps)'),
          bitrate: z.number().optional().describe('Video bitrate in bps'),
          codec: z.string().optional().describe('Video codec'),
          hasAudio: z
            .boolean()
            .optional()
            .describe('Whether video has audio track'),
          audioCodec: z.string().optional().describe('Audio codec'),
        })
        .optional()
        .describe('Video-specific metadata'),

      /**
       * Audio-specific metadata
       */
      audio: z
        .object({
          duration: z.number().optional().describe('Audio duration in seconds'),
          bitrate: z.number().optional().describe('Audio bitrate in bps'),
          sampleRate: z.number().optional().describe('Audio sample rate in Hz'),
          channels: z.number().optional().describe('Number of audio channels'),
          codec: z.string().optional().describe('Audio codec'),
        })
        .optional()
        .describe('Audio-specific metadata'),
    })
    .describe('File metadata'),

  /**
   * Processing statistics
   */
  processing: z
    .object({
      /**
       * Processing time in milliseconds
       */
      duration: z.number().describe('Processing time in milliseconds'),

      /**
       * Method used for extraction
       */
      method: z.string().describe('Method used for text extraction'),

      /**
       * Confidence score (0-1)
       */
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Confidence score for extraction quality'),

      /**
       * Any warnings during processing
       */
      warnings: z.array(z.string()).optional().describe('Processing warnings'),
    })
    .describe('Processing statistics'),

  /**
   * Error information if processing failed
   */
  error: z
    .object({
      /**
       * Error code
       */
      code: z.string().describe('Error code'),

      /**
       * Error message
       */
      message: z.string().describe('Human-readable error message'),

      /**
       * Stack trace (for debugging)
       */
      stack: z.string().optional().describe('Error stack trace'),
    })
    .optional()
    .describe('Error information'),
})

export type FileProcessingResult = z.infer<typeof FileProcessingResult>

/**
 * File processor interface
 */
export interface IFileProcessor {
  /**
   * Check if the processor can handle the given file type
   */
  canProcess(mimeType: string): boolean

  /**
   * Extract text from the file
   */
  extractText(
    buffer: Buffer,
    options: FileProcessingOptions
  ): Promise<FileProcessingResult>

  /**
   * Get processor name
   */
  getName(): string

  /**
   * Get supported MIME types
   */
  getSupportedTypes(): string[]
}

/**
 * Processing method enumeration
 */
export enum ProcessingMethod {
  DIRECT_TEXT = 'direct_text',
  OCR = 'ocr',
  PARSER = 'parser',
  CONVERTER = 'converter',
  ARCHIVE_EXTRACTION = 'archive_extraction',
  METADATA_EXTRACTION = 'metadata_extraction',
}

/**
 * Processing priority levels
 */
export enum ProcessingPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * Cache configuration
 */
export const CacheConfig = z.object({
  /**
   * Whether to cache results
   */
  enabled: z
    .boolean()
    .default(true)
    .describe('Whether to cache processing results'),

  /**
   * Cache TTL in seconds
   */
  ttl: z
    .number()
    .min(60)
    .max(86400)
    .default(3600)
    .describe('Cache TTL in seconds. Default: 1 hour'),

  /**
   * Cache key prefix
   */
  keyPrefix: z.string().default('file_processing').describe('Cache key prefix'),
})

export type CacheConfig = z.infer<typeof CacheConfig>
