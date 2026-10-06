/**
 * Vector Search Cache Service
 * 
 * Provides caching for vector search queries to optimize performance
 * and ensure <500ms response times for frequently requested searches.
 */

import { SearchFilters, SearchResult, SearchOptions } from './vector-search'
import { createHash } from 'crypto'

interface CacheEntry {
  results: SearchResult[]
  timestamp: number
  ttl: number
}

export class VectorSearchCache {
  private cache = new Map<string, CacheEntry>()
  private readonly defaultTTL = 5 * 60 * 1000 // 5 minutes
  private readonly maxCacheSize = 1000
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 2 * 60 * 1000) // Cleanup every 2 minutes

    this.cleanupInterval.unref?.();
  }

  /**
   * Generate a cache key for search parameters
   */
  private generateCacheKey(
    query: string,
    filters: SearchFilters,
    options: SearchOptions
  ): string {
    const cacheData = {
      query: query.toLowerCase().trim(),
      filters,
      options: {
        ...options,
        topK: options.topK ?? 10,
        minScore: options.minScore ?? 0.1,
      }
    }
    
    const dataString = JSON.stringify(cacheData)
    return createHash('md5').update(dataString).digest('hex')
  }

  /**
   * Get cached search results
   */
  get(
    query: string,
    filters: SearchFilters,
    options: SearchOptions
  ): SearchResult[] | null {
    const key = this.generateCacheKey(query, filters, options)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Check if entry is expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key)
      return null
    }

    console.log(`🎯 [Cache] Cache hit for query: "${query.substring(0, 50)}..."`)
    return entry.results
  }

  /**
   * Store search results in cache
   */
  set(
    query: string,
    filters: SearchFilters,
    options: SearchOptions,
    results: SearchResult[],
    ttl?: number
  ): void {
    // Don't cache very large result sets (memory optimization)
    // Cache empty results for timeout resilience - they're better than no results
    if (results.length > 100) {
      console.log(`📝 [Cache] Skipping cache for large result set (${results.length} items)`)
      return
    }

    const key = this.generateCacheKey(query, filters, options)
    
    // If cache is at max size, remove oldest entries
    if (this.cache.size >= this.maxCacheSize) {
      this.removeOldest()
    }

    const entry: CacheEntry = {
      results,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    }

    this.cache.set(key, entry)
    console.log(`📝 [Cache] Cached ${results.length} results for query: "${query.substring(0, 50)}..."`)
  }

  /**
   * Remove expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now()
    let removedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key)
        removedCount++
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 [Cache] Cleaned up ${removedCount} expired cache entries`)
    }
  }

  /**
   * Remove oldest cache entries when at max capacity
   */
  private removeOldest(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      console.log(`🗑️ [Cache] Removed oldest cache entry`)
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    console.log('🧹 [Cache] Cleared all cache entries')
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxSize: number
    hitRate?: number
    totalHits?: number
    totalMisses?: number
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      // Note: For full hit rate tracking, we'd need to track hits/misses
      // This is a simplified version
    }
  }

  /**
   * Check if a query would be cached
   */
  shouldCache(
    query: string,
    filters: SearchFilters,
    _options: SearchOptions
  ): boolean {
    // Don't cache queries that are too short or too long
    const queryLength = query.trim().length
    if (queryLength < 3 || queryLength > 500) {
      return false
    }

    // Cache document-specific queries for timeout resilience
    // Previously we excluded these, but they're useful for fallback
    if (filters.documentId) {
      console.log('📝 [Cache] Caching document-specific query for timeout resilience')
      return true
    }

    return true
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cache.clear()
    console.log('🔌 [Cache] Vector search cache destroyed')
  }
}

// Default cache instance
export const defaultVectorSearchCache = new VectorSearchCache()