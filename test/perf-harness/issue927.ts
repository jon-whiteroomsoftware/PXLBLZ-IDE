// #927 spike: 2D block hold with a row buffer, hand-built on the #926 heavy
// fixture (a single 2,000-pixel zone whose dispatcher synthesizes a 45x45
// coordinate domain from the index, so the wrapper can evaluate any pixel
// ahead of time by index alone).
//
// Anchors sit on every K-th row and K-th column (plus the last column and
// row, clamped). Entering a block-row (col 0 of an anchor row) evaluates the
// NEXT anchor row's anchors into buffer B after shifting the previous B into
// A; every pixel then paints the bilinear blend of its four surrounding
// anchors from A and B. Anchors are bit-identical to the baseline; member
// evaluations per frame are ~N / K^2 (plus the clamped edge column and row).
//
// The buffers are plain arrays here (2 x 3 channels x (ceil(W/K) + 1)
// slots); a build would declare one arena plane through the lifetime-aware
// planner (#718) instead.
import { compileShow, type GeneratedShowArtifact } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { applyLerpHold, heavyRecipe, ISSUE926_MEMBERS } from './issue926'

export const ISSUE927_PIXEL_COUNTS = [256, 500] as const
export const ISSUE927_FACTORS = [2, 4] as const
/** The heavy fixture's synthesized zone: 2,000 px -> ceil(sqrt) = 45 wide, 45 high. */
export const ISSUE927_WIDTH = 45
export const ISSUE927_HEIGHT = 45
/** The declared zone: 2,000 pixels, so the last row holds 20 of 45 columns. */
export const ISSUE927_PIXEL_COUNT = 2_000

const DISPATCHER = /export function render2D\(index, x, y\) \{\n/

const ARRAY_TAIL = `  var __pxlblz_bh_i0 = __pxlblz_bh_s0 * 3
  var __pxlblz_bh_i1 = __pxlblz_bh_s1 * 3
  var __pxlblz_bh_tr = __pxlblz_bh_A[__pxlblz_bh_i0] + (__pxlblz_bh_A[__pxlblz_bh_i1] - __pxlblz_bh_A[__pxlblz_bh_i0]) * __pxlblz_bh_fx
  var __pxlblz_bh_tg = __pxlblz_bh_A[__pxlblz_bh_i0 + 1] + (__pxlblz_bh_A[__pxlblz_bh_i1 + 1] - __pxlblz_bh_A[__pxlblz_bh_i0 + 1]) * __pxlblz_bh_fx
  var __pxlblz_bh_tb = __pxlblz_bh_A[__pxlblz_bh_i0 + 2] + (__pxlblz_bh_A[__pxlblz_bh_i1 + 2] - __pxlblz_bh_A[__pxlblz_bh_i0 + 2]) * __pxlblz_bh_fx
  var __pxlblz_bh_ur = __pxlblz_bh_B[__pxlblz_bh_i0] + (__pxlblz_bh_B[__pxlblz_bh_i1] - __pxlblz_bh_B[__pxlblz_bh_i0]) * __pxlblz_bh_fx
  var __pxlblz_bh_ug = __pxlblz_bh_B[__pxlblz_bh_i0 + 1] + (__pxlblz_bh_B[__pxlblz_bh_i1 + 1] - __pxlblz_bh_B[__pxlblz_bh_i0 + 1]) * __pxlblz_bh_fx
  var __pxlblz_bh_ub = __pxlblz_bh_B[__pxlblz_bh_i0 + 2] + (__pxlblz_bh_B[__pxlblz_bh_i1 + 2] - __pxlblz_bh_B[__pxlblz_bh_i0 + 2]) * __pxlblz_bh_fx
  rgb(
    __pxlblz_bh_tr + (__pxlblz_bh_ur - __pxlblz_bh_tr) * __pxlblz_bh_fy,
    __pxlblz_bh_tg + (__pxlblz_bh_ug - __pxlblz_bh_tg) * __pxlblz_bh_fy,
    __pxlblz_bh_tb + (__pxlblz_bh_ub - __pxlblz_bh_tb) * __pxlblz_bh_fy
  )
}
`

const SCALAR_TAIL = `  if (__pxlblz_bh_col == __pxlblz_bh_ac) {
    var __pxlblz_bh_i0 = __pxlblz_bh_s0 * 3
    var __pxlblz_bh_i1 = __pxlblz_bh_s1 * 3
    __pxlblz_bh_ca0 = __pxlblz_bh_A[__pxlblz_bh_i0]
    __pxlblz_bh_ca1 = __pxlblz_bh_A[__pxlblz_bh_i0 + 1]
    __pxlblz_bh_ca2 = __pxlblz_bh_A[__pxlblz_bh_i0 + 2]
    __pxlblz_bh_cb0 = __pxlblz_bh_A[__pxlblz_bh_i1] - __pxlblz_bh_ca0
    __pxlblz_bh_cb1 = __pxlblz_bh_A[__pxlblz_bh_i1 + 1] - __pxlblz_bh_ca1
    __pxlblz_bh_cb2 = __pxlblz_bh_A[__pxlblz_bh_i1 + 2] - __pxlblz_bh_ca2
    __pxlblz_bh_cc0 = __pxlblz_bh_B[__pxlblz_bh_i0]
    __pxlblz_bh_cc1 = __pxlblz_bh_B[__pxlblz_bh_i0 + 1]
    __pxlblz_bh_cc2 = __pxlblz_bh_B[__pxlblz_bh_i0 + 2]
    __pxlblz_bh_cd0 = __pxlblz_bh_B[__pxlblz_bh_i1] - __pxlblz_bh_cc0
    __pxlblz_bh_cd1 = __pxlblz_bh_B[__pxlblz_bh_i1 + 1] - __pxlblz_bh_cc1
    __pxlblz_bh_cd2 = __pxlblz_bh_B[__pxlblz_bh_i1 + 2] - __pxlblz_bh_cc2
  }
  var __pxlblz_bh_tr = __pxlblz_bh_ca0 + __pxlblz_bh_cb0 * __pxlblz_bh_fx
  var __pxlblz_bh_tg = __pxlblz_bh_ca1 + __pxlblz_bh_cb1 * __pxlblz_bh_fx
  var __pxlblz_bh_tb = __pxlblz_bh_ca2 + __pxlblz_bh_cb2 * __pxlblz_bh_fx
  var __pxlblz_bh_ur = __pxlblz_bh_cc0 + __pxlblz_bh_cd0 * __pxlblz_bh_fx
  var __pxlblz_bh_ug = __pxlblz_bh_cc1 + __pxlblz_bh_cd1 * __pxlblz_bh_fx
  var __pxlblz_bh_ub = __pxlblz_bh_cc2 + __pxlblz_bh_cd2 * __pxlblz_bh_fx
  rgb(
    __pxlblz_bh_tr + (__pxlblz_bh_ur - __pxlblz_bh_tr) * __pxlblz_bh_fy,
    __pxlblz_bh_tg + (__pxlblz_bh_ug - __pxlblz_bh_tg) * __pxlblz_bh_fy,
    __pxlblz_bh_tb + (__pxlblz_bh_ub - __pxlblz_bh_tb) * __pxlblz_bh_fy
  )
}
`

export function buildBaseArtifact(member: (typeof ISSUE926_MEMBERS)[number]): GeneratedShowArtifact {
  return compileShow(heavyRecipe(member), LIBRARIES, { directColorSinks: false })
}

export interface BlockHoldResult {
  code: string
  paintSites: number
  slots: number
}

export interface BlockHoldOptions {
  /** Keep the four anchors of the current cell in scalars, reloaded from the
   *  buffers only when the column crosses an anchor column (or a block-row
   *  begins), instead of six array reads per pixel. Same output. */
  scalarCache?: boolean
  /** Export a per-frame counter of member evaluations (one global write per
   *  evaluation). Test-only: the measured candidates never carry it. */
  countEvaluations?: boolean
}

export function applyBlockHold(source: string, k: number, width = ISSUE927_WIDTH, height = ISSUE927_HEIGHT, options: BlockHoldOptions = {}): BlockHoldResult {
  const scalarCache = options.scalarCache ?? false
  const countEvaluations = options.countEvaluations ?? false
  const paintSites = [...source.matchAll(/\brgb\(/g)].length
  if (paintSites === 0) throw new Error('No rgb paint sites found to latch.')
  if (/\bhsv\(/.test(source)) throw new Error('Artifact paints via hsv(); the RGB-only latch would miss it.')
  if (!DISPATCHER.test(source)) throw new Error('render2D dispatcher not found.')
  // Anchor columns 0, K, 2K, ... and the last column; slot s holds column
  // min(s * K, width - 1).
  const slots = Math.floor((width - 1) / k) + 1 + ((width - 1) % k === 0 ? 0 : 1)
  const latched = source.replace(/\brgb\(/g, '__pxlblz_bh_emit(')
  const inner = latched.replace(DISPATCHER, 'function __pxlblz_bh_inner(index, x, y) {\n')
  const helper = `var __pxlblz_bh_r = 0
var __pxlblz_bh_g = 0
var __pxlblz_bh_b = 0
function __pxlblz_bh_emit(__pxlblz_bh_er, __pxlblz_bh_eg, __pxlblz_bh_eb) {
  __pxlblz_bh_r = __pxlblz_bh_er
  __pxlblz_bh_g = __pxlblz_bh_eg
  __pxlblz_bh_b = __pxlblz_bh_eb
}
var __pxlblz_bh_A = array(${slots * 3})
var __pxlblz_bh_B = array(${slots * 3})
var __pxlblz_bh_nr = -1
var __pxlblz_bh_ca0 = 0
var __pxlblz_bh_ca1 = 0
var __pxlblz_bh_ca2 = 0
var __pxlblz_bh_cb0 = 0
var __pxlblz_bh_cb1 = 0
var __pxlblz_bh_cb2 = 0
var __pxlblz_bh_cc0 = 0
var __pxlblz_bh_cc1 = 0
var __pxlblz_bh_cc2 = 0
var __pxlblz_bh_cd0 = 0
var __pxlblz_bh_cd1 = 0
var __pxlblz_bh_cd2 = 0
${countEvaluations ? 'export var __pxlblz_bh_evals = 0\n' : ''}function __pxlblz_bh_fill(__pxlblz_bh_row) {
  var __pxlblz_bh_base = __pxlblz_bh_row * ${width}
  for (var __pxlblz_bh_s = 0; __pxlblz_bh_s < ${slots}; __pxlblz_bh_s++) {
${countEvaluations ? '    __pxlblz_bh_evals = __pxlblz_bh_evals + 1\n' : ''}    __pxlblz_bh_inner(min(__pxlblz_bh_base + min(__pxlblz_bh_s * ${k}, ${width - 1}), pixelCount - 1), 0, 0)
    __pxlblz_bh_B[__pxlblz_bh_s * 3] = __pxlblz_bh_r
    __pxlblz_bh_B[__pxlblz_bh_s * 3 + 1] = __pxlblz_bh_g
    __pxlblz_bh_B[__pxlblz_bh_s * 3 + 2] = __pxlblz_bh_b
  }
}
`
  const entry = `
export function render2D(index, x, y) {
  var __pxlblz_bh_row = floor(index / ${width})
  var __pxlblz_bh_col = index - __pxlblz_bh_row * ${width}
  var __pxlblz_bh_ar = __pxlblz_bh_row - __pxlblz_bh_row % ${k}
  if (index == 0 || (__pxlblz_bh_col == 0 && __pxlblz_bh_ar == __pxlblz_bh_row)) {
    if (index == 0) {
      __pxlblz_bh_fill(0)
    }
    __pxlblz_bh_A.mutate((v, i) => __pxlblz_bh_B[i])
    __pxlblz_bh_nr = min(__pxlblz_bh_ar + ${k}, ${height - 1})
    // The last block-row has no row below it: its anchors are the row just
    // shifted into A, so B copies A instead of re-evaluating the row.
    if (__pxlblz_bh_nr > __pxlblz_bh_ar) {
      __pxlblz_bh_fill(__pxlblz_bh_nr)
    } else {
      __pxlblz_bh_B.mutate((v, i) => __pxlblz_bh_A[i])
    }
  }
  var __pxlblz_bh_ac = __pxlblz_bh_col - __pxlblz_bh_col % ${k}
  var __pxlblz_bh_s0 = __pxlblz_bh_ac / ${k}
  // The last anchor column has no slot to its right; fx is 0 there, so the
  // clamped slot only keeps the read inside the buffers.
  var __pxlblz_bh_s1 = min(__pxlblz_bh_s0 + 1, ${slots - 1})
  var __pxlblz_bh_fx = (__pxlblz_bh_col - __pxlblz_bh_ac) * ${1 / k}
  if (__pxlblz_bh_ac + ${k} > ${width - 1}) {
    __pxlblz_bh_fx = __pxlblz_bh_ac == ${width - 1} ? 0 : (__pxlblz_bh_col - __pxlblz_bh_ac) / (${width - 1} - __pxlblz_bh_ac)
  }
  var __pxlblz_bh_fy = __pxlblz_bh_nr == __pxlblz_bh_ar ? 0 : (__pxlblz_bh_row - __pxlblz_bh_ar) / (__pxlblz_bh_nr - __pxlblz_bh_ar)
`
  const tail = scalarCache ? SCALAR_TAIL : ARRAY_TAIL
  return { code: `${helper}${inner}${entry}${tail}`, paintSites, slots }
}

export interface Issue927Candidate {
  member: (typeof ISSUE926_MEMBERS)[number]
  variant: 'baseline' | 'lerp-1d' | 'block-2d' | 'block-2d-scalar'
  k: number
  code: string
}

/** Baseline, the #926 1D lerp, and the 2D block hold per member and K. */
export function issue927Candidates(): Issue927Candidate[] {
  const out: Issue927Candidate[] = []
  for (const member of ISSUE926_MEMBERS) {
    const base = buildBaseArtifact(member).code
    out.push({ member, variant: 'baseline', k: 1, code: base })
    for (const k of ISSUE927_FACTORS) {
      out.push({ member, variant: 'lerp-1d', k, code: applyLerpHold(base, k).code })
      out.push({ member, variant: 'block-2d', k, code: applyBlockHold(base, k).code })
      out.push({ member, variant: 'block-2d-scalar', k, code: applyBlockHold(base, k, ISSUE927_WIDTH, ISSUE927_HEIGHT, { scalarCache: true }).code })
    }
  }
  return out
}
