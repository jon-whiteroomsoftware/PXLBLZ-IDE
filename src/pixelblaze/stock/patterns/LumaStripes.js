// Pattern: Luma Stripes
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Parallel grayscale bands travel across the frame on an exact loop. A Show
// ingredient for Luma and Chroma keying rather than a finished piece: tint,
// scale, rotate, and layer it from a Show.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Loop Interval — Exact cycle length in seconds, up to 10 (the raw
//           slider value is seconds divided by 10); one
//           loop advances exactly one band;
//           Direction — Reverse, hold, or forward travel;
//           Spacing — Band-to-band distance;
//           Width — Lit fraction of each band cycle;
//           Feather — Edge softness, from hard bars to sine-smooth swells;
//           Lean — Band asymmetry, from symmetric through full sawtooth,
//           leaning toward or against travel;
//           Angle — Compass origin of travel: 0 travels top to bottom, 0.25
//           right to left;
//           Invert — Swap figure and ground.
//
// Notes:
// One family core drives every Luma member: a crest waveform (Width + Feather
// + Lean span sine, sawtooth, and hard-bar space with three continuous
// controls) evaluated over a phase geometry - here, signed distance along the
// travel heading. Phase accumulates on its own clock, so animating any control
// from a Show never resets position, and one loop advances exactly one period
// for seamless BPM-locked playback. Output is pure grayscale across the full
// 0..1 range so key Target, Tolerance, and Softness have the whole domain.

export var loopInterval = 0.2
export var direction = 1
export var spacing = 0.5
export var width = 0.4
export var feather = 0.5
export var lean = 0.5
export var angle = 0.875
export var invert = 0

export function sliderLoopInterval(v) { loopInterval = v }
export function sliderDirection(v) { direction = v }
export function sliderSpacing(v) { spacing = v }
export function sliderWidth(v) { width = v }
export function sliderFeather(v) { feather = v }
export function sliderLean(v) { lean = v }
export function sliderAngle(v) { angle = v }
export function toggleInvert(v) { invert = v }

var phase = 0
var clockMs = 0
var lastLoopMs = 2000
var pitch = 0.5
var hx = 0, hy = -1

export function beforeRender(delta) {
  // Exact loop: accumulate whole milliseconds and derive phase with one
  // division, so 16.16 Precise mode carries no per-frame rate bias and the
  // clock wraps exactly at the loop length.
  // The raw slider is seconds / 10 (20% = 2 s); the IDE offers exact typed
  // entry through the curated seconds presentation.
  var loopMs = 10000 * loopInterval
  if (loopMs < 100) loopMs = 100
  if (loopMs != lastLoopMs) {
    // A tempo change preserves phase: rescale the clock to the new loop
    // length instead of keeping raw elapsed milliseconds, so automating
    // Loop Interval from a Show never jumps or warps the image.
    clockMs = clockMs / lastLoopMs * loopMs
    lastLoopMs = loopMs
  }
  var dir = direction < 1 / 3 ? -1 : direction < 2 / 3 ? 0 : 1
  clockMs = mod(clockMs + dir * delta + loopMs, loopMs)
  phase = clockMs / loopMs
  pitch = 0.05 + spacing * 0.75
  // Angle names the compass origin of travel (a north wind blows from the
  // north): 0 comes from the top. Plane-map sample y increases top to bottom
  // on screen, so from-the-top travel is the +y direction.
  hx = -sin(angle * PI2)
  hy = cos(angle * PI2)
}

// Family crest waveform: a triangle with a movable peak (Lean), cut at the
// height that lights exactly Width of each period, softened by Feather.
function crest(p) {
  var c = 0.02 + 0.96 * lean
  // frac truncates toward zero; offset keeps the wrap positive for any
  // in-frame phase at minimum Spacing.
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
  var p = ((x - 0.5) * hx + (y - 0.5) * hy) / pitch - phase
  hsv(0, 0, finish(crest(p)))
}
