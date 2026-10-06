import * as cheerio from 'cheerio';
import { marked } from 'marked';
import { IFileProcessor, FileProcessingOptions, FileProcessingResult, ProcessingMethod } from '../types';

/**
 * Text processor for plain text, HTML, Markdown, JSON, and XML files
 */
export class TextProcessor implements IFileProcessor {
  private readonly supportedTypes = [
    'text/plain',
    'text/html',
    'text/markdown',
    'application/json',
    'application/xml',
    'text/xml',
    // Common fallback MIME types that browsers might assign to text files
    'application/octet-stream', // We'll check content for this one
    'text/x-markdown',
    'text/md',
  ];

  canProcess(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  getName(): string {
    return 'TextProcessor';
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

      // Detect encoding and convert to string
      const rawText = buffer.toString('utf-8');
      if (rawText.includes('\0') || /[\x01-\x08\x0e-\x1f]/.test(rawText) || rawText.includes('\ufffd')) throw new Error('Binary data is not a text document');
      const mimeType = this.detectMimeType(rawText);

      let extractedText = '';
      let documentMetadata: Record<string, unknown> = {};

      switch (mimeType) {
        case 'text/plain':
          extractedText = this.processPlainText(rawText, options);
          break;
        case 'text/html':
          const htmlResult = this.processHTML(rawText, options);
          extractedText = htmlResult.text;
          documentMetadata = htmlResult.metadata;
          break;
        case 'text/markdown':
          extractedText = this.processMarkdown(rawText, options);
          break;
        case 'application/json':
          extractedText = this.processJSON(rawText, options);
          break;
        case 'application/xml':
        case 'text/xml':
          extractedText = this.processXML(rawText, options);
          break;
        default:
          extractedText = this.processPlainText(rawText, options);
          break;
      }

      // Surface intentional loss of content instead of silently truncating.
      const truncated = extractedText.length > options.maxTextLength;
      if (extractedText.length > options.maxTextLength) {
        extractedText = extractedText.substring(0, options.maxTextLength);
      }

      const processingDuration = Date.now() - startTime;

      const metadata = {
        size: buffer.length,
        mimeType,
        document: {
          characters: extractedText.length,
          words: extractedText.split(/\s+/).filter(word => word.length > 0).length,
          ...documentMetadata,
        },
      };

      return {
        success: true,
        text: extractedText,
        metadata,
        processing: {
          duration: processingDuration,
          method: ProcessingMethod.DIRECT_TEXT,
          ...(truncated && { warnings: ['Text truncated to maximum length'] }),
          confidence: 1.0, // Text processing is deterministic
        },
      };

    } catch (error) {
      const processingDuration = Date.now() - startTime;

      return {
        success: false,
        text: '',
        metadata: {
          size: buffer.length,
          mimeType: 'text/plain',
        },
        processing: {
          duration: processingDuration,
          method: ProcessingMethod.DIRECT_TEXT,
          confidence: 0,
        },
        error: {
          code: 'TEXT_PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred while processing text',
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }

  private detectMimeType(text: string): string {
    // Simple heuristic-based detection
    const trimmedText = text.trim();

    // JSON detection
    if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) ||
        (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
      try {
        JSON.parse(trimmedText);
        return 'application/json';
      } catch {
        // Not valid JSON, continue with other checks
      }
    }

    // HTML detection
    if (trimmedText.toLowerCase().includes('<!doctype html') ||
        trimmedText.toLowerCase().includes('<html') ||
        trimmedText.toLowerCase().includes('<head') ||
        trimmedText.toLowerCase().includes('<body')) {
      return 'text/html';
    }

    // XML detection
    if (trimmedText.startsWith('<?xml') ||
        (trimmedText.startsWith('<') && trimmedText.includes('>'))) {
      return 'application/xml';
    }

    // Enhanced Markdown detection (more comprehensive heuristics)
    const markdownPatterns = [
      /^#{1,6}\s/m,           // Headers (# ## ### etc)
      /```[\s\S]*?```/,       // Code blocks
      /\*\*.*?\*\*/,          // Bold text
      /\*.*?\*/,              // Italic text (but not alone, could be bullet)
      /\[.*?\]\(.*?\)/,       // Links [text](url)
      /^\s*[-*+]\s/m,         // Bullet points
      /^\s*\d+\.\s/m,         // Numbered lists
      />\s/,                  // Blockquotes
      /^\s*\|.*\|/m,          // Tables
      /~~.*?~~/,              // Strikethrough
      /`.*?`/,                // Inline code
    ];

    if (markdownPatterns.some(pattern => pattern.test(trimmedText))) {
      return 'text/markdown';
    }

    return 'text/plain';
  }

  private processPlainText(text: string, options: FileProcessingOptions): string {
    if (!options.preserveFormatting) {
      return text
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    return text;
  }

  private processHTML(html: string, options: FileProcessingOptions): { text: string; metadata: Record<string, unknown> } {
    const $ = cheerio.load(html);

    // Extract metadata
    const metadata = {
      title: $('title').text() || undefined,
      description: $('meta[name="description"]').attr('content') || undefined,
      keywords: $('meta[name="keywords"]').attr('content') || undefined,
      author: $('meta[name="author"]').attr('content') || undefined,
    };

    // Remove script and style elements
    $('script, style').remove();

    // Extract text content
    let text = $('body').text() || $.text();

    if (!options.preserveFormatting) {
      text = text
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    return { text, metadata };
  }

  private processMarkdown(markdown: string, options: FileProcessingOptions): string {
    try {
      // Convert markdown to HTML first, then extract text
      const html = marked(markdown) as string;
      const $ = cheerio.load(html);

      let text = $.text();

      if (!options.preserveFormatting) {
        text = text
          .replace(/\s+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      return text;
    } catch {
      // Fall back to plain text processing
      return this.processPlainText(markdown, options);
    }
  }

  private processJSON(json: string, options: FileProcessingOptions): string {
    try {
      const parsed = JSON.parse(json);

      // Extract all string values from the JSON
      const extractStrings = (obj: unknown): string[] => {
        const strings: string[] = [];

        if (typeof obj === 'string') {
          strings.push(obj);
        } else if (Array.isArray(obj)) {
          obj.forEach(item => {
            strings.push(...extractStrings(item));
          });
        } else if (typeof obj === 'object' && obj !== null) {
          Object.values(obj).forEach(value => {
            strings.push(...extractStrings(value));
          });
        }

        return strings;
      };

      const strings = extractStrings(parsed);
      let text = strings.join(' ');

      if (!options.preserveFormatting) {
        text = text
          .replace(/\s+/g, ' ')
          .trim();
      }

      return text;
    } catch {
      // Fall back to plain text processing
      return this.processPlainText(json, options);
    }
  }

  private processXML(xml: string, options: FileProcessingOptions): string {
    try {
      const $ = cheerio.load(xml, { xmlMode: true });

      let text = $.text();

      if (!options.preserveFormatting) {
        text = text
          .replace(/\s+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      return text;
    } catch {
      // Fall back to plain text processing
      return this.processPlainText(xml, options);
    }
  }
}
