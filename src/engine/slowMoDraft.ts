import type { SlowMoSettings } from './slowMo'
import type { SlowMoBreathingSettings } from './slowMoBreathing'

export type SlowMoDraft = SlowMoSettings & { breathing?: SlowMoBreathingSettings }

export function createSlowMoDraft(): SlowMoDraft {
  return { position: 1, dreamy: 0 }
}

export function slowMoSettingsFromDraft(draft: SlowMoDraft): SlowMoSettings {
  return { position: draft.position, dreamy: draft.dreamy }
}

export function slowMoDraftFromSettings(settings: SlowMoSettings | null): SlowMoDraft {
  return settings ? slowMoSettingsFromDraft(settings) : createSlowMoDraft()
}
