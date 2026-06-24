// Iridescent Fibers — ShaderToy port.
//
// Original ShaderToy: "iridescent fibers" by evesira
// Source: https://www.shadertoy.com/view/tffSDr
//
// The GLSL source draws ten additive sine-wave layers with an IQ-style cosine
// palette. The zoom slider is deliberately remapped to the useful source-like
// range; the raw ShaderToy coordinate framing lives below the normal midpoint.

export var speed = 0.20       // animation speed
export var zoom = 0.33        // useful ShaderToy-like framing range
export var thickness = 0.44   // fiber thickness
export var brightness = 0.65  // output gain

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v) { zoom = v }
export function sliderThickness(v) { thickness = v }
export function sliderBrightness(v) { brightness = v }

export var t = 0
var scale, thickBase, gain

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
  gain = 0.42 + brightness * 0.9
}

export function render2D(index, x, y) {
  var uvx = (x * 2 - 1) * scale
  var uvy = (y * 2 - 1) * scale

  var r = 0, g = 0, b = 0

  for (var i = 0; i < 10; i = i + 1) {
    var layer = i * 0.1

    var amp = 0.25 + 0.25 * sin(t + layer) * (1 - layer)
    var phase = t * (1 - layer)
    var wx = uvx - phase
    var wy = uvy + amp * sin(2 * wx)

    // GLSL: 0.01 + 0.001 * pow(abs(uv.x), 8.0)
    // Expanded multiply is cheaper and Pixelblaze-friendly.
    var ax = abs(uvx)
    var ax2 = ax * ax
    var ax8 = ax2 * ax2 * ax2 * ax2
    var thick = thickBase + 0.004 * ax8

    var bright = smooth01(1 - abs(wy) / thick)

    // GLSL palette(t): 0.5 + 0.5 * cos(TAU * (t + d))
    var p = 0.5 * uvx + layer - 0.5 * t
    var cr = 0.5 + 0.5 * cos(6.2831853 * (p + 0.1))
    var cg = 0.5 + 0.5 * cos(6.2831853 * (p + 0.4))
    var cb = 0.5 + 0.5 * cos(6.2831853 * (p + 0.5))

    r = r + bright * cr
    g = g + bright * cg
    b = b + bright * cb
  }

  rgb(clamp(r * gain, 0, 1), clamp(g * gain, 0, 1), clamp(b * gain, 0, 1))
}
