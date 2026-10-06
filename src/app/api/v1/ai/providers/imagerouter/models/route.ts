import { normalizeError } from '@/lib/errors/normalize-error';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cacheManager } from '@/lib/cache';
import { ImageRouterAdapter } from '@/lib/ai/providers/imagerouter-adapter';
import { imageRouter } from '@/lib/config/env';

/**
 * @swagger
 * /api/v1/ai/providers/imagerouter/models:
 *   get:
 *     summary: Get available models for ImageRouter (media generation)
 *     description: Fetches the list of available models for ImageRouter media generation, with caching support
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Models retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Model identifier
 *                   name:
 *                     type: string
 *                     description: Human-readable model name
 *                   description:
 *                     type: string
 *                     description: Model description
 *                   provider:
 *                     type: string
 *                     description: Provider name (imagerouter)
 *                   tier:
 *                     type: string
 *                     description: Performance tier
 *                   features:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Model capabilities (image-generation, video-generation, etc.)
 *                   costPer1KTokens:
 *                     type: object
 *                     properties:
 *                       prompt:
 *                         type: number
 *                       completion:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest) {
  try {
    // Check if this is an internal call from the /all endpoint
    const isInternalCall = request.headers.get('X-Internal-Call') === 'true' ||
                          request.headers.get('user-agent')?.includes('node') ||
                          request.url.includes('localhost');

    console.log('🔍 ImageRouter API - Is internal call:', isInternalCall);
    console.log('🔍 ImageRouter API - X-Internal-Call header:', request.headers.get('X-Internal-Call'));
    console.log('🔍 ImageRouter API - User agent:', request.headers.get('user-agent'));

    // For external calls, require authentication
    if (!isInternalCall) {
      const { userId } = await auth();

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      console.log('🔍 ImageRouter API - Skipping auth for internal call');
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('force') === 'true';

    // Check if ImageRouter is configured
    if (!imageRouter.apiKey) {
      console.log('⚠️ ImageRouter API key not configured, returning mock models for development');

      // Return mock models for development/testing
      const mockModels = [
        {
          id: 'openai/dall-e-3',
          name: 'DALL-E 3',
          description: 'Advanced image generation with improved quality and prompt adherence',
          provider: 'imagerouter',
          tier: 'powerful',
          features: ['image-generation', 'media-generation'],
          costPerPromptToken: 0.04,
          costPerCompletionToken: 0,
          quality: 95,
          speed: 70,
          cost: 4
        },
        {
          id: 'openai/dall-e-2',
          name: 'DALL-E 2',
          description: 'High-quality image generation and editing capabilities',
          provider: 'imagerouter',
          tier: 'balanced',
          features: ['image-generation', 'image-editing', 'media-generation'],
          costPerPromptToken: 0.02,
          costPerCompletionToken: 0,
          quality: 85,
          speed: 80,
          cost: 2
        },
        {
          id: 'midjourney/v6',
          name: 'Midjourney v6',
          description: 'Artistic image generation with exceptional creative capabilities',
          provider: 'imagerouter',
          tier: 'powerful',
          features: ['image-generation', 'media-generation'],
          costPerPromptToken: 0.03,
          costPerCompletionToken: 0,
          quality: 98,
          speed: 60,
          cost: 3
        },
        {
          id: 'stability/stable-diffusion-xl',
          name: 'Stable Diffusion XL',
          description: 'Open-source image generation with fine-tuning capabilities',
          provider: 'imagerouter',
          tier: 'balanced',
          features: ['image-generation', 'media-generation'],
          costPerPromptToken: 0.015,
          costPerCompletionToken: 0,
          quality: 80,
          speed: 90,
          cost: 1.5
        },
        {
          id: 'runwayml/gen-3-alpha',
          name: 'RunwayML Gen-3 Alpha',
          description: 'Advanced video generation from text prompts',
          provider: 'imagerouter',
          tier: 'powerful',
          features: ['video-generation', 'media-generation'],
          costPerPromptToken: 0.10,
          costPerCompletionToken: 0,
          quality: 90,
          speed: 40,
          cost: 10
        },
        {
          id: 'pika/v1',
          name: 'Pika Labs v1',
          description: 'Text-to-video generation with realistic motion',
          provider: 'imagerouter',
          tier: 'balanced',
          features: ['video-generation', 'media-generation'],
          costPerPromptToken: 0.08,
          costPerCompletionToken: 0,
          quality: 85,
          speed: 50,
          cost: 8
        }
      ];

      console.log(`✅ Returning ${mockModels.length} mock ImageRouter models for development`);
      return NextResponse.json(mockModels);
    }

    // Instead of using the complex adapter, make a direct API call as per ImageRouter documentation
    console.log('🎨 Making direct ImageRouter API call...');

    try {
      // Clear cache if force refresh is requested
      if (forceRefresh) {
        console.log('🗑️ Force refresh requested, clearing ImageRouter cache...');
        try {
          await cacheManager.invalidate('ai:imagerouter:models');
        } catch (caughtError) {
      const error = normalizeError(caughtError);
          console.warn('Could not clear cache:', error);
        }
      }

      // Direct API call as per ImageRouter documentation
      const url = 'https://api.imagerouter.io/v1/models';
      console.log('🌐 ImageRouter API URL:', url);
      console.log('🔑 API Key configured:', imageRouter.apiKey ? 'YES' : 'NO');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${imageRouter.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Document-Chat-System/1.0'
        }
      });

      console.log('📡 ImageRouter API Response Status:', response.status);
      console.log('📡 ImageRouter API Response Headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ImageRouter API Error:', response.status, errorText);
        throw new Error(`ImageRouter API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('🎨 Raw ImageRouter API Response:', data);

      // ImageRouter returns models as an object where keys are model IDs
      let models = [];
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Convert object format to array format
        const modelKeys = Object.keys(data);
        console.log(`✅ ImageRouter response is object with ${modelKeys.length} models`);
        console.log('🔍 Sample model keys:', modelKeys.slice(0, 5));

        models = modelKeys.map(modelId => ({
          id: modelId,
          name: modelId.split('/').pop() || modelId, // Get model name from ID
          ...data[modelId] // Spread the model data
        }));

        console.log(`✅ Converted ${models.length} ImageRouter models from object to array format`);
      } else if (Array.isArray(data)) {
        models = data;
        console.log('✅ ImageRouter response is direct array');
      } else if (data && Array.isArray(data.data)) {
        models = data.data;
        console.log('✅ ImageRouter response has data array');
      } else if (data && Array.isArray(data.models)) {
        models = data.models;
        console.log('✅ ImageRouter response has models array');
      } else if (data && typeof data === 'object' && Object.keys(data).length === 0) {
        console.warn('⚠️ ImageRouter returned empty object - likely API authentication issue');
        models = [];
      } else {
        console.warn('⚠️ Unexpected ImageRouter response structure:', data);
        console.warn('⚠️ Response type:', typeof data);
        console.warn('⚠️ Response keys:', data ? Object.keys(data) : 'null');
        models = [];
      }

      // Transform to UI format based on ImageRouter API structure
      const uiModels = models.map(model => {
        console.log('🔍 Processing ImageRouter model:', model.id);

        // Extract pricing from providers array
        const pricing = model.providers?.[0]?.pricing || {};
        const costPerPrompt = pricing.value || pricing.range?.average || pricing.range?.min || 0.02;

        // Determine tier based on cost
        let tier = 'balanced';
        if (costPerPrompt === 0) tier = 'fast';
        else if (costPerPrompt >= 0.05) tier = 'powerful';
        else if (costPerPrompt <= 0.01) tier = 'fast';

        // Generate features based on output type
        const features = ['media-generation'];
        if (model.output?.includes('image')) features.push('image-generation');
        if (model.output?.includes('video')) features.push('video-generation');
        if (model.supported_params?.edit) features.push('image-editing');

        // Create display name from model ID
        const displayName = model.id.split('/').map(part =>
          part.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        ).join(' ');

        return {
          id: model.id,
          name: displayName,
          description: `${displayName} - ${model.output?.join(' and ') || 'media'} generation model`,
          maxTokens: 0, // Not applicable for media generation
          costPerPromptToken: costPerPrompt,
          costPerCompletionToken: 0, // Not applicable for media generation
          features: features,
          provider: 'imagerouter',
          tier: tier,
          quality: model.arena_score ? Math.min(100, Math.floor(model.arena_score / 10)) : 80,
          speed: costPerPrompt === 0 ? 95 : (costPerPrompt <= 0.01 ? 90 : costPerPrompt >= 0.05 ? 60 : 75),
          cost: Math.floor(costPerPrompt * 100)
        };
      });

      console.log(`✅ Transformed ${uiModels.length} ImageRouter models for UI`);
      console.log('🎨 Transformed ImageRouter models:', uiModels);
      return NextResponse.json(uiModels);

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('❌ Failed to load ImageRouter models:', error);
      console.error('❌ Error details:', error.message, error.stack);

      // For development, return mock models on error
      console.log('⚠️ API failed, falling back to mock ImageRouter models for development');

      const fallbackModels = [
        {
          id: 'dall-e-3',
          name: 'DALL-E 3',
          description: 'Advanced image generation with improved quality and prompt adherence (fallback)',
          provider: 'imagerouter',
          tier: 'powerful',
          features: ['image-generation', 'media-generation'],
          costPerPromptToken: 0.04,
          costPerCompletionToken: 0,
          quality: 95,
          speed: 70,
          cost: 4
        },
        {
          id: 'midjourney-v6',
          name: 'Midjourney v6',
          description: 'Artistic image generation with exceptional creative capabilities (fallback)',
          provider: 'imagerouter',
          tier: 'powerful',
          features: ['image-generation', 'media-generation'],
          costPerPromptToken: 0.03,
          costPerCompletionToken: 0,
          quality: 98,
          speed: 60,
          cost: 3
        }
      ];

      console.log(`✅ Returning ${fallbackModels.length} fallback ImageRouter models`);
      return NextResponse.json(fallbackModels);
    }

  } catch (caughtError) {
      const error = normalizeError(caughtError);
    console.error('Error loading ImageRouter models:', error);
    return NextResponse.json(
      { error: 'Failed to load ImageRouter models' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/ai/providers/imagerouter/models:
 *   post:
 *     summary: Refresh models for ImageRouter
 *     description: Forces a refresh of the cached models for ImageRouter
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Models refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 modelsCount:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!imageRouter.apiKey) {
      return NextResponse.json({
        success: true,
        message: 'ImageRouter not configured - returning mock models',
        modelsCount: 6
      });
    }

    try {
      // Initialize ImageRouter adapter
      const adapter = new ImageRouterAdapter({
        apiKey: imageRouter.apiKey,
        baseUrl: imageRouter.baseUrl,
        timeout: imageRouter.timeout,
        maxRetries: imageRouter.maxRetries,
        caching: imageRouter.caching,
        defaultModels: imageRouter.defaultModels,
        defaultQuality: imageRouter.defaultQuality,
        defaultResponseFormat: imageRouter.defaultResponseFormat
      });

      await adapter.initialize();

      // Clear cache to force refresh
      try {
        await cacheManager.invalidate('ai:imagerouter:models');
        console.log('🗑️ Cleared ImageRouter models cache for refresh');
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.warn('Could not clear cache:', error);
      }

      // Get updated models
      const models = await adapter.loadAvailableModels();

      return NextResponse.json({
        success: true,
        message: `Models refreshed for ImageRouter`,
        modelsCount: models.length
      });

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('❌ Failed to refresh ImageRouter models:', error);
      return NextResponse.json({
        success: true,
        message: 'ImageRouter refresh attempted but failed',
        modelsCount: 0
      });
    }

  } catch (caughtError) {
      const error = normalizeError(caughtError);
    console.error('Error refreshing ImageRouter models:', error);
    return NextResponse.json(
      { error: 'Failed to refresh ImageRouter models' },
      { status: 500 }
    );
  }
}
