import { z, type ZodTypeAny } from 'zod'
import { validateShowEasing } from '../showEasing'
import type { ShowCommandDescriptor, ShowCommandField } from './registry'

export function showCommandFieldSchema(field: ShowCommandField): ZodTypeAny {
  let schema: ZodTypeAny
  switch (field.kind) {
    case 'string': schema = field.enum ? z.enum(field.enum as [string, ...string[]]) : z.string(); break
    case 'number': {
      let numberSchema = z.number().finite()
      if (field.minimum !== undefined) numberSchema = numberSchema.min(field.minimum)
      if (field.maximum !== undefined) numberSchema = numberSchema.max(field.maximum)
      schema = numberSchema
      break
    }
    case 'integer': {
      let integerSchema = field.safeInteger ? z.number().int().safe() : z.number().int()
      if (field.minimum !== undefined) integerSchema = integerSchema.min(field.minimum)
      if (field.maximum !== undefined) integerSchema = integerSchema.max(field.maximum)
      schema = integerSchema
      break
    }
    case 'boolean': schema = z.boolean(); break
    case 'easing': schema = z.union([z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']), z.record(z.unknown()).refine(value => validateShowEasing(value).valid)]); break
    case 'json': schema = z.unknown().refine(value => value !== null && value !== undefined); break
    case 'layer': schema = z.union([z.literal('main'), z.number().int().safe().min(0)]); break
    case 'object': schema = z.object(Object.fromEntries(Object.entries(field.properties).map(([name, property]) => [name, showCommandFieldSchema(property)]))).strict(); break
    case 'array': {
      let arraySchema = z.array(showCommandFieldSchema(field.items))
      if (field.minItems !== undefined) arraySchema = arraySchema.min(field.minItems)
      if (field.maxItems !== undefined) arraySchema = arraySchema.max(field.maxItems)
      schema = arraySchema
      break
    }
    case 'record': schema = z.record(showCommandFieldSchema(field.values)); break
    case 'union': schema = z.union(field.variants.map(showCommandFieldSchema) as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]); break
  }
  if (field.nullable) schema = schema.nullable()
  if (field.optional) schema = schema.optional()
  return schema.describe(field.description)
}

/** Transport-neutral shape; canonical validation still owns cross-field rules. */
export function showCommandInputShape(descriptor: ShowCommandDescriptor): Record<string, ZodTypeAny> {
  return Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => [name, showCommandFieldSchema(field)]))
}
