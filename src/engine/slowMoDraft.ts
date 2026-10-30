import type { SlowMoSettings } from './slowMo'

export type SlowMoDraft = SlowMoSettings

export function createSlowMoDraft(): SlowMoDraft {
  return { position: 1, dreamy: 0 }
}

export function slowMoSettingsFromDraft(draft: SlowMoDraft): SlowMoSettings {
  return { position: draft.position, dreamy: draft.dreamy }
}

export function slowMoDraftFromSettings(settings: SlowMoSettings | null): SlowMoDraft {
  return settings ? slowMoSettingsFromDraft(settings) : createSlowMoDraft()
}
