import { Flag, GitCommitHorizontal, LayoutPanelTop, Magnet, Maximize2 } from 'lucide-react'
import { fitShowTimelineViewport, type ShowTimelineViewport } from '@/engine/showTimelineViewport'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { ShowTimelineNavigator } from './ShowTimelineNavigator'

/**
 * How the v2 timeline is looked at: the visible window, what magnetizes a drag,
 * and which diagnostic lanes are drawn (#1039).
 *
 * None of it is record state. A control here changes what the surface shows and
 * what a drop resolver is offered, never a Clip, a time or a history entry. The
 * snap and Marker toggles are the shipped v1 toolbar controls, read from and
 * written to the same session store, so the preference follows the author
 * across both routes; the lane toggles are session-only.
 */
export function ShowTimelineViewControls({ showId, viewport, onViewportChange }: {
  /** The Show whose transport the navigator draws a playhead for. */
  showId?: string
  viewport: ShowTimelineViewport
  onViewportChange: (viewport: ShowTimelineViewport) => void
}) {
  const snapEnabled = useShowEditorSessionStore((state) => state.snapEnabled)
  const setSnapEnabled = useShowEditorSessionStore((state) => state.setSnapEnabled)
  const markersVisible = useShowEditorSessionStore((state) => state.markersVisible)
  const setMarkersVisible = useShowEditorSessionStore((state) => state.setMarkersVisible)
  const setMarkerSnapEnabled = useShowEditorSessionStore((state) => state.setMarkerSnapEnabled)
  const lanes = useShowEditorSessionStore((state) => state.timelineLanes)
  const setTimelineLane = useShowEditorSessionStore((state) => state.setTimelineLane)
  const fitted = fitShowTimelineViewport(viewport.totalMs)
  const isFitted = viewport.startMs === fitted.startMs && viewport.durationMs === fitted.durationMs

  return (
    <span role="group" aria-label="Timeline view controls" className="flex shrink-0 flex-wrap items-center gap-1">
      <span className="flex shrink-0 items-center gap-[1px]">
        <Toggle
          label="Snap to boundaries"
          title="Magnetize drags to nearby Clip, Transition, Marker, Show End and playhead boundaries. Drops always land on the time grid: whole seconds, finer as you zoom in - Shift for tenths, Alt for free placement."
          active={snapEnabled}
          onChange={setSnapEnabled}
          icon={<Magnet size={11} aria-hidden />}
        />
        <Toggle
          label={markersVisible ? 'Hide Markers' : 'Show Markers'}
          title={markersVisible
            ? 'Hide Markers and stop snapping to them'
            : 'Show Markers and use them as snap targets'}
          active={markersVisible}
          onChange={(visible) => {
            setMarkersVisible(visible)
            setMarkerSnapEnabled(visible)
          }}
          icon={<Flag size={11} aria-hidden />}
        />
        <Toggle
          label={lanes.zoneLayouts ? 'Hide the Zone Layouts lane' : 'Show the Zone Layouts lane'}
          title="Draw the Zone Layout occurrences this Show switches through"
          active={lanes.zoneLayouts}
          onChange={(visible) => setTimelineLane('zoneLayouts', visible)}
          icon={<LayoutPanelTop size={11} aria-hidden />}
        />
        <Toggle
          label={lanes.junctions ? 'Hide Transition junctions' : 'Show Transition junctions'}
          title="Draw each Transition window and each derived Cut on its Layer"
          active={lanes.junctions}
          onChange={(visible) => setTimelineLane('junctions', visible)}
          icon={<GitCommitHorizontal size={11} aria-hidden />}
        />
      </span>
      <span className="flex min-w-[104px] max-w-[210px] flex-1 shrink items-center gap-1">
        <ShowTimelineNavigator
          showId={showId ?? ''}
          viewport={viewport}
          onChange={onViewportChange}
          compact
        />
        <button
          type="button"
          aria-label="Fit timeline to Show"
          title="Fit the complete Show"
          aria-disabled={isFitted || undefined}
          onClick={() => { if (!isFitted) onViewportChange(fitted) }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-400 outline-none hover:bg-white/5 focus-visible:ring-1 focus-visible:ring-live/80 aria-disabled:opacity-35"
        >
          <Maximize2 size={11} aria-hidden />
        </button>
      </span>
    </span>
  )
}

function Toggle({ label, title, active, onChange, icon }: {
  label: string
  title: string
  active: boolean
  onChange: (next: boolean) => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={title}
      onClick={() => onChange(!active)}
      className={`flex h-5 w-5 items-center justify-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-live/80 ${
        active ? 'bg-amber-400/10 text-amber-300' : 'text-zinc-500 hover:bg-white/5'
      }`}
    >
      {icon}
    </button>
  )
}
