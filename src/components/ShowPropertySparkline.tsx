import type { ShowPropertyLaneBeat, ShowPropertyLaneProjection } from '@/engine/showPropertyLaneProjection'
import type { ShowPropertyLaneFamily, ShowPropertyLaneGlyph } from '@/engine/showPropertyLaneFamilies'
import {
  propertyLaneAnimatedSpanMs,
  propertyLaneAnimationIsPast,
  propertyLaneLabelObscuresCurve,
  propertyLaneLabelPlacement,
} from '@/engine/showPropertyLaneLabels'
import { useShowTransportStore } from '@/store/showTransportStore'
import { ShowPropertyLaneFamilyGlyph } from '@/components/ShowPropertyLaneFamilyGlyph'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const VERTICAL_INSET = 0.1
const VERTICAL_SPAN = 1 - VERTICAL_INSET * 2

export function ShowPropertySparkline({
  projection,
  ariaLabel,
  label,
  family,
  glyph = null,
  hoverText,
  showId,
  stickyLeftPx = 0,
  showFamilyGlyph = false,
  color = '#a78bfa',
  selectedBeatId = null,
  formatValue = defaultFormatValue,
  getBeatSelectionKey,
  onSelectBeat,
  onMoveBeat,
  className = '',
}: {
  projection: ShowPropertyLaneProjection
  ariaLabel: string
  label?: string
  family?: ShowPropertyLaneFamily
  /** Transform kind drawn in place of the family glyph (#63). */
  glyph?: ShowPropertyLaneGlyph | null
  hoverText?: string
  /** Show whose playhead retires this label once it passes the animated span. */
  showId?: string
  /** Width of the timeline's sticky first column, which the label must clear. */
  stickyLeftPx?: number
  /** Only when the gutter mark is absent does the label carry the family glyph. */
  showFamilyGlyph?: boolean
  color?: string
  selectedBeatId?: string | null
  formatValue?: (value: number) => string
  getBeatSelectionKey?: (beat: ShowPropertyLaneBeat) => string | undefined
  onSelectBeat?: (beat: ShowPropertyLaneBeat, anchor: HTMLButtonElement) => void
  onMoveBeat?: (beat: ShowPropertyLaneBeat, displayY: number) => void
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  // How much of the lane the label covers changes with zoom and window width,
  // so the fade is recomputed from measured geometry rather than guessed (#631).
  const [covered, setCovered] = useState({ from: 0, to: 0, visibleFrom: 0, labelStart: 0 })
  const measureCovered = useCallback(() => {
    const root = rootRef.current
    const labelElement = labelRef.current
    if (!root || !labelElement) return
    const lane = root.getBoundingClientRect()
    if (lane.width <= 0) return
    const box = labelElement.getBoundingClientRect()
    const clamp = (value: number) => Math.min(1, Math.max(0, value))
    const viewport = scrollParentRect(root)
    setCovered((current) => {
      const visibleLeft = viewport === null ? lane.left : viewport.left
      const next = {
        from: clamp((box.left - lane.left) / lane.width),
        to: clamp((box.right - lane.left) / lane.width),
        visibleFrom: clamp((visibleLeft - lane.left) / lane.width),
        // Where a start-placed label actually begins: past the sticky gutter (#63 review).
        labelStart: clamp((visibleLeft + stickyLeftPx + 4 - lane.left) / lane.width),
      }
      return next.from === current.from && next.to === current.to
        && next.visibleFrom === current.visibleFrom && next.labelStart === current.labelStart
        ? current
        : next
    })
  }, [stickyLeftPx])
  useLayoutEffect(() => {
    if (!label || typeof ResizeObserver === 'undefined') return
    // ResizeObserver delivers an initial callback on observe, which supplies the
    // first measurement without the effect body setting state itself.
    const observer = new ResizeObserver(measureCovered)
    if (rootRef.current) observer.observe(rootRef.current)
    if (labelRef.current) observer.observe(labelRef.current)
    return () => observer.disconnect()
  }, [label, measureCovered])
  useEffect(() => {
    if (!label) return
    // The label sticks to the viewport, so scrolling moves which slice of the
    // lane it covers even though nothing resized.
    const onScroll = () => measureCovered()
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', onScroll, { capture: true })
  }, [label, measureCovered])
  // The label moves off the curve when the lane has room after the animated
  // span (#63); width is measured, so the choice cannot oscillate with position.
  const placement = propertyLaneLabelPlacement(projection, covered.to - covered.from, covered.labelStart)
  const obscuresCurve = Boolean(label) && propertyLaneLabelObscuresCurve(projection, covered)
  // Selecting a boolean rather than the position keeps a playing Show from
  // re-rendering every lane on every frame: this flips at most once per pass.
  const animatedEndMs = propertyLaneAnimatedSpanMs(projection)?.endMs ?? null
  const playedPast = useShowTransportStore((state) => (
    animatedEndMs !== null && showId !== undefined && state.showId === showId && state.positionMs > animatedEndMs
  ))
  const retired = Boolean(label)
    && (playedPast || propertyLaneAnimationIsPast(projection, covered.visibleFrom))
  const points = projection.samples
    .map((sample) => `${sample.displayX * 100},${(VERTICAL_INSET + sample.displayY * VERTICAL_SPAN) * 10}`)
    .join(' ')

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={ariaLabel}
      title={hoverText}
      className={`relative min-w-0 ${className}`}
      data-property-lane-disclosed={projection.disclosed ? 'true' : 'false'}
    >
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Non-interactive so it can never swallow a beat click; the lane carries
          the hover text, and the full name stays on its accessible name (#631).
          Sticky, so the name follows a scrolled timeline. Its backing thins
          while it covers the animated span, and it retires altogether once the
          scrolled viewport or the playhead is past that span. Retirement opacity
          is computed, so it is set directly rather than through a utility class
          per value. */}
      {label && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] flex items-center">
          <span
            ref={labelRef}
            data-testid="show-property-lane-inline-label"
            data-obscures-curve={obscuresCurve ? 'true' : 'false'}
            data-retired={retired ? 'true' : 'false'}
            data-placement={placement.side}
            className={`${placement.side === 'start' ? 'sticky' : 'absolute'} flex max-w-[calc(100%-8px)] items-center gap-1 rounded-sm px-1 text-[10px] font-medium leading-[14px] transition-opacity duration-300 motion-reduce:transition-none ${
              obscuresCurve
                ? 'bg-black/25 shadow-none'
                : 'bg-black/75 shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
            }`}
            style={{
              color,
              left: placement.side === 'start' ? stickyLeftPx + 4 : `${placement.leftFraction * 100}%`,
              opacity: retired ? 0 : 1,
            }}
          >
            {showFamilyGlyph && family && <ShowPropertyLaneFamilyGlyph family={family} glyph={glyph} size={8} className="shrink-0" />}
            <span className="truncate">{label}</span>
          </span>
        </span>
      )}
      {projection.beats.map((beat) => {
        const label = `${beat.label ?? 'Property beat'}, value ${formatValue(beat.value)}`
        if (!onSelectBeat) {
          return (
            <i
              key={beat.id}
              data-property-beat-dot
              aria-hidden
              className="absolute z-[2] size-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${beat.displayX * 100}%`,
                top: `${(VERTICAL_INSET + beat.displayY * VERTICAL_SPAN) * 100}%`,
                backgroundColor: color,
              }}
            />
          )
        }
        return (
          <button
            key={beat.id}
            type="button"
            aria-label={label}
            title={label}
            data-show-selection-key={getBeatSelectionKey?.(beat)}
            data-property-beat-kind={beat.kind}
            onClick={(event) => {
              event.stopPropagation()
              onSelectBeat?.(beat, event.currentTarget)
            }}
            onPointerDown={onMoveBeat ? (event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              onSelectBeat?.(beat, event.currentTarget)
              event.currentTarget.setPointerCapture?.(event.pointerId)
            } : undefined}
            onPointerMove={onMoveBeat ? (event) => {
              if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return
              const bounds = rootRef.current?.getBoundingClientRect()
              if (!bounds) return
              const pointerY = (event.clientY - bounds.top) / Math.max(1, bounds.height)
              const displayY = Math.min(1, Math.max(0, (pointerY - VERTICAL_INSET) / VERTICAL_SPAN))
              onMoveBeat(beat, displayY)
            } : undefined}
            onPointerUp={onMoveBeat ? (event) => {
              if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture?.(event.pointerId)
              }
            } : undefined}
            onPointerCancel={onMoveBeat ? (event) => {
              if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture?.(event.pointerId)
              }
            } : undefined}
            className={`absolute z-[2] grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-amber-200 disabled:pointer-events-none motion-reduce:transition-none ${onMoveBeat ? 'cursor-ns-resize touch-none' : ''}`}
            style={{ left: `${beat.displayX * 100}%`, top: `${(VERTICAL_INSET + beat.displayY * VERTICAL_SPAN) * 100}%` }}
          >
            <i
              data-property-beat-dot
              aria-hidden
              className={`size-1 rounded-full ${selectedBeatId === beat.id ? 'bg-amber-200' : ''}`}
              style={selectedBeatId === beat.id ? undefined : { backgroundColor: color }}
            />
          </button>
        )
      })}
    </div>
  )
}

/** Visible box of the nearest horizontally scrollable ancestor. */
function scrollParentRect(from: HTMLElement): DOMRect | null {
  let element: HTMLElement | null = from.parentElement
  while (element) {
    if (/(auto|scroll)/.test(getComputedStyle(element).overflowX)) return element.getBoundingClientRect()
    element = element.parentElement
  }
  return null
}

function defaultFormatValue(value: number): string {
  return Number(value.toFixed(3)).toString()
}
