// Lattice Warp 3D — a cubic grid bent by slow phase waves.
//
// A repeated max-axis distance field gives bright rods along cell boundaries;
// low-frequency triangle offsets make the lattice breathe without expensive
// deformation.

export var speed = 0.35       // warp speed
export var spacing = 0.48     // lattice density
export var warp = 0.60        // bend amount
export var color = 0.69       // base hue

export function sliderSpeed(v) { speed = v }
export function sliderSpacing(v) { spacing = v }
export function sliderWarp(v) { warp = v }
export function sliderColor(v) { color = v }

export var t = 0
var cells, bend

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.25)
  cells = 3 + floor(spacing * 6)
  bend = 0.02 + warp * 0.08
}

export function render3D(index, x, y, z) {
  var wx = x + (triangle(y * 2.5 + z * 1.7 + t * 0.15) - 0.5) * bend
  var wy = y + (triangle(z * 2.2 + x * 1.4 - t * 0.13) - 0.5) * bend
  var wz = z + (triangle(x * 2.0 + y * 1.8 + t * 0.11) - 0.5) * bend
  var gx = abs(frac(wx * cells) - 0.5)
  var gy = abs(frac(wy * cells) - 0.5)
  var gz = abs(frac(wz * cells) - 0.5)
  var rod = clamp(1 - min(gx, min(gy, gz)) * 12, 0, 1)
  var nodes = clamp(1 - max(gx, max(gy, gz)) * 5.2, 0, 1) * 0.35
  var val = clamp(rod * rod + nodes, 0, 1)
  hsv(frac(color + z * 0.18 + val * 0.05), 0.85, val)
}
