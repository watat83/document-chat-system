/**
 * Individual API Key Management Endpoint
 * 
 * GET /api/api-keys/[keyId] - Get API key details
 * PATCH /api/api-keys/[keyId] - Update API key
 * DELETE /api/api-keys/[keyId] - Revoke API key
 * POST /api/api-keys/[keyId]/rotate - Rotate API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { revokeAPIKey, rotateAPIKey, getAPIKeyUsage } from '@/lib/api-keys';
import { getCurrentUser } from '@/lib/auth';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { validateCSRFInAPIRoute } from '@/lib/csrf';
import { PrismaClient } from '@prisma/client';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';

const prisma = new PrismaClient();

interface RouteParams {
  params: Promise<{
    keyId: string;
  }>;
}

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   get:
 *     summary: Get API key details
 *     description: Retrieve details and usage statistics for a specific API key
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: keyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The API key identifier
 *     responses:
 *       200:
 *         description: API key details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: object
 *                   properties:
 *                     keyId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     scopes:
 *                       type: array
 *                       items:
 *                         type: string
 *                     isActive:
 *                       type: boolean
 *                     lastUsedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                 usage:
 *                   type: object
 *                   properties:
 *                     totalRequests:
 *                       type: number
 *                     lastUsed:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     requestsByDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           count:
 *                             type: number
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export async function GET(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get current user and organization
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const { keyId } = params;

    // Get API key details
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyId }
    });

    if (!apiKey || apiKey.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    // Get usage statistics
    const usage = await getAPIKeyUsage(keyId, user.organizationId);

    // Track access
    await UsageTrackingService.trackUsage({
      userId: user.id,
      organizationId: user.organizationId,
      type: 'API_KEY_VIEW',
      metadata: {
        keyId,
        keyName: apiKey.name,
        endpoint: `/api/api-keys/${keyId}`
      }
    });

    // Log API key access for audit trail
    try {
      await crudAuditLogger.logAPIKeyOperation(
        'READ',
        keyId,
        apiKey.name,
        null,
        {
          keyId: apiKey.keyId,
          name: apiKey.name,
          scopes: apiKey.scopes,
          isActive: apiKey.isActive,
          lastUsedAt: apiKey.lastUsedAt,
          expiresAt: apiKey.expiresAt,
          usageCount: usage.totalRequests,
          // Never log sensitive data
          key: '[REDACTED]',
          hashedKey: '[REDACTED]'
        },
        {
          endpoint: `/api/v1/api-keys/${keyId}`,
          method: 'GET',
          organizationId: user.organizationId,
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown',
          action: 'api_key_detail_access'
        }
      );
    } catch (auditError) {
      console.error('Failed to create API key access audit log:', auditError);
    }

    // Return key details without hash
    const { hashedKey, ...safeKeyData } = apiKey;

    return NextResponse.json({
      key: safeKeyData,
      usage
    });

  } catch (error) {
    console.error('Failed to get API key details:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get API key details',
        details: process.env.NODE_ENV === 'development' 
          ? (error as Error).message 
          : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/api-keys/{keyId}:
 *   delete:
 *     summary: Revoke API key
 *     description: Permanently revoke an API key (cannot be undone)
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: keyId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The API key identifier
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 keyId:
 *                   type: string
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export async function DELETE(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Validate CSRF token
    const csrfValidation = await validateCSRFInAPIRoute(request);
    if (!csrfValidation.valid) {
      return NextResponse.json(
        { error: csrfValidation.error },
        { status: 403 }
      );
    }

    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get current user and organization
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check permissions
    if (!['ADMIN', 'OWNER'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions to revoke API keys' },
        { status: 403 }
      );
    }

    const { keyId } = params;

    // Get API key details before deletion for audit trail
    const apiKeyToDelete = await prisma.apiKey.findUnique({
      where: { keyId },
      select: {
        id: true,
        keyId: true,
        name: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        organizationId: true
      }
    });

    if (!apiKeyToDelete || apiKeyToDelete.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    // Revoke API key
    await revokeAPIKey(keyId, user.organizationId);

    // Log API key revocation for audit trail
    try {
      await crudAuditLogger.logAPIKeyOperation(
        'DELETE',
        keyId,
        apiKeyToDelete.name,
        apiKeyToDelete,
        null, // No current data after deletion
        {
          endpoint: `/api/v1/api-keys/${keyId}`,
          method: 'DELETE',
          organizationId: user.organizationId,
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown',
          securityLevel: 'CRITICAL',
          action: 'api_key_revocation'
        }
      );
    } catch (auditError) {
      console.error('Failed to create API key revocation audit log:', auditError);
    }

    // Track usage
    await UsageTrackingService.trackUsage({
      userId: user.id,
      organizationId: user.organizationId,
      type: 'API_KEY_REVOCATION',
      metadata: {
        keyId,
        endpoint: `/api/api-keys/${keyId}`
      }
    });

    return NextResponse.json({
      message: 'API key revoked successfully',
      keyId
    });

  } catch (error) {
    console.error('Failed to revoke API key:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to revoke API key',
        details: process.env.NODE_ENV === 'development' 
          ? (error as Error).message 
          : undefined
      },
      { status: 500 }
    );
  }
}