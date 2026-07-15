import { ChevronLeft, ChevronRight, Clapperboard, Lock, Plus, RotateCw, Scissors, Trash2 } from 'lucide-react'
import { useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import type { FlatShowCompositionProjection } from '@/engine/showCompositionProjection'
import {
  projectShowSceneEditorScope,
  type ShowSceneEditorScope,
} from '@/engine/showSceneEditorScope'
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowPatternRef } from '@/engine/personalContentRecords'
import { resolveShowMainPlacementStart } from '@/engine/showCompositionModel'
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
  patternOptions,
  onEnableComposition,
  onAddMain,
  onUpdateMain,
  onSplitMain,
  onRestartMain,
  onReplaceMainPattern,
  onDeleteMain,
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
  patternOptions: Array<{ label: string; ref: ShowPatternRef }>
  onEnableComposition: () => void
  onAddMain: (input: { pattern: ShowPatternRef; patternName: string; startMs: number; durationMs: number }) => void
  onUpdateMain: (placementId: string, changes: { startMs: number; durationMs: number }) => void
  onSplitMain: (placementId: string, atMs: number) => void
  onRestartMain: (placementId: string) => void
  onReplaceMainPattern: (placementId: string, pattern: ShowPatternRef, patternName: string) => void
  onDeleteMain: (placementId: string) => void
}) {
  const [selectedMainId, setSelectedMainId] = useState<string | null>(null)
  const [newPatternKey, setNewPatternKey] = useState('')
  const [drag, setDrag] = useState<{ placementId: string; grabOffsetMs: number; startMs: number } | null>(null)
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
  const compositionMode = Boolean(show.composition)
  const selectedMain = compositionMode
    ? detail.mainPlacements.find((placement) => placement.id === selectedMainId) ?? null
    : null
  const selectedInstance = selectedMain
    ? show.composition?.patternInstances.find((instance) => instance.id === selectedMain.instanceId)
    : null
  const resolvedNewPattern = patternOptions.find((option) => (
    patternKey(option.ref) === (newPatternKey || patternKey(patternOptions[0]?.ref))
  )) ?? patternOptions[0]
  const addStartMs = Math.round(localTimeMs)
  const nextStartMs = detail.mainPlacements
    .filter((placement) => placement.startMs >= addStartMs)
    .sort((a, b) => a.startMs - b.startMs)[0]?.startMs ?? durationMs
  const canAddAtPlayhead = compositionMode
    && Boolean(resolvedNewPattern)
    && !detail.mainPlacements.some((placement) => placement.startMs <= addStartMs && placement.endMs > addStartMs)
    && nextStartMs > addStartMs
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
        <div className="flex min-w-0 items-center justify-self-end gap-1">
          {compositionMode ? (
            <>
              <select
                aria-label="New Main clip Pattern"
                value={newPatternKey || patternKey(patternOptions[0]?.ref)}
                onChange={(event) => setNewPatternKey(event.target.value)}
                disabled={readOnly || patternOptions.length === 0}
                className="h-6 max-w-40 rounded border border-zinc-800 bg-zinc-950 px-1.5 text-[9px] text-zinc-300"
              >
                {patternOptions.map((option) => <option key={patternKey(option.ref)} value={patternKey(option.ref)}>{option.label}</option>)}
              </select>
              <button
                type="button"
                disabled={readOnly || !canAddAtPlayhead}
                onClick={() => resolvedNewPattern && onAddMain({
                  pattern: resolvedNewPattern.ref,
                  patternName: resolvedNewPattern.label,
                  startMs: addStartMs,
                  durationMs: nextStartMs - addStartMs,
                })}
                className="flex h-6 items-center gap-1 rounded border border-zinc-700 px-1.5 text-[9px] text-zinc-300 hover:border-zinc-500 disabled:opacity-35"
              >
                <Plus size={10} aria-hidden /> Add at playhead
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={readOnly}
              onClick={onEnableComposition}
              className="h-6 rounded border border-cyan-300/30 bg-cyan-300/[0.06] px-2 text-[9px] text-cyan-200 disabled:opacity-35"
            >
              Enable local cuts
            </button>
          )}
          <span className="rounded border border-zinc-800 px-2 py-1 text-[8px] uppercase tracking-[0.1em] text-zinc-600">Main only</span>
        </div>
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
            {detail.mainPlacements.map((placement) => {
              const renderedStartMs = drag?.placementId === placement.id ? drag.startMs : placement.startMs
              const placementDurationMs = placement.endMs - placement.startMs
              return (
                <button
                key={placement.id}
                type="button"
                aria-label={`Select ${placement.patternName} Main clip`}
                data-show-timeline-focus
                data-show-selection-key={`clip:${placement.sourceCellId}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (compositionMode) setSelectedMainId(placement.id)
                  else onSelectClip(placement.sourceCellId, event.currentTarget)
                }}
                onPointerDown={(event) => {
                  if (!compositionMode || readOnly || event.button !== 0) return
                  const track = event.currentTarget.parentElement?.getBoundingClientRect()
                  if (!track) return
                  const atMs = clamp((event.clientX - track.left) / Math.max(1, track.width), 0, 1) * durationMs
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setDrag({
                    placementId: placement.id,
                    grabOffsetMs: atMs - placement.startMs,
                    startMs: placement.startMs,
                  })
                }}
                onPointerMove={(event: PointerEvent<HTMLButtonElement>) => {
                  if (!drag || drag.placementId !== placement.id || !event.currentTarget.hasPointerCapture(event.pointerId)) return
                  const track = event.currentTarget.parentElement?.getBoundingClientRect()
                  if (!track) return
                  const atMs = clamp((event.clientX - track.left) / Math.max(1, track.width), 0, 1) * durationMs
                  const startMs = resolveShowMainPlacementStart(
                    durationMs,
                    { id: placement.id, durationMs: placementDurationMs },
                    detail.mainPlacements.map((candidate) => ({
                      id: candidate.id,
                      startMs: candidate.startMs,
                      durationMs: candidate.endMs - candidate.startMs,
                    })),
                    atMs - drag.grabOffsetMs,
                    durationMs * 8 / Math.max(1, track.width),
                  )
                  setDrag({ ...drag, startMs })
                }}
                onPointerUp={(event) => {
                  if (!drag || drag.placementId !== placement.id) return
                  event.currentTarget.releasePointerCapture(event.pointerId)
                  onUpdateMain(placement.id, { startMs: drag.startMs, durationMs: placementDurationMs })
                  setDrag(null)
                }}
                onPointerCancel={() => setDrag(null)}
                className={`absolute inset-y-1 overflow-hidden rounded-[4px] border-l-[3px] px-2 text-left text-[10px] ${
                  (compositionMode ? selectedMainId === placement.id : selectedClipId === placement.sourceCellId)
                    ? 'border-cyan-200 bg-slate-600/55 text-white outline outline-1 outline-cyan-300/70'
                    : 'border-zinc-400 bg-slate-700/45 text-zinc-100 hover:bg-slate-700/70'
                } ${readOnly || !compositionMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                style={{
                  left: `${renderedStartMs / durationMs * 100}%`,
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
              )
            })}
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

        {selectedMain && (
          <div className="flex min-h-9 items-center gap-2 border-x border-b border-zinc-800 bg-[#0b0e12] px-2 text-[9px] text-zinc-400">
            <strong className="shrink-0 font-medium text-zinc-200">{selectedMain.patternName}</strong>
            <ExactTimeInput
              label="Start ms"
              value={selectedMain.startMs}
              disabled={readOnly}
              onCommit={(startMs) => onUpdateMain(selectedMain.id, {
                startMs,
                durationMs: selectedMain.endMs - selectedMain.startMs,
              })}
            />
            <ExactTimeInput
              label="Duration ms"
              value={selectedMain.endMs - selectedMain.startMs}
              disabled={readOnly}
              onCommit={(duration) => onUpdateMain(selectedMain.id, {
                startMs: selectedMain.startMs,
                durationMs: duration,
              })}
            />
            <label className="flex min-w-0 items-center gap-1">
              Pattern
              <select
                aria-label="Main clip Pattern"
                value={selectedInstance ? patternKey(selectedInstance.pattern) : ''}
                disabled={readOnly}
                onChange={(event) => {
                  const option = patternOptions.find((candidate) => patternKey(candidate.ref) === event.target.value)
                  if (option) onReplaceMainPattern(selectedMain.id, option.ref, option.label)
                }}
                className="h-6 max-w-36 rounded border border-zinc-800 bg-zinc-950 px-1 text-[9px] text-zinc-200"
              >
                {patternOptions.map((option) => <option key={patternKey(option.ref)} value={patternKey(option.ref)}>{option.label}</option>)}
              </select>
            </label>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Split Main clip at playhead"
                disabled={readOnly || localTimeMs <= selectedMain.startMs || localTimeMs >= selectedMain.endMs}
                onClick={() => onSplitMain(selectedMain.id, Math.round(localTimeMs))}
                className="grid size-6 place-items-center rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
              ><Scissors size={11} aria-hidden /></button>
              <button
                type="button"
                aria-label="Restart Main clip instance"
                disabled={readOnly}
                onClick={() => onRestartMain(selectedMain.id)}
                className="grid size-6 place-items-center rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
              ><RotateCw size={11} aria-hidden /></button>
              <button
                type="button"
                aria-label="Delete Main clip"
                disabled={readOnly}
                onClick={() => { onDeleteMain(selectedMain.id); setSelectedMainId(null) }}
                className="grid size-6 place-items-center rounded border border-zinc-800 text-zinc-500 hover:text-red-300 disabled:opacity-30"
              ><Trash2 size={11} aria-hidden /></button>
            </span>
          </div>
        )}

        {detail.diagnostics.length > 0 && (
          <div role="status" className="border-x border-b border-red-400/25 bg-red-400/[0.05] px-2 py-1.5 text-[9px] text-red-200">
            {detail.diagnostics.join(' ')}
          </div>
        )}
      </div>
    </section>
  )
}

function ExactTimeInput({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string
  value: number
  disabled: boolean
  onCommit: (value: number) => void
}) {
  return (
    <label className="flex shrink-0 items-center gap-1">
      {label}
      <input
        key={value}
        aria-label={label}
        type="number"
        min={0}
        step={1}
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next) && next !== value) onCommit(Math.round(next))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = String(value)
            event.currentTarget.blur()
          }
        }}
        className="h-6 w-20 rounded border border-zinc-800 bg-zinc-950 px-1.5 text-right text-[9px] tabular-nums text-zinc-200"
      />
    </label>
  )
}

function patternKey(pattern: ShowPatternRef | undefined): string {
  return pattern ? `${pattern.kind}:${pattern.id}` : ''
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
