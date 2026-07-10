// Impact Engine (1D) - two bodies collide, flash, and throw aftershocks.
//
// This is a timed scene for a strip rather than a chase. All choreography is
// solved once per frame; each LED only measures distance to a few moving events.

export var speed = 0.38
export var energy = 0.55 // Recommended pot: controls trail width, flash force, and debris reach.
export var color = 0.02 // Recommended pot: sweeps both opposing bodies through complementary hues.
export var echoes = 0.45

export function sliderSpeed(v) { speed = v }
export function sliderEnergy(v) { energy = v }
export function sliderColor(v) { color = v }
export function sliderEchoes(v) { echoes = v }

export var t = 0
export var phase = 0
var approach = 0
var aftermath = 0
var flash = 0
var leftHead = 0.08
var rightHead = 0.92
var trailWidth = 0.08
var shockRadius = 0

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.10 + speed * 0.22)
  phase = frac(t)
  trailWidth = 0.045 + energy * 0.095

  approach = smoothstep(0, 0.46, min(phase, 0.46))
  leftHead = 0.06 + approach * 0.44
  rightHead = 0.94 - approach * 0.44

  flash = clamp(1 - abs(phase - 0.50) / (0.035 + energy * 0.045), 0, 1)
  aftermath = clamp((phase - 0.50) / 0.50, 0, 1)
  shockRadius = aftermath * (0.48 + energy * 0.10)
}

function bloom(distance, width) {
  var v = clamp(1 - distance / width, 0, 1)
  return v * v
}

export function render(index) {
  var x = index / max(pixelCount - 1, 1)
  var value = 0.008
  var hue = color
  var saturation = 0.92

  if (phase < 0.53) {
    var left = bloom(abs(x - leftHead), trailWidth)
    var right = bloom(abs(x - rightHead), trailWidth)

    // Directional wake behind each approaching body.
    var leftWake = x < leftHead ? bloom(leftHead - x, trailWidth * 2.8) : 0
    var rightWake = x > rightHead ? bloom(x - rightHead, trailWidth * 2.8) : 0
    value = max(left, right) + 0.38 * max(leftWake, rightWake)
    hue = left > right ? color : frac(color + 0.47)
  }

  if (aftermath > 0) {
    var fromCentre = abs(x - 0.5)
    var shock = bloom(abs(fromCentre - shockRadius), 0.025 + energy * 0.035)
    var echo1 = bloom(abs(fromCentre - shockRadius * 0.68), 0.014 + echoes * 0.022)
    var echo2 = bloom(abs(fromCentre - shockRadius * 0.38), 0.010 + echoes * 0.016)

    // Three fragments on each side separate at different rates.
    var debris = bloom(abs(fromCentre - aftermath * 0.17), 0.018)
    debris = max(debris, bloom(abs(fromCentre - aftermath * 0.29), 0.013))
    debris = max(debris, bloom(abs(fromCentre - aftermath * 0.43), 0.009))

    value = max(value, shock + echoes * (echo1 * 0.55 + echo2 * 0.32) + debris * energy * 0.72)
    hue = frac(color + 0.08 + fromCentre * 0.75 + aftermath * 0.12)
  }

  value = max(value, flash * bloom(abs(x - 0.5), 0.08 + energy * 0.30))
  saturation = clamp(saturation - flash * 0.90, 0, 1)
  hsv(hue, saturation, clamp(value, 0, 1))
}
