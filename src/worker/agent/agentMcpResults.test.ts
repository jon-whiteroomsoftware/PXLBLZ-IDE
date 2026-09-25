import { expect, it } from 'vitest'
import { AGENT_MCP_RESULT_CLASSIFICATION, isAgentMcpResult, type AgentMcpResultCode } from '../../engine/agentMcpResults'

it('classifies the complete public MCP result-code domain', () => {
  const expected = {
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
  } satisfies Record<AgentMcpResultCode, boolean>

  expect(AGENT_MCP_RESULT_CLASSIFICATION).toEqual(expected)
  expect(isAgentMcpResult({ code: 'read', show: {} })).toBe(true)
  expect(isAgentMcpResult({ code: 'accepted' })).toBe(false)
  expect(isAgentMcpResult({ code: 'new-unclassified-code' })).toBe(false)
})
