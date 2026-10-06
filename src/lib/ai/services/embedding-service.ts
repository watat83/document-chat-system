import { getPinecone } from './pinecone-client'
/**
 * Embedding Service
 *
 * Generates and manages vector embeddings for document chunks
 * using OpenAI and stores them in Pinecone for semantic search.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { Document, DocumentEmbeddings } from '@/types/documents'
import { AIServiceManager } from '@/lib/ai/ai-service-manager'
import { DocumentChunk } from './document-chunker'
import { CostOptimizationService } from './cost-optimization'
import { prisma } from '@/lib/prisma'
import { PineconeNamespaceManager, defaultNamespaceManager } from './pinecone-namespace-manager'

export interface EmbeddingConfig {
  model: 'text-embedding-3-small' | 'text-embedding-3-large' // OpenAI embedding models
  dimensions: number // 1536 for small, 3072 for large
  batchSize: number
}

export interface PineconeMetadata {
  documentId: string
  organizationId: string
  organizationNamespace: string // Business name or unique organization identifier
  chunkIndex: number
  chunkText: string // First 200 chars for preview
  documentTitle: string
  documentType: string
  tags: string[]
  naicsCodes: string[]
  keywords: string[]
  createdAt: string
  [key: string]: any // Index signature for Pinecone compatibility
}

export class EmbeddingService {
  private get pinecone(): Pinecone { return getPinecone() }
  private aiManager: AIServiceManager
  private namespaceManager: PineconeNamespaceManager
  private config: EmbeddingConfig

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = {
      model: 'text-embedding-3-small',
      dimensions: 1536, // OpenAI text-embedding-3-small dimension
      batchSize: 100,
      ...config,
    }

    // Initialize Pinecone


    // Get AI service manager instance
    this.aiManager = AIServiceManager.getInstance()
    
    // Initialize namespace manager
    this.namespaceManager = defaultNamespaceManager
  }

  /**
   * Generate embeddings for document chunks and store in Pinecone
   */
  async generateAndStoreEmbeddings(
    chunks: DocumentChunk[],
    document: Document,
    progressCallback?: (step: string, progress: number, chunksProcessed?: number, totalChunks?: number) => Promise<void>
  ): Promise<DocumentEmbeddings> {
    console.log(
      `🚀 Starting embedding generation for ${chunks.length} chunks...`
    )
    const startTime = Date.now()

    try {
      // Get or create organization namespace
      console.log(
        `🔍 Getting namespace for organization ${document.organizationId}...`
      )
      const namespaceInfo = await this.namespaceManager.getOrCreateNamespace(document.organizationId)
      const organizationNamespace = namespaceInfo.namespace
      
      console.log(`📋 Using organization namespace: "${organizationNamespace}"${namespaceInfo.created ? ' (newly created)' : ' (existing)'}`)

      // Get Pinecone index with namespace
      console.log(
        `📡 Connecting to Pinecone index: ${process.env.PINECONE_INDEX_NAME}`
      )
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
      const namespacedIndex = index.namespace(organizationNamespace)
      
      console.log(
        `🗂️ Using organization-specific namespace: ${organizationNamespace}`
      )

      // Check namespace stats
      console.log(`🔍 Checking namespace configuration...`)
      try {
        const stats = await this.namespaceManager.getNamespaceStats(organizationNamespace)
        console.log(`📊 Namespace stats:`, {
          namespace: organizationNamespace,
          vectorCount: stats.vectorCount,
          indexFullness: stats.indexFullness,
        })
      } catch (error) {
        console.log(`⚠️ Could not check namespace stats:`, error)
      }

      // Process chunks in batches
      const embeddingChunks: DocumentEmbeddings['chunks'] = []
      let failedBatches = 0
      const failedChunkIds: string[] = []

      console.log(
        `📦 Processing ${chunks.length} chunks in batches of ${this.config.batchSize}...`
      )

      for (let i = 0; i < chunks.length; i += this.config.batchSize) {
        try {
          const batch = chunks.slice(i, i + this.config.batchSize)
          const batchNumber = Math.floor(i / this.config.batchSize) + 1
          const totalBatches = Math.ceil(chunks.length / this.config.batchSize)
          
          console.log(
            `🔄 Processing batch ${batchNumber}/${totalBatches} (chunks ${i + 1}-${Math.min(i + this.config.batchSize, chunks.length)})`
          )

          // Progress callback for current batch
          if (progressCallback) {
            const progress = Math.round((i / chunks.length) * 70) + 30 // 30-100% progress range
            await progressCallback(
              `Processing batch ${batchNumber}/${totalBatches}...`,
              progress,
              i,
              chunks.length
            )
          }

        // Generate embeddings for batch with timeout
        console.log(`🧮 Generating embeddings for batch...`)
        const embeddings = await Promise.race([
          this.generateBatchEmbeddings(batch.map((chunk) => chunk.content)),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Embedding generation timeout after 60s')), 60000)
          )
        ]) as number[][]
        console.log(`✅ Generated ${embeddings.length} embeddings for batch`)

        // Prepare dense vectors for Pinecone
        const vectors = batch.map((chunk, idx) => ({
          id: `${document.organizationId}_${chunk.id}`, // Prefix with org for isolation
          values: embeddings[idx], // Use values for dense vectors
          metadata: this.createPineconeMetadata(
            chunk,
            document,
            organizationNamespace
          ),
        }))

        // Validate that we have the expected number of vectors
        if (vectors.length !== batch.length) {
          throw new Error(
            `Vector count mismatch: expected ${batch.length}, got ${vectors.length}`
          )
        }

        // Upsert to Pinecone namespace with timeout protection
        console.log(
          `📡 Upserting ${vectors.length} vectors to Pinecone namespace: ${organizationNamespace}...`
        )
        const upsertResponse = await Promise.race([
          namespacedIndex.upsert(vectors),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Pinecone upsert timeout after 30s')), 30000)
          )
        ])
        console.log(
          `✅ Successfully upserted vectors to Pinecone:`,
          upsertResponse
        )

        // Store references in our format with validation
        batch.forEach((chunk, idx) => {
          if (!vectors[idx]) {
            throw new Error(`Missing vector for chunk ${idx}: ${chunk.id}`)
          }

          embeddingChunks.push({
            id: chunk.id,
            chunkIndex: chunk.chunkIndex,
            vectorId: vectors[idx].id,
            content: chunk.content, // Store full chunk content in database
            startChar: chunk.startChar,
            endChar: chunk.endChar,
            keywords: chunk.keywords,
          })

          console.log(
            `📋 Stored embedding reference for chunk ${chunk.chunkIndex}: ${chunk.id} -> ${vectors[idx].id}`
          )
        })
        } catch (batchError) {
          const batchNumber = Math.floor(i / this.config.batchSize) + 1
          const errorMessage = batchError instanceof Error ? batchError.message : 'Unknown error'

          console.error(`❌ Batch ${batchNumber} processing failed:`, batchError)

          // Track failed batch for reporting
          failedBatches++
          failedChunkIds.push(...batch.map(c => c.id))

          // Send progress callback with error
          if (progressCallback) {
            await progressCallback(
              `Batch ${batchNumber} failed (${failedBatches} total failures): ${errorMessage}`,
              Math.round((i / chunks.length) * 70) + 30,
              i,
              chunks.length
            )
          }

          // Log the failure but continue processing remaining batches
          console.warn(`⚠️ Continuing with remaining batches. Failed batch ${batchNumber} will be retried later.`)
          continue; // Continue to next batch instead of throwing
        }
      }

      // Return embedding references for database storage
      const successfulChunks = embeddingChunks.length
      const totalBatches = Math.ceil(chunks.length / this.config.batchSize)
      const processingTime = Date.now() - startTime

      if (failedBatches > 0) {
        console.warn(
          `⚠️ Embedding generation completed with ${failedBatches} failed batches. ` +
          `Successfully processed ${successfulChunks}/${chunks.length} chunks in ${processingTime}ms`
        )
        console.warn(`Failed chunk IDs:`, failedChunkIds)

        // If more than 50% of batches failed, throw error
        if (failedBatches > 0) {
          throw new Error(
            `Embedding generation critically failed: ${failedBatches}/${totalBatches} batches failed. ` +
            `Only ${successfulChunks}/${chunks.length} chunks processed successfully.`
          )
        }
      } else {
        console.log(
          `✅ Embedding generation complete! Generated ${embeddingChunks.length} embeddings in ${processingTime}ms`
        )
      }

      return {
        documentId: document.id,
        documentTitle: document.name,
        organizationNamespace: organizationNamespace,
        chunks: embeddingChunks,
        model: this.config.model,
        dimensions: this.config.dimensions,
        totalChunks: chunks.length,
        lastProcessed: new Date().toISOString(),
        partialFailure: failedBatches > 0,
        failedBatches: failedBatches,
        failedChunkIds: failedChunkIds,
      }
    } catch (error) {
      console.error('❌ Embedding generation failed:', error)
      throw error
    }
  }

  /**
   * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /**
   * Split text that exceeds token limit into smaller chunks
   */
  private splitLargeText(text: string, maxTokens: number = 7000): string[] {
    const estimatedTokens = this.estimateTokenCount(text)
    
    if (estimatedTokens <= maxTokens) {
      return [text]
    }

    console.log(`📏 Text too large (${estimatedTokens} tokens), splitting into smaller chunks...`)
    
    const chunks: string[] = []
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    
    let currentChunk = ''
    
    for (const sentence of sentences) {
      const sentenceWithPunctuation = sentence.trim() + '. '
      const wouldBeTokens = this.estimateTokenCount(currentChunk + sentenceWithPunctuation)
      
      if (wouldBeTokens > maxTokens && currentChunk.length > 0) {
        // Current chunk is full, save it and start new one
        chunks.push(currentChunk.trim())
        currentChunk = sentenceWithPunctuation
      } else {
        // Add sentence to current chunk
        currentChunk += sentenceWithPunctuation
      }
    }
    
    // Add final chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim())
    }
    
    console.log(`✂️ Split text into ${chunks.length} smaller chunks`)
    return chunks
  }

  /**
   * Generate dense embeddings for a batch of texts using OpenAI (proper batching)
   */
  private async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    console.log(
      `🚀 Starting OpenAI embedding generation with ${texts.length} texts`
    )
    console.log(`🔧 Config:`, {
      model: this.config.model,
      batchSize: this.config.batchSize,
      dimensions: this.config.dimensions,
    })

    // Check if API key exists
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }

    console.log(
      `🔑 Using OpenAI API key: ${process.env.OPENAI_API_KEY.substring(0, 8)}...`
    )
    // Validate and split texts that exceed token limits
    console.log(`🔍 Validating text sizes before sending to OpenAI...`)
    const processedTexts: string[] = []
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]
      const estimatedTokens = this.estimateTokenCount(text)
      
      if (estimatedTokens > 7500) { // Leave buffer under 8192 limit
        console.log(`⚠️ Text ${i + 1} is too large (${estimatedTokens} tokens), splitting...`)
        const splitTexts = this.splitLargeText(text, 7000)
        processedTexts.push(...splitTexts)
      } else {
        processedTexts.push(text)
      }
    }

    // Final safety check - validate all processed texts are under limit
    console.log(`🛡️ Final safety check on ${processedTexts.length} processed texts...`)
    for (let i = 0; i < processedTexts.length; i++) {
      const estimatedTokens = this.estimateTokenCount(processedTexts[i])
      if (estimatedTokens > 8000) {
        console.error(`❌ SAFETY CHECK FAILED: Processed text ${i} still has ${estimatedTokens} tokens (over 8000 limit)`)
        console.error(`Text preview: ${processedTexts[i].substring(0, 200)}...`)
        throw new Error(`Text chunk ${i} exceeds token limit after processing: ${estimatedTokens} tokens`)
      }
    }
    console.log(`✅ All ${processedTexts.length} texts passed safety validation`)

    if (processedTexts.length !== texts.length) {
      console.log(`📝 Text processing: ${texts.length} original texts became ${processedTexts.length} processed texts`)
    }

    console.log(`🎯 Calling OpenAI API with model: ${this.config.model}`)
    console.log(`📤 Sending ${processedTexts.length} texts in single batch request`)

    // Add timeout and better error handling
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout for batch

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: processedTexts, // Send processed texts (may be split)
          model: this.config.model,
          encoding_format: 'float',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      console.log(`📡 OpenAI API responded with status: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `❌ OpenAI API error: ${response.status} ${response.statusText}`,
          errorText
        )

        // Parse error response to check for quota issues
        let errorMessage = `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error?.code === 'insufficient_quota' || response.status === 429) {
            errorMessage = '⚠️ OpenAI API Quota Exceeded. Please add credits to your OpenAI account at https://platform.openai.com/account/billing'
            console.error('💳 OpenAI quota exceeded. Visit https://platform.openai.com/account/billing to add credits.')
          }
        } catch (e) {
          // If error parsing fails, use the default error message
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log(
        `📥 OpenAI response received, parsing ${data.data?.length || 0} embeddings...`
      )

      if (
        data.data &&
        Array.isArray(data.data) &&
        data.data.length === processedTexts.length
      ) {
        const embeddings = data.data.map((item: any, index: number) => {
          if (item.embedding && Array.isArray(item.embedding)) {
            console.log(
              `✅ Generated embedding ${index + 1}/${processedTexts.length}, size: ${item.embedding.length}`
            )
            return item.embedding
          } else {
            throw new Error(`Invalid embedding structure at index ${index}`)
          }
        })

        // If texts were split, we need to handle merging embeddings back to match original text count
        if (processedTexts.length > texts.length) {
          console.log(`🔀 Merging split embeddings: ${processedTexts.length} embeddings -> ${texts.length} results`)
          
          // For now, we'll just take the first embedding for each original text
          // TODO: In the future, we could average embeddings from split chunks
          const mergedEmbeddings: number[][] = []
          let embeddingIndex = 0
          
          for (let i = 0; i < texts.length; i++) {
            const originalText = texts[i]
            const estimatedTokens = this.estimateTokenCount(originalText)
            
            if (estimatedTokens > 7500) {
              // This text was split, take the first embedding and skip the rest
              mergedEmbeddings.push(embeddings[embeddingIndex])
              const splitCount = this.splitLargeText(originalText, 7000).length
              embeddingIndex += splitCount
            } else {
              // This text wasn't split, take the next embedding
              mergedEmbeddings.push(embeddings[embeddingIndex])
              embeddingIndex++
            }
          }
          
          console.log(`🎯 Merged ${embeddings.length} embeddings into ${mergedEmbeddings.length} results`)
          return mergedEmbeddings
        }

        console.log(
          `✅ Successfully generated ${embeddings.length} embeddings in batch`
        )
        return embeddings
      } else {
        console.error(
          `❌ Invalid OpenAI response structure:`,
          JSON.stringify(data, null, 2)
        )
        throw new Error(
          `Expected ${processedTexts.length} embeddings (from ${texts.length} original texts), got ${data.data?.length || 0}`
        )
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError?.name === 'AbortError') {
        console.error(
          `❌ OpenAI API timeout after 60 seconds for batch of ${processedTexts.length} chunks (from ${texts.length} original)`
        )
        throw new Error(`OpenAI API timeout after 60 seconds`)
      }
      console.error(`❌ Fetch error for batch:`, fetchError)
      throw fetchError
    }
  }

  /**
   * Create Pinecone metadata for a chunk
   */
  private createPineconeMetadata(
    chunk: DocumentChunk,
    document: Document,
    organizationNamespace: string
  ): PineconeMetadata {
    const metadata = {
      documentId: document.id,
      organizationId: document.organizationId,
      organizationNamespace: organizationNamespace,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.content.substring(0, 200),
      documentTitle: document.name,
      documentType: document.documentType,
      tags: document.tags || [],
      naicsCodes: document.naicsCodes || [],
      keywords: chunk.keywords,
      createdAt: new Date().toISOString(),
    }

    console.log(
      `🏷️ Created metadata for chunk ${chunk.chunkIndex}:`,
      JSON.stringify(metadata, null, 2)
    )

    return metadata
  }

  /**
   * Delete embeddings for a document
   */
  async deleteDocumentEmbeddings(
    documentId: string,
    organizationId: string
  ): Promise<void> {
    console.log(
      `🗑️ Deleting embeddings for document ${documentId} in organization ${organizationId}`
    )

    // Get organization namespace
    const namespaceInfo = await this.namespaceManager.getOrCreateNamespace(organizationId)
    const organizationNamespace = namespaceInfo.namespace
    
    const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
    const namespacedIndex = index.namespace(organizationNamespace)

    await namespacedIndex.deleteMany({ documentId: { $eq: documentId }, organizationId: { $eq: organizationId } });
    if (process.env.ENABLE_PGVECTOR_FALLBACK === 'true') {
      await prisma.$executeRaw`DELETE FROM document_vectors WHERE organization_id = ${organizationId} AND document_id = ${documentId}`;
    }

  }
}

// Default embedding service instance
export const defaultEmbeddingService = new EmbeddingService()
