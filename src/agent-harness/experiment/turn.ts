// Provenance: pxlblz-v3 src/experiment/turn.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// #949: The harness owns one private transaction. Explicit typed completion
// stages validation; only normal agent return may commit. Reply punctuation
// never controls mutation. Missing/malformed completion and abnormal return
// discard all pending work. A final-validation refusal gets one repair run.
// Private commit is not live-editor application or durable persistence.
//
// #945 correction (integration review): a turn that ends abnormally - the
// agent reports a typed incompletion (its round limit tripped) or throws -
// is discarded, never committed. Before this, exhaustion returned ordinary
// text that the close path read as a statement and committed the pending
// operations as a partial candidate.
//
// #945 repair (candidate review of a4e11cc0): finish_turn no longer commits
// inside agent.run. It validates the working copy exactly as a commit would
// (so a refusal still reaches the model for repair) and stages the outcome;
// the runner commits or rolls back only once the agent has returned
// normally. An incompletion or exception after finish_turn therefore
// discards the turn, and a second finish_turn in the same run is refused.
//
// #945 repair (candidate review of 54f47d5b): a tool round's finishes take
// effect in the order they occur. Before, the round ran every explicit
// finish_turn call before the inline finish_turn_reply it had collected, so
// an operation that asked, followed by the then-string finish_turn("Done."), committed.
import type { GrammarIssue } from '../grammar/types.js'
import type { EditorContext } from '../grammar/read.js'
import { SHOW_GRAMMAR_OPERATIONS } from '../grammar/registry.js'
import type { GrammarSessionStore } from '../grammar/session.js'
import type { ShowClipListing } from '../grammar/types.js'
import { listStockPatterns } from '../shows/stockCatalogue.js'
import type { AgentTurnContext, DictationAgent, TurnCompletion, TurnIncompletion } from './runner.js'
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
const COMPLETION_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['apply', 'ask', 'refuse', 'incomplete'], description: 'apply validates private edits; all other intents discard them.' },
    reply: { type: 'string', description: 'One-line reply; punctuation has no effect on the outcome. Omit to use change descriptions.' },
  },
  required: ['intent'],
  additionalProperties: false,
} as Record<string, unknown>

export const FINISH_TURN_TOOL = {
  name: 'finish_turn',
  description: 'End this turn in the SAME response as its final operations. Supply explicit apply, ask, refuse or incomplete intent. Apply validates private work as one history entry after normal return; it does not mean the live editor applied or saved it. Refused operations or validation return issues for repair. No extra acknowledgement round trip is needed.',
  inputSchema: {
    ...COMPLETION_SCHEMA,
    properties: {
      ...(COMPLETION_SCHEMA.properties as Record<string, unknown>),
      session_id: { type: 'string', description: 'Optional transport identity; when supplied it must match the current session.' },
    },
  },
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
  ...COMPLETION_SCHEMA,
  description: 'Set a typed {intent, reply?} completion on the final operation to end in this response. Leave it out when more operations follow.',
}

/** Validate provider data at the boundary; unknown keys cannot carry contradictory intent. */
export function completionFrom(value: unknown): TurnCompletion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'intent' && key !== 'reply')) return null
  if (!['apply', 'ask', 'refuse', 'incomplete'].includes(record.intent as string)) return null
  if (record.reply !== undefined && typeof record.reply !== 'string') return null
  return record as unknown as TurnCompletion
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
  issues: [{ code: 'invalid-argument', message: 'finish_turn is unavailable here; a transaction owner is required for typed completion.' }],
}

/**
 * Run one round of tool calls the way both agent loops must (#38):
 * operations first in the order given, with finish_turn_reply stripped
 * before the call. The round's finishes are then attempted in the order they
 * take effect - an inline finish_turn_reply when its operation completes, an
 * explicit finish_turn after every operation, in the order listed - and the
 * first that succeeds ends the turn; every later one is still attempted so
 * the turn module's duplicate refusal is recorded on its call. No finish
 * succeeds in a round in which any call was refused: each is answered with
 * the issues and the loop continues. Provider formatting stays in the loops.
 */
export async function runToolRound(
  context: Pick<AgentTurnContext, 'callTool' | 'finishTurn'> & Partial<Pick<AgentTurnContext, 'sessionId'>>,
  calls: RequestedCall[],
): Promise<RoundOutcome> {
  const outputs: RoundOutcome['outputs'] = []
  const operations = calls.filter((call) => call.name !== 'finish_turn')
  const explicitFinishes = calls.filter((call) => call.name === 'finish_turn')
  let roundHadError = false
  /** Finish requests in the order they take effect. */
  const requests: Array<{ id: string; completion: unknown; inline: boolean; parseError?: string; wrongSession?: boolean }> = []
  for (const call of operations) {
    const { [FINISH_ARGUMENT]: finishReply, ...args } = call.args
    const result = call.parseError
      ? { payload: { error: `arguments were not valid JSON: ${call.parseError}` }, isError: true }
      : await context.callTool(call.name, args)
    if (result.isError) roundHadError = true
    outputs.push({ id: call.id, payload: result.payload, isError: result.isError })
    if (finishReply !== undefined && !result.isError) {
      requests.push({ id: call.id, completion: finishReply, inline: true })
    }
  }
  for (const call of explicitFinishes) {
    const args = call.args
    const hasSession = args && typeof args === 'object' && !Array.isArray(args) && Object.prototype.hasOwnProperty.call(args, 'session_id')
    const wrongSession = !!hasSession && (typeof args.session_id !== 'string' || args.session_id !== context.sessionId)
    const completion = hasSession ? Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'session_id')) : args
    requests.push({ id: call.id, completion, inline: false, parseError: call.parseError, wrongSession })
  }
  let ended: RoundOutcome['ended'] = null
  for (const request of requests) {
    const completion = request.parseError ? null : completionFrom(request.completion)
    const outcome = roundHadError ? FINISH_BLOCKED
      : request.wrongSession ? { ok: false as const, issues: [{ code: 'invalid-argument' as const, message: 'finish_turn session_id must match the current session.' }] }
      : !completion ? { ok: false as const, issues: [{ code: 'invalid-argument' as const, message: 'Finish requires a valid explicit intent and optional string reply.' }] }
        : context.finishTurn ? context.finishTurn(completion) : FINISH_UNAVAILABLE
    if (outcome.ok) {
      if (!ended) ended = { finalText: outcome.finalText }
      continue
    }
    if (request.inline) {
      // The operation itself succeeded; the refused finish rides on its output
      // so the model sees why the turn is still open (or that it already ended).
      const own = outputs.find((output) => output.id === request.id)
      if (own) own.payload = { ...(own.payload as Record<string, unknown>), finish_turn: outcome }
    } else {
      outputs.push({ id: request.id, payload: outcome, isError: true })
    }
  }
  return { outputs, ended }
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
  | { kind: 'refused' }
  | { kind: 'nothing-applied' }
  | { kind: 'commit-refused'; issues: GrammarIssue[] }
  /** The agent ended abnormally; the pending operations were discarded (#945). */
  | { kind: 'incomplete'; reason: TurnIncompletion['reason']; discardedChanges: number }

export interface DictationTurnResult {
  finalText: string
  disposition: TurnDisposition
  /** One entry per model turn run (the repair turn adds a second). */
  timings: TurnTiming[]
}

function issueText(issues: GrammarIssue[]): string {
  return issues.map((issue) => (issue.remedy ? `${issue.message} ${issue.remedy}` : issue.message)).join(' ')
}

export async function runDictationTurn(input: DictationTurnInput): Promise<DictationTurnResult> {
  const { store, sessionId, agent } = input
  const begun = store.begin(sessionId, input.utterance)
  if (!begun.ok) throw new Error(`could not open the turn's transaction: ${issueText(begun.issues)}`)
  const timings: TurnTiming[] = []
  let staged: TurnCompletion | null = null
  let validationIssues: GrammarIssue[] | null
  let invalidFinish: boolean
  const abandon = (): number => {
    const pending = store.pending(sessionId)
    const count = pending.ok && pending.open ? pending.open.changes : 0
    if (pending.ok && pending.open) store.rollback(sessionId)
    return count
  }
  const incomplete = (text: string, reason: TurnIncompletion['reason']): DictationTurnResult => {
    const discardedChanges = abandon()
    return {
      finalText: discardedChanges ? `${text} The pending changes were discarded.` : text,
      disposition: { kind: 'incomplete', reason, discardedChanges },
      timings,
    }
  }
  const finishTurn: NonNullable<AgentTurnContext['finishTurn']> = (value) => {
    if (staged) return { ok: false, issues: [{ code: 'invalid-argument', message: 'finish_turn was already called this turn; the first successful finish stands.' }] }
    const completion = completionFrom(value)
    if (!completion) {
      invalidFinish = true
      return { ok: false, issues: [{ code: 'invalid-argument', message: 'Finish requires a valid explicit intent and optional string reply.' }] }
    }
    if (completion.intent === 'apply') {
      const checked = store.validatePending(sessionId)
      if (!checked.ok) {
        validationIssues = checked.issues
        return checked
      }
      staged = { ...completion, reply: completion.reply?.trim() || checked.summary || 'Nothing was changed.' }
    } else {
      staged = { ...completion, reply: completion.reply?.trim() || 'Nothing was changed.' }
    }
    return { ok: true, finalText: staged.reply! }
  }
  let utterance = input.utterance
  let history = input.history
  for (let attempt = 0; attempt < 2; attempt += 1) {
    staged = null
    validationIssues = null
    invalidFinish = false
    let result: Awaited<ReturnType<DictationAgent['run']>>
    try {
      result = await agent.run({
        utterance, history, sessionId, listing: input.listing,
        description: input.description, instructions: input.instructions,
        editorContext: input.editorContext, tools: input.tools,
        callTool: input.callTool, finishTurn,
        ...(attempt === 0 && input.script ? { script: input.script } : {}),
      })
    } catch (error) {
      abandon()
      throw error
    }
    if (result.timing) timings.push(result.timing)
    if (result.incomplete) return incomplete(result.finalText, result.incomplete.reason)
    // Adapters may return typed completion directly. A contradictory envelope
    // cannot override a finish already staged by a tool in the same run.
    if (result.completion !== undefined) {
      const returned = completionFrom(result.completion)
      const prior = staged as TurnCompletion | null
      if (!returned || (prior && returned.intent !== prior.intent)) return incomplete(result.finalText, 'invalid-finish')
      if (!prior) finishTurn(returned)
    }
    const outcome = staged as TurnCompletion | null
    if (outcome) {
      const finalText = outcome.reply!
      if (outcome.intent === 'incomplete') return incomplete(finalText, 'model-incomplete')
      if (outcome.intent === 'ask' || outcome.intent === 'refuse') {
        abandon()
        return { finalText, disposition: { kind: outcome.intent === 'ask' ? 'asked' : 'refused' }, timings }
      }
      const pending = store.pending(sessionId)
      if (pending.ok && pending.open?.changes === 0) {
        abandon()
        return { finalText, disposition: { kind: 'nothing-applied' }, timings }
      }
      const committed = store.commit(sessionId)
      if (committed.ok) return { finalText, disposition: { kind: 'committed', summary: committed.summary }, timings }
      validationIssues = committed.issues
    }
    const issues = validationIssues as GrammarIssue[] | null
    if (!issues) return incomplete(result.finalText, invalidFinish ? 'invalid-finish' : 'missing-finish')
    if (attempt === 1) {
      abandon()
      return { finalText: `${result.finalText} The edit was discarded: ${issueText(issues)}`, disposition: { kind: 'commit-refused', issues }, timings }
    }
    utterance = `[editor] The edit could not be applied: ${issueText(issues)} Fix it with further operations and finish with explicit apply intent, or finish with ask/refuse to discard it.`
    history = [...input.history, { role: 'user', text: input.utterance }, { role: 'assistant', text: result.finalText }]
  }
  throw new Error('unreachable turn completion')
}
