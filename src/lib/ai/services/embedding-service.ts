import { randomUUID } from 'node:crypto';
import type { EmbeddingDocument } from './embedding-document';
import { jsonObject } from '@/lib/documents/processing-state';
import { getPinecone } from './pinecone-client'
/**
 * Embedding Service
 *
 * Generates and manages vector embeddings for document chunks
 * using OpenAI and stores them in Pinecone for semantic search.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { DocumentEmbeddings } from '@/types/documents'
import { AIServiceManager } from '@/lib/ai/ai-service-manager'
import { DocumentChunk } from './document-chunker'
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

    if (!Number.isInteger(this.config.batchSize) || this.config.batchSize < 1 || !Number.isInteger(this.config.dimensions) || this.config.dimensions < 1) {
      throw new Error('Embedding batch size and dimensions must be positive integers');
    }

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
    document: EmbeddingDocument,
    progressCallback?: (step: string, progress: number, chunksProcessed?: number, totalChunks?: number) => Promise<void>
  ): Promise<DocumentEmbeddings> {
    console.log(
      `🚀 Starting embedding generation for ${chunks.length} chunks...`
    )
    if (!chunks.length) throw new Error('Cannot index an empty document');
    const startTime = Date.now()

    const generationId = randomUUID();
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
        const batch = chunks.slice(i, i + this.config.batchSize)
        try {
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
        const embeddings = await this.generateBatchEmbeddings(batch.map(chunk => chunk.content), document.organizationId);
        if (embeddings.length !== batch.length || embeddings.some(vector => !Array.isArray(vector) || vector.length !== this.config.dimensions || vector.some(value => !Number.isFinite(value)))) {
          throw new Error('Embedding response count, dimensions or values do not match the document chunks');
        }
        console.log(`✅ Generated ${embeddings.length} embeddings for batch`)

        // Prepare dense vectors for Pinecone
        const vectors = batch.map((chunk, idx) => ({
          id: `${document.organizationId}_${chunk.id}_${generationId}`, // Prefix with org for isolation
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
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let upsertResponse: unknown;
        try {
          upsertResponse = await Promise.race([
            namespacedIndex.upsert(vectors),
            new Promise<never>((_, reject) => { timeoutId = setTimeout(() => reject(new Error('Pinecone upsert timeout after 30s')), 30000); }),
          ]);
        } finally { if (timeoutId) clearTimeout(timeoutId); }
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
            content: chunk.content,
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
          console.warn(`⚠️ Continuing with remaining batches. Failed batch ${batchNumber} requires a new processing run.`)
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

        // Never report an incomplete index as successful
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
      }
    } catch (error) {
      console.error('❌ Embedding generation failed:', error)
      throw error
    }
  }

  /** Keep one vector per complete chunk; oversized chunks must be split by the chunker. */
  private async generateBatchEmbeddings(texts: string[], organizationId: string): Promise<number[][]> {
    if (texts.some(text => !text.trim() || Math.ceil(text.length / 4) > 7500)) {
      throw new Error('Document contains empty or oversized embedding chunks; rechunk before indexing');
    }
    const result = await this.aiManager.generateEmbedding({
      model: this.config.model,
      text: texts,
      dimensions: this.config.dimensions,
      metadata: { organizationId, taskType: 'embedding' },
    });
    if (!Array.isArray(result.embedding) || !Array.isArray(result.embedding[0])) throw new Error('Expected a batch of embeddings');
    return result.embedding as number[][];
  }

  /**
   * Create Pinecone metadata for a chunk
   */
  private createPineconeMetadata(
    chunk: DocumentChunk,
    document: EmbeddingDocument,
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
      naicsCodes: (() => { const entities = jsonObject(document.entities).entities; return Array.isArray(entities) ? entities.map(jsonObject).filter(entity => entity.type === 'NAICS_CODE' && typeof entity.text === 'string').map(entity => entity.text as string) : []; })(),
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
