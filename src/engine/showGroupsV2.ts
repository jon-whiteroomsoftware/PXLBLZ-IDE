import type { ShowGroupDefinition, ShowGroupOccurrence, ShowPatternInstance, ShowRecord } from './personalContentRecords'
import type { ShowClipV2, ShowGroupDefinitionV2, ShowGroupOccurrenceV2, ShowPropertyTargetV2, ShowRecordV2 } from './showCompositionV2'
import { clipAppearance, convertPropertyTarget } from './showV2ValueConversion'

export function groupDuration(definition: ShowGroupDefinitionV2): number {
  return Math.max(0, ...definition.clips.map(clip => clip.startMs + clip.durationMs))
}

export function convertGroupDefinition(definition: ShowGroupDefinition): ShowGroupDefinitionV2 {
  const ranks = [...new Set(definition.placements.map(placement => placement.layerOffset))].sort((a, b) => a - b)
  const layers = ranks.map(rank => ({ id: `${definition.id}:layer:${rank}`, name: `Layer ${rank}`, rank }))
  const durationMs = Math.max(...definition.placements.map(clip => clip.startMs + clip.durationMs))
  return {
    id: definition.id, name: definition.name, patternInstances: structuredClone(definition.patternInstances), layers,
    clips: definition.placements.map(clip => ({
      id: clip.id, instanceId: clip.instanceId, layerId: layers.find(layer => layer.rank === clip.layerOffset)!.id,
      startMs: clip.startMs, durationMs: clip.durationMs, entryPolicy: 'continue', zoneSampleMode: 'span',
      appearance: { keys: [{ id: `${clip.id}:appearance:1`, timeMs: clip.startMs, value: clipAppearance(clip) }] },
    })),
    transitions: structuredClone(definition.transitions ?? []),
    propertyTracks: (definition.propertyTracks ?? []).map(track => ({
      ...structuredClone(track), activeStartMs: 0, activeDurationMs: durationMs,
      target: convertPropertyTarget(track.target, new Map(definition.placements.map(clip => [clip.id, clip.id]))),
    })),
  }
}

export function convertGroupOccurrence(
  source: ShowRecord,
  occurrence: ShowGroupOccurrence,
  record: ShowRecordV2,
  sceneStartMs: number,
  layerIdByOwner: Map<string, string>,
): ShowGroupOccurrenceV2 {
  const definition = record.composition.groupDefinitions.find(definition => definition.id === occurrence.definitionId)!
  const startMs = sceneStartMs + occurrence.startMs
  const layout = record.composition.layoutOccurrences.find(layout => layout.startMs <= startMs && layout.startMs + layout.durationMs > startMs)!
  const zone = source.composition!.scenes.find(scene => scene.sceneId === occurrence.sceneId)!.zones.find(zone => zone.zoneId === occurrence.zoneId)!
  const sceneIndex = source.scenes.findIndex(scene => scene.id === occurrence.sceneId)
  const incoming = source.transitions.find(transition => transition.afterSceneId === source.scenes[sceneIndex - 1]?.id && transition.kind !== 'cut' && transition.kind !== 'routing')?.durationMs ?? 0
  const outgoing = source.transitions.find(transition => transition.afterSceneId === occurrence.sceneId && transition.kind !== 'cut' && transition.kind !== 'routing')?.durationMs ?? 0
  return {
    id: occurrence.id, definitionId: occurrence.definitionId, layoutOccurrenceId: layout.id, zoneId: occurrence.zoneId,
    startMs, translationX: occurrence.translationX, translationY: occurrence.translationY,
    instanceBindings: Object.fromEntries(definition.patternInstances.map(instance => [instance.id, `${occurrence.id}:${instance.id}`])),
    trackActivation: { startMs: sceneStartMs - incoming, durationMs: source.scenes[sceneIndex].durationMs + incoming + outgoing },
    layerBindings: definition.layers.map(layer => {
      const rank = occurrence.baseLayer + layer.rank
      const owner = rank === 0 ? 'main' : zone.overlays[zone.overlays.length - rank].id
      return { definitionLayerId: layer.id, layerId: layerIdByOwner.get(`${occurrence.sceneId}:${occurrence.zoneId}:${owner}`)! }
    }),
  }
}

export function groupRuntimeBindings(record: ShowRecordV2): Array<{ runtimeId: string; definitionId: string; sharedDefault: boolean; instance: ShowPatternInstance }> {
  return record.composition.groupOccurrences.flatMap(occurrence => {
    const definition = record.composition.groupDefinitions.find(definition => definition.id === occurrence.definitionId)!
    return definition.patternInstances.map(instance => ({
      runtimeId: occurrence.instanceBindings?.[instance.id] ?? `group:${JSON.stringify([definition.id, instance.id])}`,
      definitionId: definition.id, sharedDefault: occurrence.instanceBindings?.[instance.id] === undefined, instance,
    }))
  })
}

/** Transient compiler projection; Group definitions and bindings remain authored. */
export function materializeShowGroupsV2(record: ShowRecordV2): ShowRecordV2 {
  const expanded = structuredClone(record)
  const composition = expanded.composition
  for (const binding of groupRuntimeBindings(record)) {
    if (binding.sharedDefault && record.composition.patternInstances.some(instance => instance.id === binding.runtimeId)) throw new Error('Default Group runtime identity collides with an ordinary Pattern instance.')
    const value = { ...structuredClone(binding.instance), id: binding.runtimeId }
    const existing = composition.patternInstances.find(instance => instance.id === value.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(value)) throw new Error(`Group runtime binding "${value.id}" has conflicting Pattern instance values.`)
    if (!existing) composition.patternInstances.push(value)
  }
  for (const occurrence of record.composition.groupOccurrences) {
    const definition = record.composition.groupDefinitions.find(definition => definition.id === occurrence.definitionId)!
    const instanceId = (id: string) => occurrence.instanceBindings?.[id] ?? `group:${JSON.stringify([definition.id, id])}`
    const clipId = (id: string) => `${occurrence.id}:${id}`
    const layerId = (id: string) => occurrence.layerBindings.find(binding => binding.definitionLayerId === id)!.layerId
    for (const child of definition.clips) {
      composition.clips.push({
        ...structuredClone(child), id: clipId(child.id), instanceId: instanceId(child.instanceId), zoneId: occurrence.zoneId,
        layerId: layerId(child.layerId), startMs: occurrence.startMs + child.startMs,
        appearance: { keys: child.appearance.keys.map(key => {
          const value = structuredClone(key.value)
          const transform = value.transform ?? { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
          value.transform = { ...transform, positionX: transform.positionX + occurrence.translationX, positionY: transform.positionY + occurrence.translationY }
          if (value.aperture?.enabled) value.aperture = { ...value.aperture, x: value.aperture.x + occurrence.translationX, y: value.aperture.y + occurrence.translationY }
          return { id: `${occurrence.id}:${key.id}`, timeMs: occurrence.startMs + key.timeMs, value }
        }) },
      })
    }
    for (const transition of definition.transitions) {
      const from = definition.clips.find(clip => clip.id === transition.fromPlacementId)!
      const { fromPlacementId, toPlacementId, ...settings } = structuredClone(transition)
      composition.transitions.push({ ...settings, id: `${occurrence.id}:${transition.id}`, participants: [{ id: `${occurrence.id}:${transition.id}:participant`, zoneId: occurrence.zoneId, layerId: layerId(from.layerId), fromClipId: clipId(fromPlacementId), toClipId: clipId(toPlacementId) }], propertyRamps: [] })
    }
    for (const track of definition.propertyTracks) {
      const target: ShowPropertyTargetV2 = 'clipId' in track.target ? { ...track.target, clipId: clipId(track.target.clipId) }
        : 'instanceId' in track.target ? { ...track.target, instanceId: instanceId(track.target.instanceId) } : structuredClone(track.target)
      const activation = occurrence.trackActivation ?? { startMs: occurrence.startMs + track.activeStartMs, durationMs: track.activeDurationMs }
      composition.propertyTracks.push({
        ...structuredClone(track), id: `${occurrence.id}:${track.id}`, target,
        activeStartMs: activation.startMs, activeDurationMs: activation.durationMs,
        keyframes: track.keyframes.map(key => {
          let value = key.value
          if (target.kind === 'clip-transform' && target.property === 'positionX' || target.kind === 'clip-aperture' && target.property === 'x') value += occurrence.translationX
          if (target.kind === 'clip-transform' && target.property === 'positionY' || target.kind === 'clip-aperture' && target.property === 'y') value += occurrence.translationY
          return { ...structuredClone(key), id: `${occurrence.id}:${key.id}`, timeMs: occurrence.startMs + key.timeMs, value }
        }),
      })
    }
  }
  composition.patternInstances.sort((a, b) => a.id.localeCompare(b.id))
  composition.groupDefinitions = []
  composition.groupOccurrences = []
  return expanded
}

/** Checks every source payload field against the authored representation. */
export function groupDefinitionPreserved(source: ShowGroupDefinition, target: ShowGroupDefinitionV2): boolean {
  if (source.id !== target.id || source.name !== target.name || JSON.stringify(source.patternInstances) !== JSON.stringify(target.patternInstances)
    || JSON.stringify(source.transitions ?? []) !== JSON.stringify(target.transitions) || source.placements.length !== target.clips.length
    || (source.propertyTracks?.length ?? 0) !== target.propertyTracks.length) return false
  for (const placement of source.placements) {
    const clip = target.clips.find(clip => clip.id === placement.id)
    if (!clip || clip.instanceId !== placement.instanceId || clip.startMs !== placement.startMs || clip.durationMs !== placement.durationMs
      || target.layers.find(layer => layer.id === clip.layerId)?.rank !== placement.layerOffset || clip.appearance.keys.length !== 1
      || JSON.stringify(clip.appearance.keys[0].value) !== JSON.stringify(clipAppearance(placement))) return false
  }
  return (source.propertyTracks ?? []).every(track => {
    const actual = target.propertyTracks.find(candidate => candidate.id === track.id)
    return actual && actual.activeStartMs === 0 && actual.activeDurationMs === groupDuration(target)
      && JSON.stringify(actual.keyframes) === JSON.stringify(track.keyframes)
      && JSON.stringify(actual.target) === JSON.stringify(convertPropertyTarget(track.target, new Map(source.placements.map(clip => [clip.id, clip.id]))))
  })
}

export function groupDefinitionAsRecord(record: ShowRecordV2, definition: ShowGroupDefinitionV2): ShowRecordV2 {
  const zoneId = 'definition-zone'
  const result = structuredClone(record)
  result.zones = [{ id: zoneId, name: definition.name, nominalPixelCount: 1 }]
  result.zoneLayouts = [{ id: 'definition-layout', name: 'Definition', zones: [], logical: { kind: 'single', zoneIds: [zoneId] } }]
  const clips: ShowClipV2[] = definition.clips.map(clip => ({ ...structuredClone(clip), zoneId }))
  result.composition = {
    version: 2, executionModel: record.composition.executionModel, showEndMs: groupDuration(definition), sampleRemap: { repeatScale: 1 },
    patternInstances: structuredClone(definition.patternInstances), clips,
    layers: [...definition.layers, ...(definition.layers.some(layer => layer.rank === 0) ? [] : [{ id: 'definition-empty-main', name: 'Main', rank: 0 }])].map(layer => ({ ...layer, zoneId })),
    transitions: definition.transitions.map(transition => {
      const from = clips.find(clip => clip.id === transition.fromPlacementId)
      const { fromPlacementId, toPlacementId, ...settings } = structuredClone(transition)
      return { ...settings, participants: [{ id: `${transition.id}:participant`, zoneId, layerId: from?.layerId ?? '', fromClipId: fromPlacementId, toClipId: toPlacementId }], propertyRamps: [] }
    }),
    propertyTracks: structuredClone(definition.propertyTracks), markers: [], groupDefinitions: [], groupOccurrences: [],
    layoutOccurrences: [{ id: 'definition-occurrence', layoutId: 'definition-layout', startMs: 0, durationMs: groupDuration(definition), parameters: {} }],
  }
  return result
}
