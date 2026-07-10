// Pendulum Wave (1D) - the classic physics-demo row of graduated pendulums.
//
// The strip is divided into 40 virtual bobs whose swing frequencies step up in
// exact integer counts per grand cycle, so the row shears from unison into
// travelling waves, dissolves into apparent chaos, and snaps back into perfect
// sync - seamlessly, forever, because every phase is an integer multiple of
// the wrapped cycle clock. A Kuramoto-style order meter drives a glint that
// flares white at each realignment.

export var speed = 0.42
export var spread = 0.4 // Recommended pot: how many extra swings the far bob makes - the shear rate.
export var glint = 0.55
export var color = 0.62 // Recommended pot: base hue; swing direction tints around it.

export function sliderSpeed(v) { speed = v }
export function sliderSpread(v) { spread = v }
export function sliderGlint(v) { glint = v }
export function sliderColor(v) { color = v }

export var order = 0 // phase alignment across the row, 0..1, for the Var Watcher

var P = 40           // virtual pendulum bobs across the strip
var t01 = 0          // grand-cycle clock, wraps at 1
var angBase = 0
var angStep = 0
var flash = 0

export function beforeRender(delta) {
  var cycle = 34 - speed * 26 // seconds per grand cycle
  t01 = mod(t01 + delta * 0.001 / cycle, 1)

  // Integer frequency steps are what make the wrap seamless: bob k swings
  // 30 + k*stepMult times per cycle, all whole numbers.
  var stepMult = 1 + floor(spread * 2.2)
  angBase = PI2 * t01 * 30
  angStep = PI2 * t01 * stepMult

  var sc = 0
  var ss = 0
  var k = 0
  for (k = 0; k < P; k++) {
    var a = angBase + angStep * k
    sc += cos(a)
    ss += sin(a)
  }
  order = hypot(sc, ss) / P
  flash = pow(order, 8) * glint
}

export function render(index) {
  var x01 = index / max(pixelCount - 1, 1)
  var k = floor(x01 * P)
  if (k > P - 1) k = P - 1

  var a = angBase + angStep * k
  var s = sin(a)
  var c = cos(a)

  var v = 0.5 + 0.5 * s
  v = v * v
  v = v * (0.72 + flash * 0.5) + flash * 0.12 + 0.004

  var hue = color + c * 0.05 + x01 * 0.06
  var sat = 0.88 - flash * 0.62
  hsv(frac(hue + 1), sat, clamp(v, 0, 1))
}
