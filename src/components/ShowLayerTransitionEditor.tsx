import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, X, Zap } from 'lucide-react'
import type { ShowLayerTransition } from '@/engine/personalContentRecords'
import { TimeField } from '@/components/ui/time-field'

export function ShowLayerTransitionEditor({
  transition,
  fromName,
  toName,
  anchor,
  onDurationChange,
  onResetToCut,
  onClose,
}: {
  transition: ShowLayerTransition
  fromName: string
  toName: string
  anchor: HTMLElement
  onDurationChange: (durationMs: number) => void
  onResetToCut: () => void
  onClose: () => void
}) {
  const rect = anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(window.innerWidth - 288, rect.left))
  const top = Math.min(window.innerHeight - 180, rect.bottom + 6)
  const seconds = transition.durationMs / 1_000

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return createPortal(
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Layer Transition Details"
      className="fixed z-[85] w-[280px] overflow-hidden rounded-md border border-zinc-700 bg-[#0b0c0f]/[0.985] font-mono shadow-[0_18px_56px_-16px_rgba(0,0,0,0.98)] backdrop-blur-sm"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex min-h-10 items-center gap-2 border-b border-zinc-800 px-2.5">
        <Zap size={14} className="text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-medium capitalize text-zinc-100">{transition.kind}</h3>
          <p className="truncate text-[11px] text-zinc-500">{fromName} to {toName}</p>
        </div>
        <button type="button" aria-label="Close Layer Transition details" onClick={onClose} className="grid size-7 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100">
          <X size={14} />
        </button>
      </header>
      <div className="p-2.5">
        <TimeField
          label="Duration"
          ariaLabel="Layer Transition duration in seconds"
          value={seconds}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={0.001}
          variant="editor"
          onChange={(next) => onDurationChange(Math.round(next * 1_000))}
        />
      </div>
      <footer className="flex items-center border-t border-zinc-800 px-2.5 py-2">
        <button type="button" onClick={onResetToCut} className="ml-auto flex h-7 items-center gap-1.5 rounded px-2 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-amber-200">
          <RotateCcw size={13} aria-hidden />
          Reset to Cut
        </button>
      </footer>
    </section>,
    document.body,
  )
}
