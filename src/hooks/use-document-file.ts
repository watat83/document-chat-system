'use client'
import { useAuth } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
class DownloadError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export function useDocumentFile(document: { id: string; name: string; mimeType?: string; originalFile?: File }, enabled = true) {
  const { userId, orgId, isLoaded } = useAuth()
  const original = document.originalFile
  const query = useQuery({
    queryKey: ['document-file', userId, orgId, document.id, document.name, document.mimeType],
    enabled: enabled && isLoaded && Boolean(userId && document.id) && !original,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const controller = new AbortController()
      const abort = () => controller.abort(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      const timeout = setTimeout(() => controller.abort(), 10000)
      try {
        const response = await fetch(`/api/v1/documents/${document.id}/download`, { credentials: 'include', signal: controller.signal })
        if (!response.ok) throw new DownloadError(`Unable to load document (${response.status})`, response.status)
        const blob = await response.blob()
        if (!blob.size) throw new DownloadError('Downloaded file is empty', 422)
        return new File([blob], document.name, { type: document.mimeType || blob.type || 'application/octet-stream' })
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort) }
    },
    retry: (count, error) => count < 2 && (!(error instanceof DownloadError) || error.status >= 500),
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
  })
  const missingAuth = isLoaded && !userId && !original
  return {
    fetchedFile: enabled ? original ?? query.data ?? null : null,
    loading: enabled && !original && (!isLoaded || Boolean(userId) && query.isPending),
    error: enabled ? missingAuth ? 'Sign in to view this document' : !document.id && !original ? 'No document ID available' : query.error?.message ?? null : null,
    retryCount: query.failureCount,
    status: query.error instanceof DownloadError ? query.error.status : undefined,
  }
}
