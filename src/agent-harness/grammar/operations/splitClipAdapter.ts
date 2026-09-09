import { z } from 'zod'
import { createSplitClipCommand, splitClipCommandOutcome } from '@/engine/showCommands/splitClip'
import { validateShowCommandInput } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'
import { idFactory } from '../support.js'

export function canonicalSplitClipOperation(): ShowGrammarOperation {
  const descriptor = createSplitClipCommand()
  return {
    name: descriptor.name,
    description: descriptor.description,
    mutates: descriptor.touches,
    inputShape: Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => {
      if (field.optional || (field.kind !== 'string' && field.kind !== 'number')) throw new Error(`Unsupported split Clip field: ${name}`)
      return [name, (field.kind === 'string' ? z.string() : z.number()).describe(field.description)]
    })),
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const newId = idFactory(document)
      const outcome = splitClipCommandOutcome(document.show, args, () => newId('clip'))
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return { ok: true, document: { ...document, show: outcome.record }, changes: outcome.changes.map(change => ({
        op: descriptor.name, targetId: change.targetId, description: change.description, details: change.details,
      })) }
    },
  }
}
