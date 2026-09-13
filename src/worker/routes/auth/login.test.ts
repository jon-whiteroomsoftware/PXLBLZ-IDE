import { expect, it } from 'vitest'
import { agentContinuationCookieName } from '../../../cloudflare/auth'
import { onRequestGet } from './login'

const id = '00000000-0000-4000-8000-000000000000'
const env = { GITHUB_CLIENT_ID: 'github-client' }

it('sets only a validated opaque MCP continuation in the HttpOnly sign-in cookie', async () => {
  const response = await onRequestGet({ request: new Request(`https://app.test/api/auth/login?agent_continue=${id}`), env })
  expect(response.status).toBe(302)
  expect(response.headers.get('Location')).toContain('https://github.com/login/oauth/authorize')
  expect(response.headers.get('Location')).not.toContain('agent_continue')
  expect(response.headers.get('Set-Cookie')).toContain(`${agentContinuationCookieName}=${id}`)
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly')
  expect(response.headers.get('Set-Cookie')).toContain('SameSite=Lax')
})

it.each([
  `agent_continue=${id}&agent_continue=${id}`,
  'agent_continue=https%3A%2F%2Fhostile.test',
  '',
])('clears continuation state for an absent or invalid query (%s)', async (query) => {
  const response = await onRequestGet({ request: new Request(`https://app.test/api/auth/login${query ? `?${query}` : ''}`), env })
  expect(response.headers.get('Set-Cookie')).toContain(`${agentContinuationCookieName}=;`)
})
