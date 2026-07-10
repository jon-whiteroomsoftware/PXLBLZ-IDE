// Ember Spire (1D) - a real fire simulation, not a fire-colored gradient.
//
// A per-pixel heat field evolves on a fixed 16ms tick: sparks inject at the
// base, heat advects upward and diffuses, and every cell cools faster the
// higher it sits. A slow bellows swells and starves the spark rate so the
// whole column breathes. The render step just reads one cell of heat.

export var intensity = 0.55 // Recommended pot: feeds or starves the fire from embers to a roaring column.
export var cooling = 0.42
export var surge = 0.5
export var color = 0.01 // Recommended pot: relights the fire in copper, emerald, or ghost-blue chemistries.

export function sliderIntensity(v) { intensity = v }
export function sliderCooling(v) { cooling = v }
export function sliderSurge(v) { surge = v }
export function sliderColor(v) { color = v }

export var blaze = 0 // mean heat, for the Var Watcher: watch the fire breathe

var heat            // per-pixel heat field, 0..1
var built = 0       // pixelCount the field was built for (0 = not yet)
var accum = 0       // ms owed to the simulation clock
var t = 0
var bellows = 1

function buildFire() {
  heat = array(pixelCount)
  var zone = max(2, floor(pixelCount * 0.1))
  var i = 0
  for (i = 0; i < pixelCount; i++) heat[i] = 0
  // Pre-seed the base so the fire opens already burning instead of cold.
  for (i = 0; i < zone; i++) heat[i] = 0.5 + random(0.5)
  built = pixelCount
}

function stepFire() {
  var n = built
  var zone = max(2, floor(n * 0.08))
  var coolRate = (0.006 + cooling * 0.05) * bellows
  var i = 0
  var sum = 0

  // Cool: higher cells shed heat faster, which tapers the flame tips.
  for (i = 0; i < n; i++) {
    var h = heat[i] - random(1) * coolRate * (0.35 + 1.65 * i / n)
    heat[i] = max(h, 0)
    sum += heat[i]
  }
  blaze = sum / n

  // Advect + diffuse: each cell inherits mostly from the cells below it,
  // so heat climbs the spire. Weights sum to 3 so this step conserves heat.
  for (i = n - 1; i >= 3; i--) {
    heat[i] = (heat[i] * 0.5 + heat[i - 1] * 1.1 + heat[i - 2] * 0.9 + heat[i - 3] * 0.5) / 3
  }

  // Spark: the bellows modulates how often fresh fuel lands in the base zone.
  if (random(1) < (0.3 + intensity * 0.62) * bellows) {
    var j = floor(random(zone))
    heat[j] = min(heat[j] + 0.6 + random(0.4), 1)
  }
}

export function beforeRender(delta) {
  if (built != pixelCount && pixelCount > 0) buildFire()
  t = mod(t + delta * 0.001, 64)
  var swell = wave(t * 0.11)
  bellows = 1 + surge * (swell * swell - 0.45) * 1.3

  // Fixed-tick simulation so behaviour is frame-rate independent.
  accum += delta
  var steps = 0
  for (steps = 0; steps < 3 && accum >= 16; steps++) {
    stepFire()
    accum -= 16
  }
  if (accum > 16) accum = 16 // shed backlog after a stall rather than fast-forwarding
}

export function render(index) {
  var h = heat[index]
  // Blackbody-style ramp: hue climbs slightly with heat, saturation burns off
  // toward white only at the very hottest cells.
  var hue = color + h * 0.1
  var sat = 1 - smoothstep(0.72, 1, h) * 0.6
  var v = h * h * 1.08 + 0.003
  hsv(frac(hue), sat, clamp(v, 0, 1))
}
