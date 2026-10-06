/**
 * Browser-compatible file processing adapter
 * Uses dynamic imports and client-side libraries only
 */

import { FileProcessingOptions, FileProcessingResult, ProcessingMethod } from './types';
import { BrowserBuffer } from './browser-utils';

// Define a browser-compatible buffer type
type BufferLike = BrowserBuffer | Uint8Array | ArrayBuffer;

export class BrowserFileProcessor {
  private static instance: BrowserFileProcessor;

  static getInstance(): BrowserFileProcessor {
    if (!BrowserFileProcessor.instance) {
      BrowserFileProcessor.instance = new BrowserFileProcessor();
    }
    return BrowserFileProcessor.instance;
  }

  /**
   * Get supported file types for browser processing
   */
  getSupportedTypes(): string[] {
    return [
      // Text formats (native browser support)
      'text/plain',
      'text/html',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/xml',
      'text/xml',

      // Images (for display, not OCR in browser)
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',

      // Videos (for metadata extraction)
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'video/ogg',
      'video/3gpp',
      'video/x-ms-wmv',

      // Audio (for metadata extraction)
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'audio/ogg',
      'audio/webm',
      'audio/m4a',
      'audio/aac',

      // PDF (using browser PDF.js if available)
      'application/pdf',

      // Office formats (limited support)
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
  }

  /**
   * Check if a file type is supported
   */
  isSupported(mimeType: string): boolean {
    return this.getSupportedTypes().includes(mimeType);
  }

  /**
   * Process a file in the browser
   */
  async processFile(
    buffer: BufferLike,
    mimeType: string,
    options: Partial<FileProcessingOptions> = {}
  ): Promise<FileProcessingResult> {
    const startTime = Date.now();
    const processingOptions = {
      maxFileSize: 50 * 1024 * 1024,
      maxTextLength: 500000,
      timeout: 30000,
      extractMetadata: true,
      ...options
    };

    try {
      // Normalize buffer to BrowserBuffer
      const browserBuffer = buffer instanceof BrowserBuffer ? buffer : new BrowserBuffer(buffer);

      // Validate input
      if (!browserBuffer || browserBuffer.length === 0) {
        throw new Error('Empty or invalid file buffer');
      }

      if (browserBuffer.length > processingOptions.maxFileSize!) {
        throw new Error(`File size ${browserBuffer.length} exceeds limit ${processingOptions.maxFileSize}`);
      }

      let text = '';
      let method = ProcessingMethod.DIRECT_TEXT;

      // Process based on MIME type
      if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') {
        // Direct text processing
        text = browserBuffer.toString('utf-8');
        method = ProcessingMethod.DIRECT_TEXT;
      } else if (mimeType === 'text/html') {
        // HTML processing - strip tags
        text = this.extractTextFromHTML(browserBuffer.toString('utf-8'));
        method = ProcessingMethod.PARSER;
      } else if (mimeType === 'application/pdf') {
        // PDF processing using browser-compatible method
        text = await this.processPDFInBrowser(browserBuffer);
        method = ProcessingMethod.PARSER;
      } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
        // Basic Excel/CSV processing
        text = await this.processSpreadsheetInBrowser(browserBuffer, mimeType);
        method = ProcessingMethod.CONVERTER;
      } else if (mimeType.includes('word') || mimeType.includes('document')) {
        // Basic Word document processing
        text = await this.processWordInBrowser(browserBuffer);
        method = ProcessingMethod.CONVERTER;
      } else if (mimeType.startsWith('image/')) {
        // For images, return a description instead of OCR
        text = `[Image file: ${mimeType}. Content analysis would require server-side OCR processing.]`;
        method = ProcessingMethod.METADATA_EXTRACTION;
      } else if (mimeType.startsWith('video/')) {
        // For videos, return a description with basic metadata
        text = await this.processVideoInBrowser(browserBuffer, mimeType);
        method = ProcessingMethod.METADATA_EXTRACTION;
      } else if (mimeType.startsWith('audio/')) {
        // For audio, return a description with basic metadata
        text = await this.processAudioInBrowser(browserBuffer, mimeType);
        method = ProcessingMethod.METADATA_EXTRACTION;
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Truncate if too long
      const originalLength = text.length;
      if (text.length > processingOptions.maxTextLength!) {
        text = text.substring(0, processingOptions.maxTextLength!);
      }

      const duration = Date.now() - startTime;
      const warnings = [];
      if (originalLength > processingOptions.maxTextLength!) {
        warnings.push('Text truncated to maximum length');
      }

      return {
        success: true,
        text: text.trim(),
        metadata: processingOptions.extractMetadata ? {
          size: browserBuffer.length,
          mimeType,
          document: {
            characters: text.length,
            words: text.split(/\s+/).filter(word => word.length > 0).length,
          }
        } : { size: browserBuffer.length, mimeType },
        processing: {
          duration,
          method,
          confidence: text.trim().length > 0 ? 0.9 : 0.1,
          warnings: warnings.length > 0 ? warnings : undefined
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const browserBuffer = buffer instanceof BrowserBuffer ? buffer : new BrowserBuffer(buffer);
      return {
        success: false,
        text: '',
        metadata: {
          size: browserBuffer.length,
          mimeType,
        },
        processing: {
          duration,
          method: ProcessingMethod.METADATA_EXTRACTION,
          confidence: 0,
        },
        error: {
          code: 'BROWSER_PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown processing error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  /**
   * Process file with fallback (same as processFile for browser)
   */
  async processFileWithFallback(
    buffer: BufferLike,
    mimeType: string,
    options: Partial<FileProcessingOptions> = {}
  ): Promise<FileProcessingResult> {
    // Try with the specified MIME type first
    let result = await this.processFile(buffer, mimeType, options);

    if (result.success) {
      return result;
    }

    // Try to detect MIME type from content
    const browserBuffer = buffer instanceof BrowserBuffer ? buffer : new BrowserBuffer(buffer);
    const detectedMimeType = this.detectMimeType(browserBuffer);
    if (detectedMimeType && detectedMimeType !== mimeType) {
      result = await this.processFile(buffer, detectedMimeType, options);
      if (result.success) {
        if (result.processing.warnings) {
          result.processing.warnings.push('Used detected MIME type');
        } else {
          result.processing.warnings = ['Used detected MIME type'];
        }
        return result;
      }
    }

    // If all else fails, try as plain text
    if (mimeType !== 'text/plain') {
      result = await this.processFile(buffer, 'text/plain', options);
      if (result.success && result.text.trim().length > 0) {
        if (result.processing.warnings) {
          result.processing.warnings.push('Processed as plain text fallback');
        } else {
          result.processing.warnings = ['Processed as plain text fallback'];
        }
        return result;
      }
    }

    return result;
  }

  /**
   * Extract text from HTML by removing tags
   */
  private extractTextFromHTML(html: string): string {
    // Create a temporary DOM element to parse HTML
    if (typeof document !== 'undefined') {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div.textContent || div.innerText || '';
    } else {
      // Fallback: simple tag removal with proper spacing
      return html
        .replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n') // Block elements to newlines
        .replace(/<[^>]*>/g, ' ') // Other tags to spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n\s+/g, '\n') // Clean up newline spacing
        .trim();
    }
  }

  /**
   * Process PDF using browser-compatible method
   */
  private async processPDFInBrowser(buffer: BrowserBuffer): Promise<string> {
    // Check if we're in browser environment
    if (typeof window === 'undefined') {
      return '[PDF processing requires browser environment]';
    }

    try {
      // Dynamically import PDF.js only in browser
      const pdfjs = await import('pdfjs-dist');

      // Set up worker from reliable CDN (avoiding Cloudflare access issues)
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.2.67/build/pdf.worker.min.js';

      // Convert BrowserBuffer to Uint8Array for PDF.js
      const uint8Array = new Uint8Array(buffer.subarray(0, buffer.length));

      console.log(`🔄 Loading PDF document...`);
      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        verbosity: 0 // Reduce console output
      });

      const pdf = await loadingTask.promise;
      let text = '';

      console.log(`🔄 Processing PDF with ${pdf.numPages} pages...`);

      // Process all pages - don't limit for better extraction
      // Large PDFs will be handled by server-side processing anyway
      const maxPages = pdf.numPages;

      for (let i = 1; i <= maxPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // Extract text from all text items with proper spacing analysis
          const textItems = textContent.items
            .filter((item: any) => item.str && typeof item.str === 'string')
            .map((item: any) => ({
              str: item.str,
              transform: item.transform || [1, 0, 0, 1, 0, 0], // [scaleX, skewY, skewX, scaleY, translateX, translateY]
              width: item.width || 0,
              height: item.height || 0,
              hasEOL: item.hasEOL || false
            }))
            .filter((item) => item.str.trim().length > 0);

          if (textItems.length > 0) {
            // Build text with proper spacing by analyzing text item positions
            let pageText = '';
            let lastItem: any = null;

            for (let j = 0; j < textItems.length; j++) {
              const currentItem = textItems[j];
              const currentText = currentItem.str.trim();

              if (currentText.length === 0) continue;

              if (lastItem !== null) {
                // Calculate horizontal distance between text items
                const lastX = lastItem.transform[4] + lastItem.width;
                const currentX = currentItem.transform[4];
                const horizontalGap = currentX - lastX;

                // Calculate vertical distance between text items
                const lastY = lastItem.transform[5];
                const currentY = currentItem.transform[5];
                const verticalGap = Math.abs(currentY - lastY);

                // Determine if we need a space based on positioning
                const fontSize = Math.max(lastItem.height, currentItem.height, 12); // Fallback to 12 if height unavailable
                const spaceThreshold = fontSize * 0.25; // A space is typically 0.25 of font size
                const lineBreakThreshold = fontSize * 0.5; // Line break if vertical gap is significant

                // Add appropriate spacing based on position analysis
                if (verticalGap > lineBreakThreshold) {
                  // Significant vertical gap indicates a new line
                  pageText += ' ';
                } else if (horizontalGap > spaceThreshold || lastItem.hasEOL) {
                  // Horizontal gap or explicit end-of-line indicates word separation
                  pageText += ' ';
                } else if (horizontalGap > 0) {
                  // Small positive gap likely indicates word separation
                  pageText += ' ';
                } else {
                  // No gap or negative gap (overlapping) - likely same word
                  // Only add space if the last character wasn't already a space or punctuation
                  const lastChar = pageText.slice(-1);
                  const firstChar = currentText.charAt(0);
                  if (lastChar && lastChar !== ' ' &&
                      !lastChar.match(/[.,:;!?-]/) &&
                      !firstChar.match(/[.,:;!?-]/)) {
                    pageText += ' ';
                  }
                }
              }

              pageText += currentText;
              lastItem = currentItem;
            }

            // Clean up text: normalize whitespace but preserve word boundaries
            pageText = pageText
              .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
              .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
              .trim();

            if (pageText) {
              text += `${pageText}\n\n`;
            }
          }

          // Add progress feedback for large PDFs
          if (i % 10 === 0) {
            console.log(`🔄 Processed ${i}/${maxPages} pages...`);
          }
        } catch (pageError) {
          console.warn(`⚠️ Error processing page ${i}:`, pageError);
          // Continue with other pages
        }
      }

      // Clean up the PDF document
      pdf.destroy();

      const finalText = text.trim();

      if (pdf.numPages > maxPages) {
        return finalText + `\n\n[Note: PDF has ${pdf.numPages} pages total, processed first ${maxPages} pages. Full extraction requires server-side processing.]`;
      }

      return finalText || '[PDF processed but no readable text content found]';

    } catch (error) {
      console.warn('PDF processing failed:', error);

      // Return a more helpful error message based on the error type
      if (error instanceof Error) {
        if (error.message.includes('Invalid PDF')) {
          return '[PDF file appears to be corrupted or invalid]';
        } else if (error.message.includes('password')) {
          return '[PDF is password protected - cannot extract text]';
        } else {
          return `[PDF text extraction failed - ${error.message}. Server-side processing may work better.]`;
        }
      }

      return '[PDF text extraction failed - server-side processing recommended]';
    }
  }

  /**
   * Process spreadsheet files
   */
  private async processSpreadsheetInBrowser(buffer: BrowserBuffer, mimeType: string): Promise<string> {
    if (mimeType === 'text/csv') {
      // CSV processing
      const csvText = buffer.toString('utf-8');
      const lines = csvText.split('\n').slice(0, 100); // Limit to first 100 rows
      return lines.map((line, index) => {
        if (index === 0) return `=== Headers ===\n${line}`;
        return line;
      }).join('\n');
    }

    return '[Spreadsheet document - server-side processing required for full extraction]';
  }

  /**
   * Process Word documents
   */
  private async processWordInBrowser(buffer: BrowserBuffer): Promise<string> {
    // For DOCX files, we could try to extract from the XML structure
    // but it's complex. For now, return a placeholder.
    return '[Word document - server-side processing required for text extraction]';
  }

  /**
   * Detect MIME type from buffer content
   */
  private detectMimeType(buffer: BrowserBuffer): string | null {
    if (buffer.length < 4) return null;

    const header = buffer.subarray(0, 12);

    // PDF
    if (buffer.subarray(0, 4).reduce((str, byte) => str + String.fromCharCode(byte), '') === '%PDF') {
      return 'application/pdf';
    }

    // ZIP-based formats
    if (header[0] === 0x50 && header[1] === 0x4B) {
      return 'application/zip';
    }

    // Images
    if (header[0] === 0xFF && header[1] === 0xD8) return 'image/jpeg';
    if (header[0] === 0x89 && header[1] === 0x50) return 'image/png';
    if (header[0] === 0x47 && header[1] === 0x49) return 'image/gif';

    // Try to detect text-based formats
    try {
      const text = buffer.slice(0, Math.min(1000, buffer.length)).toString('utf-8');

      // JSON
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          JSON.parse(text);
          return 'application/json';
        } catch {
          // Not valid JSON
        }
      }

      // XML/HTML
      if (text.trim().startsWith('<')) {
        if (text.toLowerCase().includes('<!doctype html') ||
            text.toLowerCase().includes('<html')) {
          return 'text/html';
        }
        return 'application/xml';
      }

      // Check if it's mostly text
      const nonPrintableChars = text.replace(/[\x20-\x7E\s]/g, '').length;
      if (nonPrintableChars / text.length < 0.1) {
        return 'text/plain';
      }
    } catch {
      // Not text-based
    }

    return null;
  }

  /**
   * Process video files in browser (metadata extraction)
   */
  private async processVideoInBrowser(buffer: BrowserBuffer, mimeType: string): Promise<string> {
    try {
      // Create a blob URL for the video to extract metadata
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      const videoUrl = URL.createObjectURL(blob);

      return new Promise<string>((resolve) => {
        const video = document.createElement('video');

        const cleanup = () => {
          URL.revokeObjectURL(videoUrl);
          video.remove();
        };

        video.onloadedmetadata = () => {
          const duration = video.duration;
          const width = video.videoWidth;
          const height = video.videoHeight;

          const parts = ['[Video File]'];

          if (duration && isFinite(duration)) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            parts.push(`Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`);
          }

          if (width && height) {
            parts.push(`Resolution: ${width}x${height}`);
          }

          parts.push(`Format: ${mimeType}`);
          parts.push(`File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
          parts.push('This video file can be viewed and analyzed for visual content. For detailed content analysis, consider describing what you see in the video or extracting key frames.');

          cleanup();
          resolve(parts.join('\n'));
        };

        video.onerror = () => {
          cleanup();
          resolve(`[Video File: ${mimeType}. File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB. Metadata extraction failed - video may be corrupted or in an unsupported format.]`);
        };

        // Set timeout to prevent hanging
        setTimeout(() => {
          cleanup();
          resolve(`[Video File: ${mimeType}. File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB. This video file can be viewed and analyzed for visual content.]`);
        }, 5000);

        video.src = videoUrl;
        video.style.display = 'none';
        document.body.appendChild(video);
      });
    } catch (error) {
      return `[Video File: ${mimeType}. File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB. This video file can be viewed and analyzed for visual content.]`;
    }
  }

  /**
   * Process audio files in browser (metadata extraction)
   */
  private async processAudioInBrowser(buffer: BrowserBuffer, mimeType: string): Promise<string> {
    try {
      // Create a blob URL for the audio to extract metadata
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      const audioUrl = URL.createObjectURL(blob);

      return new Promise<string>((resolve) => {
        const audio = document.createElement('audio');

        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          audio.remove();
        };

        audio.onloadedmetadata = () => {
          const duration = audio.duration;

          const parts = ['[Audio File]'];

          if (duration && isFinite(duration)) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            parts.push(`Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`);
          }

          parts.push(`Format: ${mimeType}`);
          parts.push(`File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
          parts.push('This audio file can be played and analyzed for audio content. For detailed analysis, consider describing the audio content or using speech-to-text services if it contains speech.');

          cleanup();
          resolve(parts.join('\n'));
        };

        audio.onerror = () => {
          cleanup();
          resolve(`[Audio File: ${mimeType}. File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB. Metadata extraction failed - audio may be corrupted or in an unsupported format.]`);
        };

        // Set timeout to prevent hanging
        setTimeout(() => {
          cleanup();
          resolve(`[Audio File: ${mimeType}. File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB. This audio file can be played and analyzed for audio content.]`);
        }, 5000);

        audio.src = audioUrl;
      });
    } catch (error) {
      return `[Audio File: ${mimeType}. File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB. This audio file can be played and analyzed for audio content.]`;
    }
  }
}

// Export singleton instance
export const browserFileProcessor = BrowserFileProcessor.getInstance();
