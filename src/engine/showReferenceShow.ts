import type { ShowPatternRef, ShowRecord, ShowTransitionEasing } from './personalContentRecords'
import { projectShowTimeline } from './showModel'

export interface ShowReferencePatternProjection {
  pattern: ShowPatternRef
  patternName: string
  cellIds: readonly string[]
  instanceIds: readonly string[]
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
