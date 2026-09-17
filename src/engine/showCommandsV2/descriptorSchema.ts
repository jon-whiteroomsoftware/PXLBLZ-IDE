// Transport-neutral zod shapes for the prepared v2 descriptors. Canonical
// validation still owns cross-field rules; this only tells a tool caller what
// shape is accepted. There is no `json` kind to fall back on.
import { z, type ZodTypeAny } from 'zod'
import { validateShowEasing } from '../showEasing'
import type { ShowCommandV2Descriptor, ShowCommandV2Field } from './registry'

const EASING_PRESETS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const

export function showCommandV2FieldSchema(field: ShowCommandV2Field): ZodTypeAny {
  let schema: ZodTypeAny
  switch (field.kind) {
    case 'string': {
      let text = field.enum ? z.enum(field.enum as [string, ...string[]]) : z.string()
      if (!field.enum && field.maxLength !== undefined) text = (text as z.ZodString).max(field.maxLength)
      schema = text
      break
    }
    case 'number': {
      let value = z.number().finite()
      if (field.minimum !== undefined) value = value.min(field.minimum)
      if (field.maximum !== undefined) value = value.max(field.maximum)
      schema = value
      break
    }
    case 'integer': {
      let value = z.number().int().safe()
      if (field.minimum !== undefined) value = value.min(field.minimum)
      if (field.maximum !== undefined) value = value.max(field.maximum)
      schema = value
      break
    }
    case 'boolean':
      schema = z.boolean()
      break
    case 'easing':
      schema = z.union([
        z.enum(EASING_PRESETS),
        z.object({ curve: z.string() }).passthrough().refine(value => validateShowEasing(value).valid),
      ])
      break
    case 'object':
      schema = z.object(Object.fromEntries(
        Object.entries(field.properties).map(([name, property]) => [name, showCommandV2FieldSchema(property)]),
      )).strict()
      break
    case 'array':
      schema = z.array(showCommandV2FieldSchema(field.items)).min(field.minItems).max(field.maxItems)
      break
    case 'record':
      schema = z.record(showCommandV2FieldSchema(field.values))
      break
    case 'union':
      schema = z.union(field.variants.map(showCommandV2FieldSchema) as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
      break
  }
  if (field.nullable) schema = schema.nullable()
  if (field.optional) schema = schema.optional()
  return schema.describe(field.description)
}

export function showCommandV2InputShape(descriptor: ShowCommandV2Descriptor): Record<string, ZodTypeAny> {
  return Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => [name, showCommandV2FieldSchema(field)]))
}
