// Orrery 3D - a clockwork solar system in brass and light.
//
// A pulsing sun sits at the centre; four planets ride tilted circular orbits
// at Kepler-ish speeds (inner fast, outer slow), two of them carrying moons.
// Each orbit is also drawn as a faint ring - the distance from a point to a
// tilted circle has a cheap closed form - so the whole mechanism reads like a
// desk orrery. Per-planet angles accumulate and wrap individually, so the
// clockwork never hits a seam.

export var speed = 0.5
export var zoom = 0.5
export var rings = 0.5 // Recommended pot: fades the brass orbit rings in and out of the mechanism.
export var color = 0.08 // Recommended pot: re-tints sun, planets, and rings together.

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v) { zoom = v }
export function sliderRings(v) { rings = v }
export function sliderColor(v) { color = v }

var PLANETS = 4
var orbR, tiltS, tiltC, hueOff, size2, theta   // per-planet constants + orbit angle
var bx, by, bz                                  // planet positions this frame
var ringR                                       // scaled orbit radii this frame
var built = 0
var m1x = 0.5, m1y = 0.5, m1z = 0.5             // moon of planet 2
var m2x = 0.5, m2y = 0.5, m2z = 0.5             // moon of planet 3
var mth1 = 0, mth2 = 2.5
var sunClock = 0
var sunPulse = 1
var ringGain = 0.25

function buildSystem() {
  orbR = array(PLANETS)
  tiltS = array(PLANETS)
  tiltC = array(PLANETS)
  hueOff = array(PLANETS)
  size2 = array(PLANETS)
  theta = array(PLANETS)
  bx = array(PLANETS)
  by = array(PLANETS)
  bz = array(PLANETS)
  ringR = array(PLANETS)
  var i = 0
  for (i = 0; i < PLANETS; i++) {
    orbR[i] = 0.13 + i * 0.073
    var tilt = -0.2 + i * 0.14 // each orbit tips out of the plane differently
    tiltS[i] = sin(tilt)
    tiltC[i] = cos(tilt)
    theta[i] = i * 1.7
  }
  hueOff[0] = 0.04
  hueOff[1] = 0.12
  hueOff[2] = 0.48
  hueOff[3] = 0.72
  size2[0] = 0.00035
  size2[1] = 0.0006
  size2[2] = 0.0009
  size2[3] = 0.0007
  built = 1
}

export function beforeRender(delta) {
  if (built == 0) buildSystem()
  var dt = min(delta * 0.001, 0.1)
  var pace = 0.2 + speed * 1.4
  var scale = 0.75 + zoom * 0.6

  var i = 0
  for (i = 0; i < PLANETS; i++) {
    // Kepler-ish: angular speed falls off with radius^1.5.
    theta[i] = mod(theta[i] + dt * pace * 0.11 / pow(orbR[i], 1.5), PI2)
    var cr = orbR[i] * scale
    ringR[i] = cr
    bx[i] = 0.5 + cr * cos(theta[i])
    var inPlane = cr * sin(theta[i])
    by[i] = 0.5 + inPlane * tiltS[i]
    bz[i] = 0.5 + inPlane * tiltC[i]
  }

  mth1 = mod(mth1 + dt * pace * 3.1, PI2)
  mth2 = mod(mth2 + dt * pace * 2.3, PI2)
  m1x = bx[2] + 0.05 * cos(mth1)
  m1y = by[2] + 0.02 * sin(mth1)
  m1z = bz[2] + 0.045 * sin(mth1)
  m2x = bx[3] + 0.06 * cos(mth2)
  m2y = by[3] + 0.055 * sin(mth2)
  m2z = bz[3] + 0.025 * sin(mth2)

  sunClock = mod(sunClock + dt * 0.3, 1)
  sunPulse = 0.88 + 0.12 * wave(sunClock)
  ringGain = rings * 0.5
}

export function render3D(index, x, y, z) {
  var dx = x - 0.5
  var dy = y - 0.5
  var dz = z - 0.5

  // Sun: the brightest body and the fallback hue.
  var v = 0.0022 * sunPulse / (dx * dx + dy * dy + dz * dz + 0.0016)
  var best = v
  var hue = color + 0.02

  var i = 0
  for (i = 0; i < PLANETS; i++) {
    // Ring: distance from this point to the tilted orbit circle.
    var p2 = dy * tiltS[i] + dz * tiltC[i]
    var h = dy * tiltC[i] - dz * tiltS[i]
    var ring = clamp(1 - hypot(hypot(dx, p2) - ringR[i], h) / 0.02, 0, 1)
    v += ring * ring * ringGain

    var pdx = x - bx[i]
    var pdy = y - by[i]
    var pdz = z - bz[i]
    var w = size2[i] / (pdx * pdx + pdy * pdy + pdz * pdz + 0.0007)
    v += w
    if (w > best) {
      best = w
      hue = color + hueOff[i]
    }
  }

  // Moons: small pale glints (value only, so they read as grey-white).
  var mdx = x - m1x
  var mdy = y - m1y
  var mdz = z - m1z
  v += 0.00012 / (mdx * mdx + mdy * mdy + mdz * mdz + 0.0004)
  mdx = x - m2x
  mdy = y - m2y
  mdz = z - m2z
  v += 0.00012 / (mdx * mdx + mdy * mdy + mdz * mdz + 0.0004)

  var sat = 0.85 - clamp(v - 1, 0, 1) * 0.6
  hsv(frac(hue + 1), sat, clamp(v + 0.003, 0, 1))
}
