import { expect, it } from 'vitest'
import { agentAuthorizationExpiredPage, agentConsentPage, agentSignInPage } from './agentOAuthConsent'

it('renders the approved app-styled consent copy while escaping unverified identity labels', async () => {
  const response = agentConsentPage('<Agent & Co>', 'nonce-value', 'https://client.test/callback', '<Alex>')
  const html = await response.text()

  expect(html).toContain('Allow this agent to connect?')
  expect(html).toContain('Signed in as <strong>&lt;Alex&gt;</strong>')
  expect(html).toContain('Requesting application: <strong>&lt;Agent &amp; Co&gt;</strong>')
  expect(html).toContain('The application can read the Show and submit edits.')
  expect(html).toContain('return to your open Show and select <strong>Ready to connect</strong>')
  expect(html).toContain('value="allow">Allow connection</button>')
  expect(html).toContain('background:#facc15')
  expect(html).toContain("font-family:'Geist Variable'")
  expect(html).not.toContain('client can read its Show')
  expect(response.headers.get('Content-Security-Policy')).toContain("form-action 'self' https://client.test")
})

it('renders a same-origin sign-in continuation without carrying the client callback', async () => {
  const page = agentSignInPage('<Agent>', '00000000-0000-4000-8000-000000000000')
  const html = await page.text()
  expect(html).toContain('Sign in to connect your agent')
  expect(html).toContain('Requesting application: <strong>&lt;Agent&gt;</strong>')
  expect(html).toContain('/api/auth/login?agent_continue=00000000-0000-4000-8000-000000000000')
  expect(html).not.toContain('redirect_uri')
  expect(page.headers.get('Content-Security-Policy')).toContain("default-src 'none'")

  const expired = await agentAuthorizationExpiredPage().text()
  expect(expired).toContain('Authorization expired')
  expect(expired).toContain('restart authorization in your agent application')
})
