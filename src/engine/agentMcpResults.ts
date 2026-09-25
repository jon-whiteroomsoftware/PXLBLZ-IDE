/**
 * Closed result-code domain exposed by the production MCP tools.
 *
 * The table is the source of both the public code union and error signaling.
 * Internal journal states such as `accepted` and `known` never cross this seam.
 */
export const AGENT_MCP_RESULT_CLASSIFICATION = {
  bound: false,
  pending: false,
  commands: false,
  read: false,
  begun: false,
  changed: false,
  noop: false,
  unchanged: false,
  outcome: false,
  binding_moved: true,
  busy: true,
  capacity: true,
  connection_retired: true,
  finished: true,
  identity_conflict: true,
  invalid_payload: true,
  invalid_request: true,
  no_live_editor: true,
  occupied: true,
  out_of_order: true,
  refused: true,
  result_too_large: true,
  result_unavailable: true,
  retired: true,
  retirement_unconfirmed: true,
  service_disabled: true,
  throttled: true,
  unauthorized: true,
  unavailable: true,
  unknown: true,
} as const satisfies Record<string, boolean>

export type AgentMcpResultCode = keyof typeof AGENT_MCP_RESULT_CLASSIFICATION

export interface AgentMcpResult {
  code: AgentMcpResultCode
  [key: string]: unknown
}

export function isAgentMcpError(code: AgentMcpResultCode): boolean {
  return AGENT_MCP_RESULT_CLASSIFICATION[code]
}

export function isAgentMcpResult(value: unknown): value is AgentMcpResult {
  return typeof value === 'object' && value !== null
    && typeof (value as { code?: unknown }).code === 'string'
    && Object.prototype.hasOwnProperty.call(AGENT_MCP_RESULT_CLASSIFICATION, (value as { code: string }).code)
}
