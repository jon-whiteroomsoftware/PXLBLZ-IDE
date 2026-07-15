import { ChevronLeft, ChevronRight, Clapperboard, Lock } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import type { FlatShowCompositionProjection } from '@/engine/showCompositionProjection'
import {
  projectShowSceneEditorScope,
  type ShowSceneEditorScope,
} from '@/engine/showSceneEditorScope'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { useShowTransportStore } from '@/store/showTransportStore'

export function ShowSceneZoneEditor({
  show,
  compositionProjection,
  scope,
  readOnly,
  selectedClipId,
  transport,
  onBack,
  onZoneChange,
  onSelectClip,
  onSeek,
}: {
  show: ShowRecord
  compositionProjection: FlatShowCompositionProjection
  scope: ShowSceneEditorScope
  readOnly: boolean
  selectedClipId: string | null
  transport: ReactNode
  onBack: () => void
  onZoneChange: (zoneId: string) => void
  onSelectClip: (clipId: string, anchor: HTMLElement) => void
  onSeek: (globalTimeMs: number) => void
}) {
  const detail = projectShowSceneEditorScope(compositionProjection, scope)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  if (!detail) {
    return (
      <section role="status" className="border-b border-zinc-800 bg-[#080a0d] p-4 text-[10px] text-zinc-500">
        This Scene editing scope is no longer available.
      </section>
    )
  }

  const durationMs = Math.max(1, detail.scene.durationMs)
  const localTimeMs = clamp(positionMs - detail.globalStartMs, 0, durationMs)
  const seekFromTrack = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const fraction = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1)
    onSeek(detail.globalStartMs + fraction * durationMs)
  }

  return (
    <section
      role="region"
      aria-label={`${detail.scene.name} ${detail.zone.name} Scene editor`}
      data-testid="show-scene-zone-editor"
      className="border-b border-seam bg-[#060608] shadow-[inset_0_6px_14px_-8px_rgba(0,0,0,0.9),inset_0_-6px_14px_-10px_rgba(0,0,0,0.9)]"
    >
      <header className="flex h-9 min-w-0 items-center gap-1 border-b border-zinc-800 bg-[#0d1116] px-2 text-[10px]">
        <button
          type="button"
          aria-label="Back to Show timeline"
          onClick={onBack}
          className="mr-1 flex h-6 shrink-0 items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 text-zinc-300 hover:border-zinc-500 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
        >
          <ChevronLeft size={11} aria-hidden />
          Show
        </button>
        <Clapperboard size={11} aria-hidden className="shrink-0 text-cyan-300" />
        <strong className="min-w-0 truncate font-medium text-zinc-200">{detail.scene.name}</strong>
        <ChevronRight size={10} aria-hidden className="shrink-0 text-zinc-700" />
        <span className="max-w-36 truncate rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-400">
          {detail.layout?.name ?? 'Default'}
        </span>
        <ChevronRight size={10} aria-hidden className="shrink-0 text-zinc-700" />
        <label className="min-w-0">
          <span className="sr-only">Scene Zone</span>
          <select
            aria-label="Scene Zone"
            value={detail.zone.id}
            onChange={(event) => onZoneChange(event.target.value)}
            className="h-6 max-w-44 rounded border border-cyan-300/35 bg-cyan-300/10 px-2 text-[10px] text-cyan-100 outline-none focus:border-amber-300"
          >
            {detail.availableZones.map((zone) => (
              <option key={zone.id} value={zone.id}>{zone.name} · {zone.nominalPixelCount}px</option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-zinc-900 px-3 py-2">
        <div className="min-w-0 justify-self-start">{transport}</div>
        <output
          aria-label="Scene local time"
          className="whitespace-nowrap text-[10px] tabular-nums text-zinc-500"
        >
          <strong className="font-medium text-zinc-100">{formatTime(localTimeMs)}</strong>
          <span className="mx-1 text-zinc-700">/</span>
          {formatTime(durationMs)}
        </output>
        <span className="justify-self-end rounded border border-zinc-800 px-2 py-1 text-[8px] uppercase tracking-[0.1em] text-zinc-600">
          Main only
        </span>
      </div>

      <div className="min-w-[620px] px-3 pb-4 pt-2">
        <div className="grid h-6 grid-cols-[136px_minmax(0,1fr)] border border-zinc-800 bg-[#0d1014] text-[9px] text-zinc-500">
          <span className="flex items-center border-r border-zinc-800 px-2 uppercase tracking-[0.1em]">Local time</span>
          <span className="flex items-center justify-between px-1 tabular-nums">
            <i className="not-italic">0</i>
            <i className="not-italic">{formatTime(durationMs / 2)}</i>
            <i className="not-italic">{formatTime(durationMs)}</i>
          </span>
        </div>

        <div className="grid h-7 grid-cols-[136px_minmax(0,1fr)] border-x border-b border-zinc-800 text-[9px]">
          <span className="flex items-center gap-1 border-r border-zinc-800 bg-[#0d1116] px-2 text-zinc-500">
            Transitions <Lock size={8} aria-label="Read only" className="text-zinc-700" />
          </span>
          <span className="relative bg-[#090b0e] text-[8px] text-zinc-500">
            {detail.incomingBoundary && (
              <span className="absolute inset-y-1 left-1 flex items-center border border-zinc-700 bg-zinc-800/35 px-1.5">
                IN · {detail.incomingBoundary.kind}
              </span>
            )}
            {detail.outgoingBoundary && (
              <span className="absolute inset-y-1 right-1 flex items-center border border-zinc-700 bg-zinc-800/35 px-1.5">
                {detail.outgoingBoundary.kind} · OUT
              </span>
            )}
          </span>
        </div>

        <div className="grid h-11 grid-cols-[136px_minmax(0,1fr)] border-x border-b border-zinc-800">
          <span className="flex min-w-0 items-center gap-1.5 border-r border-zinc-800 bg-[#0d1116] px-2 text-[9px] text-zinc-300">
            <i aria-hidden className="size-1.5 shrink-0 bg-zinc-300" />
            <span className="truncate">Main clips · {detail.zone.name}</span>
          </span>
          <div
            data-testid="scene-local-time-track"
            className="relative bg-[repeating-linear-gradient(90deg,transparent_0_calc(12.5%-1px),#181d23_calc(12.5%-1px)_12.5%)]"
            onClick={seekFromTrack}
          >
            {detail.mainPlacements.map((placement) => (
              <button
                key={placement.id}
                type="button"
                aria-label={`Select ${placement.patternName} Main clip`}
                data-show-timeline-focus
                data-show-selection-key={`clip:${placement.sourceCellId}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectClip(placement.sourceCellId, event.currentTarget)
                }}
                className={`absolute inset-y-1 overflow-hidden rounded-[4px] border-l-[3px] px-2 text-left text-[10px] ${
                  selectedClipId === placement.sourceCellId
                    ? 'border-cyan-200 bg-slate-600/55 text-white outline outline-1 outline-cyan-300/70'
                    : 'border-zinc-400 bg-slate-700/45 text-zinc-100 hover:bg-slate-700/70'
                } ${readOnly ? 'cursor-default' : ''}`}
                style={{
                  left: `${placement.startMs / durationMs * 100}%`,
                  width: `${Math.max(2, (placement.endMs - placement.startMs) / durationMs * 100)}%`,
                }}
              >
                <strong className="font-medium">{placement.patternName}</strong>
                {placement.effectKinds.length > 0 && (
                  <span className="ml-2 text-[8px] text-emerald-300">{placement.effectKinds.length} FX</span>
                )}
                {placement.continuesFromPrevious && (
                  <span className="ml-2 text-[8px] text-cyan-300">Continue</span>
                )}
              </button>
            ))}
            {detail.mainPlacements.length === 0 && (
              <span className="absolute inset-1 flex items-center justify-center border border-dashed border-zinc-800 text-[9px] text-zinc-700">
                Empty Main interval
              </span>
            )}
            <i
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-amber-300 shadow-[0_0_5px_rgba(252,211,77,.75)]"
              style={{ left: `${localTimeMs / durationMs * 100}%` }}
            />
          </div>
        </div>

        {detail.diagnostics.length > 0 && (
          <div role="status" className="border-x border-b border-red-400/25 bg-red-400/[0.05] px-2 py-1.5 text-[9px] text-red-200">
            {detail.diagnostics.join(' ')}
          </div>
        )}
      </div>
    </section>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

function formatTime(timeMs: number): string {
  const tenths = Math.max(0, Math.round(timeMs / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
}
