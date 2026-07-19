// Pattern: Scene Splice
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Five miniature scenes trade places through five distinct signed-distance transitions.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Speed — How quickly the showreel advances from cut to cut;
//           Scrub — Drags the whole reel by hand through every scene and transition;
//           Color — Re-tints all five scenes and their transition accents together;
//           Feather — Width of the soft band where one scene blends into the next.
//
// Notes:
// Five mini-scenes are cut together by five different transition masks:
// expanding portal, rotating star iris, comet slash, cellular
// crystallization, and a concentric shockwave. Each cut is a cheap signed
// field evaluated before any scene runs, so outside the feather band every
// pixel renders exactly one scene; only pixels inside the band evaluate both
// sides of the cut. The reel clock and the scene clock are separate, so
// scrubbing the reel never freezes the scenes themselves.

export var speed = 0.4
export var scrub = 0 // Recommended pot: scrubs the whole reel through every scene and cut by hand.
export var color = 0.62 // Recommended pot: re-tints all five scenes and their cut accents together.
export var feather = 0.4

export function sliderSpeed(v) { speed = v }
export function sliderScrub(v) { scrub = v }
export function sliderColor(v) { color = v }
export function sliderFeather(v) { feather = v }

export var t = 0
var ts = 0
export var seg = 0
var nextSeg = 1
var p = 0
var cutActive = 0
var edge = 0.06
var rotC = 1, rotS = 0
var portalR = 0
var starR = 0.001
var slashF = 0
var waveR = 0

export function beforeRender(delta) {
  var dt = delta * 0.001
  t = t + dt * (0.02 + speed * 0.10)
  ts = ts + dt * (0.25 + speed * 0.65)

  var s = frac(t + scrub) * 5
  seg = floor(s)
  nextSeg = mod(seg + 1, 5)
  // Hold the scene for the first ~third of each segment, cut through the
  // middle, land fully on the next scene before the segment boundary.
  p = smoothstep(0.30, 0.86, frac(s))
  cutActive = (p > 0 && p < 1) ? 1 : 0
  edge = 0.025 + feather * 0.10

  var angle = t * 5.3
  rotC = cos(angle)
  rotS = sin(angle)
  portalR = p * 0.78
  starR = max(p * 0.95, 0.001)
  slashF = p * (1 + edge * 2) - edge
  waveR = p * 0.80
}

// Signed cut field for the active transition: negative side is the incoming
// scene. Also leaves the rim-accent strength in `accent`.
var accent = 0
function cutField(x, y) {
  if (seg == 0) {
    // Expanding portal: a circular opening grows from the centre.
    return hypot(x - 0.5, y - 0.5) - portalR
  }
  if (seg == 1) {
    // Rotating star iris: a five-point opening turns as it dilates.
    var px = x - 0.5, py = y - 0.5
    var qx = px * rotC - py * rotS + 0.5
    var qy = px * rotS + py * rotC + 0.5
    return SDF.star(qx, qy, 0.5, 0.5, starR, 5, 0.55)
  }
  if (seg == 2) {
    // Comet slash: a hot diagonal edge sweeps corner to corner.
    return (x + y) * 0.5 - slashF
  }
  if (seg == 3) {
    // Cellular crystallization: each grid cell grows the new scene from its
    // own centre once the front passes its threshold.
    var cx = clamp(x, 0, 0.999)
    var cy = clamp(y, 0, 0.999)
    var th = frac((floor(cx * 6) + floor(cy * 6) * 6 + 1) * 0.618034) * 0.55
    var lx = abs(frac(cx * 6) - 0.5)
    var ly = abs(frac(cy * 6) - 0.5)
    return max(lx, ly) - (p - th) * 2.2
  }
  // Concentric shockwave: everything behind the expanding ring is new.
  return hypot(x - 0.5, y - 0.5) - waveR
}

// Scenes write into these three globals - the dialect has no tuple returns.
var sceneH = 0, sceneS = 1, sceneV = 0

function sceneColor(kind, x, y) {
  if (kind == 0) {
    // Ember drift: warm diagonal weave.
    var w = wave((x + y) * 1.6 - ts * 0.55)
    sceneH = frac(color + 0.02 + w * 0.06)
    sceneS = 0.95
    sceneV = 0.10 + 0.90 * w * w
  } else if (kind == 1) {
    // Tide pool: cool rings breathing out from the centre.
    var r = hypot(x - 0.5, y - 0.5)
    var w = wave(r * 2.4 - ts * 0.45)
    sceneH = frac(color + 0.52 + r * 0.12)
    sceneS = 0.85
    sceneV = 0.08 + 0.92 * w * w
  } else if (kind == 2) {
    // Signal grid: a lattice of softly pulsing dots.
    var lx = frac(clamp(x, 0, 1) * 5) - 0.5
    var ly = frac(clamp(y, 0, 1) * 5) - 0.5
    var dot = clamp(1 - hypot(lx, ly) * 3.2, 0, 1)
    var pulse = wave(ts * 0.9 + (x + y) * 0.8)
    sceneH = frac(color + 0.30)
    sceneS = 0.80
    sceneV = 0.05 + dot * dot * (0.40 + 0.60 * pulse)
  } else if (kind == 3) {
    // Aurora veil: slow curtains washing sideways.
    var w = wave(y * 1.4 + sin(x * 4.2 + ts * 0.6) * 0.24 - ts * 0.4)
    sceneH = frac(color + 0.38 + w * 0.09)
    sceneS = 0.90
    sceneV = 0.08 + 0.92 * w * w
  } else {
    // Voltage weave: crossing interference sheets.
    var w = wave(x * 2.1 + ts * 0.65) * wave(y * 2.3 - ts * 0.55)
    sceneH = frac(color + 0.78 + w * 0.08)
    sceneS = 0.92
    sceneV = 0.06 + 0.94 * w
  }
}

export function render2D(index, x, y) {
  if (cutActive == 0) {
    // Held frame: exactly one scene, no cut math at all.
    sceneColor(p == 0 ? seg : nextSeg, x, y)
  } else {
    var d = cutField(x, y)
    var m = clamp(0.5 - d / edge, 0, 1)
    if (m <= 0) {
      sceneColor(seg, x, y)
    } else if (m >= 1) {
      sceneColor(nextSeg, x, y)
    } else {
      // Feather band only: both scenes run and blend.
      sceneColor(seg, x, y)
      var h0 = sceneH, s0 = sceneS, v0 = sceneV
      sceneColor(nextSeg, x, y)
      if (m < 0.5) sceneH = h0
      sceneS = mix(s0, sceneS, m)
      sceneV = mix(v0, sceneV, m)
    }
    accent = clamp(1 - abs(d) / edge, 0, 1)
    accent = accent * accent
    if (accent > 0) {
      // The cut edge itself runs hot and nearly white.
      sceneV = max(sceneV, accent)
      sceneS = mix(sceneS, 0.20, accent)
    }
  }
  hsv(sceneH, sceneS, clamp(sceneV, 0, 1))
}
