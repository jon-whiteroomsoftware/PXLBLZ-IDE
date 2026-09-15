import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
} from './showCompositionV2'

export function minimalShowRecordV2(): ShowRecordV2 {
  return {
    version: 2,
    id: 'show-v2',
    name: 'Minimal v2 Show',
    zones: [{ id: 'zone', name: 'Main', nominalPixelCount: 16 }],
    zoneLayouts: [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 16,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 2,
      executionModel: 'deterministic-loop',
      showEndMs: 1_000,
      sampleRemap: { repeatScale: 1 },
      patternInstances: [{
        id: 'instance',
        pattern: { kind: 'stock', id: 'TestPattern1D' },
        patternName: 'TestPattern1D',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      layers: [{ id: 'layer', zoneId: 'zone', name: 'Main', rank: 0 }],
      clips: [{
        id: 'clip', instanceId: 'instance', zoneId: 'zone', layerId: 'layer',
        startMs: 0, durationMs: 1_000, entryPolicy: 'continue', zoneSampleMode: 'span',
        appearance: { keys: [{
          id: 'clip:appearance:1', timeMs: 0,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }] },
      }],
      transitions: [],
      layoutOccurrences: [{
        id: 'layout-occurrence', layoutId: 'layout', startMs: 0, durationMs: 1_000, parameters: {},
      }],
      propertyTracks: [],
      markers: [],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 1,
  }
}

describe('validateShowRecordV2', () => {
  it('accepts a complete Scene-free Show and leaves its bytes unchanged', () => {
    const record = minimalShowRecordV2()
    const before = JSON.stringify(record)

    expect(validateShowRecordV2(record)).toEqual([])
    expect(JSON.stringify(record)).toBe(before)
  })

  it.each([
    ['unsafe Show End', (record: ShowRecordV2) => { record.composition.showEndMs = Number.MAX_SAFE_INTEGER + 1 }, '/composition/showEndMs'],
    ['duplicate Layer identity', (record: ShowRecordV2) => { record.composition.layers.push({ ...record.composition.layers[0] }) }, 'composition.layers[1].id'],
    ['missing Clip Layer', (record: ShowRecordV2) => { record.composition.clips[0].layerId = 'absent' }, 'composition.clips[0].layerId'],
    ['same-Layer overlap', (record: ShowRecordV2) => { record.composition.clips.push({ ...record.composition.clips[0], id: 'overlap', startMs: 500 }) }, 'composition.clips[1]'],
    ['Layout coverage gap', (record: ShowRecordV2) => { record.composition.layoutOccurrences[0].durationMs = 999 }, 'composition.layoutOccurrences'],
  ])('rejects %s without changing the candidate', (_name, change, path) => {
    const record = minimalShowRecordV2()
    change(record)
    const before = JSON.stringify(record)

    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([expect.objectContaining({ path })]))
    expect(JSON.stringify(record)).toBe(before)
  })

  it('rejects a Transition whose participant does not join exact same-Layer endpoints', () => {
    const record = minimalShowRecordV2()
    record.composition.clips = [
      { ...record.composition.clips[0], id: 'out', durationMs: 400 },
      { ...record.composition.clips[0], id: 'in', startMs: 600, durationMs: 400 },
    ]
    record.composition.transitions = [{
      id: 'transition', kind: 'crossfade', durationMs: 199, easing: { curve: 'linear' },
      participants: [{ id: 'participant', zoneId: 'zone', layerId: 'layer', fromClipId: 'out', toClipId: 'in' }],
      propertyRamps: [], crossfadePolicy: 'snapshot-live',
    }]

    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].participants[0]', code: 'invalid-transition' }),
    ]))
  })

  it('rejects a persisted Cut instead of admitting a dormant Transition identity', () => {
    const record = minimalShowRecordV2()
    record.composition.clips = [
      { ...record.composition.clips[0], id: 'out', durationMs: 500 },
      {
        ...record.composition.clips[0], id: 'in', startMs: 500, durationMs: 500,
        appearance: { keys: [{ ...record.composition.clips[0].appearance.keys[0], id: 'in:appearance:1', timeMs: 500 }] },
      },
    ]
    const storedCut = {
      id: 'stored-cut', kind: 'cut', durationMs: 0, easing: { curve: 'linear' },
      participants: [{ id: 'participant', zoneId: 'zone', layerId: 'layer', fromClipId: 'out', toClipId: 'in' }],
      propertyRamps: [],
    }

    expect(parseProvisionalShowRecordV2(JSON.stringify({
      ...record,
      composition: { ...record.composition, transitions: [storedCut] },
    }))).toEqual(expect.objectContaining({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({ path: '/composition/transitions/0/kind', code: 'schema' })]),
    }))
  })

  it('rejects a persisted Group-local Cut at the structural boundary', () => {
    const record = minimalShowRecordV2()
    const storedCut = {
      id: 'group-cut', kind: 'cut', durationMs: 0, easing: { curve: 'linear' },
      fromPlacementId: 'out', toPlacementId: 'in',
    }
    const group = {
      id: 'group', name: 'Group',
      patternInstances: [],
      layers: [{ id: 'group-layer', name: 'Main', rank: 0 }],
      clips: [],
      transitions: [storedCut],
      propertyTracks: [],
    }

    expect(parseProvisionalShowRecordV2(JSON.stringify({
      ...record,
      composition: { ...record.composition, groupDefinitions: [group] },
    }))).toEqual(expect.objectContaining({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({
        path: '/composition/groupDefinitions/0/transitions/0/kind', code: 'schema',
      })]),
    }))
  })

  it('rejects structurally unknown fields instead of admitting data the domain validator cannot see', () => {
    const record = minimalShowRecordV2() as ShowRecordV2 & { experimental?: unknown }
    record.experimental = { authored: true }

    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/', code: 'schema', message: expect.stringContaining('additional properties') }),
    ]))
  })

  it('requires an Effect target only across appearance spans intersecting its half-open activation', () => {
    const record = minimalShowRecordV2()
    record.composition.clips[0].appearance.keys[0].value.effects = [{
      id: 'fade', kind: 'opacity', opacity: 1,
    }]
    record.composition.clips[0].appearance.keys.push({
      id: 'clip:appearance:2', timeMs: 500,
      value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
    })
    record.composition.propertyTracks = [{
      id: 'fade-track',
      target: { kind: 'clip-effect', clipId: 'clip', effectId: 'fade', effectKind: 'opacity', parameterId: 'opacity' },
      activeStartMs: 0,
      activeDurationMs: 1_000,
      keyframes: [
        { id: 'start', timeMs: 0, value: 1, easing: { curve: 'linear' } },
        { id: 'end', timeMs: 500, value: 0, easing: { curve: 'linear' } },
      ],
    }]

    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'composition.propertyTracks[0].target',
        code: 'invalid-property-target',
        message: 'Property target Effect identity does not match its Clip.',
      }),
    ]))

    record.composition.propertyTracks[0].activeDurationMs = 500
    expect(validateShowRecordV2(record)).toEqual([])
  })

  it('reopens provisional authored bytes through the additive structural and domain codec', () => {
    const record = minimalShowRecordV2()
    const bytes = serializeProvisionalShowRecordV2(record)

    expect(parseProvisionalShowRecordV2(bytes)).toEqual({ status: 'opened', record })
    expect(parseProvisionalShowRecordV2('{')).toMatchObject({ status: 'refused', issues: [{ code: 'schema' }] })
  })
})
