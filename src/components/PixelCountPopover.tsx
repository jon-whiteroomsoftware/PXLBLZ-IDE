import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Minus, Plus, X } from 'lucide-react'
import { parsePixelCountDraft, sanitizePixelCountDraft } from '@/engine/pixelCountDraft'
import { adjacentPreviewResolution, resolutionStepIndex } from '@/engine/previewResolution'
import type { GridDims } from '@/engine/maps'
import { useAnchoredOverlayPosition } from './useAnchoredOverlayPosition'

function formatPixelCount(value: number | null): string {
  return value == null ? '' : String(value)
}

function MaybePortal({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? createPortal(children, document.body) : children
}

export function PixelCountPopover({
  value,
  triggerLabel,
  inputLabel,
  disabled = false,
  pending = false,
  portaled = false,
  quickSelect,
  onApply,
}: {
  value: number | null
  triggerLabel: string
  inputLabel: string
  disabled?: boolean
  pending?: boolean
  // Preview controls live in an overflow-clipped region, so their editor must
  // escape to the document. Other consumers retain local DOM containment for
  // their own outside-click boundaries.
  portaled?: boolean
  quickSelect?: {
    steps: readonly number[]
    dimensionsFor: (count: number) => GridDims | null
    realizedCountFor?: (count: number, dimensions: GridDims | null) => number
    onSelect: (count: number) => void
  }
  onApply: (count: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(formatPixelCount(value))
  const rootRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = parsePixelCountDraft(draft)
  const stepIndex = quickSelect ? resolutionStepIndex(quickSelect.steps, value) : null
  const previous = quickSelect ? adjacentPreviewResolution(quickSelect.steps, value, -1) : null
  const next = quickSelect ? adjacentPreviewResolution(quickSelect.steps, value, 1) : null
  const dimensions = value != null && quickSelect ? quickSelect.dimensionsFor(value) : null
  const realizedCount = value != null && quickSelect
    ? quickSelect.realizedCountFor?.(value, dimensions) ?? value
    : value
  const popoverStyle = useAnchoredOverlayPosition(triggerRef, popoverRef, open && portaled, {
    align: 'right',
    preferredSide: 'bottom',
    gap: 4,
  })

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
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) close()
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
        ref={triggerRef}
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
        <MaybePortal enabled={portaled}>
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`${inputLabel} editor`}
            style={portaled ? popoverStyle : undefined}
            className={`${portaled ? 'overflow-y-auto' : 'absolute -right-2 top-6 z-50'} rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-2xl font-mono text-xs text-zinc-300 ${quickSelect ? 'w-60' : 'w-36'}`}
          >
            {quickSelect && (
              <div className="mb-2 border-b border-zinc-700/80 pb-2">
                <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
                  <span>Resolution</span>
                  <span className="flex items-center gap-1">
                    <span className={stepIndex == null ? 'text-zinc-500' : 'text-live'}>
                      {stepIndex == null ? '—' : value?.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      aria-label={`Close ${inputLabel.toLowerCase()} editor`}
                      title="Close"
                      onClick={close}
                      className="grid size-5 place-items-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus:outline-none focus:text-zinc-200"
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Decrease preview resolution"
                    title="Previous natural resolution"
                    disabled={previous == null}
                    onClick={() => { if (previous != null) quickSelect.onSelect(previous) }}
                    className="grid size-7 shrink-0 place-items-center rounded border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                  >
                    <Minus size={13} aria-hidden />
                  </button>
                  <input
                    type="range"
                    aria-label="Preview resolution"
                    aria-valuetext={stepIndex == null ? 'Between natural resolution stops' : `${value} LEDs`}
                    min={0}
                    max={quickSelect.steps.length - 1}
                    step={1}
                    value={stepIndex ?? (quickSelect.steps.length - 1) / 2}
                    onChange={(event) => quickSelect.onSelect(quickSelect.steps[Math.round(Number(event.target.value))])}
                    className={`min-w-0 flex-1 ${stepIndex == null ? 'deck-slider-unset' : 'accent-live'}`}
                  />
                  <button
                    type="button"
                    aria-label="Increase preview resolution"
                    title="Next natural resolution"
                    disabled={next == null}
                    onClick={() => { if (next != null) quickSelect.onSelect(next) }}
                    className="grid size-7 shrink-0 place-items-center rounded border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                  >
                    <Plus size={13} aria-hidden />
                  </button>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] tabular-nums">
                  <span className="text-zinc-400">
                    {dimensions
                      ? dimensions.depth == null
                        ? `${dimensions.cols}×${dimensions.rows}`
                        : `${dimensions.cols}×${dimensions.rows}×${dimensions.depth}`
                      : 'Freeform'}
                  </span>
                  <span className="text-zinc-500">{realizedCount?.toLocaleString() ?? '—'} LEDs</span>
                </div>
              </div>
            )}
            {quickSelect && <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Exact count</div>}
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
        </MaybePortal>
      )}
    </span>
  )
}
