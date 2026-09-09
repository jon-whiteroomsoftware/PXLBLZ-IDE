import { z, type ZodTypeAny } from 'zod'
import { validateShowCommandInput } from '@/engine/showCommands/registry'
import { SHOW_MARKER_COMMANDS, markerCommandOutcome } from '@/engine/showCommands/timeline'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'
import { idFactory } from '../support.js'

/** Finite marker schema adapter; diagnostic identity minting remains local. */
export function canonicalMarkerOperations(): ShowGrammarOperation[] {
  return SHOW_MARKER_COMMANDS.map(descriptor => ({
    name: descriptor.name,
    description: descriptor.description,
    mutates: descriptor.touches,
    inputShape: Object.fromEntries(Object.entries(descriptor.fields).map(([key, field]) => {
      let schema: ZodTypeAny
      if (field.kind === 'string') schema = z.string()
      else if (field.kind === 'integer' && field.safeInteger) schema = z.number().int().safe()
      else throw new Error(`Unsupported marker schema kind: ${field.kind}`)
      if (field.optional) schema = schema.optional()
      return [key, schema.describe(field.description)]
    })),
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const outcome = markerCommandOutcome(document.show, descriptor.name, args, () => idFactory(document)('marker'))
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return {
        ok: true,
        document: outcome.record === document.show ? document : { ...document, show: outcome.record },
        changes: outcome.changes.map(change => ({ op: descriptor.name, targetId: change.targetId, description: change.description })),
      }
    },
  }))
}
