/**
 * API Keys Management Endpoint
 *
 * GET /api/api-keys - List API keys for organization
 * POST /api/api-keys - Create new API key
 *
 * Provides CRUD operations for API key management
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAPIKey, listAPIKeys, APIKeyScope } from '@/lib/api-keys';
import { getCurrentUser } from '@/lib/auth';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { validateCSRFInAPIRoute } from '@/lib/csrf';
import { asyncHandler, commonErrors, createSuccessResponse, createErrorResponse, AuthorizationError, ValidationError } from '@/lib/api-errors';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';

/**
 * @swagger
 * /api/api-keys:
 *   get:
 *     summary: List API keys
 *     description: Retrieve all API keys for the authenticated user's organization
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keys:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       keyId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       scopes:
 *                         type: array
 *                         items:
 *                           type: string
 *                       isActive:
 *                         type: boolean
 *                       lastUsedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export const GET = asyncHandler(async (request: NextRequest) => {
  // Check authentication
  const { userId } = await auth();
  if (!userId) {
    throw commonErrors.unauthorized();
  }

  // Get current user and organization
  const user = await getCurrentUser();
  if (!user) {
    throw commonErrors.notFound('User');
  }

  // List API keys for organization
  const keys = await listAPIKeys(user.organizationId);

  // Track usage
  await UsageTrackingService.trackUsage({
    userId: user.id,
    organizationId: user.organizationId,
    usageType: UsageType.API_CALL,
      resourceType: 'api_key_list',
    metadata: {
      keysCount: keys.length,
      endpoint: '/api/api-keys'
    }
  });

  // Log API key list operation for audit trail
  try {
    await crudAuditLogger.logAPIKeyOperation(
      'READ',
      'list-all-keys',
      'API Key List',
      null,
      { keysCount: keys.length, activeKeys: keys.filter(k => k.isActive).length },
      {
        endpoint: '/api/v1/api-keys',
        method: 'GET',
        organizationId: user.organizationId,
        userAgent: request.headers.get('user-agent'),
        ipAddress: request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  'unknown'
      }
    );
  } catch (auditError) {
    console.error('Failed to create API key list audit log:', auditError);
  }

  return createSuccessResponse({
    keys: keys.map(key => ({
      id: key.id,
      keyId: key.keyId,
      name: key.name,
      scopes: key.scopes,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      usageCount: key.usageCount
    }))
  });
})

/**
 * @swagger
 * /api/api-keys:
 *   post:
 *     summary: Create API key
 *     description: Create a new API key for programmatic access
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - scopes
 *             properties:
 *               name:
 *                 type: string
 *                 description: Human-readable name for the API key
 *                 example: "Production Integration"
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read:profile, write:profile, read:opportunities, read:match-scores, write:match-scores, read:organizations, write:organizations, read:usage, admin:all]
 *                 description: Array of permission scopes
 *                 example: ["read:profile", "read:opportunities"]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Optional expiration date (defaults to 1 year)
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keyId:
 *                   type: string
 *                 apiKey:
 *                   type: string
 *                   description: The actual API key (only shown once)
 *                 name:
 *                   type: string
 *                 scopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                 warning:
 *                   type: string
 *                   description: Important security warning
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export const POST = asyncHandler(async (request: NextRequest) => {
  // Validate CSRF token
  const csrfValidation = await validateCSRFInAPIRoute(request);
  if (!csrfValidation.valid) {
    throw new AuthorizationError(csrfValidation.error);
  }

  // Check authentication
  const { userId } = await auth();
  if (!userId) {
    throw commonErrors.unauthorized();
  }

  // Get current user and organization
  const user = await getCurrentUser();
  if (!user) {
    throw commonErrors.notFound('User');
  }

  // Check permissions (only ADMIN and OWNER can create API keys)
  if (!['ADMIN', 'OWNER'].includes(user.role)) {
    throw commonErrors.forbidden();
  }

  // Parse request body
  const body = await request.json();
  const { name, scopes, expiresAt } = body;

  // Validate input
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('API key name is required');
  }

  if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
    throw new ValidationError('At least one scope is required');
  }

  // Validate scopes
  const validScopes: APIKeyScope[] = [
    'read:profile',
    'write:profile',
    'read:opportunities',
    'read:match-scores',
    'write:match-scores',
    'read:organizations',
    'write:organizations',
    'read:usage',
    'admin:all'
  ];

  const invalidScopes = scopes.filter((scope: string) => !validScopes.includes(scope as APIKeyScope));
  if (invalidScopes.length > 0) {
    throw new ValidationError('Invalid scopes provided', {
      invalidScopes,
      validScopes
    });
  }

  // Validate expiration date
  let parsedExpiresAt: Date | undefined;
  if (expiresAt) {
    parsedExpiresAt = new Date(expiresAt);
    if (isNaN(parsedExpiresAt.getTime())) {
      throw new ValidationError('Invalid expiration date format');
    }

    // Check if expiration is in the future
    if (parsedExpiresAt <= new Date()) {
      throw new ValidationError('Expiration date must be in the future');
    }

    // Limit maximum expiration to 2 years
    const maxExpiration = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
    if (parsedExpiresAt > maxExpiration) {
      throw new ValidationError('Maximum expiration period is 2 years');
    }
  }

  // Create API key
  const apiKeyResponse = await createAPIKey({
    name: name.trim(),
    scopes: scopes as APIKeyScope[],
    organizationId: user.organizationId,
    userId: user.id,
    expiresAt: parsedExpiresAt
  });

  // Track usage
  await UsageTrackingService.trackUsage({
    userId: user.id,
    organizationId: user.organizationId,
    usageType: UsageType.API_CALL,
      resourceType: 'api_key_creation',
    metadata: {
      keyId: apiKeyResponse.keyId,
      keyName: apiKeyResponse.name,
      scopes: apiKeyResponse.scopes,
      endpoint: '/api/api-keys'
    }
  });

  // Log API key creation for audit trail
  try {
    await crudAuditLogger.logAPIKeyOperation(
      'CREATE',
      apiKeyResponse.keyId,
      apiKeyResponse.name,
      null,
      {
        keyId: apiKeyResponse.keyId,
        name: apiKeyResponse.name,
        scopes: apiKeyResponse.scopes,
        expiresAt: apiKeyResponse.expiresAt,
        isActive: true,
        // Never log the actual key
        key: '[REDACTED]',
        hashedKey: '[REDACTED]'
      },
      {
        endpoint: '/api/v1/api-keys',
        method: 'POST',
        organizationId: user.organizationId,
        userAgent: request.headers.get('user-agent'),
        ipAddress: request.headers.get('x-forwarded-for') ||
                  request.headers.get('x-real-ip') ||
                  'unknown',
        securityLevel: 'HIGH',
        action: 'api_key_generation'
      }
    );
  } catch (auditError) {
    console.error('Failed to create API key creation audit log:', auditError);
  }

  return createSuccessResponse({
    ...apiKeyResponse,
    warning: 'Store this API key securely. It will not be shown again.'
  }, 'API key created successfully', 201);
})
