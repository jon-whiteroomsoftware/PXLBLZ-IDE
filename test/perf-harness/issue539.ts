// Production Vignette scalar-field qualification for issue #539.
// Compares the normal compiler selection with its exact inline counterfactual.

import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler'

export const ISSUE539_PIXEL_COUNTS = [256, 1_000, 2_000] as const

const source = `
var t = 0
export function beforeRender(delta) { t = t + delta / 1000 }
export function render2D(index, x, y) {
  var pulse = wave(t * 0.04 + x * 2)
  rgb(
    pulse * (1 - y),
    0.1 + 0.5 * wave(t * 0.03 - y * 3),
    0.15 + 0.6 * wave(x * 4 + y * 2 - t * 0.02)
  )
}
`

export function buildIssue539Artifacts(pixelCount: number) {
  const recipe: ShowRecipe = {
    masterPixelCount: pixelCount,
    clips: [{
      id: 'vignette-source',
      source,
      effects: [{
        id: 'edge',
        kind: 'vignette',
        amount: 1,
        radius: 0.35,
        softness: 0.28,
        centerX: 0.5,
        centerY: 0.5,
        aspect: 1.15,
      }],
    }],
  }
  return {
    inline: compileShow(recipe, {}, { scalarFieldCaching: false }),
    cached: compileShow(recipe, {}),
  }
}

export const report = ISSUE539_PIXEL_COUNTS.map((pixelCount) => {
  const { inline, cached } = buildIssue539Artifacts(pixelCount)
  return {
    pixelCount,
    inline: {
      artifactBytes: inline.summary.artifactBytes,
      expandedArtifactBytes: inline.summary.expandedArtifactBytes,
      resources: inline.summary.resources,
      scalarFields: inline.summary.specializations.scalarFields,
    },
    cached: {
      artifactBytes: cached.summary.artifactBytes,
      expandedArtifactBytes: cached.summary.expandedArtifactBytes,
      resources: cached.summary.resources,
      scalarFields: cached.summary.specializations.scalarFields,
    },
  }
})

if (process.env.ISSUE539_REPORT || !process.env.VITEST) console.log(JSON.stringify(report, null, 2))
