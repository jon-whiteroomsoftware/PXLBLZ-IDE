// Pattern: Luma Chevron
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Grayscale chevron bands - the classic alternating 45-degree zigzag - travel
// across the frame on an exact loop. A Show ingredient for Luma and Chroma
// keying rather than a finished piece: tint, scale, rotate, and layer it from
// a Show.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Loop Interval — Exact cycle length from 0.25 to 8 seconds; one
//           loop advances exactly one band;
//           Direction — Reverse, hold, or forward travel;
//           Spacing — Band-to-band distance;
//           Width — Lit fraction of each band cycle;
//           Feather — Edge softness, from hard chevrons to sine-smooth
//           swells;
//           Lean — Band asymmetry, from symmetric through full sawtooth,
//           leaning toward or against travel;
//           Angle — Compass origin of travel: 0 travels top to bottom, 0.25
//           right to left;
//           Fold — Width of each zigzag leg across the bands;
//           Invert — Swap figure and ground.
//
// Notes:
// One family core drives every Luma member: a crest waveform (Width + Feather
// + Lean span sine, sawtooth, and hard-bar space with three continuous
// controls) evaluated over a phase geometry - here, distance along the travel
// heading displaced by a triangle wave of the cross coordinate, which folds
// straight bands into chevrons. The legs are fixed at 45 degrees (the classic
// video chevron); an adjustable leg angle is deliberately deferred. Phase
// accumulates on its own clock, so animating any control from a Show never
// resets position, and one loop advances exactly one period for seamless
// BPM-locked playback. Output is pure grayscale across the full 0..1 range so
// key Target, Tolerance, and Softness have the whole domain.

export var loopInterval = 0.48
export var direction = 1
export var spacing = 0.5
export var width = 0.4
export var feather = 0.5
export var lean = 0.5
export var angle = 0
export var fold = 0.25
export var invert = 0

export function sliderLoopInterval(v) { loopInterval = v }
export function sliderDirection(v) { direction = v }
export function sliderSpacing(v) { spacing = v }
export function sliderWidth(v) { width = v }
export function sliderFeather(v) { feather = v }
export function sliderLean(v) { lean = v }
export function sliderAngle(v) { angle = v }
export function sliderFold(v) { fold = v }
export function toggleInvert(v) { invert = v }

var phase = 0
var clockMs = 0
var pitch = 0.5
var legSpan = 0.16
var hx = 0, hy = 1

export function beforeRender(delta) {
  // Exact loop: accumulate whole milliseconds and derive phase with one
  // division, so 16.16 Precise mode carries no per-frame rate bias and the
  // clock wraps exactly at the loop length.
  var loopMs = 250 + 7750 * loopInterval * loopInterval
  var dir = direction < 1 / 3 ? -1 : direction < 2 / 3 ? 0 : 1
  clockMs = mod(clockMs + dir * delta + loopMs, loopMs)
  phase = clockMs / loopMs
  pitch = 0.05 + spacing * 0.75
  legSpan = 0.04 + fold * 0.46
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
  var dx = x - 0.5
  var dy = y - 0.5
  var u = dx * hx + dy * hy
  var w = dy * hx - dx * hy
  // The zigzag: displace the along-travel coordinate by a triangle wave of
  // the cross coordinate with unit slope, folding straight crests into
  // 45-degree chevron legs. The 16-period offset keeps mod's argument
  // positive for any in-frame w (mod follows the dividend's sign).
  var zig = abs(mod(w + 32 * legSpan, 2 * legSpan) - legSpan) - legSpan / 2
  hsv(0, 0, finish(crest((u + zig) / pitch - phase)))
}
