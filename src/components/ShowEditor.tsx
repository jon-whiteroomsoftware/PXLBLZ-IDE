import { useMemo, useState } from 'react'
import { Check, Code2, Play, RotateCw, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PixelblazeCodeEditor } from '@/components/PixelblazeCodeEditor'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { makeProgramId } from '@/engine/bytecodePush'
import {
  projectShowStrip,
  showLoopDurationMs,
  transitionCost,
} from '@/engine/showModel'
import { compileShowForPreview, type CompiledShowState } from '@/engine/showPreviewArtifact'
import {
  controllerZonePixelCount,
  findControllerZoneByName,
  type ControllerProfile,
  type ControllerZone,
} from '@/engine/controllerProfile'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useMapStore } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import type { MapRecord, ShowCell, ShowRecord, ShowScene } from '@/engine/personalContentRecords'

const card = 'rounded-md border border-zinc-800 bg-zinc-950/35'
const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'

type ShowSelection =
  | { kind: 'cell'; cellId: string }
  | { kind: 'transition'; afterSceneId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'show' }

export function ShowEditor({ showId }: { showId: string }) {
  const show = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const updateShow = useShowStore((state) => state.updateShow)
  const updateStageMap = useShowStore((state) => state.updateStageMap)
  const updateScene = useShowStore((state) => state.updateScene)
  const updateTransition = useShowStore((state) => state.updateTransition)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
  const updateCellPattern = useShowStore((state) => state.updateCellPattern)
  const extendCell = useShowStore((state) => state.extendCell)
  const spanCellZones = useShowStore((state) => state.spanCellZones)
  const addZone = useShowStore((state) => state.addZone)
  const updateZone = useShowStore((state) => state.updateZone)
  const removeZone = useShowStore((state) => state.removeZone)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const activeIp = useControllerStore((state) => state.activeIp)
  const activeController = useControllerStore((state) => (state.activeIp ? state.controllers[state.activeIp] : undefined))
  const [selection, setSelection] = useState<ShowSelection>({ kind: 'show' })
  const [generatedOpen, setGeneratedOpen] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)

  const activeShow = show ?? null
  const selectedCell = selection.kind === 'cell'
    ? activeShow?.cells.find((cell) => cell.id === selection.cellId) ?? null
    : null
  const targetProfile = activeShow?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === activeShow.targetControllerProfileId)
    : controllerProfiles[0]
  const compiled = useMemo(
    () => activeShow ? compileShowForPreview(activeShow, userPatterns, targetProfile?.zones, {}) : { artifact: null, error: null },
    [activeShow, userPatterns, targetProfile?.zones],
  )

  if (!activeShow) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950/40 font-mono text-xs text-zinc-500">
        Show not found
      </div>
    )
  }

  if (generatedOpen && compiled.artifact) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-zinc-950">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-seam px-3 font-mono text-xs text-zinc-400">
          <Code2 size={14} aria-hidden />
          <span className="flex-1 truncate text-zinc-200">Generated pattern - {activeShow.name}</span>
          <Button
            size="xs"
            variant="ghost"
            className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300"
            onClick={() => setGeneratedOpen(false)}
          >
            Back to show
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <PixelblazeCodeEditor value={compiled.artifact.code} readOnly />
        </div>
      </div>
    )
  }

  async function handlePushShow() {
    if (!compiled.artifact || !activeController || !activeIp || !activeShow) return
    const provider = getControllerProvider()
    setPushing(true)
    setPushResult(null)
    try {
      const bytecode = await provider.compile(compiled.artifact.code)
      await provider.pushBytecode(bytecode, { id: makeProgramId(), name: activeShow.name })
      setPushResult('Pushed')
    } catch (error) {
      setPushResult(error instanceof Error ? error.message : 'Push failed')
    } finally {
      setPushing(false)
    }
  }

  const patternOptions = [
    ...userPatterns.map((pattern) => ({
      label: pattern.name,
      ref: { kind: 'user' as const, id: pattern.id },
    })),
    ...GALLERY_PATTERNS.map((pattern) => ({
      label: pattern.name,
      ref: { kind: 'stock' as const, id: pattern.name },
    })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950/75 font-mono text-xs text-zinc-400">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="min-w-[760px] p-3">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase text-structural">
              {formatDuration(showLoopDurationMs(activeShow))} loop
            </span>
            <span className="flex-1" />
            <Button
              size="xs"
              variant="ghost"
              className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-40"
              disabled={!compiled.artifact}
              onClick={() => setGeneratedOpen(true)}
            >
              View generated pattern
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="bg-live/15 text-xs text-live hover:bg-live/20 disabled:opacity-40"
              disabled={!compiled.artifact || !activeController || pushing}
              onClick={() => void handlePushShow()}
              title={activeController ? `Push to ${activeController.nickname || activeIp}` : 'Connect a Controller to push'}
            >
              {pushing ? <RotateCw size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
              {activeController ? `Push to ${activeController.nickname || activeIp}` : 'Push to Controller'}
            </Button>
          </div>

          <SceneStrip
            show={activeShow}
            selection={selection}
            onSelect={setSelection}
            onUpdateScene={(sceneId, changes) => void updateScene(activeShow.id, sceneId, changes)}
          />

          <ContextualInspector
            show={activeShow}
            selection={selection}
            selectedCell={selectedCell}
            patternOptions={patternOptions}
            controllerProfiles={controllerProfiles}
            targetProfile={targetProfile}
            userMaps={userMaps}
            onUpdateTargetProfile={(targetControllerProfileId) => void updateShow(activeShow.id, {
              ...activeShow,
              targetControllerProfileId: targetControllerProfileId || undefined,
              updatedAt: Date.now(),
            })}
            onUpdateStageMap={(stageMapId) => void updateStageMap(activeShow.id, stageMapId)}
            onUpdatePattern={(cell, patch) => void updateCellPattern(activeShow.id, cell.id, patch)}
            onUpdateAdaptations={(cell, changes) => void updateCellAdaptations(activeShow.id, cell.id, changes)}
            onExtend={(cell, sceneSpan) => void extendCell(activeShow.id, cell.id, sceneSpan)}
            onSpanZones={(cell, zoneSpan) => void spanCellZones(activeShow.id, cell.id, zoneSpan)}
            onUpdateTransition={(sceneId, kind, durationMs) => void updateTransition(activeShow.id, sceneId, kind, durationMs)}
            onAddZone={() => void addZone(activeShow.id)}
            onUpdateZone={(zoneId, changes) => void updateZone(activeShow.id, zoneId, changes)}
            onRemoveZone={(zoneId) => void removeZone(activeShow.id, zoneId)}
          />
        </div>
      </div>
      <CompileBar
        compiled={compiled}
        targetPixels={targetProfile?.lastKnownPixelCount ?? zonePixelTotal(activeShow)}
        onViewGenerated={() => setGeneratedOpen(true)}
        pushResult={pushResult}
      />
    </div>
  )
}

function SceneStrip({
  show,
  selection,
  onSelect,
  onUpdateScene,
}: {
  show: ShowRecord
  selection: ShowSelection
  onSelect: (selection: ShowSelection) => void
  onUpdateScene: (sceneId: string, changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  const strip = projectShowStrip(show)
  const columns = ['150px', ...show.scenes.flatMap(() => ['minmax(150px,1fr)', '64px']).slice(0, -1)]
  return (
    <div className={`${card} overflow-x-auto p-2`} onClick={() => onSelect({ kind: 'show' })}>
      <div
        className="grid min-w-[720px] gap-1.5"
        style={{ gridTemplateColumns: columns.join(' ') }}
      >
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-2 text-[10px] uppercase text-zinc-500">
          zones down - scenes across
        </div>
        {show.scenes.map((scene) => (
          <SceneColumnHeader key={scene.id} scene={scene} onUpdate={(changes) => onUpdateScene(scene.id, changes)} />
        )).flatMap((node, index) => (
          index < strip.transitions.length
            ? [
                node,
                <TransitionGlyph
                  key={`t-${strip.transitions[index].afterSceneId}`}
                  show={show}
                  transition={strip.transitions[index]}
                  selected={selection.kind === 'transition' && selection.afterSceneId === strip.transitions[index].afterSceneId}
                  onSelect={() => onSelect({ kind: 'transition', afterSceneId: strip.transitions[index].afterSceneId })}
                />,
              ]
            : [node]
        ))}
        {strip.rows.map((row) => (
          <div key={row.zoneId} className="contents">
            <button
              type="button"
              aria-label={`Select zone ${row.zoneName}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ kind: 'zone', zoneId: row.zoneId })
              }}
              className={[
                'flex items-center gap-2 rounded border px-2 text-left text-zinc-300 transition-colors',
                selection.kind === 'zone' && selection.zoneId === row.zoneId
                  ? 'border-live/70 bg-live/10'
                  : 'border-zinc-800 bg-zinc-900/45 hover:border-zinc-700 hover:bg-zinc-900',
              ].join(' ')}
            >
              <span
                aria-hidden
                className="size-2 rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              <span className="truncate">{row.zoneName}</span>
              <span className="ml-auto text-[10px] text-zinc-600">{row.nominalPixelCount}px</span>
            </button>
            {row.cells.map((cell) => (
              <button
                key={cell.id}
                type="button"
                aria-label={`Select ${cell.patternName}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({ kind: 'cell', cellId: cell.id })
                }}
                className={[
                  'min-h-14 rounded-md border px-2 py-2 text-left transition-colors',
                  selection.kind === 'cell' && selection.cellId === cell.id
                    ? 'border-live/70 bg-live/10 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900',
                ].join(' ')}
                style={{
                  gridColumn: `${cell.columnStart} / span ${cell.columnSpan}`,
                  gridRow: `span ${cell.rowSpan}`,
                }}
              >
                <span className="block truncate text-[12px] font-semibold">{cell.patternName}</span>
                <span className="mt-1 block truncate text-[10px] text-zinc-500">
                  {adaptationSummary(cell)}
                  {cell.sceneSpan > 1 ? ' - hold' : ''}
                  {(cell.zoneSpan ?? 1) > 1 ? ' - span zones' : ''}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneColumnHeader({
  scene,
  onUpdate,
}: {
  scene: ShowScene
  onUpdate: (changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1.5">
      <input
        aria-label={`${scene.name} scene name`}
        value={scene.name}
        onChange={(event) => onUpdate({ name: event.target.value })}
        className="w-full bg-transparent text-[12px] font-semibold text-zinc-200 outline-none"
      />
      <label className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
        <input
          aria-label={`${scene.name} duration seconds`}
          type="number"
          min={1}
          value={Math.round(scene.durationMs / 1000)}
          onChange={(event) => onUpdate({ durationMs: Number(event.target.value) * 1000 })}
          className={`${field} h-6 w-16 px-1`}
        />
        s
      </label>
    </div>
  )
}

function TransitionGlyph({
  show,
  transition,
  selected,
  onSelect,
}: {
  show: ShowRecord
  transition: ReturnType<typeof projectShowStrip>['transitions'][number]
  selected: boolean
  onSelect: () => void
}) {
  const glyph = transition.kind === 'crossfade' ? 'xf' : transition.kind === 'wipe' ? 'wp' : transition.kind === 'dither' ? 'dt' : 'cut'
  const afterIndex = show.scenes.findIndex((scene) => scene.id === transition.afterSceneId)
  const from = show.scenes[afterIndex]?.name ?? 'Scene'
  const to = show.scenes[afterIndex + 1]?.name ?? 'next scene'
  return (
    <button
      type="button"
      aria-label={`Select ${from} to ${to} transition`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      className={[
        'flex min-h-14 flex-col items-center justify-center rounded border border-dashed bg-zinc-950/35 text-[10px] uppercase text-zinc-500 transition-colors',
        selected ? 'border-live/80 text-zinc-200' : 'border-zinc-800 hover:border-zinc-700 hover:text-zinc-300',
      ].join(' ')}
    >
      <span className={transition.cost === 'expensive' ? 'text-amber-300' : 'text-emerald-300'}>{glyph}</span>
      <span>{Math.round(transition.durationMs / 1000)}s</span>
    </button>
  )
}

function InspectorPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} mt-3 min-h-36 p-3`}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase text-zinc-500">{title}</h3>
      {children}
    </section>
  )
}

function ContextualInspector({
  show,
  selection,
  selectedCell,
  patternOptions,
  controllerProfiles,
  targetProfile,
  userMaps,
  onUpdateTargetProfile,
  onUpdateStageMap,
  onUpdatePattern,
  onUpdateAdaptations,
  onExtend,
  onSpanZones,
  onUpdateTransition,
  onAddZone,
  onUpdateZone,
  onRemoveZone,
}: {
  show: ShowRecord
  selection: ShowSelection
  selectedCell: ShowCell | null
  patternOptions: Array<{ label: string; ref: ShowCell['pattern'] }>
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdateStageMap: (stageMapId: string | null) => void
  onUpdatePattern: (cell: ShowCell, patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onUpdateAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
  onExtend: (cell: ShowCell, sceneSpan: number) => void
  onSpanZones: (cell: ShowCell, zoneSpan: number) => void
  onUpdateTransition: (sceneId: string, kind: NonNullable<ShowScene['transitionOut']>['kind'], durationMs: number) => void
  onAddZone: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
}) {
  if (selection.kind === 'cell' && selectedCell) {
    return (
      <CellInspector
        show={show}
        cell={selectedCell}
        patternOptions={patternOptions}
        onUpdatePattern={(patch) => onUpdatePattern(selectedCell, patch)}
        onUpdateAdaptations={(changes) => onUpdateAdaptations(selectedCell, changes)}
        onExtend={(sceneSpan) => onExtend(selectedCell, sceneSpan)}
        onSpanZones={(zoneSpan) => onSpanZones(selectedCell, zoneSpan)}
      />
    )
  }

  if (selection.kind === 'transition') {
    return (
      <TransitionInspector
        show={show}
        afterSceneId={selection.afterSceneId}
        onUpdateTransition={onUpdateTransition}
      />
    )
  }

  if (selection.kind === 'zone') {
    const zone = show.zones.find((candidate) => candidate.id === selection.zoneId)
    if (zone) {
      return (
        <ZoneInspector
          show={show}
          zone={zone}
          targetName={targetProfile?.name}
          targetZones={targetProfile?.zones ?? []}
          onUpdateZone={(changes) => onUpdateZone(zone.id, changes)}
          onRemoveZone={() => onRemoveZone(zone.id)}
        />
      )
    }
  }

  return (
    <ShowSetupInspector
      show={show}
      controllerProfiles={controllerProfiles}
      targetProfile={targetProfile}
      userMaps={userMaps}
      onUpdateTargetProfile={onUpdateTargetProfile}
      onUpdateStageMap={onUpdateStageMap}
      onAddZone={onAddZone}
    />
  )
}

function CellInspector({
  show,
  cell,
  patternOptions,
  onUpdatePattern,
  onUpdateAdaptations,
  onExtend,
  onSpanZones,
}: {
  show: ShowRecord
  cell: ShowCell
  patternOptions: Array<{ label: string; ref: ShowCell['pattern'] }>
  onUpdatePattern: (patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onUpdateAdaptations: (changes: Partial<ShowCell['adaptations']>) => void
  onExtend: (sceneSpan: number) => void
  onSpanZones: (zoneSpan: number) => void
}) {
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
  const maxSpan = Math.max(1, show.scenes.length - sceneIndex)
  const zoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
  const maxZoneSpan = Math.max(1, show.zones.length - zoneIndex)
  const zone = show.zones[zoneIndex]
  const scene = show.scenes[sceneIndex]
  return (
    <InspectorPanel title={`${cell.patternName} - cell - ${zone?.name ?? 'zone'} - ${scene?.name ?? 'scene'}`}>
      <label className="block text-[10px] uppercase text-zinc-600">
        Source pattern
        <select
          aria-label="Source pattern"
          value={`${cell.pattern.kind}:${cell.pattern.id}`}
          onChange={(event) => {
            const option = patternOptions.find((item) => `${item.ref.kind}:${item.ref.id}` === event.target.value)
            if (option) onUpdatePattern({ pattern: option.ref, patternName: option.label })
          }}
          className={`${field} mt-1 w-full`}
        >
          {patternOptions.map((option) => (
            <option key={`${option.ref.kind}:${option.ref.id}`} value={`${option.ref.kind}:${option.ref.id}`}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={cell.adaptations.mirror}
            onChange={(event) => onUpdateAdaptations({ mirror: event.target.checked })}
          />
          Mirror cell
        </label>
        <label className="text-[10px] uppercase text-zinc-600">
          Hold scenes
          <select
            aria-label="Hold scenes"
            value={cell.sceneSpan}
            onChange={(event) => onExtend(Number(event.target.value))}
            className={`${field} mt-1 w-full`}
          >
            {Array.from({ length: maxSpan }, (_, index) => index + 1).map((span) => (
              <option key={span} value={span}>{span}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase text-zinc-600">
          Span zones
          <select
            aria-label="Span zones"
            value={cell.zoneSpan ?? 1}
            onChange={(event) => onSpanZones(Number(event.target.value))}
            className={`${field} mt-1 w-full`}
          >
            {Array.from({ length: maxZoneSpan }, (_, index) => index + 1).map((span) => (
              <option key={span} value={span}>{span}</option>
            ))}
          </select>
        </label>
        <NumberField label="Phase" value={cell.adaptations.phase} min={0} max={1} step={0.01} onChange={(phase) => onUpdateAdaptations({ phase })} />
        <NumberField label="Brightness" value={cell.adaptations.brightness} min={0} max={1} step={0.01} onChange={(brightness) => onUpdateAdaptations({ brightness })} />
        <NumberField label="Time x" value={cell.adaptations.timeScale} min={0.1} max={4} step={0.1} onChange={(timeScale) => onUpdateAdaptations({ timeScale })} />
      </div>
    </InspectorPanel>
  )
}

function TransitionInspector({
  show,
  afterSceneId,
  onUpdateTransition,
}: {
  show: ShowRecord
  afterSceneId: string
  onUpdateTransition: (sceneId: string, kind: NonNullable<ShowScene['transitionOut']>['kind'], durationMs: number) => void
}) {
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === afterSceneId)
  const scene = show.scenes[sceneIndex] ?? show.scenes[0]
  const nextScene = show.scenes[sceneIndex + 1]
  const transition = scene.transitionOut ?? { kind: 'cut' as const, durationMs: 0 }
  const cost = transitionCost(transition.kind)
  return (
    <InspectorPanel title={`${scene?.name ?? 'Scene'} -> ${nextScene?.name ?? 'next'} - transition`}>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase text-zinc-600">
          Boundary
          <div className="mt-1 text-zinc-300">{scene?.name} to {nextScene?.name}</div>
        </label>
        <label className="text-[10px] uppercase text-zinc-600">
          Kind
          <select
            aria-label="Transition kind"
            value={transition.kind}
            onChange={(event) => onUpdateTransition(scene.id, event.target.value as NonNullable<ShowScene['transitionOut']>['kind'], transition.durationMs || 2000)}
            className={`${field} mt-1 w-full`}
          >
            <option value="cut">cut</option>
            <option value="crossfade">crossfade</option>
            <option value="wipe">wipe</option>
            <option value="dither">dither</option>
          </select>
        </label>
        <NumberField
          label="Duration seconds"
          value={Math.round(transition.durationMs / 1000)}
          min={0}
          max={30}
          step={1}
          onChange={(seconds) => onUpdateTransition(scene.id, transition.kind, seconds * 1000)}
        />
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] text-zinc-500">
          Cost tier:{' '}
          <span className={cost === 'expensive' ? 'text-amber-300' : cost === 'cheap' ? 'text-emerald-300' : 'text-zinc-300'}>
            {cost}
          </span>
        </div>
      </div>
    </InspectorPanel>
  )
}

function ShowSetupInspector({
  show,
  controllerProfiles,
  targetProfile,
  userMaps,
  onUpdateTargetProfile,
  onUpdateStageMap,
  onAddZone,
}: {
  show: ShowRecord
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdateStageMap: (stageMapId: string | null) => void
  onAddZone: () => void
}) {
  const zonePixels = show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)
  return (
    <InspectorPanel title="Show setup">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-[10px] uppercase text-zinc-600">
          Target controller
          <select
            aria-label="Target controller"
            value={show.targetControllerProfileId ?? ''}
            onChange={(event) => onUpdateTargetProfile(event.target.value)}
            className={`${field} mt-1 w-full`}
          >
            <option value="">automatic</option>
            {controllerProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase text-zinc-600">
          Stage map
          <select
            aria-label="Stage map"
            value={show.stageMapId ?? ''}
            onChange={(event) => onUpdateStageMap(event.target.value || null)}
            className={`${field} mt-1 w-full`}
          >
            <option value="">none</option>
            {userMaps.map((map) => (
              <option key={map.id} value={map.id}>{map.name}</option>
            ))}
          </select>
        </label>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Loop
          <div className="mt-1 text-xs text-zinc-300">{formatDuration(showLoopDurationMs(show))}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Zones
          <div className="mt-1 text-xs text-zinc-300">
            {show.zones.length} zone{show.zones.length === 1 ? '' : 's'} - {zonePixels} px
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
        <span>Using {targetProfile?.name ?? 'nominal zones'} for compile estimates.</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onAddZone}
          className="h-7 rounded border border-zinc-800 px-2 text-[10px] uppercase tracking-wider text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
        >
          Add zone
        </button>
      </div>
    </InspectorPanel>
  )
}

function ZoneInspector({
  show,
  zone,
  targetName,
  targetZones,
  onUpdateZone,
  onRemoveZone,
}: {
  show: ShowRecord
  zone: ShowRecord['zones'][number]
  targetName?: string
  targetZones: ControllerZone[]
  onUpdateZone: (changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: () => void
}) {
  return (
    <InspectorPanel title={`${zone.name} - zone${targetName ? ` - ${targetName}` : ''}`}>
      <div className="grid gap-2 rounded border border-zinc-800 bg-zinc-950/55 p-2 md:grid-cols-[minmax(140px,1fr)_96px_36px]">
        <label className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color ?? '#38bdf8' }} />
          <input
            aria-label={`Zone name ${zone.name}`}
            value={zone.name}
            onChange={(event) => onUpdateZone({ name: event.target.value })}
            className={`${field} w-full`}
          />
        </label>
        <input
          aria-label={`Nominal pixels ${zone.name}`}
          type="number"
          min={1}
          value={zone.nominalPixelCount}
          onChange={(event) => onUpdateZone({ nominalPixelCount: Number(event.target.value) })}
          className={field}
        />
        <button
          type="button"
          aria-label={`Remove zone ${zone.name}`}
          title={`Remove ${zone.name}`}
          onClick={onRemoveZone}
          disabled={show.zones.length <= 1}
          className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:border-red-900/70 hover:text-red-300 disabled:opacity-30 disabled:hover:border-zinc-800 disabled:hover:text-zinc-500"
        >
          <Trash2 size={13} />
        </button>
        <div className="text-[10px] uppercase tracking-wider md:col-span-3">
          <ZoneBindingStatus zone={zone} targetZones={targetZones} />
        </div>
      </div>
    </InspectorPanel>
  )
}

function ZoneBindingStatus({
  zone,
  targetZones,
}: {
  zone: ShowRecord['zones'][number]
  targetZones: ControllerZone[]
}) {
  const bound = findControllerZoneByName(targetZones, zone.name)
  if (!targetZones.length) {
    return <span className="text-zinc-500">nominal - {zone.nominalPixelCount} px</span>
  }
  if (!bound) {
    return <span className="text-amber-300">unbound - nominal {zone.nominalPixelCount} px</span>
  }
  return <span className="text-green-400">bound - {controllerZonePixelCount(bound)} px</span>
}

function CompileBar({
  compiled,
  targetPixels,
  onViewGenerated,
  pushResult,
}: {
  compiled: CompiledShowState
  targetPixels: number
  onViewGenerated: () => void
  pushResult: string | null
}) {
  if (compiled.error) {
    return (
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-t border-seam bg-zinc-950 px-3 font-mono text-xs text-amber-300">
        <Zap size={14} aria-hidden />
        {compiled.error}
      </div>
    )
  }
  const summary = compiled.artifact?.summary
  const ratio = summary?.artifactBudgetRatio ?? 0
  const estimate = estimateFps(ratio, summary?.renderPolicy)
  const worstInstant = summary?.transitionCost === 'renderer-window'
    ? 'crossfade'
    : summary?.transitionCost === 'parameter'
      ? 'adaptation ramp'
      : summary?.transitionCost === 'route'
        ? 'route transition'
        : 'none'
  return (
    <div className="flex min-h-10 shrink-0 items-center gap-2 border-t border-seam bg-zinc-950 px-3 font-mono text-xs text-zinc-500">
      <span>compiled artifact</span>
      <span className="h-2 w-28 overflow-hidden rounded-sm bg-zinc-800">
        <span className="block h-full bg-live" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </span>
      <b className="text-zinc-300">{summary ? formatBytes(summary.artifactBytes) : '-'} / ~{summary ? formatBytes(summary.measuredDeviceBudgetBytes) : '-'}</b>
      <span>-</span>
      <b className="text-zinc-300">est. {estimate} fps @ {targetPixels} px</b>
      <span>-</span>
      <span>steady state <span className="text-emerald-300"><Check size={12} className="inline" aria-hidden /> 1 renderer/px</span></span>
      <span className={summary?.transitionCost === 'renderer-window' ? 'text-amber-300' : 'text-emerald-300'}>
        worst instant: {worstInstant}
      </span>
      {summary?.warnings.map((warning) => <span key={warning} className="text-amber-300">{warning}</span>)}
      {pushResult && <span className="text-zinc-300">{pushResult}</span>}
      <span className="flex-1" />
      <button type="button" className="text-zinc-400 hover:text-zinc-200" onClick={onViewGenerated}>
        View generated pattern
      </button>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-[10px] uppercase text-zinc-600">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`${field} mt-1 w-full`}
      />
    </label>
  )
}

function adaptationSummary(cell: ShowCell): string {
  const parts = []
  if (cell.adaptations.mirror) parts.push('mirror')
  if (cell.adaptations.phase !== 0) parts.push(`phase ${cell.adaptations.phase.toFixed(2)}`)
  if (cell.adaptations.brightness !== 1) parts.push(`dim ${cell.adaptations.brightness.toFixed(2)}`)
  if (cell.adaptations.timeScale !== 1) parts.push(`time x${cell.adaptations.timeScale.toFixed(1)}`)
  return parts.length ? parts.join(' - ') : 'no adaptations'
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function estimateFps(ratio: number, policy: string | undefined): number {
  const base = policy === 'steady-active-transition-both' ? 62 : 70
  return Math.max(20, Math.round(base - ratio * 12))
}

function zonePixelTotal(show: ShowRecord): number {
  return show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)
}

export function targetZonePixelTotal(zones: ControllerZone[] | undefined): number {
  return zones?.reduce((sum, zone) => sum + controllerZonePixelCount(zone), 0) ?? 0
}
