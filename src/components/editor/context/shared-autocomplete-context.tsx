import * as React from "react"
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react"

type Suggestion = null | string
type CallbackFn = (newSuggestion: Suggestion) => void
type SubscribeFn = (callbackFn: CallbackFn) => () => void
type PublishFn = (newSuggestion: Suggestion) => void
type ContextShape = [SubscribeFn, PublishFn]
type HookShape = [suggestion: Suggestion, setSuggestion: PublishFn]

const Context: React.Context<ContextShape> = createContext([
  (_cb) => () => {
    return
  },
  (_newSuggestion: Suggestion) => {
    return
  },
])

export function SharedAutocompleteContext({
  children,
}: {
  children: ReactNode
}) {
  const suggestion = useRef<Suggestion>(null)
  const context: ContextShape = useMemo(() => {
    const listeners: Set<CallbackFn> = new Set()
    return [
      (cb: (newSuggestion: Suggestion) => void) => {
        cb(suggestion.current)
        listeners.add(cb)
        return () => {
          listeners.delete(cb)
        }
      },
      (newSuggestion: Suggestion) => {
        suggestion.current = newSuggestion
        for (const listener of Array.from(listeners)) {
          listener(newSuggestion)
        }
      },
    ]
  }, [])
  return <Context.Provider value={context}>{children}</Context.Provider>
}

export const useSharedAutocompleteContext = (): HookShape => {
  const [subscribe, publish]: ContextShape = useContext(Context)
  const [suggestion, setSuggestion] = useState<Suggestion>(null)
  useEffect(() => {
    return subscribe((newSuggestion: Suggestion) => {
      setSuggestion(newSuggestion)
    })
  }, [subscribe])
  return [suggestion, publish]
}
