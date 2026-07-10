// Standing Wave Organ (1D) - interference voices ringing on one string.
//
// Four organ voices ring the strip as standing waves: fixed nodes at both
// ends, each voice a spatial harmonic oscillating at a musically related
// rate. Detuning the chord slides the voices from unison breathing through
// beating fifths to a full harmonic stack, so the strip drifts between calm,
// shimmer, and constructive slams. All oscillators advance once per frame;
// each LED only sums four sine products.

export var speed = 0.4
export var chord = 0.35 // Recommended pot: retunes the voices from unison through fifths to a full harmonic stack.
export var voices = 0.6
export var color = 0.62 // Recommended pot: sweeps the whole register around the colour wheel.

export function sliderSpeed(v) { speed = v }
export function sliderChord(v) { chord = v }
export function sliderVoices(v) { voices = v }
export function sliderColor(v) { color = v }

export var t = 0
var a1 = 1, a2 = 0, a3 = 0, a4 = 0
var norm = 1

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.18 + speed * 0.9)

  // Voice n rings at 1 + n * spread: chord = 0 is unison breathing and
  // chord = 1 approaches the natural harmonic series.
  var spread = chord
  var stops = voices * 3
  var g2 = clamp(stops, 0, 1) * 0.8
  var g3 = clamp(stops - 1, 0, 1) * 0.65
  var g4 = clamp(stops - 2, 0, 1) * 0.5

  a1 = cos(PI2 * t)
  a2 = cos(PI2 * t * (1 + spread)) * g2
  a3 = cos(PI2 * t * (1 + spread * 2)) * g3
  a4 = cos(PI2 * t * (1 + spread * 3)) * g4
  norm = 1 + g2 + g3 + g4
}

export function render(index) {
  var x = index / max(pixelCount - 1, 1)

  // Spatial modes n = 1..4, all pinned dark at the two ends.
  var level = (sin(PI * x) * a1
    + sin(PI * x * 2) * a2
    + sin(PI * x * 3) * a3
    + sin(PI * x * 4) * a4) / norm
  var energy = level * level

  // Nodes stay dark; antinodes glow, and full constructive peaks flash white.
  var value = clamp(energy * 2.1, 0, 1)
  value = value * value * (3 - 2 * value)
  var saturation = clamp(0.95 - energy * 0.6, 0, 1)
  hsv(frac(color + level * 0.09), saturation, value)
}
