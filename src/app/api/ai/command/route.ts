import { NextRequest, NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';
const schema = z.object({
  apiKey: z.string().max(512).optional(), system: z.string().max(20000).optional(),
  messages: z.array(z.object({ id: z.string().min(1), role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(z.object({ type: z.literal('text'), text: z.string().max(50000) })).min(1).max(100),
  })).min(1).max(100),
});
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const input = schema.parse(await req.json());
    const denied = await guardUsage(user.organizationId, UsageType.AI_QUERY);
    if (denied) return denied;
    const apiKey = input.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Editor AI is not configured' }, { status: 503 });
    const result = streamText({ model: createOpenAI({ apiKey })('gpt-4o'), abortSignal: req.signal,
      experimental_transform: markdownJoinerTransform(), maxOutputTokens: 2048,
      messages: await convertToModelMessages(input.messages), instructions: input.system,
      onEnd: async completion => {
        if (req.signal.aborted || completion.finishReason === 'error') return;
        await UsageTrackingService.trackUsage({ organizationId: user.organizationId, userId: user.id, usageType: UsageType.AI_QUERY, quantity: 1,
          resourceType: 'editor_command', metadata: { totalTokens: completion.totalUsage.totalTokens, provider: 'openai', model: 'gpt-4o' } });
      },
    });
    return result.toUIMessageStreamResponse();
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid editor request' }, { status: 400 });
    console.error('Editor AI request failed:', error);
    return NextResponse.json({ error: 'Editor AI request failed' }, { status: 503 });
  }
}
