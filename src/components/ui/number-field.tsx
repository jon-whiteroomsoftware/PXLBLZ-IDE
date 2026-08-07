import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { DraftFieldActions } from './draft-field-actions'

// The one simple numeric-entry contract for the app (#577, #656): this is a
// decimal textbox, deliberately not a native number input/spinbutton. Keystrokes
// edit a local string draft (so deletion and partial numbers survive
// re-renders), the parsed value is bounded and committed only through Enter or
// the explicit apply action, and blur/Escape cancel. External value changes only
// sync while the field is not focused. Domain, time, and percentage values use
// the specialized BoundedNumberField wrappers instead.

export interface NumberFieldDraft {
  draft: string
  dirty: boolean
  canApply: boolean
  apply: () => void
  cancel: () => void
  fieldProps: {
    onBlur: (event: FocusEvent<HTMLElement>) => void
  }
  inputProps: {
    value: string
    onFocus: (event: FocusEvent<HTMLInputElement>) => void
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
    onBlur: (event: FocusEvent<HTMLInputElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  }
}

export function useNumberFieldDraft({ value, min, max, onChange }: {
  value?: number
  min?: number
  max?: number
  onChange: (value: number) => void
}): NumberFieldDraft {
  const renderedValue = value == null ? '' : String(value)
  const [draft, setDraft] = useState(renderedValue)
  const [dirty, setDirty] = useState(false)
  const focusedRef = useRef(false)
  const focusControlledDraftRef = useRef(renderedValue)
  const committedDraftRef = useRef(renderedValue)

  useEffect(() => {
    if (!focusedRef.current) {
      committedDraftRef.current = renderedValue
      setDraft(renderedValue)
      setDirty(false)
    } else if (renderedValue !== focusControlledDraftRef.current) {
      committedDraftRef.current = renderedValue
    }
  }, [renderedValue])

  const parsed = Number(draft)
  const parsedDraft = draft.trim() === '' || !Number.isFinite(parsed)
    ? null
    : Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, parsed))

  const cancel = () => {
    focusedRef.current = false
    setDirty(false)
    setDraft(committedDraftRef.current)
  }
  const apply = () => {
    if (!dirty || parsedDraft == null) return
    focusedRef.current = false
    const bounded = parsedDraft
    committedDraftRef.current = String(bounded)
    setDirty(false)
    setDraft(String(bounded))
    if (bounded !== value) onChange(bounded)
  }

  return {
    draft,
    dirty,
    canApply: dirty && parsedDraft != null,
    apply,
    cancel,
    fieldProps: {
      onBlur: (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        cancel()
      },
    },
    inputProps: {
      value: draft,
      onFocus: () => {
        focusedRef.current = true
        focusControlledDraftRef.current = renderedValue
      },
      onChange: (event) => {
        focusedRef.current = true
        setDirty(true)
        setDraft(event.target.value)
      },
      onBlur: () => {},
      onKeyDown: (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          apply()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
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
  value?: number
  min?: number
  max?: number
  step?: number
  placeholder?: string
  suffix?: string
  reserveSuffixSpace?: boolean
  help?: string
  labelAction?: ReactNode
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
  placeholder,
  suffix,
  reserveSuffixSpace = false,
  help,
  labelAction,
  hideLabel = false,
  showNormalizedRange = true,
  compact = false,
  align,
  disabled = false,
  variant = 'inspector',
  onChange,
}: NumberFieldProps) {
  const draftField = useNumberFieldDraft({ value, min, max, onChange })
  const { inputProps } = draftField
  const inputId = useId()
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
    <div className={labelClass} title={help}>
      <span className={hideLabel ? 'sr-only' : `flex ${compact ? 'h-3' : 'h-4'} items-center justify-between gap-1`}>
        <label htmlFor={inputId}>{label}</label>
        {labelAction}
        {normalized && showNormalizedRange && (
          <span className="font-mono text-[8px] tracking-normal text-zinc-700" title="Normalized value from zero to one">0–1</span>
        )}
      </span>
      <span className={`${hideLabel ? '' : compact ? 'mt-0.5' : 'mt-1'} flex min-w-0 items-center gap-1`}>
        <span className="flex min-w-0 flex-1 items-stretch" {...draftField.fieldProps}>
          <input
            id={inputId}
            aria-label={ariaLabel ?? label}
            title={help}
            type="text"
            inputMode="decimal"
            placeholder={placeholder}
            disabled={disabled}
            {...inputProps}
            className={`${inputClass} min-w-0 w-full flex-1 ${draftField.dirty ? 'rounded-r-none' : ''} ${resolvedAlign === 'left' ? 'text-left' : 'text-right'}`}
          />
          {draftField.dirty && (
            <DraftFieldActions
              label={ariaLabel ?? label}
              canApply={draftField.canApply}
              onApply={draftField.apply}
              onCancel={draftField.cancel}
            />
          )}
        </span>
        {(suffix !== undefined || reserveSuffixSpace) && (
          <span
            aria-hidden
            data-placement-suffix-gutter={reserveSuffixSpace ? '' : undefined}
            className={`${suffixClass} w-[11px] shrink-0 text-left`}
          >
            {suffix}
          </span>
        )}
      </span>
    </div>
  )
}
