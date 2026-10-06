/**
 * API Key Rotation Endpoint
 * 
 * POST /api/api-keys/[keyId]/rotate - Rotate API key
 * 
 * Generates a new API key with the same permissions and revokes the old one
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { rotateAPIKey } from '@/lib/api-keys';
import { getCurrentUser } from '@/lib/auth';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { validateCSRFInAPIRoute } from '@/lib/csrf';
import { crudAuditLogger } from '@/lib/audit/crud-audit-logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RouteParams {
  params: Promise<{
    keyId: string;
  }>;
}

/**
 * @swagger
 * /api/api-keys/{keyId}/rotate:
 *   post:
 *     summary: Rotate API key
 *     description: Generate a new API key with the same permissions and revoke the old one
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
 *         description: The API key identifier to rotate
 *     responses:
 *       200:
 *         description: API key rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keyId:
 *                   type: string
 *                   description: New key identifier
 *                 apiKey:
 *                   type: string
 *                   description: New API key (only shown once)
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
 *                 oldKeyId:
 *                   type: string
 *                   description: The revoked key identifier
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export async function POST(request: NextRequest, props: RouteParams) {
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
        { error: 'Insufficient permissions to rotate API keys' },
        { status: 403 }
      );
    }

    const { keyId: oldKeyId } = params;

    // Get old API key details before rotation for audit trail
    const oldApiKey = await prisma.apiKey.findUnique({
      where: { keyId: oldKeyId },
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

    if (!oldApiKey || oldApiKey.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    // Rotate API key
    const newKeyResponse = await rotateAPIKey(oldKeyId, user.organizationId);

    // Log API key rotation for audit trail
    try {
      await crudAuditLogger.logAPIKeyOperation(
        'UPDATE',
        oldKeyId,
        oldApiKey.name,
        oldApiKey,
        {
          oldKeyId: oldKeyId,
          newKeyId: newKeyResponse.keyId,
          name: newKeyResponse.name,
          scopes: newKeyResponse.scopes,
          expiresAt: newKeyResponse.expiresAt,
          isActive: true,
          // Never log actual keys
          oldKey: '[REDACTED]',
          newKey: '[REDACTED]',
          hashedKey: '[REDACTED]'
        },
        {
          endpoint: `/api/v1/api-keys/${oldKeyId}/rotate`,
          method: 'POST',
          organizationId: user.organizationId,
          userAgent: request.headers.get('user-agent'),
          ipAddress: request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown',
          securityLevel: 'CRITICAL',
          action: 'api_key_rotation',
          isRotation: true
        }
      );
    } catch (auditError) {
      console.error('Failed to create API key rotation audit log:', auditError);
    }

    // Track usage
    await UsageTrackingService.trackUsage({
      userId: user.id,
      organizationId: user.organizationId,
      type: 'API_KEY_ROTATION',
      metadata: {
        oldKeyId,
        newKeyId: newKeyResponse.keyId,
        keyName: newKeyResponse.name,
        endpoint: `/api/api-keys/${oldKeyId}/rotate`
      }
    });

    return NextResponse.json({
      ...newKeyResponse,
      warning: 'Store this new API key securely. The old key has been revoked and this new key will not be shown again.',
      oldKeyId
    });

  } catch (error) {
    console.error('Failed to rotate API key:', error);
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to rotate API key',
        details: process.env.NODE_ENV === 'development' 
          ? errorMessage 
          : undefined
      },
      { status: 500 }
    );
  }
}