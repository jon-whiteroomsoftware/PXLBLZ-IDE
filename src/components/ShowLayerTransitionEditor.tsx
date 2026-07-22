import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, X, Zap } from 'lucide-react'
import type { ShowLayerTransition } from '@/engine/personalContentRecords'

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
        <label className="block text-[11px] text-zinc-500">
          Duration (seconds)
          <input
            key={transition.durationMs}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.001}
            defaultValue={seconds}
            aria-label="Layer Transition duration in seconds"
            onBlur={(event) => {
              const durationMs = Math.round(Number(event.currentTarget.value) * 1_000)
              if (!Number.isFinite(durationMs) || durationMs < 0) {
                event.currentTarget.value = String(seconds)
                return
              }
              onDurationChange(durationMs)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') onClose()
            }}
            className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs tabular-nums text-zinc-100 outline-none focus:border-amber-400/60"
          />
        </label>
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
