import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react'
import { DraftFieldActions } from './draft-field-actions'

export interface DraftTextFieldProps<T = string> {
  ariaLabel: string
  value: string
  parse?: (draft: string) => T | null
  formatApplied?: (value: T, draft: string) => string
  sanitize?: (draft: string) => string
  onApply: (value: T) => boolean | void
  onCancel?: () => void
  onDraftChange?: (draft: string) => void
  className?: string
  inputClassName?: string
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'aria-label' | 'className' | 'onChange' | 'value'>
  rootProps?: Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'onBlur'>
}

export function DraftTextField<T = string>({
  ariaLabel,
  value,
  parse,
  formatApplied,
  sanitize,
  onApply,
  onCancel,
  onDraftChange,
  className = '',
  inputClassName = '',
  inputProps,
  rootProps,
}: DraftTextFieldProps<T>) {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)
  const focusedRef = useRef(false)
  const committedDraftRef = useRef(value)
  const parsed = parse ? parse(draft) : draft as unknown as T

  useEffect(() => {
    if (focusedRef.current) {
      committedDraftRef.current = value
      return
    }
    committedDraftRef.current = value
    setDraft(value)
    setDirty(false)
  }, [value])

  const cancel = () => {
    focusedRef.current = false
    setDirty(false)
    setDraft(committedDraftRef.current)
    onDraftChange?.(committedDraftRef.current)
    onCancel?.()
  }
  const apply = () => {
    if (!dirty || parsed === null) return
    const accepted = onApply(parsed) !== false
    if (!accepted) return
    const appliedDraft = formatApplied?.(parsed, draft) ?? draft
    committedDraftRef.current = appliedDraft
    focusedRef.current = false
    setDirty(false)
    setDraft(appliedDraft)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    inputProps?.onKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.key === 'Enter') {
      event.preventDefault()
      apply()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  return (
    <span
      {...rootProps}
      className={`flex min-w-0 items-stretch ${className}`}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        cancel()
      }}
    >
      <input
        {...inputProps}
        aria-label={ariaLabel}
        aria-invalid={dirty && parsed === null ? true : inputProps?.['aria-invalid']}
        value={draft}
        onFocus={(event) => {
          focusedRef.current = true
          inputProps?.onFocus?.(event)
        }}
        onChange={(event) => {
          focusedRef.current = true
          setDirty(true)
          const nextDraft = sanitize?.(event.currentTarget.value) ?? event.currentTarget.value
          setDraft(nextDraft)
          onDraftChange?.(nextDraft)
        }}
        onKeyDown={onKeyDown}
        className={`min-w-0 flex-1 ${dirty ? 'rounded-r-none' : ''} ${inputClassName}`}
      />
      {dirty && (
        <DraftFieldActions
          label={ariaLabel}
          canApply={parsed !== null}
          onApply={apply}
          onCancel={cancel}
        />
      )}
    </span>
  )
}
