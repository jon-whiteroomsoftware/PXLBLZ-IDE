// Four-surface proscenium installation: a dance-floor hero panel framed by a
// proscenium arch, flanked by two full-height towers. Proportions are
// deliberately exaggerated (fat lintel, wide towers) so the lit surfaces fill
// the preview window instead of reading at architectural scale. Index order
// follows the installer's walk across the stage: left tower, floor, arch
// (left leg up, across the lintel, right leg down), right tower. At 1,000
// pixels the index contract is 200 + 400 + 200 + 200.
function (pixelCount) {
  var count = Math.max(4, Math.floor(pixelCount) || 4)
  var towerCount = Math.round(count * 0.2)
  var archCount = Math.round(count * 0.2)
  var floorCount = count - 2 * towerCount - archCount
  var coords = []

  // Row-major grid over a rectangle. Every row spans the full panel width and
  // row populations differ by at most one, so no panel ends in a ragged
  // partial row — a stray short row would read as the exact coverage fault
  // the 300-series lessons teach learners to diagnose.
  function panel(n, x0, y0, width, height) {
    var ideal = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * height / width))))
    // Prefer an exact row divisor near the ideal so the canonical counts
    // produce perfectly regular lattices instead of alternating row widths.
    var rows = ideal
    for (var candidate = 0; candidate <= Math.ceil(ideal * 0.35); candidate++) {
      if (ideal - candidate >= 1 && n % (ideal - candidate) === 0) { rows = ideal - candidate; break }
      if (ideal + candidate <= n && n % (ideal + candidate) === 0) { rows = ideal + candidate; break }
    }
    var placed = 0
    for (var row = 0; row < rows; row++) {
      var rowCount = Math.round((row + 1) * n / rows) - placed
      for (var column = 0; column < rowCount; column++) {
        coords.push([
          x0 + (rowCount > 1 ? width * column / (rowCount - 1) : width / 2),
          y0 + (rows > 1 ? height * row / (rows - 1) : height / 2),
        ])
      }
      placed += rowCount
    }
  }

  // y grows downward on the drawn stage: the lintel sits at y=0, the deck at
  // y=3. Overall silhouette is 5.1 x 3.0 (~1.7:1, the Redline stage's fill).
  panel(towerCount, 0, 0, 0.6, 3.0)

  panel(floorCount, 1.3, 0.75, 2.5, 2.25)

  // The arch is three panels in walk order — left leg, lintel, right leg —
  // with pixels split by segment area.
  var legHeight = 2.35
  var legArea = 0.3 * legHeight
  var lintelArea = 3.5 * 0.55
  var leftLegCount = Math.round(archCount * legArea / (2 * legArea + lintelArea))
  var rightLegCount = leftLegCount
  var lintelCount = archCount - leftLegCount - rightLegCount
  panel(leftLegCount, 0.8, 0.65, 0.3, legHeight)
  panel(lintelCount, 0.8, 0, 3.5, 0.55)
  panel(rightLegCount, 4.0, 0.65, 0.3, legHeight)

  panel(towerCount, 4.5, 0, 0.6, 3.0)

  return coords
}
