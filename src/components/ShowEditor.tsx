import { useMemo, useState, type CSSProperties } from 'react'
import { Check, Code2, Copy, Download, Play, Plus, RotateCw, Route, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PixelblazeCodeEditor } from '@/components/PixelblazeCodeEditor'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { makeProgramId } from '@/engine/bytecodePush'
import {
  projectShowStrip,
  formatShowRoutingRanges,
  parseShowRoutingRanges,
  showLoopDurationMs,
  transitionCost,
} from '@/engine/showModel'
import { compileShowForPreview, type CompiledShowState } from '@/engine/showPreviewArtifact'
import { buildShowEpeExport, type ShowEpeExport } from '@/engine/showEpeExport'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { bytesToBase64 } from '@/engine/RelayWebSocket'
import { steppedClockRateHz, steppedClockStepMs } from '@/engine/steppedClock'
import {
  controllerZonePixelCount,
  findControllerZoneByName,
  type ControllerProfile,
  type ControllerZone,
} from '@/engine/controllerProfile'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import type {
  MapRecord,
  ShowCell,
  ShowPortalSettings,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
} from '@/engine/personalContentRecords'

const card = 'rounded-md border border-zinc-800 bg-zinc-950/35'
const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const clipBase =
  'relative z-10 flex min-h-16 flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border-0 border-l-[3px] px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live'

type ShowSelection =
  | { kind: 'cell'; cellId: string }
  | { kind: 'transition'; afterSceneId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'routing-switch'; afterSceneId: string }
  | { kind: 'show' }

export function ShowEditor({ showId }: { showId: string }) {
  const show = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const updateShow = useShowStore((state) => state.updateShow)
  const updateStageMap = useShowStore((state) => state.updateStageMap)
  const addScene = useShowStore((state) => state.addScene)
  const removeScene = useShowStore((state) => state.removeScene)
  const updateScene = useShowStore((state) => state.updateScene)
  const updateTransition = useShowStore((state) => state.updateTransition)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
  const updateCellPattern = useShowStore((state) => state.updateCellPattern)
  const extendCell = useShowStore((state) => state.extendCell)
  const spanCellZones = useShowStore((state) => state.spanCellZones)
  const addZone = useShowStore((state) => state.addZone)
  const updateZone = useShowStore((state) => state.updateZone)
  const removeZone = useShowStore((state) => state.removeZone)
  const addRoutingLayout = useShowStore((state) => state.addRoutingLayout)
  const updateRoutingLayout = useShowStore((state) => state.updateRoutingLayout)
  const removeRoutingLayout = useShowStore((state) => state.removeRoutingLayout)
  const updateRoutingSwitch = useShowStore((state) => state.updateRoutingSwitch)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const activeIp = useControllerStore((state) => state.activeIp)
  const activeController = useControllerStore((state) => (state.activeIp ? state.controllers[state.activeIp] : undefined))
  const [selection, setSelection] = useState<ShowSelection>({ kind: 'show' })
  const [generatedOpen, setGeneratedOpen] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [scenePendingDelete, setScenePendingDelete] = useState<ShowScene | null>(null)

  const activeShow = show ?? null
  const selectedCell = selection.kind === 'cell'
    ? activeShow?.cells.find((cell) => cell.id === selection.cellId) ?? null
    : null
  const targetProfile = activeShow?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === activeShow.targetControllerProfileId)
    : controllerProfiles[0]
  const stageDimension = activeShow?.stageMapId
    ? [...STOCK_MAPS, ...userMaps].find((map) => map.id === activeShow.stageMapId)?.dim
    : undefined
  const compiled = useMemo(
    () => activeShow
      ? compileShowForPreview(activeShow, userPatterns, targetProfile?.zones, {}, { stageDimension })
      : { artifact: null, error: null },
    [activeShow, stageDimension, userPatterns, targetProfile?.zones],
  )
  const showExport = useMemo(
    () => activeShow && compiled.artifact
      ? buildShowEpeExport(activeShow, compiled.artifact.code, { stampedAt: new Date(activeShow.updatedAt) })
      : null,
    [activeShow, compiled.artifact],
  )
  const buildDownloadExport = async (): Promise<ShowEpeExport | null> => {
    if (!activeShow || !compiled.artifact) return null
    const preview = await buildPreviewJpeg(compiled.artifact)
    if (!preview) throw new Error('Could not render the EPE preview image')
    return buildShowEpeExport(activeShow, compiled.artifact.code, {
      id: makeProgramId(),
      preview: bytesToBase64(preview),
      stampedAt: new Date(activeShow.updatedAt),
    })
  }

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
          <ExportShowButton exported={showExport} buildExport={buildDownloadExport} />
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
          <PixelblazeCodeEditor value={showExport?.source ?? compiled.artifact.code} readOnly />
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
      const bytecode = await provider.compile(showExport?.source ?? compiled.artifact.code)
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
            <ExportShowButton exported={showExport} buildExport={buildDownloadExport} />
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
            onAddScene={() => {
              void addScene(activeShow.id).then(() => {
                window.setTimeout(() => {
                  const inputs = document.querySelectorAll<HTMLInputElement>('[data-show-scene-name]')
                  inputs[inputs.length - 1]?.focus()
                }, 0)
              })
            }}
            onAddZone={() => void addZone(activeShow.id)}
            onRequestRemoveScene={setScenePendingDelete}
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
            onUpdateTransition={(sceneId, kind, durationMs, feather, portal) => void updateTransition(activeShow.id, sceneId, kind, durationMs, feather, portal)}
            onAddZone={() => void addZone(activeShow.id)}
            onUpdateZone={(zoneId, changes) => void updateZone(activeShow.id, zoneId, changes)}
            onRemoveZone={(zoneId) => void removeZone(activeShow.id, zoneId)}
            onAddRoutingLayout={(sourceLayoutId) => void addRoutingLayout(activeShow.id, sourceLayoutId)}
            onUpdateRoutingLayout={(layoutId, changes) => void updateRoutingLayout(activeShow.id, layoutId, changes)}
            onRemoveRoutingLayout={(layoutId) => void removeRoutingLayout(activeShow.id, layoutId)}
            onUpdateRoutingSwitch={(afterSceneId, layoutId) => void updateRoutingSwitch(activeShow.id, afterSceneId, layoutId)}
          />
          <AlertDialogRoot open={scenePendingDelete !== null} onOpenChange={(open) => { if (!open) setScenePendingDelete(null) }}>
            <AlertDialogContent>
              <AlertDialogTitle>Remove scene?</AlertDialogTitle>
              <AlertDialogDescription>
                {scenePendingDelete
                  ? `"${scenePendingDelete.name}" will be removed from this show. Cells anchored in it will be removed or clipped.`
                  : 'This scene will be removed from the show.'}
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (scenePendingDelete) void removeScene(activeShow.id, scenePendingDelete.id)
                    setScenePendingDelete(null)
                  }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogRoot>
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

function ExportShowButton({
  exported,
  buildExport,
}: {
  exported: ShowEpeExport | null
  buildExport: () => Promise<ShowEpeExport | null>
}) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-label="Export Show as .epe"
      title={error ?? 'Export Show as .epe'}
      disabled={!exported || exporting}
      className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-40"
      onClick={() => {
        setExporting(true)
        setError(null)
        void buildExport().then((ready) => {
          if (!ready) return
          const url = URL.createObjectURL(new Blob([ready.text], { type: 'application/json' }))
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = ready.filename
          anchor.style.display = 'none'
          document.body.appendChild(anchor)
          anchor.click()
          window.setTimeout(() => {
            anchor.remove()
            URL.revokeObjectURL(url)
          }, 0)
        }).catch((cause) => {
          setError(cause instanceof Error ? cause.message : 'Export failed')
        }).finally(() => setExporting(false))
      }}
    >
      {exporting ? <RotateCw size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />}
      {exporting ? 'Preparing' : error ? 'Export failed' : 'Export .epe'}
    </Button>
  )
}

function SceneStrip({
  show,
  selection,
  onSelect,
  onAddScene,
  onAddZone,
  onRequestRemoveScene,
  onUpdateScene,
}: {
  show: ShowRecord
  selection: ShowSelection
  onSelect: (selection: ShowSelection) => void
  onAddScene: () => void
  onAddZone: () => void
  onRequestRemoveScene: (scene: ShowScene) => void
  onUpdateScene: (sceneId: string, changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  const strip = projectShowStrip(show)
  const columns = ['148px', ...show.scenes.flatMap(() => ['minmax(170px,1fr)', '36px']).slice(0, -1), '64px']
  const rows = ['auto', '34px', ...strip.rows.map(() => '64px'), '34px']
  return (
    <div
      className="overflow-x-auto border-b border-seam bg-[#060608] p-4 shadow-[inset_0_6px_14px_-8px_rgba(0,0,0,0.9),inset_0_-6px_14px_-10px_rgba(0,0,0,0.9)]"
      onClick={() => onSelect({ kind: 'show' })}
    >
      <div
        className="grid min-w-[780px] gap-2"
        style={{ gridTemplateColumns: columns.join(' '), gridTemplateRows: rows.join(' ') }}
      >
        <div className="self-end border-b border-zinc-800 px-1 pb-2 text-[9.5px] uppercase tracking-[0.12em] text-structural">
          zones ↓
        </div>
        {show.scenes.map((scene) => (
          <SceneColumnHeader
            key={scene.id}
            scene={scene}
            canRemove={show.scenes.length > 1}
            onRemove={() => onRequestRemoveScene(scene)}
            onUpdate={(changes) => onUpdateScene(scene.id, changes)}
          />
        )).flatMap((node, index) => (
          index < strip.transitions.length
            ? [
                node,
                <TransitionGlyph
                  key={`t-${strip.transitions[index].afterSceneId}`}
                  show={show}
                  transition={strip.transitions[index]}
                  rowCount={strip.rows.length}
                  selected={selection.kind === 'transition' && selection.afterSceneId === strip.transitions[index].afterSceneId}
                  onSelect={() => onSelect({ kind: 'transition', afterSceneId: strip.transitions[index].afterSceneId })}
                />,
              ]
            : [node]
        ))}
        <div
          className="flex items-center gap-2 border-b border-zinc-900 px-1 text-[9.5px] uppercase tracking-[0.12em] text-structural"
          style={{ gridColumn: 1, gridRow: 2 }}
        >
          <Route size={12} aria-hidden />
          routing
        </div>
        {show.scenes.slice(0, -1).map((scene, index) => {
          const routingSwitch = strip.routingSwitches.find((candidate) => candidate.afterSceneId === scene.id)
          return (
            <button
              key={`route-${scene.id}`}
              type="button"
              aria-label={`Set routing layout after ${scene.name}`}
              title={routingSwitch ? `Switch to ${routingSwitch.layoutName}` : `Set routing layout after ${scene.name}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ kind: 'routing-switch', afterSceneId: scene.id })
              }}
              className={[
                'flex min-w-0 items-center justify-center gap-1 rounded border text-[9px] transition-colors',
                selection.kind === 'routing-switch' && selection.afterSceneId === scene.id
                  ? 'border-live/70 bg-live/10 text-live'
                  : routingSwitch
                    ? 'border-emerald-900/70 bg-emerald-950/20 text-emerald-300 hover:border-emerald-700'
                    : 'border-dashed border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300',
              ].join(' ')}
              style={{ gridColumn: 3 + index * 2, gridRow: 2 }}
            >
              {routingSwitch ? <Route size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
            </button>
          )
        })}
        {strip.rows.map((row, rowIndex) => (
          <div key={row.zoneId} className="contents">
            <button
              type="button"
              aria-label={`Select zone ${row.zoneName}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ kind: 'zone', zoneId: row.zoneId })
              }}
              className={[
                'flex items-center gap-2 rounded-[5px] border-0 pr-2 text-left font-mono transition-colors',
                selection.kind === 'zone' && selection.zoneId === row.zoneId
                  ? 'bg-live/10 text-zinc-100'
                  : 'text-zinc-300 hover:text-zinc-100',
              ].join(' ')}
              style={{ gridColumn: 1, gridRow: rowIndex + 3 }}
            >
              <span
                aria-hidden
                className="w-1 self-stretch rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              <span className="truncate text-[12px] font-medium">{row.zoneName}</span>
              <span className="ml-auto text-[10px] text-structural">{row.nominalPixelCount}px</span>
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
                  clipBase,
                  selection.kind === 'cell' && selection.cellId === cell.id
                    ? 'text-zinc-100 shadow-[0_0_0_1.5px_var(--color-live),0_8px_18px_-10px_rgba(0,0,0,0.9)]'
                    : 'text-zinc-300 hover:text-zinc-100',
                ].join(' ')}
                style={{
                  '--zone-color': row.color ?? '#38bdf8',
                  borderLeftColor: row.color ?? '#38bdf8',
                  background: `linear-gradient(color-mix(in srgb, ${row.color ?? '#38bdf8'} 9%, #101013), color-mix(in srgb, ${row.color ?? '#38bdf8'} 6%, #0c0c0e))`,
                  gridColumn: `${cell.columnStart} / span ${cell.columnSpan}`,
                  gridRow: `${rowIndex + 3} / span ${cell.rowSpan}`,
                } as CSSProperties}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = `linear-gradient(color-mix(in srgb, ${row.color ?? '#38bdf8'} 14%, #131316), color-mix(in srgb, ${row.color ?? '#38bdf8'} 10%, #0e0e10))`
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = `linear-gradient(color-mix(in srgb, ${row.color ?? '#38bdf8'} 9%, #101013), color-mix(in srgb, ${row.color ?? '#38bdf8'} 6%, #0c0c0e))`
                }}
              >
                {cell.sceneSpan > 1 && (
                  <span className="absolute right-2 top-1.5 text-[9px] uppercase tracking-wider text-structural">hold</span>
                )}
                <span className="block truncate text-[13px] font-semibold text-zinc-100">{cell.patternName}</span>
                <span className="block truncate text-[10px] text-zinc-500">
                  {adaptationSummary(cell)}
                  {(cell.zoneSpan ?? 1) > 1 ? ' - span zones' : ''}
                </span>
              </button>
            ))}
          </div>
        ))}
        <button
          type="button"
          aria-label="Add zone"
          onClick={(event) => {
            event.stopPropagation()
            onAddZone()
          }}
          className="flex items-center justify-center rounded-[5px] border border-dashed border-zinc-800 bg-transparent text-[10px] uppercase tracking-wider text-structural hover:border-zinc-600 hover:text-zinc-200"
          style={{ gridColumn: 1, gridRow: strip.rows.length + 3 }}
        >
          + zone
        </button>
        <button
          type="button"
          aria-label="Add scene"
          onClick={(event) => {
            event.stopPropagation()
            onAddScene()
          }}
          className="flex items-center justify-center rounded-[5px] border border-dashed border-zinc-800 bg-transparent text-[10px] uppercase tracking-wider text-structural [writing-mode:vertical-rl] hover:border-zinc-600 hover:text-zinc-200"
          style={{ gridColumn: columns.length, gridRow: `3 / span ${strip.rows.length}` }}
        >
          + scene
        </button>
      </div>
    </div>
  )
}

function SceneColumnHeader({
  scene,
  canRemove,
  onRemove,
  onUpdate,
}: {
  scene: ShowScene
  canRemove: boolean
  onRemove: () => void
  onUpdate: (changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  return (
    <div className="group flex items-baseline gap-2 border-b border-zinc-800 px-1 pb-2 pt-0.5">
      <input
        aria-label={`${scene.name} scene name`}
        data-show-scene-name
        value={scene.name}
        onChange={(event) => onUpdate({ name: event.target.value })}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] font-semibold text-zinc-100 outline-none group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4 focus:underline focus:decoration-live focus:underline-offset-4"
      />
      <label className="flex shrink-0 items-baseline gap-1 text-[10.5px] text-structural">
        <input
          aria-label={`${scene.name} duration seconds`}
          type="number"
          min={1}
          value={Math.round(scene.durationMs / 1000)}
          onChange={(event) => onUpdate({ durationMs: Number(event.target.value) * 1000 })}
          className="h-6 w-14 rounded border border-transparent bg-transparent px-1 text-right text-[10.5px] text-structural outline-none hover:border-zinc-700 hover:bg-zinc-900 focus:border-live/70 focus:bg-zinc-900"
        />
        s
      </label>
      <span aria-hidden className="text-[10px] text-structural opacity-0 transition-opacity group-hover:opacity-100">
        ✎
      </span>
      {canRemove && (
        <button
          type="button"
          aria-label={`Remove scene ${scene.name}`}
          title={`Remove ${scene.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-600 opacity-0 transition-opacity hover:bg-red-950/30 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  )
}

function TransitionGlyph({
  show,
  transition,
  rowCount,
  selected,
  onSelect,
}: {
  show: ShowRecord
  transition: ReturnType<typeof projectShowStrip>['transitions'][number]
  rowCount: number
  selected: boolean
  onSelect: () => void
}) {
  const glyph = transition.kind === 'crossfade'
    ? 'xf'
    : transition.kind === 'wipe'
      ? 'wp'
      : transition.kind === 'dither'
        ? 'dt'
        : transition.kind === 'portal'
          ? 'pt'
          : 'cut'
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
        'relative z-0 flex flex-col items-center justify-center gap-1 rounded bg-transparent text-[10px] uppercase text-zinc-500 transition-colors before:absolute before:bottom-[-8px] before:left-1/2 before:top-[-8px] before:border-l before:border-dashed before:border-zinc-700 before:content-[\'\'] hover:text-zinc-300 hover:before:border-zinc-500',
        selected ? 'text-live before:border-live before:border-solid' : '',
      ].join(' ')}
      style={{
        gridColumn: 3 + afterIndex * 2,
        gridRow: `3 / span ${rowCount}`,
      }}
    >
      <span className={`relative z-10 bg-[#060608] px-1 ${transition.cost === 'expensive' ? 'text-amber-300' : 'text-emerald-300'}`}>{glyph}</span>
      <span className="relative z-10 bg-[#060608] px-1 text-[9.5px] text-structural">{Math.round(transition.durationMs / 1000)}s</span>
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
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
  onUpdateRoutingSwitch,
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
  onUpdateTransition: (
    sceneId: string,
    kind: NonNullable<ShowScene['transitionOut']>['kind'],
    durationMs: number,
    feather?: number,
    portal?: Partial<ShowPortalSettings>,
  ) => void
  onAddZone: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
  onUpdateRoutingSwitch: (afterSceneId: string, layoutId: string | null) => void
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

  if (selection.kind === 'routing-switch') {
    return (
      <RoutingSwitchInspector
        show={show}
        afterSceneId={selection.afterSceneId}
        onUpdate={(layoutId) => onUpdateRoutingSwitch(selection.afterSceneId, layoutId)}
      />
    )
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
      onAddRoutingLayout={onAddRoutingLayout}
      onUpdateRoutingLayout={onUpdateRoutingLayout}
      onRemoveRoutingLayout={onRemoveRoutingLayout}
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
  const lightShutter = cell.adaptations.lightShutter
  const updateLightShutter = (changes: Partial<NonNullable<ShowCell['adaptations']['lightShutter']>>) => {
    if (!lightShutter) return
    onUpdateAdaptations({ lightShutter: { ...lightShutter, ...changes } })
  }
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
        <NumberField label="Time x" value={cell.adaptations.timeScale} min={0} max={4} step={0.1} onChange={(timeScale) => onUpdateAdaptations({ timeScale })} />
      </div>
      <MotionCadenceControl
        stepMs={cell.adaptations.steppedClock?.stepMs}
        timeOffsetMs={cell.adaptations.timeOffsetMs ?? 0}
        onChange={(stepMs) => onUpdateAdaptations({
          steppedClock: stepMs === null ? undefined : { stepMs },
        })}
        onOffsetChange={(timeOffsetMs) => onUpdateAdaptations({ timeOffsetMs })}
      />
      <div className="mt-3 border-t border-zinc-800 pt-3">
        <label className="flex items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(lightShutter)}
            onChange={(event) => onUpdateAdaptations({
              lightShutter: event.target.checked
                ? { rateHz: 8, duty: 0.5, phase: 0, clockBehavior: 'continue' }
                : undefined,
            })}
          />
          Light shutter
        </label>
        {lightShutter && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <NumberField label="Shutter rate (Hz)" value={lightShutter.rateHz} min={0.01} max={60} step={0.1} onChange={(rateHz) => updateLightShutter({ rateHz })} />
              <NumberField label="Light on fraction" value={lightShutter.duty} min={0} max={1} step={0.01} onChange={(duty) => updateLightShutter({ duty })} />
              <NumberField label="Shutter phase" value={lightShutter.phase} min={0} max={1} step={0.01} onChange={(phase) => updateLightShutter({ phase })} />
              <label className="text-[10px] uppercase text-zinc-600">
                Clock while dark
                <select
                  aria-label="Clock while dark"
                  value={lightShutter.clockBehavior}
                  onChange={(event) => updateLightShutter({ clockBehavior: event.target.value === 'freeze' ? 'freeze' : 'continue' })}
                  className={`${field} mt-1 w-full`}
                >
                  <option value="continue">continue</option>
                  <option value="freeze">freeze</option>
                </select>
              </label>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              Closed frames emit black and skip Pattern rendering. Continue advances motion behind darkness; freeze pauses Pattern time while dark.
            </p>
          </>
        )}
      </div>
    </InspectorPanel>
  )
}

function MotionCadenceControl({
  stepMs,
  timeOffsetMs,
  onChange,
  onOffsetChange,
}: {
  stepMs: number | undefined
  timeOffsetMs: number
  onChange: (stepMs: number | null) => void
  onOffsetChange: (timeOffsetMs: number) => void
}) {
  const stepped = stepMs !== undefined
  const rateHz = steppedClockRateHz(stepMs ?? 125)
  const rateLabel = formatCadenceRate(rateHz)
  return (
    <section className="mt-3 rounded-md border border-violet-400/25 bg-violet-400/[0.04] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-violet-300">Motion cadence</div>
          <div className="mt-0.5 text-[10px] text-zinc-500">How often Pattern time is released</div>
        </div>
        <div className="flex rounded border border-zinc-700 bg-zinc-950 p-0.5 text-[10px]">
          <button
            type="button"
            aria-label="Smooth motion"
            aria-pressed={!stepped}
            className={stepped ? 'rounded px-2 py-1 text-zinc-500 hover:text-zinc-300' : 'rounded bg-zinc-700 px-2 py-1 text-zinc-100'}
            onClick={() => onChange(null)}
          >
            smooth
          </button>
          <button
            type="button"
            aria-label="Stepped motion"
            aria-pressed={stepped}
            className={stepped ? 'rounded bg-violet-400/20 px-2 py-1 text-violet-200' : 'rounded px-2 py-1 text-zinc-500 hover:text-zinc-300'}
            onClick={() => onChange(stepMs ?? 125)}
          >
            stepped
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_10rem] items-end gap-3 border-t border-violet-400/10 pt-3">
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Shift this cell&apos;s private Pattern clock for rounds across zones.
        </p>
        <NumberField
          label="Start offset (ms)"
          value={timeOffsetMs}
          min={0}
          max={60000}
          step={50}
          onChange={onOffsetChange}
        />
      </div>
      {stepped && (
        <>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <label className="text-[10px] uppercase text-zinc-600">
              Jumps per second
              <input
                aria-label="Jumps per second"
                className="mt-2 w-full accent-violet-400"
                type="range"
                min={0.25}
                max={30}
                step={0.25}
                value={rateHz}
                onChange={(event) => onChange(steppedClockStepMs(Number(event.target.value)))}
              />
            </label>
            <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-right">
              <b className="block text-sm text-zinc-100">{rateLabel} / sec</b>
              <span className="text-[9px] text-zinc-500">every {Math.round(stepMs)} ms</span>
            </div>
          </div>
          <div className="mt-2 flex gap-1" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className={index % 3 === 0 ? 'h-2 flex-1 bg-violet-300/70' : 'h-2 flex-1 bg-zinc-800'} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Motion freezes and jumps; unlike Light shutter, pixels do not blink off and the renderer keeps running.
          </p>
        </>
      )}
    </section>
  )
}

function TransitionInspector({
  show,
  afterSceneId,
  onUpdateTransition,
}: {
  show: ShowRecord
  afterSceneId: string
  onUpdateTransition: (
    sceneId: string,
    kind: NonNullable<ShowScene['transitionOut']>['kind'],
    durationMs: number,
    feather?: number,
    portal?: Partial<ShowPortalSettings>,
  ) => void
}) {
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === afterSceneId)
  const scene = show.scenes[sceneIndex] ?? show.scenes[0]
  const nextScene = show.scenes[sceneIndex + 1]
  const transition = scene.transitionOut ?? { kind: 'cut' as const, durationMs: 0 }
  const cost = transitionCost(transition.kind)
  const portalSettings: ShowPortalSettings = {
    centerX: transition.centerX ?? 0.5,
    centerY: transition.centerY ?? 0.5,
    invert: transition.invert ?? false,
    featherPolicy: transition.featherPolicy === 'blend' ? 'blend' : 'dither',
  }
  const updatePortal = (changes: Partial<ShowPortalSettings>, feather = transition.feather ?? 0.12) => {
    onUpdateTransition(
      scene.id,
      'portal',
      transition.durationMs || 2000,
      feather,
      changes,
    )
  }
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
            onChange={(event) => {
              const kind = event.target.value as NonNullable<ShowScene['transitionOut']>['kind']
              onUpdateTransition(
                scene.id,
                kind,
                transition.durationMs || 2000,
                kind === 'portal' ? transition.feather ?? 0.12 : transition.feather,
                kind === 'portal' ? portalSettings : undefined,
              )
            }}
            className={`${field} mt-1 w-full`}
          >
            <option value="cut">cut</option>
            <option value="crossfade">crossfade</option>
            <option value="wipe">wipe</option>
            <option value="dither">dither</option>
            <option value="portal">portal (2D)</option>
          </select>
        </label>
        <NumberField
          label="Duration seconds"
          value={Math.round(transition.durationMs / 1000)}
          min={0}
          max={30}
          step={1}
          onChange={(seconds) => onUpdateTransition(
            scene.id,
            transition.kind,
            seconds * 1000,
            transition.feather,
            transition.kind === 'portal' ? portalSettings : undefined,
          )}
        />
        {transition.kind === 'wipe' && (
          <>
            <NumberField
              label="Feather width"
              value={transition.feather ?? 0}
              min={0}
              max={1}
              step={0.05}
              onChange={(feather) => onUpdateTransition(scene.id, transition.kind, transition.durationMs, feather)}
            />
            <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] leading-4 text-zinc-500">
              Feather uses a stable spatial threshold across the 1D route edge and still calls one Pattern renderer per pixel.
            </div>
          </>
        )}
        {transition.kind === 'portal' && (
          <>
            <NumberField
              label="Center X"
              value={portalSettings.centerX}
              min={0}
              max={1}
              step={0.05}
              onChange={(centerX) => updatePortal({ centerX })}
            />
            <NumberField
              label="Center Y"
              value={portalSettings.centerY}
              min={0}
              max={1}
              step={0.05}
              onChange={(centerY) => updatePortal({ centerY })}
            />
            <NumberField
              label="Feather width"
              value={transition.feather ?? 0.12}
              min={0}
              max={1}
              step={0.02}
              onChange={(feather) => updatePortal({}, feather)}
            />
            <label className="text-[10px] uppercase text-zinc-600">
              Feather behavior
              <select
                aria-label="Feather behavior"
                value={portalSettings.featherPolicy}
                onChange={(event) => updatePortal({ featherPolicy: event.target.value === 'blend' ? 'blend' : 'dither' })}
                className={`${field} mt-1 w-full`}
              >
                <option value="dither">stable dither</option>
                <option value="blend">true blend</option>
              </select>
            </label>
            <label className="flex min-h-8 items-center gap-2 self-end text-[10px] uppercase text-zinc-500">
              <input
                type="checkbox"
                aria-label="Outside in"
                checked={portalSettings.invert}
                onChange={(event) => updatePortal({ invert: event.target.checked })}
                className="h-3.5 w-3.5 accent-sky-400"
              />
              Outside in
            </label>
            <div className="border-l-2 border-sky-500/50 pl-2 text-[10px] leading-4 text-zinc-500">
              {portalSettings.featherPolicy === 'blend'
                ? 'Two Pattern renderers run only inside the circular feather band.'
                : 'A stable threshold keeps the portal to one Pattern renderer per pixel.'}
            </div>
          </>
        )}
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

function RoutingSwitchInspector({
  show,
  afterSceneId,
  onUpdate,
}: {
  show: ShowRecord
  afterSceneId: string
  onUpdate: (layoutId: string | null) => void
}) {
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === afterSceneId)
  const from = show.scenes[sceneIndex]?.name ?? 'Scene'
  const to = show.scenes[sceneIndex + 1]?.name ?? 'next scene'
  const routingSwitch = show.routingSwitches.find((candidate) => candidate.afterSceneId === afterSceneId)
  return (
    <InspectorPanel title={`${from} -> ${to} - routing layout`}>
      <div className="grid max-w-xl gap-2">
        <label className="text-[10px] uppercase text-zinc-600">
          Destination routing layout
          <select
            aria-label="Destination routing layout"
            value={routingSwitch?.layoutId ?? ''}
            onChange={(event) => onUpdate(event.target.value || null)}
            className={`${field} mt-1 w-full`}
          >
            <option value="">no switch</option>
            {show.routingLayouts.map((layout) => (
              <option key={layout.id} value={layout.id}>{layout.name}</option>
            ))}
          </select>
        </label>
        <p className="text-[10px] leading-4 text-zinc-500">
          The destination layout takes effect at this scene boundary. Running Pattern clocks and state continue uninterrupted.
        </p>
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
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
}: {
  show: ShowRecord
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdateStageMap: (stageMapId: string | null) => void
  onAddZone: () => void
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
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
            <optgroup label="Stock maps">
              {STOCK_MAPS.map((map) => (
                <option key={map.id} value={map.id}>{map.name} ({map.dim}D)</option>
              ))}
            </optgroup>
            {userMaps.length > 0 && (
              <optgroup label="Your maps">
                {userMaps.map((map) => (
                  <option key={map.id} value={map.id}>{map.name} ({map.dim}D)</option>
                ))}
              </optgroup>
            )}
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
      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <Route size={13} aria-hidden className="text-zinc-500" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Routing layouts</h4>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Add routing layout"
            title="Add routing layout"
            onClick={() => onAddRoutingLayout()}
            className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>
        <div className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
          {show.routingLayouts.map((layout) => (
            <div key={layout.id} className="py-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label={`${layout.name} routing layout name`}
                  value={layout.name}
                  onChange={(event) => onUpdateRoutingLayout(layout.id, { name: event.target.value })}
                  className={`${field} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  aria-label={`Duplicate routing layout ${layout.name}`}
                  title={`Duplicate ${layout.name}`}
                  onClick={() => onAddRoutingLayout(layout.id)}
                  className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <Copy size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove routing layout ${layout.name}`}
                  title={`Remove ${layout.name}`}
                  onClick={() => onRemoveRoutingLayout(layout.id)}
                  disabled={show.routingLayouts.length <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-red-950/30 hover:text-red-300 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {show.zones.map((zone) => {
                  const layoutZone = layout.zones.find((candidate) => candidate.zoneId === zone.id)
                  return (
                    <label key={zone.id} className="text-[9.5px] uppercase text-zinc-600">
                      {zone.name} ranges
                      <input
                        key={formatShowRoutingRanges(layoutZone?.ranges ?? [])}
                        aria-label={`${layout.name} ${zone.name} pixel ranges`}
                        defaultValue={formatShowRoutingRanges(layoutZone?.ranges ?? [])}
                        placeholder="0-63, 128-191"
                        onBlur={(event) => {
                          const ranges = parseShowRoutingRanges(event.currentTarget.value)
                          if (ranges === null) {
                            event.currentTarget.value = formatShowRoutingRanges(layoutZone?.ranges ?? [])
                            return
                          }
                          onUpdateRoutingLayout(layout.id, {
                            zones: layout.zones.map((candidate) => candidate.zoneId === zone.id
                              ? { ...candidate, ranges }
                              : candidate),
                          })
                        }}
                        className={`${field} mt-1 w-full font-mono`}
                      />
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
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
    : summary?.transitionCost === 'bounded-renderer-window'
      ? 'portal blend (feather band only)'
    : summary?.transitionCost === 'parameter'
      ? 'adaptation ramp'
      : summary?.transitionCost === 'route'
        ? summary.routePolicy === 'feathered-wipe'
          ? 'feathered wipe'
          : summary.routePolicy === 'portal-dithered-feather'
            ? 'portal dither'
            : summary.routePolicy === 'portal-hard'
              ? 'portal'
              : 'route transition'
        : 'none'
  const clockPolicy = summary?.clockPolicy === 'exact-pause-ramp'
    ? 'exact pause ramp'
    : summary?.clockPolicy === 'exact-pause'
      ? 'exact pause'
      : summary?.clockPolicy === 'scaled-ramp'
        ? 'scaled ramp'
        : summary?.clockPolicy === 'scaled'
          ? 'scaled'
          : 'real time'
  const maskedClipFractions = summary?.clips
    .filter((clip) => clip.evaluationPolicy !== 'full')
    .map((clip) => `${Math.round(clip.expectedActiveFraction * 100)}%`) ?? []
  const evaluationLabel = summary?.evaluationPolicy === 'masked-shutter'
    ? `${Math.round((summary.expectedActiveFraction ?? 0) * 100)}% expected`
    : summary?.evaluationPolicy === 'mixed'
      ? `${maskedClipFractions.join(', ')} expected for masked clip`
      : null
  const steppedRates = summary?.clips
    .filter((clip) => clip.temporalPolicy === 'stepped-clock' && clip.stepMs !== null)
    .map((clip) => formatCadenceRate(steppedClockRateHz(clip.stepMs!))) ?? []
  const temporalLabel = summary?.temporalPolicy === 'stepped-clock'
    ? `${[...new Set(steppedRates)].join(', ')}/s stepped`
    : summary?.temporalPolicy === 'mixed'
      ? `${[...new Set(steppedRates)].join(', ')}/s stepped clip`
      : null
  const timeOffsets = summary?.clips
    .filter((clip) => clip.timeOffsetMs > 0)
    .map((clip) => `${Math.round(clip.timeOffsetMs)}ms`) ?? []
  const timeOffsetLabel = summary?.timeOffsetPolicy === 'per-clip'
    ? [...new Set(timeOffsets)].join(', ')
    : null
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
      <span className={summary?.transitionCost === 'renderer-window' || summary?.transitionCost === 'bounded-renderer-window' ? 'text-amber-300' : 'text-emerald-300'}>
        worst instant: {worstInstant}
      </span>
      {summary && summary.clockPolicy !== 'real-time' && (
        <span className={summary.clockPolicy.includes('exact-pause') ? 'text-amber-300' : 'text-zinc-500'}>
          clock: {clockPolicy}
        </span>
      )}
      {evaluationLabel && (
        <span className="text-sky-300">
          Pattern eval: {evaluationLabel} - outer loop + LEDs unchanged
        </span>
      )}
      {temporalLabel && (
        <span className="text-violet-300">
          Motion cadence: {temporalLabel} - renderer cost unchanged
        </span>
      )}
      {timeOffsetLabel && (
        <span className="text-violet-300">
          Clock offset: {timeOffsetLabel} - renderer cost unchanged
        </span>
      )}
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
  if (cell.adaptations.lightShutter) parts.push(`shutter ${Math.round(cell.adaptations.lightShutter.duty * 100)}%`)
  if (cell.adaptations.steppedClock) parts.push(`step ${formatCadenceRate(steppedClockRateHz(cell.adaptations.steppedClock.stepMs))}/s`)
  if ((cell.adaptations.timeOffsetMs ?? 0) > 0) parts.push(`offset ${Math.round(cell.adaptations.timeOffsetMs!)}ms`)
  return parts.length ? parts.join(' - ') : 'no adaptations'
}

function formatCadenceRate(rateHz: number): string {
  return Number.isInteger(rateHz) ? rateHz.toFixed(0) : rateHz.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
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
