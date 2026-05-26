// Caustics — shimmering light on a pool floor.
//
// Two animated Voronoi layers drift past each other; the interference of their
// light pools produces the wandering filaments of focused light you see at the
// bottom of a swimming pool. A slow depth-shimmer crossing the whole pool adds
// the feeling of sun filtering through moving water.

// ── Adjustable controls ────────────────────────────────────────────────────
export var speed = 0.5      // how fast the water moves
export var density = 0.4    // caustic cell density (zoom)
export var sharpness = 0.33 // focus — soft pools vs. crisp veins
export var tint = 0.52      // base water hue (0..1 of the colour wheel)

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderSharpness(v) { sharpness = v }
export function sliderTint(v) { tint = v }

export var t

export function beforeRender(delta) {
  t = time(0.1) * (0.5 + speed * 3)
}

export function render2D(index, x, y) {
  var SCALE = 3 + density * 5
  var sharp = 1.2 + sharpness * 1.5
  var ph = t * PI2

  // Layer A — slow, large-scale drift
  var ax = x * SCALE + sin(ph) * 0.6 + sin(ph * 0.37) * 0.4
  var ay = y * SCALE + cos(ph * 0.9) * 0.6
  var dA = Noise.voronoiDist(ax, ay)

  // Layer B — faster, finer, counter-drifting
  var bx = x * SCALE * 1.3 - cos(ph * 0.8) * 0.5
  var by = y * SCALE * 1.3 + sin(ph * 1.1) * 0.7
  var dB = Noise.voronoiDist(bx, by)

  // Sharp focal pools near each layer's cell centres
  var cA = pow(1 - clamp(dA * sharp, 0, 1), 3)
  var cB = pow(1 - clamp(dB * sharp, 0, 1), 3)

  // Veins (where both layers are bright) plus soft overall pooling
  var light = clamp(cA * cB * 2.5 + (cA + cB) * 0.5, 0, 1)
  light = pow(light, 1.3)

  // Slow depth shimmer sweeping across the pool (sun through water)
  var depth = 0.6 + 0.4 * wave(x * 0.5 + y * 0.3 + t * 0.5)
  light = light * depth

  // Water: dim tinted base, brightening to near-white at the focal lines,
  // with a faint iridescent hue drift along the veins.
  var hue = frac(tint - light * 0.08 + 0.04 * wave(t * 0.3 + x))
  var sat = clamp(0.9 - light * 1.0, 0.1, 0.9)
  var val = clamp(0.05 + light * 1.15, 0, 1)
  hsv(hue, sat, val)
}
