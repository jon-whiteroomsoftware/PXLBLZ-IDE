import { useMemo, useState } from 'react'
import { Check, Code2, PanelsTopLeft, Play, RotateCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PixelblazeCodeEditor } from '@/components/PixelblazeCodeEditor'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { makeProgramId } from '@/engine/bytecodePush'
import { compileShow, type GeneratedShowArtifact } from '@/engine/showCompiler'
import {
  projectShowStrip,
  showLoopDurationMs,
  showRecordToCompileRecipe,
  transitionCost,
} from '@/engine/showModel'
import { controllerZonePixelCount } from '@/engine/controllerProfile'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import type { ShowCell, ShowRecord, ShowScene } from '@/engine/personalContentRecords'

const card = 'rounded-md border border-zinc-800 bg-zinc-950/35'
const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'

interface CompiledShowState {
  artifact: GeneratedShowArtifact | null
  error: string | null
}

export function ShowEditor({ showId }: { showId: string }) {
  const show = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const updateScene = useShowStore((state) => state.updateScene)
  const updateTransition = useShowStore((state) => state.updateTransition)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
  const updateCellPattern = useShowStore((state) => state.updateCellPattern)
  const extendCell = useShowStore((state) => state.extendCell)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const activeIp = useControllerStore((state) => state.activeIp)
  const activeController = useControllerStore((state) => (state.activeIp ? state.controllers[state.activeIp] : undefined))
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [generatedOpen, setGeneratedOpen] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)

  const activeShow = show ?? null
  const selectedCell = activeShow?.cells.find((cell) => cell.id === (selectedCellId ?? activeShow.cells[0]?.id)) ?? null
  const targetProfile = activeShow?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === activeShow.targetControllerProfileId)
    : controllerProfiles[0]
  const compiled = useMemo(
    () => activeShow ? compileShowForEditor(activeShow, userPatterns, targetProfile?.zones) : { artifact: null, error: null },
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
            <PanelsTopLeft size={15} aria-hidden className="text-zinc-500" />
            <span className="text-sm font-semibold text-zinc-200">{activeShow.name}</span>
            <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase text-structural">
              show - {activeShow.scenes.length} scenes - {formatDuration(showLoopDurationMs(activeShow))} loop
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
            selectedCell={selectedCell}
            onSelectCell={setSelectedCellId}
            onUpdateScene={(sceneId, changes) => void updateScene(activeShow.id, sceneId, changes)}
          />

          <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr_1fr]">
            {selectedCell ? (
              <CellInspector
                show={activeShow}
                cell={selectedCell}
                patternOptions={patternOptions}
                onUpdatePattern={(patch) => void updateCellPattern(activeShow.id, selectedCell.id, patch)}
                onUpdateAdaptations={(changes) => void updateCellAdaptations(activeShow.id, selectedCell.id, changes)}
                onExtend={(sceneSpan) => void extendCell(activeShow.id, selectedCell.id, sceneSpan)}
              />
            ) : (
              <InspectorPanel title="Cell">Select a cell in the strip.</InspectorPanel>
            )}
            <TransitionInspector
              show={activeShow}
              onUpdateTransition={(sceneId, kind, durationMs) => void updateTransition(activeShow.id, sceneId, kind, durationMs)}
            />
            <ZoneBindingPanel show={activeShow} targetName={targetProfile?.name} />
          </div>
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
  selectedCell,
  onSelectCell,
  onUpdateScene,
}: {
  show: ShowRecord
  selectedCell: ShowCell | null
  onSelectCell: (cellId: string) => void
  onUpdateScene: (sceneId: string, changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  const strip = projectShowStrip(show)
  const columns = ['150px', ...show.scenes.flatMap(() => ['minmax(150px,1fr)', '64px']).slice(0, -1)]
  return (
    <div className={`${card} overflow-x-auto p-2`}>
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
            ? [node, <TransitionGlyph key={`t-${strip.transitions[index].afterSceneId}`} transition={strip.transitions[index]} />]
            : [node]
        ))}
        {strip.rows.map((row) => (
          <div key={row.zoneId} className="contents">
            <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/45 px-2 text-zinc-300">
              <span
                aria-hidden
                className="size-2 rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              <span className="truncate">{row.zoneName}</span>
              <span className="ml-auto text-[10px] text-zinc-600">{row.nominalPixelCount}px</span>
            </div>
            {row.cells.map((cell) => (
              <button
                key={cell.id}
                type="button"
                aria-label={`Select ${cell.patternName}`}
                onClick={() => onSelectCell(cell.id)}
                className={[
                  'min-h-14 rounded-md border px-2 py-2 text-left transition-colors',
                  selectedCell?.id === cell.id
                    ? 'border-live/70 bg-live/10 text-zinc-100'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900',
                ].join(' ')}
                style={{ gridColumn: `${cell.columnStart} / span ${cell.columnSpan}` }}
              >
                <span className="block truncate text-[12px] font-semibold">{cell.patternName}</span>
                <span className="mt-1 block truncate text-[10px] text-zinc-500">
                  {adaptationSummary(cell)}
                  {cell.sceneSpan > 1 ? ' - hold' : ''}
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

function TransitionGlyph({ transition }: { transition: ReturnType<typeof projectShowStrip>['transitions'][number] }) {
  const glyph = transition.kind === 'crossfade' ? 'xf' : transition.kind === 'wipe' ? 'wp' : transition.kind === 'dither' ? 'dt' : 'cut'
  return (
    <div className="flex min-h-14 flex-col items-center justify-center rounded border border-dashed border-zinc-800 bg-zinc-950/35 text-[10px] uppercase text-zinc-500">
      <span className={transition.cost === 'expensive' ? 'text-amber-300' : 'text-emerald-300'}>{glyph}</span>
      <span>{Math.round(transition.durationMs / 1000)}s</span>
    </div>
  )
}

function InspectorPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} min-h-36 p-3`}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase text-zinc-500">{title}</h3>
      {children}
    </section>
  )
}

function CellInspector({
  show,
  cell,
  patternOptions,
  onUpdatePattern,
  onUpdateAdaptations,
  onExtend,
}: {
  show: ShowRecord
  cell: ShowCell
  patternOptions: Array<{ label: string; ref: ShowCell['pattern'] }>
  onUpdatePattern: (patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onUpdateAdaptations: (changes: Partial<ShowCell['adaptations']>) => void
  onExtend: (sceneSpan: number) => void
}) {
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
  const maxSpan = Math.max(1, show.scenes.length - sceneIndex)
  return (
    <InspectorPanel title={`Cell - ${cell.patternName}`}>
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
        <NumberField label="Phase" value={cell.adaptations.phase} min={0} max={1} step={0.01} onChange={(phase) => onUpdateAdaptations({ phase })} />
        <NumberField label="Brightness" value={cell.adaptations.brightness} min={0} max={1} step={0.01} onChange={(brightness) => onUpdateAdaptations({ brightness })} />
        <NumberField label="Time x" value={cell.adaptations.timeScale} min={0.1} max={4} step={0.1} onChange={(timeScale) => onUpdateAdaptations({ timeScale })} />
      </div>
    </InspectorPanel>
  )
}

function TransitionInspector({
  show,
  onUpdateTransition,
}: {
  show: ShowRecord
  onUpdateTransition: (sceneId: string, kind: NonNullable<ShowScene['transitionOut']>['kind'], durationMs: number) => void
}) {
  const scene = show.scenes[0]
  const transition = scene.transitionOut ?? { kind: 'cut' as const, durationMs: 0 }
  return (
    <InspectorPanel title="Transition">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase text-zinc-600">
          Boundary
          <div className="mt-1 text-zinc-300">{show.scenes[0]?.name} to {show.scenes[1]?.name}</div>
        </label>
        <label className="text-[10px] uppercase text-zinc-600">
          Kind
          <select
            aria-label="Transition kind"
            value={transition.kind}
            onChange={(event) => onUpdateTransition(scene.id, event.target.value as 'cut' | 'crossfade', transition.durationMs || 2000)}
            className={`${field} mt-1 w-full`}
          >
            <option value="cut">cut</option>
            <option value="crossfade">crossfade</option>
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
          Cost tier: <span className="text-zinc-300">{transitionCost(transition.kind)}</span>
        </div>
      </div>
    </InspectorPanel>
  )
}

function ZoneBindingPanel({ show, targetName }: { show: ShowRecord; targetName?: string }) {
  return (
    <InspectorPanel title={`Show zones${targetName ? ` -> ${targetName}` : ''}`}>
      <div className="space-y-1">
        {show.zones.map((zone) => (
          <div key={zone.id} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1">
            <span className="text-zinc-300">{zone.name}</span>
            <span className="text-[10px] text-emerald-300">nominal - {zone.nominalPixelCount}px</span>
          </div>
        ))}
      </div>
    </InspectorPanel>
  )
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
      <span className="text-amber-300">worst instant: crossfade</span>
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

function compileShowForEditor(
  show: ShowRecord,
  userPatterns: ReturnType<typeof usePatternStore.getState>['userPatterns'],
  controllerZones: Parameters<typeof showRecordToCompileRecipe>[1]['controllerZones'],
): CompiledShowState {
  try {
    const byCellId = Object.fromEntries(
      show.cells.map((cell) => [cell.id, sourceForCell(cell, userPatterns)]),
    )
    const recipe = showRecordToCompileRecipe(show, { byCellId, controllerZones })
    return { artifact: compileShow(recipe, {}), error: null }
  } catch (error) {
    return { artifact: null, error: error instanceof Error ? error.message : 'Show compile failed' }
  }
}

function sourceForCell(
  cell: ShowCell,
  userPatterns: ReturnType<typeof usePatternStore.getState>['userPatterns'],
): string {
  if (cell.pattern.kind === 'stock') return DEMOS[cell.pattern.id] ?? DEMOS.TestPattern1D
  return userPatterns.find((pattern) => pattern.id === cell.pattern.id)?.src ?? DEMOS.TestPattern1D
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
  const base = policy === 'route-one-renderer-per-pixel' ? 70 : 62
  return Math.max(20, Math.round(base - ratio * 12))
}

function zonePixelTotal(show: ShowRecord): number {
  return show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)
}

export function targetZonePixelTotal(zones: Parameters<typeof showRecordToCompileRecipe>[1]['controllerZones']): number {
  return zones?.reduce((sum, zone) => sum + controllerZonePixelCount(zone), 0) ?? 0
}
