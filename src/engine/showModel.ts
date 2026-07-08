import type {
  ShowCell,
  ShowCellAdaptations,
  ShowRecord,
  ShowScene,
  ShowTransitionCost,
  ShowZone,
} from './personalContentRecords'
import type { ShowClipAdaptation, ShowRecipe } from './showCompiler'
import {
  controllerZonePixelCount,
  normalizeControllerZones,
  type ControllerProfile,
  type ControllerZone,
} from './controllerProfile'

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
  rowSpan: number
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

const ZONE_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e', '#f43f5e', '#eab308']

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

export function createDefaultShowFromController(
  id: string,
  name: string,
  controller: ControllerProfile,
  updatedAt = Date.now(),
): ShowRecord {
  const base = createDefaultShow(id, name, updatedAt)
  const controllerZones = normalizeControllerZones(controller.zones)
  if (controllerZones.length === 0) {
    return { ...base, targetControllerProfileId: controller.id }
  }

  const zones: ShowZone[] = controllerZones.map((zone, index) => ({
    id: `zone-${index + 1}`,
    name: zone.name,
    nominalPixelCount: controllerZonePixelCount(zone),
    color: ZONE_COLORS[index % ZONE_COLORS.length],
  }))

  return {
    ...base,
    zones,
    cells: createCellsForZones(base.scenes, zones),
    targetControllerProfileId: controller.id,
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
            rowSpan: Math.max(1, cell.zoneSpan ?? 1),
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

export function spanShowCellZones(show: ShowRecord, cellId: string, zoneSpan: number): ShowRecord {
  const target = show.cells.find((cell) => cell.id === cellId)
  if (!target) return show
  const targetZoneIndex = show.zones.findIndex((zone) => zone.id === target.zoneId)
  if (targetZoneIndex === -1) return show
  const nextSpan = Math.max(1, Math.min(zoneSpan, show.zones.length - targetZoneIndex))
  const occupiedZoneIds = new Set(
    show.zones.slice(targetZoneIndex, targetZoneIndex + nextSpan).map((zone) => zone.id),
  )
  return {
    ...show,
    cells: show.cells
      .filter((cell) => cell.id === cellId || cell.sceneId !== target.sceneId || !occupiedZoneIds.has(cell.zoneId))
      .map((cell) => cell.id === cellId ? { ...cell, zoneSpan: nextSpan } : cell),
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

export function addShowZone(
  show: ShowRecord,
  seed: Partial<Pick<ShowZone, 'name' | 'nominalPixelCount' | 'color'>> = {},
): ShowRecord {
  const id = nextEntityId('zone-', show.zones)
  const zone: ShowZone = {
    id,
    name: uniqueZoneName(seed.name ?? `zone-${show.zones.length + 1}`, show.zones),
    nominalPixelCount: clampPixelCount(seed.nominalPixelCount ?? 60),
    color: seed.color ?? ZONE_COLORS[show.zones.length % ZONE_COLORS.length],
  }
  return {
    ...show,
    zones: [...show.zones, zone],
    cells: [...show.cells, ...createCellsForZone(show.scenes, zone, show.cells)],
    updatedAt: Date.now(),
  }
}

export function updateShowZone(
  show: ShowRecord,
  zoneId: string,
  changes: Partial<Omit<ShowZone, 'id'>>,
): ShowRecord {
  return {
    ...show,
    zones: show.zones.map((zone) => (
      zone.id === zoneId
        ? {
            ...zone,
            ...changes,
            name: changes.name ?? zone.name,
            nominalPixelCount: clampPixelCount(changes.nominalPixelCount ?? zone.nominalPixelCount),
          }
        : zone
    )),
    updatedAt: Date.now(),
  }
}

export function removeShowZone(show: ShowRecord, zoneId: string): ShowRecord {
  if (show.zones.length <= 1) return show
  return {
    ...show,
    zones: show.zones.filter((zone) => zone.id !== zoneId),
    cells: show.cells.filter((cell) => cell.zoneId !== zoneId),
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
  if (show.zones.length > 1) {
    return showRecordToRoutedFirstSceneRecipe(show, lookup)
  }

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
      zones: lookup.controllerZones ?? nominalZones(show.zones),
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
      zones: lookup.controllerZones ?? nominalZones(show.zones),
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
    zones: lookup.controllerZones ?? nominalZones(show.zones),
  }
}

function showRecordToRoutedFirstSceneRecipe(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): ShowRecipe {
  const firstScene = show.scenes[0]
  if (!firstScene) throw new Error('Show compile requires at least one scene.')
  const zoneById = new Map(show.zones.map((zone) => [zone.id, zone]))
  const cells = show.zones
    .map((zone) => show.cells.find((cell) => cell.zoneId === zone.id && cell.sceneId === firstScene.id))
    .filter((cell): cell is ShowCell => Boolean(cell))
  if (cells.length === 0) throw new Error('Show compile requires at least one first-scene zone cell.')

  return {
    clips: cells.map((cell) => {
      const source = lookup.byCellId[cell.id]
      if (!source) throw new Error(`Show compile requires pattern source for cell "${cell.id}".`)
      const zone = zoneById.get(cell.zoneId)
      if (!zone) throw new Error(`Show compile requires zone for cell "${cell.id}".`)
      const zoneIndex = show.zones.findIndex((candidate) => candidate.id === cell.zoneId)
      const zoneSpan = Math.max(1, Math.min(cell.zoneSpan ?? 1, show.zones.length - zoneIndex))
      const spannedZones = show.zones.slice(zoneIndex, zoneIndex + zoneSpan)
      return {
        id: cell.id,
        source,
        ...(zoneSpan > 1
          ? { zones: spannedZones.map((spannedZone) => spannedZone.name), zoneMode: 'span' as const }
          : { zone: zone.name }),
        adaptation: compilerAdaptation(cell.adaptations),
      }
    }),
    zones: lookup.controllerZones ?? nominalZones(show.zones),
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

function clampPixelCount(pixelCount: number): number {
  if (!Number.isFinite(pixelCount)) return 1
  return Math.max(1, Math.round(pixelCount))
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

function nominalZones(zones: ShowZone[]): ControllerZone[] {
  let offset = 0
  return zones.map((zone) => {
    const pixelCount = clampPixelCount(zone.nominalPixelCount)
    const start = offset
    const end = offset + pixelCount - 1
    offset += pixelCount
    return {
      id: zone.id,
      name: zone.name,
      ranges: [{ start, end }],
    }
  })
}

function createCellsForZones(scenes: ShowScene[], zones: ShowZone[]): ShowCell[] {
  return zones.flatMap((zone, zoneIndex) =>
    scenes.map((scene, sceneIndex) => defaultCell(`cell-${zoneIndex * scenes.length + sceneIndex + 1}`, zone.id, scene.id, sceneIndex)),
  )
}

function createCellsForZone(
  scenes: ShowScene[],
  zone: ShowZone,
  existingCells: ShowCell[],
): ShowCell[] {
  const cells: ShowCell[] = []
  const used = new Set(existingCells.map((cell) => cell.id))
  for (const [index, scene] of scenes.entries()) {
    const id = nextStringId('cell-', used)
    used.add(id)
    cells.push(defaultCell(id, zone.id, scene.id, index))
  }
  return cells
}

function defaultCell(id: string, zoneId: string, sceneId: string, sceneIndex: number): ShowCell {
  return {
    id,
    zoneId,
    sceneId,
    sceneSpan: 1,
    zoneSpan: 1,
    pattern: { kind: 'stock', id: sceneIndex === 0 ? 'TestPattern1D' : 'CometLoom' },
    patternName: sceneIndex === 0 ? 'TestPattern1D' : 'CometLoom',
    adaptations: { ...DEFAULT_ADAPTATIONS },
  }
}

function nextEntityId(prefix: string, existing: Array<{ id: string }>): string {
  return nextStringId(prefix, new Set(existing.map((item) => item.id)))
}

function nextStringId(prefix: string, used: Set<string>): string {
  let index = used.size + 1
  let id = `${prefix}${index}`
  while (used.has(id)) {
    index += 1
    id = `${prefix}${index}`
  }
  return id
}

function uniqueZoneName(name: string, zones: ShowZone[]): string {
  const taken = new Set(zones.map((zone) => zone.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let index = 2
  let next = `${name} ${index}`
  while (taken.has(next.toLowerCase())) {
    index += 1
    next = `${name} ${index}`
  }
  return next
}
