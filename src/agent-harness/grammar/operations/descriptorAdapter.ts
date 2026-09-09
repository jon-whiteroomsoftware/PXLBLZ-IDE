import { validateShowEasing } from '@/engine/showEasing'
import { z, type ZodTypeAny } from 'zod'
import { validateShowCommandInput, type ShowCommandDescriptor, type ShowCommandField, type ShowCommandOutcome } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'

function fieldSchema(field: ShowCommandField): ZodTypeAny {
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

/** One schema/result bridge; callers retain their existing local identity policy. */
export function descriptorOperation(
  descriptor: ShowCommandDescriptor,
  apply: (document: ShowGrammarDocument, args: Record<string, unknown>) => ShowCommandOutcome = (document, args) => descriptor.apply(document.show, args),
): ShowGrammarOperation {
  return {
    name: descriptor.name,
    description: descriptor.description,
    mutates: descriptor.touches,
    inputShape: Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => [name, fieldSchema(field)])),
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const outcome = apply(document, args)
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return {
        ok: true,
        document: outcome.record === document.show ? document : { ...document, show: outcome.record },
        changes: outcome.changes.map(({ command: _command, ...change }) => ({ ...change, op: descriptor.name, targetId: change.targetId! })),
      }
    },
  }
}
