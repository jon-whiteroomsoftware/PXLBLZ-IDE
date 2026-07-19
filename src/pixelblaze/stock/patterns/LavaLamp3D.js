// Pattern: Lava Lamp 3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// Heated metaballs rise, merge, cool, and sink in a continuous thermal loop.
// Runs on: 3D maps; designed for volumes and shells.
// Controls: Speed — Pace of the thermal loop — how quickly blobs heat, rise, cool, and sink;
//           Goo — Blob size and stickiness — high melts everything into one slumping mass;
//           Color — Wax colour, swept around the colour wheel;
//           Glow — Strength of the lamp light at the base and the rim light on the goo.
//
// Notes:
// Six blobs carry persistent heat and vertical velocity: they warm over the
// lamp base, gain buoyancy and rise, cool near the top, and sink back down.
// Each LED sums six inverse-square contributions, so the goo merges and
// pinches apart exactly like metaballs. The heavy state (thermal exchange,
// drift orbits, radii) is all solved once per frame.

export var speed = 0.4
export var goo = 0.55 // Recommended pot: melts the blobs from tight droplets into one slumping mass.
export var color = 0.98 // Recommended pot: moves the wax through crimson, gold, jade, and violet.
export var glow = 0.45

export function sliderSpeed(v) { speed = v }
export function sliderGoo(v) { goo = v }
export function sliderColor(v) { color = v }
export function sliderGlow(v) { glow = v }

var BLOBS = 6
var bx, by, bz     // blob centres
var vy             // vertical velocity
var warm           // per-blob heat, 0..1: drives buoyancy and hue
var seed           // per-blob random, decorrelates the drift orbits
var rad2           // per-blob radius squared, precomputed each frame
var built = 0
var soft = 0.3
export var t = 0

function buildBlobs() {
  bx = array(BLOBS)
  by = array(BLOBS)
  bz = array(BLOBS)
  vy = array(BLOBS)
  warm = array(BLOBS)
  seed = array(BLOBS)
  rad2 = array(BLOBS)
  var i = 0
  for (i = 0; i < BLOBS; i++) {
    by[i] = 0.15 + i * 0.13       // stagger the opening frame up the lamp
    vy[i] = 0
    warm[i] = 1 - i * 0.14        // low blobs start hot, high blobs cool
    seed[i] = random(1)
    bx[i] = 0.5
    bz[i] = 0.5
  }
  built = 1
}

export function beforeRender(delta) {
  if (built == 0) buildBlobs()
  var dt = min(delta * 0.001, 0.1)
  t = mod(t + dt, 256)
  var pace = 0.35 + speed * 1.6

  var i = 0
  for (i = 0; i < BLOBS; i++) {
    // Thermal exchange: the base heats, everywhere else slowly radiates.
    if (by[i] < 0.2) warm[i] += (1 - warm[i]) * dt * pace * 0.9
    else warm[i] -= warm[i] * dt * pace * 0.26

    // Buoyancy against a height-graded ambient; light damping keeps the
    // loop languid instead of bouncy.
    vy[i] += (warm[i] - 0.42 - by[i] * 0.12) * dt * pace * 0.55
    vy[i] *= 1 - dt * 1.2
    by[i] += vy[i] * dt * pace * 2.2

    // Soft floor and ceiling: settle, don't bounce.
    if (by[i] < 0.1) { by[i] = 0.1; vy[i] = abs(vy[i]) * 0.2 }
    if (by[i] > 0.9) { by[i] = 0.9; vy[i] = -abs(vy[i]) * 0.2 }

    // Slow lateral drift on decorrelated orbits.
    bx[i] = 0.5 + 0.2 * sin(t * (0.1 + seed[i] * 0.08) * pace + seed[i] * 6.2)
    bz[i] = 0.5 + 0.2 * cos(t * (0.08 + seed[i] * 0.07) * pace + seed[i] * 4.4)

    var r = 0.13 + goo * 0.09 + warm[i] * 0.04 + 0.02 * wave(t * 0.3 + seed[i])
    rad2[i] = r * r
  }

  soft = 0.18 + (1 - goo) * 0.22
}

export function render3D(index, x, y, z) {
  var field = 0
  var warmSum = 0
  var i = 0
  for (i = 0; i < BLOBS; i++) {
    var dx = x - bx[i]
    var dy = y - by[i]
    var dz = z - bz[i]
    var w = rad2[i] / (dx * dx + dy * dy + dz * dz + 0.004)
    field += w
    warmSum += w * warm[i]
  }
  var heatMix = warmSum / max(field, 0.01)

  // Goo body, a rim where the field crosses the metaball threshold, and warm
  // lamp light pooling at the base of the volume.
  var fill = smoothstep(1 - soft, 1 + soft, field)
  var rim = clamp(1 - abs(field - 1) / soft, 0, 1)
  var lamp = clamp(1 - y * 2.2, 0, 1)
  var v = fill * (0.28 + heatMix * 0.72) + rim * rim * glow * 0.5 + lamp * lamp * glow * 0.3 + 0.004

  var hue = color + 0.02 + heatMix * 0.12
  var sat = clamp(0.98 - fill * heatMix * 0.35, 0, 1)
  hsv(frac(hue), sat, clamp(v, 0, 1))
}
