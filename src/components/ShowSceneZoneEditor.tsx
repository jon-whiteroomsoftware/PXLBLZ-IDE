import { Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clapperboard, Lock, Plus, RotateCw, Scissors, SkipBack, SkipForward, Trash2 } from 'lucide-react'
import { useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import type { FlatShowCompositionProjection } from '@/engine/showCompositionProjection'
import {
  projectShowSceneEditorScope,
  type ShowSceneEditorScope,
} from '@/engine/showSceneEditorScope'
import type {
  ShowPatternRef,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPatternInstance,
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from '@/engine/personalContentRecords'
import { resolveShowMainPlacementStart } from '@/engine/showCompositionModel'
import {
  evaluateShowPropertyTrack,
  propertyTargetKey,
  showPropertyTrackNeighbors,
} from '@/engine/showPropertyAnimation'
import {
  showClipEffectParameterValue,
  showClipEffectParameters,
} from '@/engine/showEffectAuthoring'
import { SHOW_EASING_OPTIONS, showEasingFromOptionId, showEasingOptionId } from '@/engine/showEasing'
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
  onAddOverlayLayer,
  onRenameOverlayLayer,
  onReorderOverlayLayer,
  onDeleteOverlayLayer,
  onAddOverlay,
  onUpdateOverlay,
  onDeleteOverlay,
  onAddPropertyTrack,
  onDeletePropertyTrack,
  onAddPropertyKeyframe,
  onUpdatePropertyKeyframe,
  onDeletePropertyKeyframe,
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
  onAddOverlayLayer: () => void
  onRenameOverlayLayer: (layerId: string, name: string) => void
  onReorderOverlayLayer: (layerId: string, targetIndex: number) => void
  onDeleteOverlayLayer: (layerId: string) => void
  onAddOverlay: (layerId: string, input: { pattern: ShowPatternRef; patternName: string; startMs: number; durationMs: number }) => void
  onUpdateOverlay: (layerId: string, placementId: string, changes: { startMs: number; durationMs: number; opacity?: number; targetLayerId?: string }) => void
  onDeleteOverlay: (layerId: string, placementId: string) => void
  onAddPropertyTrack: (input: { target: ShowPropertyAnimationTarget; initialValue: number; atMs: number }) => void
  onDeletePropertyTrack: (trackId: string) => void
  onAddPropertyKeyframe: (trackId: string, keyframe: Omit<ShowPropertyAnimationKeyframe, 'id'>) => void
  onUpdatePropertyKeyframe: (
    trackId: string,
    keyframeId: string,
    changes: Partial<Pick<ShowPropertyAnimationKeyframe, 'timeMs' | 'value' | 'easing'>>,
  ) => void
  onDeletePropertyKeyframe: (trackId: string, keyframeId: string) => void
}) {
  const [selectedMainId, setSelectedMainId] = useState<string | null>(null)
  const [selectedOverlay, setSelectedOverlay] = useState<{ layerId: string; placementId: string } | null>(null)
  const [newPatternKey, setNewPatternKey] = useState('')
  const [drag, setDrag] = useState<{ placementId: string; grabOffsetMs: number; startMs: number } | null>(null)
  const [newTrackTargetKey, setNewTrackTargetKey] = useState('')
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ trackId: string; keyframeId: string } | null>(null)
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
  const selectedOverlayLayer = selectedOverlay
    ? detail.overlayLayers.find((layer) => layer.id === selectedOverlay.layerId) ?? null
    : null
  const selectedOverlayPlacement = selectedOverlayLayer
    ?.placements.find((placement) => placement.id === selectedOverlay?.placementId) ?? null
  const sceneComposition = show.composition?.scenes.find((scene) => scene.sceneId === scope.sceneId)
  const zoneComposition = sceneComposition?.zones.find((zone) => zone.zoneId === scope.zoneId)
  const selectedAuthoredPlacement = selectedMainId
    ? zoneComposition?.main.find((placement) => placement.id === selectedMainId)
    : selectedOverlay
      ? zoneComposition?.overlays.find((layer) => layer.id === selectedOverlay.layerId)
        ?.placements.find((placement) => placement.id === selectedOverlay.placementId)
      : undefined
  const selectedAuthoredInstance = selectedAuthoredPlacement
    ? show.composition?.patternInstances.find((instance) => instance.id === selectedAuthoredPlacement.instanceId)
    : undefined
  const animationOptions = selectedAuthoredPlacement && selectedAuthoredInstance
    ? buildShowAutomationOptions(selectedAuthoredInstance, selectedAuthoredPlacement)
    : []
  const selectedTracks = (sceneComposition?.propertyTracks ?? []).filter((track) => {
    if (!selectedAuthoredPlacement || !selectedAuthoredInstance) return false
    if ('instanceId' in track.target) return track.target.instanceId === selectedAuthoredInstance.id
    return track.target.placementId === selectedAuthoredPlacement.id
  })
  const authoredTargetKeys = new Set((sceneComposition?.propertyTracks ?? []).map((track) => propertyTargetKey(track.target)))
  const addableAnimationOptions = animationOptions.filter((option) => !authoredTargetKeys.has(option.key))
  const resolvedNewTrackOption = addableAnimationOptions.find((option) => option.key === newTrackTargetKey)
    ?? addableAnimationOptions[0]
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
          {compositionMode && (
            <button
              type="button"
              disabled={readOnly}
              onClick={onAddOverlayLayer}
              className="flex h-6 items-center gap-1 rounded border border-emerald-400/25 bg-emerald-400/[0.05] px-1.5 text-[9px] text-emerald-200 hover:border-emerald-300/50 disabled:opacity-35"
            >
              <Plus size={10} aria-hidden /> Overlay layer
            </button>
          )}
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

        {detail.overlayLayers.map((layer, layerIndex) => {
          const addSpan = availableSpanAt(layer.placements, addStartMs, durationMs)
          return (
            <div key={layer.id}>
              <div className="grid h-10 grid-cols-[136px_minmax(0,1fr)] border-x border-b border-zinc-800">
                <span className="flex min-w-0 items-center gap-0.5 border-r border-zinc-800 bg-[#0d1116] px-1 text-[9px] text-zinc-300">
                  <i aria-hidden className="ml-1 size-1.5 shrink-0 rounded-full bg-emerald-300/80" />
                  <input
                    key={layer.name}
                    aria-label={`${layer.name} layer name`}
                    defaultValue={layer.name}
                    disabled={readOnly}
                    onBlur={(event) => {
                      const name = event.currentTarget.value.trim()
                      if (name && name !== layer.name) onRenameOverlayLayer(layer.id, name)
                      else event.currentTarget.value = layer.name
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') {
                        event.currentTarget.value = layer.name
                        event.currentTarget.blur()
                      }
                    }}
                    className="h-6 min-w-0 flex-1 bg-transparent px-1 text-[9px] text-zinc-200 outline-none focus:bg-zinc-950"
                  />
                  <button type="button" aria-label={`Move ${layer.name} layer up`} disabled={readOnly || layerIndex === 0} onClick={() => onReorderOverlayLayer(layer.id, layerIndex - 1)} className="grid size-5 shrink-0 place-items-center text-zinc-600 hover:text-zinc-200 disabled:opacity-20"><ChevronUp size={10} /></button>
                  <button type="button" aria-label={`Move ${layer.name} layer down`} disabled={readOnly || layerIndex === detail.overlayLayers.length - 1} onClick={() => onReorderOverlayLayer(layer.id, layerIndex + 1)} className="grid size-5 shrink-0 place-items-center text-zinc-600 hover:text-zinc-200 disabled:opacity-20"><ChevronDown size={10} /></button>
                  <button
                    type="button"
                    aria-label={`Add clip to ${layer.name} at playhead`}
                    disabled={readOnly || !compositionMode || !resolvedNewPattern || !addSpan}
                    onClick={() => resolvedNewPattern && addSpan && onAddOverlay(layer.id, {
                      pattern: resolvedNewPattern.ref,
                      patternName: resolvedNewPattern.label,
                      startMs: addSpan.startMs,
                      durationMs: addSpan.durationMs,
                    })}
                    className="grid size-5 shrink-0 place-items-center text-emerald-500 hover:text-emerald-200 disabled:opacity-20"
                  ><Plus size={10} /></button>
                  <button type="button" aria-label={`Delete ${layer.name} layer`} disabled={readOnly} onClick={() => { onDeleteOverlayLayer(layer.id); setSelectedOverlay(null) }} className="grid size-5 shrink-0 place-items-center text-zinc-600 hover:text-red-300 disabled:opacity-20"><Trash2 size={10} /></button>
                </span>
                <div className="relative bg-[repeating-linear-gradient(90deg,transparent_0_calc(12.5%-1px),#181d23_calc(12.5%-1px)_12.5%)]" onClick={seekFromTrack}>
                  {layer.placements.map((placement) => (
                    <button
                      key={placement.id}
                      type="button"
                      aria-label={`Select ${placement.patternName} clip in ${layer.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedMainId(null)
                        setSelectedOverlay({ layerId: layer.id, placementId: placement.id })
                      }}
                      className={`absolute inset-y-1 overflow-hidden rounded-[4px] border-l-[3px] px-2 text-left text-[9px] ${
                        selectedOverlay?.layerId === layer.id && selectedOverlay.placementId === placement.id
                          ? 'border-emerald-200 bg-emerald-700/40 text-white outline outline-1 outline-emerald-300/60'
                          : 'border-emerald-400/70 bg-emerald-900/30 text-emerald-50 hover:bg-emerald-800/40'
                      }`}
                      style={{
                        left: `${placement.startMs / durationMs * 100}%`,
                        width: `${Math.max(2, (placement.endMs - placement.startMs) / durationMs * 100)}%`,
                      }}
                    >
                      <strong className="font-medium">{placement.patternName}</strong>
                      {placement.opacity < 1 && <span className="ml-1.5 text-[8px] text-emerald-300">{Math.round(placement.opacity * 100)}%</span>}
                      {placement.effectKinds.length > 0 && <span className="ml-1.5 text-[8px] text-cyan-300">{placement.effectKinds.length} FX</span>}
                    </button>
                  ))}
                  {layer.placements.length === 0 && <span className="absolute inset-1 flex items-center justify-center border border-dashed border-zinc-800 text-[8px] text-zinc-700">Empty overlay</span>}
                  <i aria-hidden className="pointer-events-none absolute inset-y-0 z-20 w-px bg-amber-300 shadow-[0_0_5px_rgba(252,211,77,.75)]" style={{ left: `${localTimeMs / durationMs * 100}%` }} />
                </div>
              </div>
              {selectedOverlayLayer?.id === layer.id && selectedOverlayPlacement && (
                <div className="flex min-h-9 items-center gap-2 border-x border-b border-zinc-800 bg-[#0b0e12] px-2 text-[9px] text-zinc-400">
                  <strong className="shrink-0 font-medium text-zinc-200">{selectedOverlayPlacement.patternName}</strong>
                  <ExactTimeInput label="Overlay start ms" value={selectedOverlayPlacement.startMs} disabled={readOnly} onCommit={(startMs) => onUpdateOverlay(layer.id, selectedOverlayPlacement.id, { startMs, durationMs: selectedOverlayPlacement.endMs - selectedOverlayPlacement.startMs })} />
                  <ExactTimeInput label="Overlay duration ms" value={selectedOverlayPlacement.endMs - selectedOverlayPlacement.startMs} disabled={readOnly} onCommit={(nextDurationMs) => onUpdateOverlay(layer.id, selectedOverlayPlacement.id, { startMs: selectedOverlayPlacement.startMs, durationMs: nextDurationMs })} />
                  <ExactNumberInput label="Opacity" value={selectedOverlayPlacement.opacity} min={0} max={1} step={0.01} disabled={readOnly} onCommit={(opacity) => onUpdateOverlay(layer.id, selectedOverlayPlacement.id, { startMs: selectedOverlayPlacement.startMs, durationMs: selectedOverlayPlacement.endMs - selectedOverlayPlacement.startMs, opacity })} />
                  <label className="flex min-w-0 items-center gap-1">Layer
                    <select aria-label="Overlay target layer" value={layer.id} disabled={readOnly} onChange={(event) => onUpdateOverlay(layer.id, selectedOverlayPlacement.id, { startMs: selectedOverlayPlacement.startMs, durationMs: selectedOverlayPlacement.endMs - selectedOverlayPlacement.startMs, targetLayerId: event.target.value })} className="h-6 max-w-28 rounded border border-zinc-800 bg-zinc-950 px-1 text-[9px] text-zinc-200">
                      {detail.overlayLayers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                    </select>
                  </label>
                  <button type="button" aria-label="Delete overlay clip" disabled={readOnly} onClick={() => { onDeleteOverlay(layer.id, selectedOverlayPlacement.id); setSelectedOverlay(null) }} className="ml-auto grid size-6 shrink-0 place-items-center rounded border border-zinc-800 text-zinc-500 hover:text-red-300 disabled:opacity-30"><Trash2 size={11} /></button>
                </div>
              )}
            </div>
          )
        })}

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
                  if (compositionMode) {
                    setSelectedOverlay(null)
                    setSelectedMainId(placement.id)
                  }
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

        {selectedAuthoredPlacement && selectedAuthoredInstance && (
          <PropertyAnimationPanel
            durationMs={durationMs}
            localTimeMs={Math.round(localTimeMs)}
            readOnly={readOnly}
            options={animationOptions}
            addableOptions={addableAnimationOptions}
            resolvedNewOption={resolvedNewTrackOption}
            newTargetKey={newTrackTargetKey}
            onNewTargetKey={setNewTrackTargetKey}
            tracks={selectedTracks}
            selectedKeyframe={selectedKeyframe}
            onSelectKeyframe={setSelectedKeyframe}
            onAddTrack={onAddPropertyTrack}
            onDeleteTrack={onDeletePropertyTrack}
            onAddKeyframe={onAddPropertyKeyframe}
            onUpdateKeyframe={onUpdatePropertyKeyframe}
            onDeleteKeyframe={onDeletePropertyKeyframe}
          />
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

interface ShowAutomationOption {
  key: string
  label: string
  target: ShowPropertyAnimationTarget
  value: number
  min: number
  max: number
  step: number
}

function PropertyAnimationPanel({
  durationMs,
  localTimeMs,
  readOnly,
  options,
  addableOptions,
  resolvedNewOption,
  newTargetKey,
  onNewTargetKey,
  tracks,
  selectedKeyframe,
  onSelectKeyframe,
  onAddTrack,
  onDeleteTrack,
  onAddKeyframe,
  onUpdateKeyframe,
  onDeleteKeyframe,
}: {
  durationMs: number
  localTimeMs: number
  readOnly: boolean
  options: ShowAutomationOption[]
  addableOptions: ShowAutomationOption[]
  resolvedNewOption?: ShowAutomationOption
  newTargetKey: string
  onNewTargetKey: (key: string) => void
  tracks: ShowPropertyAnimationTrack[]
  selectedKeyframe: { trackId: string; keyframeId: string } | null
  onSelectKeyframe: (selection: { trackId: string; keyframeId: string } | null) => void
  onAddTrack: (input: { target: ShowPropertyAnimationTarget; initialValue: number; atMs: number }) => void
  onDeleteTrack: (trackId: string) => void
  onAddKeyframe: (trackId: string, keyframe: Omit<ShowPropertyAnimationKeyframe, 'id'>) => void
  onUpdateKeyframe: (
    trackId: string,
    keyframeId: string,
    changes: Partial<Pick<ShowPropertyAnimationKeyframe, 'timeMs' | 'value' | 'easing'>>,
  ) => void
  onDeleteKeyframe: (trackId: string, keyframeId: string) => void
}) {
  return (
    <div className="border-x border-b border-zinc-800 bg-[#090c10]" aria-label="Property animation">
      <div className="flex h-7 items-center gap-1.5 border-b border-zinc-800 px-2 text-[9px]">
        <Activity size={10} aria-hidden className="text-violet-300" />
        <strong className="font-medium text-zinc-300">Animation</strong>
        <select
          aria-label="Property to animate"
          value={resolvedNewOption?.key ?? newTargetKey}
          disabled={readOnly || addableOptions.length === 0}
          onChange={(event) => onNewTargetKey(event.target.value)}
          className="ml-auto h-5 max-w-44 rounded border border-zinc-800 bg-zinc-950 px-1 text-[8px] text-zinc-300 disabled:opacity-35"
        >
          {addableOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          {addableOptions.length === 0 && <option value="">All available properties animated</option>}
        </select>
        <button
          type="button"
          aria-label="Animate selected property"
          disabled={readOnly || !resolvedNewOption}
          onClick={() => resolvedNewOption && onAddTrack({
            target: resolvedNewOption.target,
            initialValue: resolvedNewOption.value,
            atMs: localTimeMs,
          })}
          className="flex h-5 items-center gap-1 rounded border border-violet-300/25 px-1.5 text-[8px] text-violet-200 hover:border-violet-200/60 disabled:opacity-30"
        ><Plus size={9} aria-hidden /> Animate</button>
      </div>
      {tracks.map((track) => {
        const option = options.find((candidate) => candidate.key === propertyTargetKey(track.target))
        const selectedPoint = selectedKeyframe?.trackId === track.id
          ? track.keyframes.find((keyframe) => keyframe.id === selectedKeyframe.keyframeId)
          : undefined
        const hasPointAtPlayhead = track.keyframes.some((keyframe) => keyframe.timeMs === localTimeMs)
        return (
          <div key={track.id}>
            <div className="grid h-6 grid-cols-[136px_minmax(0,1fr)] border-b border-zinc-800/80">
              <span className="flex min-w-0 items-center gap-1 border-r border-zinc-800 px-2 text-[8px] text-zinc-400">
                <i aria-hidden className="size-1.5 shrink-0 rounded-full bg-violet-300" />
                <span className="truncate">{option?.label ?? propertyTargetKey(track.target)}</span>
                <button
                  type="button"
                  aria-label={`Add ${option?.label ?? 'property'} keyframe at playhead`}
                  disabled={readOnly || hasPointAtPlayhead}
                  onClick={() => onAddKeyframe(track.id, {
                    timeMs: localTimeMs,
                    value: evaluateShowPropertyTrack(track, localTimeMs),
                    easing: { curve: 'linear' },
                  })}
                  className="ml-auto grid size-4 shrink-0 place-items-center text-violet-400 hover:text-violet-200 disabled:opacity-20"
                ><Plus size={8} /></button>
                <button
                  type="button"
                  aria-label={`Delete ${option?.label ?? 'property'} animation`}
                  disabled={readOnly}
                  onClick={() => { onDeleteTrack(track.id); onSelectKeyframe(null) }}
                  className="grid size-4 shrink-0 place-items-center text-zinc-700 hover:text-red-300 disabled:opacity-20"
                ><Trash2 size={8} /></button>
              </span>
              <PropertySparkline
                track={track}
                durationMs={durationMs}
                min={option?.min ?? 0}
                max={option?.max ?? 1}
                selectedKeyframeId={selectedPoint?.id ?? null}
                onSelect={(keyframeId) => onSelectKeyframe({ trackId: track.id, keyframeId })}
              />
            </div>
            {selectedPoint && option && (
              <div className="flex min-h-8 items-center gap-1.5 border-b border-zinc-800 bg-[#0b0e12] px-2 text-[8px] text-zinc-500">
                <span className="font-medium text-violet-200">Point</span>
                <ExactTimeInput
                  label="Keyframe time ms"
                  value={selectedPoint.timeMs}
                  max={durationMs}
                  disabled={readOnly}
                  onCommit={(timeMs) => onUpdateKeyframe(track.id, selectedPoint.id, { timeMs })}
                />
                <ExactNumberInput
                  label="Keyframe value"
                  value={selectedPoint.value}
                  min={option.min}
                  max={option.max}
                  step={option.step}
                  disabled={readOnly}
                  onCommit={(value) => onUpdateKeyframe(track.id, selectedPoint.id, { value })}
                />
                <label className="flex items-center gap-1">Ease
                  <select
                    aria-label="Keyframe easing"
                    value={showEasingOptionId(selectedPoint.easing)}
                    disabled={readOnly}
                    onChange={(event) => onUpdateKeyframe(track.id, selectedPoint.id, { easing: showEasingFromOptionId(event.target.value) })}
                    className="h-6 max-w-32 rounded border border-zinc-800 bg-zinc-950 px-1 text-[8px] text-zinc-200"
                  >
                    {SHOW_EASING_OPTIONS.map((easing) => <option key={easing.id} value={easing.id}>{easing.label}</option>)}
                  </select>
                </label>
                <KeyframeNavigation
                  track={track}
                  keyframeId={selectedPoint.id}
                  onSelect={(keyframeId) => onSelectKeyframe({ trackId: track.id, keyframeId })}
                />
                <button
                  type="button"
                  aria-label="Delete keyframe"
                  disabled={readOnly || track.keyframes.length <= 2}
                  onClick={() => { onDeleteKeyframe(track.id, selectedPoint.id); onSelectKeyframe(null) }}
                  className="ml-auto grid size-6 place-items-center rounded border border-zinc-800 text-zinc-600 hover:text-red-300 disabled:opacity-25"
                ><Trash2 size={9} /></button>
              </div>
            )}
          </div>
        )
      })}
      {tracks.length === 0 && (
        <p className="px-2 py-1.5 text-[8px] text-zinc-700">Static values stay compact until you animate one.</p>
      )}
    </div>
  )
}

function PropertySparkline({ track, durationMs, min, max, selectedKeyframeId, onSelect }: {
  track: ShowPropertyAnimationTrack
  durationMs: number
  min: number
  max: number
  selectedKeyframeId: string | null
  onSelect: (keyframeId: string) => void
}) {
  const samples = Array.from({ length: 41 }, (_, index) => evaluateShowPropertyTrack(track, durationMs * index / 40))
  const authoredMin = Math.min(...samples)
  const authoredMax = Math.max(...samples)
  const constraintSpan = Math.max(0.000001, max - min)
  const minimumVisibleSpan = constraintSpan * 0.12
  const center = (authoredMin + authoredMax) / 2
  const visibleMin = authoredMax - authoredMin < minimumVisibleSpan ? center - minimumVisibleSpan / 2 : authoredMin
  const visibleMax = authoredMax - authoredMin < minimumVisibleSpan ? center + minimumVisibleSpan / 2 : authoredMax
  const y = (value: number) => 12 - clamp((value - visibleMin) / Math.max(0.000001, visibleMax - visibleMin), 0, 1) * 10
  const points = samples.map((value, index) => `${index * 2.5},${y(value)}`).join(' ')
  return (
    <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="h-full w-full overflow-visible bg-[#080a0d]" aria-label="Property sparkline">
      <polyline points={points} fill="none" stroke="#c4b5fd" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
      {track.keyframes.map((keyframe) => (
        <circle
          key={keyframe.id}
          role="button"
          aria-label={`Select keyframe at ${keyframe.timeMs} ms`}
          tabIndex={0}
          cx={clamp(keyframe.timeMs / durationMs, 0, 1) * 100}
          cy={y(keyframe.value)}
          r={selectedKeyframeId === keyframe.id ? 2.2 : 1.6}
          fill={selectedKeyframeId === keyframe.id ? '#fde68a' : '#c4b5fd'}
          vectorEffect="non-scaling-stroke"
          onClick={() => onSelect(keyframe.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(keyframe.id)
            }
          }}
        />
      ))}
    </svg>
  )
}

function KeyframeNavigation({ track, keyframeId, onSelect }: {
  track: ShowPropertyAnimationTrack
  keyframeId: string
  onSelect: (keyframeId: string) => void
}) {
  const neighbors = showPropertyTrackNeighbors(track, keyframeId)
  return (
    <span className="flex items-center gap-0.5">
      <button type="button" aria-label="Previous keyframe" disabled={!neighbors.previousId} onClick={() => neighbors.previousId && onSelect(neighbors.previousId)} className="grid size-6 place-items-center rounded border border-zinc-800 text-zinc-500 hover:text-white disabled:opacity-20"><SkipBack size={9} /></button>
      <button type="button" aria-label="Next keyframe" disabled={!neighbors.nextId} onClick={() => neighbors.nextId && onSelect(neighbors.nextId)} className="grid size-6 place-items-center rounded border border-zinc-800 text-zinc-500 hover:text-white disabled:opacity-20"><SkipForward size={9} /></button>
    </span>
  )
}

function buildShowAutomationOptions(
  instance: ShowPatternInstance,
  placement: ShowMainPlacement | ShowOverlayPlacement,
): ShowAutomationOption[] {
  const options: ShowAutomationOption[] = [
    animationOption('Animation speed', { kind: 'instance-time-scale', instanceId: instance.id }, instance.time.timeScale, 0, 4, 0.01),
    ...Object.entries(instance.controlTargets ?? {}).map(([exportName, value]) => (
      animationOption(exportName, { kind: 'instance-control', instanceId: instance.id, exportName }, value, 0, 1, 0.01)
    )),
    animationOption('Brightness', { kind: 'placement-view', placementId: placement.id, property: 'brightness' }, placement.view.brightness, 0, 1, 0.01),
    animationOption('Phase', { kind: 'placement-view', placementId: placement.id, property: 'phase' }, placement.view.phase, 0, 1, 0.01),
    ...('opacity' in placement
      ? [animationOption('Opacity', { kind: 'placement-opacity', placementId: placement.id }, placement.opacity, 0, 1, 0.01)]
      : []),
  ]
  for (const effect of placement.effects ?? []) {
    for (const parameter of showClipEffectParameters(effect)) {
      const value = showClipEffectParameterValue(effect, parameter.id)
      if (typeof value !== 'number') continue
      options.push(animationOption(
        `${effect.kind} · ${parameter.label}`,
        {
          kind: 'placement-effect',
          placementId: placement.id,
          effectId: effect.id,
          effectKind: effect.kind,
          parameterId: parameter.id,
        },
        value,
        parameter.min ?? -1000,
        parameter.max ?? 1000,
        parameter.step ?? 0.01,
      ))
    }
  }
  return options
}

function animationOption(
  label: string,
  target: ShowPropertyAnimationTarget,
  value: number,
  min: number,
  max: number,
  step: number,
): ShowAutomationOption {
  return { key: propertyTargetKey(target), label, target, value, min, max, step }
}

function ExactTimeInput({
  label,
  value,
  max,
  disabled,
  onCommit,
}: {
  label: string
  value: number
  max?: number
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
        max={max}
        step={1}
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value)
          const committed = Number.isFinite(next) ? Math.round(clamp(next, 0, max ?? Number.MAX_SAFE_INTEGER)) : value
          event.currentTarget.value = String(committed)
          if (committed !== value) onCommit(committed)
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

function ExactNumberInput({ label, value, min, max, step, disabled, onCommit }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  onCommit: (value: number) => void
}) {
  return (
    <label className="flex shrink-0 items-center gap-1">
      {label}
      {min === 0 && max === 1 && <span className="font-mono text-[8px] text-zinc-700" title="Normalized value from zero to one">0–1</span>}
      <input
        key={value}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const parsed = Number(event.currentTarget.value)
          const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : value
          event.currentTarget.value = String(next)
          if (next !== value) onCommit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = String(value)
            event.currentTarget.blur()
          }
        }}
        className="h-6 w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 text-right text-[9px] tabular-nums text-zinc-200"
      />
    </label>
  )
}

function availableSpanAt(
  placements: ReadonlyArray<{ startMs: number; endMs: number }>,
  atMs: number,
  sceneDurationMs: number,
): { startMs: number; durationMs: number } | null {
  if (placements.some((placement) => placement.startMs <= atMs && placement.endMs > atMs)) return null
  const nextStartMs = placements
    .filter((placement) => placement.startMs >= atMs)
    .reduce((nearest, placement) => Math.min(nearest, placement.startMs), sceneDurationMs)
  return nextStartMs > atMs ? { startMs: atMs, durationMs: nextStartMs - atMs } : null
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
