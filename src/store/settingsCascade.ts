// The per-pattern settings cascade wiring (ADR-0013) — the single place that
// composes the four layers into live store state and routes a control's manipulation
// to the correct layer. No React; orchestrates across the three stores + the pure
// engine resolver, so components stay thin and this stays unit-testable.
//
// Seed-and-mirror: `seedActiveSettings` runs ONCE per pattern-open to resolve every
// field and push it into the live working stores (mapStore.active* + previewStore
// live values). The renderer then reads those live values per frame as before —
// resolveSettings never touches a frame. Each control's change handler calls the
// matching writer here to persist its layer (cascaded override / hybrid / global).

import type { Settings, FidelityMode } from '@/engine/settings'
import { DEV_DEFAULTS } from '@/engine/settings'
import { resolveSettings, hybridWriteTarget } from '@/engine/resolveSettings'
import { recommendedSettingsFor } from '@/pixelblaze/demos'
import type { ShapeId } from '@/engine/shapes'
import type { SurfaceId } from '@/engine/surfaces'
import { usePatternStore } from './patternStore'
import { usePreviewStore } from './previewStore'
import { useMapStore } from './mapStore'

// The active pattern's persisted overrides (layer 1). A user pattern stores them on
// its PatternRecord; a demo stores them in the keyed demoOverrides map (ADR-0013
// amendment) — both are layer-1 override bags, so they resolve identically.
function activeOverrides(): Partial<Settings> {
  const ps = usePatternStore.getState()
  if (ps.activeDemoName) return ps.demoOverrides[ps.activeDemoName] ?? {}
  const id = ps.activePatternId
  const record = id ? ps.userPatterns.find((p) => p.id === id) : undefined
  return record?.settings ?? {}
}

// Persist a single layer-1 override field for whatever is active — routed to the user
// pattern's record or the active demo's override bag. A no-op when neither is active.
function persistOverride<K extends keyof Settings>(field: K, value: Settings[K]): void {
  const ps = usePatternStore.getState()
  if (ps.activeDemoName) {
    void ps.updateDemoSettings(ps.activeDemoName, { [field]: value })
  } else if (ps.activePatternId) {
    void ps.updatePatternSettings(ps.activePatternId, { [field]: value })
  }
}

// Whether the active pattern/demo carries any layer-1 overrides. Drives the
// "Reset to defaults" / "Revert to recommended" affordance: the action clears layer 1,
// so it is offered exactly when there is something there to clear (ADR-0013).
export function hasActiveOverrides(): boolean {
  return Object.keys(activeOverrides()).length > 0
}

// The live global-sticky layer (layer 3) read from previewStore.
function globalSticky(): { lightSize: number; diffusion: number; fidelity: FidelityMode } {
  const pv = usePreviewStore.getState()
  return { lightSize: pv.lightSizeSticky, diffusion: pv.diffusionSticky, fidelity: pv.fidelity }
}

// Resolve the effective settings for whatever is active (user pattern or demo),
// composing override → recommended → global-sticky → dev-default.
export function resolveActiveSettings(): Settings {
  const recommended = recommendedSettingsFor(usePatternStore.getState().activeDemoName)
  return resolveSettings(activeOverrides(), recommended, globalSticky(), DEV_DEFAULTS)
}

// Resolve the effective settings for a named demo, regardless of what's active. Used
// by the per-row demo fork (#182), which forks a demo without first opening it — so
// it can't rely on `activeDemoName`. No overrides (a demo has none); just the demo's
// recommendation over the global-sticky and dev-default layers.
export function resolveSettingsForDemo(demoName: string): Settings {
  return resolveSettings({}, recommendedSettingsFor(demoName), globalSticky(), DEV_DEFAULTS)
}

// Seed the live working stores from the resolved settings (open-time, ADR-0013).
// Replaces the former per-field hydrate/solidity effects. `fidelity` is pure-global
// (already live in previewStore), so it is not reseeded here.
export function seedActiveSettings(): void {
  const eff = resolveActiveSettings()
  const m = useMapStore.getState()
  m.setActiveMap(eff.mapId)
  m.setActiveShape(eff.shapeId as ShapeId)
  m.setActiveSurface(eff.surfaceId as SurfaceId)
  m.setActivePixelCount(eff.pixelCount)
  m.setActiveSolidity(eff.solidity)
  m.setActiveNormalizeMode(eff.normalize)
  const pv = usePreviewStore.getState()
  pv.setBrightness(eff.brightness)
  pv.setSpeed(eff.speed)
  pv.setLightSize(eff.lightSize)
  pv.setDiffusion(eff.diffusion)
}

// Write a cascaded override (layer 1) for whatever is active. Routes to the user
// pattern's record or, for a demo, its keyed override bag (ADR-0013 amendment) — both
// persist, so a reopen restores the change.
export function writeCascadedOverride<K extends keyof Settings>(field: K, value: Settings[K]): void {
  persistOverride(field, value)
}

// Route a hybrid comfort-pref drag (lightSize/diffusion) to the correct layer
// (ADR-0013): a per-pattern/per-demo override when the active item already has a
// recommendation or existing override for the field, else the global-sticky baseline
// (set-once-stays-set). A demo now has a persistent override home too, so it follows
// the same rule as a user pattern.
export function writeHybrid(field: 'lightSize' | 'diffusion', value: number): void {
  const ps = usePatternStore.getState()
  const hasHome = !!(ps.activePatternId || ps.activeDemoName)
  const target = hybridWriteTarget({
    hasRecord: hasHome,
    hasExistingOverride: activeOverrides()[field] !== undefined,
    hasRecommendation: recommendedSettingsFor(ps.activeDemoName)[field] !== undefined,
  })
  if (target === 'override') {
    persistOverride(field, value)
  } else if (field === 'lightSize') {
    usePreviewStore.getState().setLightSizeSticky(value)
  } else {
    usePreviewStore.getState().setDiffusionSticky(value)
  }
}

// Snapshot the active demo's *effective* settings as a frozen layer-1 override copy
// for a fork (ADR-0013). Everything except `fidelity` is captured — `fidelity` is
// pure-global and never per-pattern. The fork carries no live pointer back to the
// demo: later changes to the demo's recommendations never reach this copy. Call this
// while the demo is still active (before `setActivePattern` flips state).
export function forkSettingsSnapshot(): Partial<Settings> {
  const { fidelity: _fidelity, ...rest } = resolveActiveSettings()
  return rest
}

// Same frozen snapshot for a named demo (per-row fork, #182), which forks without the
// demo being active. Captures every field except pure-global `fidelity`.
export function forkSettingsSnapshotForDemo(demoName: string): Partial<Settings> {
  const { fidelity: _fidelity, ...rest } = resolveSettingsForDemo(demoName)
  return rest
}

// "Reset to defaults" (user pattern) / "Revert to recommended" (demo), ADR-0013:
// clear the active item's layer-1 overrides, then re-seed so the live preview drops to
// the next layer down — recommended (demos) or global + dev-default (user patterns).
// Hybrid comfort prefs that live in global-sticky are read, not cleared, so a personal
// light-size/diffusion baseline survives the revert. No-op when nothing is active.
export async function resetActiveSettings(): Promise<void> {
  const ps = usePatternStore.getState()
  if (ps.activeDemoName) {
    await ps.resetDemoSettings(ps.activeDemoName)
  } else if (ps.activePatternId) {
    await ps.resetPatternSettings(ps.activePatternId)
  } else {
    return
  }
  seedActiveSettings()
}
