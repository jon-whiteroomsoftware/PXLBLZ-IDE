// Harmonograph - a pendulum-driven pen forever starting a new drawing.
//
// Two damped sinusoids per axis (integer frequencies plus a quieter partner)
// trace a Lissajous weave. The visible ink is a short snake of samples along
// the curve, prepared once per frame; each LED measures distance to those
// samples. The whole figure slowly rotates for precession, the amplitude
// decays as the drawing ages, and every ~20s the pen picks fresh frequency
// ratios and starts a new figure. Integer frequencies let the pen parameter
// wrap at 2*pi with no seam.

export var speed = 0.45
export var complexity = 0.45 // Recommended pot: richer frequency ratios for each new figure.
export var ink = 0.55 // Recommended pot: length and weight of the ink trail.
export var color = 0.12

export function sliderSpeed(v) { speed = v }
export function sliderComplexity(v) { complexity = v }
export function sliderInk(v) { ink = v }
export function sliderColor(v) { color = v }

var SAMPLES = 26
var sx, sy, wgt        // per-sample pen positions and fade weights
var built = 0
var penU = 0           // pen parameter, wraps at 2*pi
var drawT = 0          // age of the current drawing, seconds
var figLen = 20
var fa = 3, fb = 2, fc = 5, fd = 4   // integer harmonograph frequencies
var pha = 0, phb = 1.2, phc = 2.4, phd = 3.6
var rot = 0
var inkR2 = 0.0006

function newFigure() {
  fa = 1 + floor(random(2 + complexity * 4))
  fb = 1 + floor(random(2 + complexity * 4))
  if (fb == fa) fb = fa + 1
  fc = fa + 1 + floor(random(2)) // near-miss partners make the weave, not a plain ellipse
  fd = fb + 1 + floor(random(2))
  pha = random(PI2)
  phb = random(PI2)
  phc = random(PI2)
  phd = random(PI2)
  figLen = 14 + random(10)
  drawT = 0
}

export function beforeRender(delta) {
  if (built == 0) {
    sx = array(SAMPLES)
    sy = array(SAMPLES)
    wgt = array(SAMPLES)
    newFigure()
    drawT = 2.5 // open mid-drawing so there is ink on screen immediately
    built = 1
  }
  var dt = delta * 0.001
  drawT += dt
  if (drawT > figLen) newFigure()

  penU = mod(penU + dt * (0.5 + speed * 1.6), PI2)
  rot = mod(rot + dt * 0.05, PI2)
  var rotC = cos(rot)
  var rotS = sin(rot)

  // Fade in fast at the start of a figure and out over its last 1.5s.
  var fade = min(drawT * 2.5, 1)
  if (drawT > figLen - 1.5) fade = fade * (figLen - drawT) / 1.5
  var amp = 0.34 / (1 + drawT * 0.09) // the drawing shrinks as its pendulums damp

  var step = 0.03 + ink * 0.05
  var k = 0
  for (k = 0; k < SAMPLES; k++) {
    var u = penU - k * step
    var px = amp * (0.62 * sin(fa * u + pha) + 0.38 * sin(fc * u + phc))
    var py = amp * (0.62 * sin(fb * u + phb) + 0.38 * sin(fd * u + phd))
    sx[k] = 0.5 + px * rotC - py * rotS
    sy[k] = 0.5 + px * rotS + py * rotC
    var recency = 1 - k / SAMPLES
    wgt[k] = recency * recency * fade
  }
  inkR2 = 0.00035 + ink * 0.0006
}

export function render2D(index, x, y) {
  var v = 0.003
  var posW = 0
  var wSum = 0
  var k = 0
  for (k = 0; k < SAMPLES; k++) {
    var dx = x - sx[k]
    var dy = y - sy[k]
    var w = inkR2 / (dx * dx + dy * dy + 0.0005) * wgt[k]
    v += w
    posW += w * k
    wSum += w
  }
  // Hue drifts along the trail (fresh ink vs settling ink) and slowly with age.
  var trailPos = posW / max(wSum, 0.01) / SAMPLES
  var hue = color + trailPos * 0.14 + drawT * 0.004
  var sat = 0.88 - clamp(v - 1, 0, 1) * 0.55
  hsv(frac(hue + 1), sat, clamp(v, 0, 1))
}
