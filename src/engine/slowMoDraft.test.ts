import { describe, expect, it } from 'vitest'
import { createSlowMoDraft, slowMoDraftFromSettings, slowMoSettingsFromDraft } from './slowMoDraft'

const configured = () => ({
  ...createSlowMoDraft(), rate: 0.25, stepMs: 32,
  stagger: { shape: 'scatter' as const, width: 0.7 },
  persistence: { enabled: false, attackMs: 1500, decayMs: 7000 },
})

describe('session slow-mo draft projection', () => {
  it('creates complete independent defaults', () => {
    const a = createSlowMoDraft(), b = createSlowMoDraft()
    expect(a).toEqual({ rate: 1, stepMs: 16, inBetween: 'off', stagger: { shape: 'sweep', width: 0 }, persistence: { enabled: false, attackMs: 0, decayMs: 2000 } })
    expect(a).not.toBe(b)
    expect(a.stagger).not.toBe(b.stagger)
    expect(a.persistence).not.toBe(b.persistence)
  })

  it('projects every complete Off draft to null', () => {
    expect(slowMoSettingsFromDraft(configured())).toBeNull()
  })

  it.each(['clock', 'hold', 'blend', 'eased'] as const)('projects %s without draft-only fields or mutation', (inBetween) => {
    for (const enabled of [false, true]) {
      const draft = { ...configured(), inBetween, persistence: { ...configured().persistence, enabled } }
      const before = structuredClone(draft)
      const settings = slowMoSettingsFromDraft(draft)!
      expect(settings).toEqual({ rate: 0.25, stepMs: 32, inBetween, stagger: { shape: 'scatter', width: 0.7 }, persistence: enabled ? { attackMs: 1500, decayMs: 7000 } : null })
      expect(settings.stagger).not.toBe(draft.stagger)
      if (enabled) expect(settings.persistence).not.toBe(draft.persistence)
      expect(draft).toEqual(before)
    }
  })

  it('retains every field through configured Off → Blend → Off → Blend', () => {
    const draft = configured()
    const blend = { ...draft, inBetween: 'blend' as const }
    const off = slowMoDraftFromSettings(null, blend)
    expect(off).toEqual(draft)
    expect(slowMoSettingsFromDraft({ ...off, inBetween: 'blend' })).toEqual(slowMoSettingsFromDraft(blend))
    expect(blend.inBetween).toBe('blend')
    expect(off.stagger).not.toBe(blend.stagger)
    expect(off.persistence).not.toBe(blend.persistence)
  })

  it('adapts active legacy settings and retains inactive persistence dials', () => {
    const previous = configured()
    const settings = { rate: 0.5, stepMs: 16, inBetween: 'eased' as const, stagger: { shape: 'radial' as const, width: 0.2 }, persistence: { attackMs: 20, decayMs: 30 } }
    const before = structuredClone({ previous, settings })
    const active = slowMoDraftFromSettings(settings, previous)
    expect(active).toEqual({ ...settings, persistence: { enabled: true, attackMs: 20, decayMs: 30 } })
    expect(active.stagger).not.toBe(settings.stagger)
    expect(active.persistence).not.toBe(settings.persistence)
    expect(slowMoDraftFromSettings({ ...settings, persistence: null }, previous)).toEqual({ ...settings, persistence: { enabled: false, attackMs: 1500, decayMs: 7000 } })
    expect({ previous, settings }).toEqual(before)
  })
})
