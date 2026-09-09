// #951: the diagnostic language adapter derives move from the V2 registry.
// The connected spelling is retired from both callable catalogues.
import { z, type ZodTypeAny } from 'zod'
import { SHOW_COMMANDS, applyShowCommand, validateShowCommandInput } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'

export function canonicalMoveOperation(): ShowGrammarOperation {
  const descriptor = SHOW_COMMANDS.find(command => command.name === 'move_clip')!
  const inputShape = Object.fromEntries(Object.entries(descriptor.fields).map(([key, field]) => {
    // This deliberately handles only the canonical move schema. A new kind
    // must be qualified here instead of silently acquiring a generic tool.
    let schema: ZodTypeAny
    if (field.kind === 'string') schema = z.string()
    else if (field.kind === 'integer') schema = field.safeInteger ? z.number().int().safe() : z.number().int()
    else if (field.kind === 'layer') schema = z.union([z.literal('main'), z.number().int().safe().min(0)])
    else throw new Error(`Unsupported move schema kind: ${field.kind}`)
    if (field.optional) schema = schema.optional()
    return [key, schema.describe(field.description)]
  }))
  return {
    name: descriptor.name,
    description: descriptor.description,
    mutates: descriptor.touches,
    inputShape,
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const outcome = applyShowCommand(document.show, descriptor.name, args)
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return {
        ok: true,
        document: outcome.record === document.show ? document : { ...document, show: outcome.record },
        changes: outcome.changes.map(change => ({ op: descriptor.name, targetId: change.targetId!, description: change.description, details: change.details })),
      }
    },
  }
}
