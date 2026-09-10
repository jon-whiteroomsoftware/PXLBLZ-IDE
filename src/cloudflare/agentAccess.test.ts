import { expect, it } from 'vitest'
import { agentAccessRefusal } from './agentAccess'
it('disables the service by default and allows canonical account IDs only', () => {
  expect(agentAccessRefusal('canonical-a', {})).toBe('service_disabled')
  expect(agentAccessRefusal('canonical-a', { AGENT_SERVICE_ENABLED: 'true', AGENT_ACCOUNT_ALLOWLIST: 'canonical-a' })).toBe('service_disabled')
  expect(agentAccessRefusal('canonical-a', { AGENT_SERVICE_ENABLED: '1' })).toBe('not_allowed')
  expect(agentAccessRefusal('canonical-a', { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: ' canonical-a,canonical-b ' })).toBeNull()
  expect(agentAccessRefusal('github:alias', { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'canonical-a' })).toBe('not_allowed')
})
