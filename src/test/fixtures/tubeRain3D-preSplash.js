// Pattern: TubeRain3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Bright falling heads with soft squared tails, independently phased per tube.
// Runs on: 3D maps; vertical tubes with constant x/z and y pointing up.
// Controls: Speed — Downward travel speed;
//           Density — Fraction of drops admitted, from dry to downpour;
//           Length — Tail length;
//           Hue — Rain colour;
//           Saturation — Rain colour saturation.
//
// Developed from the #1193 TubeRain probe. Density gates a complete drop,
// never a frame, so a head enters from above rather than appearing mid-tube.

export var speed = 0.35
export var density = 0.5
export var length = 0.6
export var hue = 0.6
export var saturation = 0.55
export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderLength(v) { length = v }
export function sliderHue(v) { hue = v }
export function sliderSaturation(v) { saturation = v }

var flow = 0, tail = 0.3
export function beforeRender(delta) {
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
  hsv(hue, saturation, v * v * gate)
}
