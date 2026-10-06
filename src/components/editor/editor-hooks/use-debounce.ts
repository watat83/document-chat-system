import { useMemo, useEffect } from 'react'
import { debounce } from 'lodash-es'
export function useDebounce<T extends (...args: never[]) => void>(fn: T, ms: number, maxWait?: number) {
  const debounced = useMemo(() => debounce(fn, ms, { maxWait }), [fn, ms, maxWait])
  useEffect(() => () => debounced.cancel(), [debounced])
  return debounced
}
