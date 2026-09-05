// Provenance: pxlblz-v3 src/experiment/turn.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// One dictation turn (#34): the harness, not the model, holds the
// transaction. The turn opens a transaction labelled with the utterance,
// runs the agent over the dictation tool list (the editing vocabulary only:
// registry operations plus the four read tools), and closes it by the
// contract the model is told: operations applied and a statement given
// commit as one history entry; a reply carrying a question mark asks, and
// an ask never changes the document, so the turn rolls back; a turn that
// applied nothing rolls back too. A commit refused by tier-0 validation
// comes back to the model once as a repair turn carrying the typed issues;
// a second refusal discards the edit and reports it. The corpus runner and
// the bridge both run turns through here so the two surfaces cannot drift.
import type { GrammarIssue } from '../grammar/types.js'
import type { EditorContext } from '../grammar/read.js'
import { SHOW_GRAMMAR_OPERATIONS } from '../grammar/registry.js'
import type { GrammarSessionStore } from '../grammar/session.js'
import type { ShowClipListing } from '../grammar/types.js'
import { listStockPatterns } from '../shows/stockCatalogue.js'
import type { AgentTurnContext, DictationAgent } from './runner.js'
import type { TurnTiming } from './timing.js'

/** Front-loaded once (#40): the stock catalogue's ids and dimensions, so an
 * ordinary add needs no catalogue call. Both surfaces hand the model this. */
const STOCK_PATTERNS = listStockPatterns().map((pattern) => ({ id: pattern.id, dimensions: pattern.dimensions }))

export function projectionForAgent(description: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...(description ?? {}), availableStockPatterns: STOCK_PATTERNS }
}

/** The harness-implemented tool that ends a turn in the same response as its
 * operations (#38). Not on the MCP server; the agent loops route it to
 * AgentTurnContext.finishTurn. */
export const FINISH_TURN_TOOL = {
  name: 'finish_turn',
  description:
    'End this turn now: include it in the SAME response as the operation calls that complete the ' +
    'request. The editor runs the operations first, commits them as one undo step, and replies with ' +
    'your one-line reply (or, if you give none, with the operations\u2019 own change descriptions) ' +
    'without another round trip. If an operation in this response is refused, or the commit fails, ' +
    'finish_turn returns the issues and you get another turn to fix or explain. A reply with a ' +
    'question mark is an ask and discards the edits.',
  inputSchema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'One line stating what changed, in the user\u2019s terms; omit to use the change descriptions.' },
    },
    additionalProperties: false,
  } as Record<string, unknown>,
}

/** Read tools the dictation loop keeps alongside the registry operations. */
export const DICTATION_READ_TOOLS = [
  'describe_show',
  'resolve_reference',
  'evaluate_property_at',
  'get_stock_pattern',
] as const

export function isDictationTool(name: string): boolean {
  return (
    (DICTATION_READ_TOOLS as readonly string[]).includes(name) ||
    SHOW_GRAMMAR_OPERATIONS.some((operation) => operation.name === name)
  )
}

/** The MCP tool list narrowed to what a dictation turn may call. Order is preserved
 * so the tool list is byte-stable across turns (prefix caching). */
/** The argument every operation tool gains in the dictation list (#38): set
 * it on the operation that completes the request and the turn ends there,
 * one model call, no parallel tool call needed. */
export const FINISH_ARGUMENT = 'finish_turn_reply'
const FINISH_ARGUMENT_SCHEMA = {
  type: 'string',
  description:
    'Set this when THIS operation completes the request: the editor commits the turn and replies with ' +
    'this one line without another round trip (an empty string replies from the change descriptions). ' +
    'Leave it out when more operations follow.',
}

function withFinishArgument<T extends { name: string; inputSchema?: unknown }>(tool: T): T {
  const isOperation = SHOW_GRAMMAR_OPERATIONS.some((operation) => operation.name === tool.name)
  const schema = tool.inputSchema as { type?: string; properties?: Record<string, unknown> } | undefined
  if (!isOperation || !schema || schema.type !== 'object') return tool
  return {
    ...tool,
    inputSchema: { ...schema, properties: { ...(schema.properties ?? {}), [FINISH_ARGUMENT]: FINISH_ARGUMENT_SCHEMA } },
  }
}

export function dictationTools<T extends { name: string; description?: string; inputSchema?: unknown }>(
  tools: T[],
): Array<T | typeof FINISH_TURN_TOOL> {
  return [...tools.filter((tool) => isDictationTool(tool.name)).map(withFinishArgument), FINISH_TURN_TOOL]
}

/** One requested tool call as the agent loops see it, provider-neutral. */
export interface RequestedCall {
  id: string
  name: string
  args: Record<string, unknown>
  /** Set when the provider's argument JSON did not parse. */
  parseError?: string
}

export interface RoundOutcome {
  /** One output per requested call, in the order they should be returned to the model. */
  outputs: Array<{ id: string; payload: unknown; isError: boolean }>
  /** Set when the turn ended inside this round; the loop returns this text without another model call. */
  ended: { finalText: string } | null
}

const FINISH_BLOCKED: { ok: false; issues: GrammarIssue[] } = {
  ok: false,
  issues: [{ code: 'invalid-argument', message: 'An operation in this response was refused; fix it before finishing the turn.' }],
}
const FINISH_UNAVAILABLE: { ok: false; issues: GrammarIssue[] } = {
  ok: false,
  issues: [{ code: 'invalid-argument', message: 'finish_turn is unavailable here; reply in text instead.' }],
}

/**
 * Run one round of tool calls the way both agent loops must (#38):
 * operations first in the order given, with finish_turn_reply stripped
 * before the call; then the turn ends if any operation carried
 * finish_turn_reply or a finish_turn call was present - only when no call
 * in the round was refused, otherwise finish is answered with the issues
 * and the loop continues. Provider formatting stays in the loops.
 */
export async function runToolRound(
  context: Pick<AgentTurnContext, 'callTool' | 'finishTurn'>,
  calls: RequestedCall[],
): Promise<RoundOutcome> {
  const outputs: RoundOutcome['outputs'] = []
  const operations = calls.filter((call) => call.name !== 'finish_turn')
  const finishes = calls.filter((call) => call.name === 'finish_turn')
  let roundHadError = false
  let inlineFinish: { id: string; reply: string | undefined } | null = null
  for (const call of operations) {
    const { [FINISH_ARGUMENT]: finishReply, ...args } = call.args
    const result = call.parseError
      ? { payload: { error: `arguments were not valid JSON: ${call.parseError}` }, isError: true }
      : await context.callTool(call.name, args)
    if (result.isError) roundHadError = true
    outputs.push({ id: call.id, payload: result.payload, isError: result.isError })
    if (typeof finishReply === 'string' && !result.isError && !inlineFinish) {
      inlineFinish = { id: call.id, reply: finishReply.trim() || undefined }
    }
  }
  const attempt = (reply: string | undefined) =>
    roundHadError ? FINISH_BLOCKED : context.finishTurn ? context.finishTurn(reply) : FINISH_UNAVAILABLE
  for (const call of finishes) {
    const reply = typeof call.args.reply === 'string' ? call.args.reply : undefined
    const ended = attempt(reply)
    if (ended.ok) return { outputs, ended: { finalText: ended.finalText } }
    outputs.push({ id: call.id, payload: ended, isError: true })
  }
  if (inlineFinish && finishes.length === 0) {
    const ended = attempt(inlineFinish.reply)
    if (ended.ok) return { outputs, ended: { finalText: ended.finalText } }
    // The operation itself succeeded; the refused finish rides on its output
    // so the model sees why the turn is still open.
    const own = outputs.find((output) => output.id === inlineFinish!.id)
    if (own) own.payload = { ...(own.payload as Record<string, unknown>), finish_turn: ended }
  }
  return { outputs, ended: null }
}

export type DialogueEntry = { role: 'user' | 'assistant'; text: string }

export interface DictationTurnInput {
  store: GrammarSessionStore
  sessionId: string
  agent: DictationAgent
  utterance: string
  history: DialogueEntry[]
  listing: ShowClipListing
  description: unknown
  instructions: string
  editorContext: EditorContext
  tools: AgentTurnContext['tools']
  callTool: AgentTurnContext['callTool']
  /** The scripted solution, for the fake agent only. */
  script?: AgentTurnContext['script']
}

export type TurnDisposition =
  | { kind: 'committed'; summary: string }
  | { kind: 'asked' }
  | { kind: 'nothing-applied' }
  | { kind: 'commit-refused'; issues: GrammarIssue[] }

export interface DictationTurnResult {
  finalText: string
  disposition: TurnDisposition
  /** One entry per model turn run (the repair turn adds a second). */
  timings: TurnTiming[]
}

/** The scorer's convention: a reply containing a question mark is an ask. */
export function isAsking(text: string): boolean {
  return text.includes('?')
}

function issueText(issues: GrammarIssue[]): string {
  return issues.map((issue) => (issue.remedy ? `${issue.message} ${issue.remedy}` : issue.message)).join(' ')
}

export async function runDictationTurn(input: DictationTurnInput): Promise<DictationTurnResult> {
  const { store, sessionId, agent } = input
  const begun = store.begin(sessionId, input.utterance)
  if (!begun.ok) {
    // A transaction left open is a harness defect, not a model one.
    throw new Error(`could not open the turn's transaction: ${issueText(begun.issues)}`)
  }
  const timings: TurnTiming[] = []
  // Set when the model ended the turn itself through finish_turn (#38).
  let finished: DictationTurnResult | null = null
  const finishTurn: NonNullable<AgentTurnContext['finishTurn']> = (reply) => {
    const text = reply?.trim() || ''
    const pending = store.pending(sessionId)
    const applied = pending.ok && pending.open ? pending.open.changes : 0
    if (text && isAsking(text)) {
      store.rollback(sessionId)
      finished = { finalText: text, disposition: { kind: 'asked' }, timings }
      return { ok: true, finalText: text }
    }
    if (applied === 0) {
      store.rollback(sessionId)
      const finalText = text || 'Nothing was changed.'
      finished = { finalText, disposition: { kind: 'nothing-applied' }, timings }
      return { ok: true, finalText }
    }
    const committed = store.commit(sessionId)
    if (!committed.ok) return { ok: false, issues: committed.issues }
    const finalText = text || committed.summary
    finished = { finalText, disposition: { kind: 'committed', summary: committed.summary }, timings }
    return { ok: true, finalText }
  }
  const runModel = async (utterance: string, history: DialogueEntry[], script?: AgentTurnContext['script']) => {
    const result = await agent.run({
      utterance,
      history,
      sessionId,
      listing: input.listing,
      description: input.description,
      instructions: input.instructions,
      editorContext: input.editorContext,
      tools: input.tools,
      callTool: input.callTool,
      finishTurn,
      ...(script ? { script } : {}),
    })
    if (result.timing) timings.push(result.timing)
    return result.finalText
  }

  const close = (finalText: string): DictationTurnResult | null => {
    const pending = store.pending(sessionId)
    const applied = pending.ok && pending.open ? pending.open.changes : 0
    if (isAsking(finalText)) {
      store.rollback(sessionId)
      return { finalText, disposition: { kind: 'asked' }, timings }
    }
    if (applied === 0) {
      store.rollback(sessionId)
      return { finalText, disposition: { kind: 'nothing-applied' }, timings }
    }
    const committed = store.commit(sessionId)
    if (committed.ok) {
      return { finalText, disposition: { kind: 'committed', summary: committed.summary }, timings }
    }
    return null
  }

  const firstText = await runModel(input.utterance, input.history, input.script)
  if (finished) return finished
  const first = close(firstText)
  if (first) return first

  // The commit was refused: one repair turn with the typed issues, then
  // either a clean commit or a discarded edit reported in the reply.
  const refusal = store.commit(sessionId)
  const issues = refusal.ok ? [] : refusal.issues
  const repairPrompt =
    `[editor] The edit could not be applied: ${issueText(issues)} ` +
    'Fix it with further operations and reply with one line, or explain in one line why it cannot be done.'
  const repairText = await runModel(repairPrompt, [
    ...input.history,
    { role: 'user', text: input.utterance },
    { role: 'assistant', text: firstText },
  ])
  if (finished) {
    const done = finished as DictationTurnResult
    return done.disposition.kind === 'committed'
      ? done
      : { ...done, finalText: `${done.finalText} The edit was discarded: ${issues[0]?.message ?? 'the document did not validate'}`, disposition: { kind: 'commit-refused', issues } }
  }
  const second = close(repairText)
  if (second && second.disposition.kind === 'committed') return second
  if (second) {
    // Rolled back already (asked or nothing further applied): the reply
    // must say the edit did not land.
    return {
      finalText: `${repairText} The edit was discarded: ${issues[0]?.message ?? 'the document did not validate'}`,
      disposition: { kind: 'commit-refused', issues },
      timings,
    }
  }
  const again = store.commit(sessionId)
  const finalIssues = again.ok ? issues : again.issues
  store.rollback(sessionId)
  return {
    finalText: `${repairText} The edit was discarded: ${finalIssues[0]?.message ?? 'the document did not validate'}`,
    disposition: { kind: 'commit-refused', issues: finalIssues },
    timings,
  }
}
