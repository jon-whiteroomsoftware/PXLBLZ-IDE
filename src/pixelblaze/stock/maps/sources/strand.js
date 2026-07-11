// Generic Strand coordinate view for any deterministic generated geometry.
// It exposes normalized wire-order progress only; the family pairs it with its
// existing physical source for preview positions.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var coords = []
  for (var i = 0; i < n; i++) coords.push([i])
  return coords
}
