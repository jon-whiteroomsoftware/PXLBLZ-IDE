import { expect, it } from 'vitest'
import { agentRefusalMessage } from './agentRefusalMessage'

it.each([
  ['service_disabled', 'The Pixelblaze agent is unavailable right now.'],
  ['not_allowed', 'Agent editing is not enabled for this account.'],
  ['unauthorized', 'Sign in to use agent editing.'],
  ['exhausted', 'The shared daily allowance has been used. Try again tomorrow.'],
  ['no_live_editor', 'This Show is no longer connected. Reconnect before making another request.'],
  ['busy', 'Another edit is still in progress. Wait for its outcome.'],
  ['revision-conflict', 'The Show changed before this edit could be applied.'],
  ['interaction-timeout', 'Finish the current manual edit, then try again.'],
  ['service-failed', 'The agent could not finish this edit. Nothing was applied.'],
  ['unexpected_secret_code', 'Agent editing is unavailable right now.'],
])('explains %s without exposing transport codes', (code, expected) => {
  expect(agentRefusalMessage(code)).toBe(expected)
})
