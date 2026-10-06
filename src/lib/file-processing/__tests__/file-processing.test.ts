import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FileProcessingAdapter, fileProcessor } from '../index';
import { ProcessingMethod } from '../types';

// Create test data buffers
const createTestData = () => {
  return {
    // Simple text file
    text: Buffer.from('This is a simple text file for testing purposes.'),

    // JSON file
    json: Buffer.from(JSON.stringify({
      name: 'Test Document',
      content: 'This is a JSON test document with structured data.',
      metadata: { type: 'test', version: 1 }
    }, null, 2)),

    // HTML file
    html: Buffer.from(`
      <!DOCTYPE html>
      <html>
        <head><title>Test HTML</title></head>
        <body>
          <h1>Test Document</h1>
          <p>This is a test HTML document with some content.</p>
        </body>
      </html>
    `),

    // Markdown file
    markdown: Buffer.from(`
# Test Markdown Document

This is a **test** markdown document with:

- Bullet points
- _Italic_ text
- [Links](https://example.com)

## Section 2

More content here.
    `),

    // CSV file
    csv: Buffer.from(`Name,Age,Department
John Doe,30,Engineering
Jane Smith,25,Marketing
Bob Johnson,35,Sales`),

    // XML file
    xml: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<document>
  <title>Test XML Document</title>
  <content>This is a test XML document with structured data.</content>
  <metadata>
    <type>test</type>
    <version>1</version>
  </metadata>
</document>`),

    // Invalid/empty buffer
    empty: Buffer.from(''),

    // Binary data (simulated)
    binary: Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]),
  };
};

describe('FileProcessingAdapter', () => {
  let adapter: FileProcessingAdapter;
  let testData: ReturnType<typeof createTestData>;

  beforeAll(() => {
    adapter = new FileProcessingAdapter();
    testData = createTestData();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with default processors', () => {
      const stats = adapter.getProcessingStats();
      expect(stats.processors.length).toBeGreaterThan(0);
      expect(stats.supportedTypes).toBeGreaterThan(0);
    });

    it('should list all supported file types', () => {
      const supportedTypes = adapter.getSupportedTypes();
      expect(supportedTypes).toContain('text/plain');
      expect(supportedTypes).toContain('application/json');
      expect(supportedTypes).toContain('text/html');
      expect(supportedTypes).toContain('text/markdown');
      expect(supportedTypes).toContain('application/pdf');
      expect(supportedTypes).toContain('image/jpeg');
      expect(supportedTypes).toContain('image/png');
    });

    it('should correctly identify supported file types', () => {
      expect(adapter.isSupported('text/plain')).toBe(true);
      expect(adapter.isSupported('application/json')).toBe(true);
      expect(adapter.isSupported('application/pdf')).toBe(true);
      expect(adapter.isSupported('unsupported/type')).toBe(false);
    });
  });

  describe('Text File Processing', () => {
    it('should process plain text files', async () => {
      const result = await adapter.processFile(testData.text, 'text/plain');

      expect(result.success).toBe(true);
      expect(result.text).toContain('simple text file');
      expect(result.metadata?.mimeType).toBe('text/plain');
      expect(result.processing.method).toBe(ProcessingMethod.DIRECT_TEXT);
    });

    it('should process JSON files', async () => {
      const result = await adapter.processFile(testData.json, 'application/json');

      expect(result.success).toBe(true);
      expect(result.text).toContain('Test Document');
      expect(result.text).toContain('structured data');
      expect(result.metadata?.mimeType).toBe('application/json');
    });

    it('should process HTML files', async () => {
      const result = await adapter.processFile(testData.html, 'text/html');

      expect(result.success).toBe(true);
      expect(result.text).toContain('Test Document');
      expect(result.text).toContain('test HTML document');
      expect(result.metadata?.mimeType).toBe('text/html');
    });

    it('should process Markdown files', async () => {
      const result = await adapter.processFile(testData.markdown, 'text/markdown');

      expect(result.success).toBe(true);
      expect(result.text).toContain('Test Markdown Document');
      expect(result.text).toContain('Bullet points');
      expect(result.metadata?.mimeType).toBe('text/markdown');
    });

    it('should process CSV files', async () => {
      const result = await adapter.processFile(testData.csv, 'text/csv');

      expect(result.success).toBe(true);
      expect(result.text).toContain('John Doe');
      expect(result.text).toContain('Engineering');
      expect(result.metadata?.mimeType).toBe('text/csv');
    });

    it('should process XML files', async () => {
      const result = await adapter.processFile(testData.xml, 'application/xml');

      expect(result.success).toBe(true);
      expect(result.text).toContain('Test XML Document');
      expect(result.text).toContain('structured data');
      expect(result.metadata?.mimeType).toBe('application/xml');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty buffers', async () => {
      const result = await adapter.processFile(testData.empty, 'text/plain');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Empty or invalid file buffer');
    });

    it('should handle unsupported file types', async () => {
      const result = await adapter.processFile(testData.binary, 'unsupported/type');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Unsupported file type');
    });

    it('should handle binary data gracefully', async () => {
      const result = await adapter.processFile(testData.binary, 'application/octet-stream');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Fallback Processing', () => {
    it('should detect and process with correct MIME type', async () => {
      // Pass JSON data with wrong MIME type
      const result = await adapter.processFileWithFallback(testData.json, 'text/plain');

      expect(result.success).toBe(true);
      expect(result.text).toContain('Test Document');
    });

    it('should detect PDF from content', async () => {
      const pdfHeader = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
      const result = await adapter.processFileWithFallback(pdfHeader, 'application/octet-stream');

      // Since we don't have a real PDF, it will fail but should detect the type
      expect(result.metadata?.mimeType).toBe('application/pdf');
    });

    it('should detect ZIP-based formats', async () => {
      // ZIP header
      const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
      const result = await adapter.processFileWithFallback(zipHeader, 'application/octet-stream');

      // Should recognize it as a ZIP file
      expect(result.error?.message).toContain('zip');
    });
  });

  describe('Processing Options', () => {
    it('should respect max text length option', async () => {
      const longText = Buffer.from('A'.repeat(1000));
      const result = await adapter.processFile(longText, 'text/plain', {
        maxTextLength: 100
      });

      expect(result.success).toBe(true);
      expect(result.text.length).toBeLessThanOrEqual(100);
      expect(result.processing.warnings).toContain('Text truncated to maximum length');
    });

    it('should extract metadata when requested', async () => {
      const result = await adapter.processFile(testData.json, 'application/json', {
        extractMetadata: true
      });

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.size).toBe(testData.json.length);
      expect(result.metadata?.processor).toBeDefined();
    });

    it('should skip metadata extraction when disabled', async () => {
      const result = await adapter.processFile(testData.text, 'text/plain', {
        extractMetadata: false
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.size).toBe(testData.text.length);
      // Should still have basic metadata
      expect(result.metadata?.processor).toBeDefined();
    });
  });

  describe('Default Export', () => {
    it('should provide a working default export', async () => {
      const result = await fileProcessor.processFile(testData.text, 'text/plain');

      expect(result.success).toBe(true);
      expect(result.text).toContain('simple text file');
    });

    it('should have the same functionality as manual instantiation', async () => {
      const result1 = await fileProcessor.processFile(testData.json, 'application/json');
      const result2 = await adapter.processFile(testData.json, 'application/json');

      expect(result1.success).toBe(result2.success);
      expect(result1.text).toBe(result2.text);
    });
  });

  describe('Performance', () => {
    it('should process files within timeout', async () => {
      const start = Date.now();
      const result = await adapter.processFile(testData.text, 'text/plain', {
        timeout: 1000 // 1 second
      });
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000);
      expect(result.processing.duration).toBeLessThan(1000);
    });
  });
});
