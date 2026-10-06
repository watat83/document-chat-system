import { sdkRequestOptions } from '../sdk-request';
import { consumeSDKStream } from '../sdk-stream';
import type { TextStreamPart, ToolSet } from 'ai';

test('an all-system request is rejected before reaching a provider', () => {
  expect(() => sdkRequestOptions({ model: 'fast', messages: [{ role: 'system', content: 'Instructions' }] })).toThrow(/non-system message/);
});
test('request serialization preserves roles and inline PDF data without filesystem reads', () => {
  const options = sdkRequestOptions({ model: 'fast', systemPrompt: 'Cite sources', messages: [{ role: 'user', content: 'Read this', attachments: [{ type: 'pdf', data: 'fixture-data', mimeType: 'application/pdf', name: 'source.pdf' }] }] });
  expect(options.system).toBe('Cite sources');
  expect(options.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Read this' }, { type: 'file', data: 'fixture-data', mediaType: 'application/pdf', filename: 'source.pdf' }] });
});
test('a pre-aborted consumer cannot emit output or finish successfully', async () => {
  const controller = new AbortController(); controller.abort();
  const stream = (async function* () { yield { type: 'text-delta', id: 'text-a', text: 'late' } as TextStreamPart<ToolSet>; })();
  const chunks = [];
  await expect((async () => { for await (const chunk of consumeSDKStream(stream, 'provider', 'model', controller.signal)) chunks.push(chunk); })()).rejects.toThrow();
  expect(chunks).toEqual([]);
});
