// Eclipse Dome installation, seen from the front: a hemispherical dome wound
// from apex to rim as one spiral strip, inside a flat halo ring. At 490 pixels
// the index contract is dome 0-399 then halo 400-489.
//
// Dome: radius 26.6 cm, 12.5 clockwise turns with LEDs at equal spacing along
// the strip (13.3 m at 30 LED/m). Halo: radius 47.7 cm in the dome's rim
// plane, wired from six o'clock counterclockwise as seen. Units are cm; +y
// renders downward.
function(pixelCount) {
  var count = Math.max(1, Math.floor(pixelCount) || 1)
  var domeCount = Math.round(count * 400 / 490)
  var haloCount = count - domeCount
  var domeRadius = 26.6
  var haloRadius = 47.7
  var turns = 12.5
  var coords = []

  // Arc-length table along the spiral, so LEDs sit at equal strip spacing
  // rather than equal angle (the apex turns are much shorter than the rim's).
  function spiral(u) {
    var tilt = Math.PI / 2 * u
    var spin = 2 * Math.PI * turns * u
    return [
      domeRadius * Math.sin(tilt) * Math.cos(spin),
      domeRadius * Math.sin(tilt) * Math.sin(spin),
      domeRadius * Math.cos(tilt),
    ]
  }
  var steps = 8000
  var curve = [spiral(0)]
  var arc = [0]
  for (var k = 1; k <= steps; k++) {
    var p = spiral(k / steps)
    var q = curve[k - 1]
    curve.push(p)
    arc.push(arc[k - 1] + Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2])))
  }
  var segment = 0
  for (var i = 0; i < domeCount; i++) {
    var s = (i + 0.5) / domeCount * arc[steps]
    while (segment < steps - 1 && arc[segment + 1] < s) segment++
    var f = (s - arc[segment]) / (arc[segment + 1] - arc[segment])
    var a = curve[segment]
    var b = curve[segment + 1]
    coords.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
  }

  for (var j = 0; j < haloCount; j++) {
    var angle = (j + 0.5) / haloCount * 2 * Math.PI
    coords.push([haloRadius * Math.sin(angle), haloRadius * Math.cos(angle)])
  }

  return coords
}
