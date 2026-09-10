import { expect, it } from 'vitest'
import { agentOAuthConfig, providerSubject } from './agentOAuthConfig'
const client = { clientId: 'test-client', clientName: 'Test', redirectUris: ['https://client.test/callback'] }
const valid = { AGENT_OAUTH_ORIGIN: 'https://app.test', AGENT_OAUTH_CLIENTS: JSON.stringify([client]) }
it('defaults closed and permits only HTTPS or literal loopback origins and registered redirects', () => {
  expect(agentOAuthConfig({})).toBeNull()
  expect(agentOAuthConfig(valid)?.resource).toBe('https://app.test/mcp')
  expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_ORIGIN: 'http://localhost:5207' })?.resource).toBe('http://localhost:5207/mcp')
  for (const origin of ['http://app.test', 'http://localhost.evil.test', 'https://user:pass@app.test', 'https://app.test/path', 'https://app.test/']) expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_ORIGIN: origin })).toBeNull()
  for (const redirect of ['http://evil.test/callback', 'https://client.test/callback#fragment', 'https://user:pass@client.test/callback']) expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_CLIENTS: JSON.stringify([{ ...client, redirectUris: [redirect] }]) })).toBeNull()
  expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_CLIENTS: JSON.stringify([client, client]) })).toBeNull()
  expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_CLIENTS: JSON.stringify([{ ...client, clientId: 'https://remote.test/client.json' }]) })).toBeNull()
})
it('encodes canonical account IDs injectively without provider token separators', () => {
  expect(providerSubject('github:123')).not.toContain(':')
  expect(providerSubject('github:123')).not.toBe(providerSubject('github:124'))
  expect(atob(providerSubject('github:123'))).toBe('github:123')
})
