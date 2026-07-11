import type {
  MapRecord,
  ShowCell,
  ShowCellAdaptations,
  ShowRecord,
  ShowPortalSettings,
  ShowRoutingLayout,
  ShowRoutingLayoutZone,
  ShowScene,
  ShowTransitionCost,
  ShowZone,
} from './personalContentRecords'
import type { ShowClipAdaptation, ShowRecipe } from './showCompiler'
import {
  controllerZonePixelCount,
  controllerProfileDisplayName,
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
  routingSwitches: Array<{ afterSceneId: string; layoutId: string; layoutName: string }>
  rows: ShowStripRowProjection[]
}

export interface ShowCompileRecipeSourceLookup {
  byCellId: Record<string, string>
  controllerZones?: ControllerZone[]
  stageDimension?: 1 | 2 | 3
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
    routingLayouts: [routingLayoutFromZones('layout-1', 'Default', zones)],
    routingSwitches: [],
    stageMapId: null,
    updatedAt,
  }
}

export function createDefaultShowFromController(
  id: string,
  name: string,
  controller: ControllerProfile,
  stageMapId: string | null = null,
  updatedAt = Date.now(),
): ShowRecord {
  const base = createDefaultShow(id, name, updatedAt)
  const controllerZones = normalizeControllerZones(controller.zones)
  if (controllerZones.length === 0) {
    return { ...base, targetControllerProfileId: controller.id, stageMapId }
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
    routingLayouts: [routingLayoutFromControllerZones('layout-1', 'Default', zones, controllerZones)],
    routingSwitches: [],
    targetControllerProfileId: controller.id,
    stageMapId,
    updatedAt,
  }
}

export function importedStageMapIdForController(
  controller: ControllerProfile,
  maps: MapRecord[],
): string | null {
  const displayName = controllerProfileDisplayName(controller)
  const candidates = maps.filter((map) => {
    const metadata = map.importMetadata
    if (!metadata) return false
    if (controller.deviceId && metadata.deviceId === controller.deviceId) return true
    if (controller.lastSeenIp && metadata.ip === controller.lastSeenIp) return true
    return metadata.controllerName === displayName || metadata.controllerName === controller.name
  })
  candidates.sort(
    (a, b) =>
      (b.importMetadata?.importedAt ?? b.updatedAt) -
      (a.importMetadata?.importedAt ?? a.updatedAt),
  )
  return candidates[0]?.id ?? null
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
    routingSwitches: show.routingSwitches.flatMap((routingSwitch) => {
      const layout = show.routingLayouts.find((candidate) => candidate.id === routingSwitch.layoutId)
      return layout
        ? [{ ...routingSwitch, layoutName: layout.name }]
        : []
    }),
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

export function addShowScene(show: ShowRecord): ShowRecord {
  const id = nextEntityId('scene-', show.scenes)
  const scene: ShowScene = {
    id,
    name: uniqueSceneName(`Scene ${show.scenes.length + 1}`, show.scenes),
    durationMs: 30000,
  }
  const lastSceneIndex = show.scenes.length - 1
  const defaultTransition: NonNullable<ShowScene['transitionOut']> = {
    kind: 'crossfade',
    durationMs: 2000,
  }
  const usedCellIds = new Set(show.cells.map((cell) => cell.id))
  const nextCells = show.zones.map((zone) => {
    const source = cellCoveringScene(show, zone.id, lastSceneIndex)
    const cellId = nextStringId('cell-', usedCellIds)
    usedCellIds.add(cellId)
    return copyCellForScene(source, cellId, zone.id, scene.id, lastSceneIndex)
  })

  return {
    ...show,
    scenes: [
      ...show.scenes.map((existing, index) => (
        index === lastSceneIndex && existing.transitionOut == null
          ? { ...existing, transitionOut: defaultTransition }
          : existing
      )),
      scene,
    ],
    cells: [...show.cells, ...nextCells],
    updatedAt: Date.now(),
  }
}

export function removeShowScene(show: ShowRecord, sceneId: string): ShowRecord {
  if (show.scenes.length <= 1) return show
  const removedSceneIndex = show.scenes.findIndex((scene) => scene.id === sceneId)
  if (removedSceneIndex === -1) return show

  const remainingScenes = show.scenes.filter((scene) => scene.id !== sceneId)
  const finalSceneId = remainingScenes[remainingScenes.length - 1]?.id
  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const cells = show.cells.flatMap((cell) => {
    const start = sceneIndexById.get(cell.sceneId)
    if (start == null) return []
    const span = Math.max(1, cell.sceneSpan)
    const end = start + span - 1
    if (cell.sceneId === sceneId) {
      const nextSceneId = show.scenes[removedSceneIndex + 1]?.id
      if (span > 1 && nextSceneId) return [{ ...cell, sceneId: nextSceneId, sceneSpan: span - 1 }]
      return []
    }
    if (start < removedSceneIndex && removedSceneIndex <= end) {
      return [{ ...cell, sceneSpan: Math.max(1, span - 1) }]
    }
    return [cell]
  })

  return {
    ...show,
    scenes: remainingScenes.map((scene) => (
      scene.id === finalSceneId ? { ...scene, transitionOut: undefined } : scene
    )),
    cells,
    routingSwitches: show.routingSwitches.filter((routingSwitch) => routingSwitch.afterSceneId !== sceneId),
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
  const next = {
    ...show,
    zones: [...show.zones, zone],
    cells: [...show.cells, ...createCellsForZone(show.scenes, zone, show.cells)],
    updatedAt: Date.now(),
  }
  return {
    ...next,
    routingLayouts: next.routingLayouts.map((layout) => appendZoneToLayout(layout, zone)),
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
    routingLayouts: show.routingLayouts.map((layout) => ({
      ...layout,
      zones: layout.zones.filter((zone) => zone.zoneId !== zoneId),
    })),
    updatedAt: Date.now(),
  }
}

export function normalizeShowRoutingState(show: ShowRecord): ShowRecord {
  const layouts = Array.isArray(show.routingLayouts) && show.routingLayouts.length > 0
    ? show.routingLayouts.map(normalizeRoutingLayout)
    : [routingLayoutFromZones('layout-1', 'Default', show.zones)]
  const sceneIds = new Set(show.scenes.slice(0, -1).map((scene) => scene.id))
  const layoutIds = new Set(layouts.map((layout) => layout.id))
  const switches = Array.isArray(show.routingSwitches)
    ? show.routingSwitches.filter((routingSwitch) => (
        sceneIds.has(routingSwitch.afterSceneId) && layoutIds.has(routingSwitch.layoutId)
      ))
    : []
  return { ...show, routingLayouts: layouts, routingSwitches: switches }
}

export function addShowRoutingLayout(show: ShowRecord, name = 'New layout', sourceLayoutId?: string): ShowRecord {
  const normalized = normalizeShowRoutingState(show)
  const id = nextEntityId('layout-', normalized.routingLayouts)
  const source = sourceLayoutId
    ? normalized.routingLayouts.find((layout) => layout.id === sourceLayoutId)
    : undefined
  const layout: ShowRoutingLayout = {
    id,
    name: uniqueRoutingLayoutName(name, normalized.routingLayouts),
    zones: source
      ? source.zones.map(cloneRoutingLayoutZone)
      : routingLayoutFromZones(id, name, normalized.zones).zones,
  }
  return { ...normalized, routingLayouts: [...normalized.routingLayouts, layout], updatedAt: Date.now() }
}

export function formatShowRoutingRanges(ranges: ShowRoutingLayoutZone['ranges']): string {
  return ranges.map((range) => range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`).join(', ')
}

export function parseShowRoutingRanges(value: string): ShowRoutingLayoutZone['ranges'] | null {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return []
  const ranges: ShowRoutingLayoutZone['ranges'] = []
  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!match) return null
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    ranges.push({ start: Math.min(start, end), end: Math.max(start, end) })
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end)
}

export function updateShowRoutingLayout(
  show: ShowRecord,
  layoutId: string,
  changes: Partial<Omit<ShowRoutingLayout, 'id'>>,
): ShowRecord {
  const normalized = normalizeShowRoutingState(show)
  return {
    ...normalized,
    routingLayouts: normalized.routingLayouts.map((layout) => layout.id === layoutId
      ? normalizeRoutingLayout({ ...layout, ...changes, id: layout.id })
      : layout),
    updatedAt: Date.now(),
  }
}

export function removeShowRoutingLayout(show: ShowRecord, layoutId: string): ShowRecord {
  const normalized = normalizeShowRoutingState(show)
  if (normalized.routingLayouts.length <= 1) return show
  const routingLayouts = normalized.routingLayouts.filter((layout) => layout.id !== layoutId)
  if (routingLayouts.length === normalized.routingLayouts.length) return show
  return {
    ...normalized,
    routingLayouts,
    routingSwitches: normalized.routingSwitches.filter((routingSwitch) => routingSwitch.layoutId !== layoutId),
    updatedAt: Date.now(),
  }
}

export function updateShowRoutingSwitch(show: ShowRecord, afterSceneId: string, layoutId: string | null): ShowRecord {
  const normalized = normalizeShowRoutingState(show)
  if (!normalized.scenes.slice(0, -1).some((scene) => scene.id === afterSceneId)) return show
  if (layoutId !== null && !normalized.routingLayouts.some((layout) => layout.id === layoutId)) return show
  const routingSwitches = normalized.routingSwitches.filter((routingSwitch) => routingSwitch.afterSceneId !== afterSceneId)
  if (layoutId !== null) routingSwitches.push({ afterSceneId, layoutId })
  return { ...normalized, routingSwitches, updatedAt: Date.now() }
}

export function updateShowTransition(
  show: ShowRecord,
  sceneId: string,
  kind: NonNullable<ShowScene['transitionOut']>['kind'],
  durationMs: number,
  feather = 0,
  portal: Partial<ShowPortalSettings> = {},
): ShowRecord {
  const current = show.scenes.find((scene) => scene.id === sceneId)?.transitionOut
  const currentPortal = current?.kind === 'portal' ? current : undefined
  return updateShowScene(show, sceneId, {
    transitionOut: kind === 'cut'
      ? undefined
      : kind === 'portal'
        ? {
            kind,
            durationMs: clampDuration(durationMs),
            feather: clamp01(feather),
            centerX: clamp01(portal.centerX ?? currentPortal?.centerX ?? 0.5),
            centerY: clamp01(portal.centerY ?? currentPortal?.centerY ?? 0.5),
            invert: portal.invert ?? currentPortal?.invert ?? false,
            featherPolicy: (portal.featherPolicy ?? currentPortal?.featherPolicy) === 'blend' ? 'blend' : 'dither',
          }
        : {
          kind,
          durationMs: clampDuration(durationMs),
          ...(kind === 'wipe' ? { feather: clamp01(feather) } : {}),
        },
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
  if (transition?.kind === 'portal' && (!show.stageMapId || lookup.stageDimension !== 2)) {
    throw new Error('Portal transition requires a 2D Stage Map.')
  }
  if (samePattern && hasSameDiscreteAdaptations(cells[0], cells[1]) && transition && transition.kind !== 'cut' && transition.kind !== 'portal') {
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
    routeTransition: transition && (transition.kind === 'wipe' || transition.kind === 'dither' || transition.kind === 'portal')
      ? {
          kind: transition.kind,
          startMs: show.scenes[0].durationMs,
          durationMs: transition.durationMs,
          ...(transition.kind === 'wipe' ? { feather: clamp01(transition.feather ?? 0) } : {}),
          ...(transition.kind === 'portal'
            ? {
                feather: clamp01(transition.feather ?? 0.12),
                centerX: clamp01(transition.centerX ?? 0.5),
                centerY: clamp01(transition.centerY ?? 0.5),
                invert: Boolean(transition.invert),
                featherPolicy: transition.featherPolicy === 'blend' ? 'blend' as const : 'dither' as const,
              }
            : {}),
        }
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

  const normalized = normalizeShowRoutingState(show)
  const activeSwitches = normalized.routingSwitches.flatMap((routingSwitch) => {
    const sceneIndex = normalized.scenes.findIndex((scene) => scene.id === routingSwitch.afterSceneId)
    if (sceneIndex < 0 || sceneIndex >= normalized.scenes.length - 1) return []
    const atMs = normalized.scenes
      .slice(0, sceneIndex + 1)
      .reduce((sum, scene) => sum + Math.max(0, scene.durationMs), 0)
    return [{ atMs, layoutId: routingSwitch.layoutId }]
  })
  const routingLayouts = activeSwitches.length > 0
    ? normalized.routingLayouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        zones: routingLayoutControllerZones(normalized.zones, layout),
      }))
    : undefined

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
    routingLayouts,
    routingSwitches: routingLayouts ? activeSwitches : undefined,
    loopDurationMs: routingLayouts ? showLoopDurationMs(normalized) : undefined,
  }
}

export function transitionCost(kind: NonNullable<ShowScene['transitionOut']>['kind']): ShowTransitionCost {
  if (kind === 'crossfade') return 'expensive'
  if (kind === 'portal') return 'expensive'
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
    timeScale: Math.max(0, Math.min(4, adaptations.timeScale)),
    ...(adaptations.lightShutter
      ? {
          lightShutter: {
            rateHz: Math.max(0.01, Math.min(60, adaptations.lightShutter.rateHz)),
            duty: clamp01(adaptations.lightShutter.duty),
            phase: clamp01(adaptations.lightShutter.phase),
            clockBehavior: adaptations.lightShutter.clockBehavior === 'freeze' ? 'freeze' as const : 'continue' as const,
          },
      }
      : {}),
    ...(adaptations.steppedClock
      ? { steppedClock: { stepMs: Math.max(16, Math.min(60000, adaptations.steppedClock.stepMs)) } }
      : {}),
    ...(adaptations.timeOffsetMs !== undefined
      ? { timeOffsetMs: Math.max(0, Math.min(60000, adaptations.timeOffsetMs)) }
      : {}),
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
    ...(adaptations.lightShutter ? { lightShutter: { ...adaptations.lightShutter } } : {}),
    ...(adaptations.steppedClock ? { steppedClock: { ...adaptations.steppedClock } } : {}),
    timeOffsetMs: adaptations.timeOffsetMs ?? 0,
  }
}

function isSamePattern(a: ShowCell, b: ShowCell): boolean {
  return a.pattern.kind === b.pattern.kind && a.pattern.id === b.pattern.id
}

function hasSameDiscreteAdaptations(a: ShowCell, b: ShowCell): boolean {
  const aShutter = a.adaptations.lightShutter
  const bShutter = b.adaptations.lightShutter
  const sameShutter = !aShutter || !bShutter
    ? aShutter === bShutter
    : aShutter.rateHz === bShutter.rateHz
    && aShutter.duty === bShutter.duty
    && aShutter.phase === bShutter.phase
    && aShutter.clockBehavior === bShutter.clockBehavior
  const aSteppedClock = a.adaptations.steppedClock
  const bSteppedClock = b.adaptations.steppedClock
  const sameSteppedClock = !aSteppedClock || !bSteppedClock
    ? aSteppedClock === bSteppedClock
    : aSteppedClock.stepMs === bSteppedClock.stepMs
  return sameShutter
    && sameSteppedClock
    && (a.adaptations.timeOffsetMs ?? 0) === (b.adaptations.timeOffsetMs ?? 0)
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

function routingLayoutFromZones(id: string, name: string, zones: ShowZone[]): ShowRoutingLayout {
  return {
    id,
    name,
    zones: nominalZones(zones).map((zone) => ({
      zoneId: zone.id,
      ranges: zone.ranges.map((range) => ({ ...range })),
    })),
  }
}

function routingLayoutFromControllerZones(
  id: string,
  name: string,
  showZones: ShowZone[],
  controllerZones: ControllerZone[],
): ShowRoutingLayout {
  return {
    id,
    name,
    zones: showZones.map((zone, index) => ({
      zoneId: zone.id,
      ranges: (controllerZones[index]?.ranges ?? []).map((range) => ({ ...range })),
    })),
  }
}

function routingLayoutControllerZones(showZones: ShowZone[], layout: ShowRoutingLayout): ControllerZone[] {
  return showZones.map((zone) => ({
    id: `${layout.id}:${zone.id}`,
    name: zone.name,
    ranges: (layout.zones.find((entry) => entry.zoneId === zone.id)?.ranges ?? []).map((range) => ({ ...range })),
  }))
}

function appendZoneToLayout(layout: ShowRoutingLayout, zone: ShowZone): ShowRoutingLayout {
  const end = layout.zones.reduce((largest, entry) => (
    Math.max(largest, ...entry.ranges.map((range) => range.end))
  ), -1)
  const start = end + 1
  return {
    ...layout,
    zones: [
      ...layout.zones.map(cloneRoutingLayoutZone),
      { zoneId: zone.id, ranges: [{ start, end: start + clampPixelCount(zone.nominalPixelCount) - 1 }] },
    ],
  }
}

function normalizeRoutingLayout(layout: ShowRoutingLayout): ShowRoutingLayout {
  return {
    id: layout.id,
    name: layout.name.trim() || 'Untitled layout',
    zones: layout.zones.map((zone) => ({
      zoneId: zone.zoneId,
      ranges: zone.ranges
        .map((range) => ({
          start: Math.max(0, Math.round(Math.min(range.start, range.end))),
          end: Math.max(0, Math.round(Math.max(range.start, range.end))),
        }))
        .sort((a, b) => a.start - b.start || a.end - b.end),
    })),
  }
}

function cloneRoutingLayoutZone(zone: ShowRoutingLayoutZone): ShowRoutingLayoutZone {
  return { zoneId: zone.zoneId, ranges: zone.ranges.map((range) => ({ ...range })) }
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

function cellCoveringScene(show: ShowRecord, zoneId: string, sceneIndex: number): ShowCell | undefined {
  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  return show.cells.find((cell) => {
    if (cell.zoneId !== zoneId) return false
    const start = sceneIndexById.get(cell.sceneId)
    if (start == null) return false
    return start <= sceneIndex && sceneIndex < start + Math.max(1, cell.sceneSpan)
  })
}

function copyCellForScene(
  source: ShowCell | undefined,
  id: string,
  zoneId: string,
  sceneId: string,
  sceneIndex: number,
): ShowCell {
  if (!source) return defaultCell(id, zoneId, sceneId, sceneIndex)
  return {
    ...source,
    id,
    zoneId,
    sceneId,
    sceneSpan: 1,
    zoneSpan: 1,
    pattern: { ...source.pattern },
    adaptations: {
      ...source.adaptations,
      ...(source.adaptations.lightShutter
        ? { lightShutter: { ...source.adaptations.lightShutter } }
        : {}),
      ...(source.adaptations.steppedClock
        ? { steppedClock: { ...source.adaptations.steppedClock } }
        : {}),
    },
  }
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

function uniqueSceneName(name: string, scenes: ShowScene[]): string {
  const taken = new Set(scenes.map((scene) => scene.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let index = 2
  let next = `${name} ${index}`
  while (taken.has(next.toLowerCase())) {
    index += 1
    next = `${name} ${index}`
  }
  return next
}

function uniqueRoutingLayoutName(name: string, layouts: ShowRoutingLayout[]): string {
  const taken = new Set(layouts.map((layout) => layout.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  let index = 2
  let next = `${name} ${index}`
  while (taken.has(next.toLowerCase())) {
    index += 1
    next = `${name} ${index}`
  }
  return next
}
