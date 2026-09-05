// Provenance: pxlblz-v3 src/experiment/runner.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// The dictation runner (#23): drives an agent through the live MCP server
// for one corpus case, records the full transcript, and scores it
// deterministically. Scoring is a pure function over (case, transcript), so
// replay mode re-scores a recorded transcript byte-identically without any
// model call; the scripted fake agent executes each case's intended solution
// through the same protocol path a live model uses.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { createShowsServer } from '../mcp/showsServer.js'
import { createSessionStore, type GrammarSessionStore } from '../grammar/session.js'
import { DICTATION_RULES, type EditorContext } from '../grammar/read.js'
import type { GrammarIssue, ShowClipListing } from '../grammar/types.js'
import { evaluateAssertion, type AssertionResult, type DictationCase, type ScriptStep } from './corpus.js'
import { dictationFixture, fixtureSetup } from './fixtures.js'
import {
  mergeTurnTimings,
  summarizeCaseTiming,
  type CaseTiming,
  type CaseTimingSummary,
  type TurnTiming,
} from './timing.js'
import { FINISH_ARGUMENT, dictationTools, projectionForAgent, runDictationTurn } from './turn.js'

export interface TranscriptToolEvent {
  type: 'tool'
  tool: string
  args: Record<string, unknown>
  result: unknown
  isError: boolean
}

export interface TranscriptTextEvent {
  type: 'text'
  text: string
}

export type TranscriptEvent = TranscriptToolEvent | TranscriptTextEvent

export interface DictationTranscript {
  caseId: string
  agent: string
  events: TranscriptEvent[]
  finalText: string
  /** History entries the agent committed (setup entries excluded). */
  transactions: number
  /** Commits per conversation turn; absent on transcripts recorded before followups existed. */
  turnTransactions?: number[]
  genericUses: Array<{ operation: string; pointers: string[]; transaction: string | null }>
  finalShow: ShowRecord
  /** Latency and token telemetry (#33); absent on fake runs and on transcripts recorded before it. */
  timing?: CaseTiming
}

/** What an agent sees and can do while handling one utterance. */
export interface AgentTurnContext {
  utterance: string
  /**
   * Prior exchanges of the same conversation, oldest first. The document
   * state is NOT carried here - each turn re-reads the live Show - but the
   * dialogue thread is, so a bare "yes" or "ten seconds" lands against the
   * agent's own previous question. Absent in the single-turn corpus runs.
   */
  history?: Array<{ role: 'user' | 'assistant'; text: string }>
  sessionId: string
  listing: ShowClipListing
  /** The compact Show projection at turn start, as the IDE would provide. */
  description: unknown
  instructions: string
  editorContext: EditorContext
  tools: Array<{ name: string; description?: string; inputSchema: unknown }>
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ payload: unknown; isError: boolean }>
  /**
   * End the turn from inside the same response as the operations (#38): the
   * harness commits and replies without another model call. Refused with the
   * typed issues when the working copy does not validate; the agent then
   * continues its loop. Absent when no turn module holds the transaction.
   */
  finishTurn?: (reply?: string) => { ok: true; finalText: string } | { ok: false; issues: GrammarIssue[] }
  /** The scripted solution, present for the fake agent only. */
  script?: ScriptStep[]
}

export type DictationAgent = {
  name: string
  run: (context: AgentTurnContext) => Promise<{ finalText: string; timing?: TurnTiming }>
}

interface Harness {
  store: GrammarSessionStore
  client: Client
  sessionId: string
  listing: ShowClipListing
  editorContext: EditorContext
  description: unknown
}

/** '$clipAt:0'-style placeholders resolved against the live session. */
function resolvePlaceholder(store: GrammarSessionStore, sessionId: string, token: string): unknown {
  const described = store.describe(sessionId)
  if (!described.ok) throw new Error('describe failed during placeholder resolution')
  const description = described.description
  const clips = description.zones.flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
  const [kind, ...parts] = token.slice(1).split(':')

  if (kind === 'clipAt') {
    const startMs = Number(parts[0])
    const clip = clips.find((candidate) => candidate.startMs === startMs)
    if (!clip) throw new Error(`no clip at ${startMs} ms for ${token}`)
    return clip.clipId
  }
  if (kind === 'patternClip') {
    const needle = parts[0].toLowerCase()
    const clip = clips.find((candidate) => candidate.patternName.toLowerCase().includes(needle))
    if (!clip) throw new Error(`no clip matching pattern "${parts[0]}"`)
    return clip.clipId
  }
  if (kind === 'overlayClip') {
    const overlay = description.zones
      .flatMap((zone) => zone.layers)
      .find((layer) => layer.kind === 'overlay')
    const clip = overlay?.clips[0]
    if (!clip) throw new Error('no overlay clip')
    return clip.clipId
  }
  if (kind === 'markerAt') {
    const timeMs = Number(parts[0])
    const marker = description.markers.find((candidate) => candidate.timeMs === timeMs)
    if (!marker) throw new Error(`no marker at ${timeMs} ms`)
    return marker.markerId
  }
  if (kind === 'trackOf' || kind === 'keyframeOf') {
    const startMs = Number(parts[0])
    const needle = parts[1].toLowerCase()
    const clip = clips.find((candidate) => candidate.startMs === startMs)
    const track = clip?.tracks.find((candidate) => candidate.target.toLowerCase().includes(needle))
    if (!track) throw new Error(`no "${parts[1]}" track on the clip at ${startMs} ms`)
    if (kind === 'trackOf') return track.trackId
    const exported = store.export(sessionId)
    if (!exported.ok) throw new Error('export failed during placeholder resolution')
    const composition = exported.show.composition as {
      scenes: Array<{ propertyTracks?: Array<{ id: string; keyframes: Array<{ id: string }> }> }>
    }
    const raw = composition.scenes
      .flatMap((scene) => scene.propertyTracks ?? [])
      .find((candidate) => candidate.id === track.trackId)
    const keyframe = raw?.keyframes[Number(parts[2])]
    if (!keyframe) throw new Error(`no keyframe ${parts[2]} on track ${track.trackId}`)
    return keyframe.id
  }
  if (kind === 'effectOf') {
    const startMs = Number(parts[0])
    const clip = clips.find((candidate) => candidate.startMs === startMs)
    const effect = clip?.effects.find((candidate) => candidate.kind === parts[1])
    if (!effect) throw new Error(`no ${parts[1]} Effect on the clip at ${startMs} ms`)
    return effect.effectId
  }
  if (kind === 'layerTransition') {
    const junctions = description.zones
      .flatMap((zone) => zone.layers)
      .flatMap((layer) => layer.junctions)
      .filter((junction) => junction.layerTransitionId !== null)
    const junction = junctions[Number(parts[0])]
    if (!junction) throw new Error(`no layer transition ${parts[0]}`)
    return junction.layerTransitionId
  }
  throw new Error(`unknown placeholder ${token}`)
}

export function resolveArgs(
  store: GrammarSessionStore,
  sessionId: string,
  args: Record<string, unknown>,
  previousTarget?: string,
): Record<string, unknown> {
  const resolveValue = (value: unknown): unknown => {
    if (typeof value === 'string' && value.startsWith('$')) {
      if (value === '$prevTarget') {
        if (!previousTarget) throw new Error('$prevTarget with no previous step')
        return previousTarget
      }
      return resolvePlaceholder(store, sessionId, value)
    }
    if (Array.isArray(value)) return value.map(resolveValue)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, resolveValue(child)]),
      )
    }
    return value
  }
  return resolveValue(args) as Record<string, unknown>
}

async function prepareHarness(dictationCase: DictationCase): Promise<Harness> {
  const store = createSessionStore()
  const server = createShowsServer({ sessions: store })
  const client = new Client({ name: 'dictation-runner', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)

  const opened = store.open(dictationFixture(dictationCase.fixture))
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  const sessionId = opened.sessionId

  for (const step of [...fixtureSetup(dictationCase.fixture), ...(dictationCase.setup ?? [])]) {
    const outcome = store.apply(sessionId, step.operation, resolveArgs(store, sessionId, step.args))
    if (!outcome.ok) {
      throw new Error(`setup ${step.operation} refused: ${JSON.stringify(outcome.issues)}`)
    }
  }

  const editorContext: EditorContext = {}
  const context = dictationCase.context
  if (context) {
    const clipIdAt = (startMs: number) =>
      resolvePlaceholder(store, sessionId, `$clipAt:${startMs}`) as string
    if (context.hovered_clip_at_ms !== undefined) {
      editorContext.hoveredClipId = clipIdAt(context.hovered_clip_at_ms)
    }
    if (context.selected_clip_at_ms !== undefined) {
      editorContext.selectedClipIds = context.selected_clip_at_ms.map(clipIdAt)
    }
    if (context.playhead_ms !== undefined) editorContext.playheadMs = context.playhead_ms
    if (context.active_zone_id !== undefined) editorContext.activeZoneId = context.active_zone_id
  }
  store.setContext(sessionId, editorContext)

  const described = store.describe(sessionId)
  if (!described.ok) throw new Error('describe failed after setup')
  const listing = {
    durationMs: described.description.durationMs,
    scenes: described.description.scenes.map((scene) => ({ ...scene, name: scene.name })),
    clips: [],
  } as unknown as ShowClipListing

  return {
    store,
    client,
    sessionId,
    listing,
    editorContext,
    description: projectionForAgent(described.description as unknown as Record<string, unknown>),
  }
}

/** Run one case with an agent and record the transcript. */
export async function runCase(
  dictationCase: DictationCase,
  agent: DictationAgent,
): Promise<DictationTranscript> {
  const harness = await prepareHarness(dictationCase)
  const { store, client, sessionId } = harness

  const baselineHistory = (() => {
    const described = store.describeChanges(sessionId)
    return described.ok ? described.entries.length : 0
  })()
  const baselineGeneric = (() => {
    const log = store.genericUse(sessionId)
    return log.ok ? log.uses.length : 0
  })()

  const events: TranscriptEvent[] = []
  const toolList = await client.listTools()
  const tools = dictationTools(toolList.tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
  const callTool = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as Array<{ type: string; text: string }>
    const payload = content?.[0]?.type === 'text' ? JSON.parse(content[0].text) : null
    const isError = result.isError === true
    events.push({ type: 'tool', tool: name, args, result: payload, isError })
    return { payload, isError }
  }

  // A case is a conversation: the first turn plus any followups, each a
  // fresh agent turn carrying the dialogue history - the same shape the
  // live bridge runs.
  const turns = [
    { utterance: dictationCase.utterance, script: dictationCase.script },
    ...(dictationCase.followups ?? []),
  ]
  const dialogue: Array<{ role: 'user' | 'assistant'; text: string }> = []
  const turnTransactions: number[] = []
  const turnTimings: TurnTiming[] = []
  const caseStart = Date.now()
  let committedSoFar = baselineHistory
  let finalText = ''
  for (const turn of turns) {
    const result = await runDictationTurn({
      store,
      sessionId,
      agent,
      utterance: turn.utterance,
      history: [...dialogue],
      listing: harness.listing,
      description: harness.description,
      instructions: DICTATION_RULES,
      editorContext: harness.editorContext,
      tools,
      callTool,
      script: turn.script,
    })
    finalText = result.finalText
    turnTimings.push(...result.timings)
    events.push({ type: 'text', text: finalText })
    const described = store.describeChanges(sessionId)
    const total = described.ok ? described.entries.length : committedSoFar
    turnTransactions.push(total - committedSoFar)
    committedSoFar = total
    dialogue.push({ role: 'user', text: turn.utterance }, { role: 'assistant', text: finalText })
  }

  const exported = store.export(sessionId)
  if (!exported.ok) throw new Error('export failed after the agent turn')
  const genericLog = store.genericUse(sessionId)

  return {
    caseId: dictationCase.id,
    agent: agent.name,
    events,
    finalText,
    transactions: committedSoFar - baselineHistory,
    turnTransactions,
    genericUses: genericLog.ok ? genericLog.uses.slice(baselineGeneric) : [],
    finalShow: exported.show,
    ...(turnTimings.length > 0 ? { timing: mergeTurnTimings(turnTimings, Date.now() - caseStart) } : {}),
  }
}

/** The scripted fake agent: executes the case's intended solution verbatim,
 * resolving placeholders through the protocol (describe_show/export_show) so
 * it exercises exactly the surface a live model sees. */
export function createFakeAgent(): DictationAgent {
  return {
    name: 'scripted-fake',
    run: async (context) => {
      if (!context.script) throw new Error('the fake agent needs a case script')
      let finalText = ''
      let previousTarget: string | undefined
      for (const step of context.script) {
        if ('say' in step) {
          finalText = step.say
          continue
        }
        if (step.tool === 'finish_turn') {
          const reply = (step.args as { reply?: string }).reply
          const ended = context.finishTurn?.(reply)
          if (!ended) throw new Error('finish_turn needs a turn module holding the transaction')
          if (!ended.ok) throw new Error(`finish_turn refused: ${JSON.stringify(ended.issues)}`)
          return { finalText: ended.finalText }
        }
        const resolved = await resolveArgsViaProtocol(
          context,
          step.args as Record<string, unknown>,
          previousTarget,
        )
        const { [FINISH_ARGUMENT]: finishReply, ...operationArgs } = resolved
        const { payload, isError } = await context.callTool(step.tool, {
          session_id: context.sessionId,
          ...operationArgs,
        })
        if (!isError && payload && typeof payload === 'object' && 'changes' in payload) {
          const changes = (payload as { changes: Array<{ targetId: string }> }).changes
          previousTarget = changes[0]?.targetId ?? previousTarget
        }
        if (typeof finishReply === 'string' && !isError) {
          const ended = context.finishTurn?.((finishReply as string).trim() || undefined)
          if (!ended) throw new Error('finish_turn_reply needs a turn module holding the transaction')
          if (!ended.ok) throw new Error(`finish refused: ${JSON.stringify(ended.issues)}`)
          return { finalText: ended.finalText }
        }
      }
      return { finalText }
    },
  }
}

interface DescribedForResolution {
  durationMs: number
  markers: Array<{ markerId: string; timeMs: number }>
  zones: Array<{
    layers: Array<{
      kind: string
      clips: Array<{
        clipId: string
        patternName: string
        startMs: number
        tracks: Array<{ trackId: string; target: string; keyframes: Array<{ keyframeId: string }> }>
        effects: Array<{ effectId: string; kind: string }>
      }>
      junctions: Array<{ layerTransitionId: string | null }>
    }>
  }>
}

async function resolveArgsViaProtocol(
  context: AgentTurnContext,
  args: Record<string, unknown>,
  previousTarget: string | undefined,
): Promise<Record<string, unknown>> {
  if (!JSON.stringify(args).includes('"$')) return args

  const { payload } = await context.callTool('describe_show', { session_id: context.sessionId })
  const description = (payload as { description: DescribedForResolution }).description

  const clips = description.zones.flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))

  const resolveToken = (token: string): unknown => {
    if (token === '$prevTarget') {
      if (!previousTarget) throw new Error('$prevTarget with no previous step')
      return previousTarget
    }
    const [kind, ...parts] = token.slice(1).split(':')
    if (kind === 'clipAt') {
      const clip = clips.find((candidate) => candidate.startMs === Number(parts[0]))
      if (!clip) throw new Error(`no clip at ${parts[0]} ms`)
      return clip.clipId
    }
    if (kind === 'patternClip') {
      const clip = clips.find((candidate) =>
        candidate.patternName.toLowerCase().includes(parts[0].toLowerCase()))
      if (!clip) throw new Error(`no clip matching "${parts[0]}"`)
      return clip.clipId
    }
    if (kind === 'overlayClip') {
      const layer = description.zones
        .flatMap((zone) => zone.layers)
        .find((candidate) => candidate.kind === 'overlay')
      const clip = layer?.clips[0]
      if (!clip) throw new Error('no overlay clip')
      return clip.clipId
    }
    if (kind === 'markerAt') {
      const marker = description.markers.find((candidate) => candidate.timeMs === Number(parts[0]))
      if (!marker) throw new Error(`no marker at ${parts[0]} ms`)
      return marker.markerId
    }
    if (kind === 'trackOf' || kind === 'keyframeOf') {
      const clip = clips.find((candidate) => candidate.startMs === Number(parts[0]))
      const track = clip?.tracks.find((candidate) =>
        candidate.target.toLowerCase().includes(parts[1].toLowerCase()))
      if (!track) throw new Error(`no "${parts[1]}" track at ${parts[0]} ms`)
      if (kind === 'trackOf') return track.trackId
      const keyframe = track.keyframes[Number(parts[2])]
      if (!keyframe) throw new Error(`no keyframe ${parts[2]} on ${track.trackId}`)
      return keyframe.keyframeId
    }
    if (kind === 'effectOf') {
      const clip = clips.find((candidate) => candidate.startMs === Number(parts[0]))
      const effect = clip?.effects.find((candidate) => candidate.kind === parts[1])
      if (!effect) throw new Error(`no ${parts[1]} Effect at ${parts[0]} ms`)
      return effect.effectId
    }
    if (kind === 'layerTransition') {
      const junctions = description.zones
        .flatMap((zone) => zone.layers)
        .flatMap((layer) => layer.junctions)
        .filter((junction) => junction.layerTransitionId !== null)
      const junction = junctions[Number(parts[0])]
      if (!junction) throw new Error(`no layer transition ${parts[0]}`)
      return junction.layerTransitionId
    }
    throw new Error(`unknown placeholder ${token}`)
  }

  const substitute = (value: unknown): unknown => {
    if (typeof value === 'string' && value.startsWith('$')) return resolveToken(value)
    if (Array.isArray(value)) return value.map(substitute)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, substitute(child)]),
      )
    }
    return value
  }
  return substitute(args) as Record<string, unknown>
}

export interface CaseScore {
  caseId: string
  family: DictationCase['family']
  referent: DictationCase['referent']
  expectedOutcome: 'edit' | 'ask' | 'refuse' | 'no-edit'
  outcome: 'edit' | 'ask' | 'refuse'
  firstTrySuccess: boolean
  toolCalls: number
  transactions: number
  askedCorrectly: boolean
  refusedCorrectly: boolean
  genericUses: DictationTranscript['genericUses']
  assertionResults: AssertionResult[]
  failures: string[]
  /** Present only when the transcript carries telemetry (#33). */
  timing?: CaseTimingSummary
}

/** Deterministic scoring over (case, transcript); replay calls only this. */
export function scoreTranscript(dictationCase: DictationCase, transcript: DictationTranscript): CaseScore {
  const failures: string[] = []
  const outcome: CaseScore['outcome'] =
    transcript.transactions > 0
      ? 'edit'
      : transcript.finalText.includes('?')
        ? 'ask'
        : 'refuse'

  const expected = dictationCase.expect.outcome
  const outcomeAccepted = expected === 'no-edit'
    ? outcome === 'ask' || outcome === 'refuse'
    : outcome === expected
  if (!outcomeAccepted) failures.push(`outcome ${outcome}, expected ${expected}`)

  const assertionResults = (dictationCase.expect.assertions ?? []).map((assertion) =>
    evaluateAssertion(transcript.finalShow, assertion))
  for (const result of assertionResults) {
    if (!result.passed) failures.push(result.detail)
  }

  const maxTransactions = dictationCase.expect.max_transactions ?? 1
  if (expected === 'edit' && transcript.transactions > maxTransactions) {
    failures.push(`${transcript.transactions} transactions, expected at most ${maxTransactions}`)
  }

  // A conversation resolves on its final turn; an edit committed while the
  // agent was still asking is a guess that happened to be interrupted.
  const turnCounts = transcript.turnTransactions ?? [transcript.transactions]
  if (turnCounts.length > 1 && turnCounts.slice(0, -1).some((count) => count > 0)) {
    failures.push('committed an edit before the conversation resolved')
  }
  if (expected !== 'edit' && transcript.transactions > 0) {
    failures.push(`the document changed (${transcript.transactions} transactions) when it should not have`)
  }

  return {
    caseId: dictationCase.id,
    family: dictationCase.family,
    referent: dictationCase.referent,
    expectedOutcome: expected,
    outcome,
    firstTrySuccess: failures.length === 0,
    toolCalls: transcript.events.filter((event) => event.type === 'tool').length,
    transactions: transcript.transactions,
    askedCorrectly: expected === 'ask' ? outcome === 'ask' : expected === 'no-edit' ? true : outcome !== 'ask',
    refusedCorrectly:
      expected === 'refuse' ? outcome === 'refuse' : expected === 'no-edit' ? outcome !== 'edit' : outcome !== 'refuse',
    genericUses: transcript.genericUses,
    assertionResults,
    failures,
    ...(transcript.timing ? { timing: summarizeCaseTiming(transcript.timing) } : {}),
  }
}
