import { describe, expect, it } from 'vitest'
import type { ControllerProfile } from './controllerProfile'
import { controllerProfileArtifactSignature } from './controllerProfilePassRecipe'
import type { ControllerPushRecord } from './controllerPushRecord'
import {
  appliedWrapperTags,
  bindingTags,
  describeWrapperTags,
  formatWrapperSkipReason,
  savedRowDomId,
  type WrapperSkip,
} from './controllerWrapperTags'

const PROGRAM = 'pxbProgram000001'
const GENERIC = "Skipped: this Pattern's code can't take a Wrapper."
const memory = (neededWords: number, freeWords?: number): WrapperSkip => ({
  reason: 'array-budget', message: 'engine message', neededWords, ...(freeWords === undefined ? {} : { freeWords }),
})
const nameTaken: WrapperSkip = { reason: 'control-name-taken', message: 'engine message' }

const profile: ControllerProfile = {
  id: 'tags', name: 'Tags', board: { kind: 'pixelblaze-v3-standard' }, updatedAt: 1,
  inputs: [
    { id: 'knob', name: 'Knob', pin: 36, signal: 'analog', smoothing: 0, fallback: 0, invert: false },
    { id: 'fader', name: 'Fader', pin: 39, signal: 'analog', smoothing: 0, fallback: 0, invert: false },
  ],
  globalTransforms: [],
  patternBindings: [
    { id: 'b1', patternId: 'p', inputId: 'knob', target: { kind: 'call-exported-slider', name: 'sliderSpeed' } },
    { id: 'b2', patternId: 'p', inputId: 'fader', target: { kind: 'assign-variable', name: 'hue', min: 0, max: 1 } },
  ],
}

function record(overrides: Partial<ControllerPushRecord> = {}): ControllerPushRecord {
  return { transforms: [], artifactHash: 'a', stampedAt: '2026-11-26T00:00:00.000Z', name: 'P', ...overrides }
}
const withOutcome = (wrapperOutcome: ControllerPushRecord['wrapperOutcome'], extra: Partial<ControllerPushRecord> = {}) =>
  record({ wrapperOutcome, wrapperProgramId: PROGRAM, ...extra })
const pattern = (r: ControllerPushRecord | undefined) => describeWrapperTags({ record: r, programId: PROGRAM, kind: 'pattern' })

describe('describeWrapperTags provenance (#1277 I1)', () => {
  it.each([
    ['record absent', undefined],
    ['outcome absent', record()],
    ['explicit empty outcome', withOutcome({ applied: [], skipped: {} })],
    ['outcome stored for another program', withOutcome({ applied: ['slow-mo'], skipped: {} }, { wrapperProgramId: 'pxbOther' })],
  ])('%s gives no timing tag', (_name, r) => {
    expect(pattern(r)).toEqual([])
  })
})

describe('describeWrapperTags timing tags', () => {
  it.each([
    ['Slow-mo applied', { applied: ['slow-mo'], skipped: {} }, [{ wrapper: 'slow-mo', state: 'applied' }]],
    ['Dreamy applied', { applied: ['dreamy'], skipped: {} }, [{ wrapper: 'dreamy', state: 'applied' }]],
    ['both, stored order', { applied: ['dreamy', 'slow-mo'], skipped: {} },
      [{ wrapper: 'dreamy', state: 'applied' }, { wrapper: 'slow-mo', state: 'applied' }]],
    ['Slow-mo skipped for memory', { applied: [], skipped: { 'slow-mo': memory(2340, 512) } },
      [{ wrapper: 'slow-mo', state: 'skipped', reason: 'Skipped: not enough memory. Needs 2,340 array words, 512 free.' }]],
    ['Slow-mo skipped, name taken', { applied: [], skipped: { 'slow-mo': nameTaken } },
      [{ wrapper: 'slow-mo', state: 'skipped', reason: GENERIC }]],
    ['one applied, one skipped', { applied: ['slow-mo'], skipped: { dreamy: memory(195, 149) } },
      [{ wrapper: 'slow-mo', state: 'applied' }, { wrapper: 'dreamy', state: 'skipped', reason: 'Skipped: not enough memory. Needs 195 array words, 149 free.' }]],
    ['both skipped, inserted Dreamy first', { applied: [], skipped: { dreamy: nameTaken, 'slow-mo': memory(2340, 0) } },
      [{ wrapper: 'slow-mo', state: 'skipped', reason: 'Skipped: not enough memory. Needs 2,340 array words, 0 free.' },
        { wrapper: 'dreamy', state: 'skipped', reason: GENERIC }]],
  ] as const)('%s', (_name, outcome, expected) => {
    expect(pattern(withOutcome(structuredClone(outcome) as never))).toEqual(expected)
  })

  it('a Show drops every timing entry and keeps Power limit and Brightness (I2)', () => {
    const show = withOutcome({ applied: ['slow-mo'], skipped: { dreamy: nameTaken } }, {
      transforms: ['power-cap', 'hardware-brightness'],
    })
    expect(describeWrapperTags({ record: show, programId: PROGRAM, kind: 'show' })).toEqual([
      { wrapper: 'power', state: 'applied' },
      { wrapper: 'bright', state: 'applied' },
    ])
  })
})

describe('describeWrapperTags transforms and bindings', () => {
  it('ignores unknown transforms', () => {
    expect(pattern(record({ transforms: ['future-transform'] }))).toEqual([])
  })

  it('does not infer Power limit from signature settings alone', () => {
    const capped: ControllerProfile = {
      ...profile, patternBindings: [],
      globalTransforms: [{ id: 'cap', mixinId: 'builtin:power-cap', type: 'power-cap', enabled: true, mode: 'direct', maxDuty: 0.25 }],
    }
    expect(pattern(record({ profileSignature: controllerProfileArtifactSignature(capped, 'p', { mapDim: null }) }))).toEqual([])
  })

  const legacyProfile: ControllerProfile = {
    ...profile, patternBindings: [],
    globalTransforms: [
      { id: 'cap', mixinId: 'builtin:power-cap', type: 'power-cap', enabled: true, mode: 'direct', maxDuty: 0.25 },
      { id: 'dim', mixinId: 'builtin:hardware-brightness', type: 'hardware-brightness', enabled: true, inputId: 'knob', mode: 'multiply-output' },
    ],
  }
  const legacy = (signatureProfile: ControllerProfile) => {
    const { transforms: _absent, ...rest } = record({
      profileSignature: controllerProfileArtifactSignature(signatureProfile, 'p', { mapDim: null }),
    })
    return rest as ControllerPushRecord
  }

  it('keeps Power limit and Brightness for a legacy record with no transforms field', () => {
    expect(pattern(legacy(legacyProfile))).toEqual([
      { wrapper: 'power', state: 'applied' },
      { wrapper: 'bright', state: 'applied' },
    ])
  })

  it('drops legacy Brightness when a binding on its input suppressed the emission', () => {
    const suppressed: ControllerProfile = {
      ...legacyProfile,
      patternBindings: [{ id: 'b1', patternId: 'p', inputId: 'knob', target: { kind: 'call-exported-slider', name: 'sliderSpeed' } }],
    }
    expect(pattern(legacy(suppressed))).toEqual([
      { wrapper: 'power', state: 'applied' },
      { wrapper: 'binding', state: 'applied', label: 'IO36 → sliderSpeed' },
    ])
  })

  it('reads only transforms when the record has the field, even if the signature carries the settings', () => {
    const signatureOnly = record({
      transforms: ['hardware-brightness'],
      profileSignature: controllerProfileArtifactSignature(legacyProfile, 'p', { mapDim: null }),
    })
    expect(pattern(signatureOnly)).toEqual([{ wrapper: 'bright', state: 'applied' }])
  })

  it('gives a legacy record with no transforms and no recognized signature no tags', () => {
    const { transforms: _absent, ...rest } = record({ profileSignature: '{not json' })
    expect(pattern(rest as ControllerPushRecord)).toEqual([])
  })

  it('orders a mixed row: applied, skipped, power, bright, bindings', () => {
    const mixed = withOutcome({ applied: ['dreamy'], skipped: { 'slow-mo': memory(2340, 512) } }, {
      transforms: ['hardware-brightness', 'power-cap'],
      profileSignature: controllerProfileArtifactSignature(profile, 'p', { mapDim: null }),
    })
    expect(pattern(mixed)).toEqual([
      { wrapper: 'dreamy', state: 'applied' },
      { wrapper: 'slow-mo', state: 'skipped', reason: 'Skipped: not enough memory. Needs 2,340 array words, 512 free.' },
      { wrapper: 'power', state: 'applied' },
      { wrapper: 'bright', state: 'applied' },
      { wrapper: 'binding', state: 'applied', label: 'IO36 → sliderSpeed' },
      { wrapper: 'binding', state: 'applied', label: 'IO39 → hue' },
    ])
    expect(appliedWrapperTags({ record: mixed, programId: PROGRAM, kind: 'pattern' })).toEqual([
      { wrapper: 'dreamy', state: 'applied' },
      { wrapper: 'power', state: 'applied' },
      { wrapper: 'bright', state: 'applied' },
    ])
  })
})

describe('appliedWrapperTags (#1280 picker, applied only)', () => {
  it('never returns a skipped tag', () => {
    const skipped = withOutcome({ applied: [], skipped: { 'slow-mo': nameTaken, dreamy: memory(1, 0) } })
    expect(appliedWrapperTags({ record: skipped, programId: PROGRAM, kind: 'pattern' })).toEqual([])
  })
})

describe('formatWrapperSkipReason', () => {
  it.each<[WrapperSkip, string]>([
    [memory(2340, 512), 'Skipped: not enough memory. Needs 2,340 array words, 512 free.'],
    [memory(1554, 0), 'Skipped: not enough memory. Needs 1,554 array words, 0 free.'],
    [memory(390, 12), 'Skipped: not enough memory. Needs 390 array words, 12 free.'],
    [memory(2340), GENERIC],
    [{ reason: 'array-budget', message: 'm' }, GENERIC],
    [nameTaken, GENERIC],
    ...(['no-renderer', 'shadowed-builtin', 'reserved-prefix'] as const).map((reason): [WrapperSkip, string] => [{ reason, message: 'm' }, GENERIC]),
  ])('%o', (skip, expected) => {
    expect(formatWrapperSkipReason(skip)).toBe(expected)
  })
})

describe('bindingTags', () => {
  it('labels a control and a variable binding by stored pin and target', () => {
    const r = record({ profileSignature: controllerProfileArtifactSignature(profile, 'p', { mapDim: null }) })
    expect(bindingTags(r)).toEqual(['IO36 → sliderSpeed', 'IO39 → hue'])
  })

  it('gives nothing for an unrecognized signature while transforms still tag', () => {
    const r = record({ profileSignature: '{not json', transforms: ['power-cap'] })
    expect(bindingTags(r)).toEqual([])
    expect(pattern(r)).toEqual([{ wrapper: 'power', state: 'applied' }])
  })
})

describe('savedRowDomId', () => {
  it('keeps ids distinct when they differ only in escaped characters', () => {
    const ids = ['a b', 'a_20_b', 'a.b', 'a_b', 'pxbProgram000001'].map(savedRowDomId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/)
  })
})
