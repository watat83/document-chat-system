/**
 * Tests for Pinecone Namespace Manager
 *
 * Tests namespace creation, validation, and management functionality
 * for multi-tenant vector storage.
 */

import { PineconeNamespaceManager } from '../pinecone-namespace-manager'

// Mock Pinecone
jest.mock('@pinecone-database/pinecone', () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue({
      namespace: jest.fn().mockReturnValue({
        upsert: jest.fn(),
        deleteOne: jest.fn(),
        deleteAll: jest.fn(),
      }),
      describeIndexStats: jest.fn().mockResolvedValue({
        namespaces: {
          'testorg_org123': { recordCount: 100 },
          'anothercompany_org456': { recordCount: 50 },
        },
        indexFullness: 0.1,
      }),
    }),
  }))
}))

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
  },
}))

import { prisma as mockPrisma } from '@/lib/prisma'

describe('PineconeNamespaceManager', () => {
  let namespaceManager: PineconeNamespaceManager

  beforeEach(() => {
    process.env.PINECONE_API_KEY = 'unit-test-pinecone';
    process.env.PINECONE_INDEX_NAME = 'unit-test-index';
    jest.clearAllMocks()
    namespaceManager = new PineconeNamespaceManager()
  })

  describe('namespace sanitization', () => {
    test('should sanitize organization names correctly', () => {
      const testCases = [
        { input: 'Test Company Inc.', expected: 'testcompanyinc' },
        { input: 'ABC Corp!!!', expected: 'abccorp' },
        { input: '123-Tech__Solutions', expected: '123-tech-solutions' },
        { input: 'Multi   Space   Company', expected: 'multispacecompany' },
        { input: '___leading-underscores___', expected: 'leading-underscores' },
        { input: 'very-long-company-name-that-exceeds-limits-by-far', expected: 'very-long-company-name-that-exceeds-limi' },
        { input: '', expected: 'org' },
        { input: '###', expected: 'org' },
      ]

      testCases.forEach(({ input, expected }) => {
        // Use private method via any cast for testing
        const result = (namespaceManager as any).sanitizeNamespacePart(input)
        expect(result).toBe(expected)
      })
    })

    test('should validate namespace names correctly', () => {
      const validNames = [
        'testorg_org123',
        'a',
        'company-name_12345',
        'test123',
      ]

      const invalidNames = [
        '', // empty
        '_starts-with-underscore_org123', // starts with underscore
        'ends-with-underscore_org123_', // ends with underscore
        '-starts-with-hyphen_org123', // starts with hyphen
        'ends-with-hyphen_org123-', // ends with hyphen
        'has@special#chars_org123', // special characters
        'a'.repeat(50) + '_org123', // too long
      ]

      validNames.forEach(name => {
        const result = (namespaceManager as any).validateNamespace(name)
        expect(result.isValid).toBe(true)
      })

      invalidNames.forEach(name => {
        const result = (namespaceManager as any).validateNamespace(name)
        expect(result.isValid).toBe(false)
      })
    })
  })

  describe('namespace creation', () => {
    test('should create namespace for organization', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org123',
        name: 'Test Company',
        slug: 'test-company',
      })

      const namespaceInfo = await namespaceManager.getOrCreateNamespace('org123')

      expect(namespaceInfo.namespace).toBe('testcompany_org123')
      expect(namespaceInfo.organizationId).toBe('org123')
      expect(namespaceInfo.organizationName).toBe('Test Company')
      expect(namespaceInfo.sanitizedName).toBe('testcompany')
    })

    test('should handle organization not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null)

      await expect(namespaceManager.getOrCreateNamespace('nonexistent')).rejects.toThrow(
        'Organization not found: nonexistent'
      )
    })

    test('should use slug as fallback when name is missing', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org456',
        name: '',
        slug: 'fallback-slug',
      })

      const namespaceInfo = await namespaceManager.getOrCreateNamespace('org456')

      expect(namespaceInfo.namespace).toBe('fallback-slug_org456')
      expect(namespaceInfo.sanitizedName).toBe('fallback-slug')
    })
  })

  describe('namespace listing', () => {
    test('should list namespaces for organization', async () => {
      const namespaces = await namespaceManager.listOrganizationNamespaces('org123')

      expect(namespaces).toContain('testorg_org123')
      expect(namespaces).not.toContain('anothercompany_org456')
    })
  })

  describe('namespace stats', () => {
    test('should get namespace statistics', async () => {
      const stats = await namespaceManager.getNamespaceStats('testorg_org123')

      expect(stats.vectorCount).toBe(100)
      expect(stats.indexFullness).toBe(0.1)
    })

    test('should handle non-existent namespace', async () => {
      const stats = await namespaceManager.getNamespaceStats('nonexistent-namespace')

      expect(stats.vectorCount).toBe(0)
      expect(stats.indexFullness).toBe(0)
    })
  })

  describe('health check', () => {
    test('should perform health check successfully', async () => {
      const health = await namespaceManager.healthCheck()

      expect(health.status).toBe('healthy')
      expect(health.pineconeConnected).toBe(true)
      expect(health.databaseConnected).toBe(true)
      expect(health.errors).toHaveLength(0)
    })
  })

  describe('caching', () => {
    test('should cache namespace info for performance', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org789',
        name: 'Cached Company',
        slug: 'cached-company',
      })

      // First call should fetch from database
      const namespaceInfo1 = await namespaceManager.getOrCreateNamespace('org789')
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1)

      // Second call should use cache
      const namespaceInfo2 = await namespaceManager.getOrCreateNamespace('org789')
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1) // Not called again

      expect(namespaceInfo1.namespace).toBe(namespaceInfo2.namespace)
    })
  })
})
