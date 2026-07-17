import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
  normalizeShowOutputContract,
  resolveShowOutputMapSelection,
} from './showOutputContract'

describe('Show output contracts (#434)', () => {
  it('caps every newly authored Show contract at the supported 2,000-pixel envelope (#493, #514)', () => {
    expect(createPortableShowOutputContract({
      referenceMapId: 'plane',
      referencePixelCount: 50_000,
    }).referencePixelCount).toBe(2_000)

    expect(createInstallationShowOutputContract({
      outputMapId: 'plane',
      pixelCount: 50_000,
    }).pixelCount).toBe(2_000)
  })

  it('preserves an over-limit legacy Installation contract for editing and repair (#514)', () => {
    expect(normalizeShowOutputContract({
      version: 1,
      kind: 'installation',
      outputMapId: 'legacy-map',
      pixelCount: 4_000,
      resolution: 'fixed',
    })).toEqual({
      version: 1,
      kind: 'installation',
      outputMapId: 'legacy-map',
      pixelCount: 4_000,
      resolution: 'fixed',
    })
  })

  it('normalizes both versioned contract variants without depending on display copy', () => {
    expect(normalizeShowOutputContract(createPortableShowOutputContract({
      referenceMapId: 'plane',
      referencePixelCount: 1024,
    }))).toEqual({
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 1024,
      compatibility: {
        dimensions: [2],
        mapClass: 'continuous-surface',
        resolution: 'variable',
      },
    })

    expect(normalizeShowOutputContract(createInstallationShowOutputContract({
      outputMapId: 'custom-map',
      pixelCount: 240,
    }))).toEqual({
      version: 1,
      kind: 'installation',
      outputMapId: 'custom-map',
      pixelCount: 240,
      resolution: 'fixed',
    })
  })

  it('uses and locks a fixed map measured count but leaves generated map counts editable', () => {
    const maps = [
      { id: 'custom-map', fixedPixelCount: 240 },
      { id: 'plane' },
    ]

    expect(resolveShowOutputMapSelection('custom-map', 512, maps)).toEqual({
      mapId: 'custom-map',
      pixelCount: 240,
      pixelCountLocked: true,
    })
    expect(resolveShowOutputMapSelection('plane', 512, maps)).toEqual({
      mapId: 'plane',
      pixelCount: 512,
      pixelCountLocked: false,
    })
  })
})
