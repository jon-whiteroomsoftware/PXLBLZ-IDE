// Pattern: Mandelbulb Heartbeat
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// A short Mandelbulb orbit turns mapped LED coordinates into a pulsing fractal organism.
// Runs on: 3D maps; designed for volumes and shells.
// Controls: Speed — How fast the fractal rotates and its heartbeat pulses;
//           Power — Fractal power — continuously reshapes the lobes into spikes and petals;
//           Color — Base colour of the fractal palette;
//           Detail — Extra fractal iterations — finer branching at the cost of frame rate.
//
// Notes:
// A screen shader would raymarch toward this field. Pixelblaze already gives us
// each LED's physical (x,y,z), so every LED evaluates one short Mandelbulb orbit
// instead. The conservative default keeps the expensive pow/trig loop to four
// passes; Detail can trade frame rate for finer branching on smaller sculptures.

export var speed = 0.31
export var power = 0.34 // Recommended pot: continuously reshapes lobes into spikes and petals.
export var color = 0.58 // Recommended pot: travels through the full fractal palette.
export var detail = 0.18

export function sliderSpeed(v) { speed = v }
export function sliderPower(v) { power = v }
export function sliderColor(v) { color = v }
export function sliderDetail(v) { detail = v }

export var t = 0
var bulbPower = 4
var iterations = 4
var rotC = 1, rotS = 0
var heartbeat = 1

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 0.8)
  bulbPower = 2 + power * 6
  iterations = floor(3 + detail * 4)
  rotC = cos(t * 0.31)
  rotS = sin(t * 0.31)

  var beat = wave(t * 0.72)
  heartbeat = 0.88 + 0.16 * beat * beat
}

export function render3D(index, x, y, z) {
  // Centre, scale, and rotate the sampled sculpture. Rotation terms are
  // frame-global and therefore precomputed in beforeRender.
  var ox = (x - 0.5) * 2.45 / heartbeat
  var oy = (y - 0.5) * 2.45 / heartbeat
  var oz = (z - 0.5) * 2.45 / heartbeat
  var rx = ox * rotC - oz * rotS
  var rz = ox * rotS + oz * rotC
  ox = rx
  oz = rz

  var px = ox, py = oy, pz = oz
  var radius = 0
  var trap = 4
  var escaped = 0
  var i = 0

  for (i = 0; i < iterations && escaped == 0; i = i + 1) {
    radius = hypot3(px, py, pz)
    trap = min(trap, radius)
    if (radius > 2) {
      escaped = 1
    } else {
      var theta = atan2(hypot(px, py), pz)
      var phi = atan2(py, px)
      var raised = pow(max(radius, 0.002), bulbPower)
      var polar = theta * bulbPower
      var azimuth = phi * bulbPower
      var ring = raised * sin(polar)
      px = ring * cos(azimuth) + ox
      py = ring * sin(azimuth) + oy
      pz = raised * cos(polar) + oz
    }
  }

  var layer = i / iterations
  // Light narrow orbit/escape shells rather than filling the whole volume. The
  // sparse field is what lets the lobed geometry read through a physical cloud.
  var orbitGlow = clamp(1 - abs(trap - 0.34) / 0.16, 0, 1)
  var escapeEdge = clamp(1 - abs(radius - 2) * 0.48, 0, 1)
  var value = escaped
    ? 0.006 + escapeEdge * (0.48 + 0.52 * (1 - layer))
    : 0.008 + orbitGlow * 0.96
  value = clamp(value * (0.82 + 0.18 * heartbeat), 0, 1)

  hsv(frac(color + layer * 0.58 + trap * 0.42 + t * 0.018), 0.90, value)
}
