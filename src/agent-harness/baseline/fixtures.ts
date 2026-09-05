// The finite fixture set of the #945 agent-editing baseline. Each entry names
// a Show the browser sequences or the fixture-evidence command open, the
// features it is there to cover, and where its record comes from: a
// constructed flat record (the shape the corpus fixture uses, projected to a
// composition on open) or a stock Show resolved by id at run time. This
// module holds data and pure builders only, so Playwright can import it
// without Vite: stock records are looked up by the caller.
import type { LibraryRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'

export type BaselineFixtureId =
  | 'personal-base'
  | 'personal-library-pattern'
  | 'stock-draft'
  | 'groups'
  | 'animation'
  | 'routing'
  | 'long-timeline'

export type BaselineFixtureFeature =
  | 'personal-show'
  | 'personal-pattern'
  | 'personal-library'
  | 'stock-draft'
  | 'groups'
  | 'animation'
  | 'routing'
  | 'long-timeline'
  | 'boundary-transition'

export interface BaselineFixture {
  id: BaselineFixtureId
  description: string
  features: BaselineFixtureFeature[]
  source:
    | { kind: 'constructed' }
    | { kind: 'stock'; stockShowId: string }
  /** Constructed fixtures build their record here; stock fixtures have none. */
  build?: () => ShowRecord
  /** Personal Patterns the record references, seeded before the Show. */
  patterns?: PatternRecord[]
  /** Personal Libraries those Patterns call, seeded before the Patterns. */
  libraries?: LibraryRecord[]
}

const STAMP = 1_757_000_000_000

const DEFAULT_ADAPTATIONS = { mirror: false, phase: 0, brightness: 1, timeScale: 1 }

const PORTABLE_CONTRACT = {
  version: 1,
  kind: 'portable-2d',
  referenceMapId: 'plane',
  referencePixelCount: 256,
  compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
}

function stockCell(id: string, sceneId: string, patternId: string) {
  return {
    id,
    zoneId: 'z1',
    sceneId,
    sceneSpan: 1,
    pattern: { kind: 'stock', id: patternId },
    patternName: patternId,
    adaptations: { ...DEFAULT_ADAPTATIONS },
  }
}

/** Two 30 s Scenes on one Zone, stock Patterns only: the corpus's base shape. */
export function personalBaseShow(id = 'baseline-personal-base'): ShowRecord {
  return {
    id,
    name: 'Baseline personal Show',
    updatedAt: STAMP,
    scenes: [
      { id: 's1', name: 'Opening', durationMs: 30_000 },
      { id: 's2', name: 'Closing', durationMs: 30_000 },
    ],
    zones: [{ id: 'z1', name: 'Main', nominalPixelCount: 64 }],
    cells: [stockCell('c1', 's1', 'CometLoom'), stockCell('c2', 's2', 'TestPattern1D')],
    routingLayouts: [
      { id: 'l1', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } },
    ],
    transitions: [],
    outputContract: PORTABLE_CONTRACT,
  } as unknown as ShowRecord
}

export const BASELINE_LIBRARY: LibraryRecord = {
  id: 'baseline-library-blz',
  name: 'Blz',
  src: [
    '// Half of a value, kept as a Library call so the Pattern below depends on',
    '// personal Library resolution at compile time.',
    'function half(value) {',
    '  return value * 0.5',
    '}',
    '',
  ].join('\n'),
  updatedAt: STAMP,
}

export const BASELINE_LIBRARY_PATTERN: PatternRecord = {
  id: 'baseline-pattern-library-pulse',
  name: 'Library Pulse',
  src: [
    '// A personal Pattern that calls a personal Library (Blz.half).',
    'export function render(index) {',
    '  var h = Blz.half(index / pixelCount) + time(0.05)',
    '  hsv(h, 1, 1)',
    '}',
    '',
  ].join('\n'),
  controls: {},
  updatedAt: STAMP,
}

/** The base shape with the first Clip on a personal Pattern that calls a personal Library. */
export function personalLibraryPatternShow(id = 'baseline-personal-library'): ShowRecord {
  const base = personalBaseShow(id)
  return {
    ...base,
    name: 'Baseline Library Pattern Show',
    cells: [
      {
        ...stockCell('c1', 's1', 'CometLoom'),
        pattern: { kind: 'user', id: BASELINE_LIBRARY_PATTERN.id },
        patternName: BASELINE_LIBRARY_PATTERN.name,
      },
      stockCell('c2', 's2', 'TestPattern1D'),
    ],
  } as ShowRecord
}

/** Twelve 30 s Scenes (six minutes) with a crossfade at every boundary. */
export function longTimelineShow(id = 'baseline-long-timeline'): ShowRecord {
  const patterns = ['CometLoom', 'TestPattern1D', 'TestPattern2D']
  const scenes = Array.from({ length: 12 }, (_, index) => ({
    id: `s${index + 1}`,
    name: `Scene ${index + 1}`,
    durationMs: 30_000,
  }))
  return {
    ...personalBaseShow(id),
    name: 'Baseline long timeline',
    scenes,
    cells: scenes.map((scene, index) => stockCell(`c${index + 1}`, scene.id, patterns[index % patterns.length])),
    transitions: scenes.slice(0, -1).map((scene) => ({
      id: `transition-${scene.id}`,
      afterSceneId: scene.id,
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'snapshot-live',
    })),
  } as unknown as ShowRecord
}

export const BASELINE_FIXTURES: BaselineFixture[] = [
  {
    id: 'personal-base',
    description: 'Personal Show, two Scenes, stock Patterns; the browser sequences edit this shape.',
    features: ['personal-show'],
    source: { kind: 'constructed' },
    build: () => personalBaseShow(),
  },
  {
    id: 'personal-library-pattern',
    description: 'Personal Show whose first Clip runs a personal Pattern that calls a personal Library.',
    features: ['personal-show', 'personal-pattern', 'personal-library'],
    source: { kind: 'constructed' },
    build: () => personalLibraryPatternShow(),
    patterns: [BASELINE_LIBRARY_PATTERN],
    libraries: [BASELINE_LIBRARY],
  },
  {
    id: 'stock-draft',
    description: 'Built-in lesson Show edited as an in-memory draft; no personal save exists.',
    features: ['stock-draft'],
    source: { kind: 'stock', stockShowId: 'stock-show-101-clips-cuts-blank-time' },
  },
  {
    id: 'groups',
    description: 'Built-in Show with Group definitions and occurrences.',
    features: ['groups'],
    source: { kind: 'stock', stockShowId: 'stock-show-205-groups-linked-reuse' },
  },
  {
    id: 'animation',
    description: 'Built-in reference Show with property animation tracks.',
    features: ['animation'],
    source: { kind: 'stock', stockShowId: 'stock-show-reference-property-animation' },
  },
  {
    id: 'routing',
    description: 'Built-in Show that changes Zone Layouts along the timeline.',
    features: ['routing'],
    source: { kind: 'stock', stockShowId: 'stock-show-206-changing-zone-layouts' },
  },
  {
    id: 'long-timeline',
    description: 'Constructed six-minute Show: twelve Scenes with a crossfade at every boundary.',
    features: ['personal-show', 'long-timeline', 'boundary-transition'],
    source: { kind: 'constructed' },
    build: () => longTimelineShow(),
  },
]

export function baselineFixture(id: BaselineFixtureId): BaselineFixture {
  const found = BASELINE_FIXTURES.find((fixture) => fixture.id === id)
  if (!found) throw new Error(`unknown baseline fixture ${id}`)
  return found
}

/** The record for a fixture; stock records come from the caller's catalogue lookup. */
export function resolveBaselineFixtureRecord(
  fixture: BaselineFixture,
  lookupStock: (stockShowId: string) => ShowRecord | undefined,
): ShowRecord {
  if (fixture.source.kind === 'constructed') {
    if (!fixture.build) throw new Error(`constructed fixture ${fixture.id} has no builder`)
    return fixture.build()
  }
  const record = lookupStock(fixture.source.stockShowId)
  if (!record) throw new Error(`stock Show ${fixture.source.stockShowId} is not in the catalogue`)
  return structuredClone(record)
}
