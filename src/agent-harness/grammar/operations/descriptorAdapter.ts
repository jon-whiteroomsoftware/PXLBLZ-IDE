import { showCommandInputShape } from '@/engine/showCommands/descriptorSchema'
import { capturedShowCommandContext } from '../../shows/evaluate'
import { validateShowCommandInput, type ShowCommandDescriptor, type ShowCommandOutcome } from '@/engine/showCommands/registry'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'

/** One schema/result bridge; callers retain their existing local identity policy. */
export function descriptorOperation(
  descriptor: ShowCommandDescriptor,
  apply: (document: ShowGrammarDocument, args: Record<string, unknown>) => ShowCommandOutcome = (document, args) => descriptor.apply(document.show, args, capturedShowCommandContext(document.inlinePatterns, document.options)),
): ShowGrammarOperation {
  return {
    name: descriptor.name,
    description: descriptor.description,
    mutates: descriptor.touches,
    inputShape: showCommandInputShape(descriptor),
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
