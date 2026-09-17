// Pattern-instance and Marker time rules, and their v1/v2 parity (#1039).
//
// `validateShowComposition` requires a finite whole-millisecond time offset and
// a finite time scale on every Pattern instance, and
// `validateShowCompositionTimelineMetadata` requires a finite, nonnegative
// whole-millisecond Marker time. The v2 schema types all three as plain
// numbers and `validateShowRecordV2` never asked, so a v2 candidate could carry
// a fractional instance offset or a negative Marker time where v1 refuses it.
//
// The oracle is the v1 composition validator itself over the same authored
// number; the assertion is on the diagnostic code both versions report, which
// is what the admissions map.
import { expect, it } from 'vitest'
import { propertyEditRecord } from '../test/showV2PropertyEditsFixture'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import type { ShowCompositionV1 } from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import { validateShowRecordV2Domain, type ShowRecordV2 } from './showCompositionV2'

function v1Codes(mutate: (composition: ShowCompositionV1) => void) {
  const show = convertibleV1Show()
  const composition = structuredClone(show.composition!) as ShowCompositionV1
  mutate(composition)
  return validateShowComposition(show, composition).map(issue => issue.code)
}

function v2Codes(mutate: (record: ShowRecordV2) => void) {
  const record = propertyEditRecord()
  mutate(record)
  return validateShowRecordV2Domain(record).map(issue => issue.code)
}

it('refuses a fractional Pattern instance time offset, as v1 does', () => {
  expect(v1Codes(composition => { composition.patternInstances[0].time.timeOffsetMs = 10.5 })).toEqual(['not-integer'])
  expect(v2Codes(record => { record.composition.patternInstances[0].time.timeOffsetMs = 10.5 })).toEqual(['not-integer'])
})

it('admits a negative whole-millisecond instance time offset, as v1 does', () => {
  expect(v1Codes(composition => { composition.patternInstances[0].time.timeOffsetMs = -250 })).toEqual([])
  expect(v2Codes(record => { record.composition.patternInstances[0].time.timeOffsetMs = -250 })).toEqual([])
})

it('refuses a non-finite Pattern instance time scale, as v1 does', () => {
  expect(v1Codes(composition => { composition.patternInstances[0].time.timeScale = Number.NaN })).toEqual(['not-finite'])
  expect(v2Codes(record => { record.composition.patternInstances[0].time.timeScale = Number.NaN })).toEqual(['not-finite'])
})

it('refuses a fractional Marker time, as v1 does', () => {
  expect(v1Codes(composition => { composition.markers = [{ id: 'marker', name: 'Cue', timeMs: 10.5 }] })).toEqual(['not-integer'])
  expect(v2Codes(record => { record.composition.markers = [{ id: 'marker', name: 'Cue', timeMs: 10.5 }] })).toEqual(['not-integer'])
})

it('refuses a negative Marker time, as v1 does', () => {
  expect(v1Codes(composition => { composition.markers = [{ id: 'marker', name: 'Cue', timeMs: -5 }] })).toEqual(['out-of-bounds'])
  expect(v2Codes(record => { record.composition.markers = [{ id: 'marker', name: 'Cue', timeMs: -5 }] })).toEqual(['out-of-bounds'])
})

it('keeps a dormant Marker past Show End admitted, as v1 does', () => {
  // Specification section 3: dormant Markers may exceed Show End. Neither
  // version bounds a Marker above, and this port does not add one.
  expect(v1Codes(composition => { composition.markers = [{ id: 'marker', name: 'Cue', timeMs: 900_000 }] })).toEqual([])
  expect(v2Codes(record => { record.composition.markers = [{ id: 'marker', name: 'Cue', timeMs: 900_000 }] })).toEqual([])
})
