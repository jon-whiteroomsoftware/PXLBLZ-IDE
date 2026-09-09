import { parseAgentResizeIntent, sameAgentResizeIntent, type AgentResizeIntent } from '../../dev/agentResizeProtocol.js'
import type { DictationAgent, TurnCompletion } from './runner.js'
import { completionFrom, dictationTools } from './turn.js'

export type TargetedResizeResult = { kind: 'proposal'; intent: AgentResizeIntent } | { kind: 'asked' | 'refused' | 'incomplete' | 'service-error' }

/** No document or dialogue enters this finite mode. The existing browser owner
 * captures before this call and alone validates/replays the eventual proposal.
 * No private document transaction, semantic repair, or broad fallback occurs. */
export async function runTargetedResizeTurn(agent: DictationAgent, input: unknown, scripted = false): Promise<TargetedResizeResult> {
  const intent = parseAgentResizeIntent(input)
  if (!intent) return { kind: 'refused' }
  let proposed = false
  let staged: TurnCompletion | undefined
  const rejected = { ok: false as const, issues: [{ code: 'invalid-argument' as const, message: 'Invalid targeted completion.' }] }
  const finishTurn = (value: TurnCompletion) => {
    const parsed = completionFrom(value)
    if (!parsed || staged || (parsed.intent === 'apply' && !proposed)) return rejected
    staged = { intent: parsed.intent }
    return { ok: true as const, finalText: 'Targeted turn completed.' }
  }
  try {
    const result = await agent.run({
      mode: 'targeted-resize',
      sessionId: 'targeted-resize',
      utterance: 'Propose exactly the supplied Clip duration, or finish with refusal.',
      history: [], editorContext: {}, listing: { durationMs: 0, scenes: [], clips: [] },
      description: { clipId: intent.clipId, durationMs: intent.durationMs },
      instructions: 'This is a typed exact resize diagnostic. Only the supplied Clip and duration are authorized. No references to previous dialogue or other content are available. Do not request document reads or other edits.',
      tools: dictationTools([{ name: 'resize_clip', description: 'Propose the exact supplied Clip duration.', inputSchema: { type: 'object', properties: { session_id: { type: 'string', const: 'targeted-resize' }, clip_id: { type: 'string', const: intent.clipId }, duration_ms: { type: 'integer', const: intent.durationMs } }, required: ['clip_id', 'duration_ms'], additionalProperties: false } }]),
      callTool: async (name, args) => {
        if (name !== 'resize_clip') return { payload: { ok: false, code: 'unsupported-call' }, isError: true }
        if (!args || Object.keys(args).some(key => key !== 'clip_id' && key !== 'duration_ms' && key !== 'session_id') || (args.session_id !== undefined && args.session_id !== 'targeted-resize') || !sameAgentResizeIntent(intent, { clipId: args.clip_id, durationMs: args.duration_ms }) || proposed || staged) return { payload: { ok: false, code: 'invalid-proposal' }, isError: true }
        proposed = true
        return { payload: { ok: true, code: 'proposal-recorded' }, isError: false }
      },
      finishTurn,
      ...(scripted ? { script: [{ tool: 'resize_clip', args: { clip_id: intent.clipId, duration_ms: intent.durationMs, finish_turn_reply: { intent: 'apply' as const } } }] } : {}),
    })
    if (result.incomplete) return { kind: 'incomplete' }
    if (result.completion !== undefined) {
      const returned = completionFrom(result.completion)
      if (!returned || (staged && returned.intent !== staged.intent)) return { kind: 'incomplete' }
      if (!staged) finishTurn(returned)
    }
    const completion = staged as TurnCompletion | undefined
    if (!completion || completion.intent === 'incomplete') return { kind: 'incomplete' }
    if (completion.intent === 'ask') return { kind: 'asked' }
    if (completion.intent === 'refuse') return { kind: 'refused' }
    return proposed ? { kind: 'proposal', intent } : { kind: 'incomplete' }
  } catch { return { kind: 'service-error' } }
}
