import { useId } from 'react'
import { Check, X } from 'lucide-react'
import { DisabledReasonTip } from './disabled-reason'

export function DraftFieldActions({
  label,
  canApply,
  cannotApplyReason,
  contained = false,
  onApply,
  onCancel,
}: {
  label: string
  canApply: boolean
  /** Why Apply is refusing (#796); keeps the button focusable with the reason in the a11y tree. */
  cannotApplyReason?: string
  contained?: boolean
  onApply: () => void
  onCancel: () => void
}) {
  const reasonId = useId()
  const explainRefusal = !canApply && cannotApplyReason !== undefined
  const border = contained
    ? 'border-l border-zinc-700'
    : 'border-y border-r border-zinc-700'
  const preserveDraftFocus = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }

  return (
    <span data-draft-field-actions className="inline-flex min-h-0 shrink-0 self-stretch">
      <span className="inline-flex">
        <button
          type="button"
          aria-label={`Apply ${label}`}
          title={canApply ? 'Apply' : undefined}
          disabled={!canApply && !explainRefusal}
          aria-disabled={!canApply || undefined}
          aria-describedby={explainRefusal ? reasonId : undefined}
          onPointerDown={preserveDraftFocus}
          onClick={canApply ? onApply : undefined}
          className={`${border} grid min-h-full w-[18px] place-items-center bg-live/10 text-live transition-colors hover:bg-live/20 disabled:bg-transparent disabled:text-zinc-700 aria-disabled:bg-transparent aria-disabled:text-zinc-700`}
        >
          <Check size={10} aria-hidden />
        </button>
        {explainRefusal && <DisabledReasonTip id={reasonId}>{cannotApplyReason}</DisabledReasonTip>}
      </span>
      <button
        type="button"
        aria-label={`Cancel ${label} edit`}
        title="Cancel"
        onPointerDown={preserveDraftFocus}
        onClick={onCancel}
        className={`${border} grid w-[18px] place-items-center bg-zinc-950 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200`}
      >
        <X size={10} aria-hidden />
      </button>
    </span>
  )
}
