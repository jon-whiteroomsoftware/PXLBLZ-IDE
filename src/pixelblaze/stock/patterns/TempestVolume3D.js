// Tempest Volume 3D — a storm-tossed water volume.
//
// A cheap animated height field defines the waterline while crossing current
// bands and suspended flecks move through the filled volume. The goal is a
// boiling ocean in 3D, not a flat surface: waves slap at the top, but the body of
// the water keeps tugging in different directions like layered caustics.

export var waterLevel = 0.62    // fill height
export var agitation = 0.62     // storm strength
export var currentScale = 0.48  // size of the submerged currents
export var foam = 0.55          // crest and spray brightness
export var tint = 0.55          // base water hue

export function sliderWaterLevel(v) { waterLevel = v }
export function sliderAgitation(v) { agitation = v }
export function sliderCurrentScale(v) { currentScale = v }
export function sliderFoam(v) { foam = v }
export function sliderTint(v) { tint = v }

export var t = 0
var level, amp, scale, foamWidth, storm

function smooth01(x) {
  x = clamp(x, 0, 1)
  return x * x * (3 - 2 * x)
}

export function beforeRender(delta) {
  storm = agitation * agitation
  t = t + delta * 0.001 * (0.10 + agitation * 0.95)

  // Keep the extremes usable: "empty" still leaves a little bottom water, and
  // "full" still leaves room for crests to climb.
  level = 0.08 + waterLevel * 0.84
  amp = 0.035 + storm * 0.26
  scale = 2.4 + currentScale * 7.2
  foamWidth = 0.025 + foam * 0.11 + storm * 0.035
}

export function render3D(index, x, y, z) {
  var px = x - 0.5
  var py = y - 0.5

  // Moving waterline: three counter-drifting wave systems give the top its
  // climb/slap motion without sampling true 3D noise.
  var wa = triangle(x * scale + y * 1.7 + t * 0.42)
  var wb = wave(y * scale * 1.23 - x * 2.1 - t * 0.37)
  var wc = sin((px - py) * scale * 1.6 + t * 1.35)
  var surface = level + amp * ((wa - 0.5) * 0.95 + (wb - 0.5) * 0.65 + wc * 0.24)

  var water = surface - z
  var fill = smooth01((water + 0.018) / (0.055 + storm * 0.055))
  var depth = clamp(water / (0.18 + level * 0.82), 0, 1)

  // Submerged current fields. They share the surface's timebase but drift on
  // different axes, so the volume feels like layers pulling past one another.
  var ca = triangle((x * 1.8 + y * 0.7 + z * 2.6) * scale + t * 0.35)
  var cb = wave((y * 1.4 - x * 1.1 - z * 2.0) * scale * 1.12 - t * 0.48)
  var cc = triangle((z * 2.8 + x * 0.5 - y * 1.6) * scale * 0.78 + t * 0.28)

  // Bright filaments appear where counter-moving current layers meet. Cubing the
  // band gives caustic-like veins without pow().
  var band = clamp(1 - abs(ca - cb) / (0.08 + currentScale * 0.19), 0, 1)
  band = band * band * band
  var deepBand = clamp(1 - abs(cb - cc) / (0.11 + storm * 0.16), 0, 1)
  deepBand = deepBand * deepBand * 0.55

  // Surface foam/spray is strongest near the waterline, then gets torn into
  // streaks by the same current fields that animate the submerged body.
  var nearSurface = smooth01(1 - abs(water) / foamWidth)
  var tear = clamp(1 - abs((ca + cc) - 1) / (0.12 + storm * 0.18), 0, 1)
  var crest = nearSurface * tear * foam * (0.45 + storm * 1.35)

  // Sparse suspended flecks: deterministic from index + position, animated by
  // depth. They sell particulate water without random() cost or frame flicker.
  var fleckSeed = wave(index * 0.031 + x * 2.1 - y * 1.7 + z * 3.3 + t * 0.19)
  var fleck = clamp((fleckSeed - (0.82 - storm * 0.11)) * 6, 0, 1)
  fleck = fleck * fill * (0.12 + storm * 0.35)

  var body = fill * (0.04 + (1 - depth) * 0.10 + band * 0.34 + deepBand * 0.22 + fleck)
  var spray = (1 - fill) * crest * storm * 0.55
  var val = clamp(body + crest * 0.82 + spray, 0, 1)

  var hue = frac(tint + depth * 0.08 - band * 0.045 + z * 0.025 + t * 0.006)
  var sat = clamp(0.88 - crest * 0.62 - fleck * 0.25, 0.18, 0.92)
  hsv(hue, sat, val)
}
