// #937 paired fixtures: the compile option off (direct sinks off, the
// latch's own baseline) versus stride 2 and 4, single heavy member alone in
// a full-Stage zone, plus the light hsv-steady fixture.
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { hsvSteadyStateRecipe } from './issue555'

export const ISSUE937_PIXEL_COUNT = 256

function heavy(member: string): ShowRecipe {
  const stage = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 1999 }] }
  return {
    masterPixelCount: 2_000,
    clips: [{ id: 'heavy', source: DEMOS[member] }, { id: 'cheap', source: DEMOS.EasedSweep }],
    zones: [stage],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stage] }],
    routedSceneSequence: {
      scenes: [
        { holdMs: 30_000, placements: [{ placementId: 'heavy', zoneName: 'stage', clipId: 'heavy' }], transitionOut: { kind: 'crossfade', durationMs: 2_000 } },
        { holdMs: 20_000, placements: [{ placementId: 'cheap', zoneName: 'stage', clipId: 'cheap' }] },
      ],
    },
    loopDurationMs: 52_000,
  }
}

export interface Issue937Candidate { id: string; artifact: GeneratedShowArtifact; sampleMs: number }

export function issue937Candidates(): Issue937Candidate[] {
  const out: Issue937Candidate[] = []
  for (const [name, recipe, sampleMs] of [
    ['ZippyZaps', heavy('ZippyZaps'), 6_000],
    ['Caustics', heavy('Caustics'), 6_000],
    ['hsv-steady-light', hsvSteadyStateRecipe(), 4_000],
  ] as const) {
    out.push({ id: `${name}:off`, artifact: compileShow(recipe, LIBRARIES, { directColorSinks: false }), sampleMs })
    for (const stride of [2, 4] as const) {
      const artifact = compileShow(recipe, LIBRARIES, { spatialHold: { stride, mode: 'lerp' } })
      if (!artifact.summary.specializations.spatialHold.selected) throw new Error(`${name}: hold declined (${artifact.summary.specializations.spatialHold.reason})`)
      out.push({ id: `${name}:lerp-x${stride}`, artifact, sampleMs })
    }
  }
  return out
}
