import { expect, it } from 'vitest'
import { commandFixtureV2 } from './showCommandsV2/fixtures'
import type { ShowRecordV2 } from './showCompositionV2'
import { validateInstallationCoverage } from './showInstallationCoverage'
import { validateInstallationCoverageV2 } from './showInstallationCoverageV2'

/** A two-Zone Installation record whose two Zone Layouts each cover 16 pixels. */
function installation(pixelCount = 16): ShowRecordV2 {
  const record = commandFixtureV2()
  record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount, resolution: 'fixed' }
  record.zoneLayouts = [
    { id: 'both', name: 'Both', zones: [
      { zoneId: 'left', ranges: [{ start: 0, end: 7 }] },
      { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
    ] },
    { id: 'left-only', name: 'Left only', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 15 }] }] },
  ]
  return record
}

it('reads the v2 record\'s own Zone Layouts, layout by layout', () => {
  const record = installation()
  expect(validateInstallationCoverageV2(record)).toMatchObject({
    valid: true,
    pixelCount: 16,
    layouts: [{ layoutId: 'both', valid: true }, { layoutId: 'left-only', valid: true }],
  })

  record.zoneLayouts[1].zones = [{ zoneId: 'left', ranges: [{ start: 0, end: 3 }] }]
  expect(validateInstallationCoverageV2(record)).toMatchObject({
    valid: false,
    layouts: [
      { layoutId: 'both', valid: true },
      { layoutId: 'left-only', valid: false, assignedPixelCount: 4, missingPixelCount: 12, totalPixelCount: 16 },
    ],
  })
})

it('returns null for a Portable Show, exactly as the v1 entry point does', () => {
  const portable = commandFixtureV2()
  expect(validateInstallationCoverageV2(portable)).toBeNull()
  expect(validateInstallationCoverage({ outputContract: portable.outputContract, routingLayouts: portable.zoneLayouts })).toBeNull()
})

it('treats a logical Zone Layout in an Installation Show as full-output routing', () => {
  const record = installation()
  record.zoneLayouts[1] = { id: 'left-only', name: 'Left only', zones: [], logical: { kind: 'single', zoneIds: ['left'] } }
  expect(validateInstallationCoverageV2(record)).toMatchObject({
    valid: true,
    layouts: [{ kind: 'physical' }, { kind: 'logical', assignedPixelCount: 16, missingPixelCount: 0 }],
  })
})

it('matches the v1 rule over the same authored data for every coverage fault', () => {
  // One rule, not two: the v2 entry point supplies only the record's own field
  // name. Each partition below is a state the counterexample named.
  const partitions: Array<{ name: string; ranges: Array<{ start: number; end: number }> }> = [
    { name: 'complete', ranges: [{ start: 0, end: 15 }] },
    { name: 'incomplete', ranges: [{ start: 0, end: 3 }] },
    { name: 'overlapping', ranges: [{ start: 0, end: 11 }, { start: 4, end: 15 }] },
    { name: 'out of range', ranges: [{ start: 0, end: 15 }, { start: 16, end: 19 }] },
    // v1 floors each endpoint, so 14.75 owns pixel 14 and pixel 15 goes missing.
    { name: 'fractional endpoints', ranges: [{ start: 0.5, end: 14.75 }] },
    { name: 'over capacity', ranges: [{ start: 0, end: 63 }] },
    { name: 'empty', ranges: [] },
  ]
  for (const partition of partitions) {
    const record = installation()
    record.zoneLayouts = [{ id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: partition.ranges }] }]
    const v1Shape = { outputContract: record.outputContract, routingLayouts: record.zoneLayouts }
    expect(validateInstallationCoverageV2(record), partition.name)
      .toEqual(validateInstallationCoverage(v1Shape))
  }

  // The comparison above is only meaningful if the partitions actually differ.
  const verdicts = partitions.map(partition => {
    const record = installation()
    record.zoneLayouts = [{ id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: partition.ranges }] }]
    return validateInstallationCoverageV2(record)!.valid
  })
  expect(verdicts).toEqual([true, false, false, false, false, false, false])
})
