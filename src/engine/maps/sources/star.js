// Stock 3D star: a stellated polyhedron — an icosahedron body with a sharp
// pyramidal spike erected over each of its 20 triangular faces, like a paper
// star ornament. The lights run along the star's wireframe: every body edge plus
// every pyramid edge that climbs from a face corner up to its spike tip, so the
// spikes and the polyhedral body both read clearly when you orbit it. The pixel
// count is the only knob (ADR-0004): points are dealt round-robin across the
// edges, so adding pixels fills every edge of the star evenly. Emits raw coords;
// the shared normalize pass maps each axis to [0,1], aspect-preserving (the star
// is symmetric, so it stays centred).
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var phi = (1 + Math.sqrt(5)) / 2

  // The 12 icosahedron vertices (cyclic permutations of (0, +/-1, +/-phi)),
  // normalized to the unit sphere — these are the star body's corners.
  var V = [
    [0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi],
    [1, phi, 0], [1, -phi, 0], [-1, phi, 0], [-1, -phi, 0],
    [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
  ]
  for (var k = 0; k < V.length; k++) {
    var L = Math.sqrt(V[k][0] * V[k][0] + V[k][1] * V[k][1] + V[k][2] * V[k][2])
    V[k] = [V[k][0] / L, V[k][1] / L, V[k][2] / L]
  }

  function dist2(p, q) {
    var dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2]
    return dx * dx + dy * dy + dz * dz
  }

  // The icosahedron edge length is the smallest pairwise vertex distance; two
  // vertices are connected iff they sit at (about) that distance.
  var minD2 = Infinity
  for (var a = 0; a < 12; a++) {
    for (var b = a + 1; b < 12; b++) {
      var d = dist2(V[a], V[b])
      if (d < minD2) minD2 = d
    }
  }
  var adj = minD2 * 1.1 // a little slack so float wobble still counts as adjacent

  // Body edges: every adjacent vertex pair (the 30 icosahedron edges).
  var edges = []
  for (var a = 0; a < 12; a++) {
    for (var b = a + 1; b < 12; b++) {
      if (dist2(V[a], V[b]) <= adj) edges.push([V[a], V[b]])
    }
  }

  // Spike edges: each face (a triple of mutually adjacent vertices) gets an apex
  // pushed out along the face's outward normal; three edges climb to it. 20 faces.
  var tip = 1.9 // how far the spike tips reach beyond the unit body
  for (var a = 0; a < 12; a++) {
    for (var b = a + 1; b < 12; b++) {
      for (var c = b + 1; c < 12; c++) {
        if (dist2(V[a], V[b]) <= adj && dist2(V[a], V[c]) <= adj && dist2(V[b], V[c]) <= adj) {
          var cx = (V[a][0] + V[b][0] + V[c][0]) / 3
          var cy = (V[a][1] + V[b][1] + V[c][1]) / 3
          var cz = (V[a][2] + V[b][2] + V[c][2]) / 3
          var cl = Math.sqrt(cx * cx + cy * cy + cz * cz)
          var apex = [(cx / cl) * tip, (cy / cl) * tip, (cz / cl) * tip]
          edges.push([V[a], apex], [V[b], apex], [V[c], apex])
        }
      }
    }
  }

  // Deal the pixels round-robin across the edges, spaced evenly from one end to
  // the other; shared endpoints (body corners, spike tips) light up where edges meet.
  var E = edges.length
  var coords = []
  for (var i = 0; i < n; i++) {
    var e = i % E
    var rank = Math.floor(i / E)
    var count = Math.floor((n - 1 - e) / E) + 1
    var t = count > 1 ? rank / (count - 1) : 0
    var p0 = edges[e][0], p1 = edges[e][1]
    coords.push([
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t,
      p0[2] + (p1[2] - p0[2]) * t,
    ])
  }
  return coords
}
