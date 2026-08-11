import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Minus, Plus, X } from 'lucide-react'
import { controlIcon, inlineIcon } from '@/components/iconScale'
import { parsePixelCountDraft, sanitizePixelCountDraft } from '@/engine/pixelCountDraft'
import { adjacentPreviewResolution, resolutionStepIndex } from '@/engine/previewResolution'
import { beginFineAdjust, moveFineAdjust, type FineAdjustDrag } from '@/engine/fineAdjust'
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
  const resolutionPointerRef = useRef<number | null>(null)
  const resolutionDragRef = useRef<FineAdjustDrag | null>(null)
  const resolutionWidthRef = useRef(1)
  const resolutionFineEngagedRef = useRef(false)
  const [resolutionFineActive, setResolutionFineActive] = useState(false)
  const parsed = parsePixelCountDraft(draft)
  const stepIndex = quickSelect ? resolutionStepIndex(quickSelect.steps, value) : null
  const resolutionIndex = stepIndex ?? (quickSelect ? (quickSelect.steps.length - 1) / 2 : 0)
  const resolutionIndexRef = useRef(resolutionIndex)
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

  const finishResolutionDrag = useCallback(() => {
    resolutionPointerRef.current = null
    resolutionDragRef.current = null
    resolutionFineEngagedRef.current = false
    setResolutionFineActive(false)
  }, [])

  const close = useCallback(() => {
    finishResolutionDrag()
    setOpen(false)
    setDraft(formatPixelCount(value))
  }, [finishResolutionDrag, value])

  function apply() {
    if (parsed == null) return
    onApply(parsed)
    setDraft(String(parsed))
    finishResolutionDrag()
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
        onClick={() => {
          finishResolutionDrag()
          setOpen((o) => !o)
        }}
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
                    {resolutionFineActive && (
                      <span className="text-amber-300" aria-live="polite">Fine</span>
                    )}
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
                      <X {...inlineIcon} aria-hidden />
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
                    <Minus {...controlIcon} aria-hidden />
                  </button>
                  <input
                    type="range"
                    aria-label="Preview resolution"
                    aria-valuetext={stepIndex == null ? 'Between natural resolution stops' : `${value} LEDs`}
                    min={0}
                    max={quickSelect.steps.length - 1}
                    step={1}
                    value={resolutionIndex}
                    onChange={(event) => {
                      if (resolutionPointerRef.current !== null && resolutionFineEngagedRef.current) return
                      const index = Math.round(Number(event.target.value))
                      resolutionIndexRef.current = index
                      quickSelect.onSelect(quickSelect.steps[index])
                    }}
                    onPointerDown={(event) => {
                      resolutionIndexRef.current = resolutionIndex
                      resolutionPointerRef.current = event.pointerId
                      resolutionFineEngagedRef.current = event.shiftKey
                      setResolutionFineActive(event.shiftKey)
                      resolutionWidthRef.current = Math.max(1, event.currentTarget.getBoundingClientRect().width)
                      resolutionDragRef.current = beginFineAdjust(
                        event.clientX,
                        resolutionIndex,
                      )
                      event.currentTarget.setPointerCapture?.(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (resolutionPointerRef.current !== event.pointerId) return
                      const wasEngaged = resolutionFineEngagedRef.current
                      if (event.shiftKey) resolutionFineEngagedRef.current = true
                      setResolutionFineActive(event.shiftKey)
                      const drag = resolutionDragRef.current
                      if (drag === null) return
                      if (!resolutionFineEngagedRef.current || !wasEngaged) {
                        // Re-anchor from the live index: the native thumb jump and its
                        // change event land after pointerdown, so the down-time anchor
                        // is stale by the first move (and by the fine transition).
                        resolutionDragRef.current = beginFineAdjust(
                          event.clientX,
                          resolutionIndexRef.current,
                        )
                        return
                      }
                      resolutionDragRef.current = moveFineAdjust(drag, event.clientX, {
                        fine: event.shiftKey,
                        scale: (quickSelect.steps.length - 1) / resolutionWidthRef.current,
                      })
                      const index = Math.max(
                        0,
                        Math.min(quickSelect.steps.length - 1, Math.round(resolutionDragRef.current.position)),
                      )
                      quickSelect.onSelect(quickSelect.steps[index])
                    }}
                    onPointerUp={(event) => {
                      if (resolutionPointerRef.current !== event.pointerId) return
                      event.currentTarget.releasePointerCapture?.(event.pointerId)
                      finishResolutionDrag()
                    }}
                    onPointerCancel={finishResolutionDrag}
                    onLostPointerCapture={(event) => {
                      if (resolutionPointerRef.current === null) return
                      if (event.pointerId !== resolutionPointerRef.current) return
                      finishResolutionDrag()
                    }}
                    data-fine-adjusting={resolutionFineActive ? 'true' : undefined}
                    title={resolutionFineActive ? 'Fine adjustment engaged' : 'Shift-drag for fine adjustment'}
                    className={`min-w-0 flex-1 ${resolutionFineActive ? 'ring-1 ring-amber-300/70' : ''} ${stepIndex == null ? 'deck-slider-unset' : 'accent-live'}`}
                  />
                  <button
                    type="button"
                    aria-label="Increase preview resolution"
                    title="Next natural resolution"
                    disabled={next == null}
                    onClick={() => { if (next != null) quickSelect.onSelect(next) }}
                    className="grid size-7 shrink-0 place-items-center rounded border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                  >
                    <Plus {...controlIcon} aria-hidden />
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
                <Check {...controlIcon} />
              </button>
            </div>
          </div>
        </MaybePortal>
      )}
    </span>
  )
}
