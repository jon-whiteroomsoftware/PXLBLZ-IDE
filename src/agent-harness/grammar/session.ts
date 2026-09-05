// Provenance: pxlblz-v3 src/grammar/session.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// In-memory editing sessions for the grammar tools: transactions, undo/redo,
// tier-0 validation at commit, and change summaries (#17, #20). Pure state —
// no MCP or transport imports; the server holds one store per process.
//
// The transaction is the unit that maps onto the v2 editor's undo group and
// onto "one agent turn": begin_edit opens a working copy, registry operations
// apply to it with tier-0 deferred, and commit_edit validates the result and
// pushes exactly one history entry. An operation called outside a transaction
// is auto-wrapped in a single-operation transaction, so it validates and
// commits immediately and produces one history entry, exactly as in #17.
import type { ShowRecord } from '@/engine/personalContentRecords'
import { validateShowDocument, type InlinePattern, type ShowEvaluationOptions } from '../shows/evaluate.js'
import { openShowDocument, projectClipListing } from './openShow.js'
import {
  describeShow,
  evaluatePropertyAt,
  resolveReference,
  type EditorContext,
  type PropertyEvaluation,
  type ReferenceQuery,
  type ReferenceResolution,
  type ShowDescription,
} from './read.js'
import { applyShowGrammarOperation } from './registry.js'
import type { GrammarChange, GrammarIssue, ShowClipListing, ShowGrammarDocument } from './types.js'

export interface HistoryEntrySummary {
  index: number
  label: string
  summary: string
  changes: GrammarChange[]
}

interface HistoryEntry {
  label: string
  summary: string
  changes: GrammarChange[]
  before: ShowGrammarDocument
  after: ShowGrammarDocument
}

interface OpenTransaction {
  label: string
  working: ShowGrammarDocument
  changes: GrammarChange[]
}

export interface GenericUseEntry {
  operation: string
  pointers: string[]
  transaction: string | null
}

interface Session {
  document: ShowGrammarDocument
  past: HistoryEntry[]
  future: HistoryEntry[]
  open: OpenTransaction | null
  context: EditorContext
  genericUse: GenericUseEntry[]
}

type Refusal = { ok: false; issues: GrammarIssue[] }

export interface GrammarSessionStore {
  open: (
    input: unknown,
    inlinePatterns?: InlinePattern[],
    options?: ShowEvaluationOptions,
  ) => { ok: true; sessionId: string; listing: ShowClipListing } | Refusal
  apply: (
    sessionId: string,
    operation: string,
    args: Record<string, unknown>,
  ) =>
    | { ok: true; changes: GrammarChange[]; listing: ShowClipListing; transaction?: string }
    | Refusal
  begin: (sessionId: string, label?: string) => { ok: true; label: string } | Refusal
  commit: (
    sessionId: string,
  ) => { ok: true; label: string; summary: string; changes: GrammarChange[]; listing: ShowClipListing } | Refusal
  rollback: (sessionId: string) => { ok: true; label: string; discardedChanges: number } | Refusal
  /** The open transaction, if any: its label and how many changes it holds. */
  pending: (sessionId: string) => { ok: true; open: { label: string; changes: number } | null } | Refusal
  undo: (sessionId: string) => { ok: true; label: string; summary: string; listing: ShowClipListing } | Refusal
  redo: (sessionId: string) => { ok: true; label: string; summary: string; listing: ShowClipListing } | Refusal
  describeChanges: (
    sessionId: string,
    entryIndex?: number,
  ) => { ok: true; entries: HistoryEntrySummary[] } | Refusal
  setContext: (sessionId: string, context: EditorContext) => { ok: true; context: EditorContext } | Refusal
  getContext: (sessionId: string) => { ok: true; context: EditorContext } | Refusal
  resolve: (
    sessionId: string,
    query: ReferenceQuery,
  ) => ({ ok: true } & ReferenceResolution) | Refusal
  describe: (sessionId: string) => { ok: true; description: ShowDescription } | Refusal
  evaluate: (
    sessionId: string,
    trackId: string,
    atMs: number,
  ) => { ok: true; evaluation: PropertyEvaluation } | Refusal
  genericUse: (sessionId: string) => { ok: true; uses: GenericUseEntry[] } | Refusal
  export: (sessionId: string) => { ok: true; show: ShowRecord } | Refusal
  close: (sessionId: string) => { ok: true; sessionId: string } | Refusal
}

/** One line of prose an agent can echo to the user. */
function summarize(changes: GrammarChange[]): string {
  return changes.map((change) => change.description).join(' ')
}

/** Generic-operation use is the gap list for specific operations (#22). */
function logGenericUse(
  session: Session,
  operation: string,
  changes: GrammarChange[],
  transaction: string | null,
): void {
  if (operation !== 'set_field' && operation !== 'apply_patch') return
  session.genericUse.push({
    operation,
    pointers: changes.flatMap((change) => (change.details?.pointers as string[] | undefined) ?? []),
    transaction,
  })
}

export function createSessionStore(): GrammarSessionStore {
  const sessions = new Map<string, Session>()
  let counter = 0

  function unknownSession(sessionId: string): Refusal {
    const known = [...sessions.keys()]
    return {
      ok: false,
      issues: [{
        code: 'unknown-session',
        message:
          known.length === 0
            ? `No session "${sessionId}" is open; no sessions exist. Open one with open_show.`
            : `No session "${sessionId}" is open. Open sessions: ${known.join(', ')}.`,
        candidates: known,
      }],
    }
  }

  function requireSession(sessionId: string): { ok: true; session: Session } | Refusal {
    const session = sessions.get(sessionId)
    return session ? { ok: true, session } : unknownSession(sessionId)
  }

  function commitEntry(session: Session, entry: HistoryEntry): void {
    session.past.push(entry)
    session.future = []
    session.document = entry.after
  }

  return {
    open(input, inlinePatterns = [], options = {}) {
      const opened = openShowDocument(input, inlinePatterns, options)
      if (!opened.ok) return opened
      counter += 1
      const sessionId = `show-${counter}`
      sessions.set(sessionId, {
        document: opened.document,
        past: [],
        future: [],
        open: null,
        context: {},
        genericUse: [],
      })
      return { ok: true, sessionId, listing: opened.listing }
    },

    apply(sessionId, operation, args) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found

      if (session.open) {
        const outcome = applyShowGrammarOperation(session.open.working, operation, args, {
          validateResult: false,
        })
        if (!outcome.ok) return outcome
        session.open.working = outcome.document
        session.open.changes.push(...outcome.changes)
        logGenericUse(session, operation, outcome.changes, session.open.label)
        return {
          ok: true,
          changes: outcome.changes,
          listing: projectClipListing(outcome.document),
          transaction: session.open.label,
        }
      }

      // Auto-wrapped single-operation transaction: validate and commit now.
      const outcome = applyShowGrammarOperation(session.document, operation, args)
      if (!outcome.ok) return outcome
      commitEntry(session, {
        label: operation,
        summary: summarize(outcome.changes),
        changes: outcome.changes,
        before: session.document,
        after: outcome.document,
      })
      logGenericUse(session, operation, outcome.changes, null)
      return { ok: true, changes: outcome.changes, listing: projectClipListing(outcome.document) }
    },

    begin(sessionId, label) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      if (session.open) {
        return {
          ok: false,
          issues: [{
            code: 'transaction-open',
            message: `Transaction "${session.open.label}" is already open; transactions do not nest.`,
            remedy: 'Commit it with commit_edit or discard it with rollback_edit first.',
          }],
        }
      }
      const resolved = label?.trim() || 'edit'
      session.open = { label: resolved, working: session.document, changes: [] }
      return { ok: true, label: resolved }
    },

    commit(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      if (!session.open) {
        return {
          ok: false,
          issues: [{
            code: 'no-transaction',
            message: 'No transaction is open; begin one with begin_edit.',
          }],
        }
      }
      const { label, working, changes } = session.open
      const validation = validateShowDocument(working.show, working.inlinePatterns, working.options)
      if (!validation.valid) {
        return {
          ok: false,
          issues: validation.errors.map((issue) => ({
            code: 'result-invalid' as const,
            message: `[${issue.code}] ${issue.message}`,
            ...(issue.path ? { path: issue.path } : {}),
            remedy:
              'The transaction stays open: fix the document with further operations and commit again, ' +
              'or discard it with rollback_edit.',
          })),
        }
      }
      const summary = changes.length > 0 ? summarize(changes) : 'No operations were applied.'
      commitEntry(session, { label, summary, changes, before: session.document, after: working })
      session.open = null
      return { ok: true, label, summary, changes, listing: projectClipListing(session.document) }
    },

    rollback(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      if (!session.open) {
        return {
          ok: false,
          issues: [{
            code: 'no-transaction',
            message: 'No transaction is open; there is nothing to roll back.',
          }],
        }
      }
      const { label, changes } = session.open
      session.open = null
      return { ok: true, label, discardedChanges: changes.length }
    },

    pending(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { open } = found.session
      return { ok: true, open: open ? { label: open.label, changes: open.changes.length } : null }
    },

    undo(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      if (session.open) {
        return {
          ok: false,
          issues: [{
            code: 'transaction-open',
            message: `Transaction "${session.open.label}" is open; undo operates on committed entries.`,
            remedy: 'Commit it with commit_edit or discard it with rollback_edit first.',
          }],
        }
      }
      const entry = session.past.pop()
      if (!entry) {
        return {
          ok: false,
          issues: [{ code: 'history-exhausted', message: 'Nothing to undo; the history is at its beginning.' }],
        }
      }
      session.future.push(entry)
      session.document = entry.before
      return {
        ok: true,
        label: entry.label,
        summary: `Undid "${entry.label}": ${entry.summary}`,
        listing: projectClipListing(session.document),
      }
    },

    redo(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      if (session.open) {
        return {
          ok: false,
          issues: [{
            code: 'transaction-open',
            message: `Transaction "${session.open.label}" is open; redo operates on committed entries.`,
            remedy: 'Commit it with commit_edit or discard it with rollback_edit first.',
          }],
        }
      }
      const entry = session.future.pop()
      if (!entry) {
        return {
          ok: false,
          issues: [{ code: 'history-exhausted', message: 'Nothing to redo; the history is at its end.' }],
        }
      }
      session.past.push(entry)
      session.document = entry.after
      return {
        ok: true,
        label: entry.label,
        summary: `Redid "${entry.label}": ${entry.summary}`,
        listing: projectClipListing(session.document),
      }
    },

    describeChanges(sessionId, entryIndex) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const entries = found.session.past.map((entry, index) => ({
        index,
        label: entry.label,
        summary: entry.summary,
        changes: entry.changes,
      }))
      if (entryIndex === undefined) return { ok: true, entries }
      const entry = entries[entryIndex]
      if (!entry) {
        return {
          ok: false,
          issues: [{
            code: 'history-exhausted',
            message:
              entries.length === 0
                ? 'The history is empty.'
                : `No history entry ${entryIndex}; entries run 0–${entries.length - 1}.`,
          }],
        }
      }
      return { ok: true, entries: [entry] }
    },

    setContext(sessionId, context) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      found.session.context = structuredClone(context ?? {})
      return { ok: true, context: found.session.context }
    },

    getContext(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      return { ok: true, context: structuredClone(found.session.context) }
    },

    resolve(sessionId, query) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      const active = session.open?.working ?? session.document
      const result = resolveReference(active, session.context, query ?? {})
      if ('issue' in result) return { ok: false, issues: [result.issue] }
      return { ok: true, ...result }
    },

    describe(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      return { ok: true, description: describeShow(session.open?.working ?? session.document, session.context) }
    },

    evaluate(sessionId, trackId, atMs) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      const { session } = found
      return evaluatePropertyAt(session.open?.working ?? session.document, trackId, atMs)
    },

    genericUse(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      return { ok: true, uses: structuredClone(found.session.genericUse) }
    },

    export(sessionId) {
      const found = requireSession(sessionId)
      if (!found.ok) return found
      return { ok: true, show: structuredClone(found.session.document.show) }
    },

    close(sessionId) {
      if (!sessions.has(sessionId)) return unknownSession(sessionId)
      sessions.delete(sessionId)
      return { ok: true, sessionId }
    },
  }
}
