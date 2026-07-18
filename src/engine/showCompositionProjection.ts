import {
  normalizeShowEntryState,
  normalizeShowTransitionState,
  showCellAtSlot,
  showRecordToCompileRecipe,
  type ShowCompileRecipeSourceLookup,
} from './showModel'
import type {
  ShowCell,
  ShowClipEffect,
  ShowRecord,
  ShowScene,
} from './personalContentRecords'
import type { ShowRecipe } from './showCompiler'

export type ShowCompositionCompilerPath =
  | 'steady-hold'
  | 'two-scene-boundary'
  | 'adaptation-ramp'
  | 'scene-sequence'
  | 'routed-scene-sequence'
  | 'installation-single-zone'

export interface ShowCompositionPatternInstanceProjection {
  id: string
  compiled: boolean
  compiledClipId?: string
  sourceCellIds: string[]
  pattern: ShowCell['pattern']
  patternName: string
  evaluationPolicy: NonNullable<ShowCell['evaluationPolicy']>
  simulation: {
    timeScale: number
    timeOffsetMs: number
    lightShutter?: ShowCell['adaptations']['lightShutter']
    steppedClock?: ShowCell['adaptations']['steppedClock']
    controlTargets?: Record<string, number>
  }
}

export interface ShowCompositionPlacementProjection {
  id: string
  sourceCellId: string
  instanceId: string
  role: 'base'
  zoneIds: string[]
  startMs: 0
  durationMs: number
  entryPolicy: 'continue' | 'restart'
  zoneMode: 'span' | 'repeat'
  appearance: {
    brightness: number
    phase: number
    mirror: boolean
    effects?: ShowClipEffect[]
  }
}

export interface ShowCompositionSceneProjection {
  id: string
  name: string
  durationMs: number
  placements: ShowCompositionPlacementProjection[]
  outgoingTransitionIds: string[]
  routingTargets?: ShowScene['routingTargets']
  sampleTargets?: ShowScene['sampleTargets']
}

export type ShowCompositionProjectionDiagnostic =
  | {
      kind: 'compiler-omits-cell'
      cellId: string
      message: string
    }
  | {
      kind: 'instance-ownership-conflict'
      instanceId: string
      cellIds: string[]
      message: string
    }

/**
 * Additive, lossless spike projection. The flat record deliberately remains the
 * persistence authority until a later schema is proven; the explicit ownership
 * views are sidecars that can feed Scene summaries and migration diagnostics.
 */
export interface FlatShowCompositionProjection {
  version: 0
  sourceFormat: 'flat-show-v1'
  flatRecord: ShowRecord
  compilerPath: ShowCompositionCompilerPath
  patternInstances: ShowCompositionPatternInstanceProjection[]
  scenes: ShowCompositionSceneProjection[]
  diagnostics: ShowCompositionProjectionDiagnostic[]
}

export function projectFlatShowComposition(
  input: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): FlatShowCompositionProjection {
  const show = cloneJson(normalizeShowEntryState(normalizeShowTransitionState(input)))
  // Version 0 always describes the flat compatibility record, even after the
  // additive version-1 sidecar exists.
  const recipe = showRecordToCompileRecipe({ ...show, composition: undefined }, lookup)
  const compilerPath = classifyCompilerPath(show, recipe)
  const instanceIdByCellId = mapCellsToCompiledInstances(show, recipe, compilerPath)
  const diagnostics: ShowCompositionProjectionDiagnostic[] = []

  for (const cell of show.cells) {
    if (!instanceIdByCellId.has(cell.id)) {
      const id = `uncompiled-${cell.id}`
      instanceIdByCellId.set(cell.id, id)
      diagnostics.push({
        kind: 'compiler-omits-cell',
        cellId: cell.id,
        message: 'The current compiler recipe does not reference this persisted cell.',
      })
    }
  }

  const cellsByInstanceId = new Map<string, ShowCell[]>()
  for (const cell of show.cells) {
    const instanceId = instanceIdByCellId.get(cell.id)!
    cellsByInstanceId.set(instanceId, [...(cellsByInstanceId.get(instanceId) ?? []), cell])
  }

  const compiledIds = new Set(recipe.clips.map((clip) => clip.id))
  const patternInstances = [...cellsByInstanceId.entries()].map(([id, cells]) => {
    const source = cells[0]
    if (cells.some((cell) => instanceOwnedSignature(cell) !== instanceOwnedSignature(source))) {
      diagnostics.push({
        kind: 'instance-ownership-conflict',
        instanceId: id,
        cellIds: cells.map((cell) => cell.id),
        message: 'The current compiler shares one runtime member while flat cells carry different instance-owned time or control targets; a durable schema needs explicit instance automation.',
      })
    }
    return {
      id,
      compiled: compiledIds.has(id),
      ...(compiledIds.has(id) ? { compiledClipId: id } : {}),
      sourceCellIds: cells.map((cell) => cell.id),
      pattern: { ...source.pattern },
      patternName: source.patternName,
      evaluationPolicy: source.evaluationPolicy === 'freeze-at-entry'
        ? 'freeze-at-entry' as const
        : 'live' as const,
      simulation: {
        timeScale: source.adaptations.timeScale,
        timeOffsetMs: source.adaptations.timeOffsetMs ?? 0,
        ...(source.adaptations.lightShutter ? { lightShutter: { ...source.adaptations.lightShutter } } : {}),
        ...(source.adaptations.steppedClock ? { steppedClock: { ...source.adaptations.steppedClock } } : {}),
        ...(source.controlTargets ? { controlTargets: { ...source.controlTargets } } : {}),
      },
    }
  })

  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  const scenes = show.scenes.map((scene, sceneIndex): ShowCompositionSceneProjection => ({
    id: scene.id,
    name: scene.name,
    durationMs: scene.durationMs,
    placements: show.cells.flatMap((cell) => {
      const cellSceneIndex = sceneIndexById.get(cell.sceneId)
      if (cellSceneIndex === undefined || sceneIndex < cellSceneIndex || sceneIndex >= cellSceneIndex + Math.max(1, cell.sceneSpan)) return []
      const zoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
      const zoneSpan = Math.max(1, Math.min(cell.zoneSpan ?? 1, show.zones.length - zoneIndex))
      const placement: ShowCompositionPlacementProjection = {
        id: `placement-${cell.id}-${scene.id}`,
        sourceCellId: cell.id,
        instanceId: instanceIdByCellId.get(cell.id)!,
        role: 'base',
        zoneIds: show.zones.slice(zoneIndex, zoneIndex + zoneSpan).map((zone) => zone.id),
        startMs: 0,
        durationMs: scene.durationMs,
        entryPolicy: sceneIndex === cellSceneIndex && cell.restartOnEntry ? 'restart' : 'continue',
        zoneMode: cell.zoneMode === 'repeat' ? 'repeat' : 'span',
        appearance: {
          brightness: cell.adaptations.brightness,
          phase: cell.adaptations.phase,
          mirror: cell.adaptations.mirror,
          ...(cell.effects ? { effects: cloneJson(cell.effects) } : {}),
        },
      }
      return [placement]
    }),
    outgoingTransitionIds: (show.transitions ?? [])
      .filter((transition) => transition.afterSceneId === scene.id)
      .map((transition) => transition.id),
    ...(scene.routingTargets ? { routingTargets: { ...scene.routingTargets } } : {}),
    ...(scene.sampleTargets ? { sampleTargets: { ...scene.sampleTargets } } : {}),
  }))

  return {
    version: 0,
    sourceFormat: 'flat-show-v1',
    flatRecord: show,
    compilerPath,
    patternInstances,
    scenes,
    diagnostics,
  }
}

export function restoreFlatShowFromCompositionProjection(projection: FlatShowCompositionProjection): ShowRecord {
  if (projection.version !== 0 || projection.sourceFormat !== 'flat-show-v1' || !projection.flatRecord) {
    throw new Error('Unsupported Show composition projection.')
  }
  return cloneJson(normalizeShowEntryState(normalizeShowTransitionState(projection.flatRecord)))
}

export function serializedShowCompositionBytes(projection: FlatShowCompositionProjection): number {
  return new TextEncoder().encode(JSON.stringify(projection)).byteLength
}

function classifyCompilerPath(show: ShowRecord, recipe: ShowRecipe): ShowCompositionCompilerPath {
  if (show.outputContract?.kind === 'installation' && show.zones.length === 1 && show.routingSwitches.length === 0) {
    return 'installation-single-zone'
  }
  if (show.outputContract?.kind === 'installation' || show.zones.length > 1 || show.routingSwitches.length > 0) {
    return 'routed-scene-sequence'
  }
  if (recipe.sceneSequence) return 'scene-sequence'
  if (recipe.adaptationRamp) return 'adaptation-ramp'
  if (recipe.clips.length === 1) return 'steady-hold'
  return 'two-scene-boundary'
}

function mapCellsToCompiledInstances(
  show: ShowRecord,
  recipe: ShowRecipe,
  compilerPath: ShowCompositionCompilerPath,
): Map<string, string> {
  const result = new Map<string, string>()
  if (recipe.routedSceneSequence) {
    recipe.routedSceneSequence.scenes.forEach((compiledScene, sceneIndex) => {
      const scene = show.scenes[sceneIndex]
      if (!scene) return
      for (const placement of compiledScene.placements) {
        const zone = show.zones.find((candidate) => candidate.name === placement.zoneName)
        const cell = zone ? showCellAtSlot(show, zone.id, scene.id) : undefined
        if (cell) result.set(cell.id, placement.clipId)
      }
    })
    return result
  }
  if (recipe.sceneSequence) {
    const firstZone = show.zones[0]
    if (!firstZone) return result
    recipe.sceneSequence.scenes.forEach((compiledScene, index) => {
      const scene = show.scenes[index]
      const cell = scene ? showCellAtSlot(show, firstZone.id, scene.id) : undefined
      if (cell) result.set(cell.id, compiledScene.clipId)
    })
    return result
  }
  if (compilerPath === 'adaptation-ramp' && recipe.clips[0]) {
    const firstZoneId = show.zones[0]?.id
    for (const cell of show.cells.filter((candidate) => candidate.zoneId === firstZoneId)) {
      result.set(cell.id, recipe.clips[0].id)
    }
    return result
  }
  const compiledIds = new Set(recipe.clips.map((clip) => clip.id))
  for (const cell of show.cells) {
    if (compiledIds.has(cell.id)) result.set(cell.id, cell.id)
  }
  return result
}

function instanceOwnedSignature(cell: ShowCell): string {
  return JSON.stringify({
    pattern: cell.pattern,
    evaluationPolicy: cell.evaluationPolicy ?? 'live',
    timeScale: cell.adaptations.timeScale,
    timeOffsetMs: cell.adaptations.timeOffsetMs ?? 0,
    lightShutter: cell.adaptations.lightShutter,
    steppedClock: cell.adaptations.steppedClock,
    controlTargets: cell.controlTargets,
  })
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
