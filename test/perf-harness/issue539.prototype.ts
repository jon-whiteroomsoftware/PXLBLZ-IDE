// Cheapest Controller falsifier for issue #539: inline Vignette geometry versus
// exact one-plane replay with the same three-plane arena allocated in both.

export const ISSUE539_PROTOTYPE_PIXEL_COUNTS = [256, 1_000, 2_000] as const

function commonSource(pixelCount: number): string {
  return `
var __pxlblz_show_rt_plane_0 = array(${pixelCount})
var __pxlblz_show_rt_plane_1 = array(${pixelCount})
var __pxlblz_show_rt_plane_2 = array(${pixelCount})
var t = 0

export function beforeRender(delta) {
  t = t + delta / 1000
}

function vignette(x, y) {
  var dx = (x - 0.5) / 0.62
  var dy = (y - 0.5) / 0.52
  var distance = sqrt(dx * dx + dy * dy)
  return clamp((1 - distance) / 0.28, 0, 1)
}
`
}

function baseRender(maskExpression: string): string {
  return `
  var pulse = wave(t * 0.04 + x * 2)
  var r = pulse * (1 - y)
  var g = 0.1 + 0.5 * wave(t * 0.03 - y * 3)
  var b = 0.15 + 0.6 * wave(x * 4 + y * 2 - t * 0.02)
  var mask = ${maskExpression}
  rgb(r * mask, g * mask, b * mask)
`
}

export function buildIssue539PrototypeSources(pixelCount: number) {
  const inline = `${commonSource(pixelCount)}
export function render2D(index, x, y) {${baseRender('vignette(x, y)')}}
`
  const cached = `${commonSource(pixelCount)}
var vignetteReady = 0

export function render2D(index, x, y) {
  var field
  if (vignetteReady) {
    field = __pxlblz_show_rt_plane_0[index]
  } else {
    field = vignette(x, y)
    __pxlblz_show_rt_plane_0[index] = field
    if (index == pixelCount - 1) vignetteReady = 1
  }${baseRender('field')}}
`
  return { inline, cached }
}
