import type { ShowPatternRef, ShowRecord, ShowTransitionEasing } from './personalContentRecords'
import { projectShowTimeline } from './showModel'
import { partitionShowPatternControls } from './showPatternControlPartition'

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

export interface ShowPatternSlotGroup {
  cellIds: readonly string[]
  instanceIds: readonly string[]
}

/**
 * Applies the user's per-slot Try with Pattern selections in slot order. Each
 * group swaps as one unit; slots without a selection keep the authored cast.
 */
export function applyShowPatternSlotSelections(
  show: ShowRecord,
  slotGroups: readonly ShowPatternSlotGroup[],
  selections: Readonly<Record<number, ShowPatternRef>>,
  patternNameFor: (ref: ShowPatternRef) => string | undefined,
  exportedSliderNamesFor: (ref: ShowPatternRef) => ReadonlySet<string>,
): ShowRecord {
  return slotGroups.reduce((current, group, index) => {
    const pattern = selections[index]
    if (!pattern) return current
    const patternName = patternNameFor(pattern)
    if (!patternName) return current
    return applyShowReferencePattern(current, {
      pattern,
      patternName,
      cellIds: group.cellIds,
      instanceIds: group.instanceIds,
    }, exportedSliderNamesFor(pattern))
  }, show)
}

/** Builds a session-only reference artifact, retaining control state whose
 * export names remain public sliders on the projected Pattern. */
export function applyShowReferencePattern(
  show: ShowRecord,
  projection: ShowReferencePatternProjection,
  exportedSliderNames: ReadonlySet<string> = new Set(),
): ShowRecord {
  const resolvedProjection = extendShowReferencePatternProjection(show, projection)
  const cellIds = new Set(resolvedProjection.cellIds)
  const instanceIds = new Set(resolvedProjection.instanceIds)
  return {
    ...show,
    cells: show.cells.map((cell) => cellIds.has(cell.id) ? {
      ...cell,
      pattern: resolvedProjection.pattern,
      patternName: resolvedProjection.patternName,
      controlTargets: partitionShowPatternControls(
        cell.id,
        cell.controlTargets,
        undefined,
        exportedSliderNames,
      ).keptControlTargets,
    } : cell),
    composition: show.composition ? {
      ...show.composition,
      // A swapped source also forfeits the deterministic-loop stamp: the
      // exact-reset proof (#823 wrap census) belongs to the authored cast,
      // and a projected Pattern may hold state the loop reset cannot
      // reconstruct. Control compatibility does not prove runtime-state
      // compatibility, so selective control preservation does not keep it.
      ...(show.composition.executionModel !== undefined
        && show.composition.patternInstances.some((instance) => (
          instanceIds.has(instance.id)
          && (instance.pattern.kind !== resolvedProjection.pattern.kind
            || instance.pattern.id !== resolvedProjection.pattern.id)
        ))
        ? { executionModel: undefined }
        : {}),
      patternInstances: show.composition.patternInstances.map((instance) => instanceIds.has(instance.id) ? {
        ...instance,
        pattern: resolvedProjection.pattern,
        patternName: resolvedProjection.patternName,
        controlTargets: partitionShowPatternControls(
          instance.id,
          instance.controlTargets,
          undefined,
          exportedSliderNames,
        ).keptControlTargets,
      } : instance),
      scenes: show.composition.scenes.map((scene) => {
        const propertyTracks = [...instanceIds].reduce(
          (tracks, instanceId) => partitionShowPatternControls(
            instanceId,
            undefined,
            tracks,
            exportedSliderNames,
          ).keptPropertyTracks,
          scene.propertyTracks,
        )
        return propertyTracks?.length !== scene.propertyTracks?.length
          ? { ...scene, propertyTracks }
          : scene
      }),
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
): ShowReferencePatternProjection {
  if (!show.composition) return projection
  const cellIds = new Set(projection.cellIds)
  const instanceIds = new Set(projection.instanceIds)
  const instanceSourceCellIdById = { ...projection.instanceSourceCellIdById }
  const sourceCellIdByPlacementId: Record<string, string> = {}
  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  for (const cell of show.cells) {
    if (!cellIds.has(cell.id)) continue
    const startIndex = sceneIndexById.get(cell.sceneId)
    if (startIndex === undefined) continue
    for (const scene of show.scenes.slice(startIndex, startIndex + Math.max(1, cell.sceneSpan))) {
      const placementId = `placement-${cell.id}-${scene.id}`
      sourceCellIdByPlacementId[placementId] = cell.id
      for (const zone of show.zones) sourceCellIdByPlacementId[`${placementId}-${zone.id}`] = cell.id
    }
  }
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
  const resolvedProjection = extendShowReferencePatternProjection(
    edited,
    extendShowReferencePatternProjection(authored, projection),
  )
  const cellIds = new Set(resolvedProjection.cellIds)
  const instanceIds = new Set(resolvedProjection.instanceIds)
  const authoredCells = new Map(authored.cells.map((cell) => [cell.id, cell]))
  const authoredInstances = new Map(
    authored.composition?.patternInstances.map((instance) => [instance.id, instance]) ?? [],
  )
  const authoredScenes = new Map(
    authored.composition?.scenes.map((scene) => [scene.sceneId, scene]) ?? [],
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
      // Restoring the authored cast also restores its deterministic-loop
      // stamp - but only when EVERY source once again matches the authored
      // cast: the stamp binds to the whole cast, and a permanent
      // reassignment elsewhere must keep it forfeited (#823 review).
      ...(authored.composition?.executionModel !== undefined
        && edited.composition.executionModel === undefined
        && edited.composition.patternInstances.length === authoredInstances.size
        && edited.composition.patternInstances.every((instance) => {
          const authoredInstance = authoredInstances.get(instance.id)
          const restoredToAuthored = instanceIds.has(instance.id) && authoredInstance
          const effective = restoredToAuthored ? authoredInstance : instance
          return authoredInstance !== undefined
            && effective.pattern.kind === authoredInstance.pattern.kind
            && effective.pattern.id === authoredInstance.pattern.id
        })
        && JSON.stringify(edited.composition.groupDefinitions?.map((definition) => (
          definition.patternInstances.map((instance) => [instance.id, instance.pattern.kind, instance.pattern.id])
        )) ?? null) === JSON.stringify(authored.composition.groupDefinitions?.map((definition) => (
          definition.patternInstances.map((instance) => [instance.id, instance.pattern.kind, instance.pattern.id])
        )) ?? null)
        ? { executionModel: authored.composition.executionModel }
        : {}),
      patternInstances: edited.composition.patternInstances.map((instance) => {
        const sourceCellId = resolvedProjection.instanceSourceCellIdById?.[instance.id]
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
      scenes: edited.composition.scenes.map((scene) => {
        const authoredScene = authoredScenes.get(scene.sceneId)
        const authoredTracks = authoredScene?.propertyTracks ?? []
        const projectedTrack = (track: (typeof authoredTracks)[number]) => (
          track.target.kind === 'instance-control'
          && instanceIds.has(track.target.instanceId)
        )
        const tracksToRestore = authoredTracks.filter(projectedTrack)
        if (tracksToRestore.length === 0) return scene

        const editedTracksById = new Map(
          (scene.propertyTracks ?? [])
            .filter((track) => !projectedTrack(track))
            .map((track) => [track.id, track]),
        )
        const propertyTracks = authoredTracks.flatMap((track) => {
          if (projectedTrack(track)) return [track]
          const editedTrack = editedTracksById.get(track.id)
          if (!editedTrack) return []
          editedTracksById.delete(track.id)
          return [editedTrack]
        })
        propertyTracks.push(...editedTracksById.values())
        return { ...scene, propertyTracks }
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
