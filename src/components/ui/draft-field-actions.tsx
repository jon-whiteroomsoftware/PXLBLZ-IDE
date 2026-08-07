import { Check, X } from 'lucide-react'

export function DraftFieldActions({
  label,
  canApply,
  contained = false,
  onApply,
  onCancel,
}: {
  label: string
  canApply: boolean
  contained?: boolean
  onApply: () => void
  onCancel: () => void
}) {
  const border = contained
    ? 'border-l border-zinc-700'
    : 'border-y border-r border-zinc-700'
  const preserveDraftFocus = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }

  return (
    <span data-draft-field-actions className="inline-flex min-h-0 shrink-0 self-stretch">
      <button
        type="button"
        aria-label={`Apply ${label}`}
        title="Apply"
        disabled={!canApply}
        onPointerDown={preserveDraftFocus}
        onClick={onApply}
        className={`${border} grid w-[18px] place-items-center bg-live/10 text-live transition-colors hover:bg-live/20 disabled:bg-transparent disabled:text-zinc-700`}
      >
        <Check size={10} aria-hidden />
      </button>
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
