import type { ShowPropertyLaneBeat, ShowPropertyLaneProjection } from '@/engine/showPropertyLaneProjection'
import { useRef } from 'react'

const VERTICAL_INSET = 0.1
const VERTICAL_SPAN = 1 - VERTICAL_INSET * 2

export function ShowPropertySparkline({
  projection,
  ariaLabel,
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
  color?: string
  selectedBeatId?: string | null
  formatValue?: (value: number) => string
  getBeatSelectionKey?: (beat: ShowPropertyLaneBeat) => string | undefined
  onSelectBeat?: (beat: ShowPropertyLaneBeat, anchor: HTMLButtonElement) => void
  onMoveBeat?: (beat: ShowPropertyLaneBeat, displayY: number) => void
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const points = projection.samples
    .map((sample) => `${sample.displayX * 100},${(VERTICAL_INSET + sample.displayY * VERTICAL_SPAN) * 10}`)
    .join(' ')

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={ariaLabel}
      className={`relative min-w-0 overflow-hidden ${className}`}
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
      {projection.beats.map((beat) => {
        const label = `${beat.label ?? 'Property beat'}, value ${formatValue(beat.value)}`
        if (!onSelectBeat) {
          return (
            <i
              key={beat.id}
              data-property-beat-dot
              aria-hidden
              className="absolute z-[1] size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300"
              style={{ left: `${beat.displayX * 100}%`, top: `${(VERTICAL_INSET + beat.displayY * VERTICAL_SPAN) * 100}%` }}
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
            className={`absolute z-[1] grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-amber-200 disabled:pointer-events-none motion-reduce:transition-none ${onMoveBeat ? 'cursor-ns-resize touch-none' : ''}`}
            style={{ left: `${beat.displayX * 100}%`, top: `${(VERTICAL_INSET + beat.displayY * VERTICAL_SPAN) * 100}%` }}
          >
            <i
              data-property-beat-dot
              aria-hidden
              className={`size-1 rounded-full ${selectedBeatId === beat.id ? 'bg-amber-200' : 'bg-violet-300'}`}
            />
          </button>
        )
      })}
    </div>
  )
}

function defaultFormatValue(value: number): string {
  return Number(value.toFixed(3)).toString()
}
