// The authored output pixel count rule, and its v1/v2 parity (#1039).
//
// `validateShowAuthoring` classifies this in two ways that must both survive
// the port: a count that is not a positive safe integer is a STRUCTURAL ERROR
// (so the v1 candidate and resize admissions refuse it), while a count past
// SHOW_MAX_OUTPUT_PIXELS is a DELIVERY WARNING that leaves the Show authorable.
// Neither reached a `ShowRecordV2`.
import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import type { ShowOutputContract, ShowRecord } from './personalContentRecords'
import { validateShowAuthoring } from './showAuthoringValidation'
import { validateShowAuthoringV2 } from './showAuthoringValidationV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { SHOW_MAX_OUTPUT_PIXELS } from './showVmResourceLedger'

const source = () => 'export function render(index) { hsv(index, 1, 1) }'

function pair(outputContract: ShowOutputContract): { v1: ShowRecord; v2: ShowRecordV2 } {
  const v1 = convertibleV1Show()
  for (const instance of v1.composition!.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  v1.outputContract = structuredClone(outputContract)
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const v2 = converted.record
  for (const instance of v2.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  v2.outputContract = structuredClone(outputContract)
  // A physical Installation Layout would add its own coverage warning; keep the
  // converted routing operator so only the count rule speaks.
  return { v1, v2 }
}

const installation = (pixelCount: number): ShowOutputContract => ({
  version: 1, kind: 'installation', outputMapId: null, pixelCount, resolution: 'fixed',
})
const portable = (referencePixelCount: number): ShowOutputContract => ({
  version: 1,
  kind: 'portable-2d',
  referenceMapId: 'plane',
  referencePixelCount,
  compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
})

it.each([
  ['a fractional Installation count', installation(16.5)],
  ['a zero Installation count', installation(0)],
  ['a negative Installation count', installation(-16)],
  ['a count outside the safe integer range', installation(Number.MAX_SAFE_INTEGER + 2)],
  ['a fractional Portable reference count', portable(16.5)],
])('refuses %s as a structural error, exactly as v1 does', (_name, outputContract) => {
  const { v1, v2 } = pair(outputContract)
  const first = validateShowAuthoring(v1, { source, libraries: LIBRARIES })
  const second = validateShowAuthoringV2(v2, { source, libraries: LIBRARIES })
  const expected = {
    code: 'structure',
    diagnosticCode: 'invalid-output-count',
    message: 'The output pixel count must be a positive safe integer.',
    path: JSON.stringify(['outputContract', 'pixelCount']),
  }
  expect(first.valid).toBe(false)
  expect(first.errors).toContainEqual(expected)
  expect(second.valid).toBe(false)
  expect(second.errors).toContainEqual(expected)
  // v1 returns after its structural pass, so no delivery warning accompanies it.
  expect(first.warnings).toEqual([])
  expect(second.warnings).toEqual([])
})

it.each([
  ['Installation', installation(SHOW_MAX_OUTPUT_PIXELS + 1)],
  ['Portable', portable(SHOW_MAX_OUTPUT_PIXELS + 1)],
])('keeps an over-capacity %s count authorable and reports it as a delivery warning', (_name, outputContract) => {
  const { v1, v2 } = pair(outputContract)
  const first = validateShowAuthoring(v1, { source, libraries: LIBRARIES })
  const second = validateShowAuthoringV2(v2, { source, libraries: LIBRARIES })
  const expected = {
    code: 'delivery',
    message: `Show output requests ${(SHOW_MAX_OUTPUT_PIXELS + 1).toLocaleString('en-US')} pixels; compiled Shows support at most ${SHOW_MAX_OUTPUT_PIXELS.toLocaleString('en-US')}.`,
  }
  expect(first.valid).toBe(true)
  expect(first.warnings).toContainEqual(expected)
  expect(second.valid).toBe(true)
  expect(second.warnings).toContainEqual(expected)
})

it('stays silent at exactly the supported capacity', () => {
  const { v1, v2 } = pair(installation(SHOW_MAX_OUTPUT_PIXELS))
  for (const result of [
    validateShowAuthoring(v1, { source, libraries: LIBRARIES }),
    validateShowAuthoringV2(v2, { source, libraries: LIBRARIES }),
  ]) {
    expect(result.valid).toBe(true)
    expect(result.warnings.filter(issue => issue.message.startsWith('Show output requests'))).toEqual([])
  }
})
