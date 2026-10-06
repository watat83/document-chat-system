/** Preserve Error subclasses and normalize non-Error throws at logging boundaries. */
export function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    return new Error(value.message);
  }
  return new Error(String(value));
}
