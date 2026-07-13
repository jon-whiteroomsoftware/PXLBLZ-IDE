import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
  normalizeShowOutputContract,
  resolveShowOutputMapSelection,
} from './showOutputContract'

describe('Show output contracts (#434)', () => {
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
