// Perf-harness profiler pattern — HAND-LOAD THIS ONTO THE DEVICE (#245).
//
// Mirrors the divergence harness: load this ONCE by hand via the stock
// ElectroMage editor (paste, save, leave active), then drive it from Node over
// the documented getVars/setVars API. It measures the *relative cost of native
// Pixelblaze built-ins on real hardware* — the one thing the float64 emulator
// can't tell us (every built-in is a Math.* call there).
//
// How it works:
//   1. runner setVars({ fn, iters })  — pick the op + inner-loop count
//   2. device beforeRender(delta) runs op `iters` times in a tight loop and
//      folds an EMA of the frame time into `ms`
//   3. runner getVars() reads `ms` back once the EMA has settled
//
// Net per-op cost = ms(fn) - ms(baseline), divided by iters, normalized to a
// multiply. The baseline (fn=0) is the SAME loop+dispatch+wrap with an identity
// op, so subtracting it nets out everything except the op itself.
//
// Anti-cheat (so the bytecode VM can't optimise the loop away):
//   - the op's argument is the running accumulator `x` (not a constant), so no
//     call can be hoisted out of the loop;
//   - `x` feeds forward each iteration and `acc` carries across frames into a
//     read-back sink, so the loop is not dead code;
//   - every iteration wraps through `frac(... + 0.123)` to keep operands in
//     [0,1) — bounded, so 16.16 overflow doesn't change costs frame to frame.
//
// The `fn` codes MUST stay in sync with OPS in profiler.ts.

export var fn = 0      // which built-in to profile (see OPS in profiler.ts)
export var iters = 200 // inner-loop count, auto-tuned by the runner
export var ms = 0      // EMA of frame time (ms), read back by the runner
export var acc = 0     // cross-frame accumulator / sink (keeps the loop live)

// Dispatch is identical for EVERY op including the baseline, so loop + branch +
// wrap overhead cancels in the ms(fn) - ms(baseline) subtraction. Two-arg ops
// derive their second operand from x too, so nothing is constant-foldable.
function op(f, x) {
  if (f == 0)  return x                 // baseline — identity (loop overhead only)
  if (f == 1)  return x * 1.0001        // multiply — the normalization unit
  if (f == 2)  return x + 1.0001        // add
  if (f == 3)  return x - 1.0001        // subtract
  if (f == 4)  return x / 1.0001        // divide
  if (f == 5)  return x % 0.37          // mod
  if (f == 6)  return abs(x - 0.5)      // abs
  if (f == 7)  return floor(x * 8)      // floor
  if (f == 8)  return ceil(x * 8)       // ceil
  if (f == 9)  return frac(x * 8)       // frac
  if (f == 10) return sin(x * 6.283)    // sin
  if (f == 11) return cos(x * 6.283)    // cos
  if (f == 12) return tan(x * 1.5)      // tan
  if (f == 13) return wave(x)           // wave — table lookup (should be cheap)
  if (f == 14) return triangle(x)       // triangle
  if (f == 15) return square(x, 0.5)    // square (duty 0.5)
  if (f == 16) return sqrt(x + 0.001)   // sqrt
  if (f == 17) return pow(x + 0.001, 2.3) // pow
  if (f == 18) return exp(x)            // exp
  if (f == 19) return log(x + 0.001)    // log
  if (f == 20) return hypot(x, 0.5)     // hypot
  if (f == 21) return atan2(x, 0.5)     // atan2
  if (f == 22) return atan(x)           // atan
  if (f == 23) return asin(x)           // asin
  if (f == 24) return acos(x)           // acos
  if (f == 25) return clamp(x, 0.1, 0.9) // clamp
  if (f == 26) return min(x, 0.5)       // min
  if (f == 27) return max(x, 0.5)       // max
  if (f == 28) return perlin(x, 0.5, 0.25, 0) // perlin (3D + seed)
  if (f == 29) return perlinTurbulence(x, 0.5, 0.25, 0, 2, 0.5) // perlinTurbulence
  if (f == 30) return perlinRidge(x, 0.5, 0.25, 0, 2, 0.5, 1.0) // perlinRidge
  return x
}

export function beforeRender(delta) {
  // EMA of frame time. alpha=0.05 → ~20-frame memory; the runner settles long
  // enough for this to converge before reading.
  ms = ms + (delta - ms) * 0.05

  var x = acc
  for (var i = 0; i < iters; i++) {
    x = frac(op(fn, x) + 0.123)  // keep bounded in [0,1), feed forward
  }
  acc = x                        // carry across frames so nothing is dead code
}

// Minimal render so the pattern is valid and faintly alive on the device. Kept
// trivial on purpose — we measure op cost in beforeRender, isolated from the
// per-pixel map/LED-output path.
export function render(index) {
  hsv(0, 0, 0.02)
}
