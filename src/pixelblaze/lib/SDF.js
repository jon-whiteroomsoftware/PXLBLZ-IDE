// Signed distance from a circle of radius r centered at origin
function circle(x, y, r) {
  return sqrt(x * x + y * y) - r
}

// Signed distance from an axis-aligned rectangle of half-extents (hw, hh) centered at origin
function rect(x, y, hw, hh) {
  var qx = abs(x) - hw
  var qy = abs(y) - hh
  return sqrt(max(qx, 0) * max(qx, 0) + max(qy, 0) * max(qy, 0)) + min(max(qx, qy), 0)
}

// Signed distance from a line segment from (ax, ay) to (bx, by)
function segment(px, py, ax, ay, bx, by) {
  var ex = bx - ax, ey = by - ay
  var wx = px - ax, wy = py - ay
  var t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
  var dx = wx - ex * t, dy = wy - ey * t
  return sqrt(dx * dx + dy * dy)
}

// Boolean union (inside either shape)
function union(a, b) {
  return min(a, b)
}

// Boolean intersection (inside both shapes)
function intersect(a, b) {
  return max(a, b)
}

// Boolean subtraction (A minus B)
function subtract(a, b) {
  return max(a, -b)
}

// Smooth union with blending radius k
function smoothUnion(a, b, k) {
  var h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1)
  return b + (a - b) * h - k * h * (1 - h)
}
