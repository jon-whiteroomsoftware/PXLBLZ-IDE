// Pattern: TubeRain3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Bright falling heads with soft squared tails, independently phased per tube.
// Runs on: 3D maps; vertical tubes with constant x/z and y pointing up.
// Controls: Speed — Downward travel speed;
//           Density — Fraction of drops admitted, from dry to downpour;
//           Length — Tail length;
//           Hue — Rain colour;
//           Saturation — Rain colour saturation;
//           Splash — Fraction of landing drops with a tiny upward splash, default off;
//           Landing Glow — Still light at tube landing points; default off.
// Splash and Landing Glow require evenly spaced tube geometry.
//
// Developed from the #1193 TubeRain probe. Density gates a complete drop,
// never a frame, so a head enters from above rather than appearing mid-tube.

export var speed = 0.35
export var density = 0.5
export var length = 0.6
export var hue = 0.6
export var saturation = 0.55
export var splash = 0
export var glow = 0
export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderLength(v) { length = v }
export function sliderHue(v) { hue = v }
export function sliderSaturation(v) { saturation = v }
export function sliderSplash(v) { splash = clamp(v, 0, 1) }
export function sliderLandingGlow(v) { glow = clamp(v, 0, 1) }

// Only splash and landing glow need geometry. Count the installed map, not the mutable member
// pixelCount in a compiled Show. Map replacement creates a fresh runtime.
var slots = 0
// xs/zs are tube keys, ys is the floor, ds is spacing.
var xs = 0, zs = 0, ys = 0, ds = 0
function count(index, x, y, z) { slots++ }
function find(x, z, hash) {
  var s = floor(hash * slots)
  for (var p = 0; p < slots; p++) {
    if (ds[s] == 0 || (xs[s] == x && zs[s] == z)) return s
    s = mod(s + 1, slots)
  }
  return -1
}
function collect(index, x, y, z) {
  var hash = mod(x * 91.7 + z * 53.3 + 0.5, 1)
  var s = find(x, z, hash)
  if (s < 0) return
  if (ds[s] == 0) {
    xs[s] = x; zs[s] = z; ys[s] = y
    ds[s] = -1
  } else {
    var dy = abs(y - ys[s])
    if (dy > 0 && (ds[s] < 0 || dy < ds[s])) ds[s] = dy
    ys[s] = min(y, ys[s])
  }
}
function calibrate() {
  mapPixels(count)
  if (slots <= 0) return
  xs = array(slots); zs = array(slots)
  ys = array(slots); ds = array(slots)
  mapPixels(collect)
}

var flow = 0, tail = 0.3
export function beforeRender(delta) {
  if ((splash > 0 || glow > 0) && slots == 0) calibrate()
  // A common bounded clock with distinct x/z phases. Wrap both the clock and
  // drop identity at 16, preserving heads and gates across the clock seam.
  flow = mod(flow + delta * 0.001 * (0.35 + speed * 1.3), 16)
  tail = 0.08 + length * 0.4
}

export function render3D(index, x, y, z) {
  var hash = mod(x * 91.7 + z * 53.3 + 0.5, 1)
  var phase = y * 1.6 + flow + hash
  // Positive modulo also handles negative coordinates; frac truncates instead.
  var d = mod(phase, 1)
  var drop = mod(floor(phase), 16)
  var gate = mod(hash * 7.3 + drop * 0.618, 1) < density ? 1 : 0
  var v = d < tail ? 1 - d / tail : 0
  v = v * v * gate
  if ((splash > 0 || glow > 0) && slots > 0) {
    var s = find(x, z, hash)
    if (s >= 0 && ds[s] > 0) {
      var y0 = ys[s], dy = ds[s]
      if (glow > 0) v = min(1, v + glow * max(0, 1 - abs((y - y0) / dy)))
      var hit = y0 * 1.6 + flow + hash
      var id = mod(floor(hit), 16)
      var age = mod(hit, 1) / (0.35 + speed * 1.3)
      if (age < 0.45 && mod(hash * 7.3 + id * 0.618, 1) < density &&
          mod(hash * 13.7 + id * 0.381966, 1) < splash) {
        var q = age / 0.45
        var hop = 1.4 * 4 * q * (1 - q)
        var shape = max(0, 1 - abs((y - y0) / dy - hop) / 0.6)
        v = min(1, v + 0.35 * (1 - q) * shape)
      }
    }
  }
  hsv(hue, saturation, v)
}
