import { AIFallbackStrategy } from '@/lib/ai/fallback/fallback-strategy';
import { NetworkError } from '@/lib/ai/interfaces/errors';
const collect = async (stream: AsyncIterable<unknown>) => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks; };
const create = (primary: AsyncIterable<unknown>) => {
  const fallback = { streamCompletion: jest.fn().mockImplementation(async function* () { yield { content: 'fallback', finished: true }; }) };
  const registry = { getProvider: (name: string) => name === 'openai' ? { streamCompletion: () => primary } : fallback, getAvailableProviders: () => ['openai', 'anthropic'] };
  const router = { route: jest.fn().mockResolvedValue({ selectedProvider: 'openai' }) };
  return { strategy: new AIFallbackStrategy(registry as never, router as never, {} as never), fallback };
};
test('a failed partial response cannot append a second provider answer', async () => {
  const { strategy, fallback } = create((async function* () { yield { content: 'partial', finished: false }; throw new NetworkError('Disconnected'); })());
  await expect(collect(strategy.executeStreamWithFallback({ model: 'fast', messages: [] }))).rejects.toThrow('Disconnected');
  expect(fallback.streamCompletion).not.toHaveBeenCalled();
});
test('a retryable failure before output can switch providers', async () => {
  const { strategy, fallback } = create((async function* () { throw new NetworkError('Disconnected'); })());
  expect(await collect(strategy.executeStreamWithFallback({ model: 'fast', messages: [] }))).toEqual([{ content: 'fallback', finished: true }]);
  expect(fallback.streamCompletion).toHaveBeenCalledTimes(1);
});
test('cancelled requests do not start another provider', async () => {
  const { strategy, fallback } = create((async function* () { yield { content: 'unexpected' }; })());
  const controller = new AbortController(); controller.abort(new Error('Cancelled'));
  await expect(collect(strategy.executeStreamWithFallback({ model: 'fast', messages: [], signal: controller.signal }))).rejects.toThrow('Cancelled');
  expect(fallback.streamCompletion).not.toHaveBeenCalled();
});
