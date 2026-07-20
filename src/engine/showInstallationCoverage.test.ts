import { validateInstallationCoverage } from './showInstallationCoverage'
import { createDefaultShow } from './showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'

function installationShow(pixelCount = 8) {
  return {
    ...createDefaultShow('show-installation', 'Installation', 1),
    outputContract: createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount }),
  }
}

describe('Installation physical-zone coverage (#435)', () => {
  it('accepts complete contiguous and discontinuous ownership', () => {
    const contiguous = installationShow()
    contiguous.routingLayouts[0].zones = [{ zoneId: 'zone-1', ranges: [{ start: 0, end: 7 }] }]
    expect(validateInstallationCoverage(contiguous)).toMatchObject({
      valid: true,
      pixelCount: 8,
      layouts: [{ assignedPixelCount: 8, missingPixelCount: 0, overlappingPixelCount: 0, outOfRangePixelCount: 0 }],
    })

    contiguous.routingLayouts[0].zones = [{
      zoneId: 'zone-1',
      ranges: [{ start: 0, end: 1 }, { start: 4, end: 5 }, { start: 2, end: 3 }, { start: 6, end: 7 }],
    }]
    expect(validateInstallationCoverage(contiguous)!.valid).toBe(true)
  })

  it('counts missing, overlapping, and out-of-range indexes against the master count', () => {
    const show = installationShow()
    show.routingLayouts[0].zones = [
      { zoneId: 'zone-1', ranges: [{ start: 0, end: 3 }, { start: 7, end: 9 }] },
      { zoneId: 'zone-2', ranges: [{ start: 2, end: 4 }] },
    ]

    expect(validateInstallationCoverage(show)).toEqual({
      valid: false,
      pixelCount: 8,
      layouts: [{
        layoutId: 'layout-1',
        layoutName: 'Default',
        kind: 'physical',
        valid: false,
        assignedPixelCount: 6,
        missingPixelCount: 2,
        overlappingPixelCount: 2,
        outOfRangePixelCount: 2,
        totalPixelCount: 8,
      }],
    })
  })

  it('treats logical layouts as full-output routing and ignores non-Installation Shows', () => {
    const show = installationShow()
    show.routingLayouts[0].logical = { kind: 'single', zoneIds: ['zone-1'] }
    show.routingLayouts[0].zones = []

    expect(validateInstallationCoverage(show)).toMatchObject({
      valid: true,
      layouts: [{ kind: 'logical', assignedPixelCount: 8, missingPixelCount: 0 }],
    })
    const portable = createDefaultShow('portable', 'Portable', 1)
    portable.outputContract = createPortableShowOutputContract({
      referenceMapId: 'plane',
      referencePixelCount: 60,
    })
    expect(validateInstallationCoverage(portable)).toBeNull()
  })
})
