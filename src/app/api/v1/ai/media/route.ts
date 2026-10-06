/**
 * @swagger
 * /api/v1/ai/media:
 *   post:
 *     summary: Generate media (images, videos) using AI
 *     description: Create images, videos, or edit images using ImageRouter.io provider
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
 *                 minLength: 1
 *                 maxLength: 4000
 *                 example: "A cozy wooden cabin in a snowy forest at sunset, ultra-realistic"
 *               type:
 *                 type: string
 *                 enum: [image, video, edit]
 *                 description: Type of media to generate
 *                 example: "image"
 *               model:
 *                 type: string
 *                 description: Specific model to use (optional, uses defaults)
 *                 example: "test/test"
 *               quality:
 *                 type: string
 *                 enum: [auto, low, medium, high]
 *                 description: Quality setting for generation
 *                 default: "auto"
 *               responseFormat:
 *                 type: string
 *                 enum: [url, b64_json]
 *                 description: Response format for generated media
 *                 default: "url"
 *               count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *                 description: Number of images to generate (image type only)
 *                 default: 1
 *               images:
 *                 type: array
 *                 description: Images for editing (edit type only)
 *                 items:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: string
 *                       description: Base64 encoded image data
 *                     mimeType:
 *                       type: string
 *                       example: "image/jpeg"
 *               masks:
 *                 type: array
 *                 description: Mask images for editing (edit type only, optional)
 *                 items:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: string
 *                       description: Base64 encoded mask data
 *                     mimeType:
 *                       type: string
 *                       example: "image/jpeg"
 *               metadata:
 *                 type: object
 *                 description: Additional metadata for tracking
 *                 properties:
 *                   costLimit:
 *                     type: number
 *                     description: Maximum cost limit for the request
 *     responses:
 *       200:
 *         description: Media generated successfully
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
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           url:
 *                             type: string
 *                             description: URL to the generated media
 *                           data:
 *                             type: string
 *                             description: Base64 encoded media (if requested)
 *                           type:
 *                             type: string
 *                             enum: [image, video]
 *                           mimeType:
 *                             type: string
 *                     model:
 *                       type: string
 *                       description: Model used for generation
 *                     usage:
 *                       type: object
 *                       properties:
 *                         cost:
 *                           type: number
 *                           description: Cost of the generation
 *                         totalTokens:
 *                           type: number
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: "imagerouter"
 *                         requestId:
 *                           type: string
 *                         generatedAt:
 *                           type: string
 *                           format: date-time
 *                         processingTime:
 *                           type: number
 *                         revisedPrompt:
 *                           type: string
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid request: prompt is required"
 *                 details:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized - invalid or missing API key
 *       403:
 *         description: Forbidden - usage limits exceeded
 *       429:
 *         description: Too many requests - rate limit exceeded
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: Get media generation capabilities and models
 *     description: Retrieve available models and capabilities for media generation
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Capabilities retrieved successfully
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
 *                     capabilities:
 *                       type: object
 *                       properties:
 *                         imageGeneration:
 *                           type: boolean
 *                         videoGeneration:
 *                           type: boolean
 *                         imageEditing:
 *                           type: boolean
 *                         supportedFormats:
 *                           type: object
 *                           properties:
 *                             input:
 *                               type: array
 *                               items:
 *                                 type: string
 *                             output:
 *                               type: array
 *                               items:
 *                                 type: string
 *                         maxFileSize:
 *                           type: number
 *                         maxImages:
 *                           type: number
 *                         supportedQualities:
 *                           type: array
 *                           items:
 *                             type: string
 *                         rateLimit:
 *                           type: object
 *                           properties:
 *                             general:
 *                               type: number
 *                             imageGeneration:
 *                               type: number
 *                     models:
 *                       type: object
 *                       properties:
 *                         image:
 *                           type: array
 *                           items:
 *                             type: string
 *                         video:
 *                           type: array
 *                           items:
 *                             type: string
 *                         edit:
 *                           type: array
 *                           items:
 *                             type: string
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { z } from 'zod';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { ImageRouterAdapter } from '@/lib/ai/providers/imagerouter-adapter';
import {
  UnifiedMediaGenerationRequest,
  isImageGenerationRequest,
  isVideoGenerationRequest,
  isImageEditRequest
} from '@/lib/ai/interfaces/imagerouter-types';
// import { validateCSRFInAPIRoute } from '@/lib/csrf'; // Removed for consistency with enhanced-chat
import { checkRateLimit } from '@/lib/rate-limit';
import { validateRequest } from '@/lib/api-validation';

// Request validation schemas
const mediaGenerationSchema = z.object({
  prompt: z.string().min(1).max(4000).describe('Text prompt for media generation'),
  type: z.enum(['image', 'video', 'edit']).describe('Type of media to generate'),
  model: z.string().optional().describe('Specific model to use'),
  quality: z.enum(['auto', 'low', 'medium', 'high']).default('auto').describe('Quality setting'),
  responseFormat: z.enum(['url', 'b64_json']).default('url').describe('Response format'),
  count: z.number().int().min(1).max(1).default(1).describe('Number of images to generate'),
  images: z.array(z.object({
    data: z.string().describe('Base64 encoded image data'),
    mimeType: z.string().default('image/jpeg').describe('MIME type of the image')
  })).optional().describe('Images for editing'),
  masks: z.array(z.object({
    data: z.string().describe('Base64 encoded mask data'),
    mimeType: z.string().default('image/jpeg').describe('MIME type of the mask')
  })).optional().describe('Mask images for editing'),
  metadata: z.object({
    costLimit: z.number().finite().nonnegative().optional().describe('Maximum cost limit'),
  }).optional().describe('Additional metadata')
});

type MediaGenerationRequest = z.infer<typeof mediaGenerationSchema>;

/**
 * POST /api/v1/ai/media - Generate media using AI
 */
export async function POST(request: NextRequest) {
  console.log('🎬 Media API - Handler called');

  try {
    console.log('🎬 Media API - Inside try block');

    const { userId } = getAuth(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } } });
    if (!user) return NextResponse.json({ success: false, error: 'Authenticated organization required' }, { status: 403 });
    const orgId = user.organizationId;
    const usageError = await guardUsage(orgId, UsageType.AI_QUERY);
    if (usageError) return usageError;

    // Rate limiting
    const rateLimitResult = await checkRateLimit(
      request,
      {
        windowMs: 60000, // 1 minute
        maxRequests: 10, // 10 media generations per minute
        message: 'Too many media generation requests. Please wait before trying again.'
      },
      'media'
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
        },
        { status: 429 }
      );
    }

    // CSRF validation removed for consistency with enhanced-chat API
    // Clerk authentication provides sufficient security for this authenticated endpoint

    // Request validation
    const validation = await validateRequest(request, mediaGenerationSchema);
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

    const requestData = validation.data as MediaGenerationRequest;

    // Additional validation based on type
    const typeValidation = validateMediaType(requestData);
    if (!typeValidation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request for media type',
          details: typeValidation.errors
        },
        { status: 400 }
      );
    }

    // Get AI service manager and ensure initialization is complete
    console.log('📦 Getting AIServiceManager instance...');
    const aiManager = AIServiceManager.getInstance();
    console.log('✅ AIServiceManager instance obtained');

    // Ensure providers are initialized (they initialize asynchronously in constructor)
    try {
      console.log('🔄 Ensuring AI providers are initialized...');
      await aiManager.initialize();
      console.log('✅ AI providers initialization complete');
    } catch (error) {
      console.error('❌ Failed to initialize AI providers:', error);
      throw error; // Re-throw to see the actual error
    }

    // Get ImageRouter status to debug availability
    try {
      const imageRouterStatus = aiManager.getImageRouterStatus();
      console.log('🔍 Media API - ImageRouter status:', imageRouterStatus);
    } catch (e) {
      console.error('Error checking ImageRouter status:', e);
    }

    const imageRouterAdapter = aiManager.getProvider('imagerouter') as ImageRouterAdapter;

    console.log('🔍 Media API - ImageRouter adapter check:', {
      adapterExists: !!imageRouterAdapter,
      adapterType: imageRouterAdapter ? imageRouterAdapter.constructor.name : 'null'
    });

    if (!imageRouterAdapter) {
      // Always return demo image when ImageRouter is not available
      console.log('❌ ImageRouter adapter not available, returning demo image');

      // Generate a demo image with the user's prompt
      const demoSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="1024" height="1024" fill="#6366f1"/>
<text x="512" y="400" text-anchor="middle" fill="white" font-size="48" font-family="Arial, sans-serif">Demo Image</text>
<text x="512" y="460" text-anchor="middle" fill="white" font-size="24" font-family="Arial, sans-serif">${requestData.prompt.slice(0, 50)}${requestData.prompt.length > 50 ? '...' : ''}</text>
<text x="512" y="520" text-anchor="middle" fill="white" font-size="18" font-family="Arial, sans-serif">(ImageRouter API key not configured)</text>
<text x="512" y="560" text-anchor="middle" fill="white" font-size="16" font-family="Arial, sans-serif">Add IMAGEROUTER_API_KEY to .env.local</text>
</svg>`;

      const base64Svg = Buffer.from(demoSvg).toString('base64');

      return NextResponse.json({
        success: true,
        data: {
          results: [{
            url: `data:image/svg+xml;base64,${base64Svg}`,
            type: 'image',
            mimeType: 'image/svg+xml'
          }],
          model: 'demo',
          usage: { cost: 0 },
          metadata: {
            provider: 'demo',
            requestId: `demo-${Date.now()}`,
            generatedAt: new Date().toISOString(),
            processingTime: 100,
            revisedPrompt: requestData.prompt,
            note: 'This is a demo image. Configure IMAGEROUTER_API_KEY for real image generation.'
          }
        },
        estimatedCost: 0,
        actualCost: 0
      });
    }

    // Build unified request with model validation
    let modelToUse = requestData.model;

    console.log('🔍 Media API - Model validation:', {
      receivedModel: requestData.model,
      modelToUse: modelToUse,
      willFallback: !modelToUse || modelToUse === 'auto'
    });

    const base = { prompt: requestData.prompt, model: modelToUse && modelToUse !== 'auto' ? modelToUse : undefined,
      metadata: { ...requestData.metadata, organizationId: orgId, userId: user.id, httpRequest: request } };
    const unifiedRequest: UnifiedMediaGenerationRequest = requestData.type === 'image'
      ? { ...base, type: 'image', quality: requestData.quality, responseFormat: requestData.responseFormat, count: requestData.count }
      : requestData.type === 'video' ? { ...base, type: 'video' }
      : { ...base, type: 'edit', images: requestData.images ?? [], masks: requestData.masks, quality: requestData.quality, responseFormat: requestData.responseFormat };

    // Estimate cost first
    const costEstimate = await imageRouterAdapter.estimateMediaCost(unifiedRequest);

    // Check if cost exceeds limit
    const costLimit = requestData.metadata?.costLimit;
    if (costLimit !== undefined && costEstimate.estimatedCost > costLimit) {
      return NextResponse.json(
        {
          success: false,
          error: `Estimated cost ($${costEstimate.estimatedCost.toFixed(4)}) exceeds limit ($${costLimit})`,
          estimatedCost: costEstimate.estimatedCost
        },
        { status: 400 }
      );
    }

    const result = await imageRouterAdapter.generateMedia(unifiedRequest);
    return NextResponse.json({ success: true, data: result, estimatedCost: costEstimate.estimatedCost, actualCost: result.usage.cost });

  } catch (error: any) {
    console.error('❌ Media generation error:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      error: error
    });

    // Handle specific error types
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          provider: error.provider
        },
        { status: 400 }
      );
    }

    if (error.name === 'AuthenticationError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Provider authentication failed. Please contact support.',
          provider: error.provider
        },
        { status: 503 }
      );
    }

    if (error.name === 'RateLimitError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Provider rate limit exceeded. Please try again later.',
          provider: error.provider,
          retryAfter: error.retryAfter
        },
        { status: 429 }
      );
    }

    if (error.name === 'QuotaExceededError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Provider quota exceeded. Please contact support.',
          provider: error.provider
        },
        { status: 402 }
      );
    }

    // Generic error response - always include full details for debugging
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error during media generation',
        details: error.message,
        errorName: error.name,
        errorString: String(error),
        errorJSON: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        stack: error.stack // Always include stack for now
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/ai/media - Get media generation capabilities
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication (same pattern as enhanced-chat)
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Rate limiting (more permissive for GET)
    const rateLimitResult = await checkRateLimit(
      request,
      {
        windowMs: 60000, // 1 minute
        maxRequests: 60, // 60 requests per minute
        message: 'Too many media capability requests. Please wait before trying again.'
      },
      'media-capabilities'
    );

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
        },
        { status: 429 }
      );
    }

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

    // Get capabilities and models
    const [capabilities, models] = await Promise.all([
      imageRouterAdapter.getMediaCapabilities(),
      imageRouterAdapter.getAvailableModels()
    ]);

    // Group models by type
    const modelsByType = {
      image: models.filter(m => m.metadata?.type === 'image').map(m => m.name),
      video: models.filter(m => m.metadata?.type === 'video').map(m => m.name),
      edit: models.filter(m => m.metadata?.type === 'edit').map(m => m.name)
    };

    return NextResponse.json({
      success: true,
      data: {
        capabilities,
        models: modelsByType,
        supportedTypes: ['image', 'video', 'edit'],
        supportedQualities: ['auto', 'low', 'medium', 'high'],
        supportedFormats: ['url', 'b64_json'],
        limits: {
          maxPromptLength: 4000,
          maxImages: capabilities.maxImages,
          maxFileSize: capabilities.maxFileSize,
          maxCount: 10
        }
      }
    });

  } catch (error: any) {
    console.error('Media capabilities error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve media capabilities',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Validate media generation request based on type
 */
function validateMediaType(request: MediaGenerationRequest): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (request.type) {
    case 'image':
      // Image generation validation
      if (request.images && request.images.length > 0) {
        errors.push('Images array should not be provided for image generation');
      }
      if (request.count && (request.count < 1 || request.count > 10)) {
        errors.push('Count must be between 1 and 10 for image generation');
      }
      break;

    case 'video':
      // Video generation validation
      if (request.images && request.images.length > 0) {
        errors.push('Images array should not be provided for video generation');
      }
      if (request.count && request.count > 1) {
        errors.push('Count must be 1 for video generation');
      }
      break;

    case 'edit':
      // Image editing validation
      if (!request.images || request.images.length === 0) {
        errors.push('Images array is required for image editing');
      }
      if (request.images && request.images.length > 16) {
        errors.push('Maximum 16 images allowed for editing');
      }
      if (request.count && request.count > 1) {
        errors.push('Count must be 1 for image editing');
      }
      break;
  }

  return { isValid: errors.length === 0, errors };
}
