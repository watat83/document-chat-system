import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';
import type { TextStreamPart, ToolSet } from 'ai';
async function transform(parts: TextStreamPart<ToolSet>[]) {
  const source = new ReadableStream<TextStreamPart<ToolSet>>({ start(controller) { parts.forEach(part => controller.enqueue(part)); controller.close(); } });
  const reader = source.pipeThrough(markdownJoinerTransform<ToolSet>()()).getReader();
  const output: TextStreamPart<ToolSet>[] = [];
  for (;;) { const next = await reader.read(); if (next.done) return output; output.push(next.value); }
}
test('buffered Markdown is emitted before text-end, never after it', async () => {
  expect(await transform([{ type: 'text-start', id: 'a' }, { type: 'text-delta', id: 'a', text: '**incomplete' }, { type: 'text-end', id: 'a' }])).toEqual([
    { type: 'text-start', id: 'a' }, { type: 'text-delta', id: 'a', text: '**incomplete' }, { type: 'text-end', id: 'a' },
  ]);
});
test('separate text parts cannot combine buffered Markdown or lose their ids', async () => {
  const output = await transform([{ type: 'text-delta', id: 'a', text: '**first' }, { type: 'text-delta', id: 'b', text: '**second' }]);
  expect(output).toEqual([{ type: 'text-delta', id: 'a', text: '**first' }, { type: 'text-delta', id: 'b', text: '**second' }]);
});
test('closing a stream retains its last buffered bytes', async () => {
  const output = await transform([{ type: 'text-delta', id: 'a', text: 'A [link' }]);
  expect(output.filter(part => part.type === 'text-delta').map(part => part.text).join('')).toBe('A [link');
});
