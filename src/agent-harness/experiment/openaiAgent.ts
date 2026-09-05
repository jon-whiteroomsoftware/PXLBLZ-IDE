// Provenance: pxlblz-v3 src/experiment/openaiAgent.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// The OpenAI-backed live agent (#24): a GPT model driven through the OpenAI
// Responses API tool loop (reasoning models require it for function tools)
// with the tool list taken from the live MCP server. The API key comes from
// OPENAI_API_KEY in the environment and is never stored; construction
// refuses without it. Model and reasoning effort are configuration.
import OpenAI from 'openai'
import type { DictationAgent } from './runner.js'
import type { ModelCallTiming, RateLimitInfo } from './timing.js'
import { runToolRound, type RequestedCall } from './turn.js'

export interface OpenAiAgentOptions {
  model: string
  /** Reasoning effort for reasoning-capable models (for example low|medium|high). */
  reasoningEffort?: string
  maxTurns?: number
  /** Timing/backoff telemetry, for the bridge's latency logging. */
  onEvent?: (event:
    | ({ kind: 'model-call' } & ModelCallTiming)
    | { kind: 'rate-limit-wait'; ms: number }) => void
}

export function createOpenAiAgent(options: OpenAiAgentOptions): DictationAgent {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Live GPT runs need it in the environment; use the fake agent or ' +
      'replay mode without it.',
    )
  }
  const openai = new OpenAI({ apiKey })

  return {
    name: options.reasoningEffort ? `${options.model} (${options.reasoningEffort})` : options.model,
    run: async (context) => {
      const tools: OpenAI.Responses.Tool[] = context.tools
        .filter((tool) => tool.name !== 'open_show' && tool.name !== 'close_session')
        .map((tool) => ({
          type: 'function',
          name: tool.name,
          description: tool.description ?? '',
          parameters: tool.inputSchema as Record<string, unknown>,
          strict: false,
        }))

      const system =
        `${context.instructions}\n\n` +
        `You are editing a PXLBLZ Show through the tools. Session "${context.sessionId}" is already ` +
        'open; every tool call must pass that session_id. Carry out the user\'s dictated edit, then ' +
        'reply with one line stating what changed. If the request is ambiguous or names something that ' +
        'does not exist, ask exactly one clarifying question instead of editing. If the request is ' +
        'impossible but a near alternative exists, leave the document unchanged and offer the ' +
        'alternative as a question. Only when it is impossible with no alternative do you state why ' +
        'in one line without a question mark. Your turn is already one transaction held by the editor: ' +
        'do not open or commit transactions yourself. A question mark in your reply means you are asking, ' +
        'and any edits made this turn are discarded.'

      const contextLines: string[] = []
      const editorContext = context.editorContext
      if (editorContext.hoveredClipId) contextLines.push(`The clip under the user's cursor (hovered) is ${editorContext.hoveredClipId}.`)
      if (editorContext.selectedClipIds?.length) contextLines.push(`The selected clip(s): ${editorContext.selectedClipIds.join(', ')}.`)
      if (editorContext.playheadMs !== undefined) contextLines.push(`The playhead is at ${editorContext.playheadMs} ms.`)
      if (editorContext.activeZoneId) contextLines.push(`The active Zone is ${editorContext.activeZoneId}.`)
      if (contextLines.length === 0) contextLines.push('Nothing is hovered or selected and no playhead is set.')
      const userMessage =
        `Editor context: ${contextLines.join(' ')}\n` +
        `Current Show (describe_show projection): ${JSON.stringify(context.description)}\n` +
        `The user says: "${context.utterance}"`
      const input: OpenAI.Responses.ResponseInput = [
        { role: 'developer', content: system },
        // The conversation so far, so follow-ups like "yes" or "ten
        // seconds" resolve against the agent's own previous question. The
        // Show state below is current truth; earlier turns' state is not
        // replayed.
        ...(context.history ?? []).map((entry) => ({
          role: entry.role,
          content: entry.text,
        } as OpenAI.Responses.ResponseInputItem)),
        { role: 'user', content: userMessage },
      ]

      // Telemetry (#33): every round trip's wall time and token usage, the
      // rate tier from the response headers, and time slept on 429 backoff.
      const calls: ModelCallTiming[] = []
      let rateLimitWaitMs = 0
      let rateLimit: RateLimitInfo | undefined

      // Low-tier orgs rate-limit hard; back off and retry on 429 rather
      // than failing the case.
      const createWithRetry = async (): Promise<OpenAI.Responses.Response> => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const { data, response } = await openai.responses.create({
              model: options.model,
              ...(options.reasoningEffort
                ? { reasoning: { effort: options.reasoningEffort as 'low' | 'medium' | 'high' } }
                : {}),
              tools,
              input,
            }).withResponse()
            if (!rateLimit) {
              const header = (name: string) => {
                const value = response.headers.get(name)
                return value === null || value === '' || Number.isNaN(Number(value)) ? undefined : Number(value)
              }
              const requestsPerMinute = header('x-ratelimit-limit-requests')
              const tokensPerMinute = header('x-ratelimit-limit-tokens')
              rateLimit = {
                ...(requestsPerMinute !== undefined ? { requestsPerMinute } : {}),
                ...(tokensPerMinute !== undefined ? { tokensPerMinute } : {}),
              }
            }
            return data
          } catch (error) {
            const status = (error as { status?: number }).status
            if (status !== 429 || attempt >= 8) throw error
            const message = (error as Error).message ?? ''
            const suggested = /try again in (\d+(?:\.\d+)?)s/.exec(message)
            const waitMs = suggested ? Number(suggested[1]) * 1_000 + 1_000 : 25_000
            rateLimitWaitMs += waitMs
            options.onEvent?.({ kind: 'rate-limit-wait', ms: waitMs })
            await new Promise((resolve) => setTimeout(resolve, waitMs))
          }
        }
      }
      const finish = (finalText: string) => ({
        finalText,
        timing: { calls, rateLimitWaitMs, ...(rateLimit ? { rateLimit } : {}) },
      })

      const maxTurns = options.maxTurns ?? 16
      for (let turn = 0; turn < maxTurns; turn += 1) {
        const callStart = Date.now()
        const response = await createWithRetry()
        const requested = response.output.filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
        )
        const usage = response.usage
        const call: ModelCallTiming = {
          ms: Date.now() - callStart,
          toolCalls: requested.length,
          ...(usage
            ? {
                inputTokens: usage.input_tokens,
                cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
                outputTokens: usage.output_tokens,
                reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
              }
            : {}),
        }
        calls.push(call)
        options.onEvent?.({ kind: 'model-call', ...call })
        if (requested.length === 0) {
          return finish(response.output_text ?? '')
        }
        // Feed the full output (including reasoning items) back for the next turn.
        input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]))
        // The shared round (#38): operations first, then any finish - by
        // finish_turn_reply on an operation or a finish_turn call.
        const parsedCalls: RequestedCall[] = requested.map((call) => {
          try {
            return { id: call.call_id, name: call.name, args: JSON.parse(call.arguments || '{}') as Record<string, unknown> }
          } catch (cause) {
            return { id: call.call_id, name: call.name, args: {}, parseError: cause instanceof Error ? cause.message : String(cause) }
          }
        })
        const round = await runToolRound(context, parsedCalls)
        if (round.ended) return finish(round.ended.finalText)
        for (const output of round.outputs) {
          input.push({ type: 'function_call_output', call_id: output.id, output: JSON.stringify(output.payload) })
        }
      }
      return finish('The turn limit was reached before the edit completed.')
    },
  }
}
