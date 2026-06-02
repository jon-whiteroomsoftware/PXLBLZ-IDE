import type { Settings } from '@/engine/settings'

const rawDemos = import.meta.glob('./demos/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const DEMOS: Record<string, string> = Object.fromEntries(
  Object.entries(rawDemos).map(([path, src]) => {
    const name = path.replace('./demos/', '').replace('.js', '')
    return [name, src as string]
  }),
)

// Recommended settings (IDE-side, preview-only) — cascade layer 2 (ADR-0013). One
// table keyed by curated-pattern (demo) name, consolidating the three former
// registries (recommended map / pixel count / solidity). A geometry-aware demo
// names the map / count / solidity it's meant to be seen on, so it opens looking its
// best without forcing anything: every value is just the on-open default ahead of
// the user global-sticky and dev-default, freely overridable from the controls, and
// never reaches pattern source, the transpiled artifact, or a controller. A demo
// carries no PatternRecord, so these recommendations are its only non-default layer.
export const RECOMMENDED_SETTINGS: Record<string, Partial<Settings>> = {
  AuroraSphere: { mapId: 'seed-sphere-3d', pixelCount: 4096, solidity: 1 },
  NebulaSphere: { mapId: 'seed-sphere-3d', pixelCount: 8192, solidity: 1 },
}

// The recommended settings for a demo (cascade layer 2), or an empty object for a
// demo without recommendations and for user patterns (which have no recommendation
// layer — dev-default + global-sticky + their own overrides only, ADR-0013).
export function recommendedSettingsFor(demoName: string | null | undefined): Partial<Settings> {
  return (demoName ? RECOMMENDED_SETTINGS[demoName] : undefined) ?? {}
}
