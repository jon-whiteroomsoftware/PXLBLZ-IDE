import {
  analyzeCompiledRestartGlobalLiveness,
  colorRestartGlobalLifetimes,
  deriveRestartMemberLifetimes,
  inspectCompiledMemberGlobalSlots,
  type RestartGlobalOwner,
} from './showRestartGlobalLiveness'
import type { ShowRecipe } from '../../src/engine/showCompiler'

function owner(
  id: string,
  startMs: number,
  endMs: number,
  slotCount: number,
  patch: Partial<RestartGlobalOwner> = {},
): RestartGlobalOwner {
  return {
    id,
    intervals: [{ startMs, endMs }],
    occurrenceCount: 1,
    hasLiveControls: false,
    slots: Array.from({ length: slotCount }, (_, index) => ({
      name: `${id}_${index}`,
      reinitializable: true,
      initializerSource: '0',
    })),
    ...patch,
  }
}

describe('Restart-instance persistent-global liveness coloring (#536)', () => {
  it('reuses the same scalar colors across half-open disjoint lifetimes', () => {
    const report = colorRestartGlobalLifetimes([
      owner('first', 0, 10, 2),
      owner('second', 10, 20, 3),
    ])

    expect(report).toMatchObject({
      globalsBefore: 5,
      globalsAfter: 3,
      reclaimedGlobals: 2,
      eligibleGlobals: 5,
      excludedGlobals: 0,
    })
    expect(new Set(report.assignments.filter((entry) => entry.ownerId === 'first').map((entry) => entry.color))).toEqual(new Set([0, 1]))
    expect(new Set(report.assignments.filter((entry) => entry.ownerId === 'second').map((entry) => entry.color))).toEqual(new Set([0, 1, 2]))
  })

  it('keeps overlapping Restart owners in distinct colors', () => {
    const report = colorRestartGlobalLifetimes([
      owner('first', 0, 12, 2),
      owner('second', 10, 20, 3),
    ])

    expect(report).toMatchObject({ globalsBefore: 5, globalsAfter: 5, reclaimedGlobals: 0 })
    expect(report.owners.find((entry) => entry.id === 'first')?.overlaps).toEqual(['second'])
    expect(report.owners.find((entry) => entry.id === 'second')?.overlaps).toEqual(['first'])
  })

  it('conservatively excludes Continue owners and owners with live controls', () => {
    const report = colorRestartGlobalLifetimes([
      owner('continued', 0, 10, 2, { occurrenceCount: 2 }),
      owner('controlled', 10, 20, 2, { hasLiveControls: true }),
      owner('restart', 20, 30, 2),
    ])

    expect(report).toMatchObject({
      globalsBefore: 6,
      globalsAfter: 6,
      eligibleGlobals: 2,
      excludedGlobals: 4,
    })
    expect(report.owners.find((entry) => entry.id === 'continued')?.exclusionReasons).toContain('continue')
    expect(report.owners.find((entry) => entry.id === 'controlled')?.exclusionReasons).toContain('live-controls')
  })

  it('shares only proved scalar state while retaining arrays and unknown initialization', () => {
    const first = owner('first', 0, 10, 3)
    first.slots[1].reinitializable = false
    first.slots[1].initializerSource = 'random()'
    first.slots[2].kind = 'array'
    const second = owner('second', 10, 20, 1)

    const report = colorRestartGlobalLifetimes([first, second])

    expect(report).toMatchObject({
      globalsBefore: 4,
      globalsAfter: 3,
      reclaimedGlobals: 1,
      eligibleGlobals: 2,
      excludedGlobals: 2,
    })
    expect(report.owners.find((entry) => entry.id === 'first')?.exclusionReasons).toEqual([
      'array-state',
      'unproved-initializer',
    ])
  })

  it('reports entry initialization work and adds no steady-state render work', () => {
    const report = colorRestartGlobalLifetimes([
      owner('first', 0, 10, 2),
      owner('second', 10, 20, 2),
    ])

    expect(report.entryInitialization).toMatchObject({
      ownerCount: 2,
      assignmentCount: 4,
      addedSymbols: 2,
    })
    expect(report.entryInitialization.estimatedSourceBytes).toBeGreaterThan(0)
    expect(report.steadyStateRenderOperationsAdded).toBe(0)
  })

  it('derives conservative overlap windows from routed Scene transitions', () => {
    const recipe: ShowRecipe = {
      clips: ['a', 'b', 'c'].map((id) => ({ id, source: 'export function render(index) { rgb(0, 0, 0) }' })),
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 10,
            placements: [{ zoneName: 'main', clipId: 'a' }],
            transitionOut: { kind: 'crossfade', durationMs: 4 },
          },
          {
            holdMs: 10,
            placements: [{ zoneName: 'main', clipId: 'b' }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          { holdMs: 10, placements: [{ zoneName: 'main', clipId: 'c' }] },
        ],
      },
      loopDurationMs: 34,
    }

    expect(deriveRestartMemberLifetimes(recipe)).toEqual([
      { id: 'a', occurrenceCount: 1, intervals: [{ startMs: 0, endMs: 14 }] },
      { id: 'b', occurrenceCount: 1, intervals: [{ startMs: 10, endMs: 24 }] },
      { id: 'c', occurrenceCount: 1, intervals: [{ startMs: 24, endMs: 34 }] },
    ])
  })

  it('marks a member used in multiple Scenes as Continue even when its windows are disjoint', () => {
    const recipe: ShowRecipe = {
      clips: ['a', 'b'].map((id) => ({ id, source: 'export function render(index) { rgb(0, 0, 0) }' })),
      sceneSequence: {
        scenes: [
          { clipId: 'a', holdMs: 10 },
          { clipId: 'b', holdMs: 10 },
          { clipId: 'a', holdMs: 10 },
        ],
      },
    }

    expect(deriveRestartMemberLifetimes(recipe).find((entry) => entry.id === 'a')).toEqual({
      id: 'a',
      occurrenceCount: 2,
      intervals: [{ startMs: 0, endMs: 10 }, { startMs: 20, endMs: 30 }],
    })
  })

  it('classifies compiled member scalars without treating arrays or calls as reinitializable', () => {
    const source = `
var __pxlblz_show_c0_exact = 1 + 2
var __pxlblz_show_c0_unknown = random()
var __pxlblz_show_c0_cache = array(4)
var __pxlblz_show_c1_empty
var __pxlblz_show_scheduler = 0
`

    expect(inspectCompiledMemberGlobalSlots(source, ['first', 'second'])).toEqual([
      {
        id: 'first',
        slots: [
          { name: '__pxlblz_show_c0_exact', kind: 'scalar', reinitializable: true, initializerSource: '1 + 2' },
          { name: '__pxlblz_show_c0_unknown', kind: 'scalar', reinitializable: false, initializerSource: 'random()' },
          { name: '__pxlblz_show_c0_cache', kind: 'array', reinitializable: false, initializerSource: 'array(4)' },
        ],
      },
      {
        id: 'second',
        slots: [
          { name: '__pxlblz_show_c1_empty', kind: 'scalar', reinitializable: true, initializerSource: '0' },
        ],
      },
    ])
  })

  it('combines compiled globals, lifetime proof, and live-control exclusion', () => {
    const recipe: ShowRecipe = {
      clips: [
        { id: 'first', source: '', controlTargets: { sliderAmount: 0.5 } },
        { id: 'second', source: '' },
      ],
      sceneSequence: {
        scenes: [
          { clipId: 'first', holdMs: 10 },
          { clipId: 'second', holdMs: 10 },
        ],
      },
    }
    const code = 'var __pxlblz_show_c0_a = 0\nvar __pxlblz_show_c1_b = 0\n'

    const report = analyzeCompiledRestartGlobalLiveness(recipe, code)

    expect(report).toMatchObject({ globalsBefore: 2, globalsAfter: 2, reclaimedGlobals: 0 })
    expect(report.owners.find((entry) => entry.id === 'first')?.exclusionReasons).toContain('live-controls')
  })

  it('excludes public Pattern state and scheduler-owned globals from the conservative candidate set', () => {
    const recipe: ShowRecipe = {
      clips: [
        { id: 'first', source: '' },
        { id: 'second', source: '' },
      ],
      sceneSequence: {
        scenes: [
          { clipId: 'first', holdMs: 10 },
          { clipId: 'second', holdMs: 10 },
        ],
      },
    }
    const code = `
var __pxlblz_show_c0_private = 0
var __pxlblz_show_c0_public = 0
var __pxlblz_show_c0_adapt_brightness = 1
var __pxlblz_show_c0_r = 0
var __pxlblz_show_c1_private = 0
var __pxlblz_show_c1_public = 0
var __pxlblz_show_c1_adapt_brightness = 1
var __pxlblz_show_c1_r = 0
`
    const members = ['first', 'second'].map((id, index) => ({
      id,
      renamedBindings: [`__pxlblz_show_c${index}_private`, `__pxlblz_show_c${index}_public`],
      renamedPatternVars: [`__pxlblz_show_c${index}_public`],
    }))

    const report = analyzeCompiledRestartGlobalLiveness(recipe, code, { members })

    expect(report).toMatchObject({
      globalsBefore: 8,
      eligibleGlobals: 4,
      excludedGlobals: 4,
      globalsAfter: 6,
      reclaimedGlobals: 2,
    })
    expect(report.owners.every((entry) => entry.exclusionReasons.includes('live-public-state'))).toBe(true)
  })
})
