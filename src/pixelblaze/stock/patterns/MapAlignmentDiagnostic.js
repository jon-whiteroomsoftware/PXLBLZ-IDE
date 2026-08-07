// Pattern: Map Alignment Diagnostic
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// License: ISC
//
// Red X, green Y, and blue Z bands reveal map orientation, alignment, and wobble.
// Runs on: 1D, 2D, and 3D maps; designed for strips, surfaces, shells, and volumes.
// Controls: Mode — Selects moving scans, centred axes, or a repeating grid;
//           Speed — Sets the moving scan rate;
//           Width — Sets diagnostic band width;
//           Motion — Pauses or resumes the moving scan.
//
// Notes:
// Mode 0 sweeps every available axis from 0 to 1. Mode 1 holds the bands at
// coordinate 0.5. Mode 2 repeats bands every quarter of the mapped domain.
// Axis colors add at intersections: red + green + blue becomes white.

export var mode = 0
export var speed = 0.35
export var width = 0.3
export var motion = 1
export var phase = 0

var bandWidth = 0.0285

export function sliderMode(v) {
  mode = min(2, floor(v * 3))
}

export function showNumberMode() {
  return mode
}

export function sliderSpeed(v) {
  speed = v
}

export function sliderWidth(v) {
  width = v
}

export function toggleMotion(v) {
  motion = v
}

export function beforeRender(delta) {
  bandWidth = 0.006 + width * 0.075
  if (motion) {
    phase = frac(phase + delta * 0.001 * (0.05 + speed * 0.45))
  }
}

function axisBand(coordinate) {
  var distance
  if (mode == 0) {
    distance = abs(coordinate - phase)
    distance = min(distance, 1 - distance)
  } else if (mode == 1) {
    distance = abs(coordinate - 0.5)
  } else {
    distance = abs(frac(coordinate * 4 + 0.5) - 0.5) / 4
  }
  return clamp(1 - distance / bandWidth, 0, 1)
}

export function render(index, x) {
  rgb(axisBand(x), 0, 0)
}

export function render2D(index, x, y) {
  rgb(axisBand(x), axisBand(y), 0)
}

export function render3D(index, x, y, z) {
  rgb(axisBand(x), axisBand(y), axisBand(z))
}
