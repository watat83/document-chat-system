import { NextRequest, NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
const schema = z.object({ apiKey: z.string().max(512).optional(), model: z.literal('gpt-4o-mini').default('gpt-4o-mini'),
  prompt: z.string().min(1).max(50000), system: z.string().max(20000).optional() });
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const input = schema.parse(await req.json());
    const denied = await guardUsage(user.organizationId, UsageType.AI_QUERY);
    if (denied) return denied;
    const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Editor AI is not configured' }, { status: 503 });
    const result = await generateText({ abortSignal: req.signal, maxOutputTokens: 50, model: createOpenAI({ apiKey })(input.model),
      prompt: input.prompt, instructions: input.system, temperature: 0.7 });
    req.signal.throwIfAborted();
    await UsageTrackingService.trackUsage({ organizationId: user.organizationId, userId: user.id, usageType: UsageType.AI_QUERY, quantity: 1,
      resourceType: 'editor_copilot', metadata: { totalTokens: result.totalUsage.totalTokens, provider: 'openai', model: input.model } });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid editor request' }, { status: 400 });
    if (error instanceof Error && error.name === 'AbortError') return NextResponse.json({ error: 'Request cancelled' }, { status: 408 });
    console.error('Copilot request failed:', error);
    return NextResponse.json({ error: 'Editor AI request failed' }, { status: 503 });
  }
}
