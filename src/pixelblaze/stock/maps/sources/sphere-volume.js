// Example 3D solid sphere (volume) — points fill the interior of the ball, not
// just its surface. Fibonacci-lattice directions give an irregular,
// evenly-spread angular order; the radius grows as cbrt(u) so points are evenly
// distributed by VOLUME (equal-volume shells get equal counts) instead of
// clustering at the centre or the rim. The radius fraction u comes from a
// van der Corput radical-inverse rather than the linear index, so radius and
// direction stay decorrelated — otherwise the +y pole (small i) would pair with
// small radii and skew the ball lopsided. Emits raw [-1,1] coords; the shared
// normalize pass maps each axis to [0,1]. A volume map carries no per-point
// boundary normal, so it is not solid-eligible.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var golden = Math.PI * (3 - Math.sqrt(5))
  var coords = []
  for (var i = 0; i < n; i++) {
    var y = n > 1 ? 1 - ((i + 0.5) / n) * 2 : 0
    var ringR = Math.sqrt(Math.max(0, 1 - y * y))
    var a = golden * i
    // van der Corput base-2 radical inverse of (i+1): bit-reversed fraction in
    // (0,1), low-discrepancy and uncorrelated with the linear index i.
    var u = 0, denom = 0.5, k = i + 1
    while (k > 0) { u += (k % 2) * denom; denom *= 0.5; k = Math.floor(k / 2) }
    // Even-by-volume radius so the interior fills rather than the points piling
    // on the shell.
    var r = Math.cbrt(u)
    coords.push([Math.cos(a) * ringR * r, y * r, Math.sin(a) * ringR * r])
  }
  return coords
}
