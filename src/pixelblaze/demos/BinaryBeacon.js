// Binary Beacon (1D) — digital packets, sync pulses, and parity flashes.
//
// Designed for strips/rings: no loops in render, just a few precomputed packet
// heads and hard-edged square/triangle timing.

export var speed = 0.45       // packet speed
export var packets = 0.58     // active packet count
export var width = 0.50       // packet width
export var palette = 0.33     // base beacon colour

export function sliderSpeed(v) { speed = v }
export function sliderPackets(v) { packets = v }
export function sliderWidth(v) { width = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var active, falloff, invPixels, p0, p1, p2, p3, sync

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.16 + speed * 1.55)
  active = 2 + floor(packets * 3)
  falloff = 18 + width * 30
  invPixels = 1 / (pixelCount - 1)
  p0 = frac(t * 0.10)
  p1 = frac(t * -0.13 + 0.27)
  p2 = frac(t * 0.16 + 0.53)
  p3 = frac(t * -0.19 + 0.79)
  sync = square(t * 0.18, 0.12)
}

function packet(pos, p) {
  var d = abs(pos - p)
  d = min(d, 1 - d)
  return clamp(1 - d * falloff, 0, 1)
}

export function render(index) {
  var pos = index * invPixels
  var v = packet(pos, p0)
  var hue = palette
  var q = packet(pos, p1)
  if (q > v) { v = q; hue = palette + 0.12 }
  if (active > 2) {
    q = packet(pos, p2)
    if (q > v) { v = q; hue = palette + 0.24 }
  }
  if (active > 3) {
    q = packet(pos, p3)
    if (q > v) { v = q; hue = palette + 0.36 }
  }
  var tick = max(clamp(1 - abs(pos - 0.0) * 90, 0, 1), clamp(1 - abs(pos - 0.5) * 90, 0, 1)) * sync
  hsv(frac(hue + tick * 0.08), 0.86 - tick * 0.2, clamp(v * v + tick * 0.7, 0, 1))
}
