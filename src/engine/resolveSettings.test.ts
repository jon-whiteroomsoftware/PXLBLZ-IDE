import { resolveSettings, hybridWriteTarget } from './resolveSettings'
import { DEV_DEFAULTS, type GlobalSticky, type Settings } from './settings'

const STICKY: GlobalSticky = { lightSize: 0.7, diffusion: 0.2, fidelity: 'fidelity' }

function resolve(over: Partial<Settings>, rec: Partial<Settings> = {}, sticky = STICKY) {
  return resolveSettings(over, rec, sticky, DEV_DEFAULTS)
}

describe('resolveSettings — cascaded fields (override → recommended → dev-default)', () => {
  it('falls through to the dev-default with no override or recommendation', () => {
    expect(resolve({}).brightness).toBe(DEV_DEFAULTS.brightness)
    expect(resolve({}).mapId).toBe(DEV_DEFAULTS.mapId)
  })

  it('recommended outranks dev-default', () => {
    expect(resolve({}, { mapId: 'seed-sphere-3d' }).mapId).toBe('seed-sphere-3d')
  })

  it('override outranks recommended', () => {
    expect(resolve({ mapId: 'plane' }, { mapId: 'seed-sphere-3d' }).mapId).toBe('plane')
  })

  it('never consults the global-sticky for a cascaded field', () => {
    // Even if a stray sticky value existed for a cascaded field, it must not win.
    const sticky = { ...STICKY, brightness: 0.01 } as unknown as GlobalSticky
    expect(resolveSettings({}, {}, sticky, DEV_DEFAULTS).brightness).toBe(DEV_DEFAULTS.brightness)
  })
})

describe('resolveSettings — hybrid fields (all four layers)', () => {
  it('uses the global-sticky baseline when no override or recommendation', () => {
    expect(resolve({}).lightSize).toBe(STICKY.lightSize)
    expect(resolve({}).diffusion).toBe(STICKY.diffusion)
  })

  it('recommended outranks the global-sticky', () => {
    expect(resolve({}, { lightSize: 0.9 }).lightSize).toBe(0.9)
  })

  it('override outranks the recommendation', () => {
    expect(resolve({ lightSize: 0.3 }, { lightSize: 0.9 }).lightSize).toBe(0.3)
  })
})

describe('resolveSettings — pure-global fidelity', () => {
  it('always takes the global-sticky value', () => {
    expect(resolve({}).fidelity).toBe('fidelity')
  })

  it('ignores an override or recommendation for fidelity', () => {
    expect(resolve({ fidelity: 'fast' }, { fidelity: 'fast' }).fidelity).toBe('fidelity')
  })
})

describe('hybridWriteTarget', () => {
  it('writes global-sticky for a plain pattern with no recommendation or override', () => {
    expect(hybridWriteTarget({ hasRecord: true, hasExistingOverride: false, hasRecommendation: false })).toBe(
      'globalSticky',
    )
  })

  it('writes an override when the pattern already has one', () => {
    expect(hybridWriteTarget({ hasRecord: true, hasExistingOverride: true, hasRecommendation: false })).toBe(
      'override',
    )
  })

  it('writes an override when a recommendation exists (so the user can outrank it)', () => {
    expect(hybridWriteTarget({ hasRecord: true, hasExistingOverride: false, hasRecommendation: true })).toBe(
      'override',
    )
  })

  it('falls back to global-sticky for a read-only demo (no record to hold an override)', () => {
    expect(hybridWriteTarget({ hasRecord: false, hasExistingOverride: false, hasRecommendation: true })).toBe(
      'globalSticky',
    )
  })
})
