import {
  DEV_DEFAULTS,
  CASCADED_FIELDS,
  HYBRID_FIELDS,
  GLOBAL_ONLY_FIELDS,
  discardLegacyPreviewSpeed,
  type Settings,
} from './settings'

describe('DEV_DEFAULTS', () => {
  it('supplies a value for every Settings field', () => {
    const keys = Object.keys(DEV_DEFAULTS) as (keyof Settings)[]
    const expected: (keyof Settings)[] = [
      'mapId',
      'shapeId',
      'surfaceId',
      'pixelCount',
      'solidity',
      'normalize',
      'brightness',
      'slowMo',
      'dreamy',
      'lightSize',
      'diffusion',
      'fidelity',
    ]
    expect(new Set(keys)).toEqual(new Set(expected))
    expect(DEV_DEFAULTS.slowMo).toBe(0)
    expect(DEV_DEFAULTS.dreamy).toBe(0)
  })
})

describe('discardLegacyPreviewSpeed', () => {
  it('prunes default zero and invalid slowMo/dreamy overrides while preserving positive clamped values', () => {
    expect(discardLegacyPreviewSpeed({ slowMo: 0, dreamy: 0, brightness: 0.5 })).toEqual({ brightness: 0.5 })
    expect(discardLegacyPreviewSpeed({ slowMo: -0.1, dreamy: Number.NaN })).toEqual({})
    expect(discardLegacyPreviewSpeed({ slowMo: 0.5, dreamy: 1.5 })).toEqual({ slowMo: 0.5, dreamy: 1 })
  })
})

describe('field partition', () => {
  const all = [...CASCADED_FIELDS, ...HYBRID_FIELDS, ...GLOBAL_ONLY_FIELDS]

  it('is disjoint across the three classes', () => {
    expect(new Set(all).size).toBe(all.length)
  })

  it('covers every Settings field exactly once', () => {
    expect(new Set(all)).toEqual(new Set(Object.keys(DEV_DEFAULTS)))
  })
})
