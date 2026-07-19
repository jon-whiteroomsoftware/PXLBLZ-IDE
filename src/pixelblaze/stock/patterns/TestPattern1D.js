// Pattern: Test Pattern 1D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// A hue ramp and moving white marker reveal strip order, direction, and index range.
// Runs on: 1D strips and rings.
// Controls: None.

export var t

export function beforeRender(delta) {
  t = time(0.1)
}

export function render(index) {
  var pos = index / (pixelCount - 1)   // 0 at the first pixel, 1 at the last
  var head = t                         // comet head sweeps 0 -> 1
  var comet = clamp(1 - abs(pos - head) * 12, 0, 1)
  // Hue ramp shows index order; the white comet shows direction of travel.
  hsv(pos, 1 - comet, max(0.15, comet))
}
