import type { ShowPropertyLaneBeat, ShowPropertyLaneProjection } from '@/engine/showPropertyLaneProjection'

export function ShowPropertySparkline({
  projection,
  ariaLabel,
  color = '#a78bfa',
  selectedBeatId = null,
  formatValue = defaultFormatValue,
  onSelectBeat,
  className = '',
}: {
  projection: ShowPropertyLaneProjection
  ariaLabel: string
  color?: string
  selectedBeatId?: string | null
  formatValue?: (value: number) => string
  onSelectBeat?: (beat: ShowPropertyLaneBeat, anchor: HTMLButtonElement) => void
  className?: string
}) {
  const points = projection.samples
    .map((sample) => `${sample.displayX * 100},${1 + sample.displayY * 8}`)
    .join(' ')

  return (
    <div
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
              style={{ left: `${beat.displayX * 100}%`, top: `${10 + beat.displayY * 80}%` }}
            />
          )
        }
        return (
          <button
            key={beat.id}
            type="button"
            aria-label={label}
            title={label}
            data-property-beat-kind={beat.kind}
            onClick={(event) => {
              event.stopPropagation()
              onSelectBeat?.(beat, event.currentTarget)
            }}
            className="absolute z-[1] grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-amber-200 disabled:pointer-events-none motion-reduce:transition-none"
            style={{ left: `${beat.displayX * 100}%`, top: `${10 + beat.displayY * 80}%` }}
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
