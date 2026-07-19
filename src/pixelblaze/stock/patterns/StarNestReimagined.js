// Pattern: Star Nest Reimagined
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// Credit: "Star Nest" by Pablo Roman Andrioli (Kali) — https://www.shadertoy.com/view/XlfGRj
//
// Kali-folded space is sampled directly at each mapped LED to form drifting stellar filaments.
// Runs on: 3D maps; designed for volumes and shells.
// Controls: Speed — Drift rate through the folded nest;
//           Fold — The fold constant — reshapes the nest from open wisps to dense filament webs;
//           Color — Base nebula hue;
//           Detail — Extra fold passes — finer filaments at the cost of frame rate.

export var speed = 0.35
export var fold = 0.45 // Recommended pot: the fold constant - reshapes the nest from open wisps to dense filament webs.
export var color = 0.68 // Recommended pot: base nebula hue.
export var detail = 0.25

export function sliderSpeed(v) { speed = v }
export function sliderFold(v) { fold = v }
export function sliderColor(v) { color = v }
export function sliderDetail(v) { detail = v }

export var t = 0
var formu = 0.6
var iterations = 5
var wanderX = 0, wanderY = 0, wanderZ = 0

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.06 + speed * 0.3)
  formu = 0.45 + fold * 0.35
  iterations = floor(4 + detail * 4)

  // A slow bounded wander through fold space. Periodic offsets (rather than an
  // ever-growing translation) keep coordinates inside fixed-point range forever.
  wanderX = 1.1 * sin(t * 0.5)
  wanderY = 0.7 * sin(t * 0.31 + 2.1)
  wanderZ = 1.1 * cos(t * 0.23)
}

export function render3D(index, x, y, z) {
  var px = (x - 0.5) * 1.9 + wanderX
  var py = (y - 0.5) * 1.9 + wanderY
  var pz = (z - 0.5) * 1.9 + wanderZ

  // Kali fold: reflect into the positive octant, invert through the unit
  // sphere, recentre. Density is how violently path length changes.
  var acc = 0
  var prevLen = 0
  var len = 0
  var i = 0
  for (i = 0; i < iterations; i = i + 1) {
    px = abs(px)
    py = abs(py)
    pz = abs(pz)
    // Clamp the inversion denominator: keeps the fold finite at the origin
    // and inside 16.16 range in Precise mode.
    var d = clamp(px * px + py * py + pz * pz, 0.08, 12)
    px = px / d - formu
    py = py / d - formu
    pz = pz / d - formu
    len = hypot3(px, py, pz)
    acc = acc + abs(len - prevLen)
    prevLen = len
  }

  // Light only the dense filaments; most of the volume stays night-sky dark.
  var density = clamp(acc * 0.22 - 0.1, 0, 1)
  var value = 0.004 + density * density
  var saturation = clamp(0.9 - density * 0.55, 0, 1)
  hsv(frac(color + acc * 0.06 + len * 0.04), saturation, clamp(value, 0, 1))
}
