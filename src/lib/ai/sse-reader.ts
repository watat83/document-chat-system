/** Yield SSE data payloads without assuming fetch chunks align with events. */
export async function* readSSEData(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      // Process complete lines only. CRLF and multi-line data are supported.
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') {
          if (data.length) { yield data.join('\n'); data = []; }
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (done) {
        // SSE dispatch requires a terminating blank line; a truncated event is an error.
        if (buffer.trim() || data.length) throw new Error('The response stream ended before an event completed. Please retry.');
        return;
      }
    }
  } finally { reader.releaseLock(); }
}
