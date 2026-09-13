import { expect, it } from 'vitest'
import { agentOAuthConfig, isAgentRedirectUri, providerSubject } from './agentOAuthConfig'
const client = { clientId: 'test-client', clientName: 'Test', redirectUris: ['https://client.test/callback'] }
const valid = { AGENT_OAUTH_ORIGIN: 'https://app.test', AGENT_OAUTH_CLIENTS: JSON.stringify([client]) }
it('defaults closed and permits only HTTPS or literal loopback origins and registered redirects', () => {
  expect(agentOAuthConfig({})).toBeNull()
  expect(agentOAuthConfig(valid)?.resource).toBe('https://app.test/mcp')
  expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_CLIENTS: '[]' })?.resource).toBe('https://app.test/mcp')
  expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_ORIGIN: 'http://localhost:5207' })?.resource).toBe('http://localhost:5207/mcp')
  for (const origin of ['http://app.test', 'http://localhost.evil.test', 'https://user:pass@app.test', 'https://app.test/path', 'https://app.test/']) expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_ORIGIN: origin })).toBeNull()
  for (const redirect of ['http://evil.test/callback', 'https://client.test/callback#fragment', 'https://user:pass@client.test/callback']) expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_CLIENTS: JSON.stringify([{ ...client, redirectUris: [redirect] }]) })).toBeNull()
  expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_CLIENTS: JSON.stringify([client, client]) })).toBeNull()
  expect(agentOAuthConfig({ ...valid, AGENT_OAUTH_CLIENTS: JSON.stringify([{ ...client, clientId: 'https://remote.test/client.json' }]) })).toBeNull()
})
it('uses only a literal loopback development override for isolated runtimes', () => {
  expect(agentOAuthConfig({ ...valid, PXLBLZ_DEV_AGENT_OAUTH_ORIGIN: 'http://localhost:5211' })?.resource).toBe('http://localhost:5211/mcp')
  for (const origin of ['https://app.test', 'http://app.test', 'http://localhost.evil.test', 'http://127.0.0.1:5211/path']) {
    expect(agentOAuthConfig({ ...valid, PXLBLZ_DEV_AGENT_OAUTH_ORIGIN: origin })).toBeNull()
  }
})
it('encodes canonical account IDs injectively without provider token separators', () => {
  expect(providerSubject('github:123')).not.toContain(':')
  expect(providerSubject('github:123')).not.toBe(providerSubject('github:124'))
  expect(atob(providerSubject('github:123'))).toBe('github:123')
})
it('matches redirect callbacks exactly except for an RFC 8252 loopback port', () => {
  expect(isAgentRedirectUri('http://127.0.0.1:3200/callback?fixed=1', ['http://127.0.0.1:3100/callback?fixed=1'])).toBe(true)
  expect(isAgentRedirectUri('http://localhost:3200/callback', ['http://localhost:3100/callback'])).toBe(true)
  expect(isAgentRedirectUri('https://client.test/callback', ['https://client.test/callback'])).toBe(true)
  for (const request of ['http://127.0.0.2:3200/callback', 'http://127.0.0.1:3200/other', 'http://127.0.0.1:3200/callback?changed=1', 'https://client.test:444/callback']) {
    expect(isAgentRedirectUri(request, ['http://127.0.0.1:3100/callback', 'https://client.test/callback'])).toBe(false)
  }
})
