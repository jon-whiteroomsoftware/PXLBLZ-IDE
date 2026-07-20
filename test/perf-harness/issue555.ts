// Wave-2 Controller baseline fixtures for issue #555 (epic #554).
//
// Five production-compiled Show artifacts measured before any wave-2 emission
// change lands. Each artifact is compiled once (master pixel count 2,000) and
// measured on the Controller at 256 / 1,000 / 2,000 physical pixels; the
// firmware only calls render for physical pixels, so one artifact yields a
// paired size ladder without recompiling.

import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import {
  compileShow,
  type GeneratedShowArtifact,
  type ShowCompileOptions,
  type ShowRecipe,
} from '../../src/engine/showCompiler'
import { showRecordToCompileRecipe } from '../../src/engine/showModel'
import {
  sourceForShowCell,
  sourceForShowPatternRef,
} from '../../src/engine/showPreviewArtifact'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { acceptanceRecipe } from './issue520'

export const WAVE2_MASTER_PIXEL_COUNT = 2_000
export const WAVE2_PIXEL_COUNTS = [256, 1_000, 2_000] as const

// HSV-emitting stock Patterns (issue #555 asks for one arithmetically cheap
// and one heavy member, recorded here):
// - EasedSweep: beforeRender does the trig; render2D is one abs + clamp + hsv.
// - Caustics: layered per-pixel trig field + hsv, the heavy conversion payer.
export const WAVE2_CHEAP_HSV_PATTERN = 'EasedSweep'
export const WAVE2_HEAVY_HSV_PATTERN = 'Caustics'

export type Wave2FixtureId =
  | 'redline-reference'
  | 'hsv-steady-state'
  | 'effect-tax'
  | 'mirror'
  | 'five-pattern-acceptance'

export interface Wave2Fixture {
  id: Wave2FixtureId
  artifact: GeneratedShowArtifact
  notes: string
}

const stageZone = {
  id: 'stage',
  name: 'stage',
  ranges: [{ start: 0, end: WAVE2_MASTER_PIXEL_COUNT - 1 }],
}

function redlineRecipe(): ShowRecipe {
  // Same construction as the #531 fixture module, kept independent so this
  // module does not eagerly build the whole attribution artifact set.
  const redline = STOCK_SHOWS.find((candidate) => (
    candidate.id === 'stock-show-showcase-redline-installation'
  ))
  if (!redline) throw new Error('Redline Installation fixture is missing.')
  return showRecordToCompileRecipe(redline.show, {
    byCellId: Object.fromEntries(redline.show.cells.map((cell) => [
      cell.id,
      sourceForShowCell(cell, []),
    ])),
    byPatternInstanceId: Object.fromEntries(
      (redline.show.composition?.patternInstances ?? []).map((instance) => [
        instance.id,
        sourceForShowPatternRef(instance.pattern, []),
      ]),
    ),
    controllerZones: installationPhysicalZones(redline.show),
    stageDimension: 2,
  })
}

export function hsvSteadyStateRecipe(): ShowRecipe {
  return {
    masterPixelCount: WAVE2_MASTER_PIXEL_COUNT,
    clips: [
      { id: 'hsv-cheap', source: DEMOS[WAVE2_CHEAP_HSV_PATTERN] },
      { id: 'hsv-heavy', source: DEMOS[WAVE2_HEAVY_HSV_PATTERN] },
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'Single stage zone', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 20_000,
          placements: [{ placementId: 'cheap', zoneName: 'stage', clipId: 'hsv-cheap' }],
          transitionOut: { kind: 'crossfade', durationMs: 2_000 },
        },
        {
          holdMs: 20_000,
          placements: [{ placementId: 'heavy', zoneName: 'stage', clipId: 'hsv-heavy' }],
        },
      ],
    },
    loopDurationMs: 42_000,
  }
}

export function effectTaxRecipe(): ShowRecipe {
  const steady = hsvSteadyStateRecipe()
  const effectsFor = (placementId: string) => ([
    { id: `${placementId}-hue`, kind: 'hue' as const, turns: 0 },
    { id: `${placementId}-posterize`, kind: 'posterize' as const, levels: 6, amount: 1 },
  ])
  const clipEffects: Record<string, ReturnType<typeof effectsFor>> = {
    'hsv-cheap': effectsFor('cheap'),
    'hsv-heavy': effectsFor('heavy'),
  }
  return {
    ...steady,
    clips: steady.clips.map((clip) => ({ ...clip, effects: clipEffects[clip.id] })),
    routedSceneSequence: {
      scenes: steady.routedSceneSequence!.scenes.map((scene) => {
        const placement = scene.placements[0]
        const effects = clipEffects[placement.clipId]
        return {
          ...scene,
          placements: [{ ...placement, effects }],
          propertyTracks: [{
            id: `${placement.placementId}-hue-track`,
            target: {
              kind: 'placement-effect' as const,
              placementId: placement.placementId!,
              effectId: effects[0].id,
              effectKind: 'hue' as const,
              parameterId: 'turns',
            },
            keyframes: [
              { id: 'start', timeMs: 0, value: 0, easing: { curve: 'linear' as const } },
              { id: 'end', timeMs: scene.holdMs, value: 1, easing: { curve: 'linear' as const } },
            ],
          }],
        }
      }),
    },
  }
}

export function mirrorRecipe(): ShowRecipe {
  return {
    masterPixelCount: WAVE2_MASTER_PIXEL_COUNT,
    clips: [{ id: 'heavy', source: DEMOS[WAVE2_HEAVY_HSV_PATTERN] }],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'Single stage zone', zones: [stageZone] }],
    routedSceneSequence: {
      // compileShow requires at least two routed scenes; the measurement
      // window sits inside the first 20 s mirrored hold either way.
      scenes: [
        {
          holdMs: 20_000,
          placements: [{
            placementId: 'mirrored',
            zoneName: 'stage',
            clipId: 'heavy',
            mirror: true,
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        },
        {
          holdMs: 20_000,
          placements: [{
            placementId: 'mirrored-again',
            zoneName: 'stage',
            clipId: 'heavy',
            mirror: true,
          }],
        },
      ],
    },
    loopDurationMs: 40_000,
  }
}

// Paired "after" passes flip wave-2 compile options via env (the runner's
// WAVE2_LABEL names the report); the default build stays the baseline.
const WAVE2_COMPILE_OPTIONS: ShowCompileOptions = process.env.WAVE2_DIRECT_SINKS === '1'
  ? { directColorSinks: true }
  : {}

function fixture(id: Wave2FixtureId, recipe: ShowRecipe, notes: string): Wave2Fixture {
  return { id, artifact: compileShow(recipe, LIBRARIES, WAVE2_COMPILE_OPTIONS), notes }
}

export const wave2Fixtures: Wave2Fixture[] = [
  fixture(
    'redline-reference',
    redlineRecipe(),
    'Stock Redline Installation, unchanged; continuity with the #531 ledger.',
  ),
  fixture(
    'hsv-steady-state',
    hsvSteadyStateRecipe(),
    `One zone, two >=20 s holds, one 2 s Crossfade; ${WAVE2_CHEAP_HSV_PATTERN} (cheap) and ${WAVE2_HEAVY_HSV_PATTERN} (heavy) both emit through hsv().`,
  ),
  fixture(
    'effect-tax',
    effectTaxRecipe(),
    'HSV steady-state Show plus an animated hue-rotate and a posterize Effect on each scene member.',
  ),
  fixture(
    'mirror',
    mirrorRecipe(),
    'Single zone; heavy HSV member with the horizontal Mirror Effect (#543).',
  ),
  fixture(
    'five-pattern-acceptance',
    acceptanceRecipe('snapshot-live'),
    'Unchanged five-Pattern acceptance Show for whole-Show regression coverage.',
  ),
]

export interface Wave2ResourceRow {
  sourceBytes: number
  expandedSourceBytes: number
  vmWords: number
  persistentGlobals: number
}

export function wave2ResourceRow(entry: Wave2Fixture): Wave2ResourceRow {
  return {
    sourceBytes: entry.artifact.summary.artifactBytes,
    expandedSourceBytes: entry.artifact.summary.expandedArtifactBytes,
    vmWords: entry.artifact.summary.resources.totalWords,
    persistentGlobals: entry.artifact.summary.resources.persistentGlobals,
  }
}

const CHECKSUM_TIMES_MS = [0, 5_000, 20_500, 25_000]

export function wave2FixtureChecksums(id: Exclude<Wave2FixtureId, 'redline-reference' | 'five-pattern-acceptance'>) {
  const entry = wave2Fixtures.find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`Unknown wave-2 fixture ${id}`)
  const mapPoints = Array.from({ length: WAVE2_MASTER_PIXEL_COUNT }, (_, index) => {
    const columns = 50
    const rows = WAVE2_MASTER_PIXEL_COUNT / columns
    return [(index % columns) / (columns - 1), Math.floor(index / columns) / (rows - 1)]
  })
  const checksums = (fidelity: 'fast' | 'fidelity') => {
    const replay = createFastReplayRuntime({
      code: entry.artifact.code,
      fxCode: entry.artifact.fxCode,
      metadata: entry.artifact.metadata,
      dimension: 2,
    }, { mapPoints, randomSeed: 555, fidelity })
    return CHECKSUM_TIMES_MS.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 250 }).checksum)
  }
  return { fast: checksums('fast'), precise: checksums('fidelity') }
}
