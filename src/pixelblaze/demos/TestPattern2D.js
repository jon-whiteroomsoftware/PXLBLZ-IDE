// Test Pattern (2D): verifies grid orientation and the X / Y coordinate axes.
// Red rises with x (left -> right) and green rises with y (bottom -> top), so
// each corner is a known color: (0,0) black, (1,0) red, (0,1) green, (1,1)
// yellow. The gradient "breathes" — dimming and brightening with an eased
// rhythm — and a large white dot orbits the centre to confirm animation.

export var t, breath

export function beforeRender(delta) {
  t = time(0.1)
  // Breathing ease: a slow sine pushed toward its extremes with smoothstep, so
  // it lingers at the top and bottom of each breath instead of gliding linearly.
  var phase = wave(time(0.08))           // 0..1 sine, ~5s period
  breath = smoothstep(0, 1, phase)
}

export function render2D(index, x, y) {
  // The gradient breathes between dim (0.25) and full (1.0).
  var level = 0.25 + 0.75 * breath
  var px = 0.5 + 0.35 * cos(t * PI * 2)
  var py = 0.5 + 0.35 * sin(t * PI * 2)
  // Substantially larger orbiting dot (radius ~0.25 of the unit square).
  var dot = clamp(1 - hypot(x - px, y - py) * 4, 0, 1)
  rgb(max(x * level, dot), max(y * level, dot), dot)
}
