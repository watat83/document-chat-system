/**
 * Document Embedding Processor
 * 
 * Orchestrates the complete embedding pipeline for documents:
 * chunking, embedding generation, and vector storage.
 */

import { Document, DocumentEmbeddings } from '@/types/documents'
import { DocumentChunker } from './document-chunker'
import { EmbeddingService } from './embedding-service'
import { prisma } from '@/lib/prisma'

export interface ProcessingOptions {
  forceReprocess?: boolean // Reprocess even if embeddings exist
  chunkSize?: number
  overlap?: number
  progressCallback?: (step: string, progress: number, chunksProcessed?: number, totalChunks?: number) => Promise<void>
}

export interface ProcessingResult {
  success: boolean
  embeddings?: DocumentEmbeddings
  error?: string
  processingTimeMs: number
  stats: {
    chunksCreated: number
    tokensProcessed: number
    costEstimate: number
  }
}

export class DocumentEmbeddingProcessor {
  private chunker: DocumentChunker
  private embeddingService: EmbeddingService
  
  constructor() {
    this.chunker = new DocumentChunker()
    this.embeddingService = new EmbeddingService()
  }
  
  /**
   * Process a document to generate embeddings
   */
  async processDocument(
    document: Document,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    console.log(`🔍 Processing document:`, {
      id: document.id,
      name: document.name,
      documentType: document.documentType,
      tags: document.tags,
      naicsCodes: document.naicsCodes,
      organizationId: document.organizationId,
      extractedTextLength: document.extractedText?.length || 0,
      contentSectionsCount: document.content?.sections?.length || 0,
      hasEmbeddings: !!document.embeddings
    })
    console.log(`⚙️ Processing options:`, options)
    
    const startTime = Date.now()
    
    try {
      // Check if embeddings already exist
      if (!options.forceReprocess && document.embeddings) {
        const embeddings = document.embeddings as DocumentEmbeddings
        console.log(`🔍 Existing embeddings found:`, embeddings)
        if (!(embeddings as any).partialFailure && embeddings.chunks && embeddings.chunks.length === embeddings.totalChunks) {
          console.log(`⏭️ Skipping processing - ${embeddings.chunks.length} embeddings already exist (use forceReprocess=true to regenerate)`)
          return {
            success: true,
            embeddings,
            processingTimeMs: 0,
            stats: {
              chunksCreated: embeddings.chunks.length,
              tokensProcessed: 0,
              costEstimate: 0
            }
          }
        }
      }
      
      // Extract text content
      const textContent = this.extractTextContent(document)
      console.log(`📝 Extracted text content (${textContent.length} chars):`, textContent.substring(0, 500) + (textContent.length > 500 ? '...' : ''))
      if (!textContent || textContent.trim().length === 0) {
        throw new Error('No text content to process')
      }
      
      // Configure chunker if custom settings provided
      if (options.chunkSize || options.overlap) {
        this.chunker = new DocumentChunker({
          chunkSize: options.chunkSize,
          overlap: options.overlap
        })
      }
      
      // Progress callback for chunking
      if (options.progressCallback) {
        await options.progressCallback('Analyzing document structure...', 10)
      }
      
      // Chunk the document
      console.log(`📄 Chunking document ${document.id}...`)
      const chunkingResult = await this.chunker.chunkDocument(
        textContent,
        document.id
      )
      console.log(`✅ Chunking completed! Generated ${chunkingResult.chunks.length} chunks, ${chunkingResult.totalTokens} tokens`)
      
      // Progress callback after chunking
      if (options.progressCallback) {
        await options.progressCallback('Document chunked, generating embeddings...', 30, 0, chunkingResult.chunks.length)
      }
      
      // Generate and store embeddings with progress tracking
      console.log(`🧮 Generating embeddings for ${chunkingResult.chunks.length} chunks...`)
      const embeddings = await this.embeddingService.generateAndStoreEmbeddings(
        chunkingResult.chunks,
        document,
        options.progressCallback
      )
      
      // Progress callback for storing embeddings
      if (options.progressCallback) {
        await options.progressCallback('Storing embeddings in database...', 95)
      }
      
      // Update document with embedding references
      await this.updateDocumentEmbeddings(document.id, embeddings)
      
      // Calculate cost estimate
      const costEstimate = this.calculateCost(chunkingResult.totalTokens)
      
      // Final progress callback
      if (options.progressCallback) {
        await options.progressCallback('Vectorization completed successfully', 100)
      }
      
      console.log(`✅ Embedding processing complete for document ${document.id}`)
      
      return {
        success: true,
        embeddings,
        processingTimeMs: Date.now() - startTime,
        stats: {
          chunksCreated: chunkingResult.chunks.length,
          tokensProcessed: chunkingResult.totalTokens,
          costEstimate
        }
      }
    } catch (error) {
      console.error(`❌ Embedding processing failed for document ${document.id}:`, error)
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
        stats: {
          chunksCreated: 0,
          tokensProcessed: 0,
          costEstimate: 0
        }
      }
    }
  }
  
  /**
   * Process multiple documents in batch
   */
  async processBatch(
    documents: Document[],
    options: ProcessingOptions = {}
  ): Promise<Map<string, ProcessingResult>> {
    const results = new Map<string, ProcessingResult>()
    
    // Process documents sequentially to avoid rate limits
    for (const document of documents) {
      const result = await this.processDocument(document, options)
      results.set(document.id, result)
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return results
  }
  
  /**
   * Extract text content from document
   */
  private extractTextContent(document: Document): string {
    const parts: string[] = []
    
    // Add main extracted text
    if (document.extractedText) {
      console.log(`📄 Using document.extractedText (${document.extractedText.length} chars)`)
      parts.push(document.extractedText)
    } else {
      console.log(`⚠️ No document.extractedText found, trying content.sections...`)
    }
    
    // Add section content if available
    if (document.content?.sections) {
      document.content.sections.forEach(section => {
        if (section.title) parts.push(section.title)
        if (section.content) parts.push(section.content)
      })
    }
    
    // Add summary if available
    if (document.summary) {
      console.log(`📋 Adding document summary (${document.summary.length} chars)`)
      parts.push(`Summary: ${document.summary}`)
    }
    
    const finalText = parts.join('\n\n')
    console.log(`📝 Final extracted text: ${finalText.length} chars total from ${parts.length} parts`)
    
    return finalText
  }
  
  
  /**
   * Update document with embedding references
   */
  private async updateDocumentEmbeddings(
    documentId: string,
    embeddings: DocumentEmbeddings
  ): Promise<void> {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        embeddings: embeddings as any,
        updatedAt: new Date()
      }
    })
  }
  
  /**
   * Calculate processing cost estimate
   */
  private calculateCost(totalTokens: number): number {
    // OpenAI text-embedding-3-small pricing: $0.02 per 1M tokens
    const costPerMillion = 0.02
    return (totalTokens / 1_000_000) * costPerMillion
  }
  
  /**
   * Delete embeddings for a document
   */
  async deleteDocumentEmbeddings(document: Document): Promise<void> {
    // Delete from Pinecone
    await this.embeddingService.deleteDocumentEmbeddings(
      document.id,
      document.organizationId
    )
    
    // Clear from database
    await prisma.document.update({
      where: { id: document.id },
      data: {
        embeddings: {},
        updatedAt: new Date()
      }
    })
  }
}

// Default processor instance
export const defaultEmbeddingProcessor = new DocumentEmbeddingProcessor()