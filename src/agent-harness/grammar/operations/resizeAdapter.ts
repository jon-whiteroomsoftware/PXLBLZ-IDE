// #950: the diagnostic language adapter derives resize from the V2 registry.
// Historical resize_connected_clip remains diagnostic compatibility only.
import { z, type ZodTypeAny } from 'zod'
import { SHOW_COMMANDS, applyShowCommand, validateShowCommandInput } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'

export function canonicalResizeOperation(name = 'resize_clip'): ShowGrammarOperation {
  const descriptor = SHOW_COMMANDS.find(command => command.name === 'resize_clip')!
  const inputShape = Object.fromEntries(Object.entries(descriptor.fields).map(([key, field]) => {
    // This deliberately handles only the canonical resize schema. A new kind
    // must be qualified here instead of silently acquiring a generic tool.
    let schema: ZodTypeAny
    if (field.kind === 'string') schema = z.string()
    else if (field.kind === 'integer') schema = field.safeInteger ? z.number().int().safe() : z.number().int()
    else throw new Error(`Unsupported resize schema kind: ${field.kind}`)
    if (field.optional) schema = schema.optional()
    return [key, schema.describe(field.description)]
  }))
  return {
    name,
    description: `${name === 'resize_clip' ? '' : 'Historical diagnostic compatibility; use resize_clip. '}${descriptor.description}`,
    mutates: descriptor.touches,
    inputShape,
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const outcome = applyShowCommand(document.show, descriptor.name, args)
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return {
        ok: true,
        document: outcome.record === document.show ? document : { ...document, show: outcome.record },
        changes: outcome.changes.map(change => ({ op: name, targetId: change.targetId!, description: change.description, details: change.details })),
      }
    },
  }
}
