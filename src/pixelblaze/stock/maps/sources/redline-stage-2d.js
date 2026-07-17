// Five-surface installation: one stretched hero panel followed by four
// concentric-ring targets. At 4,000 pixels the index contract is 1,600 + 4x600.
function(pixelCount) {
  var count = Math.max(5, Math.floor(pixelCount) || 5)
  var centerCount = Math.round(count * 0.4)
  var remaining = count - centerCount
  var targetBase = Math.floor(remaining / 4)
  var targetRemainder = remaining - targetBase * 4
  var coords = []

  // The compiler derives a square local grid from a physical Zone count. A
  // 40x40 index grid stretched to 2.4:0.86 makes its local coordinates match
  // the actual 1,600-pixel hero panel instead of scrambling a 64x25 winding.
  var centerColumns = Math.max(1, Math.ceil(Math.sqrt(centerCount)))
  var centerRows = Math.max(1, Math.ceil(centerCount / centerColumns))
  for (var i = 0; i < centerCount; i++) {
    var column = i % centerColumns
    var row = Math.floor(i / centerColumns)
    var x = centerColumns > 1 ? column / (centerColumns - 1) : 0.5
    var y = centerRows > 1 ? row / (centerRows - 1) : 0.5
    coords.push([-1.2 + 2.4 * x, -0.43 + 0.86 * y])
  }

  var centers = [
    [-1.85, -0.78],
    [-1.85, 0.78],
    [1.85, -0.78],
    [1.85, 0.78],
  ]
  for (var target = 0; target < 4; target++) {
    var targetCount = targetBase + (target < targetRemainder ? 1 : 0)
    var spokes = Math.max(1, Math.ceil(Math.sqrt(targetCount)))
    var rings = Math.max(1, Math.ceil(targetCount / spokes))
    for (var local = 0; local < targetCount; local++) {
      var ring = Math.floor(local / spokes)
      var spoke = local % spokes
      var radius = 0.68 * (ring + 0.5) / rings
      var angle = 2 * Math.PI * (spoke + 0.5 * (ring % 2)) / spokes
      coords.push([
        centers[target][0] + radius * Math.cos(angle),
        centers[target][1] + radius * Math.sin(angle),
      ])
    }
  }

  return coords
}
