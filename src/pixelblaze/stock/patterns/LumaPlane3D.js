// Pattern: LumaPlane3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Parallel grayscale planes on an exact loop, for tinting and keying in Shows.
// Runs on: 3D maps; y up, with Tilt zero giving level horizontal planes.
// Controls: Loop Interval — Exact cycle length in seconds, up to 10;
//           Direction — Reverse, hold, or forward;
//           Spacing — Plane pitch from 0.05 to 2 normalized units;
//           Width — Lit fraction of each period;
//           Feather — Edge softness;
//           Lean — Crest asymmetry;
//           Tilt — Normal angle from +y through horizontal to -y;
//           Azimuth — Normal heading around the y axis;
//           Offset — Phase shift in periods;
//           Invert — Swap figure and ground.
//
// LumaStripes' crest and phase-preserving clock, with the approved #1193
// plane geometry. Spacing 1, Width 0.5, Feather 0.04, Lean 0.5, Tilt 0,
// Direction hold and Offset y/2 make a stationary waterline at height y.

export var loopInterval = 0.2
export var direction = 1
export var spacing = 0.5
export var width = 0.4
export var feather = 0.5
export var lean = 0.5
export var tilt = 0
export var azimuth = 0
export var offset = 0
export var invert = 0

export function sliderLoopInterval(v) { loopInterval = v }
export function sliderDirection(v) { direction = v }
export function sliderSpacing(v) { spacing = v }
export function sliderWidth(v) { width = v }
export function sliderFeather(v) { feather = v }
export function sliderLean(v) { lean = v }
export function sliderTilt(v) { tilt = v }
export function sliderAzimuth(v) { azimuth = v }
export function sliderOffset(v) { offset = v }
export function toggleInvert(v) { invert = v }

var phase = 0, clockMs = 0, lastLoopMs = 2000, pitch = 0.5
var nx = 0, ny = 1, nz = 0

export function beforeRender(delta) {
  var loopMs = max(100, 10000 * loopInterval)
  if (loopMs != lastLoopMs) {
    clockMs = clockMs / lastLoopMs * loopMs
    lastLoopMs = loopMs
  }
  var dir = direction < 1 / 3 ? -1 : direction < 2 / 3 ? 0 : 1
  clockMs = mod(clockMs + dir * delta + loopMs, loopMs)
  phase = clockMs / loopMs
  pitch = 0.05 + spacing * 1.95
  var s = sin(tilt * PI)
  nx = s * cos(azimuth * PI2)
  nz = s * sin(azimuth * PI2)
  ny = cos(tilt * PI)
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

export function render3D(index, x, y, z) {
  var p = ((x - 0.5) * nx + (y - 0.5) * ny + (z - 0.5) * nz) / pitch - phase - offset
  var v = crest(p)
  hsv(0, 0, invert > 0.5 ? 1 - v : v)
}
