import { PrismaClient, Prisma } from '@prisma/client'
import { database, app } from '@/lib/config/env'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Security-enhanced Prisma configuration
const prismaConfig: Prisma.PrismaClientOptions = {
  log: app.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  errorFormat: app.nodeEnv === 'development' ? 'pretty' : 'minimal',
  datasourceUrl: database.url,
}

// Create Prisma client with security enhancements
const baseDb = globalForPrisma.prisma ?? new PrismaClient(prismaConfig)

// Database connection validation
if (app.nodeEnv !== 'production') {
  globalForPrisma.prisma = baseDb
}

// Security utilities for database operations
export class DatabaseSecurity {
  // Validate and sanitize LIKE patterns to prevent SQL injection in raw queries
  static sanitizeLikePattern(pattern: string): string {
    // Escape special characters in LIKE patterns
    return pattern.replace(/[%_\\]/g, '\\$&')
  }

  // Validate database identifiers (table names, column names)
  static validateIdentifier(identifier: string): boolean {
    // Only allow alphanumeric characters and underscores
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)
  }

  // Safe array parameter handling for IN clauses
  static validateArrayParams<T>(params: T[], maxLength: number = 1000): T[] {
    if (params.length > maxLength) {
      throw new Error(`Array parameter too large: ${params.length} > ${maxLength}`)
    }
    return params
  }

  // Validate pagination parameters
  static validatePagination(limit: number, offset: number): { limit: number; offset: number } {
    const safeLimit = Math.min(Math.max(limit, 1), 100) // Between 1 and 100
    const safeOffset = Math.max(offset, 0) // Non-negative

    if (safeOffset > 100000) {
      throw new Error('Offset too large for security reasons')
    }

    return { limit: safeLimit, offset: safeOffset }
  }

  // Validate sort parameters
  static validateSortField(field: string, allowedFields: string[]): string {
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid sort field: ${field}`)
    }
    return field
  }

  // Safe numeric parameter validation
  static validateNumericRange(value: number, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
    if (value < min || value > max) {
      throw new Error(`Numeric value out of safe range: ${value}`)
    }
    return value
  }
}

// Export the db with or without logging
export const db = baseDb
export const prisma = db

// Graceful shutdown handling - only add listeners once
if (!globalForPrisma.prisma || app.nodeEnv === 'production') {
  process.on('beforeExit', async () => {
    await baseDb.$disconnect()
  })

  process.on('SIGINT', async () => {
    await baseDb.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await baseDb.$disconnect()
    process.exit(0)
  })
}
