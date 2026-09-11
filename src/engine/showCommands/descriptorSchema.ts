import { z, type ZodTypeAny } from 'zod'
import { validateShowEasing } from '../showEasing'
import type { ShowCommandDescriptor, ShowCommandField } from './registry'

export function showCommandFieldSchema(field: ShowCommandField): ZodTypeAny {
  let schema: ZodTypeAny
  switch (field.kind) {
    case 'string': schema = field.enum ? z.enum(field.enum as [string, ...string[]]) : z.string(); break
    case 'number': schema = z.number().finite(); break
    case 'integer': schema = field.safeInteger ? z.number().int().safe() : z.number().int(); break
    case 'boolean': schema = z.boolean(); break
    case 'easing': schema = z.union([z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']), z.record(z.unknown()).refine(value => validateShowEasing(value).valid)]); break
    case 'json': schema = z.unknown().refine(value => value !== null && value !== undefined); break
    case 'layer': schema = z.union([z.literal('main'), z.number().int().safe().min(0)]); break
  }
  if (field.nullable) schema = schema.nullable()
  if (field.optional) schema = schema.optional()
  return schema.describe(field.description)
}

/** Transport-neutral shape; canonical validation still owns cross-field rules. */
export function showCommandInputShape(descriptor: ShowCommandDescriptor): Record<string, ZodTypeAny> {
  return Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => [name, showCommandFieldSchema(field)]))
}
