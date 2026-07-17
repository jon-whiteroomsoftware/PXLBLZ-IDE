// Redline Machine - the complete 32-bar installation score in one renderer.
// The shared instance receives 1,600 pixels on the hero panel and 600 on each
// target, so it can select the correct cheap material without a Zone-specific
// copy. Per-target affine Effects supply the four different performances.

export var intensity = 1
export var scoreSpeed = 1
export var guest = 1

export function sliderIntensity(v) { intensity = 0.35 + v * 0.65 }
export function sliderSpeed(v) { scoreSpeed = 0.5 + v }
export function sliderGuest(v) { guest = v }

var score, beat, phraseTime, phrase, step, energy, mode, palette

export function beforeRender(delta) {
  score = time(0.91552734 / scoreSpeed)       // 60 seconds at the default speed
  beat = time(0.00715256 / scoreSpeed)        // 128 BPM
  phraseTime = frac(score * 8)
  phrase = floor(score * 8)
  step = floor(phraseTime * 4)

  if (phrase == 0) { energy = 0.30; mode = 0; palette = 0 }
  else if (phrase == 1) { energy = 0.48; mode = 1; palette = 0 }
  else if (phrase == 2) { energy = 0.62; mode = 2; palette = 0 }
  else if (phrase == 3) { energy = 0.78; mode = 3; palette = 0 }
  else if (phrase == 4) { energy = 0.25; mode = 0; palette = 0.5 }
  else if (phrase == 5) { energy = 0.70; mode = 1; palette = 0.5 }
  else if (phrase == 6) { energy = 0.86; mode = 2; palette = 1 }
  else { energy = 1; mode = 3; palette = 1 }

  energy = min(1, energy * intensity)
}

function inside(v, lo, hi) {
  return v >= lo && v <= hi ? 1 : 0
}

function blockField(x, y) {
  var density = 4 + floor(energy * 10)
  var blockX = floor(x * density)
  var blockY = floor(y * (3 + floor(energy * 7)))
  var checker = (blockX + blockY + step) % 2
  var foldedX = abs(x - 0.5) * 2
  var foldedY = abs(y - 0.5) * 2
  var band = 1 - min(1, abs(frac(x * (2 + step) - phraseTime * (1 + energy * 3)) - 0.5) * (5 + density * 0.45))
  var rail = 1 - min(1, abs(frac(y * (4 + step * 2) + phraseTime * 2) - 0.5) * (7 + energy * 3))
  var box = max(foldedX, foldedY * (1.4 + energy))

  if (mode == 0) return max(band * (0.35 + checker * 0.65), rail * 0.55)
  if (mode == 1) return max(checker * (box > 0.28 ? 0.88 : 0.12), band)
  if (mode == 2) return max(rail * (1 - foldedX), band * (box > 0.52 ? 1 : 0.18))
  return max(checker * (box > 0.18 ? 1 : 0), max(band, rail))
}

function targetField(x, y) {
  var ringCount = 4 + floor(energy * 12)
  var spokeCount = 6 + floor(energy * 14)
  var ring = 1 - min(1, abs(frac(y * ringCount - phraseTime * (1 + energy * 4)) - 0.5) * (5 + ringCount * 0.5))
  var spoke = 1 - min(1, abs(frac(x * spokeCount + step * 0.125) - 0.5) * (5 + spokeCount * 0.5))
  var shutter = frac(x * 4 + phraseTime * (2 + energy * 4)) < (0.12 + energy * 0.16) ? 1 : 0
  var core = y < (0.08 + energy * 0.08) ? 1 : 0

  if (mode == 0) return max(ring, core)
  if (mode == 1) return max(ring * (0.25 + spoke * 0.75), shutter * (1 - y) * 0.8)
  if (mode == 2) return max(spoke * (y > 0.24 ? 1 : 0.18), ring * 0.5)
  return max(max(ring, spoke), max(core, shutter * 0.85))
}

function glyphField(x, y) {
  var cell = floor(x * 3)
  var gx = frac(x * 3)
  var thick = 0.09 + energy * 0.055
  var glyph = 0

  if (cell == 0) {
    glyph = max(
      inside(gx, 0.12, 0.12 + thick),
      max(
        inside(y, 0.12, 0.12 + thick) * inside(gx, 0.12, 0.82),
        max(
          inside(y, 0.46, 0.46 + thick) * inside(gx, 0.12, 0.76),
          inside(gx, 0.72, 0.72 + thick) * inside(y, 0.12, 0.52)
        )
      )
    )
  } else if (cell == 1) {
    glyph = min(1, inside(abs(gx - y), 0, thick) + inside(abs(gx + y - 1), 0, thick))
  } else {
    glyph = max(
      inside(gx, 0.12, 0.12 + thick),
      inside(y, 0.78, 0.78 + thick) * inside(gx, 0.12, 0.86)
    )
  }
  return glyph
}

export function render2D(index, x, y) {
  var center = pixelCount > 1000
  var finalPunctuation = phrase == 7 && phraseTime > 0.72
  var value

  if (center && (phrase == 4 || finalPunctuation)) value = glyphField(x, y)
  else if (!center && (phrase == 3 || (phrase == 7 && !finalPunctuation))) value = blockField(x, y)
  else value = center ? blockField(x, y) : targetField(x, y)

  if (finalPunctuation && beat < 0.22) value = 1 - value
  var hitWidth = 0.06 + energy * 0.08
  var white = beat < hitWidth && value > 0.5 ? 1 : 0
  if (phrase == 3 || phrase == 7) white = max(white, beat < hitWidth * 0.55 ? value : 0)

  var surfaceGlow = 0.025 + energy * 0.035
  var hot = (surfaceGlow + value * (1 - surfaceGlow)) * (0.58 + energy * 0.42)
  var cyan = palette == 0.5 ? hot * guest : 0
  var red = palette == 0.5 ? 0 : hot
  rgb(max(red, white), max(cyan, white), max(cyan, white))
}
