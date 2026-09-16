import { propertyEditRecord } from './showV2PropertyEditsFixture'
import type { ShowPreparedStageDependenciesV2 } from '../engine/showPreparedStageV2'
export function recoveryFixture(animated = true) {
  const record = propertyEditRecord()
  record.composition.executionModel = 'continuous'
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'recovery-source' }
  if (animated) record.composition.layers = record.composition.layers.filter(layer => layer.rank === 0)
  record.zones.push({ id: 'right', name: 'Right', nominalPixelCount: 16 })
  record.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'right'], axis: 'x' }
  record.composition.clips[0].zoneSampleMode = 'independent'
  record.composition.propertyTracks = animated ? [{ id: 'animation', target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'first', timeMs: 0, value: 0.25, easing: { curve: 'linear' } }, { id: 'last', timeMs: 1000, value: 0.75, easing: { curve: 'linear' } }] }] : []
  const dependencies: ShowPreparedStageDependenciesV2 = { patterns: [{ id: 'recovery-source', name: 'Recovery', src: 'export function sliderGain(v){}export function render2D(i,x,y){rgb(x,y,.25)}', updatedAt: 1, controls: {} }], maps: [], libraries: [], profiles: [], stageMap: null }
  return { record, dependencies }
}
