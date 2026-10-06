import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { imageRouter } from '@/lib/config/env';
import { parseImageRouterCatalog } from '@/lib/ai/providers/imagerouter-catalog';
import { cacheManager } from '@/lib/cache';
import { isPlatformAdmin } from '@/lib/security/platform-admin';

const cacheKey = 'ai:imagerouter:v3:catalog';
async function loadModels() {
  if (!imageRouter.apiKey) throw new Error('Media provider is not configured');
  const response = await fetch(`${imageRouter.baseUrl.replace(/\/$/, '')}/v3/models`, {
    headers: { Authorization: `Bearer ${imageRouter.apiKey}` }, signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Media catalog request failed (${response.status})`);
  return parseImageRouterCatalog(await response.json()).map(model => ({
    id: model.id, name: model.id, description: `${model.type} generation`, provider: 'imagerouter', tier: 'balanced',
    features: ['media-generation', `${model.type}-generation`, ...(model.features?.includes('edit') ? ['image-editing'] : [])],
    maxTokens: 0, costPerPromptToken: 0, costPerCompletionToken: 0,
    pricing: model.pricing, pricingUnit: 'USD per generation', supportedParameters: model.supported_parameters, parameters: model.parameters,
  }));
}
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const force = request.nextUrl.searchParams.get('force') === 'true';
    if (force && !isPlatformAdmin(userId)) return NextResponse.json({ error: 'Platform administrator required for refresh' }, { status: 403 });
    const cached = force ? null : await cacheManager.get<Awaited<ReturnType<typeof loadModels>>>(cacheKey);
    const models = cached ?? await loadModels();
    if (!cached) await cacheManager.set(cacheKey, models, 300);
    return NextResponse.json(models);
  } catch (error) {
    console.error('Media catalog unavailable:', error);
    return NextResponse.json({ error: 'Media model catalog is unavailable' }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPlatformAdmin(userId)) return NextResponse.json({ error: 'Platform administrator required' }, { status: 403 });
  try {
    const models = await loadModels();
    if (!(await cacheManager.set(cacheKey, models, 300))) throw new Error('Catalog cache update failed');
    return NextResponse.json({ success: true, modelsCount: models.length });
  } catch (error) {
    console.error('Media catalog refresh failed:', error);
    return NextResponse.json({ error: 'Media model catalog refresh failed' }, { status: 503 });
  }
}
