// Orbiting Glyphs — simple SDF symbols rotating into overlapping marks.
//
// Circles, rings, and a star-like radial field form readable animated glyphs
// without raymarching or many shape evaluations.

export var speed = 0.36       // orbital speed
export var spacing = 0.55     // orbit radius
export var glow = 0.60        // symbol bloom
export var hue = 0.78         // base glyph colour

export function sliderSpeed(v) { speed = v }
export function sliderSpacing(v) { spacing = v }
export function sliderGlow(v) { glow = v }
export function sliderHue(v) { hue = v }

export var t = 0
var orbit, ax, ay, bx, by, cx, cy

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.25)
  orbit = 0.13 + spacing * 0.18
  ax = 0.5 + orbit * cos(t * 0.61)
  ay = 0.5 + orbit * sin(t * 0.61)
  bx = 0.5 + orbit * cos(t * 0.61 + 2.09)
  by = 0.5 + orbit * sin(t * 0.61 + 2.09)
  cx = 0.5 + orbit * cos(t * 0.61 + 4.18)
  cy = 0.5 + orbit * sin(t * 0.61 + 4.18)
}

export function render2D(index, x, y) {
  var a = SDF.glow(SDF.ring(x, y, ax, ay, 0.11, 0.028), 0.045)
  var b = SDF.fillGlow(SDF.circle(x, y, bx, by, 0.075), 0.055)
  var dx = x - cx, dy = y - cy
  var r = hypot(dx, dy)
  var star = abs(r - (0.085 + (triangle(atan2(dy, dx) * 2.5 + t * 0.08) - 0.5) * 0.035)) - 0.018
  var c = clamp(1 - abs(star) / 0.050, 0, 1)
  var link = SDF.glow(SDF.ring(x, y, 0.5, 0.5, orbit, 0.012), 0.026) * 0.25
  var val = clamp(max(a, max(b, c)) * (0.45 + glow) + link, 0, 1)
  hsv(frac(hue + val * 0.07 + x * 0.05), 0.84, val)
}
