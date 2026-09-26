// Pattern: Luma Cells
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// A packed lattice of grayscale cells swells and fades out of step on an
// exact loop - a boiling granular surface, a field of twinkles, or scattered
// embers. A Show ingredient for Luma and Chroma keying rather than a finished
// piece: tint, scale, rotate, and layer it from a Show.
// Runs on: 2D maps; designed for panels, discs, and mapped surfaces.
// Controls: Loop Interval — Exact cycle length in seconds, up to 10 (the raw
//           slider value is seconds divided by 10); one
//           loop pulses every cell exactly once;
//           Direction — Reverse, hold, or forward time;
//           Spacing — Cell size;
//           Width — Share of each cell's cycle spent lit, and so the share of
//           cells lit at any instant;
//           Feather — Pulse softness, from hard blinks to smooth swells;
//           Lean — Pulse asymmetry, from slow swell and sudden drop through
//           to sudden flash and slow decay;
//           Invert — Swap figure and ground.
//
// Notes:
// The Luma family core - one crest waveform over a phase geometry - with a
// scattered phase: each cell's geometry is a fixed per-cell offset rather than
// a distance, so the cells pulse in a stable pseudo-random order. Rows sit
// sqrt(3)/2 of a cell apart and alternate rows shift half a cell, so the
// lattice is hexagonal: every cell has six equidistant neighbours. Each
// cell's body fades to black before its edge, so a dark lane separates
// neighbours and a Spacing sweep moves cell boundaries through darkness
// rather than flipping lit pixels between cells.

export var loopInterval = 0.3
export var direction = 1
export var spacing = 0.3
export var width = 0.4
export var feather = 0.6
export var lean = 0.2
export var invert = 0

export function sliderLoopInterval(v) { loopInterval = v }
export function sliderDirection(v) { direction = v }
export function sliderSpacing(v) { spacing = v }
export function sliderWidth(v) { width = v }
export function sliderFeather(v) { feather = v }
export function sliderLean(v) { lean = v }
export function toggleInvert(v) { invert = v }

var phase = 0
var clockMs = 0
var lastLoopMs = 3000
var pitch = 0.12
var rowPitch = 0.104

export function beforeRender(delta) {
  var loopMs = 10000 * loopInterval
  if (loopMs < 100) loopMs = 100
  if (loopMs != lastLoopMs) {
    clockMs = clockMs / lastLoopMs * loopMs
    lastLoopMs = loopMs
  }
  var dir = direction < 1 / 3 ? -1 : direction < 2 / 3 ? 0 : 1
  clockMs = mod(clockMs + dir * delta + loopMs, loopMs)
  phase = clockMs / loopMs
  pitch = 0.03 + spacing * 0.3
  rowPitch = pitch * 0.8660254
}

function crest(p) {
  var c = 0.02 + 0.96 * lean
  var ph = frac(p + 32)
  var tri = ph < c ? ph / c : (1 - ph) / (1 - c)
  var th = 1 - (0.02 + 0.96 * width)
  var room = th < 1 - th ? th : 1 - th
  var fe = 0.004 + feather * room
  return smoothstep(th - fe, th + fe, tri)
}

function finish(v) {
  return invert > 0.5 ? 1 - v : v
}

export function render2D(index, x, y) {
  // Offsets keep lattice coordinates positive: fw 3.67 frac truncates toward
  // zero, so negative cells would hash differently from their mirror images.
  var gy = (y - 0.5) / rowPitch + 64
  var row = floor(gy)
  var gx = (x - 0.5) / pitch + 64 + (row % 2) * 0.5
  var col = floor(gx)
  // Low-discrepancy per-cell offset (R2 sequence), scrambled once; every
  // intermediate stays far inside the 16.16 range.
  var h = col * 0.7548777 + row * 0.5698403
  h = h - floor(h)
  h = h * (h + 3.17) * 5.3
  h = h - floor(h)
  // Full inside 0.233 of a cell from its centre, black from half a row pitch
  // outward, so every lit pixel lies inside its own cell's row.
  var body = (0.433 - hypot(gx - col - 0.5, (gy - row - 0.5) * 0.8660254)) * 5
  if (body > 1) body = 1
  if (body < 0) body = 0
  hsv(0, 0, finish(crest(h - phase) * body))
}
