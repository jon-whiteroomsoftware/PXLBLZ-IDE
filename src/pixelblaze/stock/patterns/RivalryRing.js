// Pattern: Rivalry Ring
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// A cyclic cellular ecosystem sends glowing territorial battles around a ring.
// Runs on: 1D strips and rings.
// Controls: Speed — How fast the battlefronts advance;
//           Species — Number of rival factions — three up to five;
//           Aggression — From calm shifting borders up to constant upheaval;
//           Color — Rotates the whole faction palette around the colour wheel.
//
// Notes:
// Every LED is a cell holding one of K species, and each species is beaten by
// the next one around the cycle. On a fixed tick each cell checks its four
// nearest neighbours: enough predators and it converts. That single local rule
// produces travelling battlefronts that chase each other around the strip
// forever - fresh conquests blaze white-hot, held territory cools to embers.

export var speed = 0.5
export var species = 0.2 // Recommended pot: adds a fourth and fifth faction to the war.
export var aggression = 0.45 // Recommended pot: calm shifting borders up to constant upheaval.
export var color = 0

export function sliderSpeed(v) { speed = v }
export function sliderSpecies(v) { species = v }
export function sliderAggression(v) { aggression = v }
export function sliderColor(v) { color = v }

export var turnover = 0 // fraction of cells that changed last tick, for the Var Watcher

var state           // per-cell species, 0..K-1
var nextState       // double-buffer so neighbours are read, not half-updated
var age             // 1 right after a conversion, decaying while territory is held
var built = 0
var accum = 0
var K = 3

function buildCells() {
  state = array(pixelCount)
  nextState = array(pixelCount)
  age = array(pixelCount)
  var i = 0
  for (i = 0; i < pixelCount; i++) {
    state[i] = floor(random(K))
    age[i] = random(0.5)
  }
  built = pixelCount
}

function stepCells() {
  var n = built
  var thr = aggression > 0.55 ? 1 : 2
  var changed = 0
  var i = 0
  for (i = 0; i < n; i++) {
    var s = state[i]
    var predator = s + 1 >= K ? 0 : s + 1
    var l1 = i == 0 ? n - 1 : i - 1
    var l2 = l1 == 0 ? n - 1 : l1 - 1
    var r1 = i == n - 1 ? 0 : i + 1
    var r2 = r1 == n - 1 ? 0 : r1 + 1
    var cnt = 0
    if (state[l1] == predator) cnt++
    if (state[l2] == predator) cnt++
    if (state[r1] == predator) cnt++
    if (state[r2] == predator) cnt++
    if (cnt >= thr) {
      nextState[i] = predator
      age[i] = 1
      changed++
    } else {
      nextState[i] = s
      age[i] = age[i] * 0.8
    }
  }
  for (i = 0; i < n; i++) state[i] = nextState[i]

  // Mutation keeps a stalemate from freezing solid, and is the only way new
  // species enter after the Species slider raises K.
  if (random(1) < 0.08 + aggression * 0.3) {
    var j = floor(random(n))
    state[j] = floor(random(K))
    age[j] = 1
  }
  turnover = changed / n
}

export function beforeRender(delta) {
  K = 3 + floor(species * 2.99)
  if (built != pixelCount && pixelCount > 0) buildCells()

  // Fixed-tick simulation so front speed is frame-rate independent.
  var tick = 96 - speed * 72
  accum += delta
  var steps = 0
  for (steps = 0; steps < 3 && accum >= tick; steps++) {
    stepCells()
    accum -= tick
  }
  if (accum > tick) accum = tick
}

export function render(index) {
  var s = state[index]
  var a = age[index]
  var hue = color + s / K + a * 0.03
  var sat = 1 - a * 0.4
  var v = 0.09 + a * a * 0.91
  hsv(frac(hue + 1), sat, clamp(v, 0, 1))
}
