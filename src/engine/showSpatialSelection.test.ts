import { describe, expect, it } from 'vitest'
import { addShowZone, createShowWithOutputContract } from './showModel'
import { createInstallationShowOutputContract } from './showOutputContract'
import {
  applySpatialIndexSelection,
  compactSpatialIndexes,
  selectIndexesInRect,
  updateShowPhysicalZoneSelection,
} from './showSpatialSelection'
import { validateInstallationCoverage } from './showInstallationCoverage'

describe('Installation Show spatial zone selection (#340)', () => {
  it('selects exactly the 2D points enclosed by a drag rectangle', () => {
    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.4 },
      { x: 0.8, y: 0.2 },
      { x: 0.6, y: 0.9 },
    ]

    expect(selectIndexesInRect(points, { x: 0.5, y: 0.5 }, { x: 0, y: 0 })).toEqual([0, 1])
  })

  it('supports replace, additive, and subtractive correction sets', () => {
    expect([...applySpatialIndexSelection(new Set([1, 2]), [4, 5], 'replace')]).toEqual([4, 5])
    expect([...applySpatialIndexSelection(new Set([1, 2]), [2, 4], 'add')]).toEqual([1, 2, 4])
    expect([...applySpatialIndexSelection(new Set([1, 2, 4]), [2, 3], 'subtract')]).toEqual([1, 4])
  })

  it('compacts serpentine column selections into minimal inclusive ranges', () => {
    expect(compactSpatialIndexes([0, 7, 8, 15, 15])).toEqual([
      { start: 0, end: 0 },
      { start: 7, end: 8 },
      { start: 15, end: 15 },
    ])
  })

  it('updates only physical routing while preserving zone identity and reporting coverage', () => {
    let show = createShowWithOutputContract(
      'show-spatial',
      'Spatial',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1,
    )
    show = addShowZone(show, { name: 'accent', nominalPixelCount: 4, color: '#f97316' })
    const originalZones = structuredClone(show.zones)

    show = updateShowPhysicalZoneSelection(show, 'layout-1', 'zone-1', [0, 1, 2, 3])
    show = updateShowPhysicalZoneSelection(show, 'layout-1', 'zone-2', [4, 5, 6, 7])

    expect(show.zones).toEqual(originalZones)
    expect(show.routingLayouts[0].zones).toEqual([
      { zoneId: 'zone-1', ranges: [{ start: 0, end: 3 }] },
      { zoneId: 'zone-2', ranges: [{ start: 4, end: 7 }] },
    ])
    expect(validateInstallationCoverage(show)).toMatchObject({
      valid: true,
      pixelCount: 8,
      layouts: [expect.objectContaining({
        assignedPixelCount: 8,
        missingPixelCount: 0,
        overlappingPixelCount: 0,
        outOfRangePixelCount: 0,
        totalPixelCount: 8,
      })],
    })
  })
})
