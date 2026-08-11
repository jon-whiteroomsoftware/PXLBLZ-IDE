// Pattern: Luma Pinwheel
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Grayscale spokes rotate about the center on an exact loop. A Show
// ingredient for Luma and Chroma keying rather than a finished piece: tint,
// scale, rotate, and layer it from a Show.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Loop Interval — Exact cycle length from 0.25 to 8 seconds; one
//           loop advances exactly one spoke;
//           Direction — Clockwise, hold, or counterclockwise travel;
//           Spacing — Spoke density; quantizes to whole spokes (1 to 12) so
//           the wheel always closes seamlessly;
//           Width — Lit fraction of each spoke cycle;
//           Feather — Edge softness, from hard spokes to sine-smooth swells;
//           Lean — Spoke asymmetry, from symmetric through full sawtooth,
//           leaning toward or against travel;
//           Invert — Swap figure and ground.
//
// Notes:
// One family core drives every Luma member: a crest waveform (Width + Feather
// + Lean span sine, sawtooth, and hard-bar space with three continuous
// controls) evaluated over a phase geometry - here, angle about the frame
// center, scaled by a whole spoke count so the angular wrap is invisible.
// Spacing is the one family control that quantizes: a fractional spoke could
// never close around the circle. Phase accumulates on its own clock, so
// animating any other control from a Show never resets position, and one
// loop advances exactly one period for seamless BPM-locked playback. Output
// is pure grayscale across the full 0..1 range so key Target, Tolerance, and
// Softness have the whole domain.

export var loopInterval = 0.48
export var direction = 1
export var spacing = 0.5
export var width = 0.4
export var feather = 0.5
export var lean = 0.5
export var invert = 0

export function sliderLoopInterval(v) { loopInterval = v }
export function sliderDirection(v) { direction = v }
export function sliderSpacing(v) { spacing = v }
export function sliderWidth(v) { width = v }
export function sliderFeather(v) { feather = v }
export function sliderLean(v) { lean = v }
export function toggleInvert(v) { invert = v }

var phase = 0
var spokes = 6

export function beforeRender(delta) {
  var seconds = 0.25 + 7.75 * loopInterval * loopInterval
  var dir = direction < 1 / 3 ? -1 : direction < 2 / 3 ? 0 : 1
  phase = frac(phase + dir * delta * 0.001 / seconds + 1)
  spokes = 1 + floor(spacing * 10.999)
}

// Family crest waveform: a triangle with a movable peak (Lean), cut at the
// height that lights exactly Width of each period, softened by Feather.
function crest(p) {
  var c = 0.02 + 0.96 * lean
  // frac truncates toward zero; offset keeps the wrap positive for any
  // in-frame phase at maximum spoke count.
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
  var a = atan2(y - 0.5, x - 0.5) / PI2
  var p = a * spokes - phase
  hsv(0, 0, finish(crest(p)))
}
