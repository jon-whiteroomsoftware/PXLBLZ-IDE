// Stock 3D star SHELL: LEDs spread over the SURFACE of a stellated icosahedron
// — an icosahedron body with a pyramidal spike over each of its 20
// triangular faces, so the surface is 60 slanted triangles. Distinct from the
// retired wireframe star (lights on the edges) and the filled star-volume. The
// pixel count is the only knob: points are dealt round-robin across
// the 60 faces, each placed at the centroid of a triangular subdivision cell
// strictly INSIDE its face (never on a shared edge). Emits raw coords; the shared
// normalize pass maps each axis to [0,1], aspect-preserving (the star is
// centrally symmetric, so it stays centred). The preview re-derives each point's
// face normal (starShellNormals) and offers the solidity slider.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var phi = (1 + Math.sqrt(5)) / 2

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
  var minD2 = Infinity
  for (var a = 0; a < 12; a++)
    for (var b = a + 1; b < 12; b++) { var d = dist2(V[a], V[b]); if (d < minD2) minD2 = d }
  var adj = minD2 * 1.1
  var tip = 1.9

  // The 60 stellation triangles: each icosa face gets an apex; three slanted
  // triangles climb to it.
  var tris = []
  for (var a = 0; a < 12; a++)
    for (var b = a + 1; b < 12; b++)
      for (var c = b + 1; c < 12; c++)
        if (dist2(V[a], V[b]) <= adj && dist2(V[a], V[c]) <= adj && dist2(V[b], V[c]) <= adj) {
          var cx = (V[a][0] + V[b][0] + V[c][0]) / 3
          var cy = (V[a][1] + V[b][1] + V[c][1]) / 3
          var cz = (V[a][2] + V[b][2] + V[c][2]) / 3
          var cl = Math.sqrt(cx * cx + cy * cy + cz * cz)
          var apex = [(cx / cl) * tip, (cy / cl) * tip, (cz / cl) * tip]
          tris.push([V[a], V[b], apex], [V[b], V[c], apex], [V[c], V[a], apex])
        }

  // Return at least k distinct, strictly interior barycentric centroids. A
  // rows-way triangular subdivision contains rows^2 small triangles: upward
  // cells first, then downward cells.
  function triangleCells(k) {
    if (k <= 0) return []
    var rows = Math.ceil(Math.sqrt(k))
    var cells = []
    for (var i = 0; i <= rows - 1; i++)
      for (var j = 0; i + j <= rows - 1; j++)
        cells.push([
          (3 * (rows - i - j) - 2) / (3 * rows),
          (3 * i + 1) / (3 * rows),
          (3 * j + 1) / (3 * rows),
        ])
    for (var i2 = 0; i2 <= rows - 2; i2++)
      for (var j2 = 0; i2 + j2 <= rows - 2; j2++)
        cells.push([
          (3 * (rows - i2 - j2) - 4) / (3 * rows),
          (3 * i2 + 2) / (3 * rows),
          (3 * j2 + 2) / (3 * rows),
        ])
    return cells
  }

  var T = tris.length
  var base = Math.floor(n / T)
  var extra = n % T
  var baseCells = triangleCells(base)
  var extraCells = triangleCells(base + 1)
  var coords = []
  for (var i = 0; i < n; i++) {
    var face = i % T
    var t = tris[face]
    var rank = Math.floor(i / T)
    var w = (face < extra ? extraCells : baseCells)[rank]
    coords.push([
      t[0][0] * w[0] + t[1][0] * w[1] + t[2][0] * w[2],
      t[0][1] * w[0] + t[1][1] * w[1] + t[2][1] * w[2],
      t[0][2] * w[0] + t[1][2] * w[1] + t[2][2] * w[2],
    ])
  }
  return coords
}
