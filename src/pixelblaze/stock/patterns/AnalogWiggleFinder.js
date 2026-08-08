// Pattern: Analog Wiggle Finder
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// License: ISC
//
// Five wiring-order meters identify which analog GPIO moves when a connected
// potentiometer is swept back and forth.
// Runs on: 1D, 2D, and 3D maps; requires Pixelblaze V3 Standard HW >= 3.5.
// Controls: Reset — Change the toggle in either direction to clear detection history.
//
// IO33 is amber, IO34 green, IO35 cyan, IO36 blue, and IO39 magenta. Each
// band fills to the pin's smoothed value and carries a bright position marker.
// Two substantial direction reversals make the detected band pulse.
//
// Watch io33/io34/io35/io36/io39 for raw values, motion33/... for per-pin
// confidence, activePin for the winning GPIO number, and confidence for its
// score. A quiet, disconnected, or broken channel should remain inactive.

export var io33 = 0
export var io34 = 0
export var io35 = 0
export var io36 = 0
export var io39 = 0

export var motion33 = 0
export var motion34 = 0
export var motion35 = 0
export var motion36 = 0
export var motion39 = 0

export var activePin = 0
export var confidence = 0

var PIN_COUNT = 5
var DEAD_BAND = 0.002
var MIN_LEG_TRAVEL = 0.08
var MIN_DIRECTION_FRAMES = 3
var REVERSAL_GAIN = 0.55
var DETECTION_THRESHOLD = 0.85
var SCORE_DECAY_PER_MS = 0.00003
var FILTER_GAIN = 0.35
var inputsConfigured = 0

var pins = array(PIN_COUNT)
pins[0] = 33
pins[1] = 34
pins[2] = 35
pins[3] = 36
pins[4] = 39

var raw = array(PIN_COUNT)
var filtered = array(PIN_COUNT)
var previous = array(PIN_COUNT)
var initialized = array(PIN_COUNT)
var direction = array(PIN_COUNT)
var candidateDirection = array(PIN_COUNT)
var candidateFrames = array(PIN_COUNT)
var legTravel = array(PIN_COUNT)
var score = array(PIN_COUNT)

var pulsePhase = 0
var pulseValue = 0

export function toggleReset(v) {
  var i
  for (i = 0; i < PIN_COUNT; i++) {
    direction[i] = 0
    candidateDirection[i] = 0
    candidateFrames[i] = 0
    legTravel[i] = 0
    score[i] = 0
  }
  motion33 = 0
  motion34 = 0
  motion35 = 0
  motion36 = 0
  motion39 = 0
  activePin = 0
  confidence = 0
}

function updateDetector(i, delta) {
  var sample = raw[i]

  if (!initialized[i]) {
    filtered[i] = sample
    previous[i] = sample
    initialized[i] = 1
    return
  }

  filtered[i] = filtered[i] + (sample - filtered[i]) * FILTER_GAIN
  var change = filtered[i] - previous[i]
  previous[i] = filtered[i]

  score[i] = max(0, score[i] - delta * SCORE_DECAY_PER_MS)
  if (abs(change) <= DEAD_BAND) return

  var nextDirection = change > 0 ? 1 : -1
  if (nextDirection == candidateDirection[i]) {
    candidateFrames[i]++
  } else {
    candidateDirection[i] = nextDirection
    candidateFrames[i] = 1
  }

  if (candidateFrames[i] < MIN_DIRECTION_FRAMES) return

  if (direction[i] == 0) {
    direction[i] = nextDirection
    legTravel[i] = abs(change)
  } else if (nextDirection == direction[i]) {
    legTravel[i] = legTravel[i] + abs(change)
  } else {
    if (legTravel[i] >= MIN_LEG_TRAVEL) {
      score[i] = min(1, score[i] + REVERSAL_GAIN)
    }
    direction[i] = nextDirection
    legTravel[i] = abs(change)
  }
}

function publishValues() {
  io33 = raw[0]
  io34 = raw[1]
  io35 = raw[2]
  io36 = raw[3]
  io39 = raw[4]

  motion33 = score[0]
  motion34 = score[1]
  motion35 = score[2]
  motion36 = score[3]
  motion39 = score[4]
}

export function beforeRender(delta) {
  if (!inputsConfigured) {
    pinMode(33, ANALOG)
    pinMode(34, ANALOG)
    pinMode(35, ANALOG)
    pinMode(36, ANALOG)
    pinMode(39, ANALOG)
    inputsConfigured = 1
  }

  raw[0] = analogRead(33)
  raw[1] = analogRead(34)
  raw[2] = analogRead(35)
  raw[3] = analogRead(36)
  raw[4] = analogRead(39)

  var i
  var best = 0
  var bestIndex = 0
  for (i = 0; i < PIN_COUNT; i++) {
    updateDetector(i, delta)
    if (score[i] > best) {
      best = score[i]
      bestIndex = i
    }
  }

  confidence = best
  activePin = best >= DETECTION_THRESHOLD ? pins[bestIndex] : 0
  publishValues()

  pulsePhase = frac(pulsePhase + delta * 0.0012)
  pulseValue = wave(pulsePhase)
}

function setPinColor(channel, brightness) {
  if (channel == 0) {
    rgb(brightness, brightness * 0.16, 0)
  } else if (channel == 1) {
    rgb(0, brightness, brightness * 0.08)
  } else if (channel == 2) {
    rgb(0, brightness * 0.68, brightness)
  } else if (channel == 3) {
    rgb(brightness * 0.08, brightness * 0.16, brightness)
  } else {
    rgb(brightness * 0.8, 0, brightness)
  }
}

function renderMeters(index) {
  var scaled = index * PIN_COUNT / pixelCount
  var channel = min(PIN_COUNT - 1, floor(scaled))
  var local = frac(scaled)
  var level = filtered[channel]
  var marker = clamp(1 - abs(local - level) * 24, 0, 1)
  var fill = local <= level ? 1 : 0
  var detected = score[channel] >= DETECTION_THRESHOLD ? 1 : 0
  var brightness = 0.006 + fill * 0.025 + marker * 0.14
  brightness = brightness + detected * (0.05 + pulseValue * 0.12)
  setPinColor(channel, brightness)
}

export function render(index) {
  renderMeters(index)
}

export function render2D(index, x, y) {
  renderMeters(index)
}

export function render3D(index, x, y, z) {
  renderMeters(index)
}
