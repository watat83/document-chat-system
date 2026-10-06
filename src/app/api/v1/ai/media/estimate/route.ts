/**
 * @swagger
 * /api/v1/ai/media/estimate:
 *   post:
 *     summary: Estimate cost for media generation
 *     description: Get cost estimation for media generation before executing
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *               - type
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Text prompt for media generation
 *                 example: "A cozy wooden cabin in a snowy forest at sunset"
 *               type:
 *                 type: string
 *                 enum: [image, video, edit]
 *                 description: Type of media to generate
 *               model:
 *                 type: string
 *                 description: Specific model to use (optional)
 *               quality:
 *                 type: string
 *                 enum: [auto, low, medium, high]
 *                 default: "auto"
 *               count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 1
 *               imageCount:
 *                 type: integer
 *                 description: Number of images for editing (edit type only)
 *                 minimum: 1
 *                 maximum: 16
 *     responses:
 *       200:
 *         description: Cost estimation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     estimatedCost:
 *                       type: number
 *                       description: Total estimated cost in USD
 *                       example: 0.04
 *                     breakdown:
 *                       type: object
 *                       properties:
 *                         baseCost:
 *                           type: number
 *                         qualityMultiplier:
 *                           type: number
 *                         countMultiplier:
 *                           type: number
 *                         totalCost:
 *                           type: number
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: "imagerouter"
 *                         model:
 *                           type: string
 *                         type:
 *                           type: string
 *                         quality:
 *                           type: string
 *                         count:
 *                           type: number
 *                         usageCheck:
 *                           type: object
 *                           description: Current usage status
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { ImageRouterAdapter } from '@/lib/ai/providers/imagerouter-adapter';
import { UnifiedMediaGenerationRequest } from '@/lib/ai/interfaces/imagerouter-types';
import { rateLimit } from '@/lib/rate-limit';
import { validateRequest } from '@/lib/api-validation';

// Cost estimation request schema
const costEstimationSchema = z.object({
  prompt: z.string().min(1).max(4000).describe('Text prompt for media generation'),
  type: z.enum(['image', 'video', 'edit']).describe('Type of media to generate'),
  model: z.string().optional().describe('Specific model to use'),
  quality: z.enum(['auto', 'low', 'medium', 'high']).default('auto').describe('Quality setting'),
  count: z.number().int().min(1).max(10).default(1).describe('Number of images to generate'),
  imageCount: z.number().int().min(1).max(16).optional().describe('Number of images for editing')
});

type CostEstimationRequest = z.infer<typeof costEstimationSchema>;

/**
 * POST /api/v1/ai/media/estimate - Estimate cost for media generation
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } } });
    if (!user) return NextResponse.json({ success: false, error: 'Authenticated organization required' }, { status: 403 });

    // Rate limiting (more permissive for cost estimation)
    const rateLimitResult = await rateLimit(request, {
      keyGenerator: () => `rate_limit:media-estimate:${userId}`,
      windowMs: 60000, // 1 minute
      maxRequests: 100, // 100 cost estimations per minute
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.max(1, Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000))
        },
        { status: 429 }
      );
    }

    // Request validation
    const validation = await validateRequest(request, costEstimationSchema);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request format',
          details: validation.error
        },
        { status: 400 }
      );
    }

    const requestData = validation.data as CostEstimationRequest;

    // Get AI service manager and ImageRouter adapter
    const aiManager = AIServiceManager.getInstance();
    const imageRouterAdapter = aiManager.getProvider('imagerouter') as ImageRouterAdapter;

    if (!imageRouterAdapter) {
      return NextResponse.json(
        {
          success: false,
          error: 'ImageRouter provider not available'
        },
        { status: 503 }
      );
    }

    const base = { prompt: requestData.prompt, model: requestData.model, metadata: { organizationId: user.organizationId, userId: user.id } };
    const unifiedRequest: UnifiedMediaGenerationRequest = requestData.type === 'image'
      ? { ...base, type: 'image', quality: requestData.quality, count: requestData.count }
      : requestData.type === 'video' ? { ...base, type: 'video' }
      : { ...base, type: 'edit', images: Array.from({ length: requestData.imageCount ?? 1 }, () => ({ data: 'estimation-only', mimeType: 'image/jpeg' })), quality: requestData.quality };

    // Get cost estimate
    const costEstimate = await imageRouterAdapter.estimateMediaCost(unifiedRequest);

    // Return estimation
    return NextResponse.json({
      success: true,
      data: costEstimate
    });

  } catch (error: any) {
    console.error('Media cost estimation error:', error);

    // Handle specific error types
    if (error.message?.includes('Usage limit exceeded')) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          canProceed: false
        },
        { status: 403 }
      );
    }

    // Generic error response
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to estimate media generation cost',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
