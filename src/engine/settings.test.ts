import {
  DEV_DEFAULTS,
  CASCADED_FIELDS,
  HYBRID_FIELDS,
  GLOBAL_ONLY_FIELDS,
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
      'speed',
      'lightSize',
      'diffusion',
      'fidelity',
    ]
    expect(new Set(keys)).toEqual(new Set(expected))
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
