import { createSlowMoDraft, slowMoDraftFromSettings, slowMoSettingsFromDraft } from './slowMoDraft'

it('creates independent full-speed, zero-dreamy defaults', () => {
  const a = createSlowMoDraft(), b = createSlowMoDraft()
  expect(a).toEqual({ position: 1, dreamy: 0 })
  expect(a).not.toBe(b)
})
it('projects both live values without sharing or mutation, and resets null to defaults', () => {
  const input = Object.freeze({ position: 0.37, dreamy: 0.6 })
  const projected = slowMoSettingsFromDraft(input)
  expect(projected).toEqual(input)
  expect(projected).not.toBe(input)
  expect(slowMoDraftFromSettings(projected)).toEqual(input)
  expect(slowMoDraftFromSettings(null)).toEqual(createSlowMoDraft())
})
