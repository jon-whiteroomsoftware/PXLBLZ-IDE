import { expect, it } from 'vitest'
import { agentBuiltinAccessRefusal, agentServiceRefusal } from './agentAccess'
it('opens shared agent service access while retaining the built-in canonical-account allowlist', () => {
  expect(agentServiceRefusal({})).toBe('service_disabled')
  expect(agentServiceRefusal({ AGENT_SERVICE_ENABLED: 'true', AGENT_ACCOUNT_ALLOWLIST: 'canonical-a' })).toBe('service_disabled')
  expect(agentServiceRefusal({ AGENT_SERVICE_ENABLED: '1' })).toBeNull()
  expect(agentBuiltinAccessRefusal('canonical-a', { AGENT_SERVICE_ENABLED: '1' })).toBe('not_allowed')
  expect(agentBuiltinAccessRefusal('canonical-a', { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: ' canonical-a,canonical-b ' })).toBeNull()
  expect(agentBuiltinAccessRefusal('github:alias', { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'canonical-a' })).toBe('not_allowed')
})
