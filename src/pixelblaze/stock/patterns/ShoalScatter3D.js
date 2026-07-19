// Pattern: Shoal Scatter 3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// A schooling shoal shatters around a patrolling hunter and slowly gathers again.
// Runs on: 3D maps; designed for volumes and shells.
// Controls: Speed — How fast the shoal cruises and the hunter patrols;
//           Fear — How far panic spreads and how hard the shoal shatters;
//           Schooling — How strongly the fish hold together between scares;
//           Color — Water and fish colour; the hunter glows in a contrasting tone.
//
// Notes:
// Ten fish school through the volume with weak cohesion and alignment while a
// hunter cruises a slow patrol loop, periodically surging. Any fish inside the
// flee radius panics: it flashes toward silver-white, gets a burst of speed,
// and the shoal shatters - then the same schooling urges quietly knit it back
// together. All behaviour is O(fish^2) once per frame; each LED sums eleven
// soft glows through dim blue water.

export var speed = 0.42
export var fear = 0.55 // Recommended pot: how far panic spreads and how hard the shoal shatters.
export var schooling = 0.5
export var color = 0.58

export function sliderSpeed(v) { speed = v }
export function sliderFear(v) { fear = v }
export function sliderSchooling(v) { schooling = v }
export function sliderColor(v) { color = v }

var FISH = 10
var fpx, fpy, fpz    // fish positions
var fvx, fvy, fvz    // fish velocities
var fright           // per-fish panic level, 0..1
var built = 0
var hx = 0.1, hy = 0.1, hz = 0.1   // hunter position
var hp1 = 0, hp2 = 2.1, hp3 = 4.2  // hunter path phases, wrapped independently
export var t = 0

function buildShoal() {
  fpx = array(FISH)
  fpy = array(FISH)
  fpz = array(FISH)
  fvx = array(FISH)
  fvy = array(FISH)
  fvz = array(FISH)
  fright = array(FISH)
  var i = 0
  for (i = 0; i < FISH; i++) {
    fpx[i] = 0.4 + random(0.2)
    fpy[i] = 0.4 + random(0.2)
    fpz[i] = 0.4 + random(0.2)
    fvx[i] = random(0.2) - 0.1
    fvy[i] = random(0.2) - 0.1
    fvz[i] = random(0.2) - 0.1
    fright[i] = 0
  }
  built = 1
}

export function beforeRender(delta) {
  if (built == 0) buildShoal()
  var dt = min(delta * 0.001, 0.05)
  t = mod(t + dt, 64)
  var pace = 0.3 + speed * 1.3

  // The hunter cruises a smooth 3D loop, with an occasional surge of speed.
  var burst = pow(wave(t * 0.07), 6)
  var hrate = dt * pace * (0.16 + burst * 1.2)
  hp1 = mod(hp1 + hrate, PI2)
  hp2 = mod(hp2 + hrate * 0.77, PI2)
  hp3 = mod(hp3 + hrate * 0.61, PI2)
  hx = 0.5 + 0.34 * sin(hp1)
  hy = 0.5 + 0.26 * sin(hp2)
  hz = 0.5 + 0.34 * sin(hp3)

  var cx = 0, cy = 0, cz = 0, mvx = 0, mvy = 0, mvz = 0
  var i = 0
  for (i = 0; i < FISH; i++) {
    cx += fpx[i]
    cy += fpy[i]
    cz += fpz[i]
    mvx += fvx[i]
    mvy += fvy[i]
    mvz += fvz[i]
  }
  cx = cx / FISH
  cy = cy / FISH
  cz = cz / FISH
  mvx = mvx / FISH
  mvy = mvy / FISH
  mvz = mvz / FISH

  var coh = 0.35 + schooling * 1.6
  var align = 0.8 + schooling * 1.4
  var fleeR = 0.14 + fear * 0.2
  var fleeR2 = fleeR * fleeR

  for (i = 0; i < FISH; i++) {
    var accX = (cx - fpx[i]) * coh + (mvx - fvx[i]) * align
    var accY = (cy - fpy[i]) * coh + (mvy - fvy[i]) * align
    var accZ = (cz - fpz[i]) * coh + (mvz - fvz[i]) * align

    var j = 0
    for (j = 0; j < FISH; j++) {
      if (j != i) {
        var sdx = fpx[i] - fpx[j]
        var sdy = fpy[i] - fpy[j]
        var sdz = fpz[i] - fpz[j]
        var sd2 = sdx * sdx + sdy * sdy + sdz * sdz
        if (sd2 < 0.004) {
          var push = 1.2 / (sd2 * 60 + 0.06)
          accX += sdx * push
          accY += sdy * push
          accZ += sdz * push
        }
      }
    }

    // Flee the hunter; panic spikes fast and decays slowly.
    var dxh = fpx[i] - hx
    var dyh = fpy[i] - hy
    var dzh = fpz[i] - hz
    var dh2 = dxh * dxh + dyh * dyh + dzh * dzh
    if (dh2 < fleeR2) {
      var panic = (0.8 + fear * 2.6) * (1 - dh2 / fleeR2)
      accX += dxh * panic * 9
      accY += dyh * panic * 9
      accZ += dzh * panic * 9
      fright[i] = min(fright[i] + dt * 6, 1)
    } else {
      fright[i] = max(fright[i] - dt * 0.9, 0)
    }

    // Stay in the tank: pull back toward centre past a soft boundary.
    var dxc = fpx[i] - 0.5
    var dyc = fpy[i] - 0.5
    var dzc = fpz[i] - 0.5
    var rc = hypot3(dxc, dyc, dzc)
    if (rc > 0.36) {
      var wall = (rc - 0.36) * 8 / rc
      accX -= dxc * wall
      accY -= dyc * wall
      accZ -= dzc * wall
    }

    fvx[i] += accX * dt
    fvy[i] += accY * dt
    fvz[i] += accZ * dt

    // Frightened fish get a burst of speed before settling back to cruise.
    var vmax = 0.35 + fright[i] * 0.5
    var spd = hypot3(fvx[i], fvy[i], fvz[i])
    if (spd > vmax) {
      var trim = vmax / spd
      fvx[i] = fvx[i] * trim
      fvy[i] = fvy[i] * trim
      fvz[i] = fvz[i] * trim
    }

    fpx[i] += fvx[i] * dt * pace * 1.6
    fpy[i] += fvy[i] * dt * pace * 1.6
    fpz[i] += fvz[i] * dt * pace * 1.6
  }
}

export function render3D(index, x, y, z) {
  var v = 0.012 // dim open water
  var wf = 0
  var wfr = 0
  var i = 0
  for (i = 0; i < FISH; i++) {
    var dx = x - fpx[i]
    var dy = y - fpy[i]
    var dz = z - fpz[i]
    var w = 0.0016 / (dx * dx + dy * dy + dz * dz + 0.0012)
    wf += w
    wfr += w * fright[i]
  }
  var dxh = x - hx
  var dyh = y - hy
  var dzh = z - hz
  var wh = 0.006 / (dxh * dxh + dyh * dyh + dzh * dzh + 0.004)

  v += wf + wh * 0.55
  var fearMix = wfr / max(wf, 0.01)

  // The hunter reads as its own warmer glow; calm fish carry the water hue,
  // panicked fish flash desaturated silver.
  var hue = wh * 1.2 > wf ? color + 0.47 : color + 0.02 - fearMix * 0.04
  var sat = wh * 1.2 > wf ? 0.8 : 0.85 - fearMix * 0.7
  hsv(frac(hue + 1), sat, clamp(v, 0, 1))
}
