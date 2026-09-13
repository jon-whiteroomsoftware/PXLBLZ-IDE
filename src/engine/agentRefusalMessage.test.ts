import { expect, it } from 'vitest'
import { agentRefusalMessage } from './agentRefusalMessage'

it.each([
  ['service_disabled', 'Agent connections are unavailable right now.'],
  ['unauthorized', 'Sign in to use agent editing.'],
  ['daily_message_limit', 'Your daily 30-message allowance has been used. Try again after the reset.'],
  ['daily_api_budget', 'The Pixelblaze agent is out of budget for today. Try again after the daily reset.'],
  ['exhausted', 'The Pixelblaze agent is out of budget for today. Try again after the daily reset.'],
  ['no_live_editor', 'This Show is no longer connected. Reconnect before making another request.'],
  ['busy', 'Another edit is still in progress. Wait for its outcome.'],
  ['revision-conflict', 'The Show changed before this edit could be applied.'],
  ['interaction-timeout', 'Finish the current manual edit, then try again.'],
  ['service-failed', 'The agent could not finish this edit. Nothing was applied.'],
  ['disconnected_not_forgotten', 'Disconnected, but this agent could not be forgotten. Reconnect it and try Forget again.'],
  ['unexpected_secret_code', 'Agent editing is unavailable right now.'],
])('explains %s without exposing transport codes', (code, expected) => {
  expect(agentRefusalMessage(code)).toBe(expected)
})
