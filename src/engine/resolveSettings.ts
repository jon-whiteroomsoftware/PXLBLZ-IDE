// The per-pattern settings cascade resolver — engine-pure, table-tested.
//
// Effective value per field = first hit, top-down:
//   per-pattern override → recommended (demos only) → global-sticky (comfort prefs
//   only) → developer default.
//
// The field partition (settings.ts) decides which layers a field consults:
//   • cascaded   → override ?? recommended ?? devDefault   (global-sticky skipped)
//   • hybrid     → override ?? recommended ?? globalSticky ?? devDefault
//   • global-only → globalSticky (fidelity); override/recommended ignored even if present.
//
// This deviates from the originally-specified nominal `resolveSettings(id, …)` signature: the
// caller looks the override bag up by id and passes it in, so this stays a pure
// function over plain data with no record/map lookup.

import {
  type Settings,
  type GlobalSticky,
  HYBRID_FIELDS,
  GLOBAL_ONLY_FIELDS,
} from './settings'

const HYBRID = new Set<keyof Settings>(HYBRID_FIELDS)
const GLOBAL_ONLY = new Set<keyof Settings>(GLOBAL_ONLY_FIELDS)

export function resolveSettings(
  overrides: Partial<Settings>,
  recommended: Partial<Settings>,
  globalSticky: GlobalSticky,
  devDefaults: Settings,
): Settings {
  const out = {} as Settings
  for (const key of Object.keys(devDefaults) as (keyof Settings)[]) {
    if (GLOBAL_ONLY.has(key)) {
      // Pure global: only the global-sticky layer applies (fidelity). Override and
      // recommended are ignored even if a stray value were present.
      out[key] = globalSticky[key as keyof GlobalSticky] as never
    } else if (HYBRID.has(key)) {
      // Hybrid comfort pref: all four layers.
      out[key] = (overrides[key] ??
        recommended[key] ??
        globalSticky[key as keyof GlobalSticky] ??
        devDefaults[key]) as never
    } else {
      // Cascaded: override → recommended → dev-default (global-sticky skipped).
      out[key] = (overrides[key] ?? recommended[key] ?? devDefaults[key]) as never
    }
  }
  return out
}

// Decide where a hybrid-field drag (lightSize/diffusion) writes:
//   • global-sticky (set-once-stays-set) when the active pattern has NO recommendation
//     for the field AND NO existing override for it — the plain comfort-pref case.
//   • a per-pattern override otherwise — so a user can still outrank an enforced
//     recommendation, and an existing override keeps accumulating on the same pattern.
//
// `hasRecord` is false for a read-only demo: with no PatternRecord there is nowhere
// to store an override, so the drag falls back to the global-sticky regardless (the
// recommendation still outranks it on the next open).
export function hybridWriteTarget(opts: {
  hasRecord: boolean
  hasExistingOverride: boolean
  hasRecommendation: boolean
}): 'override' | 'globalSticky' {
  if (!opts.hasRecord) return 'globalSticky'
  if (opts.hasExistingOverride || opts.hasRecommendation) return 'override'
  return 'globalSticky'
}
