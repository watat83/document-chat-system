import { getPinecone } from './pinecone-client'
/**
 * Vector Search Service
 *
 * Provides semantic search capabilities for government contracting documents
 * using Pinecone vector database with hybrid search support.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { AIServiceManager } from '@/lib/ai/ai-service-manager'
import { PineconeMetadata } from './embedding-service'
import { prisma } from '@/lib/prisma'
import { PgVectorSearchService } from './pgvector-search'
import { VectorSearchCache, defaultVectorSearchCache } from './vector-search-cache'
import { HybridSearchService, defaultHybridSearchService, HybridSearchOptions, HybridSearchResult } from './hybrid-search'
import { PineconeNamespaceManager, defaultNamespaceManager } from './pinecone-namespace-manager'

export interface SearchFilters {
  organizationId: string
  documentId?: string // Filter to specific document
  documentIds?: string[] // Filter to multiple documents
  documentTypes?: string[]
  naicsCodes?: string[]
  tags?: string[]
  dateRange?: {
    start: Date
    end: Date
  }
}

export interface SearchResult {
  documentId: string
  documentTitle: string
  chunkId: string
  chunkIndex: number
  chunkText: string
  score: number // Similarity score (0-1)
  metadata: PineconeMetadata
  highlights?: string[] // Key matching phrases
}

export interface SearchOptions {
  topK?: number // Number of results (default: 10)
  minScore?: number // Minimum similarity score (default: 0.7)
  includeMetadata?: boolean
  rerank?: boolean // Use reranking for better results
  hybridSearch?: boolean // Enable true hybrid search (default: false)
  vectorWeight?: number // Weight for vector similarity in hybrid search (0-1, default: 0.7)
  keywordWeight?: number // Weight for keyword relevance in hybrid search (0-1, default: 0.3)
}

export class VectorSearchService {
  private get pinecone(): Pinecone { return getPinecone() }
  private aiManager: AIServiceManager
  private namespaceManager: PineconeNamespaceManager
  private pgVectorService: PgVectorSearchService
  private cache: VectorSearchCache
  private hybridSearchService: HybridSearchService
  private useFallback: boolean = false

  constructor() {

    this.aiManager = AIServiceManager.getInstance()
    this.namespaceManager = defaultNamespaceManager
    this.pgVectorService = new PgVectorSearchService()
    this.cache = defaultVectorSearchCache
    this.hybridSearchService = defaultHybridSearchService

    // Check if pgvector fallback should be enabled
    this.useFallback = process.env.ENABLE_PGVECTOR_FALLBACK === 'true' && process.env.PGVECTOR_BACKFILL_COMPLETE === 'true'
  }

  /**
   * Search for similar document chunks with automatic fallback and caching
   */
  async searchSimilar(
    query: string,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (filters.documentIds && filters.documentIds.length === 0) return [];
    const startTime = Date.now()
    console.log('🔍 Starting optimized similarity search:', { query: query.substring(0, 50), filters, options })

    // Progressive timeout strategy: more time for complex operations
    const baseTimeoutMs = parseInt(process.env.VECTOR_SEARCH_TIMEOUT_MS || '5000', 10) // Default 5 seconds
    const embeddingTimeoutMs = parseInt(process.env.VECTOR_SEARCH_EMBEDDING_TIMEOUT_MS || '10000', 10) // Default 10 seconds for full operation
    const timeoutMs = filters.documentId ? baseTimeoutMs : embeddingTimeoutMs // Document-specific searches are faster

    console.log(`⏱️ Using timeout: ${timeoutMs}ms for search operation`)

    try {
      return await Promise.race([
        this.performSearch(query, filters, options),
        new Promise<SearchResult[]>((_, reject) =>
          setTimeout(() => reject(new Error('Search timeout')), timeoutMs)
        )
      ])
    } catch (error) {
      const elapsed = Date.now() - startTime

      if (error instanceof Error && error.message === 'Search timeout') {
        console.warn(`⏰ Search timed out after ${elapsed}ms (limit: ${timeoutMs}ms), attempting fallback strategies`)

        // Strategy 1: Try to return cached results as fallback
        const cachedResults = this.cache.get(query, filters, options)
        if (cachedResults) {
          console.log(`✅ Returning cached results due to timeout (${cachedResults.length} results)`)
          return await this.filterActiveResults(cachedResults, filters)
        }

        // Strategy 2: Try pgvector fallback if enabled and no cached results
        if (this.useFallback) {
          console.log('🔄 Attempting pgvector fallback due to timeout...')
          try {
            const fallbackResults = await this.pgVectorService.searchSimilar(query, filters, options)
            console.log(`✅ pgvector fallback successful (${fallbackResults.length} results)`)

            // Cache the fallback results for future requests
            if (this.cache.shouldCache(query, filters, options)) {
              this.cache.set(query, filters, options, fallbackResults)
            }

            return fallbackResults
          } catch (fallbackError) {
            console.error('❌ pgvector fallback also failed:', fallbackError)
          }
        }

        throw new Error(`Search timed out after ${timeoutMs}ms. Pinecone may be experiencing high latency. Please try again in a moment.`)
      }

      console.error(`❌ Search failed after ${elapsed}ms:`, error)
      throw error
    }
  }

  /**
   * Perform the actual search with caching
   */
  private async performSearch(
    query: string,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    // Check cache first for performance
    if (this.cache.shouldCache(query, filters, options)) {
      const cachedResults = this.cache.get(query, filters, options)
      if (cachedResults) {
        console.log(`🎯 Returning ${cachedResults.length} cached results`)
        return await this.filterActiveResults(cachedResults, filters)
      }
    }

    // Perform actual search with fallback
    let results: SearchResult[]

    try {
      results = await this.searchWithPinecone(query, filters, options)
    } catch (pineconeError) {
      console.warn('⚠️ Pinecone search failed:', pineconeError)

      if (this.useFallback) {
        console.log('🔄 Falling back to pgvector search...')
        try {
          results = await this.pgVectorService.searchSimilar(query, filters, options)
        } catch (fallbackError) {
          console.error('❌ Both Pinecone and pgvector search failed')
          console.error('Pinecone error:', pineconeError)
          console.error('pgvector error:', fallbackError)
          throw new Error('Vector search unavailable: both Pinecone and pgvector failed')
        }
      } else {
        console.log('⚠️ pgvector fallback not enabled, throwing Pinecone error')
        throw pineconeError
      }
    }

    // Apply hybrid search if requested
    if (options.hybridSearch && results.length > 0) {
      console.log('🔀 Applying hybrid search scoring...')

      // Extract keywords from query for hybrid search
      const queryKeywords = query.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2)
        .map(word => word.replace(/[^\w]/g, ''))
        .filter(word => word.length > 0)

      const hybridOptions: HybridSearchOptions = {
        ...options,
        vectorWeight: options.vectorWeight || 0.7,
        keywordWeight: options.keywordWeight || 0.3,
      }

      const hybridResults = await this.hybridSearchService.performHybridSearch(
        results,
        query,
        queryKeywords,
        hybridOptions
      )

      // Cache hybrid results
      if (this.cache.shouldCache(query, filters, options)) {
        this.cache.set(query, filters, options, hybridResults as SearchResult[])
      }

      // Return hybrid results (which extend SearchResult)
      return await this.filterActiveResults(hybridResults as SearchResult[], filters)
    }

    // Cache results if appropriate
    if (this.cache.shouldCache(query, filters, options)) {
      this.cache.set(query, filters, options, results)
    }

    return await this.filterActiveResults(results, filters)
  }

  /**
   * Search using Pinecone (original implementation)
   */
  private async searchWithPinecone(
    query: string,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    console.log('🔍 [Pinecone] Starting similarity search:', { query, filters, options })

    const {
      topK = 10,
      minScore = 0.1,
      rerank = false,
    } = options

    try {
      // Generate query embedding with timeout protection
      console.log('📊 [Pinecone] Generating query embedding...')
      const embeddingStartTime = Date.now()

      const queryEmbedding = await Promise.race([
        this.generateQueryEmbedding(query),
        new Promise<number[]>((_, reject) =>
          setTimeout(() => reject(new Error('Embedding generation timeout')),
            parseInt(process.env.AI_DEFAULT_TIMEOUT || '30000', 10))
        )
      ])

      const embeddingTime = Date.now() - embeddingStartTime
      console.log(
        `✅ [Pinecone] Query embedding generated in ${embeddingTime}ms, length:`,
        queryEmbedding.length
      )

      // Get organization namespace
      console.log(
        `🔍 [Pinecone] Getting namespace for organization ${filters.organizationId}...`
      )
      const namespaceInfo = await this.namespaceManager.getOrCreateNamespace(filters.organizationId)
      const organizationNamespace = namespaceInfo.namespace

      // Get Pinecone index with organization namespace
      console.log(
        '🔗 [Pinecone] Connecting to Pinecone index:',
        process.env.PINECONE_INDEX_NAME
      )
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
      const namespacedIndex = index.namespace(organizationNamespace)

      console.log(
        `🗂️ [Pinecone] Using organization namespace: ${organizationNamespace}`
      )

      // Build metadata filter - organizationId not needed since we're in the org namespace
      const metadataFilter: any = {}

      // Only add documentId filter if provided (most restrictive)
      if (filters.documentId) {
        metadataFilter.documentId = filters.documentId
        console.log('🎯 [Pinecone] Filtering by specific document:', filters.documentId)
      }
      // Add documentIds filter for multiple documents (used in document chat)
      else if (filters.documentIds?.length) {
        metadataFilter.documentId = { $in: filters.documentIds }
        console.log('🎯 [Pinecone] Filtering by multiple documents:', filters.documentIds)
      }

      // Add document type filter if provided
      if (filters.documentTypes?.length) {
        metadataFilter.documentType = { $in: filters.documentTypes }
        console.log('📄 Filtering by document types:', filters.documentTypes)
      }

      // Add NAICS codes filter if provided
      if (filters.naicsCodes?.length) {
        metadataFilter.naicsCodes = { $in: filters.naicsCodes }
        console.log('🏷️ Filtering by NAICS codes:', filters.naicsCodes)
      }

      // Add tags filter if provided
      if (filters.tags?.length) {
        metadataFilter.tags = { $in: filters.tags }
        console.log('🏷️ Filtering by tags:', filters.tags)
      }

      console.log(
        `🔍 Querying Pinecone namespace ${organizationNamespace} with filter:`,
        metadataFilter
      )
      console.log('📊 Query details:', {
        queryLength: query.length,
        embeddingLength: queryEmbedding.length,
        topK: rerank ? topK * 3 : topK,
        minScore,
        namespace: organizationNamespace,
      })

      // Query Pinecone using dense vector query in organization namespace with timeout protection
      const queryStartTime = Date.now()
      const queryResponse = await Promise.race([
        namespacedIndex.query({
          vector: queryEmbedding, // Use vector for dense vectors
          topK: rerank ? topK * 3 : topK,
          includeMetadata: true,
          filter:
            Object.keys(metadataFilter).length > 0 ? metadataFilter : undefined,
        }),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Pinecone query timeout')),
            parseInt(process.env.PINECONE_QUERY_TIMEOUT_MS || '8000', 10))
        )
      ])

      const queryTime = Date.now() - queryStartTime
      console.log(`⚡ [Pinecone] Query completed in ${queryTime}ms`)

      console.log('📊 Pinecone query response:', {
        namespace: organizationNamespace,
        matchesCount: queryResponse.matches?.length || 0,
        matches: queryResponse.matches?.map((m: any) => ({
          id: m.id,
          score: m.score,
        })),
      })

      // Process results and retrieve full chunk content from database
      const filteredMatches = (queryResponse.matches || []).filter(
        (match: any) => match.score! >= minScore
      )

      console.log(
        `📊 Filtered matches: ${filteredMatches.length} results above score threshold`
      )

      // Get full chunk content from database for complete search results
      let results: SearchResult[] = []

      const activeDocuments = await prisma.document.findMany({
        where: { id: { in: [...new Set<string>(filteredMatches.map((m: any) => m.metadata?.documentId as string).filter(Boolean))] }, organizationId: filters.organizationId, deletedAt: null },
        select: { id: true, embeddings: true, name: true },
      });
      const documentMap = new Map(activeDocuments.map(d => [d.id, d]));
      for (const match of filteredMatches) {
        const documentId = match.metadata?.documentId as string
        const chunkIndex = match.metadata?.chunkIndex as number

        const activeDocument = documentMap.get(documentId);
        if (!activeDocument) continue;
        let fullChunkText = ''

        // Get full chunk content from document embeddings
        if (documentId && chunkIndex !== undefined) {
          try {
            const document = activeDocument
            const chunkData = (document?.embeddings as any)?.chunks?.find(
              (c: any) => c.chunkIndex === chunkIndex
            )
            if (chunkData?.content && (!chunkData.vectorId || chunkData.vectorId === match.id)) {
              fullChunkText = chunkData.content
              console.log(
                `✅ Retrieved full chunk content (${fullChunkText.length} chars) for chunk ${chunkIndex}`
              )
            } else {
              console.warn(
                `⚠️ No full content found for chunk ${chunkIndex}, using metadata preview`
              )
            }
          } catch (error) {
            console.warn(
              `⚠️ Could not retrieve full chunk content for ${documentId}:${chunkIndex}:`,
              error
            )
          }
        }

        if (!fullChunkText) continue;
        results.push({
          documentId: documentId || 'unknown',
          documentTitle:
            (match.metadata?.documentTitle as string) || 'Unknown Document',
          chunkId: match.id,
          chunkIndex: chunkIndex || 0,
          chunkText: fullChunkText,
          score: match.score!,
          metadata: match.metadata as PineconeMetadata,
          highlights: this.extractHighlights(query, fullChunkText),
        })
      }

      console.log(
        '✅ Processed results:',
        results.length,
        'matches above threshold'
      )

      // Rerank if requested
      if (rerank && results.length > 0) {
        console.log('🔄 Reranking results...')
        results = await this.rerankResults(query, results, topK)
      }

      return await this.filterActiveResults(results, filters)
    } catch (error) {
      console.error('❌ Vector search error:', error)
      throw error
    }
  }

  /**
   * Find similar contract requirements
   */
  async findSimilarRequirements(
    requirement: string,
    organizationId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    return this.searchSimilar(
      requirement,
      {
        organizationId,
        documentTypes: ['SOLICITATION', 'CONTRACT', 'AMENDMENT'],
      },
      options
    )
  }

  /**
   * Find similar past performance examples
   */
  async findSimilarExperience(
    experience: string,
    organizationId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    return this.searchSimilar(
      experience,
      {
        organizationId,
        documentTypes: ['PAST_PERFORMANCE', 'CAPABILITY_STATEMENT'],
      },
      options
    )
  }

  /**
   * True hybrid search combining vector similarity with keyword relevance scoring
   */
  async hybridSearch(
    query: string,
    keywords: string[],
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<HybridSearchResult[]> {
    console.log('🔀 Starting true hybrid search...')
    console.log(`📝 Query: "${query}"`)
    console.log(`🏷️ Keywords: [${keywords.join(', ')}]`)

    // First get vector search results
    const vectorResults = await this.searchSimilar(query, filters, {
      ...options,
      hybridSearch: false // Prevent recursion
    })

    if (vectorResults.length === 0) {
      console.log('📭 No vector results found, returning empty hybrid results')
      return []
    }

    console.log(`🔍 Got ${vectorResults.length} vector results, applying hybrid scoring...`)

    // Apply hybrid search with score fusion
    const hybridOptions: HybridSearchOptions = {
      ...options,
      vectorWeight: options.vectorWeight || 0.7,
      keywordWeight: options.keywordWeight || 0.3,
    }

    const hybridResults = await this.hybridSearchService.performHybridSearch(
      vectorResults,
      query,
      keywords,
      hybridOptions
    )

    // Get search statistics
    const stats = this.hybridSearchService.getSearchStats(hybridResults)
    console.log(`📊 Hybrid search completed:`, {
      results: stats.totalResults,
      keywordCoverage: `${stats.keywordCoverage.toFixed(1)}%`,
      avgScores: {
        vector: stats.avgVectorScore.toFixed(3),
        keyword: stats.avgKeywordScore.toFixed(3),
        hybrid: stats.avgHybridScore.toFixed(3)
      }
    })

    return hybridResults
  }

  /**
   * Generate dense embedding for search query using OpenAI
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      console.log('🤖 Generating OpenAI embedding for query:', query.substring(0, 100))

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured')
      }

      // Direct OpenAI API call for embeddings with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(),
        parseInt(process.env.AI_DEFAULT_TIMEOUT || '30000', 10))

      try {
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
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error')
          throw new Error(
            `OpenAI API error: ${response.status} ${response.statusText}. Response: ${errorText}`
          )
        }

        const data = await response.json()

        if (!data.data || !data.data[0] || !data.data[0].embedding) {
          throw new Error('Invalid response format from OpenAI embeddings API')
        }

        console.log(
          '📊 OpenAI embedding response successful, embedding length:',
          data.data[0].embedding.length
        )

        return data.data[0].embedding
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error('❌ OpenAI embedding generation timed out')
          throw new Error('Embedding generation timed out. OpenAI API may be experiencing high latency.')
        }

        console.error('❌ OpenAI embedding generation failed:', error.message)

        // More specific error messages for common issues
        if (error.message.includes('401')) {
          throw new Error('OpenAI API authentication failed. Please check your API key.')
        } else if (error.message.includes('429')) {
          throw new Error('OpenAI API rate limit exceeded. Please try again in a moment.')
        } else if (error.message.includes('503') || error.message.includes('502')) {
          throw new Error('OpenAI API is temporarily unavailable. Please try again.')
        }
      }

      console.error('❌ OpenAI embedding generation failed:', error)
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

    // Find sentences containing query words
    sentences.forEach((sentence) => {
      const sentenceLower = sentence.toLowerCase()
      if (queryWords.some((word) => sentenceLower.includes(word))) {
        highlights.push(sentence.trim())
      }
    })

    return highlights.slice(0, 3) // Return top 3 highlights
  }

  /**
   * Retrieve document with embeddings from database
   */
  private async filterActiveResults(results: SearchResult[], filters: SearchFilters): Promise<SearchResult[]> {
    if (!results.length) return [];
    const active = await prisma.document.findMany({
      where: { organizationId: filters.organizationId, deletedAt: null,
        id: { in: results.map(r => r.documentId) } },
      select: { id: true, embeddings: true },
    });
    const docs = new Map(active.map(d => [d.id, d]));
    return results.flatMap(result => {
      if (filters.documentId && filters.documentId !== result.documentId) return [];
      if (filters.documentIds && !filters.documentIds.includes(result.documentId)) return [];
      const document = docs.get(result.documentId);
      const chunk = (document?.embeddings as any)?.chunks?.find((c: any) => c.chunkIndex === result.chunkIndex);
      // Old vector previews cannot survive deletion, reprocessing or removed embeddings.
      return chunk?.content && (!chunk.vectorId || result.metadata?.source === 'pgvector' || chunk.vectorId === result.chunkId) ? [{ ...result, chunkText: chunk.content }] : [];
    });
  }

  /**
   * Rerank results using a more sophisticated model
   */
  private async rerankResults(
    query: string,
    results: SearchResult[],
    topK: number
  ): Promise<SearchResult[]> {
    // Simple reranking based on keyword density
    // You could enhance this with a reranking model

    const queryWords = query.toLowerCase().split(/\s+/)

    const rerankedResults = results.map((result) => {
      const textLower = result.chunkText.toLowerCase()
      let keywordScore = 0

      queryWords.forEach((word) => {
        // Escape special regex characters to prevent regex errors
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

    // Sort by combined score and return top K
    return rerankedResults.sort((a, b) => b.score - a.score).slice(0, topK)
  }

  /**
   * Check health of vector search services
   */
  async checkServiceHealth(): Promise<{
    pinecone: { available: boolean; error?: string; stats?: any }
    pgvector: { available: boolean; error?: string; stats?: any }
    fallbackEnabled: boolean
  }> {
    const result = {
      pinecone: { available: false, error: undefined as string | undefined, stats: undefined as any },
      pgvector: { available: false, error: undefined as string | undefined, stats: undefined as any },
      fallbackEnabled: this.useFallback
    }

    // Test Pinecone health
    try {
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
      const stats = await index.describeIndexStats()
      result.pinecone = { available: true, error: undefined, stats }
      console.log('✅ Pinecone service healthy')
    } catch (error) {
      result.pinecone = {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stats: undefined
      }
      console.log('❌ Pinecone service unhealthy:', error)
    }

    // Test pgvector health if fallback is enabled
    if (this.useFallback) {
      try {
        const stats = await this.pgVectorService.getIndexStats()
        result.pgvector = { available: true, error: undefined, stats }
        console.log('✅ pgvector service healthy')
      } catch (error) {
        result.pgvector = {
          available: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          stats: undefined
        }
        console.log('❌ pgvector service unhealthy:', error)
      }
    }

    return result
  }

  /**
   * Force fallback to pgvector for testing
   */
  async forceFallbackMode(enabled: boolean): Promise<void> {
    if (enabled && process.env.PGVECTOR_BACKFILL_COMPLETE !== 'true') throw new Error('pgvector fallback requires a completed and verified index backfill');
    this.useFallback = enabled
    console.log(`🔧 Fallback mode ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Get service status information
   */
  getServiceInfo(): {
    primaryService: string
    fallbackService: string | null
    fallbackEnabled: boolean
  } {
    return {
      primaryService: 'pinecone',
      fallbackService: this.useFallback ? 'pgvector' : null,
      fallbackEnabled: this.useFallback
    }
  }
}

// Default search service instance
export const defaultVectorSearch = new VectorSearchService()
