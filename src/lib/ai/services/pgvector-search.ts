/**
 * PostgreSQL pgvector Search Service
 *
 * Provides fallback vector search capabilities using PostgreSQL's pgvector extension
 * when Pinecone is unavailable. Implements the same interface as VectorSearchService.
 */

import { prisma } from '@/lib/prisma'
import { AIServiceManager } from '@/lib/ai/ai-service-manager'
import { SearchFilters, SearchResult, SearchOptions } from './vector-search'
import { DocumentChunk } from './document-chunker'
import { Document, DocumentEmbeddings } from '@/types/documents'

export interface PgVectorMetadata {
  documentId: string
  organizationId: string
  organizationNamespace: string
  chunkIndex: number
  chunkText: string // Preview text
  documentTitle: string
  documentType: string
  tags: string[]
  naicsCodes: string[]
  keywords: string[]
  createdAt: string
}

export class PgVectorSearchService {
  private aiManager: AIServiceManager

  constructor() {
    this.aiManager = AIServiceManager.getInstance()
  }

  /**
   * Search for similar document chunks using pgvector
   */
  async searchSimilar(
    query: string,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (filters.documentIds && filters.documentIds.length === 0) return [];
    console.log('🔍 [pgvector] Starting similarity search:', { query, filters, options })

    const {
      topK = 10,
      minScore = 0.1,
      rerank = false,
    } = options

    try {
      // Generate query embedding using existing OpenAI adapter
      console.log('📊 [pgvector] Generating query embedding...')
      const queryEmbedding = await this.generateQueryEmbedding(query)
      console.log('✅ [pgvector] Query embedding generated, length:', queryEmbedding.length)

      // Build WHERE clause for filtering
      const whereConditions = [`organization_id = $1`]
      const queryParams: any[] = [filters.organizationId]
      let paramIndex = 2

      if (filters.documentId) {
        whereConditions.push(`document_id = $${paramIndex}`)
        queryParams.push(filters.documentId)
        paramIndex++
      }

      if (filters.documentIds) {
        whereConditions.push(`document_id = ANY($${paramIndex})`);
        queryParams.push(filters.documentIds); paramIndex++;
      }
      if (filters.documentTypes?.length) {
        whereConditions.push(`metadata->>'documentType' = ANY($${paramIndex})`)
        queryParams.push(filters.documentTypes)
        paramIndex++
      }

      if (filters.naicsCodes?.length) {
        whereConditions.push(`metadata->'naicsCodes' ?| $${paramIndex}`)
        queryParams.push(filters.naicsCodes)
        paramIndex++
      }

      if (filters.tags?.length) {
        whereConditions.push(`metadata->'tags' ?| $${paramIndex}`)
        queryParams.push(filters.tags)
        paramIndex++
      }

      // Build the similarity search query
      const searchQuery = `
        SELECT
          id,
          document_id,
          chunk_index,
          metadata,
          1 - (embedding <=> $${paramIndex}::vector) as similarity_score
        FROM document_vectors
        WHERE ${whereConditions.join(' AND ')}
          AND (1 - (embedding <=> $${paramIndex}::vector)) >= $${paramIndex + 1}
        ORDER BY embedding <=> $${paramIndex}::vector
        LIMIT $${paramIndex + 2}
      `

      queryParams.push(
        `[${queryEmbedding.join(',')}]`, // embedding vector
        minScore, // minimum similarity score
        rerank ? topK * 3 : topK // limit
      )

      console.log('🔍 [pgvector] Executing similarity search query')

      // Execute the query using raw SQL for vector operations
      const rawResults = await prisma.$queryRawUnsafe(
        searchQuery,
        ...queryParams
      ) as any[]

      console.log(`📊 [pgvector] Found ${rawResults.length} vector matches`)

      // Process results and get full chunk content from database
      const results: SearchResult[] = []

      for (const row of rawResults) {
        const metadata = row.metadata as PgVectorMetadata
        let fullChunkText = metadata.chunkText || ''

        // Get full chunk content from document embeddings
        try {
          const document = await this.getDocumentWithEmbeddings(row.document_id, filters.organizationId)
          if (!document) continue;
          const chunkData = (document.embeddings as any)?.chunks?.find(
            (c: any) => c.chunkIndex === row.chunk_index
          )
          if (chunkData?.content) {
            fullChunkText = chunkData.content
            console.log(
              `✅ [pgvector] Retrieved full chunk content (${fullChunkText.length} chars) for chunk ${row.chunk_index}`
            )
          } else { continue; }
        } catch (error) {
          console.warn(
            `⚠️ [pgvector] Could not retrieve full chunk content for ${row.document_id}:${row.chunk_index}:`,
            error
          )
        }

        if (!fullChunkText) continue;
        results.push({
          documentId: row.document_id,
          documentTitle: metadata.documentTitle || 'Unknown Document',
          chunkId: row.id,
          chunkIndex: row.chunk_index,
          chunkText: fullChunkText,
          score: row.similarity_score,
          metadata: { ...metadata, source: 'pgvector' },
          highlights: this.extractHighlights(query, fullChunkText),
        })
      }

      console.log('✅ [pgvector] Processed results:', results.length, 'matches above threshold')

      // Rerank if requested
      if (rerank && results.length > 0) {
        console.log('🔄 [pgvector] Reranking results...')
        return await this.rerankResults(query, results, topK)
      }

      return results
    } catch (error) {
      console.error('❌ [pgvector] Vector search error:', error)
      throw error
    }
  }

  /**
   * Store embeddings in pgvector
   */
  async storeEmbeddings(
    chunks: DocumentChunk[],
    document: Document,
    organizationNamespace: string
  ): Promise<void> {
    console.log(`🚀 [pgvector] Storing ${chunks.length} embeddings for document ${document.id}`)

    try {
      // Get embeddings from document.embeddings JSON field
      const documentRecord = await prisma.document.findUnique({
        where: { id: document.id },
        select: { embeddings: true }
      })

      const embeddings = documentRecord?.embeddings as unknown as DocumentEmbeddings
      if (!embeddings?.chunks) {
        throw new Error('No embeddings found in document to store in pgvector')
      }

      // Prepare batch insert data
      const vectorData = chunks.map((chunk) => {
        const embeddingChunk = embeddings.chunks.find(c => c.chunkIndex === chunk.chunkIndex)
        if (!embeddingChunk) {
          throw new Error(`No embedding found for chunk ${chunk.chunkIndex}`)
        }

        // Get embedding from Pinecone or generate new one
        // For now, we'll generate new embeddings for pgvector storage
        return {
          documentId: document.id,
          chunkIndex: chunk.chunkIndex,
          organizationId: document.organizationId,
          embedding: null, // Will be populated with actual embedding
          metadata: {
            documentId: document.id,
            organizationId: document.organizationId,
            organizationNamespace: organizationNamespace,
            chunkIndex: chunk.chunkIndex,
            chunkText: chunk.content.substring(0, 200),
            documentTitle: document.name,
            documentType: document.documentType,
            tags: document.tags || [],
            naicsCodes: [],
            keywords: chunk.keywords,
            createdAt: new Date().toISOString(),
          } as PgVectorMetadata
        }
      })

      // Generate embeddings for all chunks
      console.log(`🧮 [pgvector] Generating ${chunks.length} embeddings for storage`)
      const embeddings_vectors = await this.generateBatchEmbeddings(
        chunks.map(chunk => chunk.content)
      )

      // Combine data with embeddings
      const insertData = vectorData.map((data, index) => ({
        ...data,
        embedding: `[${embeddings_vectors[index].join(',')}]`
      }))

      // Batch insert into pgvector table
      console.log(`📡 [pgvector] Inserting ${insertData.length} vectors into database`)

      // Use raw SQL for efficient batch insert with vector type
      const insertQuery = `
        INSERT INTO document_vectors (document_id, chunk_index, organization_id, embedding, metadata)
        VALUES ${insertData.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}::vector, $${i * 5 + 5})`).join(', ')}
        ON CONFLICT (document_id, chunk_index)
        DO UPDATE SET
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `

      const insertParams = insertData.flatMap(data => [
        data.documentId,
        data.chunkIndex,
        data.organizationId,
        data.embedding,
        JSON.stringify(data.metadata)
      ])

      await prisma.$executeRawUnsafe(insertQuery, ...insertParams)

      console.log(`✅ [pgvector] Successfully stored ${insertData.length} embeddings`)
    } catch (error) {
      console.error('❌ [pgvector] Error storing embeddings:', error)
      throw error
    }
  }

  /**
   * Delete embeddings for a document from pgvector
   */
  async deleteDocumentEmbeddings(
    documentId: string,
    organizationId: string
  ): Promise<void> {
    console.log(`🗑️ [pgvector] Deleting embeddings for document ${documentId}`)

    try {
      const result = await prisma.$executeRaw`
        DELETE FROM document_vectors
        WHERE document_id = ${documentId}
        AND organization_id = ${organizationId}
      `

      console.log(`✅ [pgvector] Deleted ${result} vector embeddings`)
    } catch (error) {
      console.error('❌ [pgvector] Error deleting embeddings:', error)
      throw error
    }
  }

  /**
   * Generate query embedding using existing OpenAI adapter
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      console.log('🤖 [pgvector] Generating OpenAI embedding for query:', query)

      // Use the existing OpenAI adapter through AI service manager
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: query,
          model: 'text-embedding-3-small',
          encoding_format: 'float',
        }),
      })

      if (!response.ok) {
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}`
        )
      }

      const data = await response.json()
      console.log(
        '📊 [pgvector] OpenAI embedding response successful, embedding length:',
        data.data[0].embedding.length
      )

      return data.data[0].embedding
    } catch (error) {
      console.error('❌ [pgvector] OpenAI embedding generation failed:', error)
      throw error
    }
  }

  /**
   * Generate embeddings for batch of texts
   */
  private async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      console.log(`🚀 [pgvector] Generating batch embeddings for ${texts.length} texts`)

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts,
          model: 'text-embedding-3-small',
          encoding_format: 'float',
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
        )
      }

      const data = await response.json()
      console.log(`✅ [pgvector] Generated ${data.data.length} embeddings`)

      return data.data.map((item: any) => item.embedding)
    } catch (error) {
      console.error('❌ [pgvector] Batch embedding generation failed:', error)
      throw error
    }
  }

  /**
   * Extract highlight phrases from text
   */
  private extractHighlights(query: string, text: string): string[] {
    const highlights: string[] = []
    const queryWords = query.toLowerCase().split(/\s+/)
    const sentences = text.split(/[.!?]+/)

    sentences.forEach((sentence) => {
      const sentenceLower = sentence.toLowerCase()
      if (queryWords.some((word) => sentenceLower.includes(word))) {
        highlights.push(sentence.trim())
      }
    })

    return highlights.slice(0, 3)
  }

  /**
   * Get document with embeddings from database
   */
  private async getDocumentWithEmbeddings(documentId: string, organizationId: string) {
    try {
      const document = await prisma.document.findUnique({
        where: { id: documentId, organizationId, deletedAt: null },
        select: {
          id: true,
          embeddings: true,
        },
      })
      return document
    } catch (error) {
      console.error(`❌ [pgvector] Error fetching document ${documentId}:`, error)
      return null
    }
  }

  /**
   * Rerank results using keyword-based scoring
   */
  private async rerankResults(
    query: string,
    results: SearchResult[],
    topK: number
  ): Promise<SearchResult[]> {
    const queryWords = query.toLowerCase().split(/\s+/)

    const rerankedResults = results.map((result) => {
      const textLower = result.chunkText.toLowerCase()
      let keywordScore = 0

      queryWords.forEach((word) => {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const count = (textLower.match(new RegExp(escapedWord, 'g')) || []).length
        keywordScore += count
      })

      // Combine vector score with keyword score
      const combinedScore =
        result.score * 0.7 + (keywordScore / queryWords.length) * 0.3

      return {
        ...result,
        score: Math.min(combinedScore, 1),
      }
    })

    return rerankedResults.sort((a, b) => b.score - a.score).slice(0, topK)
  }

  /**
   * Get index statistics for pgvector
   */
  async getIndexStats(): Promise<any> {
    try {
      const stats = await prisma.$queryRaw`
        SELECT
          COUNT(*) as total_vectors,
          COUNT(DISTINCT organization_id) as organizations,
          COUNT(DISTINCT document_id) as documents,
          pg_size_pretty(pg_total_relation_size('document_vectors')) as table_size
        FROM document_vectors
      `

      return stats
    } catch (error) {
      console.error('❌ [pgvector] Error getting index stats:', error)
      return null
    }
  }
}

// Default pgvector search service instance
export const defaultPgVectorSearch = new PgVectorSearchService()
