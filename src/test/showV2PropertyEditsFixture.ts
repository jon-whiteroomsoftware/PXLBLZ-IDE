import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { convertibleV1Show } from './showV2TracerFixture'
import type { ShowRecordV2, ShowPropertyTrackV2, ShowPropertyTargetV2 } from '../engine/showCompositionV2'
export function propertyEditRecord(): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(convertibleV1Show())
  if (result.status !== 'converted') throw Error('Fixture conversion')
  const record = result.record
  record.composition.patternInstances[0].controlTargets = { sliderGain: 0.4 }
  record.composition.clips[0].appearance.keys[0].value.effects = [{ id: 'turn', kind: 'rotate', turns: 0 }]
  return record
}
export function propertyEditTrack(target: ShowPropertyTargetV2 = { kind: 'clip-view', clipId: 'clip', property: 'brightness' }): ShowPropertyTrackV2 {
  return { id: 'animation', target, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'left', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'right', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] }
}
export function propertyEditGroupRecord(): ShowRecordV2 {
  const record = propertyEditRecord(); const instance = record.composition.patternInstances[0]; const ordinary = record.composition.clips[0]
  record.composition.groupDefinitions = [{ id: 'definition', name: 'Definition', patternInstances: [{ ...structuredClone(instance), id: 'slot' }], layers: [{ id: 'local-layer', name: 'Local', rank: 0 }], clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 400, zoneSampleMode: 'span', entryPolicy: 'continue', appearance: { keys: [{ ...structuredClone(ordinary.appearance.keys[0]), id: 'appearance', timeMs: 0 }] } }], transitions: [], propertyTracks: [] }]
  record.composition.groupOccurrences = [0, 500].map((startMs, index) => ({ id: `occ-${index}`, definitionId: 'definition', startMs, layoutOccurrenceId: record.composition.layoutOccurrences[0].id, zoneId: ordinary.zoneId, layerBindings: [{ definitionLayerId: 'local-layer', layerId: record.composition.layers[1].id }], translationX: index * 0.2, translationY: 0, holds: [{ id: 'pause', localTimeMs: 200, durationMs: 100 }], instanceBindings: { slot: instance.id } }))
  return record
}
