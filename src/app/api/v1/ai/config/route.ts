import { isPlatformAdmin } from '@/lib/security/platform-admin';
import { NextRequest, NextResponse } from 'next/server';
import { AIServiceManager } from '@/lib/ai';
import { auth } from '@clerk/nextjs/server';
import { handleApiError } from '@/lib/api-errors';
import { z } from 'zod';

// Use the singleton instance
function getAIService(): AIServiceManager {
  return AIServiceManager.getInstance();
}

const configUpdateSchema = z.object({
  maxConcurrentRequests: z.number().min(1).max(1000).optional(),
  defaultTimeout: z.number().min(1000).max(120000).optional(),
  enableFallback: z.boolean().optional(),
  enableCircuitBreaker: z.boolean().optional(),
  enableCaching: z.boolean().optional(),
  costLimits: z.object({
    dailyLimit: z.number().min(0).optional(),
    monthlyLimit: z.number().min(0).optional(),
    perRequestLimit: z.number().min(0).optional()
  }).optional()
});

/**
 * @swagger
 * /api/ai/config:
 *   get:
 *     summary: Get AI service configuration
 *     description: Retrieve current AI service configuration, validation status, and capabilities
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuration:
 *                   type: object
 *                   properties:
 *                     maxConcurrentRequests:
 *                       type: number
 *                       example: 100
 *                     defaultTimeout:
 *                       type: number
 *                       example: 30000
 *                     enableFallback:
 *                       type: boolean
 *                       example: true
 *                     enableCircuitBreaker:
 *                       type: boolean
 *                       example: true
 *                     enableCaching:
 *                       type: boolean
 *                       example: true
 *                     configuredProviders:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["openai", "anthropic", "google"]
 *                 validation:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                 capabilities:
 *                   type: object
 *                   properties:
 *                     totalProviders:
 *                       type: number
 *                     availableFeatures:
 *                       type: array
 *                       items:
 *                         type: string
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update AI service configuration
 *     description: Update AI service configuration settings with validation
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxConcurrentRequests:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 1000
 *                 description: Maximum concurrent AI requests
 *               defaultTimeout:
 *                 type: number
 *                 minimum: 1000
 *                 maximum: 120000
 *                 description: Default timeout in milliseconds
 *               enableFallback:
 *                 type: boolean
 *                 description: Enable provider fallback
 *               enableCircuitBreaker:
 *                 type: boolean
 *                 description: Enable circuit breaker protection
 *               enableCaching:
 *                 type: boolean
 *                 description: Enable response caching
 *               costLimits:
 *                 type: object
 *                 properties:
 *                   dailyLimit:
 *                     type: number
 *                     minimum: 0
 *                   monthlyLimit:
 *                     type: number
 *                     minimum: 0
 *                   perRequestLimit:
 *                     type: number
 *                     minimum: 0
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 configuration:
 *                   type: object
 *                 validation:
 *                   type: object
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid configuration parameters or validation failed
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Perform AI configuration actions
 *     description: Reload, validate, or reset AI service configuration
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [reload, validate, reset]
 *                 description: Action to perform on configuration
 *     responses:
 *       200:
 *         description: Action completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 configuration:
 *                   type: object
 *                 validation:
 *                   type: object
 *                 reloadedAt:
 *                   type: string
 *                   format: date-time
 *                 validatedAt:
 *                   type: string
 *                   format: date-time
 *                 resetAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid action
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const aiService = getAIService();
    const configuration = aiService.getConfiguration();
    const validation = aiService.validateConfiguration();
    const configuredProviders = aiService.getConfiguredProviders();

    return NextResponse.json({
      configuration: {
        ...configuration,
        // Remove any sensitive information
        configuredProviders
      },
      validation,
      capabilities: {
        totalProviders: configuredProviders.length,
        availableFeatures: [
          'multi-provider-routing',
          'circuit-breaker',
          'fallback-strategies',
          'cost-optimization',
          'real-time-metrics'
        ]
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI configuration fetch failed:', error);
    return handleApiError(error);
  }
}


export async function PUT(_request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPlatformAdmin(userId)) return NextResponse.json({ error: 'Platform administrator access required' }, { status: 403 });
  return NextResponse.json({ error: 'AI configuration is deployment controlled. Update server environment settings and redeploy.' }, { status: 405, headers: { Allow: 'GET' } });
}
export async function POST(_request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPlatformAdmin(userId)) return NextResponse.json({ error: 'Platform administrator access required' }, { status: 403 });
  return NextResponse.json({ error: 'AI configuration is deployment controlled. Update server environment settings and redeploy.' }, { status: 405, headers: { Allow: 'GET' } });
}
