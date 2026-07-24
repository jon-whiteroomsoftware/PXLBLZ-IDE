import {
  normalizeShowTransitionState,
  projectShowTimeline,
  showRoutingTransitionAfter,
  splitShowAtTime,
} from './showModel'
import { multiSegmentLogicalClips } from './showClipInvariant'
import { validateShowComposition } from './showCompositionModel'
import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowCompositionV1,
  ShowPropertyTransition,
  ShowPropertyTransitions,
  ShowRecord,
  ShowRoutingLayout,
  ShowSceneComposition,
  ShowZone,
} from './personalContentRecords'

export interface ShowLayoutInterval {
  /** Stable while the first internal Scene remains the occurrence entry. */
  id: string
  layoutId: string
  layoutName: string
  zoneIds: string[]
  startMs: number
  endMs: number
  durationMs: number
  sceneIds: string[]
}

export interface ShowLayoutIntervalInsertInput {
  atMs: number
  durationMs: number
  layoutId: string
}

export interface ShowLayoutIntervalAppendInput {
  durationMs: number
  layoutId: string
}

/**
 * Project persisted internal Scene/routing state into the author-facing hard
 * Zone Layout occurrences. Every routing event starts a new occurrence, even
 * when it intentionally reuses the same Layout definition.
 */
export function projectShowLayoutIntervals(show: ShowRecord): ShowLayoutInterval[] {
  const normalized = normalizeShowTransitionState(show)
  const timeline = projectShowTimeline(normalized)
  const layoutById = new Map(normalized.routingLayouts.map((layout) => [layout.id, layout]))
  let activeLayoutId = normalized.routingLayouts[0]?.id
  if (!activeLayoutId) return []

  const intervals: ShowLayoutInterval[] = []
  for (const [sceneIndex, sceneRange] of timeline.scenes.entries()) {
    const layout = layoutById.get(activeLayoutId) ?? normalized.routingLayouts[0]
    const previous = intervals[intervals.length - 1]
    const startsOccurrence = sceneIndex === 0
      || Boolean(showRoutingTransitionAfter(normalized, normalized.scenes[sceneIndex - 1].id))
    if (startsOccurrence || !previous) {
      const startMs = previous?.endMs ?? sceneRange.startMs
      intervals.push({
        id: `layout-occurrence-${sceneRange.sceneId}`,
        layoutId: layout.id,
        layoutName: layout.name,
        zoneIds: layout.logical?.zoneIds ?? layout.zones.map((zone) => zone.zoneId),
        startMs,
        endMs: sceneRange.endMs,
        durationMs: sceneRange.endMs - startMs,
        sceneIds: [sceneRange.sceneId],
      })
    } else {
      previous.sceneIds.push(sceneRange.sceneId)
      previous.endMs = sceneRange.endMs
      previous.durationMs = previous.endMs - previous.startMs
    }
    const outgoing = showRoutingTransitionAfter(normalized, sceneRange.sceneId)
    if (outgoing?.layoutId && layoutById.has(outgoing.layoutId)) activeLayoutId = outgoing.layoutId
  }
  const last = intervals[intervals.length - 1]
  if (last) {
    last.endMs = timeline.durationMs
    last.durationMs = last.endMs - last.startMs
  }
  return intervals
}

/** Resolve the author-facing Layout occurrence that owns a Show instant. */
export function showLayoutIntervalAtTime(
  intervals: ShowLayoutInterval[],
  timeMs: number,
): ShowLayoutInterval | null {
  if (intervals.length === 0 || !Number.isFinite(timeMs)) return null
  return intervals.find((interval) => timeMs >= interval.startMs && timeMs < interval.endMs)
    ?? [...intervals].reverse().find((interval) => timeMs >= interval.startMs)
    ?? intervals[0]
}

/** Choose a valid authoring Zone from the Layout occurrence at this instant. */
export function showLayoutZoneIdAtTime(
  show: ShowRecord,
  timeMs: number,
  preferredZoneId?: string | null,
): string | null {
  const interval = showLayoutIntervalAtTime(projectShowLayoutIntervals(show), timeMs)
  if (!interval) return null
  if (preferredZoneId && interval.zoneIds.includes(preferredZoneId)) return preferredZoneId
  return interval.zoneIds[0] ?? null
}

/** Place an occurrence on the full-width timeline canvas, independent of zoom. */
export function showLayoutIntervalPercentBounds(
  interval: Pick<ShowLayoutInterval, 'startMs' | 'endMs'>,
  totalMs: number,
): { left: number; width: number } {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return { left: 0, width: 0 }
  const start = Math.min(totalMs, Math.max(0, interval.startMs))
  const end = Math.min(totalMs, Math.max(start, interval.endMs))
  return {
    left: start / totalMs * 100,
    width: (end - start) / totalMs * 100,
  }
}

export function appendShowLayoutInterval(
  show: ShowRecord,
  input: ShowLayoutIntervalAppendInput,
): ShowRecord {
  return insertShowLayoutInterval(show, {
    ...input,
    atMs: projectShowTimeline(show).durationMs,
  })
}

/**
 * Insert an empty Layout occurrence. Inserting inside a hold delegates to the
 * established atomic Scene/composition split, then inserts a blank interval at
 * that new hard boundary. Transition windows and invalid split points are no-ops.
 */
export function insertShowLayoutInterval(
  inputShow: ShowRecord,
  input: ShowLayoutIntervalInsertInput,
): ShowRecord {
  if (!validDuration(input.durationMs) || !inputShow.routingLayouts.some((layout) => layout.id === input.layoutId)) {
    return inputShow
  }
  const boundary = resolveInsertionBoundary(inputShow, input.atMs)
  if (!boundary) return inputShow
  if (logicalClipCrossesSceneBoundary(boundary.show.composition, boundary.show.scenes, boundary.sceneIndex)) {
    return inputShow
  }
  return insertBlankIntervalAtSceneIndex(boundary.show, boundary.sceneIndex, input.durationMs, input.layoutId)
}

export function duplicateShowLayoutInterval(
  show: ShowRecord,
  intervalId: string,
  input: { withContent: boolean },
): ShowRecord {
  const interval = projectShowLayoutIntervals(show).find((candidate) => candidate.id === intervalId)
  if (!interval) return show
  if (logicalClipPartiallyInsideScenes(show.composition, new Set(interval.sceneIds))) return show
  if (!input.withContent) {
    const lastSceneIndex = show.scenes.findIndex((scene) => scene.id === interval.sceneIds[interval.sceneIds.length - 1])
    return insertBlankIntervalAtSceneIndex(show, lastSceneIndex + 1, interval.durationMs, interval.layoutId)
  }
  return duplicateIntervalWithContent(show, interval)
}

/** Clone one occurrence's topology and Zone identities, leaving other uses alone. */
export function makeShowLayoutIntervalUnique(show: ShowRecord, intervalId: string): ShowRecord {
  const intervals = projectShowLayoutIntervals(show)
  const intervalIndex = intervals.findIndex((candidate) => candidate.id === intervalId)
  if (intervalIndex < 0) return show
  const interval = intervals[intervalIndex]
  const sourceLayout = show.routingLayouts.find((layout) => layout.id === interval.layoutId)
  if (!sourceLayout) return show

  const occurrenceSceneIds = new Set(interval.sceneIds)
  if (logicalClipPartiallyInsideScenes(show.composition, occurrenceSceneIds)) return show

  const usedIds = recordIds(show)
  const layoutId = uniqueId(usedIds, `${sourceLayout.id}-copy`)
  const zoneIdMap = new Map<string, string>()
  const zones: ShowZone[] = sourceLayout.zones.flatMap((layoutZone) => {
    const source = show.zones.find((zone) => zone.id === layoutZone.zoneId)
    if (!source) return []
    const id = uniqueId(usedIds, `${source.id}-copy`)
    zoneIdMap.set(source.id, id)
    return [{ ...source, id }]
  })
  const layout: ShowRoutingLayout = {
    ...cloneJson(sourceLayout),
    id: layoutId,
    name: uniqueName(`${sourceLayout.name} copy`, show.routingLayouts.map((candidate) => candidate.name)),
    zones: sourceLayout.zones.map((zone) => ({ ...cloneJson(zone), zoneId: zoneIdMap.get(zone.zoneId) ?? zone.zoneId })),
    ...(sourceLayout.logical ? {
      logical: {
        ...cloneJson(sourceLayout.logical),
        zoneIds: sourceLayout.logical.zoneIds.map((zoneId) => zoneIdMap.get(zoneId) ?? zoneId),
      } as ShowRoutingLayout['logical'],
    } : {}),
  }
  const composition = show.composition
    ? remapOccurrenceZones(show.composition, occurrenceSceneIds, zoneIdMap, zones)
    : show.composition
  const cells = show.cells.map((cell) => (
    occurrenceSceneIds.has(cell.sceneId) && zoneIdMap.has(cell.zoneId)
      ? { ...cell, zoneId: zoneIdMap.get(cell.zoneId)! }
      : cell
  ))
  const previousInterval = intervals[intervalIndex - 1]
  let transitions = cloneJson(show.transitions)
  let routingLayouts = [...show.routingLayouts, layout]
  if (previousInterval) {
    const precedingSceneId = previousInterval.sceneIds[previousInterval.sceneIds.length - 1]
    transitions = transitions.map((transition) => (
      transition.kind === 'routing' && transition.afterSceneId === precedingSceneId
        ? { ...transition, layoutId }
        : transition
    ))
  } else {
    routingLayouts = [layout, ...show.routingLayouts]
  }

  return normalizeShowTransitionState({
    ...show,
    zones: [...show.zones, ...zones],
    routingLayouts,
    transitions,
    cells,
    ...(composition ? { composition } : {}),
    updatedAt: nextUpdatedAt(show),
  })
}

function logicalClipCrossesSceneBoundary(
  composition: ShowCompositionV1 | undefined,
  scenes: ShowRecord['scenes'],
  sceneIndex: number,
): boolean {
  if (!composition || sceneIndex <= 0 || sceneIndex >= scenes.length) return false
  const sceneIndexById = new Map(scenes.map((scene, index) => [scene.id, index]))
  return multiSegmentLogicalClips(composition).some((logicalClip) => {
    const indexes = logicalClip.segments.flatMap((segment) => {
      const index = sceneIndexById.get(segment.sceneId)
      return index == null ? [] : [index]
    })
    return indexes.some((index) => index < sceneIndex)
      && indexes.some((index) => index >= sceneIndex)
  })
}

function logicalClipPartiallyInsideScenes(
  composition: ShowCompositionV1 | undefined,
  sceneIds: Set<string>,
): boolean {
  if (!composition) return false
  return multiSegmentLogicalClips(composition).some((logicalClip) => (
    logicalClip.segments.some((segment) => sceneIds.has(segment.sceneId))
    && logicalClip.segments.some((segment) => !sceneIds.has(segment.sceneId))
  ))
}

function resolveInsertionBoundary(
  show: ShowRecord,
  atMs: number,
): { show: ShowRecord; sceneIndex: number } | null {
  if (!Number.isFinite(atMs)) return null
  const timeline = projectShowTimeline(show)
  const rounded = Math.round(atMs)
  if (rounded < 0 || rounded > timeline.durationMs) return null
  if (rounded === 0) return { show, sceneIndex: 0 }
  if (rounded === timeline.durationMs) return { show, sceneIndex: show.scenes.length }
  if (timeline.transitions.some((transition) => (
    transition.durationMs > 0 && rounded >= transition.startMs && rounded <= transition.endMs
  ))) return null

  const exactStart = timeline.scenes.findIndex((scene) => scene.startMs === rounded)
  if (exactStart >= 0) return { show, sceneIndex: exactStart }
  const exactEnd = timeline.scenes.findIndex((scene) => scene.endMs === rounded)
  if (exactEnd >= 0) return { show, sceneIndex: exactEnd + 1 }

  const split = splitShowAtTime(show, rounded)
  if (split === show) return null
  const splitTimeline = projectShowTimeline(split)
  const sceneIndex = splitTimeline.scenes.findIndex((scene) => scene.startMs === rounded)
  return sceneIndex >= 0 ? { show: split, sceneIndex } : null
}

function insertBlankIntervalAtSceneIndex(
  inputShow: ShowRecord,
  sceneIndex: number,
  durationMs: number,
  layoutId: string,
): ShowRecord {
  if (sceneIndex < 0 || sceneIndex > inputShow.scenes.length || !validDuration(durationMs)) return inputShow
  const show = normalizeShowTransitionState(inputShow)
  const usedIds = recordIds(show)
  const sceneId = uniqueId(usedIds, 'scene-1')
  const scene = {
    id: sceneId,
    name: uniqueName('Layout interval', show.scenes.map((candidate) => candidate.name)),
    durationMs: Math.round(durationMs),
  }
  const previousScene = show.scenes[sceneIndex - 1]
  const nextScene = show.scenes[sceneIndex]
  const previousLayoutId = sceneIndex > 0 ? layoutForSceneIndex(show, sceneIndex - 1) : null
  const nextLayoutId = nextScene ? layoutForSceneIndex(show, sceneIndex) : null
  const scenes = [...show.scenes.slice(0, sceneIndex), scene, ...show.scenes.slice(sceneIndex)]
  const cells = splitCompatibilityCellsForInsertion(show, sceneIndex, usedIds)
  const composition = show.composition
    ? insertBlankCompositionScene(show.composition, sceneIndex, sceneId, show.zones)
    : show.composition

  let routingLayouts = show.routingLayouts
  const outgoingBoundary = previousScene
    ? cloneJson(show.transitions.filter((transition) => transition.afterSceneId === previousScene.id))
    : []
  const transitions = cloneJson(show.transitions).filter((transition) => (
    !previousScene || transition.afterSceneId !== previousScene.id
  ))
  if (!previousScene) {
    const selected = routingLayouts.find((layout) => layout.id === layoutId)!
    routingLayouts = [selected, ...routingLayouts.filter((layout) => layout.id !== layoutId)]
  } else {
    transitions.push(cutAfter(previousScene.id), routingAfter(previousScene.id, layoutId))
  }
  if (nextScene) {
    const movedBoundary = outgoingBoundary.map((transition) => ({
      ...transition,
      id: uniqueId(usedIds, `${transition.id}-moved`),
      afterSceneId: sceneId,
    }))
    transitions.push(...movedBoundary)
    if (!movedBoundary.some((transition) => transition.kind !== 'routing')) transitions.push(cutAfter(sceneId))
    if (!movedBoundary.some((transition) => transition.kind === 'routing')) {
      transitions.push(routingAfter(sceneId, nextLayoutId ?? previousLayoutId ?? layoutId))
    }
  }

  const inserted = normalizeShowTransitionState({
    ...show,
    scenes,
    cells,
    routingLayouts,
    transitions,
    ...(composition ? { composition } : {}),
    updatedAt: nextUpdatedAt(show),
  })
  if (inserted.composition && validateShowComposition(inserted, inserted.composition).length > 0) {
    return show
  }
  return inserted
}

function duplicateIntervalWithContent(show: ShowRecord, interval: ShowLayoutInterval): ShowRecord {
  show = normalizeShowTransitionState(show)
  const sourceSceneIds = new Set(interval.sceneIds)
  const firstIndex = show.scenes.findIndex((scene) => scene.id === interval.sceneIds[0])
  const lastIndex = show.scenes.findIndex((scene) => scene.id === interval.sceneIds[interval.sceneIds.length - 1])
  if (firstIndex < 0 || lastIndex < firstIndex) return show
  const insertionIndex = lastIndex + 1
  const usedIds = recordIds(show)
  const sceneIdMap = new Map<string, string>()
  const duplicateScenes = show.scenes.slice(firstIndex, lastIndex + 1).map((scene) => {
    const id = uniqueId(usedIds, `${scene.id}-copy`)
    sceneIdMap.set(scene.id, id)
    return { ...cloneJson(scene), id, name: uniqueName(`${scene.name} copy`, show.scenes.map((candidate) => candidate.name)) }
  })
  const scenes = [...show.scenes.slice(0, insertionIndex), ...duplicateScenes, ...show.scenes.slice(insertionIndex)]

  const cellIdMap = new Map<string, string>()
  const duplicateCells = show.cells.flatMap((cell): ShowCell[] => {
    if (!sourceSceneIds.has(cell.sceneId)) return []
    const id = uniqueId(usedIds, `${cell.id}-copy`)
    cellIdMap.set(cell.id, id)
    return [{ ...cloneJson(cell), id, sceneId: sceneIdMap.get(cell.sceneId)!, restartOnEntry: true }]
  })
  const cells = [...show.cells, ...duplicateCells]
  const composition = show.composition
    ? duplicateCompositionScenes(show.composition, interval.sceneIds, sceneIdMap, insertionIndex, usedIds)
    : show.composition

  const sourceLastId = interval.sceneIds[interval.sceneIds.length - 1]
  const duplicateLastId = sceneIdMap.get(sourceLastId)!
  const outgoing = show.transitions.filter((transition) => transition.afterSceneId === sourceLastId)
  const internalIds = new Set(interval.sceneIds.slice(0, -1))
  const transitions = show.transitions.filter((transition) => transition.afterSceneId !== sourceLastId)
  transitions.push(cutAfter(sourceLastId), routingAfter(sourceLastId, interval.layoutId))
  transitions.push(...show.transitions.flatMap((transition) => {
    if (!internalIds.has(transition.afterSceneId)) return []
    return [{
      ...cloneJson(transition),
      id: uniqueId(usedIds, `${transition.id}-copy`),
      afterSceneId: sceneIdMap.get(transition.afterSceneId)!,
      ...(transition.propertyTransitions
        ? { propertyTransitions: remapPropertyTransitionCellIds(transition.propertyTransitions, cellIdMap) }
        : {}),
    }]
  }))
  if (insertionIndex < show.scenes.length) {
    transitions.push(...outgoing.map((transition) => ({
      ...cloneJson(transition),
      id: uniqueId(usedIds, `${transition.id}-copy`),
      afterSceneId: duplicateLastId,
      ...(transition.propertyTransitions
        ? { propertyTransitions: remapPropertyTransitionCellIds(transition.propertyTransitions, cellIdMap) }
        : {}),
    })))
  }

  const duplicated = normalizeShowTransitionState({
    ...show,
    scenes,
    cells,
    transitions,
    ...(composition ? { composition } : {}),
    updatedAt: nextUpdatedAt(show),
  })
  if (duplicated.composition && validateShowComposition(duplicated, duplicated.composition).length > 0) {
    return show
  }
  return duplicated
}

function remapPropertyTransitionCellIds(
  transitions: ShowPropertyTransitions,
  cellIdMap: Map<string, string>,
): ShowPropertyTransitions {
  const remap = (transition: ShowPropertyTransition): ShowPropertyTransition => ({
    ...cloneJson(transition),
    fromByCellId: Object.fromEntries(Object.entries(transition.fromByCellId).map(([cellId, value]) => (
      [cellIdMap.get(cellId) ?? cellId, value]
    ))),
  })
  return {
    ...cloneJson(transitions),
    ...(transitions.timeScale ? { timeScale: remap(transitions.timeScale) } : {}),
    ...(transitions.brightness ? { brightness: remap(transitions.brightness) } : {}),
    ...(transitions.controls ? {
      controls: Object.fromEntries(Object.entries(transitions.controls).map(([name, transition]) => (
        [name, remap(transition)]
      ))),
    } : {}),
    ...(transitions.transform ? {
      transform: Object.fromEntries(Object.entries(transitions.transform).map(([property, transition]) => (
        [property, remap(transition)]
      ))),
    } : {}),
    ...(transitions.effects ? {
      effects: Object.fromEntries(Object.entries(transitions.effects).map(([effectId, parameters]) => (
        [effectId, Object.fromEntries(Object.entries(parameters).map(([name, transition]) => (
          [name, remap(transition)]
        )))]
      ))),
    } : {}),
  }
}

function duplicateCompositionScenes(
  composition: ShowCompositionV1,
  sourceSceneIds: string[],
  sceneIdMap: Map<string, string>,
  insertionIndex: number,
  usedIds: Set<string>,
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  const sourceSet = new Set(sourceSceneIds)
  const sourceScenes = sourceSceneIds.map((sceneId) => draft.scenes.find((scene) => scene.sceneId === sceneId)).filter(Boolean) as ShowSceneComposition[]
  const referencedInstanceIds = new Set(sourceScenes.flatMap((scene) => [
    ...scene.zones.flatMap((zone) => [
      ...zone.main.map((placement) => placement.instanceId),
      ...zone.overlays.flatMap((layer) => layer.placements.map((placement) => placement.instanceId)),
    ]),
    ...(scene.propertyTracks ?? []).flatMap((track) => 'instanceId' in track.target ? [track.target.instanceId] : []),
  ]))
  const instanceIdMap = new Map<string, string>()
  const instances = draft.patternInstances.flatMap((instance) => {
    if (!referencedInstanceIds.has(instance.id)) return []
    const id = uniqueId(usedIds, `${instance.id}-copy`)
    instanceIdMap.set(instance.id, id)
    return [{ ...cloneJson(instance), id }]
  })
  const placementEntries = sourceScenes.flatMap((scene) => scene.zones.flatMap((zone) => [
    ...zone.main,
    ...zone.overlays.flatMap((layer) => layer.placements),
  ]).map((placement) => ({
    placement,
    destinationSceneId: sceneIdMap.get(scene.sceneId)!,
  })))
  const entriesByLogicalClipId = new Map<string, typeof placementEntries>()
  for (const entry of placementEntries) {
    const logicalClipId = entry.placement.logicalClipId ?? entry.placement.id
    entriesByLogicalClipId.set(logicalClipId, [
      ...(entriesByLogicalClipId.get(logicalClipId) ?? []),
      entry,
    ])
  }
  const placementIdMap = new Map<string, string>()
  const logicalClipIdMap = new Map<string, string>()
  for (const [logicalClipId, entries] of entriesByLogicalClipId) {
    const rootId = uniqueLogicalClipRootId(
      usedIds,
      `${logicalClipId}-copy`,
      entries.slice(1).map((entry) => entry.destinationSceneId),
    )
    logicalClipIdMap.set(logicalClipId, rootId)
    entries.forEach((entry, index) => {
      const id = index === 0
        ? rootId
        : `${rootId}--span-${entry.destinationSceneId}`
      usedIds.add(id)
      placementIdMap.set(entry.placement.id, id)
    })
  }
  const duplicates = sourceScenes.map((source) => {
    const scene = cloneJson(source)
    scene.sceneId = sceneIdMap.get(source.sceneId)!
    scene.zones = scene.zones.map((zone) => ({
      ...zone,
      main: zone.main.map((placement) => {
        const id = placementIdMap.get(placement.id)!
        const logicalClipId = logicalClipIdMap.get(placement.logicalClipId ?? placement.id)!
        return {
          ...placement,
          id,
          logicalClipId: id === logicalClipId ? undefined : logicalClipId,
          instanceId: instanceIdMap.get(placement.instanceId) ?? placement.instanceId,
        }
      }),
      overlays: zone.overlays.map((layer) => ({
        ...layer,
        id: uniqueId(usedIds, `${layer.id}-copy`),
        placements: layer.placements.map((placement) => {
          const id = placementIdMap.get(placement.id)!
          const logicalClipId = logicalClipIdMap.get(placement.logicalClipId ?? placement.id)!
          return {
            ...placement,
            id,
            logicalClipId: id === logicalClipId ? undefined : logicalClipId,
            instanceId: instanceIdMap.get(placement.instanceId) ?? placement.instanceId,
          }
        }),
      })),
    }))
    scene.propertyTracks = scene.propertyTracks?.map((track) => ({
      ...track,
      id: uniqueId(usedIds, `${track.id}-copy`),
      target: 'placementId' in track.target
        ? { ...track.target, placementId: placementIdMap.get(track.target.placementId) ?? track.target.placementId }
        : { ...track.target, instanceId: instanceIdMap.get(track.target.instanceId) ?? track.target.instanceId },
      keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, id: uniqueId(usedIds, `${keyframe.id}-copy`) })),
    }))
    return scene
  })
  draft.patternInstances.push(...instances)
  const sourceIndexes = draft.scenes.map((scene, index) => sourceSet.has(scene.sceneId) ? index : -1).filter((index) => index >= 0)
  const actualInsertionIndex = sourceIndexes.length > 0 ? Math.max(...sourceIndexes) + 1 : insertionIndex
  draft.scenes.splice(actualInsertionIndex, 0, ...duplicates)
  return draft
}

function remapOccurrenceZones(
  composition: ShowCompositionV1,
  occurrenceSceneIds: Set<string>,
  zoneIdMap: Map<string, string>,
  newZones: ShowZone[],
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  draft.scenes = draft.scenes.map((scene) => {
    const zones = scene.zones.map((zone) => (
      occurrenceSceneIds.has(scene.sceneId) && zoneIdMap.has(zone.zoneId)
        ? { ...zone, zoneId: zoneIdMap.get(zone.zoneId)! }
        : zone
    ))
    for (const zone of newZones) {
      if (!zones.some((candidate) => candidate.zoneId === zone.id)) zones.push({ zoneId: zone.id, main: [], overlays: [] })
    }
    return { ...scene, zones }
  })
  return draft
}

function insertBlankCompositionScene(
  composition: ShowCompositionV1,
  sceneIndex: number,
  sceneId: string,
  zones: ShowZone[],
): ShowCompositionV1 {
  const draft = cloneJson(composition)
  draft.scenes.splice(sceneIndex, 0, {
    sceneId,
    zones: zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
  })
  return draft
}

function splitCompatibilityCellsForInsertion(show: ShowRecord, sceneIndex: number, usedIds: Set<string>): ShowCell[] {
  const sceneIndexById = new Map(show.scenes.map((scene, index) => [scene.id, index]))
  return show.cells.flatMap((cell) => {
    const start = sceneIndexById.get(cell.sceneId)
    if (start == null) return [cell]
    const end = start + Math.max(1, cell.sceneSpan) - 1
    if (!(start < sceneIndex && sceneIndex <= end)) return [cell]
    const rightScene = show.scenes[sceneIndex]
    if (!rightScene) return [cell]
    const leftSpan = sceneIndex - start
    const rightSpan = end - sceneIndex + 1
    return [
      { ...cell, sceneSpan: leftSpan },
      {
        ...cloneJson(cell),
        id: uniqueId(usedIds, `${cell.id}-split`),
        sceneId: rightScene.id,
        sceneSpan: rightSpan,
        restartOnEntry: false,
      },
    ]
  })
}

function layoutForSceneIndex(show: ShowRecord, targetIndex: number): string {
  let layoutId = show.routingLayouts[0]?.id ?? ''
  for (let index = 0; index < targetIndex; index += 1) {
    const transition = showRoutingTransitionAfter(show, show.scenes[index].id)
    if (transition?.layoutId) layoutId = transition.layoutId
  }
  return layoutId
}

function cutAfter(afterSceneId: string): ShowBoundaryTransition {
  return {
    id: `transition-${afterSceneId}`,
    afterSceneId,
    kind: 'cut',
    durationMs: 0,
    easing: { curve: 'linear' },
  }
}

function routingAfter(afterSceneId: string, layoutId: string): ShowBoundaryTransition {
  return {
    id: `routing-${afterSceneId}`,
    afterSceneId,
    kind: 'routing',
    durationMs: 0,
    easing: { curve: 'linear' },
    layoutId,
  }
}

function validDuration(durationMs: number): boolean {
  return Number.isFinite(durationMs) && Math.round(durationMs) >= 1
}

function recordIds(show: ShowRecord): Set<string> {
  return new Set([
    ...show.scenes.map((scene) => scene.id),
    ...show.zones.map((zone) => zone.id),
    ...show.cells.map((cell) => cell.id),
    ...show.routingLayouts.map((layout) => layout.id),
    ...show.transitions.map((transition) => transition.id),
    ...(show.composition?.patternInstances.map((instance) => instance.id) ?? []),
    ...(show.composition?.scenes.flatMap((scene) => [
      ...scene.zones.flatMap((zone) => [
        ...zone.main.map((placement) => placement.id),
        ...zone.overlays.flatMap((layer) => [layer.id, ...layer.placements.map((placement) => placement.id)]),
      ]),
      ...(scene.propertyTracks ?? []).flatMap((track) => [track.id, ...track.keyframes.map((keyframe) => keyframe.id)]),
    ]) ?? []),
  ])
}

function uniqueId(ids: Set<string>, preferred: string): string {
  if (!ids.has(preferred)) {
    ids.add(preferred)
    return preferred
  }
  const match = /^(.*?)(\d+)$/.exec(preferred)
  const stem = match?.[1] ?? `${preferred}-`
  let suffix = match ? Number(match[2]) + 1 : 2
  while (ids.has(`${stem}${suffix}`)) suffix += 1
  const id = `${stem}${suffix}`
  ids.add(id)
  return id
}

function uniqueLogicalClipRootId(
  ids: Set<string>,
  preferred: string,
  continuationSceneIds: string[],
): string {
  const match = /^(.*?)(\d+)$/.exec(preferred)
  const stem = match?.[1] ?? `${preferred}-`
  let suffix = match ? Number(match[2]) : 1
  let candidate = preferred
  while (
    ids.has(candidate)
    || continuationSceneIds.some((sceneId) => ids.has(`${candidate}--span-${sceneId}`))
  ) {
    suffix += 1
    candidate = `${stem}${suffix}`
  }
  ids.add(candidate)
  continuationSceneIds.forEach((sceneId) => ids.add(`${candidate}--span-${sceneId}`))
  return candidate
}

function uniqueName(preferred: string, names: string[]): string {
  if (!names.includes(preferred)) return preferred
  let suffix = 2
  while (names.includes(`${preferred} ${suffix}`)) suffix += 1
  return `${preferred} ${suffix}`
}

function nextUpdatedAt(show: ShowRecord): number {
  return Math.max(Date.now(), show.updatedAt + 1)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
