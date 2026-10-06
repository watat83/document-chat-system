import { normalizeError } from '@/lib/errors/normalize-error';
import { fileProcessor } from '@/lib/file-processing'
import { AIProcessingData, DocumentSection, DocumentImage, ExtractedEntity, ProcessingStatus, SecurityClassification, EntityType, DocumentContent } from '@/types/documents'
import { prisma } from '@/lib/db'
import { simpleAIClient } from '@/lib/ai/services/simple-ai-client'
import { documentSectionsAnalyzer } from '@/lib/ai/services/document-sections-analyzer'
import { entityExtractor } from '@/lib/ai/services/entity-extractor'
import { documentMetadataAnalyzer } from '@/lib/ai/services/document-metadata-analyzer'
import { documentContentAnalyzer } from '@/lib/ai/services/document-content-analyzer'
import { documentSecurityAnalyzer } from '@/lib/ai/services/document-security-analyzer'
import { imageExtractor } from '@/lib/ai/services/image-extractor'
import { contentIntegrator } from '@/lib/ai/services/content-integrator'
import { contractAnalyzer } from '@/lib/ai/services/contract-analyzer'
import { DocumentScoringService } from '@/lib/ai/document-scoring'
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
  private activeOperations: Map<string, AbortController> = new Map()

  constructor() {
    // Using simpleAIClient directly - consolidated AI service approach
  }

  /**
   * Basic processing: Only text extraction and document sections (6 simple steps)
   * Used for file uploads to get basic structure without full AI analysis
   */
  async processDocumentBasic(
    documentId: string,
    onProgress?: (step: string, progress: number) => void
  ): Promise<{
    success: boolean
    aiData?: AIProcessingData
    error?: string
  }> {
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

      if (!document.filePath) {
        return { success: false, error: 'No file attached to document' }
      }

      // Update status to processing
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processing: {
            status: 'PROCESSING',
            startedAt: new Date(),
            completedAt: null,
            error: null
          }
        }
      })

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
        await this.updateDocumentStatus(documentId, 'FAILED', 'No file path available')
        return { success: false, error: 'No file path available' }
      }

      if (!extractionResult.success) {
        await this.updateDocumentStatus(documentId, 'FAILED', extractionResult.error)
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
          document.organizationId
        )
      }

      if (!sectionsResult.success || !sectionsResult.sections) {
        await this.updateDocumentStatus(documentId, 'FAILED', 'Section extraction failed')
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
          confidence: 0.8, // Basic processing confidence
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
      await this.updateDocumentWithAIData(documentId, aiData, extractionResult.text!)
      await this.updateDocumentStatus(documentId, 'COMPLETED')

      return { success: true, aiData }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Basic document processing error:', error)
      // Cancel any ongoing operations when processing fails
      this.cancelDocumentOperations(documentId);
      await this.updateDocumentStatus(documentId, 'FAILED', error instanceof Error ? error.message : 'Unknown error')
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      }
    }
  }

  /**
   * Full AI analysis: Complete processing with all AI services
   * Used for manual analysis triggers from the UI
   */
  async processDocument(
    documentId: string,
    onProgress?: (step: string, progress: number) => void
  ): Promise<{
    success: boolean
    aiData?: AIProcessingData
    error?: string
  }> {
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

      if (!document.filePath) {
        return { success: false, error: 'No file attached to document' }
      }

      // Update status to processing
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processing: {
            status: 'PROCESSING',
            startedAt: new Date(),
            completedAt: null,
            error: null
          }
        }
      })

      // Create a progress function that updates both callback and database
      const updateProgress = async (step: string, progress: number) => {
        onProgress?.(step, progress)
        await this.updateDocumentProgress(documentId, step, progress)
      }

      // Step 1: Extract text (or use existing) (10%)
      await updateProgress('Extracting/verifying document text', 10)
      console.log(`🔍 [DOCUMENT PROCESSOR] Starting text extraction for document ${documentId}`)
      console.log(`📋 [DOCUMENT PROCESSOR] Document info: extractedText length = ${document.extractedText?.length || 0}, filePath = ${document.filePath}`)

      let extractionResult: { success: boolean; text?: string; metadata?: any; error?: string }

      // Optimize: Use existing extracted text if available to avoid slow file re-extraction
      if (document.extractedText && document.extractedText.trim().length > 0) {
        console.log(`✅ [DOCUMENT PROCESSOR] Using existing extracted text (${document.extractedText.length} chars) - skipping file extraction for performance`);
        await updateProgress('Using existing extracted text', 15)
        extractionResult = {
          success: true,
          text: document.extractedText,
          metadata: document.content || {}
        }
      } else if (document.filePath) {
        console.log(`🔄 [DOCUMENT PROCESSOR] No extracted text found, extracting from file: ${document.filePath}`);
        await updateProgress('Extracting text from file...', 12)
        extractionResult = await this.withTimeout(
          this.extractTextFromFile(document.filePath, document.mimeType),
          60 * 1000, // 60 second timeout for file extraction
          'File extraction timeout after 60 seconds',
          documentId
        )
      } else {
        console.error(`❌ [DOCUMENT PROCESSOR] No extracted text and no file path available`);
        await this.updateDocumentStatus(documentId, 'FAILED', 'No extracted text or file path available for processing')
        return { success: false, error: 'No extracted text or file path available for processing' }
      }

      if (!extractionResult.success) {
        console.error(`❌ [DOCUMENT PROCESSOR] Text extraction failed for document ${documentId}:`, extractionResult.error)
        await this.updateDocumentStatus(documentId, 'FAILED', extractionResult.error)
        return { success: false, error: extractionResult.error }
      }

      console.log(`✅ [DOCUMENT PROCESSOR] Text extraction completed, proceeding with ${extractionResult.text?.length || 0} characters of text`)

      // STEP 2/6: Organize document sections (33%)
      await updateProgress('Step 2/6: Organizing document sections', 33)
      console.log(`🔄 [SIMPLIFIED AI] Organizing document sections...`)

      const sectionsResult = await this.withTimeout(
        documentSectionsAnalyzer.analyzeSections(
          extractionResult.text!,
          document.name,
          document.organizationId,
          'OTHER'
        ),
        120 * 1000, // 120 second timeout (2 minutes)
        'Sections analysis timeout',
        documentId
      )

      if (!sectionsResult.success) {
        console.error(`❌ Sections analysis failed:`, sectionsResult.error)
        await this.updateDocumentStatus(documentId, 'FAILED', sectionsResult.error)
        return { success: false, error: sectionsResult.error }
      }

      // STEP 3/6: Run comprehensive AI analysis (50% - 90%)
      await updateProgress('Step 3/6: Running comprehensive AI analysis', 50)
      console.log(`🔄 [COMPREHENSIVE AI] Starting full AI analysis pipeline...`)

      const aiResult = await this.withTimeout(
        this.processWithModularAI(
          extractionResult.text!,
          extractionResult.metadata,
          document.organizationId,
          document.organization?.name || 'Organization',
          document.name,
          document,
          (step: string, progress: number) => {
            // Scale progress from 50-90%
            const scaledProgress = 50 + (progress * 0.4)
            updateProgress(step, scaledProgress)
          }
        ),
        120 * 1000, // 2 minute timeout for comprehensive analysis
        'Comprehensive AI analysis timeout',
        documentId
      )

      if (!aiResult.success) {
        console.error(`❌ Comprehensive AI analysis failed:`, aiResult.error)
        // Fall back to basic processing
        await updateProgress('Falling back to basic analysis', 60)
        const basicResult = await this.createBasicAIData(extractionResult.text!, extractionResult.metadata)
        return { success: true, aiData: basicResult }
      }

      console.log(`✅ [COMPREHENSIVE AI] Full analysis completed successfully`);

      // Use the comprehensive AI result
      const aiData = aiResult.aiData!
      const metadata = aiResult.metadata

      // Log comprehensive results
      console.log(`📊 [COMPREHENSIVE AI] Analysis results:`, {
        hasMetadata: !!metadata,
        hasContractAnalysis: !!aiData.contractAnalysis,
        tagsCount: metadata?.tags?.length || 0,
        sectionsCount: aiData.structure?.sections?.length || 0,
        entitiesCount: aiData.analysis?.entities?.length || 0,
        contractType: aiData.contractAnalysis?.contractType
      });

      // STEP 6/6: Save comprehensive results (100%)
      await updateProgress('Step 6/6: Saving comprehensive analysis results', 100)
      console.log(`🔄 [COMPREHENSIVE AI] Saving comprehensive results with contract details and tags...`)

      // Debug what we're about to save
      console.log(`🔍 [COMPREHENSIVE AI] About to call updateDocumentWithFullAIData with:`, {
        documentId,
        hasAiData: !!aiData,
        hasMetadata: !!metadata,
        metadataKeys: metadata ? Object.keys(metadata) : [],
        hasTags: !!metadata?.tags,
        tagsArray: metadata?.tags,
        hasContractAnalysis: !!aiData?.contractAnalysis,
        contractType: aiData?.contractAnalysis?.contractType
      });

      // Use the new method that saves contract analysis and metadata
      await this.updateDocumentWithFullAIData(documentId, aiData, extractionResult.text!, metadata)
      await this.updateDocumentStatus(documentId, 'COMPLETED')

      console.log(`✅ [COMPREHENSIVE AI] Document update completed. Contract analysis and tags should now be populated.`);

      return { success: true, aiData }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Full document processing error:', error)
      // Cancel any ongoing operations when processing fails
      this.cancelDocumentOperations(documentId);
      await this.updateDocumentStatus(documentId, 'FAILED', error instanceof Error ? error.message : 'Unknown error')
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
          enhanceFormatting: false, // Don't enhance - keep original structure
          includeStructure: true // Include document structure information
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

      // Extract images if this is a PDF
      let extractedImages: Partial<DocumentImage>[] = []
      if (mimeType === 'application/pdf') {
        console.log(`🖼️ [FILE EXTRACTION] PDF detected, extracting images as base64...`);
        try {
          const imageResult = await imageExtractor.extractImagesFromPDF(
            fileBuffer,
            filePath.split('/').pop()?.split('.')[0] || 'unknown',
            filePath.split('/').pop() || 'unknown.pdf'
          )

          if (imageResult.success && imageResult.images) {
            extractedImages = imageResult.images
            console.log(`✅ [FILE EXTRACTION] Extracted ${extractedImages.length} images as base64 from PDF`);
          } else {
            console.warn(`⚠️ [FILE EXTRACTION] Image extraction failed: ${imageResult.error}`);
          }
        } catch (caughtError) {
      const error = normalizeError(caughtError);
          console.warn(`⚠️ [FILE EXTRACTION] Image extraction error:`, error);
          // Don't fail the whole process if image extraction fails
        }
      }

      // Merge extracted images with existing metadata
      const enhancedMetadata = {
        ...result.metadata,
        images: [
          ...(result.metadata?.images || []),
          ...extractedImages
        ]
      }

      return {
        success: true,
        text: result.text,
        metadata: enhancedMetadata
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
   * Process extracted text with modular AI services
   */
  private async processWithModularAI(
    extractedText: string,
    fileMetadata: any,
    organizationId: string,
    organizationName: string,
    documentName: string,
    document: any, // Full document object to access existing processing history
    onProgress?: (step: string, progress: number) => void
  ): Promise<{
    success: boolean
    aiData?: AIProcessingData
    metadata?: any
    error?: string
  }> {
    console.log(`🚀 [MODULAR AI] Starting processWithModularAI with parameters:`, {
      extractedTextLength: extractedText?.length || 0,
      fileMetadata: typeof fileMetadata,
      organizationId,
      documentName
    });

    try {
      // Get existing processing history to preserve it
      const existingAiData = {
        status: document.processing || {},
        content: document.content || {},
        analysis: document.analysis || {},
        entities: document.entities || {},
        vectorProperties: document.embeddings || {},
        processingHistory: (document.processing as any)?.history || []
      }
      const existingHistory = existingAiData?.processingHistory || []

      const startTime = new Date().toISOString()

      // Step 1: Analyze document metadata (20-30%)
      onProgress?.('Analyzing document metadata and classification', 20)
      console.log(`🔍 [MODULAR AI] Starting metadata analysis for document: ${documentName}`)
      console.log(`🔍 [MODULAR AI] Extracted text length: ${extractedText.length} characters`)
      console.log(`🔍 [MODULAR AI] Organization ID: ${organizationId}`)

      let metadataResult;
      try {
        console.log(`🔍 [MODULAR AI] Calling documentMetadataAnalyzer.analyzeMetadata with 30s timeout...`)
        const startTime = Date.now()

        metadataResult = await this.withTimeout(
          documentMetadataAnalyzer.analyzeMetadata(
            extractedText,
            documentName,
            organizationId
          ),
          60 * 1000, // 60 second timeout for metadata extraction
          'METADATA ANALYSIS TIMEOUT after 60 seconds',
          document.id
        )

        const duration = Date.now() - startTime
        console.log(`✅ [MODULAR AI] Metadata analysis completed successfully in ${duration}ms`)
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.error(`❌ [MODULAR AI] METADATA ANALYSIS FAILED - This is likely why processing is stuck at 5%:`, error);
        console.error(`❌ [MODULAR AI] Error details:`, {
          errorType: typeof error,
          errorName: error?.name,
          errorMessage: error?.message,
          documentName,
          organizationId,
          textLength: extractedText.length
        });

        // Use fallback metadata to keep analysis moving
        console.log(`🔄 [MODULAR AI] Creating fallback metadata...`)
        metadataResult = {
          success: true,
          metadata: {
            documentType: 'OTHER' as const,
            securityClassification: 'INTERNAL' as const,
            setAsideType: undefined,
            naicsCodes: [],
            tags: ['document'],
            description: `Analysis of ${documentName}`,
            summary: `This document has been processed with fallback analysis due to AI service timeout or error.`,
            keywords: ['document', 'analysis'],
            urgencyLevel: 'medium' as const,
            complexityScore: 5
          }
        };
        console.log(`✅ [MODULAR AI] Fallback metadata created successfully`)
      }

      if (!metadataResult.success || !metadataResult.metadata) {
        console.error(`❌ Metadata analysis failed:`, metadataResult.error)
        throw new Error(`Metadata analysis failed: ${metadataResult.error}`)
      }

      // CRITICAL DEBUG: Log exact metadata including tags
      console.log(`✅ Metadata analysis completed successfully`)
      console.log(`🔍 [METADATA DEBUG] Full metadata object:`, JSON.stringify(metadataResult.metadata, null, 2))
      console.log(`🔍 [METADATA DEBUG] Tags specifically:`, {
        hasTags: !!metadataResult.metadata.tags,
        tagsArray: metadataResult.metadata.tags,
        tagsCount: metadataResult.metadata.tags?.length || 0,
        tagsType: typeof metadataResult.metadata.tags
      })

      // Step 2: Extract document sections (30-45%)
      onProgress?.('Extracting document sections and structure', 30)

      let sectionsResult: { success: boolean; sections?: any[]; error?: string }

      // Check if we can reuse existing sections
      console.log(`🔍 [MODULAR AI] Checking existing sections:`, {
        metadataAiDataSections: metadataResult.metadata?.aiData?.structure?.sections?.length || 0,
        fileMetadataType: typeof fileMetadata,
        fileMetadataSections: fileMetadata?.structure?.sections?.length || 0
      });

      const existingSections = metadataResult.metadata?.aiData?.structure?.sections ||
                              (typeof fileMetadata === 'object' && fileMetadata?.structure?.sections)

      // For full reanalysis, always regenerate sections to get fresh structure
      console.log(`🔍 [FULL PROCESSOR] Regenerating document sections for full reanalysis...`);
      sectionsResult = await this.withTimeout(
        documentSectionsAnalyzer.analyzeSections(
          extractedText,
          documentName,
          organizationId,
          metadataResult.metadata.documentType
        ),
        90 * 1000, // 90 second timeout for sections analysis
        'SECTIONS ANALYSIS TIMEOUT after 90 seconds',
        document.id
      )

      if (!sectionsResult.success || !sectionsResult.sections) {
        console.error(`❌ Sections analysis failed:`, sectionsResult.error)
        throw new Error(`Section analysis failed: ${sectionsResult.error}`)
      }

      console.log(`✅ Sections analysis completed, using ${sectionsResult.sections.length} sections`)

      // Step 2.5: Integrate tables and images into sections at correct positions (42%)
      onProgress?.('Integrating tables and images into document sections', 42)
      console.log(`🔄 Integrating tables and images into sections...`)

      const enhancedSections = contentIntegrator.integrateContentIntoSections(
        sectionsResult.sections,
        fileMetadata?.tables || [],
        fileMetadata?.images || []
      )

      // Update sections result with integrated content
      sectionsResult.sections = enhancedSections
      console.log(`✅ Content integration completed - tables and images positioned in sections`)

      // Step 3: Extract entities (45-60%)
      onProgress?.('Extracting entities and key information', 45)
      console.log(`🔍 Starting entity extraction...`)

      const entitiesResult = await this.withTimeout(
        entityExtractor.extractEntities(
          extractedText,
          documentName,
          organizationId
        ),
        90 * 1000, // 90 second timeout for entity extraction
        'ENTITY EXTRACTION TIMEOUT after 90 seconds',
        document.id
      )

      if (!entitiesResult.success || !entitiesResult.entities) {
        console.error(`❌ Entity extraction failed:`, entitiesResult.error)
        throw new Error(`Entity extraction failed: ${entitiesResult.error}`)
      }

      console.log(`✅ Entity extraction completed, found ${entitiesResult.entities.length} entities`)

      // Convert extracted entities to proper EntityType enum values for database storage
      console.log(`🔄 Converting extracted entities to proper EntityType enum values...`)
      const convertedEntities = entitiesResult.entities.map(entity => {
        const properType = entityExtractor.determineProperEntityType(entity)
        return {
          id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: entity.text,
          type: properType, // Now uses proper EntityType enum instead of limited ExtractedEntity type
          confidence: entity.confidence,
          startOffset: entity.startOffset,
          endOffset: entity.endOffset,
          context: entity.context || null,
          metadata: null
        }
      })

      console.log(`✅ Entity conversion completed:`, {
        originalEntities: entitiesResult.entities.length,
        convertedEntities: convertedEntities.length,
        entityTypes: convertedEntities.reduce((acc, entity) => {
          acc[entity.type] = (acc[entity.type] || 0) + 1
          return acc
        }, {} as Record<string, number>),
        // Show first 5 converted entities for debugging
        sampleConvertedEntities: convertedEntities.slice(0, 5).map(entity => ({
          text: entity.text,
          originalType: entitiesResult.entities.find(e => e.text === entity.text)?.type,
          originalAIType: entitiesResult.entities.find(e => e.text === entity.text)?.originalAIType,
          convertedType: entity.type
        }))
      })

      // Step 4: Analyze content for insights (60-70%)
      onProgress?.('Analyzing content for insights and recommendations', 60)
      console.log(`🔍 Starting content analysis...`)

      const contentResult = await this.withTimeout(
        documentContentAnalyzer.analyzeContent(
          extractedText,
          documentName,
          metadataResult.metadata.documentType,
          organizationId
        ),
        90 * 1000, // 90 second timeout for content analysis
        'CONTENT ANALYSIS TIMEOUT after 90 seconds',
        document.id
      )

      if (!contentResult.success || !contentResult.analysis) {
        console.error(`❌ Content analysis failed:`, contentResult.error)
        console.error(`❌ [DOCUMENT PROCESSOR] Content analysis failed - AI scoring required but unavailable`)
        throw new Error(`Content analysis failed: ${contentResult.error} - LLM-based scoring is required`)
      }

      console.log(`✅ Content analysis completed`)

      // Step 4.5: Use advanced scoring for better quality/readability scores (65-70%)
      onProgress?.('Calculating advanced document scores', 65)
      console.log(`🔍 [DOCUMENT PROCESSOR] Starting advanced document scoring...`)
      console.log(`🔍 [DOCUMENT PROCESSOR] Content analysis scores before scoring service:`, {
        qualityScore: contentResult.analysis.qualityScore,
        readabilityScore: contentResult.analysis.readabilityScore
      })

      let scoringResult;
      try {
        console.log(`🔍 [DOCUMENT PROCESSOR] Initializing DocumentScoringService...`)
        const scoringService = DocumentScoringService.getInstance()
        console.log(`🔍 [DOCUMENT PROCESSOR] Calling scoreDocument with:`, {
          contentLength: extractedText.length,
          title: documentName,
          documentType: metadataResult.metadata.documentType
        })

        scoringResult = await this.withTimeout(
          scoringService.scoreDocument(
            {
              content: extractedText,
              title: documentName,
              documentType: metadataResult.metadata.documentType,
              metadata: {
                wordCount: extractedText.split(/\s+/).length,
                pageCount: sectionsResult.sections.length
              }
            },
            {
              documentType: metadataResult.metadata.documentType,
              organizationId
            }
          ),
          1 * 60 * 1000, // 1 minute timeout
          'Advanced scoring timeout',
          document.id
        )

        console.log(`✅ [DOCUMENT PROCESSOR] Advanced scoring completed with scores:`, {
          overallScore: scoringResult.overallScore,
          relevance: scoringResult.criteria.relevance,
          compliance: scoringResult.criteria.compliance,
          completeness: scoringResult.criteria.completeness,
          technicalMerit: scoringResult.criteria.technicalMerit,
          riskAssessment: scoringResult.criteria.riskAssessment
        })

        // Override content analysis scores with more accurate scoring service results
        if (scoringResult) {
          const newQualityScore = Math.round(scoringResult.overallScore)
          const newReadabilityScore = Math.round(
            (scoringResult.criteria.completeness + scoringResult.criteria.technicalMerit) / 2
          )

          console.log(`🔄 [DOCUMENT PROCESSOR] Overriding content analysis scores:`, {
            oldQualityScore: contentResult.analysis.qualityScore,
            newQualityScore,
            oldReadabilityScore: contentResult.analysis.readabilityScore,
            newReadabilityScore
          })

          contentResult.analysis.qualityScore = newQualityScore
          contentResult.analysis.readabilityScore = newReadabilityScore

          console.log(`✅ [DOCUMENT PROCESSOR] Scores successfully updated:`, {
            qualityScore: contentResult.analysis.qualityScore,
            readabilityScore: contentResult.analysis.readabilityScore
          })
        } else {
          console.warn(`⚠️ [DOCUMENT PROCESSOR] No scoring result returned - keeping original scores`)
        }
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.error(`❌ [DOCUMENT PROCESSOR] Advanced scoring failed, using content analysis scores:`, {
          error: error.message,
          stack: error.stack,
          contentQualityScore: contentResult.analysis.qualityScore,
          contentReadabilityScore: contentResult.analysis.readabilityScore
        })
        // Keep the original content analysis scores if advanced scoring fails
      }

      // Step 5: Perform security analysis (70-80%)
      onProgress?.('Performing security analysis and classification', 70)
      console.log(`🔍 Starting security analysis...`)

      let securityResult: any;
      try {
        securityResult = await this.withTimeout(
          documentSecurityAnalyzer.analyzeSecurity(
            extractedText,
            documentName
          ),
          5 * 60 * 1000, // 5 minute timeout
          'Security analysis timeout',
          document.id
        )
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.error(`❌ Security analysis failed with exception:`, error)
        throw new Error(`Security analysis failed - LLM required: ${error?.message || 'Unknown error'}`)
      }

      if (!securityResult.success || !securityResult.analysis) {
        console.error(`❌ Security analysis failed - LLM analysis required:`, securityResult.error)
        throw new Error(`Security analysis failed - LLM required: ${securityResult.error || 'Unknown analysis error'}`)
      }

      console.log(`✅ Security analysis completed with result:`, {
        classification: securityResult.analysis.classification,
        confidenceScore: securityResult.analysis.confidenceScore,
        sensitiveDataDetected: securityResult.analysis.sensitiveDataDetected,
        recommendationsCount: securityResult.analysis.recommendations.length
      });

      // CRITICAL: Validate that confidence score is a valid number before proceeding
      if (typeof securityResult.analysis.confidenceScore !== 'number' ||
          isNaN(securityResult.analysis.confidenceScore) ||
          securityResult.analysis.confidenceScore < 0 ||
          securityResult.analysis.confidenceScore > 100) {
        console.error(`🚨 [DOCUMENT PROCESSOR] INVALID CONFIDENCE SCORE DETECTED:`, {
          confidenceScore: securityResult.analysis.confidenceScore,
          type: typeof securityResult.analysis.confidenceScore,
          isNaN: isNaN(securityResult.analysis.confidenceScore)
        });
        // Force a reasonable confidence score based on classification
        const fallbackConfidence = securityResult.analysis.classification === 'PUBLIC' ? 85 :
                                  securityResult.analysis.classification === 'INTERNAL' ? 75 :
                                  securityResult.analysis.classification === 'CONFIDENTIAL' ? 70 : 65;
        console.log(`🔧 [DOCUMENT PROCESSOR] Forcing confidence score to:`, fallbackConfidence);
        securityResult.analysis.confidenceScore = fallbackConfidence;
      }

      // Step 6: Perform contract analysis (80-85%)
      onProgress?.('Performing contract analysis and risk assessment', 80)
      console.log(`🔍 Starting contract analysis...`)

      const contractResult = await this.withTimeout(
        contractAnalyzer.analyzeContract(
          extractedText,
          documentName,
          metadataResult.metadata.documentType,
          organizationId
        ),
        5 * 60 * 1000, // 5 minute timeout
        'Contract analysis timeout',
        document.id
      )

      if (!contractResult.success || !contractResult.analysis) {
        console.error(`❌ Contract analysis failed - LLM analysis required:`, contractResult.error)
        throw new Error(`Contract analysis failed - LLM required: ${contractResult.error}`)
      }

      console.log(`✅ Contract analysis completed`)

      // Step 7: Create comprehensive AI data (85-90%)
      onProgress?.('Compiling comprehensive AI analysis', 85)

      console.log(`🔍 [DOCUMENT PROCESSOR] Creating comprehensive AI data with scores:`, {
        qualityScore: contentResult.analysis.qualityScore,
        readabilityScore: contentResult.analysis.readabilityScore,
        securityConfidence: securityResult.analysis.confidenceScore,
        securityClassification: securityResult.analysis.classification,
        entitiesCount: convertedEntities.length,
        sectionsCount: sectionsResult.sections.length
      });

      // FINAL VALIDATION: Log the exact security object being stored
      console.log(`🔍 [DOCUMENT PROCESSOR] Security object being stored in aiData:`, {
        classification: securityResult.analysis.classification,
        sensitiveDataDetected: securityResult.analysis.sensitiveDataDetected,
        confidenceScore: securityResult.analysis.confidenceScore,
        confidenceScoreType: typeof securityResult.analysis.confidenceScore,
        recommendationsCount: securityResult.analysis.recommendations.length
      });

      // Ensure robust keywords extraction
      let keywords = metadataResult.metadata.keywords || []

      // If keywords are empty or minimal (fallback scenario), extract from text
      if (keywords.length === 0 || (keywords.length <= 2 && keywords.includes('document'))) {
        console.log(`🔍 [DOCUMENT PROCESSOR] Keywords are minimal (${keywords.length}), extracting from text...`)
        keywords = ResponseValidators.extractKeywords(extractedText, 15)
        console.log(`✅ [DOCUMENT PROCESSOR] Extracted ${keywords.length} keywords from text: ${keywords.slice(0, 5).join(', ')}...`)
      } else {
        console.log(`✅ [DOCUMENT PROCESSOR] Using ${keywords.length} keywords from metadata analyzer`)
      }

      // Ensure robust tags extraction (SAME PATTERN AS KEYWORDS)
      let tags = metadataResult.metadata.tags || []

      // If tags are empty or minimal (fallback scenario), extract from text
      if (tags.length === 0 || (tags.length <= 1)) {
        console.log(`🔍 [DOCUMENT PROCESSOR] Tags are minimal (${tags.length}), extracting from text...`)
        tags = ResponseValidators.extractTags(extractedText, metadataResult.metadata.documentType)
        console.log(`✅ [DOCUMENT PROCESSOR] Extracted ${tags.length} tags from text: ${tags.slice(0, 3).join(', ')}...`)
      } else {
        console.log(`✅ [DOCUMENT PROCESSOR] Using ${tags.length} tags from metadata analyzer`)
      }

      const aiData: AIProcessingData = {
        status: {
          status: 'COMPLETED',
          progress: 100,
          startedAt: startTime,
          completedAt: new Date().toISOString(),
          retryCount: 0
        },
        content: {
          extractedText,
          summary: contentResult.analysis.summary,
          keywords,
          keyPoints: contentResult.analysis.keyPoints,
          actionItems: contentResult.analysis.actionItems,
          questions: contentResult.analysis.questions
        },
        structure: {
          sections: sectionsResult.sections,
          tables: fileMetadata?.tables || [],
          images: fileMetadata?.images || [],
          ocrResults: fileMetadata?.ocrResults || []
        },
        analysis: {
          qualityScore: contentResult.analysis.qualityScore,
          readabilityScore: contentResult.analysis.readabilityScore,
          complexityMetrics: {
            readabilityScore: contentResult.analysis.readabilityScore
          },
          entities: convertedEntities,
          confidence: securityResult.analysis.confidenceScore / 100, // Use security analysis confidence
          sentiment: contentResult.analysis.sentiment,
          suggestions: [
            ...contentResult.analysis.suggestions,
            ...securityResult.analysis.recommendations
          ]
        },
        security: {
          classification: securityResult.analysis.classification,
          sensitiveDataDetected: securityResult.analysis.sensitiveDataDetected,
          sensitiveDataTypes: securityResult.analysis.sensitiveDataTypes,
          securityRisks: securityResult.analysis.securityRisks,
          complianceIssues: securityResult.analysis.complianceIssues,
          recommendations: securityResult.analysis.recommendations,
          confidenceScore: securityResult.analysis.confidenceScore
        },
        contractAnalysis: {
          contractType: contractResult.analysis.contractType,
          estimatedValue: contractResult.analysis.estimatedValue,
          timeline: contractResult.analysis.timeline,
          deadlines: contractResult.analysis.timeline ? [contractResult.analysis.timeline] : [], // Convert timeline to deadlines array for UI compatibility
          requirements: contractResult.analysis.requirements,
          risks: contractResult.analysis.risks,
          opportunities: contractResult.analysis.opportunities
        },
        processedAt: new Date().toISOString(),
        modelVersion: `modular-ai-v2.1`,
        processingHistory: [
          ...existingHistory,
          {
            timestamp: startTime,
            event: 'Full AI analysis started',
            success: true
          },
          {
            timestamp: new Date().toISOString(),
            event: 'Metadata analysis completed',
            success: true,
            details: `Document type: ${metadataResult.metadata.documentType}, Classification: ${metadataResult.metadata.securityClassification}`
          },
          {
            timestamp: new Date().toISOString(),
            event: 'Section analysis completed',
            success: true,
            details: `Found ${sectionsResult.sections.length} sections`
          },
          {
            timestamp: new Date().toISOString(),
            event: 'Entity extraction completed',
            success: true,
            details: `Extracted ${convertedEntities.length} entities with proper types`
          },
          {
            timestamp: new Date().toISOString(),
            event: 'Content analysis completed',
            success: true,
            details: `Quality: ${contentResult.analysis.qualityScore}/100, Readability: ${contentResult.analysis.readabilityScore}/100`
          },
          {
            timestamp: new Date().toISOString(),
            event: 'Security analysis completed',
            success: true,
            details: `Classification: ${securityResult.analysis.classification}, Confidence: ${securityResult.analysis.confidenceScore}%`
          },
          {
            timestamp: new Date().toISOString(),
            event: 'Contract analysis completed',
            success: true,
            details: `Type: ${contractResult.analysis.contractType}, Risks: ${contractResult.analysis.risks.length}, Opportunities: ${contractResult.analysis.opportunities.length}`
          },
          {
            timestamp: new Date().toISOString(),
            event: 'Full AI analysis completed',
            success: true
          }
        ]
      }

      // Enhance metadata with security classification and processed tags/keywords
      const enhancedMetadata = {
        ...metadataResult.metadata,
        securityClassification: securityResult.analysis.classification, // Override with security analysis result
        keywords, // Use the processed keywords (with fallback)
        tags // Use the processed tags (with fallback)
      }

      // Return both aiData and enhanced metadata for storage
      return { success: true, aiData, metadata: enhancedMetadata }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('❌ [MODULAR AI] Error during modular AI processing:', error)

      // Check if it's a reference error for extractionResult
      if (error instanceof ReferenceError && error.message.includes('extractionResult')) {
        console.error('🚨 [MODULAR AI] CRITICAL: extractionResult is not defined - this should not happen!');
        console.error('🚨 [MODULAR AI] Stack trace:', error.stack);
        console.error('🚨 [MODULAR AI] Parameters received:', {
          extractedTextLength: extractedText?.length || 0,
          fileMetadataType: typeof fileMetadata,
          organizationId,
          documentName
        });
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI processing failed'
      }
    }
  }


  /**
   * Process extracted text with AI using existing prompt library and AI service
   * @deprecated Use processWithModularAI instead
   */
  private async processWithAI(
    extractedText: string,
    fileMetadata: any,
    organizationId: string,
    organizationName: string
  ): Promise<{
    success: boolean
    aiData?: AIProcessingData
    error?: string
  }> {
    try {
      const startTime = new Date().toISOString()

      // Step 1: Create executive summary using existing prompt library
      const summaryResult = await this.promptLibrary.execute('doc_executive_summary', {
        documentContent: extractedText,
        documentType: 'document',
        organizationName,
        metadata: {
          organizationId,
          taskType: 'document_processing'
        }
      })

      if (!summaryResult.success) {
        throw new Error(`Summary generation failed: ${summaryResult.error}`)
      }

      // Step 2: Extract structured data and key points
      const structuredDataResult = await this.promptLibrary.execute('doc_structured_data_extraction', {
        documentContent: extractedText,
        customVariables: {
          additionalCategories: ['sections', 'entities', 'keywords', 'action_items']
        },
        metadata: {
          organizationId,
          taskType: 'data_extraction'
        }
      })

      if (!structuredDataResult.success) {
        throw new Error(`Structured data extraction failed: ${structuredDataResult.error}`)
      }

      // Step 3: Extract key points for government contracting context
      const keyPointsResult = await this.promptLibrary.execute('doc_key_points_extraction', {
        documentContent: extractedText,
        metadata: {
          organizationId,
          taskType: 'content_analysis'
        }
      })

      if (!keyPointsResult.success) {
        throw new Error(`Key points extraction failed: ${keyPointsResult.error}`)
      }

      // Parse AI responses and create structured data
      const summary = summaryResult.response?.content || 'Document summary generation failed. Full text is preserved in document content.'
      const structuredData = this.parseStructuredDataResponse(structuredDataResult.response?.content || '')
      const keyPoints = this.parseKeyPointsResponse(keyPointsResult.response?.content || '')

      // Step 4: Create document sections from the extracted text and AI analysis
      const sections = await this.createDocumentSections(extractedText, structuredData)

      // Step 5: Extract entities using AI
      const entities = await this.extractEntitiesWithAI(extractedText, organizationId)

      const aiData: AIProcessingData = {
        status: {
          status: 'COMPLETED',
          progress: 100,
          startedAt: startTime,
          completedAt: new Date().toISOString(),
          retryCount: 0
        },
        content: {
          extractedText,
          summary,
          keywords: structuredData.keywords || [],
          keyPoints: keyPoints.points || [],
          actionItems: structuredData.actionItems || [],
          questions: structuredData.questions || []
        },
        structure: {
          sections,
          tables: fileMetadata?.tables || [],
          images: fileMetadata?.images || [],
          ocrResults: fileMetadata?.ocrResults || []
        },
        analysis: {
          qualityScore: this.calculateQualityScore(extractedText),
          readabilityScore: this.calculateReadabilityScore(extractedText),
          complexityMetrics: {
            readabilityScore: this.calculateReadabilityScore(extractedText)
          },
          entities,
          confidence: 0.65, // Lower confidence for legacy processing method
          suggestions: structuredData.suggestions || []
        },
        processedAt: new Date().toISOString(),
        modelVersion: `ai-service-manager-${this.aiService.getConfiguration()?.version || 'v1.0'}`,
        processingHistory: [
          {
            timestamp: startTime,
            event: 'Text extraction completed',
            success: true
          },
          {
            timestamp: new Date().toISOString(),
            event: 'AI processing completed',
            success: true
          }
        ]
      }

      return { success: true, aiData }

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'AI processing failed'
      }
    }
  }

  /**
   * Convert simple DocumentSection objects to complex DocumentContent.sections format
   */
  private convertSectionsToDocumentContent(sections: DocumentSection[]): DocumentContent['sections'] {
    return sections.map((section, index) => ({
      id: `section-${index + 1}`,
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
    metadata?: any
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
      eventType: 'COMPLETED' as const, // Default to completed for successful events
      success: historyItem.success || true,
      error: historyItem.success === false ? (historyItem.details || 'Processing failed') : null,
      timestamp: historyItem.timestamp,
      duration: null,
      metadata: historyItem.details ? { details: historyItem.details } : null
    })) || []

    const processingData = {
      currentStatus: aiData.status?.status || 'COMPLETED',
      progress: aiData.status?.progress || 100,
      currentStep: null,
      estimatedCompletion: null,
      events: processingEvents
    }

    console.log(`🔍 [UPDATE DOCUMENT] Converting ${aiData.processingHistory?.length || 0} processing history items to ${processingEvents.length} events`);

    await prisma.$transaction(async (tx) => {
      // Update main document with AI data split into correct JSON fields
      await tx.document.update({
        where: { id: documentId },
        data: {
          // Split aiData into correct JSON fields with proper structure
          processing: processingData,
          content: {
            extractedText: aiData.content.extractedText,
            summary: aiData.content.summary,
            keywords: aiData.content.keywords,
            keyPoints: aiData.content.keyPoints,
            actionItems: aiData.content.actionItems,
            questions: aiData.content.questions,
            // Convert sections to the expected format
            sections: convertedSections,
            tables: aiData.structure?.tables || [],
            images: aiData.structure?.images || []
          },
          analysis: aiData.analysis,
          entities: {
            entities: aiData.analysis?.entities || [],
            extractedAt: new Date().toISOString(),
            totalCount: aiData.analysis?.entities?.length || 0
          },
          embeddings: aiData.vectorProperties || {},
          // Direct fields
          extractedText,
          summary: aiData.content.summary,
          // Update metadata fields if they exist in the AI analysis
          ...(metadata?.documentType && { documentType: metadata.documentType }),
          ...(metadata?.securityClassification && { securityClassification: metadata.securityClassification }),
          ...(metadata?.setAsideType && { setAsideType: metadata.setAsideType }),
          ...(metadata?.naicsCodes && { naicsCodes: metadata.naicsCodes }),
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
    error?: string
  ): Promise<void> {
    const processingData: any = {
      status,
      startedAt: new Date(),
      completedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : null,
      error: error || null
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        processing: processingData
      }
    })
  }

  /**
   * Add timeout wrapper to prevent operations from hanging indefinitely
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string,
    documentId?: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const abortController = new AbortController();

    // Store abort controller for this document if ID provided
    if (documentId) {
      // Cancel any existing operations for this document
      const existingController = this.activeOperations.get(documentId);
      if (existingController) {
        console.log(`🚫 Cancelling existing operation for document ${documentId}`);
        existingController.abort();
      }
      this.activeOperations.set(documentId, abortController);
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        // Abort the underlying operation when timeout occurs
        abortController.abort();
        reject(new Error(errorMessage));
      }, timeoutMs);
    });

    try {
      // Pass abort signal to the promise if it's a function that accepts it
      const result = await Promise.race([promise, timeoutPromise]);

      // Clear timeout when promise resolves successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Clean up abort controller
      if (documentId) {
        this.activeOperations.delete(documentId);
      }

      return result;
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      // Clear timeout on error as well
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Clean up abort controller
      if (documentId) {
        this.activeOperations.delete(documentId);
      }

      // Abort any ongoing operations when error occurs
      if (!abortController.signal.aborted) {
        abortController.abort();
      }

      throw error;
    }
  }

  /**
   * Cancel all ongoing operations for a document
   */
  public cancelDocumentOperations(documentId: string): void {
    const controller = this.activeOperations.get(documentId);
    if (controller) {
      console.log(`🚫 Cancelling all operations for document ${documentId}`);
      controller.abort();
      this.activeOperations.delete(documentId);
      console.log(`✅ Cancelled and removed operations for document ${documentId}`);
    } else {
      console.log(`⚠️ No active operations found for document ${documentId}`);
    }

    // Also try to cancel any Inngest jobs if they exist
    try {
      // Force mark document as cancelled in database to prevent any lingering operations
      console.log(`🔄 Marking document ${documentId} as cancelled in database...`);
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn(`⚠️ Failed to mark document ${documentId} as cancelled:`, error);
    }
  }

  /**
   * Update document processing progress in database
   */
  private async updateDocumentProgress(
    documentId: string,
    step: string,
    progress: number
  ): Promise<void> {
    try {
      // Get current document to preserve existing data from JSON fields
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          processing: true,
          content: true,
          analysis: true,
          entities: true,
          embeddings: true
        }
      })

      // Reconstruct aiData structure from existing JSON fields for compatibility
      const currentAiData = {
        status: document?.processing || {},
        content: document?.content || {},
        analysis: document?.analysis || {},
        entities: document?.entities || {},
        vectorProperties: document?.embeddings || {},
        processingHistory: (document?.processing as any)?.history || []
      }

      // Update progress in aiData.status
      const updatedAiData = {
        ...currentAiData,
        status: {
          ...(currentAiData.status || {}),
          status: 'PROCESSING' as const,
          progress,
          currentStep: step,
          startedAt: currentAiData.status?.startedAt || new Date().toISOString(),
          retryCount: currentAiData.status?.retryCount || 0
        }
      }

      await prisma.document.update({
        where: { id: documentId },
        data: {
          // Split aiData into correct JSON fields
          processing: {
            status: 'PROCESSING',
            startedAt: new Date(),
            completedAt: null,
            error: null,
            // Include existing processing history
            history: updatedAiData.processingHistory || []
          },
          // Update other fields if they exist in updatedAiData
          ...(updatedAiData.content && { content: updatedAiData.content }),
          ...(updatedAiData.analysis && { analysis: updatedAiData.analysis }),
          ...(updatedAiData.entities && { entities: updatedAiData.entities }),
          ...(updatedAiData.vectorProperties && { embeddings: updatedAiData.vectorProperties })
        }
      })
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn(`Failed to update progress for document ${documentId}:`, error)
      // Don't throw error to avoid breaking the main processing flow
    }
  }

  /**
   * Parse structured data response from AI
   */
  private parseStructuredDataResponse(response: string): {
    keywords: string[]
    actionItems: string[]
    questions: string[]
    suggestions: string[]
    sections: any[]
    entities: any[]
  } {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response)
      return {
        keywords: parsed.keywords || [],
        actionItems: parsed.actionItems || parsed.action_items || [],
        questions: parsed.questions || [],
        suggestions: parsed.suggestions || [],
        sections: parsed.sections || [],
        entities: parsed.entities || []
      }
    } catch {
      // Fallback to text parsing
      return {
        keywords: this.extractListFromText(response, 'keyword'),
        actionItems: this.extractListFromText(response, 'action'),
        questions: this.extractListFromText(response, 'question'),
        suggestions: this.extractListFromText(response, 'suggestion'),
        sections: [],
        entities: []
      }
    }
  }

  /**
   * Parse key points response from AI
   */
  private parseKeyPointsResponse(response: string): {
    points: string[]
  } {
    try {
      const parsed = JSON.parse(response)
      return {
        points: parsed.keyPoints || parsed.key_points || parsed.points || []
      }
    } catch {
      // Fallback to text parsing - look for bullet points or numbered lists
      const lines = response.split('\n')
      const points = lines
        .filter(line => line.match(/^[\s]*[-*•]\s+|^\d+\.\s+/))
        .map(line => line.replace(/^[\s]*[-*•]\s+|^\d+\.\s+/, '').trim())
        .filter(point => point.length > 0)

      return { points }
    }
  }

  /**
   * Extract list items from text response
   */
  private extractListFromText(text: string, type: string): string[] {
    const lines = text.toLowerCase().split('\n')
    const items: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes(type)) {
        // Look for items in the next few lines
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const itemLine = lines[j].trim()
          if (itemLine.match(/^[\s]*[-*•]\s+|^\d+\.\s+/)) {
            items.push(itemLine.replace(/^[\s]*[-*•]\s+|^\d+\.\s+/, '').trim())
          } else if (itemLine.length === 0) {
            break // End of list
          }
        }
        break
      }
    }

    return items
  }

  /**
   * Create document sections using AI analysis
   */
  private async createDocumentSections(extractedText: string, structuredData: any): Promise<DocumentSection[]> {
    // If AI provided sections, use those
    if (structuredData.sections && structuredData.sections.length > 0) {
      return structuredData.sections.map((section: any, index: number) => ({
        title: section.title || section.heading || `Section ${index + 1}`,
        content: section.content || section.text || '',
        pageNumber: section.pageNumber || section.page || 1
      }))
    }

    // Fallback: Create sections based on text structure
    return this.createFallbackSections(extractedText)
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

  /**
   * Extract entities using AI service
   */
  private async extractEntitiesWithAI(text: string, organizationId: string): Promise<ExtractedEntity[]> {
    try {
      // Generate dynamic entity types for AI prompt
      const entityTypesEnum = (Object.values(EntityType) as string[]).map(t => t.toLowerCase()).join('|')

      // Use AI service for entity extraction
      const result = await this.aiService.generateCompletion({
        model: 'openai/gpt-4o-mini', // Use OpenRouter with cost-effective model
        messages: [
          {
            role: 'system',
            content: `You are an expert entity extraction system. Extract entities from the document text and return them as JSON.

Extract the following entity types:
- person: Names of people
- organization: Company names, government agencies
- location: Places, addresses, cities, states
- date: Dates and deadlines
- money: Financial amounts, costs, budgets
- email: Email addresses
- phone: Phone numbers
- address: Physical addresses
- contract_number: Contract identifiers
- naics_code: NAICS industry codes
- certification: Certifications and qualifications
- deadline: Deadlines and time constraints
- requirement: Requirements and specifications
- misc: Other important terms

Return JSON format:
{
  "entities": [
    {
      "text": "entity text",
      "type": "${entityTypesEnum}",
      "confidence": 0.85,
      "context": "surrounding text for context"
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Extract entities from this document:\n\n${text.length > 8000 ? text.substring(0, 8000) + '\n\n[Note: This is a portion of a larger document. Full text is preserved in the database.]' : text}`
          }
        ],
        maxTokens: 1000,
        temperature: 0.1,
        metadata: {
          organizationId,
          taskType: 'entity_extraction',
          provider: 'openrouter'
        }
      })

      if (result.content) {
        const parsed = JSON.parse(result.content)
        return parsed.entities?.map((entity: any, index: number) => ({
          text: entity.text,
          type: entity.type,
          confidence: entity.confidence || 0.75, // Use AI-provided confidence or reasonable default
          startOffset: 0, // Would need more sophisticated parsing to find exact positions
          endOffset: entity.text.length
        })) || []
      }
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('AI entity extraction failed, using fallback:', error)
    }

    // Fallback to regex-based extraction
    return this.extractEntitiesFallback(text)
  }

  /**
   * Fallback entity extraction using regex
   */
  private extractEntitiesFallback(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = []

    // Date patterns
    const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g
    let match
    while ((match = dateRegex.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: 'date',
        confidence: 0.85, // High confidence for regex-matched dates
        startOffset: match.index,
        endOffset: match.index + match[0].length
      })
    }

    // Money patterns
    const moneyRegex = /\$[\d,]+\.?\d*/g
    while ((match = moneyRegex.exec(text)) !== null) {
      entities.push({
        text: match[0],
        type: 'money',
        confidence: 0.9, // Very high confidence for $ patterns
        startOffset: match.index,
        endOffset: match.index + match[0].length
      })
    }

    return entities
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

  private generateSuggestions(text: string): string[] {
    const suggestions: string[] = []

    if (text.length < 100) {
      suggestions.push('Document appears to be very short. Consider adding more content.')
    }

    if (!text.includes('\n')) {
      suggestions.push('Consider breaking the text into paragraphs for better readability.')
    }

    const words = text.split(/\s+/)
    if (words.length > 2000) {
      suggestions.push('Document is quite long. Consider adding section headings for better navigation.')
    }

    return suggestions
  }

  /**
   * Extract text only from document - for basic processing endpoint
   */
  async extractTextOnly(documentId: string): Promise<{
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
      if (document.extractedText && document.extractedText.trim().length > 0) {
        console.log(`✅ [TEXT ONLY] Document already has extracted text (${document.extractedText.length} chars)`)
        return {
          success: true,
          extractedText: document.extractedText
        }
      }

      // Extract text from file
      if (!document.filePath) {
        return { success: false, error: 'No file attached to document' }
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
  async parseStructureOnly(documentId: string): Promise<{
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
      let documentText = document.extractedText
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
        document.organizationId
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

  /**
   * Update document with comprehensive AI data including contract analysis and metadata
   */
  private async updateDocumentWithFullAIData(
    documentId: string,
    aiData: AIProcessingData,
    extractedText: string,
    metadata?: any
  ): Promise<void> {
    console.log(`🔍 [UPDATE DOCUMENT FULL] Storing comprehensive AI data for ${documentId}:`, {
      hasMetadata: !!metadata,
      hasTags: !!metadata?.tags,
      hasContractAnalysis: !!aiData.contractAnalysis,
      contractType: aiData.contractAnalysis?.contractType,
      tagsCount: metadata?.tags?.length || 0,
      sectionsCount: aiData.structure?.sections?.length || 0
    });

    // CRITICAL DEBUG: Log the exact tags being saved to database
    console.log(`🔍 [TAGS DEBUG] About to save tags to database:`, {
      tagsValue: metadata?.tags,
      tagsArray: JSON.stringify(metadata?.tags),
      tagsType: typeof metadata?.tags,
      isArray: Array.isArray(metadata?.tags),
      naicsValue: metadata?.naicsCodes,
      contractTimeline: aiData.contractAnalysis?.timeline,
      contractEstimatedValue: aiData.contractAnalysis?.estimatedValue // Both stored in analysis JSON
    });

    // Convert simple sections to the complex DocumentContent format
    const convertedSections = aiData.structure?.sections ?
      this.convertSectionsToDocumentContent(aiData.structure.sections) : []

    // Convert processing history to the expected DocumentProcessing format
    const processingEvents = aiData.processingHistory?.map((historyItem, index) => ({
      id: `event-${Date.now()}-${index}`,
      userId: null,
      event: historyItem.event,
      eventType: 'COMPLETED' as const,
      success: historyItem.success || true,
      error: historyItem.success === false ? (historyItem.details || 'Processing failed') : null,
      timestamp: historyItem.timestamp,
      duration: null,
      metadata: historyItem.details ? { details: historyItem.details } : null
    })) || []

    const processingData = {
      currentStatus: aiData.status?.status || 'COMPLETED',
      progress: aiData.status?.progress || 100,
      currentStep: null,
      estimatedCompletion: null,
      events: processingEvents
    }

    // Create comprehensive analysis object that includes contract analysis
    const analysisData = {
      ...aiData.analysis,
      // CRITICAL: Add contract analysis to the analysis JSON field
      contractAnalysis: aiData.contractAnalysis ? {
        contractType: aiData.contractAnalysis.contractType,
        estimatedValue: aiData.contractAnalysis.estimatedValue,
        timeline: aiData.contractAnalysis.timeline,
        requirements: aiData.contractAnalysis.requirements,
        risks: aiData.contractAnalysis.risks,
        opportunities: aiData.contractAnalysis.opportunities,
        analyzedAt: new Date().toISOString()
      } : undefined,
      // Add security analysis if available
      securityAnalysis: aiData.security ? {
        classification: aiData.security.classification,
        sensitiveDataDetected: aiData.security.sensitiveDataDetected,
        sensitiveDataTypes: aiData.security.sensitiveDataTypes,
        securityRisks: aiData.security.securityRisks,
        complianceIssues: aiData.security.complianceIssues,
        recommendations: aiData.security.recommendations,
        confidenceScore: aiData.security.confidenceScore,
        analyzedAt: new Date().toISOString()
      } : undefined
    }

    await prisma.$transaction(async (tx) => {
      // Update main document with comprehensive AI data
      await tx.document.update({
        where: { id: documentId },
        data: {
          // Processing status
          processing: processingData,

          // Core content
          extractedText,
          summary: aiData.content.summary,

          // Document classification and metadata from AI analysis
          documentType: metadata?.documentType || 'OTHER',
          securityClassification: metadata?.securityClassification || 'PUBLIC',
          setAsideType: metadata?.setAsideType || null,
          description: metadata?.description || aiData.content.summary || null,

          // CRITICAL: Tags and NAICS codes from metadata analysis + extracted data for UI accessibility
          tags: metadata?.tags || [],
          naicsCodes: metadata?.naicsCodes || [],

          // Contract fields for easier UI access (in addition to analysis.contractAnalysis)
          // Note: deadline and estimatedValue fields removed - not in Prisma schema
          // Timeline stored in analysis.contractAnalysis.timeline
          // EstimatedValue stored in analysis.contractAnalysis.estimatedValue

          // Structured content
          content: {
            extractedText: aiData.content.extractedText,
            summary: aiData.content.summary,
            keywords: aiData.content.keywords || metadata?.keywords || [],
            keyPoints: aiData.content.keyPoints,
            actionItems: aiData.content.actionItems,
            questions: aiData.content.questions,
            sections: convertedSections,
            tables: aiData.structure?.tables || [],
            images: aiData.structure?.images || []
          },

          // CRITICAL: Analysis results including contract analysis
          analysis: analysisData,

          // Entity extraction results
          entities: {
            entities: aiData.analysis?.entities || [],
            extractedAt: new Date().toISOString(),
            totalCount: aiData.analysis?.entities?.length || 0
          },

          // Vector properties
          embeddings: aiData.vectorProperties || {}
        }
      })

      console.log(`✅ [UPDATE DOCUMENT FULL] Successfully stored comprehensive AI data:`, {
        sectionsCount: convertedSections.length,
        eventsCount: processingEvents.length,
        tagsCount: metadata?.tags?.length || 0,
        hasContractAnalysis: !!aiData.contractAnalysis,
        contractType: aiData.contractAnalysis?.contractType,
        entitiesCount: aiData.analysis?.entities?.length || 0,
        hasSecurityAnalysis: !!aiData.security
      });
    })
  }

  /**
   * Create basic AI data when comprehensive analysis fails
   */
  private async createBasicAIData(extractedText: string, metadata: any): Promise<AIProcessingData> {
    const qualityScore = this.calculateQualityScore(extractedText)
    const readabilityScore = this.calculateReadabilityScore(extractedText)
    const keywords = ResponseValidators.extractKeywords(extractedText, 10)

    return {
      status: {
        status: 'COMPLETED',
        progress: 100,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        retryCount: 0
      },
      content: {
        extractedText,
        summary: 'Basic analysis completed - full AI analysis unavailable',
        keywords,
        keyPoints: ['Document processed with basic analysis'],
        actionItems: ['Consider re-running with full AI analysis'],
        questions: []
      },
      structure: {
        sections: [{
          title: 'Document Content',
          content: extractedText,
          pageNumber: 1
        }],
        tables: metadata?.tables || [],
        images: metadata?.images || [],
        ocrResults: metadata?.ocrResults || []
      },
      analysis: {
        qualityScore,
        readabilityScore,
        complexityMetrics: { readabilityScore },
        entities: [],
        confidence: 0.5,
        suggestions: ['Consider re-running with full AI analysis']
      },
      processedAt: new Date().toISOString(),
      modelVersion: 'basic-fallback-v1.0',
      processingHistory: [{
        timestamp: new Date().toISOString(),
        event: 'Basic fallback analysis completed',
        success: true
      }]
    }
  }

}

// Export singleton instance
export const documentProcessor = new DocumentProcessor()
