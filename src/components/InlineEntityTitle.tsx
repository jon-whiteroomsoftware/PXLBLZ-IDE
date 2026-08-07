import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { controlIcon } from '@/components/iconScale'
import { nameConflicts } from '@/engine/patternName'

type EntityNoun = 'pattern' | 'map' | 'mixin' | 'library' | 'controller' | 'show' | 'zone'

export function InlineEntityTitle({
  name,
  noun,
  onRename,
  takenNames = [],
  validateName,
  sanitizeInput,
}: {
  name: string
  noun: EntityNoun
  onRename?: (name: string) => void | boolean | Promise<void | boolean>
  takenNames?: readonly string[]
  validateName?: (name: string) => string | null
  sanitizeInput?: (name: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const label = `${noun[0]?.toUpperCase()}${noun.slice(1)} name`

  function cancel() {
    setEditing(false)
    setDraft(name)
    setError(null)
  }

  function beginEditing() {
    if (!onRename) return
    setDraft(name)
    setError(null)
    setEditing(true)
  }

  async function commit() {
    if (!onRename || saving) return
    const trimmed = draft.trim()
    if (!trimmed) {
      setError(`${label} is required`)
      inputRef.current?.focus()
      return
    }
    if (trimmed === name) {
      cancel()
      return
    }
    const validationMessage = validateName?.(trimmed) ?? null
    if (validationMessage) {
      setError(validationMessage)
      inputRef.current?.focus()
      return
    }
    if (nameConflicts(trimmed, [...takenNames])) {
      setError(`A ${noun} with that name already exists`)
      inputRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)
    try {
      const renamed = await onRename(trimmed)
      if (renamed !== false) setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not rename ${noun}`)
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!editing) return
    const id = window.setTimeout(() => inputRef.current?.select(), 0)
    const cancelOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return
      setEditing(false)
      setDraft(name)
      setError(null)
    }
    window.addEventListener('mousedown', cancelOnOutsideClick)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('mousedown', cancelOnOutsideClick)
    }
  }, [editing, name])

  if (!onRename) return <span className="min-w-0 truncate text-zinc-200">{name}</span>

  return (
    <span ref={rootRef} className="relative inline-grid min-w-0 items-center">
      <button
        type="button"
        aria-label={`Rename ${noun} ${name}`}
        title={`Rename ${noun}`}
        onClick={beginEditing}
        className={`group/title inline-flex min-w-0 items-center gap-1 rounded-sm border-b border-dashed border-zinc-700 px-0.5 text-left text-zinc-200 transition-[color,background-color,border-color] hover:border-live/70 hover:bg-live/10 hover:text-live focus-visible:border-live focus-visible:bg-live/10 focus-visible:text-live focus-visible:outline-none ${editing ? 'invisible pointer-events-none' : ''}`}
      >
        <span className="truncate">{name}</span>
        <Pencil size={10} aria-hidden className="shrink-0 text-zinc-600 opacity-45 transition-all group-hover/title:text-live group-hover/title:opacity-100 group-focus-visible/title:text-live group-focus-visible/title:opacity-100" />
      </button>
      {editing && (
        <form className="absolute inset-0" onSubmit={(event) => { event.preventDefault(); void commit() }}>
          <input
            ref={inputRef}
            aria-label={label}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${noun}-title-error` : undefined}
            value={draft}
            disabled={saving}
            onChange={(event) => {
              setDraft(sanitizeInput?.(event.target.value) ?? event.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); cancel() }
            }}
            className="absolute inset-0 size-full min-w-0 rounded-sm border border-live/70 bg-zinc-950 px-0.5 py-0 text-left text-zinc-100 shadow-[0_0_0_2px_rgba(251,191,36,0.08)] outline-none [font:inherit] [line-height:inherit] selection:bg-live/30 focus:border-live disabled:opacity-60"
          />
          <span data-testid="inline-title-actions" className="absolute left-full top-1/2 z-40 ml-1 flex -translate-y-1/2 gap-1 bg-zinc-950/95 shadow-lg">
            <button
              type="submit"
              aria-label={`Apply ${noun} name`}
              title="Apply"
              disabled={saving}
              className="grid size-6 shrink-0 place-items-center rounded border border-live/60 bg-live/10 text-live transition-colors hover:bg-live/20 disabled:opacity-50"
            >
              <Check {...controlIcon} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Cancel ${noun} rename`}
              title="Cancel"
              disabled={saving}
              onClick={cancel}
              className="grid size-6 shrink-0 place-items-center rounded border border-zinc-700 bg-zinc-950 text-zinc-500 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
            >
              <X {...controlIcon} aria-hidden />
            </button>
          </span>
          {error && (
            <span id={`${noun}-title-error`} role="alert" className="absolute left-0 top-full z-50 mt-1 w-max max-w-64 rounded border border-red-900/80 bg-zinc-950 px-2 py-1 text-[10px] text-red-300 shadow-xl">
              {error}
            </span>
          )}
        </form>
      )}
    </span>
  )
}
