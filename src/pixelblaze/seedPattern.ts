export const SEED_PATTERN = `\
export var speed = 0.5
export var hueBase = 0.0
export var sat = 1.0
export var brightness = 1.0

var t1, t2, t3

function beforeRender(delta) {
  t1 = time(0.05 * speed)
  t2 = time(0.13 * speed)
  t3 = time(0.03 * speed)
}

function render2D(index, x, y) {
  var cx = 0.5, cy = 0.5
  var dx = x - cx, dy = y - cy

  var d = SDF.circle(dx, dy, wave(t1) * 0.4 + 0.05)
  var rim = clamp(1 - abs(d) * 6, 0, 1)

  var angle = atan2(dy, dx)
  var h = hueBase + t3 + angle / (PI * 2)
  var v = rim * triangle(t2) * brightness

  hsv(h, sat, clamp(v, 0, 1))
}
`
