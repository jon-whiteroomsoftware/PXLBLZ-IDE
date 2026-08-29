// #914 hand-generated pass output: Rule B lazy position-only memoization
// applied mechanically to the shipped ClockworkIris (IDE-authored).
// Site: band's initializer (position-only op chain, est 11.4x mul) in
// render2D. Sentinel note: band is legitimately 0 in the inter-ring gaps and
// a value-shifted sentinel is not float64-exact, so the mechanical choice is
// sentinel 0 with recompute-on-zero — exact everywhere, benefit only on
// pixels whose band is nonzero. This measures the honest economics of the
// mechanical sentinel rule on an op-chain site.
// Pattern: Clockwork Iris
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Counter-rotating dashed rings advance behind a many-bladed mechanical shutter.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Speed — How fast the escapement beats;
//           Aperture — Opens and closes the bladed shutter across the ring stack;
//           Teeth — Gearing density — more blades, finer dashes, busier works;
//           Color — Sweeps the brass-and-steel palette around the colour wheel.
//
// Notes:
// A mechanical eye. Concentric dashed rings advance on an escapement - dwell,
// then snap to the next tooth - with alternating direction and gearing per
// ring. A many-bladed iris opens and closes over the stack, its scalloped
// edge glowing where it cuts the rings. Ring index and dash phase come from
// radius and angle alone; the escapement and aperture solve once per frame.

export var speed = 0.4
export var aperture = 0.5 // Recommended pot: opens and closes the bladed shutter across the ring stack.
export var teeth = 0.45
export var color = 0.52 // Recommended pot: sweeps the brass-and-steel palette.

export function sliderSpeed(v) { speed = v }
export function sliderAperture(v) { aperture = v }
export function sliderTeeth(v) { teeth = v }
export function sliderColor(v) { color = v }

export var t = 0
var tick = 0
var apertureR = 0.2
var blades = 8
var dashBase = 8

var __pxlblz_memo0
var __pxlblz_memo0_built = 0

export function beforeRender(delta) {
  if (__pxlblz_memo0_built == 0 && pixelCount > 0) {
    __pxlblz_memo0 = array(pixelCount)
    __pxlblz_memo0_built = pixelCount
  }
  t = t + delta * 0.001 * (0.2 + speed * 0.9)

  // Escapement: the works dwell, then snap forward on the beat.
  var beats = t * 2.4
  tick = floor(beats) + smoothstep(0.82, 1, frac(beats))

  dashBase = floor(6 + teeth * 8)
  blades = floor(5 + teeth * 7)
  // The shutter follows the pot directly, with a slow mechanical breath on top.
  apertureR = 0.05 + aperture * 0.3 + 0.03 * wave(t * 0.4)
}

export function render2D(index, x, y) {
  var px = x - 0.5
  var py = y - 0.5
  var r = hypot(px, py)
  var turns = atan2(py, px) / PI2 + 0.5

  // Which ring of the works we are on, and how close to its centreline.
  var ring = floor((r - 0.05) / 0.07)
  var __pxlblz_ix0 = floor(index)
  var __pxlblz_v0 = 0
  if (__pxlblz_ix0 < __pxlblz_memo0_built) __pxlblz_v0 = __pxlblz_memo0[__pxlblz_ix0]
  if (__pxlblz_v0 == 0) {
    __pxlblz_v0 = clamp(1 - abs(frac((r - 0.05) / 0.07) - 0.5) / 0.3, 0, 1)
    if (__pxlblz_ix0 < __pxlblz_memo0_built) __pxlblz_memo0[__pxlblz_ix0] = __pxlblz_v0
  }
  var band = __pxlblz_v0

  // Alternate direction each ring; inner rings are geared to tick farther.
  var dir = mod(ring, 2) * 2 - 1
  var rot = tick * dir * (0.055 - ring * 0.006)
  var dashCount = dashBase + ring * 2
  var dash = smoothstep(0.5, 0.72, wave(turns * dashCount + rot))

  var value = band * dash * clamp(1 - (r - 0.34) / 0.12, 0, 1)
  var hue = frac(color + ring * 0.045 + dash * 0.03)
  var saturation = 0.8

  // The iris: a scalloped blade edge that blocks everything inside it.
  var edge = apertureR + 0.016 * wave(turns * blades - tick * 0.04)
  value = value * smoothstep(edge - 0.01, edge + 0.012, r)
  var blade = clamp(1 - abs(r - edge) / 0.014, 0, 1)
  if (blade > value) {
    value = blade
    hue = frac(color + 0.46)
    saturation = 0.55
  }

  // A faint pupil ember so a fully closed iris still reads as an eye.
  value = max(value, clamp(1 - r / 0.02, 0, 1) * 0.35)
  hsv(hue, saturation, clamp(value, 0, 1))
}
