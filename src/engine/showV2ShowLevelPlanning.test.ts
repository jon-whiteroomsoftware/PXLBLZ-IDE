import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { DEFAULT_SHOW_TRAILS_RETENTION } from './showPreviousRgbFeedback'
import {
  planShowV2PortableReferenceEdit,
  planShowV2SetShowEnd,
  planShowV2TrailsEdit,
} from './showV2ShowLevelPlanning'

function portableRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

it('rounds a fractional Show End exactly as the v1 owner does', () => {
  const record = portableRecord()
  expect(planShowV2SetShowEnd(record, 10_000.5)).toEqual({
    kind: 'intent',
    intent: { kind: 'set-show-end', showEndMs: 10_001 },
  })
})

it('refuses a non-positive or non-integer Show End before any owner', () => {
  const record = portableRecord()
  expect(planShowV2SetShowEnd(record, 0)).toEqual({ kind: 'refuse' })
  expect(planShowV2SetShowEnd(record, -500)).toEqual({ kind: 'refuse' })
  expect(planShowV2SetShowEnd(record, Number.NaN)).toEqual({ kind: 'refuse' })
  expect(planShowV2SetShowEnd(record, Number.POSITIVE_INFINITY)).toEqual({ kind: 'refuse' })
})

it('reports an unchanged Show End as no-op', () => {
  const record = portableRecord()
  expect(planShowV2SetShowEnd(record, record.composition.showEndMs)).toEqual({ kind: 'no-op' })
})

it('leaves a shortened Show End to the owner instead of clamping it', () => {
  const record = portableRecord()
  const plan = planShowV2SetShowEnd(record, 500)
  expect(plan).toEqual({ kind: 'intent', intent: { kind: 'set-show-end', showEndMs: 500 } })
})

it('enables Trails at the default retention when none is given', () => {
  const record = portableRecord()
  expect(planShowV2TrailsEdit(record, { enabled: true })).toEqual({
    kind: 'intent',
    intent: { command: 'set_output_trails', input: { enabled: true, retention: DEFAULT_SHOW_TRAILS_RETENTION } },
  })
})

it('clamps an out-of-range Trails retention exactly as v1 does', () => {
  const record = portableRecord()
  expect(planShowV2TrailsEdit(record, { enabled: true, retention: 2 })).toEqual({
    kind: 'intent',
    intent: { command: 'set_output_trails', input: { enabled: true, retention: 1 } },
  })
  expect(planShowV2TrailsEdit(record, { enabled: true, retention: -1 })).toEqual({
    kind: 'intent',
    intent: { command: 'set_output_trails', input: { enabled: true, retention: 0 } },
  })
})

it('reports unchanged Trails state as no-op and refuses a non-boolean switch', () => {
  const record = portableRecord()
  expect(planShowV2TrailsEdit(record, { enabled: false })).toEqual({ kind: 'no-op' })
  const enabled = planShowV2TrailsEdit(record, { enabled: true, retention: 0.25 })
  if (enabled.kind !== 'intent') throw new Error('expected intent')
  const on: ShowRecordV2 = { ...record, outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.25 }] }
  expect(planShowV2TrailsEdit(on, { enabled: true, retention: 0.25 })).toEqual({ kind: 'no-op' })
  expect(planShowV2TrailsEdit(on, { enabled: true, retention: Number.NaN })).toEqual({ kind: 'no-op' })
  expect(planShowV2TrailsEdit(record, { enabled: 'yes' as unknown as boolean })).toEqual({ kind: 'refuse' })
})

it('disables running Trails with the owner\'s bare switch', () => {
  const record = portableRecord()
  const on: ShowRecordV2 = { ...record, outputEffects: [{ id: 'trails', kind: 'trails', retention: 0.25 }] }
  expect(planShowV2TrailsEdit(on, { enabled: false })).toEqual({
    kind: 'intent',
    intent: { command: 'set_output_trails', input: { enabled: false } },
  })
})

it('floors a fractional portable pixel count exactly as v1 does', () => {
  const record = portableRecord()
  expect(planShowV2PortableReferenceEdit(record, 'plane', 17.9)).toEqual({
    kind: 'intent',
    intent: { command: 'set_output_contract', input: { kind: 'portable-2d', pixel_count: 17, map_id: 'plane' } },
  })
  expect(planShowV2PortableReferenceEdit(record, 'plane', 16.9)).toEqual({ kind: 'no-op' })
})

it('treats a blank portable map as none and matching values as no-op', () => {
  const record = portableRecord()
  expect(record.outputContract).toMatchObject({ kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 16 })
  expect(planShowV2PortableReferenceEdit(record, 'plane', 16)).toEqual({ kind: 'no-op' })
  expect(planShowV2PortableReferenceEdit(record, '   ', 16)).toEqual({
    kind: 'intent',
    intent: { command: 'set_output_contract', input: { kind: 'portable-2d', pixel_count: 16, map_id: null } },
  })
})

it('refuses a portable edit on an installation contract or an unshippable map identity', () => {
  const record = portableRecord()
  const installation: ShowRecordV2 = {
    ...record,
    outputContract: { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' },
  }
  expect(planShowV2PortableReferenceEdit(installation, 'plane', 16)).toEqual({ kind: 'refuse' })
  expect(planShowV2PortableReferenceEdit(record, 42 as unknown as string, 16)).toEqual({ kind: 'refuse' })
  expect(planShowV2PortableReferenceEdit(record, 'x'.repeat(201), 16)).toEqual({ kind: 'refuse' })
})
