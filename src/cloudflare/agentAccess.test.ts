import { expect, it } from 'vitest'
import { agentBuiltinAccessRefusal, agentServiceRefusal } from './agentAccess'
it('opens built-in access to every authenticated account while retaining the service switch', () => {
  expect(agentServiceRefusal({})).toBe('service_disabled')
  expect(agentServiceRefusal({ AGENT_SERVICE_ENABLED: 'true', AGENT_ACCOUNT_ALLOWLIST: 'canonical-a' })).toBe('service_disabled')
  expect(agentServiceRefusal({ AGENT_SERVICE_ENABLED: '1' })).toBeNull()
  expect(agentBuiltinAccessRefusal('canonical-a', { AGENT_SERVICE_ENABLED: '1' })).toBeNull()
  expect(agentBuiltinAccessRefusal('canonical-a', { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: ' canonical-a,canonical-b ' })).toBeNull()
  expect(agentBuiltinAccessRefusal('github:alias', { AGENT_SERVICE_ENABLED: '1', AGENT_ACCOUNT_ALLOWLIST: 'canonical-a' })).toBeNull()
})
