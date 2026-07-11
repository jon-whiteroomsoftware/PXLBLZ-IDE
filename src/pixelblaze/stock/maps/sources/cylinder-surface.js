// Cylinder coordinate view: circumference × height. Row-major wire order keeps
// adjacent indices moving around the circumference, then advances one row.
// Raw integer coordinates are normalized by Pixelblaze's Mapper bake.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var cols = Math.ceil(Math.sqrt(n))
  var coords = []
  for (var i = 0; i < n; i++) {
    coords.push([i % cols, Math.floor(i / cols)])
  }
  return coords
}
