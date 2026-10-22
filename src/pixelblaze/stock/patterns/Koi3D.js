// Pattern: Koi3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// One gold body and two trailing glows on a gently wavering circular lap.
// Runs on: 3D maps; y up, with a lap centered at x = z = 0.5.
// Controls: Loop Interval — Exact lap length in seconds, up to 20;
//           Size — Body radius from 0.04 to 0.12 normalized units;
//           Hue — Body colour, gold by default;
//           Height — Mid-water lap height, with a small vertical sway.
//
// Developed from the approved #1193 Middle-ring lap probe. The 0.3333 radius
// follows Cloudburst's Middle ring. Size 0.75 bridges its tube gaps; the
// unsquared value keeps the body bright enough to read against keyed water.

export var loopInterval = 0.5
export var size = 0.75
export var hue = 0.12
export var height = 0.5
export function sliderLoopInterval(v) { loopInterval = v }
export function sliderSize(v) { size = v }
export function sliderHue(v) { hue = v }
export function sliderHeight(v) { height = v }

var clockMs = 0, lastLoopMs = 10000
var ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0
var cx = 0, cy = 0, cz = 0, r2 = 0.01
function px(a) { return 0.5 + (0.3333 + 0.02 * sin(a * 3)) * cos(a) }
function pz(a) { return 0.5 + (0.3333 + 0.02 * sin(a * 3)) * sin(a) }
function py(a) { return height * 0.7 + 0.03 * sin(a * 3) }

export function beforeRender(delta) {
  var loopMs = max(1000, 20000 * loopInterval)
  if (loopMs != lastLoopMs) {
    clockMs = clockMs / lastLoopMs * loopMs
    lastLoopMs = loopMs
  }
  clockMs = mod(clockMs + delta, loopMs)
  var angle = clockMs / loopMs * PI2
  ax = px(angle); ay = py(angle); az = pz(angle)
  bx = px(angle - 0.18); by = py(angle - 0.18); bz = pz(angle - 0.18)
  cx = px(angle - 0.36); cy = py(angle - 0.36); cz = pz(angle - 0.36)
  var radius = 0.04 + size * 0.08
  r2 = radius * radius
}

export function render3D(index, x, y, z) {
  // Three squared distances, with no per-pixel roots or trigonometry.
  var d0 = ((x - ax) * (x - ax) + (y - ay) * (y - ay) + (z - az) * (z - az)) / r2
  var d1 = ((x - bx) * (x - bx) + (y - by) * (y - by) + (z - bz) * (z - bz)) / (r2 * 0.6)
  var d2 = ((x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)) / (r2 * 0.35)
  var v = max(clamp(1 - d0, 0, 1), max(clamp(1 - d1, 0, 1) * 0.7, clamp(1 - d2, 0, 1) * 0.45))
  hsv(hue, 0.9, v)
}
