import { AGENT_SERVICE_BOUNDS } from '../../engine/agentAllowance'
import type { AgentAccountNamespace } from './AgentAccount'

interface DispatchRequest {
  owner: string
  operationId: string
  round: number
  input: unknown[]
  tools: unknown[]
}
interface Dependencies {
  apiKey?: string
  allowance: AgentAccountNamespace
  providerFetch?: typeof fetch
}
type Result = { ok: false; code: string } | { ok: true; output: unknown[] }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))
function supportedInput(value: unknown): boolean {
  if (!record(value)) return false
  if (value.type === 'function_call') return only(value, ['type', 'call_id', 'name', 'arguments', 'id', 'status']) && ['call_id', 'name', 'arguments'].every(key => typeof value[key] === 'string') && (value.id === undefined || typeof value.id === 'string') && (value.status === undefined || ['in_progress', 'completed', 'incomplete'].includes(String(value.status)))
  if (value.type === 'function_call_output') return only(value, ['type', 'call_id', 'output']) && typeof value.call_id === 'string' && typeof value.output === 'string'
  if (value.type === 'reasoning') return only(value, ['type', 'id', 'summary', 'encrypted_content', 'status']) && typeof value.id === 'string' && typeof value.encrypted_content === 'string' && Array.isArray(value.summary) && value.summary.every(item => record(item) && only(item, ['type', 'text']) && item.type === 'summary_text' && typeof item.text === 'string') && (value.status === undefined || ['in_progress', 'completed', 'incomplete'].includes(String(value.status)))
  return only(value, ['role', 'content']) && ['user', 'developer', 'assistant'].includes(String(value.role)) && typeof value.content === 'string'
}
function supportedTool(value: unknown): boolean {
  return record(value) && only(value, ['type', 'name', 'description', 'parameters', 'strict']) && value.type === 'function' && typeof value.name === 'string' && typeof value.description === 'string' && record(value.parameters) && value.strict === false
}

/** One dispatch only. An ambiguous response never causes an automatic retry or refund. */
export async function dispatchBuiltinProvider(deps: Dependencies, request: DispatchRequest): Promise<Result> {
  const fail = (code: string): Result => ({ ok: false, code })
  if (!deps.apiKey) return fail('unavailable')
  if (!request.input.every(supportedInput) || !request.tools.every(supportedTool)) return fail('invalid_request')
  const body = JSON.stringify({ model: AGENT_SERVICE_BOUNDS.model, reasoning: { effort: 'high' }, include: ['reasoning.encrypted_content'], service_tier: 'default', truncation: 'disabled', store: false, max_output_tokens: AGENT_SERVICE_BOUNDS.maxOutputTokens, parallel_tool_calls: false, input: request.input, tools: request.tools })
  if (new TextEncoder().encode(body).byteLength > AGENT_SERVICE_BOUNDS.maxRequestBytes) return fail('request_limit')
  const owner = deps.allowance.get(deps.allowance.idFromName('builtin-global-v1'))
  const command = async (type: string, extra: Record<string, unknown> = {}) => {
    const response = await owner.fetch(new Request('https://allowance.internal/', { method: 'POST', body: JSON.stringify({ type, owner: request.owner, operationId: request.operationId, round: request.round, ...extra }) }))
    const result = await response.json() as { code?: string }
    return typeof result.code === 'string' ? result.code : 'unavailable'
  }
  try {
    const admission = await command('reserve')
    if (admission !== 'reserved') return fail(admission)
  } catch { return fail('unavailable') }
  try {
    const response = await (deps.providerFetch ?? fetch)('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' }, body })
    if (!response.ok) return fail('provider_unavailable')
    // Bound transport memory independently of token limits. Truncation is unknown usage.
    const reader = response.body?.getReader()
    if (!reader) return fail('provider_unavailable')
    const chunks: Uint8Array[] = []; let bytes = 0
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); return fail('provider_unavailable') }
      chunks.push(next.value)
    }
    const buffer = new Uint8Array(bytes); let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
    const result: unknown = JSON.parse(new TextDecoder().decode(buffer))
    if (!record(result)) return fail('provider_unavailable')
    if (result.model !== AGENT_SERVICE_BOUNDS.model || result.service_tier !== 'default') {
      await command('halt')
      return fail('provider_contract')
    }
    const settlement = await command('settle', { usage: result.usage })
    if (settlement === 'overrun' || settlement === 'halted') return fail('provider_contract')
    if (result.status !== 'completed' || !Array.isArray(result.output)) return fail('provider_incomplete')
    return { ok: true, output: result.output }
  } catch { return fail('provider_unavailable') }
}
