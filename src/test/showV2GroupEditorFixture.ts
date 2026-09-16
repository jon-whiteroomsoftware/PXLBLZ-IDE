import { propertyEditRecord } from './showV2PropertyEditsFixture'
import type { ShowPreparedStageDependenciesV2 } from '../engine/showPreparedStageV2'
/** Thirty-second trusted native UI fixture: one unselected and two selected shared users. */
export function showV2GroupEditorFixture(pair = false) {
  const record = propertyEditRecord(), main = record.composition.clips[0]
  record.id = 'group-editor-fixture'; record.name = 'Shared voices'
  record.composition.executionModel = 'continuous'; record.composition.showEndMs = 30000
  record.composition.layoutOccurrences[0].durationMs = 30000; main.durationMs = 30000
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'group-voice' }
  record.composition.patternInstances[0].patternName = 'Voice'
  const layer = record.composition.layers.find(layer => layer.rank === 1)!
  for (const [id, startMs, durationMs, entryPolicy] of [['verse-a', 2000, 1000, 'continue'], ['verse-b', pair ? 4000 : 3000, 3000, 'restart']] as const) {
    const clip = structuredClone(main); Object.assign(clip, { id, layerId: layer.id, startMs, durationMs, entryPolicy })
    clip.appearance.keys[0].timeMs = startMs; record.composition.clips.push(clip)
  }
  if (pair) record.composition.transitions = [{ id: 'verse-transition', kind: 'crossfade', crossfadePolicy: 'live-live', durationMs: 1000, easing: { curve: 'sine', direction: 'in-out' }, participants: [{ id: 'verse-pair', zoneId: main.zoneId, layerId: layer.id, fromClipId: 'verse-a', toClipId: 'verse-b' }], propertyRamps: [] }]
  record.composition.propertyTracks = [{ id: 'shared-gain', target: { kind: 'instance-control', instanceId: main.instanceId, exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 30000, keyframes: [{ id: 'gain-start', timeMs: 0, value: 0.4, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'gain-end', timeMs: 30000, value: 0.8, easing: { curve: 'linear' } }] }]
  const dependencies: ShowPreparedStageDependenciesV2 = { patterns: [{ id: 'group-voice', name: 'Voice', src: 'export var elapsed=0; export var gain=.4; export function sliderGain(v){gain=v} export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(gain,elapsed/30000,x)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  return { record, dependencies }
}
