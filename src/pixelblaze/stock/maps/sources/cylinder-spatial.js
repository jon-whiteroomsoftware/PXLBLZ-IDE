// Cylinder geometry's single physical wall-point definition. The grid has
// square cells when unrolled: circumference:height = cols:rows. Row-major wire
// order leaves a one-cell seam gap rather than duplicating the first column.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var cols = Math.ceil(Math.sqrt(n))
  var rows = Math.ceil(n / cols)
  var height = Math.max(1, rows - 1)
  var radius = rows > 1 ? cols / (2 * Math.PI) : 0.5
  var center = height / 2
  var coords = []
  for (var i = 0; i < n; i++) {
    var col = i % cols
    var row = Math.floor(i / cols)
    var angle = col / cols * 2 * Math.PI
    coords.push([
      center + radius * Math.cos(angle),
      row,
      center + radius * Math.sin(angle),
    ])
  }
  return coords
}
