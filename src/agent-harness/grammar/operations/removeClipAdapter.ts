import { z } from 'zod'
import { removeClipCommand } from '@/engine/showCommands/clips'
import { validateShowCommandInput } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue } from '../types.js'

export function canonicalRemoveClipOperation(): ShowGrammarOperation {
  const descriptor = removeClipCommand
  return {
    name: descriptor.name,
    description: descriptor.description,
    mutates: descriptor.touches,
    inputShape: Object.fromEntries(Object.entries(descriptor.fields).map(([name, field]) => {
      if (field.kind !== 'string' || field.optional) throw new Error(`Unsupported remove Clip field: ${name}`)
      return [name, z.string().describe(field.description)]
    })),
    validateInput: args => validateShowCommandInput(descriptor, args) as GrammarIssue[],
    apply(document, args) {
      const outcome = descriptor.apply(document.show, args)
      if (!outcome.ok) return { ok: false, issues: outcome.issues as GrammarIssue[] }
      return {
        ok: true,
        document: { ...document, show: outcome.record },
        changes: outcome.changes.map(change => ({ op: descriptor.name, targetId: change.targetId ?? args.clip_id as string, description: change.description, details: change.details })),
      }
    },
  }
}
