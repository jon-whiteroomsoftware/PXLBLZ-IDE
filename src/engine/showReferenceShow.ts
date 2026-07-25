import type { ShowPatternRef, ShowRecord, ShowTransitionEasing } from './personalContentRecords'
import { projectShowTimeline } from './showModel'

export interface ShowReferencePatternProjection {
  pattern: ShowPatternRef
  patternName: string
  cellIds: readonly string[]
  instanceIds: readonly string[]
  instanceSourceCellIdById?: Readonly<Record<string, string>>
}

export type ShowReferenceExampleAnchor =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'boundary'; transitionId: string }

export interface ShowReferenceExample {
  id: string
  label: string
  detail: string
  anchor: ShowReferenceExampleAnchor
  easing?: ShowTransitionEasing
}

export interface ShowReferenceGuide {
  summary: string
  patternSlots?: {
    cellIds: readonly string[]
    instanceIds: readonly string[]
  }
  examples: readonly ShowReferenceExample[]
}

/**
 * Builds a session-only reference artifact. Replacing a Pattern also discards
 * authored control targets because export names belong to the previous source.
 */
export function applyShowReferencePattern(
  show: ShowRecord,
  projection: ShowReferencePatternProjection,
): ShowRecord {
  const cellIds = new Set(projection.cellIds)
  const instanceIds = new Set(projection.instanceIds)
  return {
    ...show,
    cells: show.cells.map((cell) => cellIds.has(cell.id) ? {
      ...cell,
      pattern: projection.pattern,
      patternName: projection.patternName,
      controlTargets: undefined,
    } : cell),
    composition: show.composition ? {
      ...show.composition,
      patternInstances: show.composition.patternInstances.map((instance) => instanceIds.has(instance.id) ? {
        ...instance,
        pattern: projection.pattern,
        patternName: projection.patternName,
        controlTargets: undefined,
      } : instance),
    } : show.composition,
  }
}

/**
 * Extends declared instance slots only when a placement has explicit lineage
 * to a declared flat-cell slot. Newly authored placements have no lineage and
 * therefore never become part of the transient projection by coincidence.
 */
export function extendShowReferencePatternProjection(
  show: ShowRecord,
  projection: ShowReferencePatternProjection,
  sourceCellIdByPlacementId: Readonly<Record<string, string>>,
): ShowReferencePatternProjection {
  if (!show.composition) return projection
  const cellIds = new Set(projection.cellIds)
  const instanceIds = new Set(projection.instanceIds)
  const instanceSourceCellIdById = { ...projection.instanceSourceCellIdById }
  for (const scene of show.composition.scenes) {
    for (const zone of scene.zones) {
      const placements = [
        ...zone.main,
        ...zone.overlays.flatMap((layer) => layer.placements),
      ]
      for (const placement of placements) {
        const sourceCellId = sourceCellIdByPlacementId[placement.id]
        if (!sourceCellId || !cellIds.has(sourceCellId)) continue
        instanceIds.add(placement.instanceId)
        instanceSourceCellIdById[placement.instanceId] = sourceCellId
      }
    }
  }
  return {
    ...projection,
    instanceIds: [...instanceIds],
    instanceSourceCellIdById,
  }
}

/**
 * Removes a transient reference-Pattern projection before an edited record is
 * persisted. The configured slots keep their authored Pattern identity and
 * controls while unrelated edits made against the projected view survive.
 */
export function restoreShowReferencePatternSlots(
  edited: ShowRecord,
  authored: ShowRecord,
  projection: ShowReferencePatternProjection,
): ShowRecord {
  const cellIds = new Set(projection.cellIds)
  const instanceIds = new Set(projection.instanceIds)
  const authoredCells = new Map(authored.cells.map((cell) => [cell.id, cell]))
  const authoredInstances = new Map(
    authored.composition?.patternInstances.map((instance) => [instance.id, instance]) ?? [],
  )
  return {
    ...edited,
    cells: edited.cells.map((cell) => {
      const source = cellIds.has(cell.id) ? authoredCells.get(cell.id) : undefined
      return source ? {
        ...cell,
        pattern: source.pattern,
        patternName: source.patternName,
        controlTargets: source.controlTargets,
      } : cell
    }),
    composition: edited.composition ? {
      ...edited.composition,
      patternInstances: edited.composition.patternInstances.map((instance) => {
        const sourceCellId = projection.instanceSourceCellIdById?.[instance.id]
        const source = instanceIds.has(instance.id)
          ? authoredInstances.get(instance.id) ?? (sourceCellId ? authoredCells.get(sourceCellId) : undefined)
          : undefined
        return source ? {
          ...instance,
          pattern: source.pattern,
          patternName: source.patternName,
          controlTargets: source.controlTargets,
        } : instance
      }),
    } : edited.composition,
  }
}

export function currentShowReferenceExample(
  show: ShowRecord,
  guide: ShowReferenceGuide,
  positionMs: number,
): ShowReferenceExample | null {
  const timeline = projectShowTimeline(show)
  if (timeline.durationMs <= 0) return guide.examples[0] ?? null
  const position = ((positionMs % timeline.durationMs) + timeline.durationMs) % timeline.durationMs

  const boundaryStarts = timeline.boundaryTransitions
    .map((boundary) => boundary.startMs)
    .sort((a, b) => a - b)
  const candidates = guide.examples.flatMap((example) => {
    const anchor = example.anchor
    if (anchor.kind === 'scene') {
      const scene = timeline.scenes.find((candidate) => candidate.sceneId === anchor.sceneId)
      const outgoing = timeline.boundaryTransitions.find((candidate) => candidate.afterSceneId === anchor.sceneId)
      return scene ? [{ example, startMs: scene.startMs, endMs: outgoing?.endMs ?? scene.endMs }] : []
    }
    const boundary = timeline.boundaryTransitions.find((candidate) => candidate.id === anchor.transitionId)
    if (!boundary) return []
    const nextBoundaryStart = boundaryStarts.find((startMs) => startMs > boundary.startMs)
    return [{ example, startMs: boundary.startMs, endMs: nextBoundaryStart ?? timeline.durationMs }]
  }).filter(({ startMs, endMs }) => position >= startMs && position < endMs)

  candidates.sort((a, b) => b.startMs - a.startMs)
  return candidates[0]?.example ?? null
}
