// Provenance: pxlblz-v3 src/experiment/openaiAgent.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// The OpenAI-backed live agent (#24): a GPT model driven through the OpenAI
// Responses API tool loop (reasoning models require it for function tools)
// with the tool list taken from the live MCP server. The API key comes from
// OPENAI_API_KEY in the environment and is never stored; construction
// refuses without it. Model and reasoning effort are configuration.
//
// #945 budget guard: every dispatch attempt, retries included, passes
// through `dispatch` below, the adapter's only call into the SDK. It
// reserves the attempt's worst case with the guard before the call and
// settles or abandons it after; a refusal throws PaidCallRefusedError
// before anything reaches the network. The SDK's own retries are disabled
// so no attempt can bypass that reservation, and max_output_tokens is
// pinned to the bound. `transport` is a test seam: a fetch that stands in
// for the network and a sleep that stands in for the backoff timer.
import OpenAI from 'openai'
import { PaidCallRefusedError, type BoundedResponsesRequest } from './paidCallBudget.js'
import type { PaidCallGuard } from './paidCallGuard.js'
import type { DictationAgent } from './runner.js'
import type { ModelCallTiming, RateLimitInfo } from './timing.js'
import { runToolRound, type RequestedCall } from './turn.js'

export interface OpenAiAgentOptions {
  model: string
  /** Reasoning effort for reasoning-capable models (for example low|medium|high). */
  reasoningEffort?: string
  maxTurns?: number
  /** The paid-call guard (#945); required, there is no unguarded live path. */
  budget: PaidCallGuard
  /** Timing/backoff telemetry, for the bridge's latency logging. */
  onEvent?: (event:
    | ({ kind: 'model-call' } & ModelCallTiming)
    | { kind: 'rate-limit-wait'; ms: number }) => void
  /** Test seam only: replaces the network and the backoff timer. */
  transport?: {
    fetch?: typeof fetch
    sleep?: (ms: number) => Promise<void>
  }
}

export function createOpenAiAgent(options: OpenAiAgentOptions): DictationAgent {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Live GPT runs need it in the environment; use the fake agent or ' +
      'replay mode without it.',
    )
  }
  if (!options.budget) throw new Error('the live agent needs the paid-call guard (#945); there is no unguarded path')
  const budget = options.budget
  // maxRetries 0: the SDK would otherwise re-send on 429/5xx inside one
  // create() call, outside the guard's per-attempt reservation.
  const openai = new OpenAI({ apiKey, maxRetries: 0, ...(options.transport?.fetch ? { fetch: options.transport.fetch } : {}) })
  const sleep = options.transport?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const maxOutputTokens = budget.status().bounds.maxOutputTokensPerCall

  return {
    name: options.reasoningEffort ? `${options.model} (${options.reasoningEffort})` : options.model,
    run: async (context) => {
      const tools: BoundedResponsesRequest['tools'] = context.tools
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
      const input: BoundedResponsesRequest['input'] = [
        { role: 'developer', content: system },
        // The conversation so far, so follow-ups like "yes" or "ten
        // seconds" resolve against the agent's own previous question. The
        // Show state below is current truth; earlier turns' state is not
        // replayed.
        ...(context.history ?? []).map((entry) => ({ role: entry.role, content: entry.text })),
        { role: 'user', content: userMessage },
      ]

      // Telemetry (#33): every round trip's wall time and token usage, the
      // rate tier from the response headers, and time slept on 429 backoff.
      const calls: ModelCallTiming[] = []
      let rateLimitWaitMs = 0
      let rateLimit: RateLimitInfo | undefined
      // Output tokens the provider reported for this turn's earlier calls
      // (the bound for a call that reported none): echoed reasoning is
      // re-read server side and billed as input on the next call.
      let priorOutputTokens = 0

      // The single dispatch point (#945): reserve, send, settle or abandon.
      const dispatch = async (): Promise<OpenAI.Responses.Response> => {
        const request: BoundedResponsesRequest = {
          model: options.model,
          input,
          tools,
          max_output_tokens: maxOutputTokens,
          ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
        }
        const reservation = budget.reserve(request, priorOutputTokens)
        if (!reservation.ok) throw new PaidCallRefusedError(reservation)
        let data: OpenAI.Responses.Response
        let response: Response
        try {
          ;({ data, response } = await openai.responses
            .create(request as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming)
            .withResponse())
        } catch (error) {
          const status = (error as { status?: number }).status
          budget.abandon(reservation.id, `dispatch failed${status !== undefined ? ` with status ${status}` : ''}: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`)
          throw error
        }
        const usage = data.usage
        budget.settle(
          reservation.id,
          usage
            ? {
                inputTokens: usage.input_tokens,
                cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
                outputTokens: usage.output_tokens,
              }
            : undefined,
        )
        priorOutputTokens += usage ? usage.output_tokens : maxOutputTokens
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
      }

      // Low-tier orgs rate-limit hard; back off and retry on 429 rather
      // than failing the case. Every attempt is its own guarded dispatch.
      const createWithRetry = async (): Promise<OpenAI.Responses.Response> => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await dispatch()
          } catch (error) {
            const status = (error as { status?: number }).status
            if (status !== 429 || attempt >= 8) throw error
            const message = (error as Error).message ?? ''
            const suggested = /try again in (\d+(?:\.\d+)?)s/.exec(message)
            const waitMs = suggested ? Number(suggested[1]) * 1_000 + 1_000 : 25_000
            rateLimitWaitMs += waitMs
            options.onEvent?.({ kind: 'rate-limit-wait', ms: waitMs })
            await sleep(waitMs)
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
        input.push(...(response.output as unknown as BoundedResponsesRequest['input']))
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
