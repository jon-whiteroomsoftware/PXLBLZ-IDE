// #936 spike: boundary-latched decode on an index-routed (Installation)
// Show, hand-built from the compiled Redline artifact by string surgery so
// the measurement precedes any emitter change.
//
// The production dispatcher re-derives, per pixel: the zone (a literal
// range chain), the zone-local index and dimensions, the zone's local
// column and row (`%`, `floor`, two divisions), the placement id (a table
// read), the placement-change flag, and then walks an 18-arm chain whose
// arms differ only in the coefficients they assign when the placement
// changed. With ascending render order (proven on firmware, #560, and in
// the preview) all of that is constant between zone boundaries, so the
// latched form recomputes it only when `index` reaches the next boundary
// (or is 0, the frame start), keeps the zone's column/row as counters
// (`col + 1`, wrap at the zone width - the same integers `b % A` and
// `floor(b / A)` produce, so the divisions that follow see identical
// operands and the checksum holds), and dispatches on the latched
// placement with the arms grouped by identical per-pixel body.
import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

export const ISSUE936_PIXEL_COUNTS = [256, 500] as const

export interface Issue936Candidates {
  exact: string
  /** Latched decode and placement, original column/row formulas. */
  latched: string
  /** Latched decode and placement plus counter-based column/row. */
  latchedCounters: string
  /** Latched decode and placement, but the original per-arm chain kept per
   *  pixel (arms grouped only by the latch, not by identical body), to
   *  attribute the win between the decode latch and the arm collapse. */
  latchedChain: string
  arms: number
  bodyGroups: number
}

interface Arm { id: number; coefficients: string; body: string }

export function issue936Candidates(): Issue936Candidates {
  // The spike's string surgery expects the per-pixel dispatcher, so the
  // exact artifact is compiled with the shipped latch off; the build's own
  // emission is qualified in showCompilerBoundaryLatch.test.ts.
  const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')
  if (!item) throw new Error('Redline stock Show missing')
  const compiled = compileShowForArtifact(item.show, [], installationPhysicalZones(item.show), LIBRARIES, { stageDimension: 2, boundaryLatchedDecode: false })
  if (!compiled.artifact) throw new Error(`Redline: ${compiled.error}`)
  const exact = compiled.artifact.code
  return { exact, ...latchRedline(exact) }
}

const ARM = /(?:^|\} else )if \(__pxlblz_d == (\d+)\) \{\n {2}if \(__pxlblz_i\) \{\n((?: {4}.*\n)*?) {2}\}\n((?: {2}.*\n)*?) {2}return\n/gm

export function latchRedline(code: string): Omit<Issue936Candidates, 'exact'> {
  const start = code.indexOf('export function render2D(index, x, y) {')
  if (start < 0) throw new Error('render2D not found')
  const head = code.slice(0, start)
  const render = code.slice(start)
  const arms: Arm[] = []
  for (const match of render.matchAll(ARM)) arms.push({ id: Number(match[1]), coefficients: match[2], body: match[3] })
  if (arms.length === 0) throw new Error('no placement arms matched')
  const zoneChainStart = render.indexOf('if (index <= ')
  const zoneChainEnd = render.indexOf('var __pxlblz_t = ')
  if (zoneChainStart < 0 || zoneChainEnd < 0) throw new Error('zone chain not found')
  // The zone chain assigns `__pxlblz_b = index - BASE`; the latched form
  // records BASE and the boundary index instead (`index <= END` gives END + 1).
  const zoneChain = render.slice(zoneChainStart, zoneChainEnd)
    .replace(/__pxlblz_b = index - (\d+)\n/g, '__pxlblz_lat_base = $1\n')
    .replace(/if \(index <= (\d+)\) \{\n/g, (_, end) => `if (index <= ${end}) {\n  __pxlblz_lat_next = ${Number(end) + 1}\n`)
    .replace(/else \{\n/, 'else {\n  __pxlblz_lat_next = -1\n')
  const groups = new Map<string, number[]>()
  for (const arm of arms) groups.set(arm.body, [...(groups.get(arm.body) ?? []), arm.id])
  const ordered = [...groups.entries()].sort((a, b) => a[1].length - b[1].length)
  const coefficientChain = arms.map((arm, i) => `${i === 0 ? '' : ' else '}if (__pxlblz_d == ${arm.id}) {\n${arm.coefficients}}`).join('')
  const dispatch = ordered.map(([body, ids], i) => {
    const last = i === ordered.length - 1
    const test = ids.map((id) => `__pxlblz_lat_d == ${id}`).join(' || ')
    return last ? ` else {\n${body}}` : `${i === 0 ? '' : ' else '}if (${test}) {\n${body}}`
  }).join('')
  const globals = `var __pxlblz_lat_next = 0
var __pxlblz_lat_base = 0
var __pxlblz_lat_col = 0
var __pxlblz_lat_row = 0
var __pxlblz_lat_d = -1
var __pxlblz_C = -1
var __pxlblz_c = 1
var __pxlblz_A = 1
var __pxlblz_D = 1
`
  const boundary = `  if (index == 0 || index == __pxlblz_lat_next) {
  __pxlblz_C = -1
  __pxlblz_c = 1
  __pxlblz_A = 1
  __pxlblz_D = 1
  __pxlblz_lat_next = -1
${zoneChain}  __pxlblz_lat_col = -1
  __pxlblz_lat_row = 0
  var __pxlblz_d = -1
  if (__pxlblz_C >= 0) __pxlblz_d = __pxlblz_ax[__pxlblz_z * 5 + __pxlblz_C] - 1
  __pxlblz_lat_d = __pxlblz_d
  var __pxlblz_aj = __pxlblz_d * 5 + __pxlblz_C
  var __pxlblz_i = __pxlblz_d >= 0 && __pxlblz_aj != __pxlblz_ai
  if (__pxlblz_i) {
    __pxlblz_ai = __pxlblz_aj
    ${coefficientChain.split('\n').join('\n    ')}
  }
  }
`
  const perPixelOriginal = `  var __pxlblz_b = index - __pxlblz_lat_base
  var __pxlblz_t = __pxlblz_A == 1 ? 0.5 : (__pxlblz_b % __pxlblz_A) / (__pxlblz_A - 1)
  var __pxlblz_u = __pxlblz_D == 1 ? 0.5 : floor(__pxlblz_b / __pxlblz_A) / (__pxlblz_D - 1)
`
  const perPixelCounters = `  var __pxlblz_b = index - __pxlblz_lat_base
  __pxlblz_lat_col = __pxlblz_lat_col + 1
  if (__pxlblz_lat_col == __pxlblz_A) {
    __pxlblz_lat_col = 0
    __pxlblz_lat_row = __pxlblz_lat_row + 1
  }
  var __pxlblz_t = __pxlblz_A == 1 ? 0.5 : __pxlblz_lat_col / (__pxlblz_A - 1)
  var __pxlblz_u = __pxlblz_D == 1 ? 0.5 : __pxlblz_lat_row / (__pxlblz_D - 1)
`
  const chainDispatch = arms.map((arm, i) => `${i === 0 ? '' : ' else '}if (__pxlblz_lat_d == ${arm.id}) {\n${arm.body}}`).join('')
  const tail = (dispatchCode: string) => `  if (__pxlblz_lat_d < 0) return
  ${dispatchCode.split('\n').join('\n  ')}
}
`
  const build = (perPixel: string, dispatchCode = dispatch) => `${head}${globals}export function render2D(index, x, y) {\n${boundary}${perPixel}${tail(dispatchCode)}`
  return {
    latched: build(perPixelOriginal),
    latchedCounters: build(perPixelCounters),
    latchedChain: build(perPixelOriginal, chainDispatch),
    arms: arms.length,
    bodyGroups: groups.size,
  }
}
