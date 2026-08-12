import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { formatColorValue, parseColorValue } from '@/engine/colorValue'
import { DraftFieldActions } from './draft-field-actions'

export interface ColorFieldProps {
  label: string
  value: string
  disabled?: boolean
  compact?: boolean
  hideLabel?: boolean
  variant?: 'inspector' | 'editor'
  onPreview?: (value: string) => void
  onPreviewEnd?: () => void
  onChange: (value: string) => void
}

/** One authored-Color control: swatch/picker plus a buffered exact hex draft. */
export function ColorField({
  label,
  value,
  disabled = false,
  compact = false,
  hideLabel = false,
  variant = 'inspector',
  onPreview,
  onPreviewEnd,
  onChange,
}: ColorFieldProps) {
  const canonicalValue = formatColorValue(value)
  const [draft, setDraft] = useState(canonicalValue)
  const [exactDirty, setExactDirty] = useState(false)
  const exactFocusedRef = useRef(false)
  const committedValueRef = useRef(canonicalValue)
  const pickerCommittedRef = useRef(false)
  const pickerRef = useRef<HTMLInputElement>(null)
  const pickerPreviewActiveRef = useRef(false)
  const onPreviewEndRef = useRef(onPreviewEnd)

  useEffect(() => {
    onPreviewEndRef.current = onPreviewEnd
  }, [onPreviewEnd])

  useEffect(() => () => {
    if (pickerPreviewActiveRef.current) onPreviewEndRef.current?.()
  }, [])

  const endPickerPreview = () => {
    if (!pickerPreviewActiveRef.current) return
    pickerPreviewActiveRef.current = false
    onPreviewEndRef.current?.()
  }

  useEffect(() => {
    committedValueRef.current = canonicalValue
    if (exactFocusedRef.current) {
      return
    }
    setDraft(canonicalValue)
    setExactDirty(false)
  }, [canonicalValue])

  useEffect(() => {
    const picker = pickerRef.current
    if (!picker) return
    const commit = () => {
      const parsed = parseColorValue(picker.value)
      if (!parsed) return
      pickerCommittedRef.current = true
      committedValueRef.current = parsed
      setDraft(parsed)
      endPickerPreview()
      if (parsed !== canonicalValue) onChange(parsed)
    }
    picker.addEventListener('change', commit)
    return () => picker.removeEventListener('change', commit)
  }, [canonicalValue, onChange])

  const revert = (endPreview = false) => {
    exactFocusedRef.current = false
    setExactDirty(false)
    setDraft(committedValueRef.current)
    if (endPreview) endPickerPreview()
  }
  const commitExact = (raw: string) => {
    exactFocusedRef.current = false
    const parsed = parseColorValue(raw)
    if (!parsed) {
      revert()
      return
    }
    committedValueRef.current = parsed
    setExactDirty(false)
    setDraft(parsed)
    if (parsed !== canonicalValue) onChange(parsed)
  }
  const previewPicker = (event: FormEvent<HTMLInputElement>) => {
    const parsed = parseColorValue(event.currentTarget.value)
    if (!parsed) return
    setDraft(parsed)
    pickerPreviewActiveRef.current = true
    onPreview?.(parsed)
  }
  const onExactKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitExact(event.currentTarget.value)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      revert()
    }
  }
  const onPickerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    pickerCommittedRef.current = false
    revert(true)
  }

  const inspector = variant === 'inspector'
  const labelClass = inspector
    ? 'min-w-0 text-[9px] uppercase tracking-[0.1em] text-zinc-600'
    : `min-w-0 uppercase text-zinc-600 ${compact ? 'text-[9px] tracking-[0.08em]' : 'text-[10px]'}`
  const fieldHeight = compact ? 'h-5' : inspector ? 'h-6' : 'h-7'
  const fieldBackground = inspector ? 'bg-zinc-950' : 'bg-zinc-900'
  const swatch = parseColorValue(draft) ?? canonicalValue

  return (
    <label className={labelClass}>
      <span className={hideLabel ? 'sr-only' : ''}>{label}</span>
      <span
        className={`${hideLabel ? '' : 'mt-1'} ${fieldHeight} flex min-w-0 overflow-hidden rounded border border-zinc-700 ${fieldBackground} focus-within:border-cyan-400/60 disabled:opacity-60`}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          // A picker-previewed selection commits on blur: the native picker
          // panel is not inside this element, so an outside click used to
          // revert the user's chosen color (#827). Typed hex drafts keep the
          // #751 cancel-on-blur contract, and Escape still cancels both.
          if (pickerPreviewActiveRef.current) {
            const parsed = parseColorValue(draft)
            if (parsed && parsed !== committedValueRef.current) {
              commitExact(parsed)
              endPickerPreview()
              return
            }
          }
          revert(true)
        }}
      >
        <span
          className="relative w-8 shrink-0 border-r border-zinc-700"
          style={{ backgroundColor: swatch }}
          aria-hidden="true"
        >
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_46%,rgba(255,255,255,0.25)_50%,transparent_54%)] opacity-50" />
        </span>
        <input
          ref={pickerRef}
          type="color"
          aria-label={`${label} picker`}
          value={swatch}
          disabled={disabled}
          onFocus={() => {
            pickerCommittedRef.current = false
            if (exactDirty) revert()
          }}
          onInput={previewPicker}
          onBlur={() => {
            if (!pickerCommittedRef.current && draft !== canonicalValue) revert(true)
          }}
          onKeyDown={onPickerKeyDown}
          className="-ml-8 w-8 shrink-0 cursor-pointer opacity-0 disabled:cursor-default"
        />
        <input
          type="text"
          aria-label={`${label} exact value`}
          value={draft}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="none"
          onFocus={() => { exactFocusedRef.current = true }}
          onChange={(event) => {
            exactFocusedRef.current = true
            setExactDirty(true)
            setDraft(event.currentTarget.value)
          }}
          onKeyDown={onExactKeyDown}
          className="min-w-0 flex-1 bg-transparent px-1.5 text-left font-mono text-[9.5px] normal-case tracking-normal text-zinc-200 outline-none disabled:cursor-default disabled:opacity-60"
        />
        {exactDirty && (
          <DraftFieldActions
            label={label}
            canApply={parseColorValue(draft) !== null}
            contained
            onApply={() => commitExact(draft)}
            onCancel={revert}
          />
        )}
      </span>
    </label>
  )
}
