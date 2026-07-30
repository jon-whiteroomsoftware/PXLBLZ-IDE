import { useEffect, useRef, useState, type FocusEvent, type ChangeEvent, type KeyboardEvent } from 'react'

// The one simple numeric-entry contract for the app (#577, #656): this is a
// decimal textbox, deliberately not a native number input/spinbutton. Keystrokes
// edit a local string draft (so deletion and partial numbers survive
// re-renders), the parsed value is bounded and committed once on blur or Enter,
// Escape reverts the draft, and external value changes only sync in while the
// field is not focused. Domain, time, and percentage values use the specialized
// BoundedNumberField wrappers instead.

export interface NumberFieldDraft {
  draft: string
  inputProps: {
    value: string
    onFocus: (event: FocusEvent<HTMLInputElement>) => void
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
    onBlur: (event: FocusEvent<HTMLInputElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  }
}

export function useNumberFieldDraft({ value, min, max, onChange }: {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}): NumberFieldDraft {
  const [draft, setDraft] = useState(String(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value))
  }, [value])

  const commit = (raw: string) => {
    focusedRef.current = false
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const bounded = Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, parsed))
    setDraft(String(bounded))
    if (bounded !== value) onChange(bounded)
  }

  return {
    draft,
    inputProps: {
      value: draft,
      onFocus: () => { focusedRef.current = true },
      onChange: (event) => setDraft(event.target.value),
      onBlur: (event) => commit(event.currentTarget.value),
      onKeyDown: (event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(String(value))
          // blur() runs the commit handler synchronously, before React
          // repaints the reverted draft - reset the DOM value first so the
          // commit sees the pristine value and Escape never saves the edit.
          event.currentTarget.value = String(value)
          event.currentTarget.blur()
        }
      },
    },
  }
}

// Editor-variant field chrome matches the ShowEditor panel inputs; the
// inspector variant matches the entity detail panels.
const editorField =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const editorCompactField =
  'h-6 rounded border border-zinc-700 bg-zinc-950 px-1.5 text-[9.5px] text-zinc-200 outline-none focus:border-live/70'

export interface NumberFieldProps {
  label: string
  ariaLabel?: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  help?: string
  hideLabel?: boolean
  showNormalizedRange?: boolean
  compact?: boolean
  align?: 'left' | 'right'
  disabled?: boolean
  variant?: 'inspector' | 'editor'
  onChange: (value: number) => void
}

export function NumberField({
  label,
  ariaLabel,
  value,
  min,
  max,
  suffix,
  help,
  hideLabel = false,
  showNormalizedRange = true,
  compact = false,
  align,
  disabled = false,
  variant = 'inspector',
  onChange,
}: NumberFieldProps) {
  const { inputProps } = useNumberFieldDraft({ value, min, max, onChange })
  const normalized = min === 0 && max === 1
  const inspector = variant === 'inspector'
  const resolvedAlign = align ?? (inspector ? 'right' : 'left')

  const labelClass = inspector
    ? 'min-w-0 text-[9px] uppercase tracking-[0.1em] text-zinc-600'
    : `min-w-0 uppercase text-zinc-600 ${compact ? 'text-[9px] tracking-[0.08em]' : 'text-[10px]'}`
  const inputClass = inspector
    ? `${compact
      ? 'h-5 rounded-none border-0 border-b border-zinc-800 bg-transparent px-1 text-[9px] focus:border-cyan-400/60'
      : 'h-5 rounded border border-zinc-700 bg-zinc-950 px-[5px] text-[9.5px] focus:border-cyan-400/60'} tabular-nums text-zinc-200 outline-none disabled:cursor-default disabled:opacity-60`
    : `${compact ? editorCompactField : editorField}`
  const suffixClass = inspector
    ? 'text-[10px] normal-case tracking-normal text-zinc-500'
    : 'text-[10px] text-zinc-500'

  return (
    <label className={labelClass} title={help}>
      <span className={hideLabel ? 'sr-only' : 'flex items-center justify-between gap-2'}>
        <span>{label}</span>
        {normalized && showNormalizedRange && (
          <span className="font-mono text-[8px] tracking-normal text-zinc-700" title="Normalized value from zero to one">0–1</span>
        )}
      </span>
      <span className={`${hideLabel ? '' : 'mt-1'} flex min-w-0 items-center gap-1`}>
        <input
          aria-label={ariaLabel ?? label}
          title={help}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          {...inputProps}
          className={`${inputClass} min-w-0 w-full flex-1 ${resolvedAlign === 'left' ? 'text-left' : 'text-right'}`}
        />
        {suffix && <span className={suffixClass}>{suffix}</span>}
      </span>
    </label>
  )
}
