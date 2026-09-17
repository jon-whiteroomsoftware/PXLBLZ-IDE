import { useMemo } from 'react'
import { buildShowV2AnimationLanes, type ShowV2AnimationLane } from '@/engine/showV2AnimationLaneModel'
import {
  showTimelineSelectionKey,
  type ShowTimelineItemView,
  type ShowTimelineSelection,
  type ShowTimelineViewModel,
} from '@/engine/showTimelineViewModel'

/**
 * Property lanes, held-appearance keys and Group occurrences for a v2 record,
 * drawn under the timeline surface.
 *
 * Every curve comes from `buildShowV2AnimationLanes`, which evaluates the
 * authored keys through the shared evaluator, so a key carrying a retained
 * `curveSegment` is drawn from that descriptor rather than re-normalized to a
 * straight line between the retained endpoints (specification section 6). The
 * component holds no record and writes nothing: it reports a selection and the
 * inspector panels own every edit.
 */
export function ShowV2AnimationLanes({
  view,
  selection,
  onSelect,
}: {
  view: ShowTimelineViewModel
  selection: ShowTimelineSelection | null
  onSelect: (selection: ShowTimelineSelection | null) => void
}) {
  const lanes = useMemo(() => buildShowV2AnimationLanes(view), [view])
  const selectionKey = selection ? showTimelineSelectionKey(selection) : null
  const totalMs = Math.max(1, view.showEndMs)
  const percent = (timeMs: number) => `${Math.min(100, Math.max(0, (timeMs / totalMs) * 100))}%`
  const itemsWithKeys = view.rows.flatMap((row) => row.layers.flatMap((layer) => (
    layer.items.filter((item) => (item.appearanceKeys?.length ?? 0) > 1)
  )))

  return (
    <section
      aria-label="Animation lanes"
      data-testid="show-v2-animation-lanes"
      className="shrink-0 border-t border-zinc-900 bg-[#060608] text-zinc-300"
    >
      {lanes.length === 0
        ? <p className="px-3 py-1.5 text-[9px] text-zinc-600">No Property tracks in this Show.</p>
        : lanes.map((lane) => (
          <PropertyLane
            key={lane.trackId}
            lane={lane}
            selected={selectionKey === `property-track:${lane.trackId}`}
            onSelect={() => onSelect({ kind: 'property-track', trackId: lane.trackId })}
          />
        ))}

      {itemsWithKeys.length > 0 && (
        <div role="group" aria-label="Held appearance keys" className="border-t border-zinc-900/80">
          {itemsWithKeys.map((item) => (
            <AppearanceLane key={item.id} item={item} percent={percent} />
          ))}
        </div>
      )}

      {view.rows.some((row) => row.groups.length > 0) && (
        <div role="group" aria-label="Group occurrences" className="border-t border-zinc-900/80">
          {view.rows.flatMap((row) => row.groups.map((group) => {
            const children = row.layers.flatMap((layer) => (
              layer.items.filter((item) => item.groupOccurrenceId === group.id)
            ))
            return (
              <div key={group.id} className="relative mx-2 my-1 h-6 min-w-0 rounded-sm bg-white/[0.025]">
                <button
                  type="button"
                  data-show-selection-key={showTimelineSelectionKey(group.selection)}
                  data-show-group-children={children.length}
                  aria-pressed={selectionKey === showTimelineSelectionKey(group.selection)}
                  aria-label={`Group ${group.name} in Zone ${row.zoneName}, ${
                    formatRange(group.startMs, group.endMs)}, ${children.length} Clips, ${
                    group.linkedOccurrenceCount} linked occurrences`}
                  onClick={() => onSelect(group.selection)}
                  className={`absolute inset-y-0 flex items-center gap-1 overflow-hidden rounded-[3px] border-l-2 px-1 text-left text-[9px] leading-none outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80 ${
                    selectionKey === showTimelineSelectionKey(group.selection)
                      ? 'border-violet-300 bg-violet-300/20 text-zinc-100'
                      : 'border-violet-300/60 bg-violet-300/10 text-zinc-300'}`}
                  style={{ left: percent(group.startMs), width: percent(group.durationMs) }}
                >
                  <span className="truncate">{group.name}</span>
                  <span className="truncate text-zinc-500">
                    {children.map((child) => child.patternName).join(', ') || 'no Clips'}
                  </span>
                </button>
              </div>
            )
          }))}
        </div>
      )}
    </section>
  )
}

function PropertyLane({
  lane,
  selected,
  onSelect,
}: {
  lane: ShowV2AnimationLane
  selected: boolean
  onSelect: () => void
}) {
  const retained = lane.retainedCurveKeyIds.length
  return (
    <button
      type="button"
      data-show-selection-key={`property-track:${lane.trackId}`}
      data-show-lane-owner={lane.ownerKind}
      data-show-lane-retained-keys={retained}
      aria-pressed={selected}
      aria-label={`${lane.label}, ${lane.ownerLabel}, active ${
        formatRange(lane.activeStartMs, lane.activeEndMs)}${
        lane.alignedToShowTime ? '' : ', definition-local time'}${
        retained ? `, ${retained} retained curve keys` : ''}`}
      onClick={onSelect}
      className={`flex w-full min-w-0 items-center gap-2 border-b border-zinc-900/80 px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-live/80 ${
        selected ? 'bg-white/[0.05]' : ''}`}
    >
      <span className="w-24 shrink-0 truncate text-[9px] text-zinc-400 sm:w-32">{lane.label}</span>
      <span className="relative h-6 min-w-0 flex-1 rounded-sm bg-white/[0.025]">
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-sm bg-live/[0.07]"
          style={{
            left: `${lane.activeStartFraction * 100}%`,
            width: `${lane.activeWidthFraction * 100}%`,
          }}
        />
        <svg
          aria-hidden
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <polyline
            points={lane.points}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.02}
            vectorEffect="non-scaling-stroke"
            className="text-live/80"
          />
          {lane.keys.map((key) => (
            <circle
              key={key.id}
              cx={key.displayX}
              cy={key.displayY}
              r={0.04}
              vectorEffect="non-scaling-stroke"
              className={key.retainedCurve ? 'fill-amber-300' : 'fill-zinc-300'}
            />
          ))}
        </svg>
      </span>
      <span className="w-14 shrink-0 text-right text-[8.5px] tabular-nums text-zinc-600">
        {lane.valueMin === lane.valueMax
          ? lane.valueMin.toFixed(2)
          : `${lane.valueMin.toFixed(2)}–${lane.valueMax.toFixed(2)}`}
      </span>
    </button>
  )
}

/** The Clip's authored held keys as ticks, so a held change is visible in time. */
function AppearanceLane({
  item,
  percent,
}: {
  item: ShowTimelineItemView
  percent: (timeMs: number) => string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1">
      <span className="w-24 shrink-0 truncate text-[9px] text-zinc-400 sm:w-32">{item.patternName} appearance</span>
      <span className="relative h-4 min-w-0 flex-1 rounded-sm bg-white/[0.025]">
        {(item.appearanceKeys ?? []).map((key) => (
          <span
            key={key.id}
            tabIndex={0}
            role="button"
            aria-disabled="true"
            data-show-appearance-key={key.id}
            aria-label={`Held appearance at ${formatTime(key.timeMs)}, opacity ${key.opacity.toFixed(2)}${
              key.effectKinds.length ? `, Effects ${key.effectKinds.join(', ')}` : ''}`}
            className="absolute inset-y-0 w-px bg-zinc-400 outline-none focus-visible:w-[3px] focus-visible:bg-live"
            style={{ left: percent(key.timeMs) }}
          />
        ))}
      </span>
      <span className="w-14 shrink-0 text-right text-[8.5px] tabular-nums text-zinc-600">
        {(item.appearanceKeys ?? []).length} keys
      </span>
    </div>
  )
}

function formatRange(startMs: number, endMs: number): string {
  return `${formatTime(startMs)} to ${formatTime(endMs)}`
}

function formatTime(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(2)}s`
}
