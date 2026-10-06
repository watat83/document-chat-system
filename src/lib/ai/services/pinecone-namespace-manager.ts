import { getPinecone } from './pinecone-client'
/**
 * Pinecone Namespace Manager Service
 *
 * Manages Pinecone namespace creation and organization-specific isolation
 * for multi-tenant vector storage. Each organization gets its own namespace
 * using the format: `${organizationName}_${organizationId}`.
 */

import { Pinecone } from '@pinecone-database/pinecone'
import { prisma } from '@/lib/prisma'

export interface NamespaceInfo {
  namespace: string
  organizationId: string
  organizationName: string
  sanitizedName: string
  created: boolean
  vectorCount?: number
}

export interface NamespaceValidationResult {
  isValid: boolean
  sanitizedNamespace: string
  errors: string[]
}

export class PineconeNamespaceManager {
  private get pinecone(): Pinecone { return getPinecone() }
  private namespaceCache: Map<string, NamespaceInfo> = new Map()
  private cacheExpiryMs = 5 * 60 * 1000 // 5 minutes cache
  private lastCacheClean = Date.now()

  constructor() {

  }

  /**
   * Get or create namespace for an organization
   */
  async getOrCreateNamespace(organizationId: string): Promise<NamespaceInfo> {
    console.log(`🔍 Getting namespace for organization: ${organizationId}`)

    // Check cache first
    const cacheKey = `namespace_${organizationId}`
    const cached = this.getCachedNamespace(cacheKey)
    if (cached) {
      console.log(`✅ Using cached namespace: ${cached.namespace}`)
      return cached
    }

    // Get organization data
    const organization = await this.getOrganizationData(organizationId)
    if (!organization) {
      throw new Error(`Organization not found: ${organizationId}`)
    }

    // Generate namespace name
    const namespaceInfo = this.generateNamespaceInfo(organization)
    console.log(`📋 Generated namespace info:`, namespaceInfo)

    // Validate namespace name
    const validation = this.validateNamespace(namespaceInfo.namespace)
    if (!validation.isValid) {
      console.error(`❌ Invalid namespace: ${validation.errors.join(', ')}`)
      throw new Error(`Invalid namespace: ${validation.errors.join(', ')}`)
    }

    // Check if namespace exists, create if not
    const exists = await this.namespaceExists(namespaceInfo.namespace)
    if (!exists) {
      console.log(`📋 Creating new namespace: ${namespaceInfo.namespace}`)
      await this.createNamespace(namespaceInfo.namespace)
      namespaceInfo.created = true
    } else {
      console.log(`✅ Namespace already exists: ${namespaceInfo.namespace}`)
      namespaceInfo.created = false

      // Get vector count for existing namespace
      try {
        const stats = await this.getNamespaceStats(namespaceInfo.namespace)
        namespaceInfo.vectorCount = stats.vectorCount
      } catch (error) {
        console.warn(`⚠️ Could not get stats for namespace ${namespaceInfo.namespace}:`, error)
      }
    }

    // Cache the result
    this.cacheNamespace(cacheKey, namespaceInfo)

    console.log(`✅ Namespace ready: ${namespaceInfo.namespace}`)
    return namespaceInfo
  }

  /**
   * Generate namespace info from organization data
   */
  private generateNamespaceInfo(organization: { id: string; name: string; slug: string }): NamespaceInfo {
    // Use organization name or slug as the readable part
    const readableName = organization.name || organization.slug || 'org'

    // Organization ID is typically 25 chars (CUID), plus underscore = 26 chars
    // So we limit the sanitized name to 45 - 26 = 19 chars max
    const maxNameLength = 19

    // Sanitize the name part with length limit
    const sanitizedName = this.sanitizeNamespacePart(readableName, maxNameLength)

    // Create namespace in format: sanitizedName_organizationId
    const namespace = `${sanitizedName}_${organization.id}`

    return {
      namespace,
      organizationId: organization.id,
      organizationName: organization.name,
      sanitizedName,
      created: false
    }
  }

  /**
   * Sanitize namespace part to ensure it meets Pinecone requirements
   */
  private sanitizeNamespacePart(name: string, maxLength: number = 40): string {
    return name
      .toLowerCase() // Convert to lowercase
      .replace(/[^a-z0-9\-_]/g, '') // Remove special chars, keep only alphanumeric, hyphens, underscores
      .replace(/^[-_]+|[-_]+$/g, '') // Remove leading/trailing hyphens and underscores
      .replace(/[-_]+/g, '-') // Replace multiple consecutive hyphens/underscores with single hyphen
      .substring(0, maxLength) // Limit length
      || 'org' // Fallback if sanitization results in empty string
  }

  /**
   * Validate namespace meets Pinecone requirements
   */
  private validateNamespace(namespace: string): NamespaceValidationResult {
    const errors: string[] = []

    // Pinecone namespace requirements:
    // - Must be 1-45 characters
    // - Can contain alphanumeric characters, hyphens, and underscores
    // - Cannot start or end with hyphen or underscore

    if (!namespace || namespace.length === 0) {
      errors.push('Namespace cannot be empty')
    }

    if (namespace.length > 45) {
      errors.push('Namespace cannot exceed 45 characters')
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-_]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(namespace)) {
      errors.push('Namespace can only contain alphanumeric characters, hyphens, and underscores, and cannot start or end with hyphen or underscore')
    }

    const sanitizedNamespace = this.sanitizeNamespacePart(namespace)

    return {
      isValid: errors.length === 0,
      sanitizedNamespace,
      errors
    }
  }

  /**
   * Check if namespace exists in Pinecone index
   */
  private async namespaceExists(namespace: string): Promise<boolean> {
    try {
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)

      // Try to get stats for the specific namespace
      const stats = await index.describeIndexStats()

      // Check if namespace exists in the namespaces object
      if (stats.namespaces && namespace in stats.namespaces) {
        console.log(`✅ Namespace ${namespace} exists with ${stats.namespaces[namespace].recordCount} vectors`)
        return true
      }

      console.log(`📋 Namespace ${namespace} does not exist yet`)
      return false
    } catch (error) {
      console.warn(`⚠️ Error checking namespace existence for ${namespace}:`, error)
      // Assume it doesn't exist if we can't check
      return false
    }
  }

  /**
   * Create namespace by inserting a dummy vector (Pinecone creates namespaces implicitly)
   */
  private async createNamespace(namespace: string): Promise<void> {
    try {
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)

      // Create a temporary vector to initialize the namespace
      // This vector will be deleted immediately after creation
      const tempVectorId = `temp_init_${namespace}_${Date.now()}`
      const tempVector = {
        id: tempVectorId,
        values: Array(1536).fill(0.001), // Small non-zero values for text-embedding-3-small dimensions
        metadata: {
          __temp_init: true,
          namespace: namespace,
          createdAt: new Date().toISOString()
        }
      }

      console.log(`📋 Creating namespace ${namespace} with temporary vector...`)

      // Upsert temporary vector to create namespace
      await index.namespace(namespace).upsert([tempVector])

      // Immediately delete the temporary vector
      await index.namespace(namespace).deleteOne(tempVectorId)

      console.log(`✅ Namespace ${namespace} created and temporary vector removed`)
    } catch (error) {
      console.error(`❌ Failed to create namespace ${namespace}:`, error)
      throw new Error(`Failed to create namespace ${namespace}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get namespace statistics
   */
  async getNamespaceStats(namespace: string): Promise<{ vectorCount: number; indexFullness: number }> {
    try {
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
      const stats = await index.describeIndexStats()

      if (stats.namespaces && namespace in stats.namespaces) {
        const namespaceStats = stats.namespaces[namespace]
        return {
          vectorCount: namespaceStats.recordCount || 0,
          indexFullness: stats.indexFullness || 0
        }
      }

      return { vectorCount: 0, indexFullness: 0 }
    } catch (error) {
      console.error(`❌ Failed to get stats for namespace ${namespace}:`, error)
      throw error
    }
  }

  /**
   * List all namespaces for an organization (for debugging/admin)
   */
  async listOrganizationNamespaces(organizationId: string): Promise<string[]> {
    try {
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
      const stats = await index.describeIndexStats()

      if (!stats.namespaces) {
        return []
      }

      // Filter namespaces that end with the organization ID
      const orgNamespaces = Object.keys(stats.namespaces).filter(namespace =>
        namespace.endsWith(`_${organizationId}`)
      )

      console.log(`📋 Found ${orgNamespaces.length} namespaces for organization ${organizationId}:`, orgNamespaces)
      return orgNamespaces
    } catch (error) {
      console.error(`❌ Failed to list namespaces for organization ${organizationId}:`, error)
      return []
    }
  }

  /**
   * Delete namespace (careful - this deletes all vectors!)
   */
  async deleteNamespace(namespace: string): Promise<void> {
    try {
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)

      // Delete all vectors in the namespace
      await index.namespace(namespace).deleteAll()

      console.log(`✅ Deleted all vectors in namespace: ${namespace}`)

      // Remove from cache
      this.clearNamespaceCache(namespace)
    } catch (error) {
      console.error(`❌ Failed to delete namespace ${namespace}:`, error)
      throw error
    }
  }

  /** Purge every historical tenant namespace, including names preceding organization renames. */
  async deleteOrganizationNamespaces(organizationId: string): Promise<void> {
    if (!organizationId || organizationId.includes('/')) throw new Error('Invalid organization identifier');
    const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!);
    const stats = await index.describeIndexStats();
    for (const namespace of Object.keys(stats.namespaces ?? {})) {
      if (namespace.endsWith(`_${organizationId}`)) await this.deleteNamespace(namespace);
    }
  }

  /**
   * Get organization data from database
   */
  private async getOrganizationData(organizationId: string): Promise<{ id: string; name: string; slug: string } | null> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, slug: true }
      })

      return organization
    } catch (error) {
      console.error(`❌ Failed to get organization data for ${organizationId}:`, error)
      return null
    }
  }

  /**
   * Cache namespace info
   */
  private cacheNamespace(cacheKey: string, namespaceInfo: NamespaceInfo): void {
    this.namespaceCache.set(cacheKey, {
      ...namespaceInfo,
      created: true // Mark as cached
    })

    // Clean cache periodically
    this.cleanCacheIfNeeded()
  }

  /**
   * Get cached namespace info
   */
  private getCachedNamespace(cacheKey: string): NamespaceInfo | null {
    const cached = this.namespaceCache.get(cacheKey)
    if (!cached) {
      return null
    }

    // Check if cache entry is still valid (5 minutes)
    const now = Date.now()
    if (now - this.lastCacheClean > this.cacheExpiryMs) {
      this.namespaceCache.delete(cacheKey)
      return null
    }

    return cached
  }

  /**
   * Clear namespace from cache
   */
  private clearNamespaceCache(namespace?: string): void {
    if (namespace) {
      // Clear specific namespace
      for (const [key, value] of this.namespaceCache.entries()) {
        if (value.namespace === namespace) {
          this.namespaceCache.delete(key)
        }
      }
    } else {
      // Clear all cache
      this.namespaceCache.clear()
    }
  }

  /**
   * Clean expired cache entries
   */
  private cleanCacheIfNeeded(): void {
    const now = Date.now()
    if (now - this.lastCacheClean < this.cacheExpiryMs) {
      return
    }

    console.log('🧹 Cleaning namespace cache...')
    this.namespaceCache.clear()
    this.lastCacheClean = now
  }

  /**
   * Get namespace for organization (public method)
   */
  async getNamespaceForOrganization(organizationId: string): Promise<string> {
    const namespaceInfo = await this.getOrCreateNamespace(organizationId)
    return namespaceInfo.namespace
  }

  /**
   * Health check for namespace manager
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    pineconeConnected: boolean
    databaseConnected: boolean
    cacheSize: number
    errors: string[]
  }> {
    const errors: string[] = []
    let pineconeConnected = false
    let databaseConnected = false

    try {
      // Test Pinecone connection
      const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!)
      await index.describeIndexStats()
      pineconeConnected = true
    } catch (error) {
      errors.push(`Pinecone connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`
      databaseConnected = true
    } catch (error) {
      errors.push(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (errors.length > 0) {
      status = pineconeConnected && databaseConnected ? 'degraded' : 'unhealthy'
    }

    return {
      status,
      pineconeConnected,
      databaseConnected,
      cacheSize: this.namespaceCache.size,
      errors
    }
  }
}

// Default namespace manager instance
export const defaultNamespaceManager = new PineconeNamespaceManager()
