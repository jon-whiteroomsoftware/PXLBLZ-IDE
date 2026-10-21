export type VisualFrameLabel = 'still' | 'hold' | 'transition'
export interface VisualBaselineFrame { label: VisualFrameLabel; startMs: number; note: string }
export interface VisualBaselineFixture {
  id: 'pattern-1d' | 'pattern-2d' | 'show-portable' | 'show-installation'
  kind: 'pattern' | 'show'
  dimension: '1D' | '2D'
  /** Stock Pattern demo name (kind pattern) or stock Show id (kind show). */
  target: string
  /** Route under the Studio base URL, without ?capture. */
  route: string
  /** Pinned map as the route resolves it, for the review page and the invariant test. */
  map: string
  seed: string
  fidelity: 'fast'
  frames: readonly VisualBaselineFrame[]
}

export const VISUAL_BASELINE_VIEWPORT = { width: 1280, height: 800 } as const
export const VISUAL_BASELINE_CANVAS_WIDTH = 1280
export const VISUAL_BASELINE_FPS = 60
/** Per-pixel YIQ threshold 0.05 and zero differing pixels: measured renders are byte-identical on one host. */
export const VISUAL_BASELINE_COMPARISON = { threshold: 0.05, maxDiffPixels: 0 } as const
export const VISUAL_BASELINE_FIXTURES: readonly VisualBaselineFixture[] = [
  {
    id: 'pattern-1d', kind: 'pattern', dimension: '1D', target: 'PendulumWave',
    route: 'studio/patterns/PendulumWave', map: 'line, 256 pixels (RECOMMENDED_SETTINGS)',
    seed: 'none: source calls no random()', fidelity: 'fast',
    frames: [{ label: 'still', startMs: 3000, note: 'The 1D Pattern at three seconds.' }],
  },
  {
    id: 'pattern-2d', kind: 'pattern', dimension: '2D', target: 'EasedSweep',
    route: 'studio/patterns/EasedSweep', map: 'wide, flat, 256 pixels, contain (RECOMMENDED_SETTINGS)',
    seed: 'none: source calls no random()', fidelity: 'fast',
    frames: [{ label: 'still', startMs: 3000, note: 'The 2D Pattern at three seconds.' }],
  },
  {
    id: 'show-portable', kind: 'show', dimension: '2D', target: 'stock-show-remix-quadrille',
    route: 'studio/shows/stock-show-remix-quadrille', map: 'plane (stageMapId)',
    seed: 'stableShowSeed(showId)', fidelity: 'fast',
    frames: [
      { label: 'hold', startMs: 6000, note: 'Inside the Four mirrors section, before the 12000 ms crossfade.' },
      { label: 'transition', startMs: 12400, note: 'Midpoint of the 800 ms crossfade at 12000 ms.' },
    ],
  },
  {
    id: 'show-installation', kind: 'show', dimension: '2D', target: 'stock-show-301-installation-mapping',
    route: 'studio/shows/stock-show-301-installation-mapping', map: 'proscenium-stage-2d, 1000 LEDs (stageMapId)',
    seed: 'stableShowSeed(showId)', fidelity: 'fast',
    frames: [
      { label: 'hold', startMs: 3500, note: 'Inside the opening hold, away from clip boundaries.' },
      { label: 'transition', startMs: 7000, note: 'The Cut where Stage and Columns swap Patterns.' },
    ],
  },
]

export function visualBaselineSnapshotName(fixture: VisualBaselineFixture, frame: VisualBaselineFrame): string {
  return `${fixture.id}-${frame.label}.png`
}
