import { expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
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
