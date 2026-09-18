import { expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { PersonalStorageGuardError } from './resourceProtection'
import { cloneValidShowRecordV2ForWorker } from './showV2Codec'

it('validates a v2 replacement when dynamic code generation is unavailable', () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const originalFunction = globalThis.Function
  globalThis.Function = function forbidden(): never {
    throw new Error('Code generation from strings disallowed for this context')
  } as unknown as FunctionConstructor
  try {
    expect(cloneValidShowRecordV2ForWorker(converted.record)).toEqual(converted.record)
  } finally {
    globalThis.Function = originalFunction
  }
})

it('keeps Worker admission structurally closed', () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(() => cloneValidShowRecordV2ForWorker({ ...converted.record, hidden: true }))
    .toThrow(/additional properties/i)
})

it('preserves known conversion provenance and refuses an unknown Marker origin', () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const chapter = converted.record.composition.markers.find(marker => marker.origin === 'converted-scene-label')
  expect(chapter, 'the conversion corpus must contain a converted Scene label').toBeDefined()
  expect(cloneValidShowRecordV2ForWorker(converted.record).composition.markers.find(marker => marker.id === chapter!.id)?.origin)
    .toBe('converted-scene-label')

  const tampered = structuredClone(converted.record)
  tampered.composition.markers = tampered.composition.markers.map(marker => (
    marker.id === chapter!.id ? { ...marker, origin: 'converted-clip' as unknown as 'converted-scene-label' } : marker
  ))
  // The interpreter reports the outermost mismatch, so assert the refusal itself:
  // an unsupported provenance value never reaches storage.
  expect(() => cloneValidShowRecordV2ForWorker(tampered)).toThrow(PersonalStorageGuardError)
  expect(() => cloneValidShowRecordV2ForWorker(tampered)).toThrow(/Invalid Show v2 record/)
})
