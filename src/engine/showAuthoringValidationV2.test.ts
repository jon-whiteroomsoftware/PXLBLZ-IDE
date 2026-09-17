import { expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import {
  captureAgentShowSnapshotV2,
  captureShowAuthoringBaselineV2,
  showPatternSitesV2,
  validateShowAuthoringV2,
} from './showAuthoringValidationV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { LIBRARIES } from '../pixelblaze/libs'

const VOICE = 'export function render(index) { hsv(index, 1, 1) }'

function record(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const next = converted.record
  for (const instance of next.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  return next
}

const source = (personal: string = VOICE) => (ref: { kind: string; id: string }) => (
  ref.kind === 'user' && ref.id === 'voice' ? personal : undefined
)
const unavailable = () => undefined

it('reports every Pattern site a v2 record owns, including Group definitions', () => {
  const next = record()
  next.composition.groupDefinitions.push({
    id: 'group', name: 'Group', layers: [], clips: [], transitions: [], propertyTracks: [],
    patternInstances: [{ id: 'inner', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 } }],
  })
  expect(showPatternSitesV2(next).map(site => site.owner)).toEqual([
    JSON.stringify(['instance', next.composition.patternInstances[0].id]),
    JSON.stringify(['group', 'group', 'instance', 'inner']),
  ])
})

it('accepts a complete v2 record whose Pattern sources resolve', () => {
  const result = validateShowAuthoringV2(record(), { source: source(), libraries: LIBRARIES })
  expect(result.valid).toBe(true)
  expect(result.errors).toEqual([])
})

it('refuses a candidate whose Pattern source is unavailable and has no baseline exception', () => {
  const result = validateShowAuthoringV2(record(), { source: unavailable, libraries: LIBRARIES })
  expect(result.valid).toBe(false)
  expect(result.errors.map(issue => issue.diagnosticCode)).toContain('pattern-reference-unavailable')
})

it('keeps an existing missing Pattern source a warning and a new one an error', () => {
  const next = record()
  const baseline = captureShowAuthoringBaselineV2(next, { source: unavailable, libraries: LIBRARIES })
  const existing = validateShowAuthoringV2(next, { source: unavailable, libraries: LIBRARIES, baseline, allowExistingMissing: true })
  expect(existing.valid).toBe(true)
  expect(existing.warnings.some(issue => issue.code === 'missing-reference')).toBe(true)
  next.composition.patternInstances.push({
    id: 'added', pattern: { kind: 'user', id: 'other' }, patternName: 'Other', time: { timeScale: 1, timeOffsetMs: 0 },
  })
  const added = validateShowAuthoringV2(next, { source: unavailable, libraries: LIBRARIES, baseline, allowExistingMissing: true })
  expect(added.valid).toBe(false)
  expect(added.errors.some(issue => issue.path === JSON.stringify(['instance', 'added']))).toBe(true)
})

it('refuses a control target and an animated control without authored slider metadata', () => {
  const next = record()
  const instance = next.composition.patternInstances[0]
  instance.controlTargets = { sliderMissing: 0.5 }
  const withTarget = validateShowAuthoringV2(next, { source: source(), libraries: LIBRARIES })
  expect(withTarget.errors.map(issue => issue.diagnosticCode)).toContain('control-metadata-unavailable')
  delete instance.controlTargets
  next.composition.propertyTracks.push({
    id: 'track', target: { kind: 'instance-control', instanceId: instance.id, exportName: 'sliderMissing' },
    activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'a', timeMs: 0, value: 0, easing: { curve: 'linear' } }, { id: 'b', timeMs: 1000, value: 1, easing: { curve: 'linear' } }],
  })
  const animated = validateShowAuthoringV2(next, { source: source(), libraries: LIBRARIES })
  expect(animated.errors.map(issue => issue.diagnosticCode)).toContain('control-metadata-unavailable')
})

it('accepts an authored slider the Pattern actually exports', () => {
  const next = record()
  next.composition.patternInstances[0].controlTargets = { sliderLevel: 0.25 }
  const result = validateShowAuthoringV2(next, {
    source: () => 'export function sliderLevel(v) { level = v }\nexport function render(index) { hsv(index, 1, level) }',
    libraries: LIBRARIES,
  })
  expect(result.errors).toEqual([])
  expect(result.valid).toBe(true)
})

it('refuses an unavailable Library reference the Pattern source needs', () => {
  const result = validateShowAuthoringV2(record(), {
    source: () => 'export function render(index) { Missing.paint(index) }',
    libraries: LIBRARIES,
  })
  expect(result.valid).toBe(false)
  expect(result.errors.map(issue => issue.diagnosticCode)).toContain('library-reference-unavailable')
})

it('reports a structurally or referentially invalid candidate as a structure error', () => {
  const next = record()
  next.composition.clips[0].layerId = 'gone'
  const result = validateShowAuthoringV2(next, { source: source(), libraries: LIBRARIES })
  expect(result.valid).toBe(false)
  expect(result.errors.some(issue => issue.code === 'structure')).toBe(true)
})

it('captures an immutable snapshot of a valid v2 record and refuses an invalid one', () => {
  const next = record()
  const snapshot = captureAgentShowSnapshotV2(next)
  expect(snapshot).toEqual(next)
  expect(snapshot).not.toBe(next)
  snapshot!.composition.clips[0].startMs = 5
  expect(next.composition.clips[0].startMs).toBe(0)
  const invalid = record()
  invalid.composition.clips[0].instanceId = 'gone'
  expect(captureAgentShowSnapshotV2(invalid)).toBeUndefined()
})
