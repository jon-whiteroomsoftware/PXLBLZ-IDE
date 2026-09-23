import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  parseProvisionalShowRecordV2,
  retimeShowTransitionRampsV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  validateShowRecordV2Domain,
  validateShowRecordV2Structure,
  type ShowTransitionV2,
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

function minimalHeldGroupRecord(): ShowRecordV2 {
  const record = minimalShowRecordV2()
  const instance = record.composition.patternInstances[0]
  const appearance = structuredClone(record.composition.clips[0].appearance)
  record.composition.clips = []
  record.composition.groupDefinitions = [{
    id: 'group',
    name: 'Held Group',
    patternInstances: [{ ...structuredClone(instance), id: 'child' }],
    layers: [{ id: 'group-layer', name: 'Main', rank: 0 }],
    clips: [{
      id: 'child-clip', instanceId: 'child', layerId: 'group-layer', startMs: 0, durationMs: 400,
      entryPolicy: 'continue', zoneSampleMode: 'span',
      appearance: { keys: [{ ...appearance.keys[0], id: 'child-appearance', timeMs: 0 }] },
    }],
    transitions: [],
    propertyTracks: [],
  }]
  record.composition.groupOccurrences = [{
    id: 'occurrence', definitionId: 'group', layoutOccurrenceId: 'layout-occurrence', zoneId: 'zone',
    startMs: 100, translationX: 0, translationY: 0,
    instanceBindings: { child: 'instance' },
    layerBindings: [{ definitionLayerId: 'group-layer', layerId: 'layer' }],
    holds: [{ id: 'hold', localTimeMs: 200, durationMs: 100 }],
  }]
  return record
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

  it('requires timed Layout transfers to be positive and fit both adjacent occurrences', () => {
    const record = minimalShowRecordV2()
    record.composition.layoutOccurrences = [
      { ...record.composition.layoutOccurrences[0], durationMs: 400 },
      {
        id: 'second', layoutId: 'layout', startMs: 400, durationMs: 600, parameters: {},
        incomingTransfer: {
          id: 'transfer', fromOccurrenceId: 'layout-occurrence', durationMs: 0, direction: 'forward',
        },
      },
    ]

    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'composition.layoutOccurrences[1].incomingTransfer.durationMs',
        code: 'out-of-bounds',
      }),
    ]))
    record.composition.layoutOccurrences[1].incomingTransfer!.durationMs = 500
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'composition.layoutOccurrences[1].incomingTransfer.durationMs',
        code: 'out-of-bounds',
        message: 'Incoming transfer must fit both adjacent Layout occurrences and Show End.',
      }),
    ]))
  })

  it('requires a Layout split-position track to remain inside its owning occurrence', () => {
    const record = minimalShowRecordV2()
    record.composition.layoutOccurrences = [
      { ...record.composition.layoutOccurrences[0], durationMs: 400 },
      { id: 'second', layoutId: 'layout', startMs: 400, durationMs: 600, parameters: {} },
    ]
    record.composition.propertyTracks = [{
      id: 'split',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'second' },
      activeStartMs: 300,
      activeDurationMs: 300,
      keyframes: [
        { id: 'a', timeMs: 300, value: 0.2, easing: { curve: 'linear' } },
        { id: 'b', timeMs: 600, value: 0.8, easing: { curve: 'linear' } },
      ],
    }]

    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'composition.propertyTracks[0].target',
        code: 'out-of-bounds',
        message: 'Layout property activation must remain inside its owning occurrence.',
      }),
    ]))
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

  it('rejects repeat-per-zone sampling in an ordinary or Group Clip at the structural boundary', () => {
    const record = minimalShowRecordV2()
    const ordinary = structuredClone(record) as unknown as { composition: { clips: Array<{ zoneSampleMode: string }> } }
    ordinary.composition.clips[0].zoneSampleMode = 'repeat'
    expect(validateShowRecordV2Structure(ordinary)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.objectContaining({ keyword: 'enum', instancePath: '/composition/clips/0/zoneSampleMode' })]),
    })
    const group = structuredClone(minimalHeldGroupRecord()) as unknown as {
      composition: { groupDefinitions: Array<{ clips: Array<{ zoneSampleMode: string }> }> }
    }
    group.composition.groupDefinitions[0].clips[0].zoneSampleMode = 'repeat'
    expect(validateShowRecordV2Structure(group)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.objectContaining({ keyword: 'enum', instancePath: '/composition/groupDefinitions/0/clips/0/zoneSampleMode' })]),
    })
  })

  it('reopens required ordered Group occurrence holds and refuses their omission', () => {
    const record = minimalHeldGroupRecord()
    record.composition.showEndMs = 60_000
    record.composition.layoutOccurrences[0].durationMs = 60_000
    record.composition.groupOccurrences[0].startMs = 30_000

    expect(parseProvisionalShowRecordV2(JSON.stringify(record))).toEqual({ status: 'opened', record })

    const withoutHolds = structuredClone(record) as unknown as {
      composition: { groupOccurrences: Array<Record<string, unknown>> }
    }
    delete withoutHolds.composition.groupOccurrences[0].holds
    expect(parseProvisionalShowRecordV2(JSON.stringify(withoutHolds))).toEqual(expect.objectContaining({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({
        path: '/composition/groupOccurrences/0', code: 'schema',
      })]),
    }))
  })

  it('refuses whitespace-only hold identities structurally and in the trusted domain validator without normalizing authored IDs', () => {
    const record = minimalHeldGroupRecord()
    record.composition.groupOccurrences[0].holds[0].id = ' \t '
    const before = structuredClone(record)

    expect(parseProvisionalShowRecordV2(JSON.stringify(record))).toEqual(expect.objectContaining({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({
        path: '/composition/groupOccurrences/0/holds/0/id', code: 'schema',
      })]),
    }))
    expect(validateShowRecordV2Domain(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'composition.groupOccurrences[0].holds[0].id', code: 'missing-reference',
      }),
    ]))
    expect(record).toEqual(before)

    record.composition.groupOccurrences[0].holds[0].id = ' authored hold '
    expect(parseProvisionalShowRecordV2(JSON.stringify(record))).toEqual({ status: 'opened', record })
    expect(record.composition.groupOccurrences[0].holds[0].id).toBe(' authored hold ')
  })

  it.each([
    ['blank identity', (record: ShowRecordV2) => { record.composition.groupOccurrences[0].holds[0].id = '' }, '/composition/groupOccurrences/0/holds/0/id', 'schema'],
    ['duplicate identity', (record: ShowRecordV2) => { record.composition.groupOccurrences[0].holds.push({ id: 'hold', localTimeMs: 300, durationMs: 10 }) }, 'composition.groupOccurrences[0].holds[1].id', 'duplicate-id'],
    ['definition start', (record: ShowRecordV2) => { record.composition.groupOccurrences[0].holds[0].localTimeMs = 0 }, 'composition.groupOccurrences[0].holds[0].localTimeMs', 'out-of-bounds'],
    ['definition end', (record: ShowRecordV2) => { record.composition.groupOccurrences[0].holds[0].localTimeMs = 400 }, 'composition.groupOccurrences[0].holds[0].localTimeMs', 'out-of-bounds'],
    ['unordered time', (record: ShowRecordV2) => { record.composition.groupOccurrences[0].holds.unshift({ id: 'later', localTimeMs: 300, durationMs: 10 }) }, 'composition.groupOccurrences[0].holds[1].localTimeMs', 'out-of-bounds'],
    ['zero duration', (record: ShowRecordV2) => { record.composition.groupOccurrences[0].holds[0].durationMs = 0 }, '/composition/groupOccurrences/0/holds/0/durationMs', 'schema'],
    ['duration overflow', (record: ShowRecordV2) => { record.composition.groupOccurrences[0].holds[0].durationMs = Number.MAX_SAFE_INTEGER }, 'composition.groupOccurrences[0].holds', 'out-of-bounds'],
  ] as const)('refuses Group occurrence hold %s without mutating authored input', (_name, change, path, code) => {
    const record = minimalHeldGroupRecord()
    change(record)
    const before = JSON.stringify(record)
    const result = parseProvisionalShowRecordV2(JSON.stringify(record))

    expect(result).toEqual(expect.objectContaining({
      status: 'refused',
      issues: expect.arrayContaining([expect.objectContaining({ path, code })]),
    }))
    expect(JSON.stringify(record)).toBe(before)
  })
})

describe('Transition ramp proportional retiming', () => {
  const transition = (ramps: ShowTransitionV2['propertyRamps']): ShowTransitionV2 => ({
    id: 'transition', kind: 'crossfade', durationMs: 1000,
    easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    participants: [], propertyRamps: ramps,
  })

  it('keeps a keyless ramp spanning the window and preserves the preimage', () => {
    const source = transition([{ target: { kind: 'show-repeat-scale' }, from: 2, easing: { curve: 'sine', direction: 'in' } }])
    const before = structuredClone(source)
    expect(retimeShowTransitionRampsV2(source, 1500)).toEqual(source.propertyRamps)
    expect(retimeShowTransitionRampsV2(source, 500)).toEqual(source.propertyRamps)
    expect(source).toEqual(before)
  })

  it('rounds explicit durations on growth and shrinkage without changing ramp identity or settings', () => {
    const ramp = { target: { kind: 'show-repeat-scale' as const }, from: 2, durationMs: 333, easing: { curve: 'sine' as const, direction: 'in' as const } }
    const source = transition([ramp])
    expect(retimeShowTransitionRampsV2(source, 1500)).toEqual([{ ...ramp, durationMs: 500 }])
    expect(retimeShowTransitionRampsV2(source, 500)).toEqual([{ ...ramp, durationMs: 167 }])
  })

  it('clamps scalar ramps to 1 ms and Clip value ramps to 100 ms or the new window', () => {
    const source = transition([
      { target: { kind: 'show-repeat-scale' }, from: 2, durationMs: 1 },
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 0.5, durationMs: 100 },
    ])
    expect(retimeShowTransitionRampsV2(source, 999).map(ramp => ramp.durationMs)).toEqual([1, 100])
    expect(retimeShowTransitionRampsV2(source, 50)).toEqual([
      { target: { kind: 'show-repeat-scale' }, from: 2, durationMs: 1 },
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 0.5 },
    ])
    expect(retimeShowTransitionRampsV2(transition([{ target: { kind: 'clip-opacity', clipId: 'in' }, from: 0.2, durationMs: 900 }]), 100))
      .toEqual([{ target: { kind: 'clip-opacity', clipId: 'in' }, from: 0.2, durationMs: 90 }])
  })
})

describe('validateShowRecordV2 Transition speed and brightness ramps (#1091 B1)', () => {
  function rampRecord(): ShowRecordV2 {
    const record = minimalShowRecordV2()
    const base = record.composition.clips[0]
    const out = { ...structuredClone(base), id: 'out', durationMs: 400 }
    const incoming = {
      ...structuredClone(base),
      id: 'in',
      startMs: 600,
      durationMs: 400,
      appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'in:appearance:1', timeMs: 600 }] },
    }
    record.composition.clips = [out, incoming]
    record.composition.showEndMs = 1000
    record.composition.transitions = [{
      id: 'xfade',
      kind: 'crossfade',
      durationMs: 200,
      easing: { curve: 'linear' },
      crossfadePolicy: 'snapshot-live',
      participants: [{ id: 'p1', zoneId: 'zone', layerId: 'layer', fromClipId: 'out', toClipId: 'in' }],
      propertyRamps: [],
    }]
    return record
  }

  it('accepts a Transition speed ramp and brightness ramp', () => {
    const record = rampRecord()
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1 },
      { participantId: 'p1', target: { kind: 'clip-view', clipId: 'in', property: 'brightness' }, from: 0.2, durationMs: 150, easing: { curve: 'sine', direction: 'in-out' } },
    ]
    const before = JSON.stringify(record)
    expect(validateShowRecordV2(record)).toEqual([])
    expect(JSON.stringify(record)).toBe(before)
  })

  it('refuses a speed ramp on a whole-output Transition', () => {
    const record = rampRecord()
    record.composition.transitions[0].participants = []
    record.composition.transitions[0].wholeOutput = { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] }
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1 },
    ]
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'A Transition speed or brightness ramp belongs to a participant.' }),
    ]))
  })

  it('refuses a ramp with a non-speed brightness target', () => {
    const record = rampRecord()
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'clip-view', clipId: 'in', property: 'phase' }, from: 0.5 },
    ]
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'Transition property ramps animate only the incoming Clip\'s Animation speed or Brightness.' }),
    ]))
  })

  it('refuses a ramp that does not resolve exactly one participant', () => {
    const record = rampRecord()
    record.composition.transitions[0].participants.push({ id: 'p2', zoneId: 'zone', layerId: 'layer', fromClipId: 'out', toClipId: 'in' })
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1 },
    ]
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'Name the participant this ramp animates.' }),
    ]))
    const named = rampRecord()
    named.composition.transitions[0].propertyRamps = [
      { participantId: 'absent', target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1 },
    ]
    expect(validateShowRecordV2(named)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'Name the participant this ramp animates.' }),
    ]))
  })

  it('refuses a ramp that names the wrong incoming Clip', () => {
    const record = rampRecord()
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'clip-view', clipId: 'out', property: 'brightness' }, from: 0.2 },
    ]
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'A Transition ramp animates the incoming Clip of its participant.' }),
    ]))
  })

  it('refuses two ramps for one participant and key', () => {
    const record = rampRecord()
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1 },
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 2 },
    ]
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[1]', message: 'A Transition participant may have only one speed ramp and one brightness ramp.' }),
    ]))
  })

  it('refuses a non-finite or out-of-range origin', () => {
    const speed = rampRecord()
    speed.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 5 },
    ]
    expect(validateShowRecordV2(speed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'Speed ramp origin must be between 0 and 4.' }),
    ]))
    const brightness = rampRecord()
    brightness.composition.transitions[0].propertyRamps = [
      { target: { kind: 'clip-view', clipId: 'in', property: 'brightness' }, from: 2 },
    ]
    expect(validateShowRecordV2(brightness)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'Brightness ramp origin must be between 0 and 1.' }),
    ]))
  })

  it('refuses a duration outside the Transition window', () => {
    const record = rampRecord()
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1, durationMs: 50 },
    ]
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'Ramp duration must be between 100 and 200.' }),
    ]))
    const over = rampRecord()
    over.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1, durationMs: 300 },
    ]
    expect(validateShowRecordV2(over)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]' }),
    ]))
  })

  it('refuses an invalid easing', () => {
    const record = rampRecord()
    record.composition.transitions[0].propertyRamps = [
      { target: { kind: 'instance-time-scale', instanceId: 'instance' }, from: 1, easing: { curve: 'steps', steps: 0, position: 'end' } },
    ]
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'composition.transitions[0].propertyRamps[0]', message: 'Ramp easing must be valid.' }),
    ]))
  })
})
