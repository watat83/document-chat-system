import { Prisma } from '@prisma/client';
import { getPinecone } from './pinecone-client'
/**
 * Vector Index Management Service
 *
 * Provides efficient management of vector indexes including cleanup,
 * optimization, and health monitoring for both Pinecone and pgvector.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { prisma } from '@/lib/prisma'
import { PgVectorSearchService } from './pgvector-search'

export interface IndexStats {
  totalVectors: number
  organizations: number
  documents: number
  orphanedVectors: number
  storageSize?: string
  lastOptimized?: Date
  health: 'healthy' | 'warning' | 'critical'
}

export interface CleanupResult {
  orphanedVectorsRemoved: number
  documentsProcessed: number
  spaceFreed?: string
  timeElapsed: number
}

export interface OptimizationResult {
  indexesOptimized: number
  performanceImprovement?: number
  timeElapsed: number
  recommendations: string[]
}

export class VectorIndexManager {
  private get pinecone(): Pinecone { return getPinecone() }
  private pgVectorService: PgVectorSearchService

  constructor() {
    this.pgVectorService = new PgVectorSearchService()
  }

  /**
   * Get comprehensive index statistics
   */
  async getIndexStats(): Promise<{
    pinecone: IndexStats | null
    pgvector: IndexStats | null
    combined: IndexStats
  }> {
    console.log('📊 Gathering index statistics...')

    const [pineconeStats, pgvectorStats] = await Promise.allSettled([
      this.getPineconeStats(),
      this.getPgVectorStats()
    ])

    const pinecone = pineconeStats.status === 'fulfilled' ? pineconeStats.value : null
    const pgvector = pgvectorStats.status === 'fulfilled' ? pgvectorStats.value : null

    // Combine stats
    const combined: IndexStats = {
      totalVectors: (pinecone?.totalVectors || 0) + (pgvector?.totalVectors || 0),
      organizations: Math.max(pinecone?.organizations || 0, pgvector?.organizations || 0),
      documents: Math.max(pinecone?.documents || 0, pgvector?.documents || 0),
      orphanedVectors: (pinecone?.orphanedVectors || 0) + (pgvector?.orphanedVectors || 0),
      health: this.determineOverallHealth(pinecone, pgvector)
    }

    return { pinecone, pgvector, combined }
  }

  /**
   * Clean up orphaned vectors across all services
   */
  async cleanupOrphanedVectors(): Promise<{
    pinecone: CleanupResult | null
    pgvector: CleanupResult | null
    combined: CleanupResult
  }> {
    console.log('🧹 Starting cleanup of orphaned vectors...')
    const startTime = Date.now()

    const [pineconeResult, pgvectorResult] = await Promise.allSettled([
      this.cleanupPineconeVectors(),
      this.cleanupPgVectorVectors()
    ])

    const pinecone = pineconeResult.status === 'fulfilled' ? pineconeResult.value : null
    const pgvector = pgvectorResult.status === 'fulfilled' ? pgvectorResult.value : null

    const combined: CleanupResult = {
      orphanedVectorsRemoved: (pinecone?.orphanedVectorsRemoved || 0) + (pgvector?.orphanedVectorsRemoved || 0),
      documentsProcessed: Math.max(pinecone?.documentsProcessed || 0, pgvector?.documentsProcessed || 0),
      timeElapsed: Date.now() - startTime
    }

    console.log(`✅ Cleanup completed: ${combined.orphanedVectorsRemoved} orphaned vectors removed`)
    return { pinecone, pgvector, combined }
  }

  /**
   * Optimize indexes for better performance
   */
  async optimizeIndexes(): Promise<{
    pinecone: OptimizationResult | null
    pgvector: OptimizationResult | null
    combined: OptimizationResult
  }> {
    console.log('⚡ Starting index optimization...')
    const startTime = Date.now()

    const [pineconeResult, pgvectorResult] = await Promise.allSettled([
      this.optimizePineconeIndex(),
      this.optimizePgVectorIndex()
    ])

    const pinecone = pineconeResult.status === 'fulfilled' ? pineconeResult.value : null
    const pgvector = pgvectorResult.status === 'fulfilled' ? pgvectorResult.value : null

    const recommendations: string[] = []
    if (pinecone?.recommendations) recommendations.push(...pinecone.recommendations)
    if (pgvector?.recommendations) recommendations.push(...pgvector.recommendations)

    const combined: OptimizationResult = {
      indexesOptimized: (pinecone?.indexesOptimized || 0) + (pgvector?.indexesOptimized || 0),
      timeElapsed: Date.now() - startTime,
      recommendations
    }

    console.log(`✅ Optimization completed: ${combined.indexesOptimized} indexes optimized`)
    return { pinecone, pgvector, combined }
  }

  /**
   * Get Pinecone index statistics
   */
  private async getPineconeStats(): Promise<IndexStats> {
    try {
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
      const stats = await index.describeIndexStats()

      // Query for organizational data
      const organizations = await this.countOrganizationsWithVectors()
      const documents = await this.countDocumentsWithVectors()
      const orphaned = await this.countOrphanedPineconeVectors()

      return {
        totalVectors: stats.totalRecordCount || 0,
        organizations,
        documents,
        orphanedVectors: orphaned,
        health: this.assessPineconeHealth(stats),
        lastOptimized: new Date() // Pinecone handles optimization automatically
      }
    } catch (error) {
      console.error('❌ Error getting Pinecone stats:', error)
      throw error
    }
  }

  /**
   * Get pgvector index statistics
   */
  private async getPgVectorStats(): Promise<IndexStats> {
    try {
      const stats = await prisma.$queryRaw`
        SELECT
          COUNT(*) as total_vectors,
          COUNT(DISTINCT organization_id) as organizations,
          COUNT(DISTINCT document_id) as documents,
          pg_size_pretty(pg_total_relation_size('document_vectors')) as table_size
        FROM document_vectors
      ` as any[]

      const orphaned = await this.countOrphanedPgVectors()

      const result = stats[0]
      return {
        totalVectors: Number(result.total_vectors),
        organizations: Number(result.organizations),
        documents: Number(result.documents),
        orphanedVectors: orphaned,
        storageSize: result.table_size,
        health: this.assessPgVectorHealth(Number(result.total_vectors), orphaned)
      }
    } catch (error) {
      console.error('❌ Error getting pgvector stats:', error)
      throw error
    }
  }

  /**
   * Clean up orphaned Pinecone vectors
   */
  private async cleanupPineconeVectors(): Promise<CleanupResult> {
    const startTime = Date.now()
    console.log('🧹 Cleaning up Pinecone orphaned vectors...')

    // Get all document IDs from database
    const validDocumentIds = await prisma.document.findMany({
      select: { id: true, organizationId: true }
    })
    const validDocSet = new Set(validDocumentIds.map(d => d.id))

    const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
    let orphanedCount = 0
    let processedCount = 0

    // Query all vectors and check for orphans
    // Note: This is a simplified approach. In production, you'd want to batch this
    for (const doc of validDocumentIds) {
      try {
        const queryResponse = await index.query({
          vector: Array(1536).fill(0), // Dummy vector for metadata query
          topK: 10000,
          includeMetadata: true,
          filter: {
            organizationId: doc.organizationId,
            documentId: doc.id
          }
        })

        // Check if vectors exist for deleted documents
        if (queryResponse.matches) {
          for (const match of queryResponse.matches) {
            const docId = match.metadata?.documentId as string
            if (docId && !validDocSet.has(docId)) {
              await index.deleteOne(match.id)
              orphanedCount++
            }
          }
        }
        processedCount++
      } catch (error) {
        console.warn(`⚠️ Error processing document ${doc.id}:`, error)
      }
    }

    return {
      orphanedVectorsRemoved: orphanedCount,
      documentsProcessed: processedCount,
      timeElapsed: Date.now() - startTime
    }
  }

  /**
   * Clean up orphaned pgvector vectors
   */
  private async cleanupPgVectorVectors(): Promise<CleanupResult> {
    const startTime = Date.now()
    console.log('🧹 Cleaning up pgvector orphaned vectors...')

    const result = await prisma.$executeRaw`
      DELETE FROM document_vectors
      WHERE document_id NOT IN (
        SELECT id FROM "Document"
      )
    `

    const documentsCount = await prisma.document.count()

    return {
      orphanedVectorsRemoved: Number(result),
      documentsProcessed: documentsCount,
      timeElapsed: Date.now() - startTime
    }
  }

  /**
   * Optimize Pinecone index
   */
  private async optimizePineconeIndex(): Promise<OptimizationResult> {
    const startTime = Date.now()
    console.log('⚡ Optimizing Pinecone index...')

    // Pinecone handles optimization automatically, so we provide recommendations
    const recommendations = [
      'Pinecone automatically optimizes indexes',
      'Consider upgrading to a higher tier for better performance',
      'Monitor query performance and adjust metadata filtering'
    ]

    return {
      indexesOptimized: 1,
      timeElapsed: Date.now() - startTime,
      recommendations
    }
  }

  /**
   * Optimize pgvector index
   */
  private async optimizePgVectorIndex(): Promise<OptimizationResult> {
    const startTime = Date.now()
    console.log('⚡ Optimizing pgvector index...')

    const recommendations: string[] = []

    try {
      // Reindex for better performance
      await prisma.$executeRaw`
        REINDEX INDEX idx_document_vectors_embedding_cosine
      `

      // Update table statistics
      await prisma.$executeRaw`
        ANALYZE document_vectors
      `

      recommendations.push(
        'Successfully reindexed vector similarity index',
        'Updated table statistics for query planner',
        'Consider adjusting ivfflat lists parameter based on data size'
      )

      return {
        indexesOptimized: 1,
        timeElapsed: Date.now() - startTime,
        recommendations
      }
    } catch (error) {
      console.error('❌ Error optimizing pgvector index:', error)
      recommendations.push(`Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)

      return {
        indexesOptimized: 0,
        timeElapsed: Date.now() - startTime,
        recommendations
      }
    }
  }

  /**
   * Helper methods for counting and health assessment
   */
  private async countOrganizationsWithVectors(): Promise<number> {
    const result = await prisma.document.findMany({
      where: {
        embeddings: { not: Prisma.JsonNull }
      },
      select: {
        organizationId: true
      },
      distinct: ['organizationId']
    })
    return result.length
  }

  private async countDocumentsWithVectors(): Promise<number> {
    return await prisma.document.count({
      where: {
        embeddings: { not: Prisma.JsonNull }
      }
    })
  }

  private async countOrphanedPineconeVectors(): Promise<number> {
    // This would require a more complex implementation to actually count orphaned vectors
    // For now, return 0 as a placeholder
    return 0
  }

  private async countOrphanedPgVectors(): Promise<number> {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as orphaned_count
      FROM document_vectors dv
      WHERE NOT EXISTS (
        SELECT 1 FROM "Document" d WHERE d.id = dv.document_id
      )
    ` as any[]

    return Number(result[0].orphaned_count)
  }

  private assessPineconeHealth(stats: any): 'healthy' | 'warning' | 'critical' {
    if (stats.indexFullness > 0.9) return 'critical'
    if (stats.indexFullness > 0.7) return 'warning'
    return 'healthy'
  }

  private assessPgVectorHealth(totalVectors: number, orphanedVectors: number): 'healthy' | 'warning' | 'critical' {
    const orphanedPercentage = totalVectors > 0 ? orphanedVectors / totalVectors : 0

    if (orphanedPercentage > 0.2) return 'critical' // >20% orphaned
    if (orphanedPercentage > 0.1) return 'warning'  // >10% orphaned
    return 'healthy'
  }

  private determineOverallHealth(
    pineconeStats: IndexStats | null,
    pgvectorStats: IndexStats | null
  ): 'healthy' | 'warning' | 'critical' {
    const healths = [pineconeStats?.health, pgvectorStats?.health].filter(Boolean)

    if (healths.includes('critical')) return 'critical'
    if (healths.includes('warning')) return 'warning'
    return 'healthy'
  }
}

// Default index manager instance
export const defaultVectorIndexManager = new VectorIndexManager()
