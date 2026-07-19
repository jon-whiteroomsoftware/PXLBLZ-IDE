// Pattern: Topographic Bloom
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Contour bands wrap around breathing flower-shaped distance fields.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Speed — How quickly the flower shape breathes;
//           Layers — Strength and density of the contour bands;
//           Spacing — Distance between topographic contour lines;
//           Color — Base colour of the bloom.
//
// Notes:
// SDF bands are an efficient way to get lots of apparent detail from one moving
// signed-distance field.

export var speed = 0.56       // bloom breathing speed
export var layers = 0.95      // contour density
export var spacing = 0.42     // band separation
export var color = 0.30       // base hue

export function sliderSpeed(v) { speed = v }
export function sliderLayers(v) { layers = v }
export function sliderSpacing(v) { spacing = v }
export function sliderColor(v) { color = v }

export var t = 0
var bandSpacing, petalR

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.1)
  bandSpacing = 0.028 + (1 - spacing) * 0.08
  petalR = 0.17 + layers * 0.045 + 0.025 * wave(t * 0.23)
}

export function render2D(index, x, y) {
  var a = t * 0.38
  var cx0 = 0.5 + 0.15 * cos(a), cy0 = 0.5 + 0.15 * sin(a)
  var cx1 = 0.5 + 0.15 * cos(a + 2.09), cy1 = 0.5 + 0.15 * sin(a + 2.09)
  var cx2 = 0.5 + 0.15 * cos(a + 4.18), cy2 = 0.5 + 0.15 * sin(a + 4.18)

  var d = SDF.smoothUnion(SDF.inline.circle(x, y, cx0, cy0, petalR),
                          SDF.inline.circle(x, y, cx1, cy1, petalR), 0.12)
  d = SDF.smoothUnion(d, SDF.inline.circle(x, y, cx2, cy2, petalR), 0.12)
  d = SDF.smoothUnion(d, SDF.inline.circle(x, y, 0.5, 0.5, petalR * 0.82), 0.10)

  var fill = SDF.inline.softFill(d, 0.08)
  var contour = SDF.inline.bands(d + t * 0.012, bandSpacing)
  contour = contour * contour * (0.35 + layers * 0.65)
  var edge = SDF.inline.glow(d, 0.018) * 0.8
  var val = clamp(fill * contour + edge, 0, 1)

  hsv(frac(color + d * 1.7 + contour * 0.06), 0.86, val)
}
