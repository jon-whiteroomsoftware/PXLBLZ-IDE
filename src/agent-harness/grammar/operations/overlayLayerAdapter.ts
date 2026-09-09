import { z } from 'zod'
import { createOverlayLayerCommand, overlayLayerCommandOutcome } from '@/engine/showCommands/overlayLayer'
import { validateShowCommandInput } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'
import { idFactory } from '../support.js'

export function canonicalOverlayLayerOperation(): ShowGrammarOperation {
  const descriptor = createOverlayLayerCommand()
  return {
    name: descriptor.name,
    description: descriptor.description,
    mutates: descriptor.touches,
    inputShape: Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => {
      if (field.kind !== 'string' || field.optional) throw new Error(`Unsupported Layer field: ${name}`)
      return [name, z.string().describe(field.description)]
    })),
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const newId = idFactory(document)
      const outcome = overlayLayerCommandOutcome(document.show, args, () => newId('layer'))
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return {
        ok: true,
        document: { ...document, show: outcome.record },
        changes: outcome.changes.map(change => ({ op: descriptor.name, targetId: change.targetId, description: change.description, details: change.details })),
      }
    },
  }
}
