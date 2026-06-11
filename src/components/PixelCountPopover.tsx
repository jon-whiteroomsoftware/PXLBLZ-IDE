import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { parsePixelCountDraft, sanitizePixelCountDraft } from '@/engine/pixelCountDraft'

function formatPixelCount(value: number | null): string {
  return value == null ? '' : String(value)
}

export function PixelCountPopover({
  value,
  triggerLabel,
  inputLabel,
  disabled = false,
  pending = false,
  onApply,
}: {
  value: number | null
  triggerLabel: string
  inputLabel: string
  disabled?: boolean
  pending?: boolean
  onApply: (count: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(formatPixelCount(value))
  const rootRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = parsePixelCountDraft(draft)

  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(formatPixelCount(value))
  }

  const close = useCallback(() => {
    setOpen(false)
    setDraft(formatPixelCount(value))
  }, [value])

  function apply() {
    if (parsed == null) return
    onApply(parsed)
    setDraft(String(parsed))
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [close, open])

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled || pending}
        onClick={() => setOpen((o) => !o)}
        className="w-[42px] h-5 px-0.5 rounded border border-zinc-500 text-[11px] tabular-nums text-zinc-300 text-center bg-transparent hover:border-zinc-400 hover:text-amber-400/80 focus:outline-none focus:border-live disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? '...' : value ?? '-'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${inputLabel} editor`}
          className="absolute -right-2 top-6 z-50 w-36 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-2xl font-mono text-xs text-zinc-300"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              aria-label={inputLabel}
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(sanitizePixelCountDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply()
              }}
              className="min-w-0 flex-1 h-7 rounded border border-zinc-600 bg-zinc-950 px-2 text-xs tabular-nums text-zinc-100 focus:outline-none focus:border-live"
            />
            <button
              type="button"
              aria-label={`Apply ${inputLabel.toLowerCase()}`}
              disabled={parsed == null}
              onClick={apply}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-live bg-live/10 text-live transition-colors hover:bg-live/20 disabled:border-zinc-700 disabled:bg-transparent disabled:text-zinc-600"
              title="Apply"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
