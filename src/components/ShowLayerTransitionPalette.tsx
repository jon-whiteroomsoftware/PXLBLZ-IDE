import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Zap } from 'lucide-react'
import { NumberField } from '@/components/ui/number-field'
import {
  buildShowToolkitPresentationCatalogue,
  filterShowToolkitPresentationCatalogue,
  type ShowToolkitPresentationItem,
} from '@/engine/showVisualToolkitPresentation'

export function ShowLayerTransitionPalette({
  stageDimensions,
  maxDurationMs,
  disabledReason,
  fromName,
  toName,
  onApply,
  onClose,
}: {
  stageDimensions: 1 | 2 | 3
  maxDurationMs: number
  disabledReason?: string
  fromName: string
  toName: string
  onApply: (item: ShowToolkitPresentationItem, durationMs: number) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [durationMs, setDurationMs] = useState(Math.min(2_000, maxDurationMs))
  const catalogue = useMemo(
    () => buildShowToolkitPresentationCatalogue({ stageDimensions }),
    [stageDimensions],
  )
  const items = useMemo(() => filterShowToolkitPresentationCatalogue(catalogue, {
    kind: 'transition',
    query,
    compatibleOnly: false,
  }).filter((item) => (
    !(item.familyId === 'blend' && item.variantId === 'cut')
    && item.familyId !== 'fade'
    && item.familyId !== 'motion'
  )), [catalogue, query])

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
      aria-label="Choose Layer Transition"
      className="fixed left-1/2 top-[76px] z-[90] flex max-h-[min(520px,calc(100vh-92px))] w-[min(680px,calc(100vw-16px))] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-zinc-700 bg-[#0b0c0f]/[0.985] font-mono shadow-[0_24px_80px_-18px_rgba(0,0,0,0.98)] backdrop-blur-sm"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
        <Zap size={14} className="text-amber-300" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-100">Choose Transition</h3>
          <p className="truncate text-[11px] text-zinc-500">{fromName} to {toName}</p>
        </div>
        <button type="button" onClick={onClose} className="ml-auto grid size-7 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close Layer Transition palette">
          <X size={14} />
        </button>
      </header>
      <div className="flex shrink-0 items-end gap-2 border-b border-zinc-800 p-2.5">
        <label className="relative min-w-0 flex-1">
          <span className="mb-1 block text-[11px] text-zinc-500">Search</span>
          <Search size={13} className="pointer-events-none absolute bottom-2 left-2 text-zinc-600" aria-hidden />
          <input
            autoFocus
            type="search"
            aria-label="Search Layer Transitions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Transitions"
            className="h-8 w-full rounded border border-zinc-700 bg-zinc-950 pl-7 pr-2 text-xs text-zinc-200 outline-none focus:border-amber-400/60"
          />
        </label>
        <div className="w-36 text-[11px] text-zinc-500">
          <NumberField
            label="Duration"
            suffix="seconds"
            variant="editor"
            compact
            min={0.001}
            max={maxDurationMs / 1_000}
            step={0.001}
            ariaLabel="Transition duration in seconds"
            value={durationMs / 1_000}
            onChange={(seconds) => {
              const next = Math.round(seconds * 1_000)
              setDurationMs(Math.max(1, Math.min(maxDurationMs, next)))
            }}
          />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-px overflow-auto bg-zinc-800 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={`Use ${item.label} Transition`}
            disabled={!item.compatible || maxDurationMs < 1}
            title={item.compatible ? item.summary : item.compatibilityReason ?? undefined}
            onClick={() => onApply(item, durationMs)}
            className="group flex min-h-14 min-w-0 flex-col justify-center bg-[#101115] px-3 text-left hover:bg-[#171920] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="truncate text-xs font-medium text-zinc-100">{item.label}</span>
            <span className="truncate text-[11px] text-zinc-500">{item.familyLabel} - {item.costPolicies.join(' - ')}</span>
          </button>
        ))}
      </div>
      <footer className="shrink-0 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
        {disabledReason
          ? disabledReason
          : `The Transition occupies timeline space; both Clip durations stay unchanged. Up to ${(maxDurationMs / 1_000).toFixed(3)} seconds fits here.`}
      </footer>
    </section>,
    document.body,
  )
}
