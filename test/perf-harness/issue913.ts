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
  paintSites: number
}

/**
 * Wrap the artifact with a K-contiguous spatial hold: the render dispatcher
 * replays the latched RGB for non-anchor pixels, and EVERY paint call in the
 * artifact latches what it emits by routing through one helper. Total
 * coverage matters: the crossfade arm and the out-of-range fallback paint
 * through direct outer rgb(...) calls, not the shared emit wrappers, and a
 * latch that misses them replays stale pre-transition color on held pixels
 * (the first review's P1). Exact for anchor pixels; held pixels are the
 * authored approximation under review.
 */
export function applySpatialHold(source: string, k: number): HoldResult {
  const paintSites = [...source.matchAll(/\brgb\(/g)].length
  if (paintSites === 0) throw new Error('No rgb paint sites found to latch.')
  if (/\bhsv\(/.test(source)) {
    // The latch replays RGB; an hsv paint would need its own latch kind.
    throw new Error('Artifact paints via hsv(); the RGB-only hold latch would miss it.')
  }
  let code = source.replace(/\brgb\(/g, '__pxlblz_hold_emit(')
  const dispatcher = /export function render2D\(index, x, y\) \{\n/
  if (!dispatcher.test(code)) throw new Error('render2D dispatcher not found.')
  // The gate and the helper are inserted AFTER the global rewrite so their own
  // rgb(...) calls stay native.
  code = code.replace(dispatcher, `export function render2D(index, x, y) {
  if (index % ${k} != 0) { rgb(__pxlblz_hold_r, __pxlblz_hold_g, __pxlblz_hold_b); return }
`)
  code = `var __pxlblz_hold_r = 0
var __pxlblz_hold_g = 0
var __pxlblz_hold_b = 0
function __pxlblz_hold_emit(__pxlblz_hold_er, __pxlblz_hold_eg, __pxlblz_hold_eb) {
  __pxlblz_hold_r = __pxlblz_hold_er
  __pxlblz_hold_g = __pxlblz_hold_eg
  __pxlblz_hold_b = __pxlblz_hold_eb
  rgb(__pxlblz_hold_er, __pxlblz_hold_eg, __pxlblz_hold_eb)
}
${code}`
  return { code, paintSites }
}

export { WAVE2_MASTER_PIXEL_COUNT }
