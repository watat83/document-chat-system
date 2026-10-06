import type { AIProcessingData } from './document-processing-result';
import { jsonObject, processingSnapshot, processingTransition, updateProcessingState, processingTransaction, assertProcessingRun, mergeProcessingEvents } from '@/lib/documents/processing-state';
import { normalizeError } from '@/lib/errors/normalize-error';
import { fileProcessor } from '@/lib/file-processing'
import { DocumentSection, ProcessingStatus, DocumentContent } from '@/types/documents'
import { prisma } from '@/lib/db'
import { documentSectionsAnalyzer } from '@/lib/ai/services/document-sections-analyzer'
import { contentIntegrator } from './services/content-integrator'
import { ResponseValidators } from '@/lib/ai/utils/response-validators'
import { downloadFileWithFallback } from '@/lib/storage/path-utils'

/**
 * Document Processing Service
 *
 * Leverages existing file processing from chat functionality to extract text,
 * then uses AI (via existing AIServiceManager and PromptLibrary) to organize
 * content into structured document sections and metadata.
 */
export class DocumentProcessor {

  constructor() {
    // File extraction and basic structure preparation.
  }

  /**
   * Basic processing: Only text extraction and document sections (6 simple steps)
   * Used for file uploads to get basic structure without full AI analysis
   */
  async processDocumentBasic(
    documentId: string,
    onProgress?: (step: string, progress: number) => void,
    expectedRunId?: string
  ): Promise<{
    success: boolean
    aiData?: AIProcessingData
    error?: string
  }> {
    let runId: string | undefined;
    try {
      // Get document from database
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          organization: true
        }
      })

      if (!document) {
        return { success: false, error: 'Document not found' }
      }

      if (!document.filePath && !document.extractedText?.trim()) {
        return { success: false, error: 'No file or extracted text attached to document' }
      }

      // Update status to processing
      const started = await this.updateDocumentStatus(documentId, 'PROCESSING', undefined, expectedRunId);
      runId = typeof jsonObject(started.processing).runId === 'string' ? jsonObject(started.processing).runId as string : undefined

      // STEP 1/6: Extract text from file (17%)
      onProgress?.('Step 1/6: Extracting text from file', 17)

      let extractionResult: { success: boolean; text?: string; metadata?: any; error?: string }

      // Check if document already has extracted text
      if (document.extractedText && document.extractedText.trim().length > 0) {
        console.log(`✅ Using existing extracted text (${document.extractedText.length} chars)`);
        extractionResult = {
          success: true,
          text: document.extractedText,
          metadata: document.content || {}
        }
      } else if (document.filePath) {
        console.log(`🔄 Extracting text from file: ${document.filePath}`);
        extractionResult = await this.extractTextFromFile(document.filePath, document.mimeType)
      } else {
        await this.updateDocumentStatus(documentId, 'FAILED', 'No file path available', runId)
        return { success: false, error: 'No file path available' }
      }

      if (!extractionResult.success) {
        await this.updateDocumentStatus(documentId, 'FAILED', extractionResult.error, runId)
        return { success: false, error: extractionResult.error }
      }

      // STEP 2/6: Organize document sections (33%)
      onProgress?.('Step 2/6: Organizing document sections', 33)

      let sectionsResult: { success: boolean; sections?: any[]; error?: string }

      // Check if document already has sections from previous processing
      const existingSections = (document.content as any)?.sections
      if (existingSections && Array.isArray(existingSections) && existingSections.length > 0) {
        console.log(`✅ Using existing ${existingSections.length} sections`);
        sectionsResult = {
          success: true,
          sections: existingSections
        }
      } else {
        console.log(`🔄 Analyzing document sections...`);
        sectionsResult = await documentSectionsAnalyzer.analyzeSections(
          extractionResult.text!,
          document.name,
          document.documentType
        )
      }

      if (!sectionsResult.success || !sectionsResult.sections) {
        await this.updateDocumentStatus(documentId, 'FAILED', 'Section extraction failed', runId)
        return { success: false, error: 'Section extraction failed' }
      }

      // STEP 3/6: Extract basic keywords (50%)
      onProgress?.('Step 3/6: Extracting basic keywords', 50)
      console.log(`🔄 Extracting basic keywords...`);
      const keywords = ResponseValidators.extractKeywords(extractionResult.text!, 10);

      // STEP 4/6: Calculate basic quality scores (67%)
      onProgress?.('Step 4/6: Calculating basic quality scores', 67)
      console.log(`🔄 Calculating basic scores...`);
      const qualityScore = this.calculateQualityScore(extractionResult.text!);
      const readabilityScore = this.calculateReadabilityScore(extractionResult.text!);

      // STEP 5/6: Prepare document data (83%)
      onProgress?.('Step 5/6: Preparing document data', 83)

      const aiData: AIProcessingData = {
        status: {
          status: 'COMPLETED',
          progress: 100,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          retryCount: 0
        },
        content: {
          extractedText: extractionResult.text!,
          summary: '', // Empty - will be filled during full analysis
          keywords,
          keyPoints: [], // Empty - will be filled during full analysis
          actionItems: [], // Empty - will be filled during full analysis
          questions: [] // Empty - will be filled during full analysis
        },
        structure: {
          sections: sectionsResult.sections,
          tables: extractionResult.metadata?.tables || [],
          images: extractionResult.metadata?.images || [],
          ocrResults: extractionResult.metadata?.ocrResults || []
        },
        analysis: {
          qualityScore,
          readabilityScore,
          complexityMetrics: {
            readabilityScore
          },
          entities: [], // Empty - will be filled during full analysis
          scoringMethod: 'text-statistics',
          suggestions: [] // Empty - will be filled during full analysis
        },
        processedAt: new Date().toISOString(),
        modelVersion: 'basic-processing-v2.0',
        processingHistory: [
          {
            timestamp: new Date().toISOString(),
            event: 'Basic processing completed - Ready for full analysis',
            success: true
          }
        ]
      }

      // STEP 6/6: Save results (100%)
      onProgress?.('Step 6/6: Save results - Basic processing complete', 100)
      await this.updateDocumentWithAIData(documentId, aiData, extractionResult.text!, undefined, runId, document)
      await this.updateDocumentStatus(documentId, 'COMPLETED', undefined, runId)

      return { success: true, aiData }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Basic document processing error:', error)
      // Cancel any ongoing operations when processing fails
      await this.updateDocumentStatus(documentId, 'FAILED', error instanceof Error ? error.message : 'Unknown error', runId)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      }
    }
  }

  /**
   * Extract text from file using existing file processing service
   */
  private async extractTextFromFile(filePath: string, mimeType: string): Promise<{
    success: boolean
    text?: string
    metadata?: any
    error?: string
  }> {
    console.log(`📁 [FILE EXTRACTION] Starting file extraction for: ${filePath}`);
    console.log(`📁 [FILE EXTRACTION] MIME type: ${mimeType}`);

    try {
      let fileBuffer: Buffer

      // Check if this is a Supabase storage path
      // Supabase paths: organizationId/docs/filename.ext OR documents/organizationId/docs/filename.ext
      if ((filePath.includes('/docs/') || filePath.includes('documents/')) && !filePath.startsWith('/')) {
        console.log(`☁️ [FILE EXTRACTION] Detected Supabase storage path: ${filePath}`);
        // Download from Supabase storage
        console.log(`☁️ [FILE EXTRACTION] Importing Supabase client...`);
        const { supabaseAdmin } = await import('@/lib/supabase')

        if (!supabaseAdmin) {
          console.error(`❌ [FILE EXTRACTION] Supabase not configured`);
          throw new Error('Supabase not configured')
        }

        console.log(`☁️ [FILE EXTRACTION] Downloading file from Supabase with fallback: ${filePath}`);

        // Extract organization ID from path for fallback attempts
        const pathParts = filePath.split('/')
        const orgId = pathParts[0] // First part should be organization ID

        const { downloadFileWithFallback } = await import('@/lib/storage/path-utils')
        const result = await downloadFileWithFallback(filePath, orgId)

        if (result.error || !result.data) {
          console.error(`❌ [FILE EXTRACTION] Supabase download failed:`, result.error);
          throw new Error(`Failed to download file: ${result.error?.message || 'No data returned'}`)
        }

        if (result.actualPath !== filePath) {
          console.log(`📁 [FILE EXTRACTION] File found at alternative path: ${result.actualPath} (original: ${filePath})`);
        }

        const data = result.data

        console.log(`☁️ [FILE EXTRACTION] File downloaded successfully, converting to buffer...`);
        const arrayBuffer = await data.arrayBuffer()
        fileBuffer = Buffer.from(arrayBuffer)
        console.log(`☁️ [FILE EXTRACTION] Buffer created, size: ${fileBuffer.length} bytes`);
      } else {
        // For local files or mock paths, read from file system
        console.log(`💾 [FILE EXTRACTION] Reading local file: ${filePath}`);
        const fs = await import('fs/promises')
        fileBuffer = await fs.readFile(filePath)
        console.log(`💾 [FILE EXTRACTION] Local file read successfully, size: ${fileBuffer.length} bytes`);
      }

      // Use existing file processor with fallback
      console.log(`🔄 [FILE EXTRACTION] Starting file processing with fileProcessor...`);
      console.log(`🔄 [FILE EXTRACTION] Options: maxTextLength=1MB, timeout=60s`);

      const result = await fileProcessor.processFileWithFallback(
        fileBuffer,
        mimeType,
        {
          maxTextLength: 10 * 1024 * 1024, // 10MB max - significantly increased
          extractMetadata: true,
          timeout: 120000, // 120 seconds for document processing
          preserveFormatting: true, // Preserve original formatting
        }
      )

      console.log(`📊 [FILE EXTRACTION] File processor result:`, {
        success: result.success,
        hasText: !!result.text,
        textLength: result.text?.length || 0,
        hasMetadata: !!result.metadata,
        error: result.error?.message
      });

      if (!result.success) {
        console.error(`❌ [FILE EXTRACTION] File processing failed:`, result.error);
        return {
          success: false,
          error: result.error?.message || 'File processing failed'
        }
      }

      return {
        success: true,
        text: result.text,
        metadata: result.metadata
      }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'File read error'
      }
    }
  }


  /**
   * Convert simple DocumentSection objects to complex DocumentContent.sections format
   */
  private convertSectionsToDocumentContent(sections: DocumentSection[]): DocumentContent['sections'] {
    return sections.map((section, index) => ({
      id: section.id ?? crypto.randomUUID(),
      title: section.title,
      content: section.content,
      pageNumber: section.pageNumber || null,
      sectionOrder: index + 1,
      sectionType: 'content',
      parentId: null,
      level: 1
    }))
  }

  /**
   * Update document with AI data and related models
   */
  private async updateDocumentWithAIData(
    documentId: string,
    aiData: AIProcessingData,
    extractedText: string,
    metadata?: any,
    expectedRunId?: string,
    sourceDocument?: { extractedText: string | null; content: unknown }
  ): Promise<void> {
    console.log(`🔍 [UPDATE DOCUMENT] Storing AI data for ${documentId}:`, {
      qualityScore: aiData.analysis?.qualityScore,
      readabilityScore: aiData.analysis?.readabilityScore,
      securityClassification: aiData.security?.classification,
      securityConfidence: aiData.security?.confidenceScore,
      hasSecurityObject: !!aiData.security,
      hasAnalysisObject: !!aiData.analysis,
      sectionsCount: aiData.structure?.sections?.length || 0
    });

    // Convert simple sections to the complex DocumentContent format
    const convertedSections = aiData.structure?.sections ?
      this.convertSectionsToDocumentContent(aiData.structure.sections) : []

    console.log(`🔍 [UPDATE DOCUMENT] Converting ${aiData.structure?.sections?.length || 0} simple sections to ${convertedSections.length} complex sections`);

    // Convert processing history to the expected DocumentProcessing format
    const processingEvents = aiData.processingHistory?.map((historyItem, index) => ({
      id: `event-${Date.now()}-${index}`,
      userId: null, // System-generated events
      event: historyItem.event,
      eventType: historyItem.success === false ? 'FAILED' : index === aiData.processingHistory.length - 1 ? 'COMPLETED' : 'PROGRESS', // Default to completed for successful events
      success: historyItem.success,
      error: historyItem.success === false ? (historyItem.details || 'Processing failed') : null,
      timestamp: historyItem.timestamp,
      duration: null,
      metadata: historyItem.details ? { details: historyItem.details } : null
    })) || []

    const processingData = {
      currentStatus: aiData.status?.status || 'COMPLETED',
      progress: aiData.status?.progress ?? 0,
      currentStep: null,
      estimatedCompletion: null,
      events: processingEvents
    }

    console.log(`🔍 [UPDATE DOCUMENT] Converting ${aiData.processingHistory?.length || 0} processing history items to ${processingEvents.length} events`);

    await processingTransaction(prisma, async (tx) => {
      const current = await tx.document.findFirst({ where: { id: documentId, deletedAt: null }, select: { processing: true, embeddings: true, extractedText: true, analysis: true, content: true, summary: true } });
      if (!current) throw new Error('Document not found');
      assertProcessingRun(current.processing, expectedRunId);
      if (sourceDocument && (current.extractedText !== sourceDocument.extractedText || JSON.stringify(current.content) !== JSON.stringify(sourceDocument.content))) throw new Error('Document content changed during basic processing');
      // Update main document with AI data split into correct JSON fields
      await tx.document.update({
        where: { id: documentId },
        data: {
          // Split aiData into correct JSON fields with proper structure
          processing: { ...processingSnapshot(current.processing), ...processingData, events: mergeProcessingEvents(processingSnapshot(current.processing).events, processingEvents) },
          content: {
            ...jsonObject(current.content),
            extractedText: aiData.content.extractedText,
            summary: aiData.content.summary || current.summary || '',
            keywords: aiData.content.keywords,
            keyPoints: jsonObject(current.content).keyPoints ?? [],
            actionItems: jsonObject(current.content).actionItems ?? [],
            questions: jsonObject(current.content).questions ?? [],
            // Convert sections to the expected format
            sections: convertedSections,
            tables: aiData.structure?.tables || [],
            images: aiData.structure?.images || []
          },
          analysis: { ...jsonObject(current.analysis), qualityScore: aiData.analysis.qualityScore, readabilityScore: aiData.analysis.readabilityScore, complexityMetrics: aiData.analysis.complexityMetrics, scoringMethod: 'text-statistics' },
          embeddings: current.extractedText === extractedText ? jsonObject(current.embeddings) : {},
          // Direct fields
          extractedText,
          summary: aiData.content.summary || current.summary || '',
          // Update metadata fields if they exist in the AI analysis
          ...(metadata?.documentType && { documentType: metadata.documentType }),
          ...(metadata?.securityClassification && { securityClassification: metadata.securityClassification }),
          ...(metadata?.tags && { tags: metadata.tags }),
          ...(metadata?.description && { description: metadata.description })
        }
      })

      console.log(`✅ [UPDATE DOCUMENT] Successfully stored ${convertedSections.length} sections and ${processingEvents.length} processing events`);
    })
  }

  /**
   * Update document processing status
   */
  private async updateDocumentStatus(
    documentId: string,
    status: ProcessingStatus,
    error?: string,
    expectedRunId?: string
  ) {
    return updateProcessingState(documentId, current => expectedRunId && current.runId !== expectedRunId ? (() => { if (status === 'PROCESSING') assertProcessingRun(current, expectedRunId); return current; })() : current.currentStatus === 'CANCELLED' ? (() => { if (status === 'PROCESSING') assertProcessingRun(current); return current; })() : processingTransition(current, status, error));
  }

  /**
   * Fallback section creation based on text structure
   */
  private createFallbackSections(text: string): DocumentSection[] {
    const lines = text.split('\n')
    const sections: DocumentSection[] = []
    let currentSection: DocumentSection | null = null
    let sectionContent: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      // Heuristic for section headers
      if (trimmed.length > 0 && trimmed.length < 100 &&
          (/^[A-Z]/.test(trimmed) && !trimmed.endsWith('.')) ||
          trimmed.match(/^\d+\.?\s+[A-Z]/)) {

        // Save previous section
        if (currentSection && sectionContent.length > 0) {
          currentSection.content = sectionContent.join('\n').trim()
          sections.push(currentSection)
        }

        // Start new section
        currentSection = {
          title: trimmed,
          content: '',
          pageNumber: 1
        }
        sectionContent = []
      } else if (currentSection && trimmed.length > 0) {
        sectionContent.push(line)
      }
    }

    // Add final section
    if (currentSection && sectionContent.length > 0) {
      currentSection.content = sectionContent.join('\n').trim()
      sections.push(currentSection)
    }

    // If no sections found, create a single section
    if (sections.length === 0) {
      sections.push({
        title: 'Document Content',
        content: text,
        pageNumber: 1
      })
    }

    return sections
  }

  private calculateQualityScore(text: string): number {
    // Simple quality score based on length and structure
    const words = text.split(/\s+/).length
    const paragraphs = text.split(/\n\s*\n/).length

    let score = 0
    if (words > 100) score += 30
    if (words > 500) score += 30
    if (paragraphs > 3) score += 20
    if (text.includes('\n')) score += 20

    return Math.min(100, score)
  }

  private calculateReadabilityScore(text: string): number {
    // Simple readability: average sentence length
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const words = text.split(/\s+/).length

    if (sentences.length === 0) return 50

    const avgSentenceLength = words / sentences.length

    // Score inversely related to sentence length
    if (avgSentenceLength < 15) return 90
    if (avgSentenceLength < 20) return 70
    if (avgSentenceLength < 30) return 50
    return 30
  }

  /**
   * Extract text only from document - for basic processing endpoint
   */
  async extractTextOnly(documentId: string, forceReprocess = false): Promise<{
    success: boolean
    extractedText?: string
    error?: string
  }> {
    try {
      console.log(`📄 [TEXT ONLY] Starting text extraction for document: ${documentId}`)

      // Get document from database
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          filePath: true,
          mimeType: true,
          extractedText: true
        }
      })

      if (!document) {
        return { success: false, error: 'Document not found' }
      }

      // If text already extracted, return it
      if (!forceReprocess && document.extractedText && document.extractedText.trim().length > 0) {
        console.log(`✅ [TEXT ONLY] Document already has extracted text (${document.extractedText.length} chars)`)
        return {
          success: true,
          extractedText: document.extractedText
        }
      }

      // Extract text from file
      if (!document.filePath && !document.extractedText?.trim()) {
        return { success: false, error: 'No file or extracted text attached to document' }
      }

      console.log(`🔄 [TEXT ONLY] Extracting text from file: ${document.filePath}`)
      const extractionResult = await this.extractTextFromFile(document.filePath, document.mimeType)

      if (!extractionResult.success || !extractionResult.text) {
        return {
          success: false,
          error: extractionResult.error || 'Text extraction failed'
        }
      }

      console.log(`✅ [TEXT ONLY] Text extraction completed: ${extractionResult.text.length} characters`)

      return {
        success: true,
        extractedText: extractionResult.text
      }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error(`❌ [TEXT ONLY] Error:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Text extraction failed'
      }
    }
  }

  /**
   * Parse document structure only - for basic processing endpoint
   */
  async parseStructureOnly(documentId: string, suppliedText?: string): Promise<{
    success: boolean
    structure?: {
      sections: any[]
      tables: any[]
      images: any[]
    }
    error?: string
  }> {
    try {
      console.log(`📋 [STRUCTURE ONLY] Starting structure parsing for document: ${documentId}`)

      // Get document from database
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          name: true,
          filePath: true,
          mimeType: true,
          extractedText: true,
        documentType: true,
          content: true,
          organizationId: true
        }
      })

      if (!document) {
        return { success: false, error: 'Document not found' }
      }

      // Check if structure already exists
      const existingContent = document.content as any
      if (existingContent?.sections?.length > 0) {
        console.log(`✅ [STRUCTURE ONLY] Document already has ${existingContent.sections.length} sections`)
        return {
          success: true,
          structure: {
            sections: existingContent.sections || [],
            tables: existingContent.tables || [],
            images: existingContent.images || []
          }
        }
      }

      // Get extracted text
      let documentText = suppliedText ?? document.extractedText
      if (!documentText || documentText.trim().length === 0) {
        // Try to extract text first
        console.log(`🔄 [STRUCTURE ONLY] No extracted text, extracting from file first...`)
        const textResult = await this.extractTextOnly(documentId)
        if (!textResult.success || !textResult.extractedText) {
          return {
            success: false,
            error: 'No text available for structure parsing'
          }
        }
        documentText = textResult.extractedText
      }

      // Extract document sections
      console.log(`🔄 [STRUCTURE ONLY] Analyzing document sections...`)
      const sectionsResult = await documentSectionsAnalyzer.analyzeSections(
        documentText,
        document.name,
        document.documentType
      )

      if (!sectionsResult.success || !sectionsResult.sections) {
        return {
          success: false,
          error: sectionsResult.error || 'Section analysis failed'
        }
      }

      // Extract tables and images from file if available
      let tables: any[] = []
      let images: any[] = []

      if (document.filePath) {
        console.log(`🔄 [STRUCTURE ONLY] Extracting tables and images from file...`)
        const fileResult = await this.extractTextFromFile(document.filePath, document.mimeType)

        if (fileResult.success && fileResult.metadata) {
          tables = fileResult.metadata.tables || []
          images = fileResult.metadata.images || []
        }
      }

      // Integrate content into sections
      console.log(`🔄 [STRUCTURE ONLY] Integrating content into sections...`)
      const enhancedSections = contentIntegrator.integrateContentIntoSections(
        sectionsResult.sections,
        tables,
        images
      )

      const structure = {
        sections: enhancedSections,
        tables,
        images
      }

      console.log(`✅ [STRUCTURE ONLY] Structure parsing completed:`, {
        sections: structure.sections.length,
        tables: structure.tables.length,
        images: structure.images.length
      })

      return {
        success: true,
        structure
      }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error(`❌ [STRUCTURE ONLY] Error:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Structure parsing failed'
      }
    }
  }

}

// Export singleton instance
export const documentProcessor = new DocumentProcessor()
