// Glyph Rain - columns of falling code with quantized, flickering cells.
//
// Each column is a tiny simulation: a bright head falls at its own speed,
// dragging a fading trail, and respawns above the frame with fresh state.
// The trail is quantized into glyph cells whose brightness reshuffles on a
// steady tick, which is what makes it read as scrolling text rather than a
// smooth comet. Per-pixel work is one array lookup and a little arithmetic.

export var speed = 0.42
export var density = 0.5 // Recommended pot: rescales the whole curtain from a few fat streams to fine drizzle.
export var tail = 0.5
export var color = 0.35 // Recommended pot: retunes the phosphor from classic green through amber and violet.

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderTail(v) { tail = v }
export function sliderColor(v) { color = v }

var MAXCOLS = 48
var headY          // each column's head position (falls from ~1 toward 0)
var fallSpeed      // each column's relative fall rate
var seed           // per-column random, used for glyph hashing + hue jitter
var trailLen       // per-column trail length, refreshed each frame from the slider
var built = 0
var gridCols = 24
var tick = 0
var t = 0

function respawn(c) {
  headY[c] = 1.02 + random(0.9)
  fallSpeed[c] = 0.5 + random(1)
  seed[c] = random(1)
}

function buildColumns() {
  headY = array(MAXCOLS)
  fallSpeed = array(MAXCOLS)
  seed = array(MAXCOLS)
  trailLen = array(MAXCOLS)
  var c = 0
  for (c = 0; c < MAXCOLS; c++) {
    respawn(c)
    // Scatter the opening frame through the field instead of starting empty.
    headY[c] = random(1.6) - 0.3
  }
  built = 1
}

export function beforeRender(delta) {
  if (built == 0) buildColumns()
  var dt = delta * 0.001
  t = mod(t + dt, 64)
  tick = floor(t * 8) // glyph-flicker clock; cells reshuffle 8x per second

  gridCols = floor(8 + density * 32)
  var rate = 0.1 + speed * 0.85
  var baseTrail = 0.16 + tail * 0.55
  var c = 0
  for (c = 0; c < MAXCOLS; c++) {
    trailLen[c] = baseTrail * (0.6 + seed[c] * 0.8)
    headY[c] -= fallSpeed[c] * rate * dt
    if (headY[c] < -trailLen[c]) respawn(c)
  }
}

export function render2D(index, x, y) {
  var c = floor(x * gridCols)
  if (c > gridCols - 1) c = gridCols - 1
  if (c < 0) c = 0

  var h = headY[c]
  var hue = color + (seed[c] - 0.5) * 0.05
  var sat = 0.88
  var v = 0.003

  // Trail hangs above the falling head, fading with distance and broken into
  // glyph cells. The hash constants stay small on purpose (16.16 range).
  var above = y - h
  if (above >= 0 && above < trailLen[c]) {
    var fade = 1 - above / trailLen[c]
    var row = floor(y * 24)
    var glyph = frac(seed[c] * 5.3 + row * 0.371 + tick * 0.173)
    v = fade * fade * (0.1 + 0.9 * glyph * glyph)
  }

  // The head itself: brighter than any trail cell and burned toward white.
  var dh = abs(y - h)
  if (dh < 0.035) {
    var hd = 1 - dh / 0.035
    v = max(v, hd * hd * 1.1)
    sat = 0.88 - hd * 0.72
  }

  hsv(frac(hue + 1), sat, clamp(v, 0, 1))
}
