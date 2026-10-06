import { normalizeError } from '@/lib/errors/normalize-error';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cacheManager } from '@/lib/cache';
import { CleanOpenRouterAdapter } from '@/lib/ai/providers/clean-openrouter-adapter';
import { OpenAIAdapter } from '@/lib/ai/providers/openai-adapter';
import { AnthropicAdapter } from '@/lib/ai/providers/anthropic-adapter';
import { ai } from '@/lib/config/env';

/**
 * @swagger
 * /api/v1/ai/providers/{providerId}/models:
 *   get:
 *     summary: Get available models for a specific AI provider
 *     description: Fetches the list of available models for a given provider, with caching support
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *           enum: [openai, anthropic, openrouter]
 *         description: The AI provider identifier
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
 *                   maxTokens:
 *                     type: number
 *                     description: Maximum tokens supported
 *                   costPerPromptToken:
 *                     type: number
 *                     description: Cost per prompt token
 *                   costPerCompletionToken:
 *                     type: number
 *                     description: Cost per completion token
 *                   features:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Model capabilities
 *                   provider:
 *                     type: string
 *                     description: Provider name
 *                   tier:
 *                     type: string
 *                     description: Performance tier
 *                   quality:
 *                     type: number
 *                     description: Quality score (0-100)
 *                   speed:
 *                     type: number
 *                     description: Speed score (0-100)
 *                   cost:
 *                     type: number
 *                     description: Cost score (0-100)
 *       400:
 *         description: Invalid provider ID
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { providerId } = await params;
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('force') === 'true';

    // Validate provider ID
    if (!['openai', 'anthropic', 'openrouter'].includes(providerId)) {
      return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
    }

    // Get adapter instance
    let adapter;
    switch (providerId) {
      case 'openai':
        adapter = new OpenAIAdapter({
          apiKey: ai.openaiApiKey,
          organizationId: ai.openaiOrgId,
          maxRetries: 1,
          timeout: 3000
        });
        break;
      case 'anthropic':
        adapter = new AnthropicAdapter({
          apiKey: ai.anthropicApiKey,
          maxRetries: 1,
          timeout: 3000
        });
        break;
      case 'openrouter':
        adapter = new CleanOpenRouterAdapter({
          apiKey: ai.openrouterApiKey,
          appName: 'Document Chat System',
          siteUrl: 'https://document-chat-system.vercel.app',
          enableSmartRouting: true,
          costOptimization: 'balanced',
          maxRetries: 1,
          timeout: 3000
        });
        break;
      default:
        return NextResponse.json({ error: 'Provider not supported' }, { status: 400 });
    }

    // Initialize adapter with timeout to prevent hanging
    try {
      await Promise.race([
        adapter.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Adapter initialization timeout')), 5000)
        )
      ]);
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn(`⚠️ ${providerId} adapter initialization failed, continuing with degraded mode:`, error);
      // Don't fail the request - allow models to be fetched even if initialization failed
    }

    // Clear cache if force refresh is requested
    if (forceRefresh) {
      console.log('🗑️ Force refresh requested, clearing cache...');
      try {
        await cacheManager.invalidate(`ai:${providerId}:models`);
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.warn('Could not clear cache:', error);
      }
    }

    // Load models dynamically with timeout to prevent hanging
    let models: any[] = [];
    try {
      models = await Promise.race([
        adapter.getAvailableModels(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Model loading timeout')), 8000)
        )
      ]) as any[];
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn(`⚠️ ${providerId} model loading failed:`, error);
      // Return empty array if model loading fails
      models = [];
    }

    // Transform to UI format
    const uiModels = models.map(model => ({
      id: model.name,
      name: model.displayName || model.name,
      description: model.description || `${model.displayName || model.name} model`,
      maxTokens: model.maxTokens,
      costPerPromptToken: model.costPer1KTokens?.prompt || 0,
      costPerCompletionToken: model.costPer1KTokens?.completion || 0,
      features: model.features || [],
      provider: providerId,
      tier: model.tier || (model.qualityScore && model.qualityScore > 0.9 ? 'powerful' : model.qualityScore && model.qualityScore > 0.8 ? 'balanced' : 'fast'),
      quality: Math.round((model.qualityScore || 0) * 100), // Convert to percentage
      speed: model.averageLatency ? Math.max(0, 100 - Math.floor(model.averageLatency / 50)) : 50, // Convert latency to speed score
      cost: Math.floor((model.costPer1KTokens?.prompt || 0) * 100) // Convert cost to score
    }));

    return NextResponse.json(uiModels);

  } catch (caughtError) {
      const error = normalizeError(caughtError);
    console.error('Error loading provider models:', error);

    // Return graceful degradation instead of hard failure
    if (error.message?.includes('timeout')) {
      return NextResponse.json(
        {
          error: 'Provider temporarily unavailable',
          message: `${providerId} models are loading, try again in a moment`,
          models: [] // Empty models array for graceful degradation
        },
        { status: 503 } // Service Temporarily Unavailable
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to load models',
        models: [] // Always provide empty array for graceful degradation
      },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/v1/ai/providers/{providerId}/models:
 *   post:
 *     summary: Refresh models for a specific AI provider
 *     description: Forces a refresh of the cached models for a given provider
 *     tags: [AI Services]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *           enum: [openai, anthropic, openrouter]
 *         description: The AI provider identifier
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
 *       400:
 *         description: Invalid provider ID
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { providerId } = await params;

    // Validate provider ID
    if (!['openai', 'anthropic', 'openrouter'].includes(providerId)) {
      return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
    }

    // Get adapter instance
    let adapter;
    switch (providerId) {
      case 'openai':
        adapter = new OpenAIAdapter({
          apiKey: ai.openaiApiKey,
          organizationId: ai.openaiOrgId,
          maxRetries: 1,
          timeout: 3000
        });
        break;
      case 'anthropic':
        adapter = new AnthropicAdapter({
          apiKey: ai.anthropicApiKey,
          maxRetries: 1,
          timeout: 3000
        });
        break;
      case 'openrouter':
        adapter = new CleanOpenRouterAdapter({
          apiKey: ai.openrouterApiKey,
          appName: 'Document Chat System',
          siteUrl: 'https://document-chat-system.vercel.app',
          enableSmartRouting: true,
          costOptimization: 'balanced',
          maxRetries: 1,
          timeout: 3000
        });
        break;
      default:
        return NextResponse.json({ error: 'Provider not supported' }, { status: 400 });
    }

    // Initialize adapter with timeout to prevent hanging
    try {
      await Promise.race([
        adapter.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Adapter initialization timeout')), 2000)
        )
      ]);
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn(`⚠️ ${providerId} adapter initialization failed, continuing with degraded mode:`, error);
      // Don't fail the request - allow refresh to continue
    }

    // Clear cache to force refresh
    try {
      await cacheManager.invalidate(`ai:${providerId}:models`);
      console.log(`🗑️ Cleared ${providerId} models cache for refresh`);
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.warn('Could not clear cache:', error);
    }

    // Get updated models with timeout to prevent hanging
    const models = await Promise.race([
      adapter.getAvailableModels(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Model refresh timeout')), 3000)
      )
    ]) as any[];

    return NextResponse.json({
      success: true,
      message: `Models refreshed for ${providerId}`,
      modelsCount: models.length
    });

  } catch (caughtError) {
      const error = normalizeError(caughtError);
    console.error('Error refreshing provider models:', error);
    return NextResponse.json(
      { error: 'Failed to refresh models' },
      { status: 500 }
    );
  }
}
