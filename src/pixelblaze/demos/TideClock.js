// Tide Clock (1D) — slow overlapping tides and bright foam crests.
//
// A strip-friendly ambient pattern: a few triangle/sine-ish waveforms produce
// long-cycle motion without the cost of per-pixel loops.

export var speed = 0.30       // tide speed
export var swell = 0.58       // wave contrast
export var foam = 0.55        // crest brightness
export var palette = 0.52     // water hue

export function sliderSpeed(v) { speed = v }
export function sliderSwell(v) { swell = v }
export function sliderFoam(v) { foam = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var invPixels, flow

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.06 + speed * 0.75)
  invPixels = 1 / (pixelCount - 1)
  flow = t * 0.12
}

export function render(index) {
  var pos = index * invPixels
  var a = triangle(pos * 1.2 - flow)
  var b = triangle(pos * 2.3 + flow * 0.7 + 0.21)
  var c = triangle(pos * 4.1 - flow * 1.3 + 0.47)
  var tide = (a * 0.52 + b * 0.32 + c * 0.16)
  var crest = max(0, tide - (0.68 - foam * 0.16)) * (2.2 + foam * 2.0)
  var val = clamp(0.10 + tide * (0.25 + swell * 0.45) + crest, 0, 1)
  hsv(frac(palette + tide * 0.08 + crest * 0.03), 0.72 - crest * 0.20, val)
}
