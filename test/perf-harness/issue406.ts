// Issue #406 coordinate-remapping candidate comparison.
//
//   npm run issue406

import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler'
import { benchOne } from './benchCore'

const SIDE = 32

const SOURCES = {
  baseline: `
var t = 0
export function beforeRender(delta) { t = t + delta * 0.001 }
export function render2D(index, x, y) { rgb(triangle(x * 3 + t), triangle(y * 4 - t), 0.2) }
`,
  tiling: `
var t = 0
var repeatScale = 2.5
export function beforeRender(delta) { t = t + delta * 0.001 }
export function render2D(index, x, y) {
  var sampleX = frac(x * repeatScale)
  var sampleY = frac(y * repeatScale)
  rgb(triangle(sampleX * 3 + t), triangle(sampleY * 4 - t), 0.2)
}
`,
  rotation: `
var t = 0
var rotationTurns = 0.13
var rotationSin = 0
var rotationCos = 1
export function beforeRender(delta) {
  t = t + delta * 0.001
  rotationSin = sin(rotationTurns * PI2)
  rotationCos = cos(rotationTurns * PI2)
}
export function render2D(index, x, y) {
  var centeredX = x - 0.5
  var centeredY = y - 0.5
  var sampleX = frac(0.5 + centeredX * rotationCos - centeredY * rotationSin + 1)
  var sampleY = frac(0.5 + centeredX * rotationSin + centeredY * rotationCos + 1)
  rgb(triangle(sampleX * 3 + t), triangle(sampleY * 4 - t), 0.2)
}
`,
} as const

function recipe(source: string): ShowRecipe {
  return {
    clips: [{ id: 'candidate', source }],
  }
}

function measure(name: keyof typeof SOURCES) {
  const artifact = compileShow(recipe(SOURCES[name]), {})
  const options = { frames: 64, warmup: 16, frameDeltaMs: 16.667, grid: { rows: SIDE, cols: SIDE } }
  return {
    name,
    sourceBytes: artifact.summary.artifactBytes,
    rendererDelta: 0,
    scalarGlobals: name === 'baseline' ? 0 : name === 'tiling' ? 1 : 3,
    perFrameTrig: name === 'rotation' ? 2 : 0,
    perPixelOperations: name === 'baseline'
      ? 'none'
      : name === 'tiling'
        ? '2 multiply + 2 frac'
        : '4 multiply + 6 add/subtract + 2 frac',
    fastMs: benchOne(artifact.code, {}, 'fast', options).meanFrameMs,
    preciseMs: benchOne(artifact.code, {}, 'precise', options).meanFrameMs,
  }
}

console.log(JSON.stringify([
  measure('baseline'),
  measure('tiling'),
  measure('rotation'),
], null, 2))
