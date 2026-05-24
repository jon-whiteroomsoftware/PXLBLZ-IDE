// Quadratic ease in — t is 0–1
function easeIn(t) {
  return t * t
}

// Quadratic ease out
function easeOut(t) {
  return t * (2 - t)
}

// Cubic ease in/out
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// Bounce ease out — t is 0–1
function bounce(t) {
  if (t < 0.363636) return 7.5625 * t * t
  if (t < 0.727272) { t -= 0.545454; return 7.5625 * t * t + 0.75 }
  if (t < 0.909090) { t -= 0.818181; return 7.5625 * t * t + 0.9375 }
  t -= 0.954545
  return 7.5625 * t * t + 0.984375
}

// Exponential decay from 1 toward 0; rate controls how fast (higher = faster)
function decay(t, rate) {
  return pow(1 - clamp(t, 0, 1), rate)
}
