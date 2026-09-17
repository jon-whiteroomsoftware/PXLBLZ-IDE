import { expect } from 'vitest'
import type { ShowPreparedStageDependenciesV2 } from '../engine/showPreparedStageV2'
import { validateShowRecordV2, type ShowRecordV2 } from '../engine/showCompositionV2'

const VOICE = 'export var elapsed=0; export var gain=.4; export function sliderGain(v){gain=v} export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(gain,elapsed/10000,x)}'

export const SEQUENCE_DEPENDENCIES: ShowPreparedStageDependenciesV2 = {
  patterns: [{ id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }],
  maps: [], libraries: [], profiles: [], stageMap: null,
}

const appearance = (id: string, timeMs: number) => ({
  keys: [{ id, timeMs, value: { opacity: 1, effects: [], view: { mirror: false, phase: 0, brightness: 1 } } }],
})

/**
 * One fixture for the §12 sequences this slice drives through the editor route:
 * a Group occurrence spanning the insertion point and a second occurrence after
 * it (GROUP-HOLD), two Layout occurrences and a dormant Marker (LAYOUT-END and
 * INSERT), a sole-user instance-control curve with a nonlinear easing (CURVE),
 * and a shared runtime whose second Clip can carry Restart (RESTART).
 */
export function showV2EditorSequenceRecord(): ShowRecordV2 {
  const record: ShowRecordV2 = {
    version: 2,
    id: 'editor-v2-sequences',
    name: 'Editor v2 sequences',
    zones: [{ id: 'zone', name: 'Zone', nominalPixelCount: 8 }],
    zoneLayouts: [{ id: 'layout', name: 'Layout', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    outputContract: {
      version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 8,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 2, executionModel: 'continuous', showEndMs: 30000, sampleRemap: { repeatScale: 1 },
      patternInstances: [
        { id: 'instance', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.4 } },
        { id: 'solo', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.2 } },
      ],
      layers: [
        { id: 'main', zoneId: 'zone', name: 'Main', rank: 0 },
        { id: 'group-layer', zoneId: 'zone', name: 'Group', rank: 1 },
        { id: 'solo-layer', zoneId: 'zone', name: 'Solo', rank: 2 },
      ],
      clips: [
        { id: 'bed', instanceId: 'instance', zoneId: 'zone', layerId: 'main', startMs: 0, durationMs: 12000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance('bed-key', 0) },
        { id: 'reprise', instanceId: 'instance', zoneId: 'zone', layerId: 'main', startMs: 12000, durationMs: 8000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance('reprise-key', 12000) },
        { id: 'curve-clip', instanceId: 'solo', zoneId: 'zone', layerId: 'solo-layer', startMs: 0, durationMs: 4000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance('curve-key', 0) },
      ],
      transitions: [],
      layoutOccurrences: [
        { id: 'first-layout', layoutId: 'layout', startMs: 0, durationMs: 20000, parameters: {} },
        { id: 'second-layout', layoutId: 'layout', startMs: 20000, durationMs: 10000, parameters: {} },
      ],
      propertyTracks: [{
        // The sole user of `solo`, so a Clip trim restricts this curve exactly.
        id: 'solo-gain',
        target: { kind: 'instance-control', instanceId: 'solo', exportName: 'sliderGain' },
        activeStartMs: 0,
        activeDurationMs: 4000,
        keyframes: [
          { id: 'gain-left', timeMs: 0, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } },
          { id: 'gain-right', timeMs: 4000, value: 1, easing: { curve: 'linear' } },
        ],
      }],
      markers: [{ id: 'opening', timeMs: 1000, name: 'Opening' }, { id: 'dormant', timeMs: 40000, name: 'Dormant' }],
      groupDefinitions: [{
        id: 'verse', name: 'Verse',
        patternInstances: [{ id: 'slot', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.4 } }],
        layers: [{ id: 'local', name: 'Local', rank: 0 }],
        clips: [{ id: 'child', instanceId: 'slot', layerId: 'local', startMs: 0, durationMs: 10000, entryPolicy: 'continue', zoneSampleMode: 'span', appearance: appearance('child-key', 0) }],
        transitions: [],
        propertyTracks: [],
      }],
      groupOccurrences: [0, 20000].map((startMs, index) => ({
        id: `occurrence-${index}`, definitionId: 'verse', layoutOccurrenceId: startMs === 0 ? 'first-layout' : 'second-layout',
        zoneId: 'zone', startMs, translationX: 0, translationY: 0,
        layerBindings: [{ definitionLayerId: 'local', layerId: 'group-layer' }], holds: [],
        instanceBindings: { slot: 'instance' },
      })),
    },
    updatedAt: 1,
  }
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

