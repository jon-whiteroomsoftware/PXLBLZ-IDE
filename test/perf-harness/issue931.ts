// #931 paired fixtures: member loop rewrites on versus off, one heavy
// loop-bearing member alone in a full-Stage zone (first Scene, 20 s hold),
// compiled at master 256 px and measured at 256 px.
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'

export const ISSUE931_PIXEL_COUNT = 256
export const ISSUE931_MEMBERS = [
  'IridescentFibers',
  'NeonSquircles',
  'PulseLoom',
  'ShaderShowcase',
  // Slider-driven bounds: idiom rewrite only. PhantomStar (~0.24 FPS) is
  // too slow to resolve a ~1% delta in a bounded window; ZippyZaps stands in.
  'Kishimisu',
  'ZippyZaps',
] as const

export interface Issue931Fixture {
  id: string
  off: GeneratedShowArtifact
  on: GeneratedShowArtifact
  byteIdentical: boolean
  sampleMs: number
}

export function singleMemberRecipe(pattern: string): ShowRecipe {
  const stage = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: ISSUE931_PIXEL_COUNT - 1 }] }
  return {
    masterPixelCount: ISSUE931_PIXEL_COUNT,
    clips: [{ id: 'member', source: DEMOS[pattern] }, { id: 'cheap', source: DEMOS.EasedSweep }],
    zones: [stage],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stage] }],
    routedSceneSequence: {
      scenes: [
        { holdMs: 20_000, placements: [{ placementId: 'p', zoneName: 'stage', clipId: 'member' }] },
        { holdMs: 20_000, placements: [{ placementId: 'q', zoneName: 'stage', clipId: 'cheap' }] },
      ],
    },
    loopDurationMs: 40_000,
  }
}

let cached: Issue931Fixture[] | null = null
export function issue931Fixtures(): Issue931Fixture[] {
  if (cached) return cached
  cached = ISSUE931_MEMBERS.map((pattern) => {
    const recipe = singleMemberRecipe(pattern)
    const off = compileShow(recipe, LIBRARIES, { loopUnrolling: false })
    const on = compileShow(recipe, LIBRARIES, { loopUnrolling: true })
    return {
      id: pattern,
      off,
      on,
      byteIdentical: off.code === on.code,
      sampleMs: pattern === 'ZippyZaps' ? 8_000 : 6_000,
    }
  })
  return cached
}
