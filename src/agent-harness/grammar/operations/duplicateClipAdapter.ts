import { z } from 'zod'
import { createDuplicateClipCommand, duplicateClipCommandOutcome } from '@/engine/showCommands/duplicateClip'
import { validateShowCommandInput } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'
import { idFactory } from '../support.js'

export function canonicalDuplicateClipOperation(): ShowGrammarOperation {
  const descriptor = createDuplicateClipCommand()
  return {
    name: descriptor.name, description: descriptor.description, mutates: descriptor.touches,
    inputShape: Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => {
      if (field.kind !== 'string' && field.kind !== 'boolean') throw new Error(`Unsupported duplicate Clip field: ${name}`)
      const schema = (field.kind === 'string' ? z.string() : z.boolean()).describe(field.description)
      return [name, field.optional ? schema.optional() : schema]
    })),
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const outcome = duplicateClipCommandOutcome(document.show, args, idFactory(document))
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return { ok: true, document: { ...document, show: outcome.record }, changes: outcome.changes.map(change => ({
        op: descriptor.name, targetId: change.targetId, description: change.description, details: change.details,
      })) }
    },
  }
}
