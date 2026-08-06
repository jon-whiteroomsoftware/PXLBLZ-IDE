// #717 slice 3: routed transition helpers intern by body content. Scenes
// cycling the same transition between the same (interned) endpoints share
// one helper kernel; the per-segment dispatch branches keep their scene
// identity and call the shared kernel.
import { describe, expect, it } from 'vitest'
import { compileShow, type ShowRecipe } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'

const SOURCES: Record<string, string> = {
  red: 'export function render2D(index, x, y) { rgb(1, 0, 0) }',
  green: 'export function render2D(index, x, y) { rgb(0, 1, 0) }',
  blue: 'export function render2D(index, x, y) { rgb(0, 0, 1) }',
}

function sequenceRecipe(clipOrder: string[]): ShowRecipe {
  return {
    clips: [...new Set(clipOrder)].map((id) => ({ id, source: SOURCES[id] })),
    routingLayouts: [{
      id: 'normalized',
      name: 'Normalized',
      zones: [],
      logical: { kind: 'single', zoneNames: ['main'] },
    }],
    routedSceneSequence: {
      scenes: clipOrder.map((clipId, sceneIndex) => ({
        // Irregular holds keep the sequence off the regular-cadence score
        // path, which shares its transition kernel already.
        holdMs: 1_000 + sceneIndex * 300,
        placements: [{ zoneName: 'main', clipId }],
        ...(sceneIndex < clipOrder.length - 1
          ? { transitionOut: { kind: 'crossfade' as const, durationMs: 500, crossfadePolicy: 'live-live' as const } }
          : {}),
      })),
    },
    loopDurationMs: clipOrder.length * 2_000,
  }
}

function helperCount(code: string): number {
  return (code.match(/function __pxlblz_show_routed_transition_k\d+/g) ?? []).length
}

function branchCount(code: string): number {
  return (code.match(/__pxlblz_show_transition == \d+/g) ?? []).length
}

describe('routed transition helper interning (#717)', () => {
  it('shares one helper kernel across repeated identical transitions', () => {
    // red->blue, blue->red, red->blue: the first and third transition share
    // one kernel, the middle one is its reverse.
    const artifact = compileShow(sequenceRecipe(['red', 'blue', 'red', 'blue']), {})
    expect(helperCount(artifact.expandedCode)).toBe(2)
    expect(branchCount(artifact.expandedCode)).toBeGreaterThanOrEqual(3)
  })

  it('keeps transitions between different endpoints in different kernels', () => {
    const artifact = compileShow(sequenceRecipe(['red', 'blue', 'green']), {})
    expect(helperCount(artifact.expandedCode)).toBe(2)
  })

  it('renders the interned artifact deterministically through fast replay', () => {
    const artifact = compileShow(sequenceRecipe(['red', 'blue', 'red', 'blue']), {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [
        { sample: [0, 0], pos: [0, 0] },
        { sample: [1, 1], pos: [1, 1] },
      ],
      randomSeed: 1,
    })
    const frame = runtime.renderCurrentFrame()
    expect(frame.pixels).toHaveLength(2)
    for (const pixel of frame.pixels) {
      expect(pixel.every((channel: number) => Number.isFinite(channel))).toBe(true)
    }
  })
})

describe('routed steady-state scene branch grouping (#717)', () => {
  it('emits one render branch per unique scene body with OR-grouped conditions', () => {
    const artifact = compileShow(sequenceRecipe(['red', 'blue', 'red', 'blue', 'red', 'blue']), {})
    expect(artifact.expandedCode).toMatch(/__pxlblz_show_scene == 0 \|\| __pxlblz_show_scene == 2/)
    const sceneEqualityBranches = (artifact.expandedCode.match(/if \((?:__pxlblz_show_scene == \d+(?: \|\| )?)+\) \{/g) ?? [])
    expect(sceneEqualityBranches.length).toBeLessThanOrEqual(4)
  })

  it('keeps the marginal cost of a replayed scene under 250 bytes', () => {
    // Wrapper interning + kernel interning + branch grouping + the table
    // scheduler leave a replayed scene costing schedule-table rows plus
    // dispatch conditions: measured 169.9 B/scene on this fixture
    // (1,736 B/scene before the #717 slices).
    const bytesAt = (sceneCount: number) => {
      const order = Array.from({ length: sceneCount }, (_, i) => (i % 2 === 0 ? 'red' : 'blue'))
      return compileShow(sequenceRecipe(order), {}).summary.artifactBytes
    }
    const marginalBytes = (bytesAt(40) - bytesAt(10)) / 30
    expect(marginalBytes).toBeLessThan(250)
  })
})

describe('scheduler hard-resource fallback (#717 review P2)', () => {
  it('keeps a globals-heavy repetitive Show unblocked by falling back to the unrolled chain', () => {
    // Two 106-global Patterns across 40 alternating scenes: the byte-smaller
    // table scheduler would add six globals and cross the 256 limit; the
    // fallback keeps the unrolled chain and the Show compiles clean.
    const globalsHeavy = (color: string) => `${Array.from({ length: 106 }, (_, i) => `var g${i} = ${i / 200}`).join('\n')}
export function render2D(index, x, y) { rgb(${color}, g7) }`
    const artifact = compileShow({
      clips: [
        { id: 'red', source: globalsHeavy('1, 0') },
        { id: 'blue', source: globalsHeavy('0, 1') },
      ],
      routingLayouts: [{
        id: 'normalized',
        name: 'Normalized',
        zones: [],
        logical: { kind: 'single', zoneNames: ['main'] },
      }],
      routedSceneSequence: {
        scenes: Array.from({ length: 40 }, (_, i) => ({
          holdMs: 1_000 + (i % 7) * 137,
          placements: [
            { zoneName: 'main', clipId: i % 2 === 0 ? 'red' : 'blue' },
            { zoneName: 'main', clipId: i % 2 === 0 ? 'blue' : 'red', stackOrder: 1 },
          ],
          ...(i < 39 ? { transitionOut: { kind: 'crossfade' as const, durationMs: 400, crossfadePolicy: 'live-live' as const } } : {}),
        })),
      },
      loopDurationMs: 80_000,
    }, {})
    expect(artifact.summary.resources.blockers).toEqual([])
    expect(artifact.code).not.toContain('__pxlblz_show_sched_end')
  })
})
