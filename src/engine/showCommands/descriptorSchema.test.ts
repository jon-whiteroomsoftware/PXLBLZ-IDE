import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SHOW_COMMANDS, type ShowCommandField } from './registry'
import { showCommandFieldSchema, showCommandInputShape } from './descriptorSchema'

describe('canonical descriptor schema projection', () => {
  it.each([
    [{ kind: 'number' }, [0, 0.5], [NaN, Infinity, '1']],
    [{ kind: 'integer', safeInteger: true }, [0, 1], [0.5, Number.MAX_SAFE_INTEGER + 1]],
    [{ kind: 'layer' }, ['main', 0, 2], [-1, 0.5, '0']],
    [{ kind: 'string', enum: ['a', 'b'] }, ['a', 'b'], ['', 'c']],
    [{ kind: 'boolean' }, [true, false], [0, 'true']],
    [{ kind: 'easing' }, ['linear', { curve: 'hold', at: 0.5 }], ['other', { curve: 'hold', at: -1 }]],
    [{ kind: 'json' }, [{}, [], 0], [null, undefined]],
  ] as const)('preserves field domain %j', (field, valid, invalid) => {
    const schema = showCommandFieldSchema({ ...field, description: 'field' } as ShowCommandField)
    for (const value of valid) expect(schema.safeParse(value).success).toBe(true)
    for (const value of invalid) expect(schema.safeParse(value).success).toBe(false)
  })
  it('distinguishes optional from nullable and projects every canonical field', () => {
    expect(showCommandFieldSchema({ kind: 'string', description: '', optional: true }).safeParse(null).success).toBe(false)
    expect(showCommandFieldSchema({ kind: 'string', description: '', nullable: true }).safeParse(undefined).success).toBe(false)
    expect(showCommandFieldSchema({ kind: 'string', description: '', optional: true, nullable: true }).safeParse(null).success).toBe(true)
    for (const descriptor of SHOW_COMMANDS) {
      const shape = showCommandInputShape(descriptor)
      expect(Object.keys(shape)).toEqual(Object.keys(descriptor.fields))
      expect(z.object(shape).strict().safeParse({ unexpected: true }).success).toBe(false)
    }
  })
})
