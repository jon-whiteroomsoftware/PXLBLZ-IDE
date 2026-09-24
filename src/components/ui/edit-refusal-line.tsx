import { useCallback, useState } from 'react'

/**
 * A refused panel edit (#1098). A panel commit returns this in place of
 * `false` so the panel can name the reason; a field still receives `false`
 * and restores its draft.
 */
export interface EditRefusal { refused: true; message: string }

/** What a panel commit may return: its ordinary result, or a refusal. */
export type EditRefusalResult<T = void> = T | EditRefusal | Promise<T | EditRefusal>

function isEditRefusal(value: unknown): value is EditRefusal {
  return typeof value === 'object' && value !== null && (value as { refused?: unknown }).refused === true
}

/**
 * One panel's refusal line. `observe` clears the line, runs one edit, shows
 * its refusal whether it arrives now or once the commit settles, and hands
 * the calling field `false` in place of the refusal.
 */
export function useEditRefusal() {
  const [refusal, setRefusal] = useState<string | null>(null)
  const observe = useCallback(<T,>(run: () => EditRefusalResult<T>): T | false | Promise<T | false> => {
    setRefusal(null)
    const settle = (value: T | EditRefusal): T | false => {
      if (!isEditRefusal(value)) return value
      setRefusal(value.message)
      return false
    }
    const result = run()
    return result instanceof Promise ? result.then(settle) : settle(result)
  }, [])
  return [refusal, observe] as const
}

/** The panel's one inline refusal line, rendered as its last element. */
export function EditRefusalLine({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <p role="alert" className="mx-2 my-1.5 shrink-0 rounded border border-red-900/80 bg-zinc-950 px-2 py-1 text-[10px] text-red-300">
      {message}
    </p>
  )
}
