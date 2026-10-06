/** Keep provider SDK usage names at the adapter boundary. */
export function completionUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  const promptTokens = usage.inputTokens ?? 0;
  const completionTokens = usage.outputTokens ?? 0;
  return { promptTokens, completionTokens, totalTokens: usage.totalTokens ?? promptTokens + completionTokens };
}
export function metricTokens(usage: { promptTokens: number; completionTokens: number; totalTokens: number }) {
  return { prompt: usage.promptTokens, completion: usage.completionTokens, total: usage.totalTokens };
}
