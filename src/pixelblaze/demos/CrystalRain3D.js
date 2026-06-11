// Crystal Rain 3D — falling rods and droplets through a cubic volume.
//
// Repeated X/Z columns and vertical triangle phases create a rain field with no
// arrays. It reads well in 3D previews and still produces useful FPS on hardware.

export var speed = 0.42       // fall speed
export var density = 0.50     // column density
export var length = 0.55      // droplet length
export var hue = 0.55         // crystal colour

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderLength(v) { length = v }
export function sliderHue(v) { hue = v }

export var t = 0
var cells, rodLen

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.14 + speed * 1.5)
  cells = 4 + floor(density * 6)
  rodLen = 0.10 + length * 0.24
}

export function render3D(index, x, y, z) {
  var gx = frac(x * cells) - 0.5
  var gz = frac(z * cells) - 0.5
  var id = floor(x * cells) + floor(z * cells) * 13
  var col = clamp(1 - max(abs(gx), abs(gz)) * 7.5, 0, 1)
  var phase = frac(y + t * (0.18 + id * 0.004) + id * 0.071)
  var drop = clamp(1 - min(phase, 1 - phase) / rodLen, 0, 1)
  var sparkle = triangle(id * 0.137 + t * 0.12) * 0.22
  var val = col * drop * (0.65 + sparkle)
  hsv(frac(hue + y * 0.20 + id * 0.017), 0.78, val)
}
