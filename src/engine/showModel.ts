import type {
  ShowCell,
  ShowCellAdaptations,
  ShowRecord,
  ShowScene,
  ShowTransitionCost,
  ShowZone,
} from './personalContentRecords'
import type { ShowClipAdaptation, ShowRecipe } from './showCompiler'
import type { ControllerZone } from './controllerProfile'

export interface ShowStripTransitionProjection {
  afterSceneId: string
  kind: NonNullable<ShowScene['transitionOut']>['kind']
  durationMs: number
  cost: ShowTransitionCost
}

export interface ShowStripCellProjection extends ShowCell {
  sceneIndex: number
  columnStart: number
  columnSpan: number
}

export interface ShowStripRowProjection {
  zoneId: string
  zoneName: string
  nominalPixelCount: number
  color?: string
  cells: ShowStripCellProjection[]
}

export interface ShowStripProjection {
  sceneColumns: ShowScene[]
  transitions: ShowStripTransitionProjection[]
  rows: ShowStripRowProjection[]
}

export interface ShowCompileRecipeSourceLookup {
  byCellId: Record<string, string>
  controllerZones?: ControllerZone[]
}

const DEFAULT_ADAPTATIONS: ShowCellAdaptations = {
  mirror: false,
  phase: 0,
  brightness: 1,
  timeScale: 1,
}

export function createDefaultShow(id: string, name: string, updatedAt = Date.now()): ShowRecord {
  const scenes: ShowScene[] = [
    {
      id: 'scene-1',
      name: 'Scene 1',
      durationMs: 30000,
      transitionOut: { kind: 'crossfade', durationMs: 2000 },
    },
    { id: 'scene-2', name: 'Scene 2', durationMs: 30000 },
  ]
  const zones: ShowZone[] = [{ id: 'zone-1', name: 'main', nominalPixelCount: 60, color: '#38bdf8' }]
  return {
    id,
    name,
    scenes,
    zones,
    cells: scenes.map((scene, index) => ({
      id: `cell-${index + 1}`,
      zoneId: zones[0].id,
      sceneId: scene.id,
      sceneSpan: 1,
      pattern: { kind: 'stock', id: index === 0 ? 'TestPattern1D' : 'CometLoom' },
      patternName: index === 0 ? 'TestPattern1D' : 'CometLoom',
      adaptations: { ...DEFAULT_ADAPTATIONS },
    })),
    updatedAt,
  }
}

export function showLoopDurationMs(show: Pick<ShowRecord, 'scenes'>): number {
  return show.scenes.reduce((sum, scene) => sum + Math.max(0, scene.durationMs), 0)
}

export function projectShowStrip(show: ShowRecord): ShowStripProjection {
  const sceneIndex = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  return {
    sceneColumns: show.scenes,
    transitions: show.scenes
      .slice(0, -1)
      .map((scene) => ({
        afterSceneId: scene.id,
        kind: scene.transitionOut?.kind ?? 'cut',
        durationMs: scene.transitionOut?.durationMs ?? 0,
        cost: transitionCost(scene.transitionOut?.kind ?? 'cut'),
      })),
    rows: show.zones.map((zone) => ({
      zoneId: zone.id,
      zoneName: zone.name,
      nominalPixelCount: zone.nominalPixelCount,
      color: zone.color,
      cells: show.cells
        .filter((cell) => cell.zoneId === zone.id)
        .map((cell) => {
          const index = sceneIndex.get(cell.sceneId) ?? 0
          return {
            ...cell,
            sceneIndex: index,
            columnStart: sceneToGridColumn(index),
            columnSpan: Math.max(1, cell.sceneSpan * 2 - 1),
          }
        })
        .sort((a, b) => a.sceneIndex - b.sceneIndex),
    })),
  }
}

export function updateShowScene(
  show: ShowRecord,
  sceneId: string,
  changes: Partial<Omit<ShowScene, 'id'>>,
): ShowRecord {
  return {
    ...show,
    scenes: show.scenes.map((scene) => (
      scene.id === sceneId
        ? { ...scene, ...changes, durationMs: clampDuration(changes.durationMs ?? scene.durationMs) }
        : scene
    )),
    updatedAt: Date.now(),
  }
}

export function updateShowCellAdaptations(
  show: ShowRecord,
  cellId: string,
  changes: Partial<ShowCellAdaptations>,
): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => (
      cell.id === cellId
        ? { ...cell, adaptations: normalizeAdaptations({ ...cell.adaptations, ...changes }) }
        : cell
    )),
    updatedAt: Date.now(),
  }
}

export function extendShowCell(show: ShowRecord, cellId: string, sceneSpan: number): ShowRecord {
  const target = show.cells.find((cell) => cell.id === cellId)
  if (!target) return show
  const targetSceneIndex = show.scenes.findIndex((scene) => scene.id === target.sceneId)
  const nextSpan = Math.max(1, Math.min(sceneSpan, show.scenes.length - targetSceneIndex))
  const occupiedSceneIds = new Set(
    show.scenes.slice(targetSceneIndex, targetSceneIndex + nextSpan).map((scene) => scene.id),
  )
  return {
    ...show,
    cells: show.cells
      .filter((cell) => cell.id === cellId || cell.zoneId !== target.zoneId || !occupiedSceneIds.has(cell.sceneId))
      .map((cell) => cell.id === cellId ? { ...cell, sceneSpan: nextSpan } : cell),
    updatedAt: Date.now(),
  }
}

export function updateShowCellPattern(
  show: ShowRecord,
  cellId: string,
  patch: Pick<ShowCell, 'pattern' | 'patternName'>,
): ShowRecord {
  return {
    ...show,
    cells: show.cells.map((cell) => cell.id === cellId ? { ...cell, ...patch } : cell),
    updatedAt: Date.now(),
  }
}

export function updateShowTransition(
  show: ShowRecord,
  sceneId: string,
  kind: NonNullable<ShowScene['transitionOut']>['kind'],
  durationMs: number,
): ShowRecord {
  return updateShowScene(show, sceneId, {
    transitionOut: kind === 'cut' ? undefined : { kind, durationMs: clampDuration(durationMs) },
  })
}

export function showRecordToCompileRecipe(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): ShowRecipe {
  const firstZone = show.zones[0]
  if (!firstZone) throw new Error('Show compile requires at least one zone.')
  const cells = show.cells
    .filter((cell) => cell.zoneId === firstZone.id)
    .sort((a, b) => sceneIndex(show, a.sceneId) - sceneIndex(show, b.sceneId))
    .slice(0, 2)
  if (cells.length === 0) throw new Error('Show compile requires at least one cell on the first zone.')
  const source0 = lookup.byCellId[cells[0].id]
  if (!source0) throw new Error('Show compile requires pattern source for the first cell.')

  if (cells[0].sceneSpan > 1 || cells.length === 1) {
    return {
      clips: [{ id: cells[0].id, source: source0, adaptation: compilerAdaptation(cells[0].adaptations) }],
      zones: lookup.controllerZones ?? nominalZones(firstZone),
    }
  }

  const source1 = lookup.byCellId[cells[1].id]
  if (!source1) throw new Error('Show compile requires pattern source for both cells.')

  const transitionScene = show.scenes[sceneIndex(show, cells[0].sceneId)]
  const transition = transitionScene?.transitionOut
  const samePattern = isSamePattern(cells[0], cells[1])
  if (samePattern && transition && transition.kind !== 'cut') {
    return {
      clips: [{ id: cells[0].id, source: source0, adaptation: compilerAdaptation(cells[0].adaptations) }],
      adaptationRamp: {
        startMs: show.scenes[0].durationMs,
        durationMs: transition.durationMs,
        from: compilerAdaptation(cells[0].adaptations),
        to: compilerAdaptation(cells[1].adaptations),
      },
      zones: lookup.controllerZones ?? nominalZones(firstZone),
    }
  }

  const clips = [
    { id: cells[0].id, source: source0, adaptation: compilerAdaptation(cells[0].adaptations) },
    { id: cells[1].id, source: source1, adaptation: compilerAdaptation(cells[1].adaptations) },
  ]
  return {
    clips,
    crossfade: transition && transition.kind === 'crossfade'
      ? { startMs: show.scenes[0].durationMs, durationMs: transition.durationMs }
      : undefined,
    cut: !transition || transition.kind === 'cut' ? { startMs: show.scenes[0].durationMs } : undefined,
    routeTransition: transition && (transition.kind === 'wipe' || transition.kind === 'dither')
      ? { kind: transition.kind, startMs: show.scenes[0].durationMs, durationMs: transition.durationMs }
      : undefined,
    zones: lookup.controllerZones ?? nominalZones(firstZone),
  }
}

export function transitionCost(kind: NonNullable<ShowScene['transitionOut']>['kind']): ShowTransitionCost {
  if (kind === 'crossfade') return 'expensive'
  if (kind === 'wipe' || kind === 'dither') return 'cheap'
  return 'free'
}

function sceneIndex(show: ShowRecord, sceneId: string): number {
  const index = show.scenes.findIndex((scene) => scene.id === sceneId)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function sceneToGridColumn(index: number): number {
  return 2 + index * 2
}

function clampDuration(durationMs: number): number {
  return Math.max(1000, Math.round(durationMs))
}

function normalizeAdaptations(adaptations: ShowCellAdaptations): ShowCellAdaptations {
  return {
    mirror: Boolean(adaptations.mirror),
    phase: clamp01(adaptations.phase),
    brightness: clamp01(adaptations.brightness),
    timeScale: Math.max(0.1, Math.min(4, adaptations.timeScale)),
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function compilerAdaptation(adaptations: ShowCellAdaptations): ShowClipAdaptation {
  return {
    brightness: adaptations.brightness,
    phase: adaptations.phase,
    timeScale: adaptations.timeScale,
    mirror: adaptations.mirror,
  }
}

function isSamePattern(a: ShowCell, b: ShowCell): boolean {
  return a.pattern.kind === b.pattern.kind && a.pattern.id === b.pattern.id
}

function nominalZones(firstZone: ShowZone): ControllerZone[] {
  return [{
    id: firstZone.id,
    name: firstZone.name,
    ranges: [{ start: 0, end: Math.max(0, firstZone.nominalPixelCount - 1) }],
  }]
}
