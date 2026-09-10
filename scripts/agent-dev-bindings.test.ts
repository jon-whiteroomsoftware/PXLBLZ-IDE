import { expect, it } from 'vitest'
import { agentDevBindings } from './agent-dev-bindings'
it('defaults to no overrides and forwards only explicitly selected server bindings', () => {
  expect(agentDevBindings({})).toEqual({})
  expect(agentDevBindings({ SESSION_SECRET: 'never-copy', VITE_AGENT_SERVICE_ENABLED: '1', AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'local-test', AGENT_OAUTH_ORIGIN: 'http://localhost:5200', AGENT_OAUTH_CLIENTS: '[]' })).toEqual({ AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'local-test', AGENT_OAUTH_ORIGIN: 'http://localhost:5200', AGENT_OAUTH_CLIENTS: '[]' })
})
