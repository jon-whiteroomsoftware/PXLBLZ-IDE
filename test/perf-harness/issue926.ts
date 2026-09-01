// #926 spike: hold, evolved. Variants of the approved spatial sample-and-hold
// (#913) on heavy members, built the same way — a textual wrap of a compiled
// single-zone Show with direct sinks off, so every paint funnels through one
// latch — measured paired on the pb32 at 256 px and rendered for Jon's eye.
//
//   hold     every K-th pixel renders; the K-1 after it replay the latch
//            (the #913 transform, re-measured on heavy members)
//   parity   the anchor phase shifts by one each frame: (index + frame) % K
//            (free temporal dither of the pixelation)
//   lerp     anchors look one stride ahead — at anchor c the member is
//            evaluated at pixel c + K — and the K pixels from c blend
//            linearly between the two anchors (same evaluation count as
//            hold, plus one per frame; ~3 mul + 3 add per held pixel)
//   refresh  hold x2 composed with four-slice Rolling Refresh
//
// Lookahead needs synthesized coordinates: the single-zone fixture derives
// zone x/y from the zone-local index, so calling the dispatcher with
// index + K evaluates the member one stride ahead. That is the Installation
// / synthesized-coordinate case; a Portable Show fed map coordinates by the
// firmware cannot look ahead, which is a stated limit of this variant. The
// lookahead clamps to pixelCount - 1 so the final anchor interpolates toward
// the last physical pixel, matching the shipped pass (#937).
//
// Fixture geometry: the recipe declares a 2,000-pixel zone, so the compiler
// synthesizes a 45x45 coordinate domain and the 256 rendered indices cover
// its first rows as a strip. FPS is unaffected (per-pixel member cost is
// coordinate-independent); emulator drift figures measured on this fixture
// describe that strip, not a 16x16 surface.
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'

export const ISSUE926_PIXEL_COUNT = 256
export const ISSUE926_MASTER_PIXEL_COUNT = 2_000
export const ISSUE926_MEMBERS = ['ZippyZaps', 'Caustics'] as const
export const ISSUE926_FACTORS = [2, 4] as const
export type Issue926Variant = 'hold' | 'parity' | 'lerp' | 'refresh'
export const ISSUE926_VARIANTS: readonly Issue926Variant[] = ['hold', 'parity', 'lerp', 'refresh']

const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: ISSUE926_MASTER_PIXEL_COUNT - 1 }] }

export function heavyRecipe(member: (typeof ISSUE926_MEMBERS)[number], rollingRefresh = false): ShowRecipe {
  return {
    masterPixelCount: ISSUE926_MASTER_PIXEL_COUNT,
    clips: [
      { id: 'heavy', source: DEMOS[member], ...(rollingRefresh ? { evaluationPolicy: 'rolling-refresh' as const } : {}) },
      { id: 'cheap', source: DEMOS.EasedSweep },
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'Single stage zone', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        { holdMs: 30_000, placements: [{ placementId: 'heavy', zoneName: 'stage', clipId: 'heavy' }], transitionOut: { kind: 'crossfade', durationMs: 2_000 } },
        { holdMs: 20_000, placements: [{ placementId: 'cheap', zoneName: 'stage', clipId: 'cheap' }] },
      ],
    },
    loopDurationMs: 52_000,
  }
}

export function buildBaseArtifact(member: (typeof ISSUE926_MEMBERS)[number], rollingRefresh = false): GeneratedShowArtifact {
  return compileShow(heavyRecipe(member, rollingRefresh), LIBRARIES, { directColorSinks: false })
}

export interface WrappedArtifact {
  code: string
  paintSites: number
}

const DISPATCHER = /export function render2D\(index, x, y\) \{\n/

function latchAllPaints(source: string): { code: string; paintSites: number } {
  const paintSites = [...source.matchAll(/\brgb\(/g)].length
  if (paintSites === 0) throw new Error('No rgb paint sites found to latch.')
  if (/\bhsv\(/.test(source)) throw new Error('Artifact paints via hsv(); the RGB-only latch would miss it.')
  return { code: source.replace(/\brgb\(/g, '__pxlblz_hold_emit('), paintSites }
}

const LATCH_HELPER = `var __pxlblz_hold_r = 0
var __pxlblz_hold_g = 0
var __pxlblz_hold_b = 0
function __pxlblz_hold_emit(__pxlblz_hold_er, __pxlblz_hold_eg, __pxlblz_hold_eb) {
  __pxlblz_hold_r = __pxlblz_hold_er
  __pxlblz_hold_g = __pxlblz_hold_eg
  __pxlblz_hold_b = __pxlblz_hold_eb
  rgb(__pxlblz_hold_er, __pxlblz_hold_eg, __pxlblz_hold_eb)
}
`

/** #913's transform: gate non-anchors to a latch replay. */
export function applyHold(source: string, k: number): WrappedArtifact {
  const latched = latchAllPaints(source)
  if (!DISPATCHER.test(latched.code)) throw new Error('render2D dispatcher not found.')
  const code = latched.code.replace(DISPATCHER, `export function render2D(index, x, y) {
  if (index % ${k} != 0) { rgb(__pxlblz_hold_r, __pxlblz_hold_g, __pxlblz_hold_b); return }
`)
  return { code: `${LATCH_HELPER}${code}`, paintSites: latched.paintSites }
}

/** Anchor phase advances one pixel per frame. */
export function applyParityHold(source: string, k: number): WrappedArtifact {
  const latched = latchAllPaints(source)
  if (!DISPATCHER.test(latched.code)) throw new Error('render2D dispatcher not found.')
  let code = latched.code.replace(DISPATCHER, `export function render2D(index, x, y) {
  if ((index + __pxlblz_hold_phase) % ${k} != 0) { rgb(__pxlblz_hold_r, __pxlblz_hold_g, __pxlblz_hold_b); return }
`)
  code = code.replace(/export function beforeRender\(delta\) \{\n/, `export function beforeRender(delta) {
  __pxlblz_hold_phase = (__pxlblz_hold_phase + 1) % ${k}
`)
  return { code: `${LATCH_HELPER}var __pxlblz_hold_phase = 0\n${code}`, paintSites: latched.paintSites }
}

/**
 * Hold-and-lerp. The dispatcher is demoted to an inner function that paints
 * through the latch; the new entry evaluates the inner one stride ahead at
 * each anchor and blends between the previous and the next anchor sample.
 * The latch only ever holds the lookahead sample; the "current" anchor
 * sample is the previous lookahead, copied at the anchor.
 */
export function applyLerpHold(source: string, k: number): WrappedArtifact {
  const latched = latchAllPaints(source)
  if (!DISPATCHER.test(latched.code)) throw new Error('render2D dispatcher not found.')
  // The inner dispatcher must not paint natively; the latch helper paints
  // nothing in this variant (its rgb is replaced by a no-op latch).
  const inner = latched.code.replace(DISPATCHER, 'function __pxlblz_hold_inner(index, x, y) {\n')
  const helper = `var __pxlblz_hold_r = 0
var __pxlblz_hold_g = 0
var __pxlblz_hold_b = 0
var __pxlblz_hold_cr = 0
var __pxlblz_hold_cg = 0
var __pxlblz_hold_cb = 0
function __pxlblz_hold_emit(__pxlblz_hold_er, __pxlblz_hold_eg, __pxlblz_hold_eb) {
  __pxlblz_hold_r = __pxlblz_hold_er
  __pxlblz_hold_g = __pxlblz_hold_eg
  __pxlblz_hold_b = __pxlblz_hold_eb
}
`
  const entry = `
export function render2D(index, x, y) {
  var __pxlblz_hold_t = index % ${k}
  if (__pxlblz_hold_t == 0) {
    if (index == 0) {
      __pxlblz_hold_inner(0, x, y)
    }
    __pxlblz_hold_cr = __pxlblz_hold_r
    __pxlblz_hold_cg = __pxlblz_hold_g
    __pxlblz_hold_cb = __pxlblz_hold_b
    __pxlblz_hold_inner(min(index + ${k}, pixelCount - 1), x, y)
  }
  __pxlblz_hold_t = __pxlblz_hold_t / ${k}
  rgb(
    __pxlblz_hold_cr + (__pxlblz_hold_r - __pxlblz_hold_cr) * __pxlblz_hold_t,
    __pxlblz_hold_cg + (__pxlblz_hold_g - __pxlblz_hold_cg) * __pxlblz_hold_t,
    __pxlblz_hold_cb + (__pxlblz_hold_b - __pxlblz_hold_cb) * __pxlblz_hold_t
  )
}
`
  return { code: `${helper}${inner}${entry}`, paintSites: latched.paintSites }
}

export interface Issue926Candidate {
  member: (typeof ISSUE926_MEMBERS)[number]
  variant: 'baseline' | Issue926Variant
  k: number
  code: string
}

/** Every measured candidate: baseline per member, then each variant per K
 *  (refresh is hold x2 over a Rolling Refresh compile, one K). */
export function issue926Candidates(): Issue926Candidate[] {
  const out: Issue926Candidate[] = []
  for (const member of ISSUE926_MEMBERS) {
    const base = buildBaseArtifact(member).code
    out.push({ member, variant: 'baseline', k: 1, code: base })
    for (const k of ISSUE926_FACTORS) {
      out.push({ member, variant: 'hold', k, code: applyHold(base, k).code })
      out.push({ member, variant: 'parity', k, code: applyParityHold(base, k).code })
      out.push({ member, variant: 'lerp', k, code: applyLerpHold(base, k).code })
    }
    const refreshBase = buildBaseArtifact(member, true).code
    out.push({ member, variant: 'refresh', k: 1, code: refreshBase })
    out.push({ member, variant: 'refresh', k: 2, code: applyHold(refreshBase, 2).code })
  }
  return out
}
