import JSZip from 'jszip';
import { IFileProcessor, FileProcessingOptions, FileProcessingResult, ProcessingMethod } from '../types';

/**
 * Archive processor for ZIP files and other compressed formats
 */
export class ArchiveProcessor implements IFileProcessor {
  private readonly supportedTypes = [
    'application/zip',
    'application/x-zip-compressed',
  ];

  canProcess(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  getName(): string {
    return 'ArchiveProcessor';
  }

  getSupportedTypes(): string[] {
    return [...this.supportedTypes];
  }

  async extractText(buffer: Buffer, options: FileProcessingOptions): Promise<FileProcessingResult> {
    const startTime = Date.now();

    try {
      // Validate file size
      if (buffer.length > options.maxFileSize) {
        throw new Error(`File size ${buffer.length} exceeds maximum allowed size ${options.maxFileSize}`);
      }

      const mimeType = this.detectMimeType(buffer);

      if (mimeType === 'application/zip') {
        return await this.processZipFile(buffer, options, startTime);
      }

      throw new Error(`Unsupported archive format: ${mimeType}`);

    } catch (error) {
      const processingDuration = Date.now() - startTime;

      return {
        success: false,
        text: '',
        metadata: {
          size: buffer.length,
          mimeType: this.detectMimeType(buffer),
        },
        processing: {
          duration: processingDuration,
          method: ProcessingMethod.ARCHIVE_EXTRACTION,
          confidence: 0,
        },
        error: {
          code: 'ARCHIVE_PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred while processing archive',
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  private async processZipFile(buffer: Buffer, options: FileProcessingOptions, startTime: number): Promise<FileProcessingResult> {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(buffer);

    const extractedTexts: string[] = [];
    const warnings: string[] = [];
    let totalFiles = 0;

    // Get all files in the archive
    const files = Object.keys(zipContent.files);
    totalFiles = files.length;

    // Process each file if options.processEmbeddedFiles is true
    if (options.processEmbeddedFiles) {
      for (const fileName of files) {
        const file = zipContent.files[fileName];

        // Skip directories
        if (file.dir) {
          continue;
        }

        try {
          // Check if the file is a text-based file
          if (this.isTextFile(fileName)) {
            const fileContent = await file.async('string');
            const cleanText = this.cleanFileContent(fileContent, fileName);

            if (cleanText.trim().length > 0) {
              extractedTexts.push(`=== ${fileName} ===\n${cleanText}`);
            }
          } else {
            // For non-text files, just include the filename
            extractedTexts.push(`[File: ${fileName}]`);
          }

          // Check if we've reached the text limit
          const currentText = extractedTexts.join('\n\n');
          if (currentText.length > options.maxTextLength) {
            warnings.push('Text extraction stopped due to length limit');
            break;
          }

        } catch (fileError) {
          warnings.push(`Failed to process file ${fileName}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`);
        }
      }
    } else {
      // Just list the files in the archive
      for (const fileName of files) {
        const file = zipContent.files[fileName];
        if (!file.dir) {
          extractedTexts.push(`[File: ${fileName}]`);
        }
      }
    }

    let extractedText = extractedTexts.join('\n\n');

    // Trim text to max length if needed
    if (extractedText.length > options.maxTextLength) {
      extractedText = extractedText.substring(0, options.maxTextLength);
    }

    // Clean up text if not preserving formatting
    if (!options.preserveFormatting) {
      extractedText = extractedText
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    const processingDuration = Date.now() - startTime;

    const metadata = {
      size: buffer.length,
      mimeType: 'application/zip',
      document: {
        characters: extractedText.length,
        words: extractedText.split(/\s+/).filter(word => word.length > 0).length,
        pages: totalFiles, // Number of files in archive
      },
    };

    return {
      success: true,
      text: extractedText,
      metadata,
      processing: {
        duration: processingDuration,
        method: ProcessingMethod.ARCHIVE_EXTRACTION,
        confidence: 0.8,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  }

  private detectMimeType(buffer: Buffer): string {
    // Check for ZIP magic number
    if (buffer.length >= 4) {
      const header = buffer.subarray(0, 4);
      if (header[0] === 0x50 && header[1] === 0x4B &&
          (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07)) {
        return 'application/zip';
      }
    }

    return 'application/octet-stream';
  }

  private isTextFile(filename: string): boolean {
    const textExtensions = [
      '.txt', '.md', '.markdown', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts',
      '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp', '.cs', '.php',
      '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.sql', '.yaml', '.yml',
      '.toml', '.ini', '.cfg', '.conf', '.log', '.csv', '.tsv', '.rtf'
    ];

    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return textExtensions.includes(ext);
  }

  private cleanFileContent(content: string, filename: string): string {
    // Basic cleaning for different file types
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

    switch (ext) {
      case '.json':
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return content;
        }
      case '.xml':
      case '.html':
      case '.htm':
        // Basic HTML/XML cleaning - remove tags for text extraction
        return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      default:
        return content;
    }
  }
}
