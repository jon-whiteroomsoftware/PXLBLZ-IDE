import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowRecord,
  ShowScene,
} from './personalContentRecords'
import { normalizeShowComposition, validateShowComposition } from './showCompositionModel'
import type { ShowCompileRecipeSourceLookup } from './showModel'

export interface LoweredShowComposition {
  show: ShowRecord
  lookup: ShowCompileRecipeSourceLookup
}

/**
 * Lower Scene-local Main schedules into the existing flat Scene compiler input.
 * The sidecar remains the authored authority; this projection is transient and
 * deliberately reuses the mature preview/export/hardware pipeline.
 */
export function lowerShowCompositionForCompile(
  show: ShowRecord,
  lookup: ShowCompileRecipeSourceLookup,
): LoweredShowComposition {
  if (!show.composition) return { show, lookup }
  const composition = normalizeShowComposition(show, show.composition)
  const issues = validateShowComposition(show, composition)
  if (issues.length > 0) {
    const issue = issues[0]
    throw new Error(`Show composition ${issue.path}: ${issue.message}`)
  }

  const instanceById = new Map(composition.patternInstances.map((instance) => [instance.id, instance]))
  const sceneCompositionById = new Map(composition.scenes.map((scene) => [scene.sceneId, scene]))
  const byCellId = { ...lookup.byCellId }
  const instanceIdByCellId = { ...(lookup.instanceIdByCellId ?? {}) }
  const compositionLayerByCellId = { ...(lookup.compositionLayerByCellId ?? {}) }
  const compositionPlacementIdByCellId = { ...(lookup.compositionPlacementIdByCellId ?? {}) }
  const compositionPropertyTracksBySceneId = { ...(lookup.compositionPropertyTracksBySceneId ?? {}) }
  const cells: ShowCell[] = []
  const scenes: ShowScene[] = []
  const lastDerivedSceneId = new Map<string, string>()
  const derivedCellIdByFlatCellId = new Map<string, string>()

  for (const scene of show.scenes) {
    const sceneComposition = sceneCompositionById.get(scene.id)
    const boundaries = new Set([0, scene.durationMs])
    for (const zone of sceneComposition?.zones ?? []) {
      for (const placement of zone.main) {
        boundaries.add(placement.startMs)
        boundaries.add(placement.startMs + placement.durationMs)
      }
      for (const layer of zone.overlays) {
        for (const placement of layer.placements) {
          boundaries.add(placement.startMs)
          boundaries.add(placement.startMs + placement.durationMs)
        }
      }
    }
    const ordered = [...boundaries].sort((a, b) => a - b)
    const intervals = ordered.slice(0, -1).map((startMs, index) => ({
      startMs,
      endMs: ordered[index + 1],
    })).filter((interval) => interval.endMs > interval.startMs)

    intervals.forEach((interval, intervalIndex) => {
      const isOnlyInterval = intervals.length === 1
      const isFinalInterval = intervalIndex === intervals.length - 1
      const activePlacementIds = new Set((sceneComposition?.zones ?? []).flatMap((zone) => [
        ...zone.main.filter((placement) => placementCovers(placement, interval.startMs)).map((placement) => placement.id),
        ...zone.overlays.flatMap((layer) => layer.placements
          .filter((placement) => placementCovers(placement, interval.startMs))
          .map((placement) => placement.id)),
      ]))
      const activePropertyTracks = (sceneComposition?.propertyTracks ?? []).filter((track) => (
        !('placementId' in track.target) || activePlacementIds.has(track.target.placementId)
      ))
      const sceneId = isOnlyInterval
        ? scene.id
        : `${scene.id}--local-${interval.startMs}-${interval.endMs}`
      scenes.push({
        ...scene,
        id: sceneId,
        name: isOnlyInterval ? scene.name : `${scene.name} ${interval.startMs}-${interval.endMs}ms`,
        durationMs: interval.endMs - interval.startMs,
        ...(isFinalInterval
          ? { transitionOut: scene.transitionOut }
          : { transitionOut: { kind: 'cut', durationMs: 0 } }),
      })
      if (activePropertyTracks.length) {
        compositionPropertyTracksBySceneId[sceneId] = {
          localTimeOffsetMs: interval.startMs,
          tracks: structuredClone(activePropertyTracks),
        }
      }
      if (isFinalInterval) lastDerivedSceneId.set(scene.id, sceneId)

      for (const zone of show.zones) {
        const zoneComposition = sceneComposition?.zones.find((candidate) => candidate.zoneId === zone.id)
        const main = zoneComposition?.main.find((candidate) => placementCovers(candidate, interval.startMs))
        const activeOverlays = (zoneComposition?.overlays ?? []).flatMap((layer, layerIndex, layers) => {
          const placement = layer.placements.find((candidate) => placementCovers(candidate, interval.startMs))
          return placement ? [{ placement, stackOrder: layers.length - layerIndex }] : []
        })
        const activePlacements: Array<{
          placement: ShowMainPlacement | ShowOverlayPlacement
          stackOrder: number
          opacity: number
        }> = [
          ...(main ? [{ placement: main, stackOrder: 0, opacity: 1 }] : []),
          ...activeOverlays.map(({ placement, stackOrder }) => ({ placement, stackOrder, opacity: placement.opacity })),
        ].sort((left, right) => left.stackOrder - right.stackOrder)

        for (const { placement, stackOrder, opacity } of activePlacements) {
          const instance = instanceById.get(placement.instanceId)!
          const cellId = `${placement.id}@${sceneId}`
          const source = lookup.byPatternInstanceId?.[instance.id]
          if (!source) throw new Error(`Show composition requires pattern source for instance "${instance.id}".`)
          cells.push({
            id: cellId,
            zoneId: zone.id,
            sceneId,
            sceneSpan: 1,
            zoneSpan: 1,
            pattern: { ...instance.pattern },
            patternName: instance.patternName,
            evaluationPolicy: instance.evaluationPolicy,
            adaptations: {
              mirror: placement.view.mirror,
              phase: placement.view.phase,
              brightness: placement.view.brightness,
              timeScale: instance.time.timeScale,
              timeOffsetMs: instance.time.timeOffsetMs,
              ...(instance.time.lightShutter ? { lightShutter: { ...instance.time.lightShutter } } : {}),
              ...(instance.time.steppedClock ? { steppedClock: { ...instance.time.steppedClock } } : {}),
            },
            restartOnEntry: false,
            ...(instance.controlTargets ? { controlTargets: { ...instance.controlTargets } } : {}),
            ...(placement.effects ? { effects: structuredClone(placement.effects) } : {}),
          })
          byCellId[cellId] = source
          instanceIdByCellId[cellId] = instance.id
          compositionLayerByCellId[cellId] = { stackOrder, opacity }
          compositionPlacementIdByCellId[cellId] = placement.id
          if (intervalIndex === 0 && stackOrder === 0) {
            const flatCell = flatCellAtSlot(show, zone.id, scene.id)
            if (flatCell) derivedCellIdByFlatCellId.set(flatCell.id, cellId)
          }
        }
      }
    })
  }

  const transitions = show.transitions?.map((transition) => remapTransition(
    transition,
    lastDerivedSceneId,
    derivedCellIdByFlatCellId,
  ))
  return {
    show: {
      ...show,
      scenes,
      cells,
      transitions,
      routingSwitches: show.routingSwitches.map((routingSwitch) => ({
        ...routingSwitch,
        afterSceneId: lastDerivedSceneId.get(routingSwitch.afterSceneId) ?? routingSwitch.afterSceneId,
      })),
      composition: undefined,
    },
    lookup: {
      ...lookup,
      byCellId,
      instanceIdByCellId,
      compositionLayerByCellId,
      compositionPlacementIdByCellId,
      compositionPropertyTracksBySceneId,
    },
  }
}

function placementCovers(placement: ShowMainPlacement, atMs: number): boolean {
  return placement.startMs <= atMs && placement.startMs + placement.durationMs > atMs
}

function remapTransition(
  transition: ShowBoundaryTransition,
  lastDerivedSceneId: Map<string, string>,
  derivedCellIdByFlatCellId: Map<string, string>,
): ShowBoundaryTransition {
  const propertyTransitions = transition.propertyTransitions
  return {
    ...structuredClone(transition),
    afterSceneId: lastDerivedSceneId.get(transition.afterSceneId) ?? transition.afterSceneId,
    ...(propertyTransitions
      ? {
          propertyTransitions: {
            ...structuredClone(propertyTransitions),
            ...(propertyTransitions.timeScale
              ? { timeScale: remapPropertyStart(propertyTransitions.timeScale, derivedCellIdByFlatCellId) }
              : {}),
            ...(propertyTransitions.brightness
              ? { brightness: remapPropertyStart(propertyTransitions.brightness, derivedCellIdByFlatCellId) }
              : {}),
            ...(propertyTransitions.controls
              ? {
                  controls: Object.fromEntries(Object.entries(propertyTransitions.controls).map(([name, descriptor]) => (
                    [name, remapPropertyStart(descriptor, derivedCellIdByFlatCellId)]
                  ))),
                }
              : {}),
            ...(propertyTransitions.effects
              ? {
                  effects: Object.fromEntries(Object.entries(propertyTransitions.effects).map(([effectId, parameters]) => (
                    [effectId, Object.fromEntries(Object.entries(parameters).map(([name, descriptor]) => (
                      [name, remapPropertyStart(descriptor, derivedCellIdByFlatCellId)]
                    )))]
                  ))),
                }
              : {}),
          },
        }
      : {}),
  }
}

function remapPropertyStart<T extends { fromByCellId: Record<string, number> }>(
  descriptor: T,
  derivedCellIdByFlatCellId: Map<string, string>,
): T {
  return {
    ...structuredClone(descriptor),
    fromByCellId: Object.fromEntries(Object.entries(descriptor.fromByCellId).map(([cellId, value]) => (
      [derivedCellIdByFlatCellId.get(cellId) ?? cellId, value]
    ))),
  }
}

function flatCellAtSlot(show: ShowRecord, zoneId: string, sceneId: string): ShowCell | undefined {
  const zoneIndex = show.zones.findIndex((zone) => zone.id === zoneId)
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === sceneId)
  if (zoneIndex === -1 || sceneIndex === -1) return undefined
  return show.cells.find((cell) => {
    const cellZoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
    const cellSceneIndex = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
    return cellZoneIndex !== -1
      && cellSceneIndex !== -1
      && zoneIndex >= cellZoneIndex
      && zoneIndex < cellZoneIndex + Math.max(1, cell.zoneSpan ?? 1)
      && sceneIndex >= cellSceneIndex
      && sceneIndex < cellSceneIndex + Math.max(1, cell.sceneSpan)
  })
}
