import { expect, it } from 'vitest'
import { z } from 'zod'
import type { ShowCommandDescriptor, ShowCommandField } from '@/engine/showCommands/registry'
import { descriptorOperation } from '../grammar/operations/descriptorAdapter'

it.each<[ShowCommandField, unknown[], unknown[]]>([
  [{ kind: 'string', description: 'text' }, ['a'], [1, null]],
  [{ kind: 'string', enum: ['a', 'b'], description: 'choice' }, ['a', 'b'], ['c', 1]],
  [{ kind: 'number', description: 'finite' }, [0, 1.5], [NaN, Infinity, '1']],
  [{ kind: 'integer', description: 'integer' }, [1, 2 ** 54], [1.5, Infinity]],
  [{ kind: 'integer', safeInteger: true, description: 'safe' }, [Number.MAX_SAFE_INTEGER], [2 ** 54, 1.5]],
  [{ kind: 'boolean', description: 'flag' }, [true, false], [0, 'true']],
  [{ kind: 'easing', description: 'curve' }, ['ease-in', { curve: 'sine', direction: 'out' }], ['wrong', { curve: 'wrong' }, { curve: 'steps', steps: Infinity }, null]],
  [{ kind: 'json', description: 'data' }, [{ a: 1 }, [], 1, 'a'], [null]],
  [{ kind: 'layer', description: 'Layer' }, ['main', 0, 3], [-1, 0.5, '0', 2 ** 54]],
  [{ kind: 'string', nullable: true, optional: true, description: 'optional' }, [undefined, null, 'a'], [1]],
])('maps descriptor field %j without widening admission', (field, accepted, refused) => {
  const descriptor: ShowCommandDescriptor = { name: 'test', description: 'test', touches: [], fields: { value: field }, apply: record => ({ ok: true, record, changes: [] }) }
  const operation = descriptorOperation(descriptor)
  for (const value of accepted) {
    expect(operation.validateInput!({ value })).toEqual([])
    expect(z.object(operation.inputShape).safeParse({ value }).success).toBe(true)
  }
  for (const value of refused) {
    expect(operation.validateInput!({ value })).not.toEqual([])
    expect(z.object(operation.inputShape).safeParse({ value }).success).toBe(false)
  }
})

it('retains exactly-one and unknown-field validation', () => {
  const field: ShowCommandField = { kind: 'number', optional: true, description: 'time' }
  const operation = descriptorOperation({ name: 'test', description: 'test', touches: [], fields: { end: field, duration: field }, exactlyOne: ['end', 'duration'], apply: record => ({ ok: true, record, changes: [] }) })
  expect(operation.validateInput!({ end: 1 })).toEqual([])
  for (const args of [{}, { end: 1, duration: 2 }, { end: 1, extra: true }]) expect(operation.validateInput!(args)).not.toEqual([])
})
