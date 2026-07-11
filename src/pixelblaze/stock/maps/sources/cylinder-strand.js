// Cylinder coordinate view: ordered strand progress. The selected map sent to
// Pixelblaze contains only the coordinates the Pattern observes; PXLBLZ-IDE
// pairs this source with the family's shared cylinder-spatial source for preview.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var coords = []
  for (var i = 0; i < n; i++) coords.push([i])
  return coords
}
