// Wave-5 attribution fixtures for issue #924 (epic #923).
//
// The #531 ladder (trivial-output / constant-members / capture-elided / full)
// last ran before waves 2-4, at 2,000 px, on light-to-medium members. Wave 5
// targets the installed base (<= ~500 px, native serial), where frames are
// member-bound, so this module builds the same ladder over heavy members and
// the two routing shapes (index-routed Installation, coordinate-routed
// Portable). Artifacts compile once at master pixel count 2,000 and are
// measured at 256 and 500 physical pixels, the #555 convention: the firmware
// renders only physical pixels, so one artifact yields a paired size ladder.
//
// Measurement window: activation + 2 s settle + sample, which lands inside
// the FIRST Scene's hold. Every steady fixture therefore puts the member
// under test first with a >= 20 s hold.

import { bundle } from '../../src/engine/bundle'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import type { ShowRecipe } from '../../src/engine/showCompiler'
import { showRecordToCompileRecipe } from '../../src/engine/showModel'
import {
  sourceForShowCell,
  sourceForShowPatternRef,
} from '../../src/engine/showPreviewArtifact'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { acceptanceRecipe } from './issue520'
import { hsvSteadyStateRecipe, WAVE2_MASTER_PIXEL_COUNT } from './issue555'
import {
  buildShowAttributionArtifacts,
  type ShowAttributionArtifacts,
} from './showAttribution'

export const ISSUE924_PIXEL_COUNTS = [256, 500] as const
export const ISSUE924_MASTER_PIXEL_COUNT = WAVE2_MASTER_PIXEL_COUNT

/** Heavy stock members. PhantomStar (~0.24 FPS at 256 px) is excluded: a
 *  4-6 s sample window would see at most one FPS packet. */
export const ISSUE924_HEAVY_MEMBERS = ['ZippyZaps', 'Caustics', 'Kishimisu'] as const

export type Issue924FixtureId =
  | 'redline-reference'
  | 'hsv-steady-light'
  | 'heavy-steady-zippyzaps'
  | 'heavy-steady-caustics'
  | 'heavy-steady-kishimisu'
  | 'portable-zones'
  | 'aperture-shapes'
  | 'five-pattern-acceptance'

export interface Issue924Fixture {
  id: Issue924FixtureId
  routing: 'index' | 'coordinate' | 'single-zone'
  masterPixelCount: number
  artifacts: ShowAttributionArtifacts
  notes: string
  /** Heavy members need a longer sample window for enough FPS packets. */
  sampleMs: number
}

const stageZone = {
  id: 'stage',
  name: 'stage',
  ranges: [{ start: 0, end: ISSUE924_MASTER_PIXEL_COUNT - 1 }],
}

/** One full-Stage zone: the member under test holds for 20 s, then a cheap
 *  member holds, so the steady window is the heavy member alone. */
export function heavySteadyRecipe(member: (typeof ISSUE924_HEAVY_MEMBERS)[number]): ShowRecipe {
  return {
    masterPixelCount: ISSUE924_MASTER_PIXEL_COUNT,
    clips: [
      { id: 'heavy', source: DEMOS[member] },
      { id: 'cheap', source: DEMOS.EasedSweep },
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'Single stage zone', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 20_000,
          placements: [{ placementId: 'heavy', zoneName: 'stage', clipId: 'heavy' }],
          transitionOut: { kind: 'crossfade', durationMs: 2_000 },
        },
        {
          holdMs: 20_000,
          placements: [{ placementId: 'cheap', zoneName: 'stage', clipId: 'cheap' }],
        },
      ],
    },
    loopDurationMs: 42_000,
  }
}

function stockShowRecipe(id: string, routing: 'index' | 'coordinate'): ShowRecipe {
  const item = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Stock Show ${id} is missing.`)
  return showRecordToCompileRecipe(item.show, {
    byCellId: Object.fromEntries(item.show.cells.map((cell) => [
      cell.id,
      sourceForShowCell(cell, []),
    ])),
    byPatternInstanceId: Object.fromEntries(
      (item.show.composition?.patternInstances ?? []).map((instance) => [
        instance.id,
        sourceForShowPatternRef(instance.pattern, []),
      ]),
    ),
    ...(routing === 'index' ? { controllerZones: installationPhysicalZones(item.show) } : {}),
    stageDimension: 2,
  })
}

function fixture(
  id: Issue924FixtureId,
  routing: Issue924Fixture['routing'],
  recipe: ShowRecipe,
  notes: string,
  sampleMs = 4_000,
): Issue924Fixture {
  return {
    id,
    routing,
    masterPixelCount: recipe.masterPixelCount ?? ISSUE924_MASTER_PIXEL_COUNT,
    artifacts: buildShowAttributionArtifacts({
      recipe,
      libraries: LIBRARIES,
      captureElision: {
        eligible: false,
        reason: 'Wave-5 ladder records capture and composition as unresolved Show overhead; the exact capture-elision exchange is #531 evidence.',
      },
    }),
    notes,
    sampleMs,
  }
}

let cached: Issue924Fixture[] | null = null

/** Built lazily: eight production compiles plus their constant-member twins. */
export function issue924Fixtures(): Issue924Fixture[] {
  if (cached) return cached
  cached = [
    fixture(
      'redline-reference',
      'index',
      stockShowRecipe('stock-show-showcase-redline-installation', 'index'),
      'Stock Redline Installation: five index-routed zones; at 256/500 px only zone 0 renders.',
    ),
    fixture(
      'hsv-steady-light',
      'single-zone',
      hsvSteadyStateRecipe(),
      'Wave-2 hsv-steady fixture (EasedSweep first): the light-member control.',
    ),
    fixture(
      'heavy-steady-zippyzaps',
      'single-zone',
      heavySteadyRecipe('ZippyZaps'),
      'ZippyZaps alone in one full-Stage zone (~1 FPS at 256 px).',
      8_000,
    ),
    fixture(
      'heavy-steady-caustics',
      'single-zone',
      heavySteadyRecipe('Caustics'),
      'Caustics alone in one full-Stage zone (voronoi-bound).',
      6_000,
    ),
    fixture(
      'heavy-steady-kishimisu',
      'single-zone',
      heavySteadyRecipe('Kishimisu'),
      'Kishimisu alone in one full-Stage zone (shader port with per-octave palette work).',
      6_000,
    ),
    fixture(
      'portable-zones',
      'coordinate',
      stockShowRecipe('stock-show-105-portable-zones', 'coordinate'),
      'Stock Portable zones Show: coordinate-predicate routing with per-pixel square-fill index synthesis.',
    ),
    fixture(
      'aperture-shapes',
      'coordinate',
      stockShowRecipe('stock-show-reference-aperture-shapes', 'coordinate'),
      'Stock aperture-shapes reference: the densest per-pixel ceil(sqrt(...)) census hit (10 sites).',
    ),
    fixture(
      'five-pattern-acceptance',
      'index',
      acceptanceRecipe('snapshot-live'),
      'Unchanged five-Pattern acceptance Show for whole-Show continuity with #531/#555.',
    ),
  ]
  return cached
}

/** Trivial dispatch probes: does the firmware charge more to call render2D
 *  (map lookup + two extra arguments) than render(index)? Installation Shows
 *  ignore the firmware's x/y, so a cheaper entry point would be free for them. */
export const ISSUE924_DISPATCH_PROBES = [
  { id: 'render-index', source: 'export function render(index) { rgb(0.125, 0.25, 0.5) }' },
  { id: 'render2d-unused-xy', source: 'export function render2D(index, x, y) { rgb(0.125, 0.25, 0.5) }' },
  { id: 'render2d-consumes-xy', source: 'export function render2D(index, x, y) { rgb(x, y, 0.5) }' },
  { id: 'render3d-unused-xyz', source: 'export function render3D(index, x, y, z) { rgb(0.125, 0.25, 0.5) }' },
] as const

export const ISSUE924_DISPATCH_PIXEL_COUNTS = [256, 500, 2_000] as const

export function dispatchProbeCode(source: string): string {
  return bundle(source, {}).code
}
