// Shape Shifter - an SDF silhouette theatre.
//
// Five analytic forms continuously become one another. Only the current and
// next distance fields run for each pixel, while rotation, sequencing, and
// feather widths are prepared once per frame.

export var speed = 0.34
export var shape = 0 // Recommended pot: scrubs continuously through every form and in-between state.
export var color = 0.78 // Recommended pot: sweeps the complete contour palette.
export var feather = 0.36
export var contours = 0.52

export function sliderSpeed(v) { speed = v }
export function sliderShape(v) { shape = v }
export function sliderColor(v) { color = v }
export function sliderFeather(v) { feather = v }
export function sliderContours(v) { contours = v }

export var t = 0
export var form = 0
var nextForm = 1
var formMix = 0
var rotC = 1, rotS = 0
var edgeWidth = 0.03
var bandSpacing = 0.06

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.025 + speed * 0.12)
  var sequence = frac(t + shape) * 5
  form = floor(sequence)
  nextForm = mod(form + 1, 5)
  formMix = smoothstep(0.08, 0.92, frac(sequence))

  var angle = t * 0.67
  rotC = cos(angle)
  rotS = sin(angle)
  edgeWidth = 0.014 + feather * 0.055
  bandSpacing = 0.035 + (1 - contours) * 0.075
}

function flowerDistance(x, y) {
  var d = SDF.circle(x, y, 0.5, 0.31, 0.19)
  d = SDF.smoothUnion(d, SDF.circle(x, y, 0.69, 0.5, 0.19), 0.09)
  d = SDF.smoothUnion(d, SDF.circle(x, y, 0.5, 0.69, 0.19), 0.09)
  d = SDF.smoothUnion(d, SDF.circle(x, y, 0.31, 0.5, 0.19), 0.09)
  return SDF.smoothUnion(d, SDF.circle(x, y, 0.5, 0.5, 0.13), 0.07)
}

function shapeDistance(kind, x, y) {
  if (kind == 0) return SDF.ellipse(x, y, 0.5, 0.5, 0.34, 0.21)
  if (kind == 1) return SDF.star(x, y, 0.5, 0.5, 0.37, 5, 0.43)
  if (kind == 2) return flowerDistance(x, y)
  if (kind == 3) return SDF.cross(x, y, 0.5, 0.5, 0.31, 0.105)
  return SDF.ring(x, y, 0.5, 0.5, 0.28, 0.105)
}

export function render2D(index, x, y) {
  // Rotate the sample around the centre. The matrix itself is frame-global.
  var px = x - 0.5, py = y - 0.5
  var qx = px * rotC - py * rotS + 0.5
  var qy = px * rotS + py * rotC + 0.5

  var fromDistance = shapeDistance(form, qx, qy)
  var toDistance = shapeDistance(nextForm, qx, qy)
  var d = mix(fromDistance, toDistance, formMix)

  var fill = SDF.softFill(d, edgeWidth * 1.6)
  var edge = SDF.glow(d, edgeWidth)
  var bands = SDF.bands(d + t * 0.018, bandSpacing)
  bands = bands * bands * fill
  var value = clamp(fill * 0.18 + bands * (0.22 + contours * 0.40) + edge * 0.92, 0, 1)

  hsv(frac(color + form * 0.11 + d * 1.35 + bands * 0.08), 0.82, value)
}
