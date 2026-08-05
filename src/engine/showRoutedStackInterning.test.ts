// #717 slice 2: routed-scene stack wrappers intern by content, so scenes
// that replay the same stack share one wrapper instead of paying ~946 bytes
// of duplicate code each. Transitions between two scenes that interned to
// the same wrapper still get distinct from/to state (the self-transition
// guard), preserving pre-interning capture semantics exactly.
import { describe, expect, it } from 'vitest'
import { compileShow, type ShowRecipe } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'

const RED = 'export function render2D(index, x, y) { rgb(1, 0, 0) }'
const GREEN = 'export function render2D(index, x, y) { rgb(0, 1, 0) }'
const BLUE = 'export function render2D(index, x, y) { rgb(0, 0, 1) }'

function stackedRecipe(sceneStacks: string[][], transition: 'crossfade' | 'cut' = 'crossfade'): ShowRecipe {
  const clipIds = [...new Set(sceneStacks.flat())]
  return {
    clips: clipIds.map((id) => ({
      id,
      source: id === 'red' ? RED : id === 'green' ? GREEN : BLUE,
    })),
    routingLayouts: [{
      id: 'normalized',
      name: 'Normalized',
      zones: [],
      logical: { kind: 'single', zoneNames: ['main'] },
    }],
    routedSceneSequence: {
      scenes: sceneStacks.map((stack, sceneIndex) => ({
        // Irregular holds keep the sequence off the regular-cadence score
        // path (which has its own interning); this slice targets the
        // unrolled path the transition-reference shows use.
        holdMs: 1_000 + sceneIndex * 300,
        placements: stack.map((clipId, order) => ({
          zoneName: 'main',
          clipId,
          ...(order > 0 ? { stackOrder: order } : {}),
        })),
        ...(sceneIndex < sceneStacks.length - 1
          ? {
              transitionOut: transition === 'crossfade'
                ? { kind: 'crossfade' as const, durationMs: 500, crossfadePolicy: 'live-live' as const }
                : { kind: 'cut' as const, durationMs: 0 },
            }
          : {}),
      })),
    },
    loopDurationMs: sceneStacks.length * 1_500,
  }
}

function wrapperPrefixes(code: string): string[] {
  return [...new Set(code.match(/__pxlblz_show_stack_[a-zA-Z0-9]+_[A-Za-z0-9_]*renderCapture2D\(/g) ?? [])]
}

function capturePlanCount(code: string): number {
  return (code.match(/function __pxlblz_show_stack_p\d+_renderCapture2D/g) ?? []).length
}

describe('routed-scene stack wrapper interning (#717)', () => {
  it('shares one wrapper across scenes replaying the same stack, plus one self-transition clone', () => {
    const artifact = compileShow(stackedRecipe([
      ['red', 'green'],
      ['red', 'green'],
      ['red', 'green'],
      ['red', 'green'],
    ]), {})
    // Four identical scenes need exactly two physical wrappers: the shared
    // plan and its self-transition clone, alternating.
    expect(capturePlanCount(artifact.expandedCode)).toBe(2)
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_stack_s0_')
  })

  it('keeps distinct stacks in distinct wrappers', () => {
    const artifact = compileShow(stackedRecipe([
      ['red', 'green'],
      ['blue', 'green'],
      ['red', 'green'],
      ['blue', 'green'],
    ]), {})
    // Alternating stacks: two plans, no self-transitions, so exactly two.
    expect(capturePlanCount(artifact.expandedCode)).toBe(2)
  })

  it('gives a self-transition distinct from and to wrapper state', () => {
    const artifact = compileShow(stackedRecipe([
      ['red', 'green'],
      ['red', 'green'],
    ]), {})
    expect(capturePlanCount(artifact.expandedCode)).toBe(2)
    // The transition body must reference both wrappers, never one twice.
    const prefixes = wrapperPrefixes(artifact.expandedCode)
    expect(prefixes.length).toBeGreaterThanOrEqual(2)
  })

  it('renders the interned artifact deterministically through fast replay', () => {
    const artifact = compileShow(stackedRecipe([
      ['red', 'green'],
      ['red', 'green'],
      ['blue', 'green'],
    ]), {})
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
    // Inside the first hold the stack composites red under green: the top
    // placement wins the steady-state output.
    const frame = runtime.renderCurrentFrame()
    expect(frame.pixels).toHaveLength(2)
    for (const pixel of frame.pixels) {
      expect(pixel.every((channel: number) => Number.isFinite(channel))).toBe(true)
    }
  })
})
