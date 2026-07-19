// Pattern: Scene Splice 3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Two volumetric scenes trade places through a sweeping plane and a growing gyroid cut.
// Runs on: 3D maps; designed for volumes and shells.
// Controls: Speed — How quickly the volume cycles between its two cuts;
//           Scrub — Drags the slicing plane and gyroid growth back and forth by hand;
//           Color — Re-tints both scenes and the cutting-edge glow together;
//           Feather — Thickness of the glowing frontier where the scenes blend.
//
// Notes:
// Two volumetric scenes trade places through two different 3D cuts: a
// slicing plane sweeps the volume one way, then the return trip grows back
// through a gyroid lattice. Each cut is a cheap signed field evaluated before
// any scene runs, so outside the feather band every pixel renders exactly one
// scene; only pixels inside the band evaluate both sides. The reel clock and
// the scene clock are separate, so scrubbing the cuts never freezes the
// scenes themselves.

export var speed = 0.4
export var scrub = 0 // Recommended pot: scrubs back and forth through both cuts by hand.
export var color = 0.02 // Recommended pot: re-tints both scenes and the cut accents together.
export var feather = 0.45

export function sliderSpeed(v) { speed = v }
export function sliderScrub(v) { scrub = v }
export function sliderColor(v) { color = v }
export function sliderFeather(v) { feather = v }

export var t = 0
var ts = 0
export var seg = 0
var p = 0
var cutActive = 0
var edge = 0.06
var nx = 0.82, ny = 0.57, nz = 0
var planeF = -1
var gyroTh = 1.6
var GY = 9.42 // ~1.5 gyroid cells across the unit volume

export function beforeRender(delta) {
  var dt = delta * 0.001
  t = t + dt * (0.015 + speed * 0.08)
  ts = ts + dt * (0.25 + speed * 0.65)

  var s = frac(t + scrub) * 2
  seg = floor(s)
  // Hold each scene, cut through the middle of the segment, land before the
  // boundary.
  p = smoothstep(0.22, 0.88, frac(s))
  cutActive = (p > 0 && p < 1) ? 1 : 0
  edge = 0.03 + feather * 0.14

  // The slicing plane's normal precesses around the vertical between passes.
  // (0.82, 0.57) keeps it unit length without a per-frame normalize.
  var a = t * 6.4
  nx = cos(a) * 0.82
  ny = 0.57
  nz = sin(a) * 0.82
  planeF = (p * 2 - 1) * 1.0
  gyroTh = 1.6 - p * 3.2
}

// Scenes write into these three globals - the dialect has no tuple returns.
var sceneH = 0, sceneS = 1, sceneV = 0

function sceneColor(kind, x, y, z) {
  if (kind == 0) {
    // Ember currents: warm convective sheets rolling upward.
    var w = wave(y * 1.3 + sin(x * 3.1 + ts * 0.55) * 0.22 + cos(z * 2.7 - ts * 0.45) * 0.22 - ts * 0.35)
    sceneH = frac(color + 0.01 + w * 0.07)
    sceneS = 0.95
    sceneV = 0.07 + 0.93 * w * w
  } else {
    // Glacier lattice: cool glowing struts on a repeating grid. Distance to
    // the nearest strut is hypot of the two smallest axis distances.
    var lx = abs(frac(clamp(x, 0, 1) * 2.5 + 0.25) - 0.5)
    var ly = abs(frac(clamp(y, 0, 1) * 2.5 + 0.25) - 0.5)
    var lz = abs(frac(clamp(z, 0, 1) * 2.5 + 0.25) - 0.5)
    var lo = min(lx, min(ly, lz))
    var hi = max(lx, max(ly, lz))
    var mid = lx + ly + lz - lo - hi
    var glow = clamp(1 - hypot(lo, mid) * 3.4, 0, 1)
    var pulse = 0.6 + 0.4 * wave(ts * 0.5 + (x + y + z) * 0.3)
    sceneH = frac(color + 0.55 + lo * 0.20)
    sceneS = 0.80
    sceneV = 0.04 + glow * glow * pulse
  }
}

export function render3D(index, x, y, z) {
  if (cutActive == 0) {
    // Held frame: exactly one scene, no cut math at all.
    sceneColor(p == 0 ? seg : 1 - seg, x, y, z)
  } else {
    var m = 0
    var accent = 0
    if (seg == 0) {
      // Slicing plane: signed distance along the precessing normal.
      var d = (x - 0.5) * nx + (y - 0.5) * ny + (z - 0.5) * nz - planeF
      m = clamp(0.5 - d / edge, 0, 1)
      accent = clamp(1 - abs(d) / edge, 0, 1)
    } else {
      // Gyroid growth: the return scene floods along gyroid surfaces as the
      // threshold falls through the field's range.
      var gx = x * GY + ts * 0.35
      var gy = y * GY
      var gz = z * GY - ts * 0.3
      var g = sin(gx) * cos(gy) + sin(gy) * cos(gz) + sin(gz) * cos(gx)
      var eg = edge * 2.2
      m = clamp(0.5 + (g - gyroTh) / eg, 0, 1)
      accent = clamp(1 - abs(g - gyroTh) / eg, 0, 1)
    }
    if (m <= 0) {
      sceneColor(seg, x, y, z)
    } else if (m >= 1) {
      sceneColor(1 - seg, x, y, z)
    } else {
      // Feather band only: both scenes run and blend.
      sceneColor(seg, x, y, z)
      var h0 = sceneH, s0 = sceneS, v0 = sceneV
      sceneColor(1 - seg, x, y, z)
      if (m < 0.5) sceneH = h0
      sceneS = mix(s0, sceneS, m)
      sceneV = mix(v0, sceneV, m)
    }
    accent = accent * accent
    if (accent > 0) {
      // The cutting frontier runs hot and nearly white.
      sceneV = max(sceneV, accent)
      sceneS = mix(sceneS, 0.20, accent)
    }
  }
  hsv(sceneH, sceneS, clamp(sceneV, 0, 1))
}
