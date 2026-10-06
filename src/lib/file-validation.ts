/**
 * Enhanced file validation with extension-based fallback
 * This works around MIME type detection issues by validating file extensions
 */

import { ALLOWED_FILE_TYPES } from './constants'

// File extension to MIME type mapping for video files
const VIDEO_EXTENSION_MAP: Record<string, string> = {
  'mp4': 'video/mp4',
  'mov': 'video/quicktime',
  'avi': 'video/x-msvideo',
  'wmv': 'video/x-ms-wmv',
  'webm': 'video/webm',
  'flv': 'video/x-flv',
  'mkv': 'video/x-matroska',
  'mpeg': 'video/mpeg',
  'mpg': 'video/mpeg',
  'm4v': 'video/mp4'
}

// Document extension to MIME type mapping
const DOCUMENT_EXTENSION_MAP: Record<string, string> = {
  'pdf': 'application/pdf',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'doc': 'application/msword',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'xls': 'application/vnd.ms-excel',
  'csv': 'text/csv',
  'txt': 'text/plain'
}

// Image extension to MIME type mapping
const IMAGE_EXTENSION_MAP: Record<string, string> = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
  'svg': 'image/svg+xml'
}

// Audio extension to MIME type mapping
const AUDIO_EXTENSION_MAP: Record<string, string> = {
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'aac': 'audio/aac',
  'm4a': 'audio/mp4',
  'flac': 'audio/flac',
  'wma': 'audio/x-ms-wma'
}

// Archive extension to MIME type mapping
const ARCHIVE_EXTENSION_MAP: Record<string, string> = {
  'zip': 'application/zip',
  'rar': 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  'tar': 'application/x-tar',
  'gz': 'application/gzip'
}

// Code file extension to MIME type mapping
const CODE_EXTENSION_MAP: Record<string, string> = {
  'js': 'text/javascript',
  'ts': 'text/typescript',
  'jsx': 'text/jsx',
  'tsx': 'text/tsx',
  'html': 'text/html',
  'css': 'text/css',
  'json': 'application/json',
  'xml': 'application/xml',
  'md': 'text/markdown',
  'py': 'text/x-python',
  'java': 'text/x-java',
  'cpp': 'text/x-c++src',
  'c': 'text/x-csrc',
  'php': 'text/x-php'
}

const ALL_EXTENSION_MAP = {
  ...VIDEO_EXTENSION_MAP,
  ...DOCUMENT_EXTENSION_MAP,
  ...IMAGE_EXTENSION_MAP,
  ...AUDIO_EXTENSION_MAP,
  ...ARCHIVE_EXTENSION_MAP,
  ...CODE_EXTENSION_MAP
}

export interface FileValidationResult {
  isValid: boolean
  detectedMimeType: string
  correctedMimeType?: string
  fileExtension: string
  fileName: string
  fileSize: number
  validationMethod: 'mime-type' | 'extension-fallback'
  error?: string
}

/**
 * Enhanced file validation that uses extension fallback when MIME type fails
 */
export function validateFile(file: File, maxSizeBytes: number = 50 * 1024 * 1024): FileValidationResult {
  const fileName = file.name
  const fileSize = file.size
  const detectedMimeType = file.type

  // Extract file extension
  const extensionMatch = fileName.toLowerCase().match(/\.([^.]+)$/)
  const fileExtension = extensionMatch ? extensionMatch[1] : ''


  // Check file size first
  if (fileSize > maxSizeBytes) {
    return {
      isValid: false,
      detectedMimeType,
      fileExtension,
      fileName,
      fileSize,
      validationMethod: 'mime-type',
      error: `File too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB. Maximum allowed: ${(maxSizeBytes / 1024 / 1024).toFixed(0)}MB`
    }
  }

  // Method 1: Try MIME type validation first
  if (detectedMimeType && ALLOWED_FILE_TYPES.includes(detectedMimeType as any)) {
    return {
      isValid: true,
      detectedMimeType,
      fileExtension,
      fileName,
      fileSize,
      validationMethod: 'mime-type'
    }
  }

  // Method 2: Extension-based fallback validation
  if (fileExtension && fileExtension in ALL_EXTENSION_MAP) {
    const correctedMimeType = ALL_EXTENSION_MAP[fileExtension]

    // Check if the corrected MIME type is allowed
    if (ALLOWED_FILE_TYPES.includes(correctedMimeType as any)) {

      return {
        isValid: true,
        detectedMimeType,
        correctedMimeType,
        fileExtension,
        fileName,
        fileSize,
        validationMethod: 'extension-fallback'
      }
    }
  }

  // Method 3: Special case for video files with empty/unknown MIME types
  if (!detectedMimeType || detectedMimeType === '') {
    if (fileExtension && fileExtension in VIDEO_EXTENSION_MAP) {
      const correctedMimeType = VIDEO_EXTENSION_MAP[fileExtension]

      return {
        isValid: true,
        detectedMimeType: '',
        correctedMimeType,
        fileExtension,
        fileName,
        fileSize,
        validationMethod: 'extension-fallback'
      }
    }
  }

  // Validation failed

  return {
    isValid: false,
    detectedMimeType,
    fileExtension,
    fileName,
    fileSize,
    validationMethod: 'mime-type',
    error: `Unsupported file type. Detected: "${detectedMimeType}", Extension: ".${fileExtension}". Supported formats: ${Object.keys(ALL_EXTENSION_MAP).map(ext => `.${ext}`).join(', ')}`
  }
}

/**
 * Get the effective MIME type for a file (uses corrected type if available)
 */
export function getEffectiveMimeType(validationResult: FileValidationResult): string {
  return validationResult.correctedMimeType || validationResult.detectedMimeType
}

/**
 * Check if a file is a video based on extension or MIME type
 */
export function isVideoFile(file: File): boolean {
  const extension = file.name.toLowerCase().match(/\.([^.]+)$/)?.[1]
  return (
    file.type.startsWith('video/') ||
    (!!extension && extension in VIDEO_EXTENSION_MAP)
  )
}

/**
 * Create a new File object with corrected MIME type
 * This is useful for fixing browser MIME type detection issues
 */
export function createCorrectedFile(file: File, correctedMimeType: string): File {
  try {
    return new File([file], file.name, {
      type: correctedMimeType,
      lastModified: file.lastModified
    })
  } catch (error) {
    console.warn('Could not create corrected file, using original:', error)
    return file
  }
}
