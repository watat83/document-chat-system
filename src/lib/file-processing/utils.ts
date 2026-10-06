import { SupportedFileType } from './types';

/**
 * Utility functions for file processing
 */

/**
 * Map file extensions to MIME types
 */
const EXTENSION_TO_MIME_MAP: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',

  // Documents
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.json': 'application/json',
  '.xml': 'application/xml',

  // Presentations
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',

  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
};

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(filename: string): string | null {
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return EXTENSION_TO_MIME_MAP[extension] || null;
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string | null {
  for (const [ext, mime] of Object.entries(EXTENSION_TO_MIME_MAP)) {
    if (mime === mimeType) {
      return ext;
    }
  }
  return null;
}

/**
 * Check if a file type is supported
 */
export function isSupportedFileType(mimeType: string): boolean {
  try {
    SupportedFileType.parse(mimeType);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate file buffer
 */
export function validateFileBuffer(buffer: Buffer): { valid: boolean; error?: string } {
  if (!buffer) {
    return { valid: false, error: 'Buffer is null or undefined' };
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'Buffer is empty' };
  }

  if (buffer.length > 500 * 1024 * 1024) { // 500MB absolute limit
    return { valid: false, error: 'File too large (exceeds 500MB)' };
  }

  return { valid: true };
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace non-alphanumeric characters
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .substring(0, 255); // Limit length
}

/**
 * Get file category from MIME type
 */
export function getFileCategory(mimeType: string): 'image' | 'document' | 'text' | 'archive' | 'other' {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.includes('pdf') ||
      mimeType.includes('word') ||
      mimeType.includes('excel') ||
      mimeType.includes('powerpoint') ||
      mimeType.includes('officedocument')) {
    return 'document';
  }

  if (mimeType.startsWith('text/') ||
      mimeType.includes('json') ||
      mimeType.includes('xml')) {
    return 'text';
  }

  if (mimeType.includes('zip') ||
      mimeType.includes('rar') ||
      mimeType.includes('7z') ||
      mimeType.includes('tar') ||
      mimeType.includes('gzip')) {
    return 'archive';
  }

  return 'other';
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Calculate text processing confidence based on various factors
 */
export function calculateProcessingConfidence(
  text: string,
  method: string,
  fileSize: number,
  processingTime: number
): number {
  let confidence = 0.5; // Base confidence

  // Adjust based on processing method
  switch (method) {
    case 'direct_text':
      confidence = 1.0;
      break;
    case 'parser':
      confidence = 0.95;
      break;
    case 'converter':
      confidence = 0.9;
      break;
    case 'ocr':
      confidence = 0.7;
      break;
    case 'archive_extraction':
      confidence = 0.8;
      break;
    default:
      confidence = 0.5;
  }

  // Adjust based on text quality
  if (text.length === 0) {
    confidence = 0;
  } else if (text.length < 10) {
    confidence *= 0.3;
  } else if (text.length < 100) {
    confidence *= 0.7;
  }

  // Adjust based on processing time (longer time might indicate issues)
  if (processingTime > 30000) { // 30 seconds
    confidence *= 0.8;
  } else if (processingTime > 60000) { // 1 minute
    confidence *= 0.6;
  }

  // Adjust based on file size
  if (fileSize > 50 * 1024 * 1024) { // 50MB
    confidence *= 0.9;
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Clean extracted text
 */
export function cleanExtractedText(text: string, preserveFormatting: boolean = false): string {
  if (!text) return '';

  let cleaned = text;

  if (!preserveFormatting) {
    // Remove excessive whitespace
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\r/g, '')
      .trim();
  }

  // Remove null characters and other control characters
  cleaned = cleaned.replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '');

  return cleaned;
}

/**
 * Extract metadata from file buffer
 */
export function extractBasicMetadata(buffer: Buffer, filename?: string): {
  size: number;
  filename?: string;
  mimeType?: string;
  created?: Date;
  modified?: Date;
} {
  const metadata = {
    size: buffer.length,
    filename: filename ? sanitizeFilename(filename) : undefined,
    mimeType: filename ? getMimeTypeFromExtension(filename) ?? undefined : undefined,
  };

  // Note: File creation/modification dates are not available from buffer alone
  // These would need to be provided by the caller from file system stats

  return metadata;
}

/**
 * Check if text appears to be valid (not garbled or corrupted)
 */
export function isValidText(text: string): boolean {
  if (!text || text.length === 0) {
    return false;
  }

  // Check for reasonable character distribution
  const printableChars = text.replace(/[^\x20-\x7E\s]/g, '');
  const printableRatio = printableChars.length / text.length;

  if (printableRatio < 0.7) {
    return false;
  }

  // Check for reasonable word-like content
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const averageWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

  if (averageWordLength < 2 || averageWordLength > 20) {
    return false;
  }

  return true;
}
