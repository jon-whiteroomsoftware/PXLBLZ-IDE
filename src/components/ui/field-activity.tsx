import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react'

/** A mounted control supplies its own live draft/gesture state. The scope only
 * connects that state to the current consumer; it is not a conflict ledger. */
export function createFieldActivityScope() {
  const controls = new Set<() => void>()
  let acquire: (() => () => void) | undefined
  return {
    register(active: () => boolean) {
      let release: (() => void) | undefined
      const refresh = () => {
        if (active() && acquire) release ??= acquire()
        else { const stop = release; release = undefined; stop?.() }
      }
      controls.add(refresh)
      refresh()
      return { refresh, dispose() { controls.delete(refresh); const stop = release; release = undefined; stop?.() } }
    },
    /** The old consumer must be retired before unbinding: releasing the last
     * owner is allowed to synchronously apply its waiting work. */
    bind(next: () => () => void) {
      acquire = undefined
      controls.forEach(refresh => refresh())
      acquire = next
      controls.forEach(refresh => refresh())
      return () => { if (acquire !== next) return; acquire = undefined; controls.forEach(refresh => refresh()) }
    },
  }
}
export const FieldActivityContext = createContext<ReturnType<typeof createFieldActivityScope> | null>(null)

export function useFieldActivity(active: () => boolean) {
  const scope = useContext(FieldActivityContext)
  const current = useRef(active)
  useLayoutEffect(() => { current.current = active })
  const registration = useRef<ReturnType<NonNullable<typeof scope>['register']> | undefined>(undefined)
  useLayoutEffect(() => {
    registration.current = scope?.register(() => current.current())
    return () => { registration.current?.dispose(); registration.current = undefined }
  }, [scope])
  useLayoutEffect(() => { registration.current?.refresh() })
  return useCallback(() => registration.current?.refresh(), [])
}
