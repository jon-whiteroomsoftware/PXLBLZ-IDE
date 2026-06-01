// Stock 2D wide grid. Like the square plane, the pixel count is the only knob
// (ADR-0004), but this grid is laid out about twice as wide as it is tall: it
// picks rows = ceil(sqrt(n/2)) so cols = ceil(n/rows) comes out roughly 2x rows.
// Emits raw row/col integer indices in row-major order (x-fastest); the shared
// normalize pass divides every axis by the longest (the wide axis), so the grid
// keeps its 2:1 proportion (long axis 0..1, short axis 0..~0.5).
//
// Each pixel's coordinate is BOTH where it's drawn and the coordinate the pattern
// samples, so mirroring an axis here moves a pixel's color and its drawn position
// together — the preview render looks identical (a flipped grid is the same grid).
// You'd still flip an axis to match how your fixture is physically wired: if pixel
// 0 starts on the right instead of the left, or the rows are wired bottom-to-top,
// reverse that axis so each pixel index lands on the real LED you intend. The
// effect shows up on hardware (fixed pixel order), not in this position-based
// preview. For example:
//   coords.push([(cols - 1) - (i % cols), Math.floor(i / cols)])  // reverse columns (mirror wiring left/right)
//   coords.push([i % cols, (rows - 1) - Math.floor(i / cols)])    // reverse rows (mirror wiring top/bottom)
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var rows = Math.ceil(Math.sqrt(n / 2))
  var cols = Math.ceil(n / rows)
  var coords = []
  for (var i = 0; i < n; i++) {
    coords.push([i % cols, Math.floor(i / cols)])
  }
  return coords
}
