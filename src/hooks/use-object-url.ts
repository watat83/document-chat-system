'use client'
import { useCallback, useSyncExternalStore } from 'react'
const urls = new WeakMap<Blob, { url: string; listeners: Set<() => void> }>()
/** Release blob URLs when their last mounted consumer leaves. */
export function useObjectURL(blob: Blob | null | undefined): string | null {
  const subscribe = useCallback((notify: () => void) => {
    if (!blob) return () => {}
    let entry = urls.get(blob)
    if (!entry) {
      entry = { url: URL.createObjectURL(blob), listeners: new Set() }
      urls.set(blob, entry)
    }
    entry.listeners.add(notify)
    notify()
    return () => {
      entry.listeners.delete(notify)
      if (!entry.listeners.size) { URL.revokeObjectURL(entry.url); urls.delete(blob) }
    }
  }, [blob])
  const getSnapshot = useCallback(() => blob ? urls.get(blob)?.url ?? null : null, [blob])
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
