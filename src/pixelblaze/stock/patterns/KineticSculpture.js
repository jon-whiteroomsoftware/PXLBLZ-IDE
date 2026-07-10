// Kinetic Sculpture (3D) - implicit forms passing through one another.
//
// Three glowing solids - a sphere, a spinning bar, and a floating torus -
// orbit the volume on independent paths. A smooth union melts them together
// wherever they meet, and the LEDs light the resulting shell with a faint
// interior fill. All motion solves once per frame; each LED evaluates three
// cheap distance fields and two blends.

export var speed = 0.36
export var blend = 0.5 // Recommended pot: how much the forms melt together as they pass - crisp clockwork to liquid mercury.
export var color = 0.6 // Recommended pot: re-tints the whole sculpture.
export var shell = 0.45

export function sliderSpeed(v) { speed = v }
export function sliderBlend(v) { blend = v }
export function sliderColor(v) { color = v }
export function sliderShell(v) { shell = v }

export var t = 0
var sx = 0.5, sy = 0.5, sz = 0.5
var barC = 1, barS = 0
var torY = 0.5
var k = 0.1
var shellW = 0.04

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 0.55)
  sx = 0.5 + 0.26 * sin(t * 0.9)
  sy = 0.5 + 0.26 * sin(t * 0.63 + 1.7)
  sz = 0.5 + 0.26 * cos(t * 0.77)
  barC = cos(t * 0.5)
  barS = sin(t * 0.5)
  torY = 0.5 + 0.3 * sin(t * 0.41 + 0.9)
  k = 0.02 + blend * 0.16
  shellW = 0.02 + shell * 0.06
}

export function render3D(index, x, y, z) {
  var px = x - 0.5
  var py = y - 0.5
  var pz = z - 0.5

  var dSphere = hypot3(x - sx, y - sy, z - sz) - 0.16

  // The bar is a capsule spinning in the horizontal plane.
  var bx = px * barC - pz * barS
  var bz = px * barS + pz * barC
  var qx = clamp(bx, -0.3, 0.3)
  var dBar = hypot3(bx - qx, py, bz) - 0.08

  // The torus rides up and down, always horizontal.
  var dTorus = hypot(hypot(px, pz) - 0.26, y - torY) - 0.06

  var d = SDF.smoothUnion(SDF.smoothUnion(dSphere, dBar, k), dTorus, k)

  var glowV = clamp(1 - abs(d) / shellW, 0, 1)
  glowV = glowV * glowV
  var value = d < 0 ? max(glowV, 0.12) : glowV

  // Tint by whichever form owns this point, so the melt zones shade between.
  var hue = color
  if (dBar < dSphere && dBar < dTorus) hue = color + 0.13
  else if (dTorus < dSphere) hue = color + 0.29
  hsv(frac(hue), 0.85, clamp(value, 0, 1))
}
