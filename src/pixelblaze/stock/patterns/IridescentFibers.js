// Pattern: Iridescent Fibers
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// Credit: "iridescent fibers" by evesira — https://www.shadertoy.com/view/tffSDr
//
// Additive sine-wave layers form a drifting field of luminous iridescent fibers.
// Runs on: 2D maps; designed for panels and mapped surfaces.
// Controls: Speed — How fast the layered fibers drift;
//           Zoom — Framing of the fiber field, remapped to the useful ShaderToy-like range;
//           Thickness — Thickness and softness of each luminous fiber;
//           Brightness — Overall output brightness.
//
// Notes:
// The GLSL source draws ten additive sine-wave layers with an IQ-style cosine
// palette. The zoom slider is deliberately remapped to the useful source-like
// range; the raw ShaderToy coordinate framing lives below the normal midpoint.
// Shared frame coefficients carry the wave and palette phases; each pixel
// supplies just their spatial sine/cosine pair. Reciprocal thickness avoids
// per-pixel division. The tiny eighth-power thickness term is omitted; its
// contribution stays below a byte at the useful framing range.

export var speed = 0.20       // animation speed
export var zoom = 0.33        // useful ShaderToy-like framing range
export var thickness = 0.44   // fiber thickness
export var brightness = 0.65  // output gain

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v) { zoom = v }
export function sliderThickness(v) { thickness = v }
export function sliderBrightness(v) { brightness = v }

var waveCos = array(10)
var waveSin = array(10)
var paletteCos = array(30)
var paletteSin = array(30)

export var t = 0
var scale, thickBase, gain, invThick

function smooth01(x) {
  x = clamp(x, 0, 1)
  return x * x * (3 - 2 * x)
}

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.15 + speed * 1.5)

  // Remap to the useful ShaderToy-like framing range. The previous low end
  // (0.45) looked best, so place that around 70% and expose more zoom-out below.
  scale = 0.20 + zoom * 0.35

  thickBase = 0.012 + thickness * 0.035
  invThick = 1 / thickBase
  gain = 0.42 + brightness * 0.9

  // Share each layer's wave and palette phase across the frame.
  for (var i = 0; i < 10; i = i + 1) {
    var layer = i * 0.1
    var amp = 0.25 + 0.25 * sin(t + layer) * (1 - layer)
    var phase = t * (1 - layer)
    waveCos[i] = amp * cos(2 * phase)
    waveSin[i] = amp * sin(2 * phase)
    var slot = i * 3
    paletteCos[slot] = cos(6.2831853 * (layer - 0.5 * t + 0.1))
    paletteSin[slot] = sin(6.2831853 * (layer - 0.5 * t + 0.1))
    paletteCos[slot + 1] = cos(6.2831853 * (layer - 0.5 * t + 0.4))
    paletteSin[slot + 1] = sin(6.2831853 * (layer - 0.5 * t + 0.4))
    paletteCos[slot + 2] = cos(6.2831853 * (layer - 0.5 * t + 0.5))
    paletteSin[slot + 2] = sin(6.2831853 * (layer - 0.5 * t + 0.5))
  }
}

export function render2D(index, x, y) {
  var uvx = (x * 2 - 1) * scale
  var uvy = (y * 2 - 1) * scale
  var sinWave = sin(2 * uvx)
  var cosWave = cos(2 * uvx)
  var theta = 6.2831853 * (0.5 * uvx)
  var sinTheta = sin(theta)
  var cosTheta = cos(theta)

  var r = 0, g = 0, b = 0

  for (var i = 0; i < 10; i = i + 1) {
    var wy = uvy + waveCos[i] * sinWave - waveSin[i] * cosWave
    var distance = abs(wy)
    if (distance < thickBase) {
      var bright = smooth01(1 - distance * invThick)
      var slot = i * 3
      var cr = 0.5 + 0.5 * (cosTheta * paletteCos[slot] - sinTheta * paletteSin[slot])
      var cg = 0.5 + 0.5 * (cosTheta * paletteCos[slot + 1] - sinTheta * paletteSin[slot + 1])
      var cb = 0.5 + 0.5 * (cosTheta * paletteCos[slot + 2] - sinTheta * paletteSin[slot + 2])

      r = r + bright * cr
      g = g + bright * cg
      b = b + bright * cb
    }
  }

  rgb(clamp(r * gain, 0, 1), clamp(g * gain, 0, 1), clamp(b * gain, 0, 1))
}
