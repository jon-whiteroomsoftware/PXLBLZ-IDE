// Murmuration - a small flock deciding where to go, together.
//
// Up to sixteen boids obey three local urges - pull toward the flock, match
// your neighbours' heading, keep your distance - plus a slowly wandering point
// of interest that leads them around the frame. Nobody is in charge; the
// swoops and reversals emerge from the rules. All flocking maths is O(birds^2)
// once per frame; each LED just sums a soft glow per bird and its motion wake.

export var speed = 0.45
export var tightness = 0.5 // Recommended pot: a loose drifting haze up to one tight nervous knot.
export var birds = 0.65
export var color = 0.55

export function sliderSpeed(v) { speed = v }
export function sliderTightness(v) { tightness = v }
export function sliderBirds(v) { birds = v }
export function sliderColor(v) { color = v }

var MAXBIRDS = 16
var bpx, bpy      // bird positions
var bvx, bvy      // bird velocities
var wkx, wky      // wake sample trailing each bird
var built = 0
var active = 12
export var t = 0

function buildFlock() {
  bpx = array(MAXBIRDS)
  bpy = array(MAXBIRDS)
  bvx = array(MAXBIRDS)
  bvy = array(MAXBIRDS)
  wkx = array(MAXBIRDS)
  wky = array(MAXBIRDS)
  var i = 0
  for (i = 0; i < MAXBIRDS; i++) {
    bpx[i] = 0.3 + random(0.4)
    bpy[i] = 0.3 + random(0.4)
    bvx[i] = random(0.3) - 0.15
    bvy[i] = random(0.3) - 0.15
    wkx[i] = bpx[i]
    wky[i] = bpy[i]
  }
  built = 1
}

export function beforeRender(delta) {
  if (built == 0) buildFlock()
  var dt = min(delta * 0.001, 0.05)
  t = mod(t + dt, 64)
  active = 6 + floor(birds * 10)
  var pace = 0.25 + speed * 1.15

  // The wandering point of interest the flock loosely follows.
  var ax = 0.5 + 0.3 * sin(t * 0.41)
  var ay = 0.5 + 0.3 * sin(t * 0.29 + 1.3)

  var cx = 0, cy = 0, mvx = 0, mvy = 0
  var i = 0
  for (i = 0; i < active; i++) {
    cx += bpx[i]
    cy += bpy[i]
    mvx += bvx[i]
    mvy += bvy[i]
  }
  cx = cx / active
  cy = cy / active
  mvx = mvx / active
  mvy = mvy / active

  var coh = 0.5 + tightness * 2.2
  var sepR2 = 0.002 + (1 - tightness) * 0.004

  for (i = 0; i < active; i++) {
    var accX = (cx - bpx[i]) * coh + (mvx - bvx[i]) * 1.6 + (ax - bpx[i]) * 0.9
    var accY = (cy - bpy[i]) * coh + (mvy - bvy[i]) * 1.6 + (ay - bpy[i]) * 0.9

    // Separation: only close pairs push, harder the closer they are.
    var j = 0
    for (j = 0; j < active; j++) {
      if (j != i) {
        var dx = bpx[i] - bpx[j]
        var dy = bpy[i] - bpy[j]
        var d2 = dx * dx + dy * dy
        if (d2 < sepR2) {
          var push = 1.3 / (d2 * 60 + 0.05)
          accX += dx * push
          accY += dy * push
        }
      }
    }

    // Soft walls: turn back rather than clip through the frame edge.
    if (bpx[i] < 0.1) accX += (0.1 - bpx[i]) * 26
    if (bpx[i] > 0.9) accX -= (bpx[i] - 0.9) * 26
    if (bpy[i] < 0.1) accY += (0.1 - bpy[i]) * 26
    if (bpy[i] > 0.9) accY -= (bpy[i] - 0.9) * 26

    bvx[i] += accX * dt
    bvy[i] += accY * dt

    // Birds neither stall nor rocket: clamp speed into a band.
    var spd = hypot(bvx[i], bvy[i])
    if (spd > 0.55) {
      bvx[i] = bvx[i] * 0.55 / spd
      bvy[i] = bvy[i] * 0.55 / spd
    }
    if (spd < 0.12 && spd > 0.001) {
      bvx[i] = bvx[i] * 0.12 / spd
      bvy[i] = bvy[i] * 0.12 / spd
    }

    bpx[i] += bvx[i] * dt * pace
    bpy[i] += bvy[i] * dt * pace
    wkx[i] = bpx[i] - bvx[i] * 0.09
    wky[i] = bpy[i] - bvy[i] * 0.09
  }
}

export function render2D(index, x, y) {
  var v = 0.003
  var i = 0
  for (i = 0; i < active; i++) {
    var dx = x - bpx[i]
    var dy = y - bpy[i]
    v += 0.0011 / (dx * dx + dy * dy + 0.0009)
    dx = x - wkx[i]
    dy = y - wky[i]
    v += 0.0004 / (dx * dx + dy * dy + 0.0013)
  }
  var hue = color + (x - y) * 0.04 + v * 0.02
  var sat = 0.85 - clamp(v - 1, 0, 1) * 0.5
  hsv(frac(hue + 1), sat, clamp(v, 0, 1))
}
