import { jsonSchema, Output, tool, type ModelMessage, type ToolChoice, type ToolSet } from 'ai';
import type { UnifiedCompletionRequest } from './interfaces/types';
import { ValidationError } from './interfaces/errors';

/** Normalize the app's legacy request fields at the SDK boundary. */
export function sdkRequestOptions(request: UnifiedCompletionRequest) {
  if (!request.messages.length || !request.messages.some(message => message.role !== 'system')) throw new ValidationError('A non-system message is required');
  const messages: ModelMessage[] = request.messages.map(message => {
    if (message.role !== 'user' || !message.attachments?.length) return { role: message.role, content: message.content };
    return { role: 'user', content: [
      { type: 'text', text: message.content },
      ...message.attachments.map(attachment => {
        if (!attachment.data) throw new ValidationError('Attachments require inline data');
        if (attachment.type === 'image') return { type: 'image' as const, image: attachment.data, mediaType: attachment.mimeType };
        return { type: 'file' as const, data: attachment.data, mediaType: attachment.mimeType || 'application/octet-stream', filename: attachment.name };
      }),
    ] };
  });
  const tools: ToolSet | undefined = request.functions?.length ? Object.fromEntries(request.functions.map(fn => [fn.name, tool({ description: fn.description, inputSchema: jsonSchema(fn.parameters) })])) : undefined;
  let toolChoice: ToolChoice<ToolSet> | undefined;
  if (request.functionCall === 'none') toolChoice = 'none';
  else if (request.functionCall === 'auto') toolChoice = 'auto';
  else if (request.functionCall) toolChoice = { type: 'tool', toolName: typeof request.functionCall === 'string' ? request.functionCall : request.functionCall.name };
  return { messages, ...(request.systemPrompt && { system: request.systemPrompt }), ...(tools && { tools, toolChoice }), ...(request.options?.jsonMode && { output: Output.json() }) };
}
