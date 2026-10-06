/**
 * API Key Authentication System
 *
 * Provides programmatic access authentication through:
 * - API key generation and management
 * - Scope-based access control
 * - Key rotation and expiration
 * - Usage tracking and rate limiting
 *
 * Usage:
 * - generateAPIKey(): Create new API key
 * - validateAPIKey(): Validate incoming key
 * - revokeAPIKey(): Revoke existing key
 * - rotateAPIKey(): Rotate existing key
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';



// API Key configuration
const API_KEY_LENGTH = 32;
const API_KEY_PREFIX = 'gmai_'; // Document Chat System AI prefix
const DEFAULT_KEY_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

export type APIKeyScope =
  | 'read:profile'
  | 'write:profile'
  | 'read:opportunities'
  | 'read:match-scores'
  | 'write:match-scores'
  | 'read:organizations'
  | 'write:organizations'
  | 'read:usage'
  | 'admin:all';

const allowedScopes: readonly APIKeyScope[] = ['read:profile', 'write:profile', 'read:opportunities', 'read:match-scores', 'write:match-scores', 'read:organizations', 'write:organizations', 'read:usage', 'admin:all'];
function parseScopes(scopes: string[]): APIKeyScope[] {
  if (scopes.some(scope => !allowedScopes.includes(scope as APIKeyScope))) throw new Error('Invalid stored API key scopes');
  return scopes as APIKeyScope[];
}

export interface APIKeyData {
  id: string;
  keyId: string;
  name: string;
  scopes: APIKeyScope[];
  organizationId: string;
  userId: string;
  hashedKey: string;
  lastUsedAt: Date | null;
  expiresAt: Date;
  isActive: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAPIKeyRequest {
  name: string;
  scopes: APIKeyScope[];
  organizationId: string;
  userId: string;
  expiresAt?: Date;
}

export interface CreateAPIKeyResponse {
  keyId: string;
  apiKey: string; // Only returned once during creation
  name: string;
  scopes: APIKeyScope[];
  expiresAt: Date;
}

export interface ValidateAPIKeyResult {
  valid: boolean;
  error?: string;
  keyData?: Omit<APIKeyData, 'hashedKey'>;
}

/**
 * Generate a new API key
 */
export function generateAPIKeyString(): string {
  const keyBytes = randomBytes(API_KEY_LENGTH);
  const keyId = randomBytes(8).toString('hex');
  return `${API_KEY_PREFIX}${keyId}_${keyBytes.toString('hex')}`;
}

/**
 * Hash API key for secure storage
 */
export function hashAPIKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Extract key ID from API key
 */
export function extractKeyId(apiKey: string): string | null {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const withoutPrefix = apiKey.slice(API_KEY_PREFIX.length);
  const keyIdMatch = withoutPrefix.match(/^([a-f0-9]{16})_/);

  return keyIdMatch ? keyIdMatch[1] : null;
}

/**
 * Create a new API key
 */
export async function createAPIKey(request: CreateAPIKeyRequest): Promise<CreateAPIKeyResponse> {
  const apiKey = generateAPIKeyString();
  const keyId = extractKeyId(apiKey);

  if (!keyId) {
    throw new Error('Failed to generate valid API key');
  }

  const hashedKey = hashAPIKey(apiKey);
  const expiresAt = request.expiresAt || new Date(Date.now() + DEFAULT_KEY_TTL);

  try {
    // Store API key in database
    const keyData = await prisma.apiKey.create({
      data: {
        keyId,
        name: request.name,
        scopes: request.scopes,
        organizationId: request.organizationId,
        userId: request.userId,
        hashedKey,
        expiresAt,
        isActive: true
      }
    });

    // Track usage
    await UsageTrackingService.trackUsage({
      userId: request.userId,
      organizationId: request.organizationId,
      usageType: UsageType.API_CALL,
      resourceType: 'api_key_creation',
      metadata: {
        keyId,
        keyName: request.name,
        scopes: request.scopes
      }
    });

    return {
      keyId,
      apiKey, // Only returned during creation
      name: request.name,
      scopes: request.scopes,
      expiresAt
    };

  } catch (error) {
    console.error('Failed to create API key:', error);
    throw new Error('Failed to create API key');
  }
}

/**
 * Validate API key
 */
export async function validateAPIKey(apiKey: string): Promise<ValidateAPIKeyResult> {
  try {
    // Extract key ID
    const keyId = extractKeyId(apiKey);
    if (!keyId) {
      return { valid: false, error: 'Invalid API key format' };
    }

    // Find key in database
    const keyData = await prisma.apiKey.findUnique({
      where: { keyId, organization: { deletedAt: null }, user: { deletedAt: null } }
    });

    if (!keyData) {
      return { valid: false, error: 'API key not found' };
    }

    // Check if key is active
    if (!keyData.isActive) {
      return { valid: false, error: 'API key is inactive' };
    }

    // Check expiration
    if (keyData.expiresAt < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }

    // Verify key hash using timing-safe comparison
    const providedHash = hashAPIKey(apiKey);
    const storedHash = keyData.hashedKey;

    const providedBuffer = Buffer.from(providedHash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (providedBuffer.length !== storedBuffer.length) {
      return { valid: false, error: 'Invalid API key' };
    }

    const isValid = timingSafeEqual(providedBuffer, storedBuffer);

    if (!isValid) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { keyId },
      data: { lastUsedAt: new Date(), usageCount: { increment: 1 } }
    });

    // Track usage
    await UsageTrackingService.trackUsage({
      userId: keyData.userId,
      organizationId: keyData.organizationId,
      usageType: UsageType.API_CALL,
      resourceType: 'api_key_usage',
      metadata: {
        keyId,
        keyName: keyData.name
      }
    });

    // Return key data without hash
    const { hashedKey, ...safeKeyData } = keyData;

    return {
      valid: true,
      keyData: { ...safeKeyData, scopes: parseScopes(safeKeyData.scopes) }
    };

  } catch (error) {
    console.error('Failed to validate API key:', error);
    return { valid: false, error: 'API key validation failed' };
  }
}

/**
 * Check if API key has required scope
 */
export function hasScope(keyData: APIKeyData, requiredScope: APIKeyScope): boolean {
  // Admin scope grants all permissions
  if (keyData.scopes.includes('admin:all')) {
    return true;
  }

  return keyData.scopes.includes(requiredScope);
}

/**
 * List API keys for organization
 */
export async function listAPIKeys(organizationId: string): Promise<Omit<APIKeyData, 'hashedKey'>[]> {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' }
    });

    return keys.map(({ hashedKey, ...keyData }) => ({ ...keyData, scopes: parseScopes(keyData.scopes) }));

  } catch (error) {
    console.error('Failed to list API keys:', error);
    throw new Error('Failed to list API keys');
  }
}

/**
 * Revoke API key
 */
export async function revokeAPIKey(keyId: string, organizationId: string): Promise<void> {
  try {
    const keyData = await prisma.apiKey.findUnique({
      where: { keyId }
    });

    if (!keyData || keyData.organizationId !== organizationId) {
      throw new Error('API key not found');
    }

    await prisma.apiKey.update({
      where: { keyId },
      data: { isActive: false }
    });

    // Track usage
    await UsageTrackingService.trackUsage({
      userId: keyData.userId,
      organizationId: keyData.organizationId,
      usageType: UsageType.API_CALL,
      resourceType: 'api_key_revocation',
      metadata: {
        keyId,
        keyName: keyData.name
      }
    });

  } catch (error) {
    console.error('Failed to revoke API key:', error);
    throw new Error('Failed to revoke API key');
  }
}

/**
 * Rotate API key (generate new key, revoke old one)
 */
export async function rotateAPIKey(
  keyId: string,
  organizationId: string
): Promise<CreateAPIKeyResponse> {
  try {
    const oldKeyData = await prisma.apiKey.findUnique({
      where: { keyId }
    });

    if (!oldKeyData || oldKeyData.organizationId !== organizationId) {
      throw new Error('API key not found');
    }

    // Create new key with same properties
    const newKey = await createAPIKey({
      name: oldKeyData.name,
      scopes: oldKeyData.scopes as APIKeyScope[],
      organizationId: oldKeyData.organizationId,
      userId: oldKeyData.userId,
      expiresAt: oldKeyData.expiresAt
    });

    // Revoke old key
    await revokeAPIKey(keyId, organizationId);

    return newKey;

  } catch (error) {
    console.error('Failed to rotate API key:', error);
    throw new Error('Failed to rotate API key');
  }
}

/**
 * Get API key usage statistics
 */
export async function getAPIKeyUsage(
  keyId: string,
  organizationId: string,
  days: number = 30
): Promise<{
  totalRequests: number;
  lastUsed: Date | null;
  requestsByDay: { date: string; count: number }[];
}> {
  try {
    const keyData = await prisma.apiKey.findUnique({
      where: { keyId }
    });

    if (!keyData || keyData.organizationId !== organizationId) {
      throw new Error('API key not found');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get usage events from usage tracking
    const usageEvents = await prisma.usageRecord.findMany({
      where: {
        organizationId,
        usageType: UsageType.API_CALL,
      resourceType: 'api_key_usage',
        createdAt: { gte: since },
        metadata: {
          path: ['keyId'],
          equals: keyId
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate statistics
    const totalRequests = usageEvents.length;
    const lastUsed = keyData.lastUsedAt;

    // Group by day
    const requestsByDay: { [date: string]: number } = {};

    usageEvents.forEach(event => {
      const date = event.createdAt.toISOString().split('T')[0];
      requestsByDay[date] = (requestsByDay[date] || 0) + 1;
    });

    const requestsByDayArray = Object.entries(requestsByDay).map(([date, count]) => ({
      date,
      count
    }));

    return {
      totalRequests,
      lastUsed,
      requestsByDay: requestsByDayArray
    };

  } catch (error) {
    console.error('Failed to get API key usage:', error);
    throw new Error('Failed to get API key usage');
  }
}

/**
 * Extract API key from request headers
 */
export function extractAPIKeyFromRequest(request: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7).startsWith(API_KEY_PREFIX)) {
    return authHeader.slice(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers.get('x-api-key');
  if (apiKeyHeader?.startsWith(API_KEY_PREFIX)) {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Scope validation helpers
 */
export const SCOPE_DESCRIPTIONS: Record<APIKeyScope, string> = {
  'read:profile': 'Read user and organization profile information',
  'write:profile': 'Modify user and organization profile information',
  'read:opportunities': 'Access opportunity search and details',
  'read:match-scores': 'Calculate and read match scores',
  'write:match-scores': 'Modify match score algorithms and weights',
  'read:organizations': 'Read organization information',
  'write:organizations': 'Modify organization settings and members',
  'read:usage': 'Access usage analytics and billing information',
  'admin:all': 'Full administrative access to all resources'
};

export const SCOPE_HIERARCHIES: Record<APIKeyScope, APIKeyScope[]> = {
  'admin:all': ['read:profile', 'write:profile', 'read:opportunities', 'read:match-scores', 'write:match-scores', 'read:organizations', 'write:organizations', 'read:usage'],
  'write:profile': ['read:profile'],
  'write:match-scores': ['read:match-scores'],
  'write:organizations': ['read:organizations'],
  'read:profile': [],
  'read:opportunities': [],
  'read:match-scores': [],
  'read:organizations': [],
  'read:usage': []
};
