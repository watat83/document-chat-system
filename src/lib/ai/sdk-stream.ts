import type { TextStreamPart, ToolSet } from 'ai';
import type { UnifiedStreamChunk } from './interfaces/types';
import { completionUsage } from './usage';

/** textStream omits error/abort/finish events; consume the complete SDK stream. */
export async function* consumeSDKStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>, provider: string, model: string, signal?: AbortSignal,
): AsyncGenerator<UnifiedStreamChunk, { usage: ReturnType<typeof completionUsage>; finishReason: string }> {
  let completion: { usage: ReturnType<typeof completionUsage>; finishReason: string } | undefined;
  for await (const part of stream) {
    signal?.throwIfAborted();
    if (part.type === 'error') throw part.error instanceof Error ? part.error : new Error('AI provider stream failed');
    if (part.type === 'abort') throw new DOMException('AI provider stream cancelled', 'AbortError');
    if (part.type === 'text-delta') yield { content: part.text, metadata: { provider, model } };
    if (part.type === 'finish') {
      if (part.finishReason === 'error') throw new Error('AI provider stream did not complete successfully');
      completion = { usage: completionUsage(part.totalUsage), finishReason: part.finishReason };
    }
  }
  signal?.throwIfAborted();
  if (!completion) throw new Error('AI provider stream ended before completion');
  return completion;
}
