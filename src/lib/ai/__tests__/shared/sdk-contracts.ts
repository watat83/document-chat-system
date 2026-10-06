import { generateText, streamText } from 'ai';
import type { AIProviderAdapter } from '../../interfaces/base-adapter';
import { UsageTrackingService } from '@/lib/usage-tracking';
import { sdkRequestOptions } from '../../sdk-request';

const request = { model: 'fast', messages: [{ role: 'user' as const, content: 'Hello' }], metadata: { organizationId: 'tenant-a', userId: 'user-a' } };
export function sdkAdapterContracts(provider: string, createAdapter: () => AIProviderAdapter) {
  describe(`${provider} public SDK contract`, () => {
    let adapter: AIProviderAdapter;
    beforeEach(() => {
      jest.clearAllMocks();
      adapter = createAdapter();
      (generateText as jest.Mock).mockResolvedValue({ text: 'Actual answer', finishReason: 'stop', response: { id: 'response-a' }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, toolCalls: [] });
    });
    test('normalizes current SDK usage and records one successful billing event', async () => {
      const response = await adapter.generateCompletion(request);
      expect(response).toEqual(expect.objectContaining({ content: 'Actual answer', metadata: expect.objectContaining({ provider }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }));
      expect(UsageTrackingService.trackUsage).toHaveBeenCalledTimes(1);
      expect(UsageTrackingService.enforceUsageLimit).toHaveBeenCalledWith('tenant-a', 'AI_QUERY', 1);
    });
    test('keeps system instructions, token limits, and the cancellation signal', async () => {
      const controller = new AbortController();
      await adapter.generateCompletion({ ...request, maxTokens: 42, temperature: 0, signal: controller.signal, messages: [{ role: 'system', content: 'Use only the supplied sources' }, ...request.messages] });
      expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 42, temperature: 0, abortSignal: controller.signal, messages: [{ role: 'system', content: 'Use only the supplied sources' }, ...request.messages] }));
    });
    test('forwards inline image attachments as SDK content parts', async () => {
      await adapter.generateCompletion({ ...request, messages: [{ ...request.messages[0], attachments: [{ type: 'image', data: 'fixture-base64', mimeType: 'image/png' }] }] });
      expect((generateText as jest.Mock).mock.calls[0][0].messages[0].content).toEqual([{ type: 'text', text: 'Hello' }, { type: 'image', image: 'fixture-base64', mediaType: 'image/png' }]);
    });
    test('does not settle successful usage on provider failure', async () => {
      (generateText as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));
      await expect(adapter.generateCompletion(request)).rejects.toThrow();
      expect(UsageTrackingService.trackUsage).not.toHaveBeenCalled();
    });
    test('checks the usage limit before calling the provider', async () => {
      (UsageTrackingService.enforceUsageLimit as jest.Mock).mockRejectedValueOnce(new Error('Limit exceeded'));
      await expect(adapter.generateCompletion(request)).rejects.toThrow();
      expect(generateText).not.toHaveBeenCalled();
    });
    test('consumes split text and settles only the actual finished stream usage', async () => {
      (streamText as jest.Mock).mockReturnValue({ stream: (async function* () {
        yield { type: 'text-delta', id: 'text-a', text: 'Hello ' };
        yield { type: 'text-delta', id: 'text-a', text: '世界' };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } };
      })() });
      const stream = await adapter.streamCompletion(request);
      expect(UsageTrackingService.trackUsage).not.toHaveBeenCalled();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      expect(chunks.map(chunk => chunk.content).join('')).toBe('Hello 世界');
      expect(chunks.at(-1)?.metadata.usage).toEqual({ promptTokens: 2, completionTokens: 3, totalTokens: 5 });
      expect(UsageTrackingService.trackUsage).toHaveBeenCalledTimes(1);
    });
    test.each(['error', 'abort', 'truncated'])('%s after partial text is surfaced without successful billing', async failure => {
      (streamText as jest.Mock).mockReturnValue({ stream: (async function* () {
        yield { type: 'text-delta', id: 'text-a', text: 'partial' };
        if (failure === 'error') yield { type: 'error', error: new Error('Provider failure') };
        if (failure === 'abort') yield { type: 'abort' };
      })() });
      await expect((async () => { for await (const chunk of await adapter.streamCompletion(request)) void chunk; })()).rejects.toThrow();
      expect(UsageTrackingService.trackUsage).not.toHaveBeenCalled();
    });
    test('rejects invalid attachment data before the provider sees it', async () => {
      await expect(adapter.generateCompletion({ ...request, messages: [{ ...request.messages[0], attachments: [{ type: 'file', path: '/etc/passwd' }] }] })).rejects.toThrow(/inline data/);
      expect(generateText).not.toHaveBeenCalled();
    });
    test('supports declared JSON and function-call request options at the SDK boundary', () => {
      const options = sdkRequestOptions({ ...request, options: { jsonMode: true }, functions: [{ name: 'lookup', description: 'Find a source', parameters: { type: 'object', properties: { query: { type: 'string' } } } }], functionCall: { name: 'lookup' } });
      expect(options.output).toBeDefined();
      expect(options.tools?.lookup).toBeDefined();
      expect(options.toolChoice).toEqual({ type: 'tool', toolName: 'lookup' });
    });
  });
}
