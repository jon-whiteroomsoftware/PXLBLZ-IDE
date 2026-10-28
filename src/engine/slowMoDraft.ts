import type { SlowMoSettings } from './slowMo'

export type SlowMoDraft = Omit<SlowMoSettings, 'inBetween' | 'persistence'> & {
  inBetween: SlowMoSettings['inBetween'] | 'off'
  persistence: { enabled: boolean; attackMs: number; decayMs: number }
}

export function createSlowMoDraft(): SlowMoDraft {
  return {
    rate: 1, stepMs: 16, inBetween: 'off',
    stagger: { shape: 'sweep', width: 0 },
    persistence: { enabled: false, attackMs: 0, decayMs: 2000 },
  }
}

export function slowMoSettingsFromDraft(draft: SlowMoDraft): SlowMoSettings | null {
  if (draft.inBetween === 'off') return null
  return {
    rate: draft.rate, stepMs: draft.stepMs, inBetween: draft.inBetween,
    stagger: { ...draft.stagger },
    persistence: draft.persistence.enabled
      ? { attackMs: draft.persistence.attackMs, decayMs: draft.persistence.decayMs }
      : null,
  }
}

export function slowMoDraftFromSettings(settings: SlowMoSettings | null, previous: SlowMoDraft): SlowMoDraft {
  if (settings === null) return {
    ...previous, inBetween: 'off', stagger: { ...previous.stagger }, persistence: { ...previous.persistence },
  }
  return {
    rate: settings.rate, stepMs: settings.stepMs, inBetween: settings.inBetween,
    stagger: { ...settings.stagger },
    persistence: settings.persistence
      ? { enabled: true, attackMs: settings.persistence.attackMs, decayMs: settings.persistence.decayMs }
      : { ...previous.persistence, enabled: false },
  }
}
