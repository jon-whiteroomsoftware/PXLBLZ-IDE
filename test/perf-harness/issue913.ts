// Spatial sample-and-hold spike for issue #913 (epic #903).
//
// The deferred C4 idea, now that its platform precondition is proven: the
// #560 kill-test showed the firmware calls the renderer in strictly
// ascending index order with total coverage, so holding one evaluated
// sample across the next K-1 contiguous pixels is well-defined. This is an
// authored, disclosed policy — deliberate pixelation — never an inferred
// optimization; drift numbers sort the candidates and Jon's eye decides.
//
// The spike wraps the hsv-steady fixture compiled with direct color sinks
// disabled, so every pixel funnels through the shared emit; the hold then
// intercepts one function. Every K-th pixel renders normally and latches
// its RGB; the K-1 pixels after it replay the latch (mod + branch + native
// rgb from free globals, ~3-4 us, instead of the full member render).

import {
  WAVE2_MASTER_PIXEL_COUNT,
  hsvSteadyStateRecipe,
} from './issue555'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { compileShow, type GeneratedShowArtifact } from '../../src/engine/showCompiler'

export const HOLD_FACTORS = [2, 4, 8] as const

export function buildHoldBaseArtifact(): GeneratedShowArtifact {
  // Direct sinks off: steady frames route through the capture wrappers and
  // the shared `_emit` sinks the hold can intercept in one place.
  return compileShow(hsvSteadyStateRecipe(), LIBRARIES, { directColorSinks: false })
}

export interface HoldResult {
  code: string
  emitFunctions: number
}

/**
 * Wrap the artifact with a K-contiguous spatial hold: the render dispatcher
 * replays the latched RGB for non-anchor pixels, and every emit function
 * latches what it paints. Exact for anchor pixels; held pixels are the
 * authored approximation under review.
 */
export function applySpatialHold(source: string, k: number): HoldResult {
  let emitFunctions = 0
  // Latch inside every `_emit()` body: `rgb(a, b, c)` becomes a latch of the
  // same three reads plus the paint.
  let code = source.replace(
    /function (__pxlblz_\w+)\(\) \{ rgb\((__pxlblz_\w+), (__pxlblz_\w+), (__pxlblz_\w+)\) \}/g,
    (_match, name, r, g, b) => {
      emitFunctions += 1
      return `function ${name}() { __pxlblz_hold_r = ${r}\n__pxlblz_hold_g = ${g}\n__pxlblz_hold_b = ${b}\nrgb(${r}, ${g}, ${b}) }`
    },
  )
  if (emitFunctions === 0) throw new Error('No emit sinks found to latch; compile with directColorSinks: false.')
  const dispatcher = /export function render2D\(index, x, y\) \{\n/
  if (!dispatcher.test(code)) throw new Error('render2D dispatcher not found.')
  code = code.replace(dispatcher, `export function render2D(index, x, y) {
  if (index % ${k} != 0) { rgb(__pxlblz_hold_r, __pxlblz_hold_g, __pxlblz_hold_b); return }
`)
  code = `var __pxlblz_hold_r = 0
var __pxlblz_hold_g = 0
var __pxlblz_hold_b = 0
${code}`
  return { code, emitFunctions }
}

export { WAVE2_MASTER_PIXEL_COUNT }
