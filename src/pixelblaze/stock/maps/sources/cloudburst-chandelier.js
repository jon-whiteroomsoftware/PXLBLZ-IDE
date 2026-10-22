// Cloudburst's designed chandelier (#1200): metres, y up. Three rings in
// Inner/Middle/Outer wire order; each tube runs from its top LED to its bottom.
// Use a multiple of 48 pixels for equal tube lengths (960 gives 20 per tube).
// Geometry follows the approved Cloudburst Target and the #1193 map probe.
function(pixelCount) {
  var rings = [
    { tubes: 8, radius: 0.2, drop: 0.30, offset: 0.25 },
    { tubes: 16, radius: 0.4, drop: 0.15, offset: 0.5 },
    { tubes: 24, radius: 0.6, drop: 0, offset: 0 },
  ]
  var perTube = pixelCount / 48
  var coords = []
  for (var i = 0; i < pixelCount; i++) {
    var tube = Math.floor(i / perTube)
    var ring = tube < 8 ? rings[0] : tube < 24 ? rings[1] : rings[2]
    var localTube = tube < 8 ? tube : tube < 24 ? tube - 8 : tube - 24
    var pixel = i - tube * perTube
    var angle = (localTube + ring.offset) * 2 * Math.PI / ring.tubes
    var depth = ring.drop + (localTube % 2 === 0 ? 0.06 : 0) + (pixel + 0.5) * 0.5 / perTube
    coords.push([ring.radius * Math.cos(angle), -depth, ring.radius * Math.sin(angle)])
  }
  return coords
}
