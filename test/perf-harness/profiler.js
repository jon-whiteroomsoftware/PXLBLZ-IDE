// Perf-harness profiler pattern (#245, #532).
//
// profiler.ts compiles and loads this Pattern temporarily, drives it through the
// documented getVars/setVars API, and restores the Controller afterward. It
// measures native Pixelblaze operation cost on real hardware - the one thing the
// float64 emulator cannot tell us.
//
// How it works:
//   1. runner setVars({ fn, iters })  — pick the op + inner-loop count
//   2. device beforeRender(delta) runs op `iters` times in a tight loop and
//      folds an EMA of the frame time into `ms`
//   3. runner getVars() reads `ms` back once the EMA has settled
//
// Net per-op cost = ms(fn) - ms(paired baseline), divided by iters, normalized
// to a multiply. Built-ins use the identity loop; arrays, calls, branches, and
// HSV conversion use matched baseline shapes.
//
// Anti-cheat (so the bytecode VM can't optimise the loop away):
//   - the op's argument is the running accumulator `x` (not a constant), so no
//     call can be hoisted out of the loop;
//   - `x` feeds forward each iteration and `acc` carries across frames into a
//     read-back sink, so the loop is not dead code;
//   - every iteration wraps through `frac(... + 0.123)` to keep operands in
//     [0,1) — bounded, so 16.16 overflow doesn't change costs frame to frame.
//
// The `fn` codes MUST stay in sync with PROFILE_OPS in profilerModel.ts.

export var fn = 0      // operation to profile (see PROFILE_OPS)
export var iters = 200 // inner-loop count, auto-tuned by the runner
export var ms = 0      // EMA of frame time (ms), read back by the runner
export var acc = 0     // cross-frame accumulator / sink (keeps the loop live)

var probeGlobal = 0.314159
var probeFlag = 1
var probeArray = array(16)
var probeR = 0
var probeG = 0
var probeB = 0

function probeCall0() { return 0.314159 }
function probeCall1(a) { return a * 1.0001 }
function probeCall2(a, b) { return a * 1.0001 + b }
function probeCall3(a, b, c) { return a * 1.0001 + b - c }

function probeCaptureRgb(r, g, b) {
  probeR = r
  probeG = g
  probeB = b
}

// This intentionally matches the generated Show runtime's HSV conversion.
function probeCaptureHsv(h, s, v) {
  h = h - floor(h)
  var sector = floor(h * 6)
  var f = h * 6 - sector
  var p = v * (1 - s)
  var q = v * (1 - f * s)
  var t = v * (1 - (1 - f) * s)
  if (sector == 0) probeCaptureRgb(v, t, p)
  else if (sector == 1) probeCaptureRgb(q, v, p)
  else if (sector == 2) probeCaptureRgb(p, v, t)
  else if (sector == 3) probeCaptureRgb(p, q, v)
  else if (sector == 4) probeCaptureRgb(t, p, v)
  else probeCaptureRgb(v, p, q)
}

// Dispatch is HOISTED OUT of the inner loop: each op gets its own tight loop,
// selected once per frame. Two earlier designs failed:
//   1. an if-chain with early `return` inside the loop — dispatch cost grew with
//      the op's POSITION (a higher fn ran more comparisons per iter), so cost
//      climbed in list order and add/sub looked pricier than mul;
//   2. a full no-early-return chain inside the loop — constant but EXPENSIVE, so
//      the comparisons/iter dominated the frame, the watchdog forced `iters`
//      down to ~500, and the real op signal sank into timing noise (perlin-
//      Turbulence measured cheaper than perlin — impossible).
// Hoisting fixes both: the comparisons run ONCE per frame (negligible), each
// op's inner loop is just `op + frac` wrap, so `iters` can go high (good SNR)
// and baseline subtraction cancels the identical loop+frac overhead exactly.
//
// Every loop body is `frac(<expr> + 0.123)`: bounded in [0,1) (no 16.16 overflow
// drift), x feeds forward (no hoisting), acc carries across frames (not dead
// code). Operand expressions match the op being measured; baseline is identity.
export function beforeRender(delta) {
  // A short EMA smooths frame jitter without retaining a material amount of the
  // preceding probe after the runner's settle interval.
  ms = ms + (delta - ms) * 0.2

  var x = acc
  var f = fn
  var n = iters
  var i = 0
  var local = x
  var arrayIndex = 0
  var n8 = floor(n / 8)
  var n8x8 = n8 * 8

  if (f == 0)  for (i = 0; i < n; i++) x = frac(x + 0.123)              // baseline — identity (loop overhead only)
  if (f == 1)  for (i = 0; i < n; i++) x = frac(x * 1.0001 + 0.123)     // multiply — the normalization unit
  if (f == 2)  for (i = 0; i < n; i++) x = frac(x + 1.0001 + 0.123)     // add
  if (f == 3)  for (i = 0; i < n; i++) x = frac(x - 1.0001 + 0.123)     // subtract
  if (f == 4)  for (i = 0; i < n; i++) x = frac(x / 1.0001 + 0.123)     // divide
  if (f == 5)  for (i = 0; i < n; i++) x = frac(x % 0.37 + 0.123)       // mod
  if (f == 6)  for (i = 0; i < n; i++) x = frac(abs(x - 0.5) + 0.123)   // abs
  if (f == 7)  for (i = 0; i < n; i++) x = frac(floor(x * 8) + 0.123)   // floor
  if (f == 8)  for (i = 0; i < n; i++) x = frac(ceil(x * 8) + 0.123)    // ceil
  if (f == 9)  for (i = 0; i < n; i++) x = frac(frac(x * 8) + 0.123)    // frac
  if (f == 10) for (i = 0; i < n; i++) x = frac(sin(x * 6.283) + 0.123) // sin
  if (f == 11) for (i = 0; i < n; i++) x = frac(cos(x * 6.283) + 0.123) // cos
  if (f == 12) for (i = 0; i < n; i++) x = frac(tan(x * 1.5) + 0.123)   // tan
  if (f == 13) for (i = 0; i < n; i++) x = frac(wave(x) + 0.123)        // wave — table lookup (should be cheap)
  if (f == 14) for (i = 0; i < n; i++) x = frac(triangle(x) + 0.123)    // triangle
  if (f == 15) for (i = 0; i < n; i++) x = frac(square(x, 0.5) + 0.123) // square (duty 0.5)
  if (f == 16) for (i = 0; i < n; i++) x = frac(sqrt(x + 0.001) + 0.123) // sqrt
  if (f == 17) for (i = 0; i < n; i++) x = frac(pow(x + 0.001, 2.3) + 0.123) // pow
  if (f == 18) for (i = 0; i < n; i++) x = frac(exp(x) + 0.123)         // exp
  if (f == 19) for (i = 0; i < n; i++) x = frac(log(x + 0.001) + 0.123) // log
  if (f == 20) for (i = 0; i < n; i++) x = frac(hypot(x, 0.5) + 0.123)  // hypot
  if (f == 21) for (i = 0; i < n; i++) x = frac(atan2(x, 0.5) + 0.123)  // atan2
  if (f == 22) for (i = 0; i < n; i++) x = frac(atan(x) + 0.123)        // atan
  if (f == 23) for (i = 0; i < n; i++) x = frac(asin(x) + 0.123)        // asin
  if (f == 24) for (i = 0; i < n; i++) x = frac(acos(x) + 0.123)        // acos
  if (f == 25) for (i = 0; i < n; i++) x = frac(clamp(x, 0.1, 0.9) + 0.123) // clamp
  if (f == 26) for (i = 0; i < n; i++) x = frac(min(x, 0.5) + 0.123)    // min
  if (f == 27) for (i = 0; i < n; i++) x = frac(max(x, 0.5) + 0.123)    // max
  if (f == 28) for (i = 0; i < n; i++) x = frac(perlin(x, 0.5, 0.25, 0) + 0.123) // perlin (3D + seed)
  if (f == 29) for (i = 0; i < n; i++) x = frac(perlinTurbulence(x, 0.5, 0.25, 0, 2, 0.5) + 0.123) // perlinTurbulence
  if (f == 30) for (i = 0; i < n; i++) x = frac(perlinRidge(x, 0.5, 0.25, 0, 2, 0.5, 1.0) + 0.123) // perlinRidge

  // Cache and dispatch probes use matched baselines. The tiny feed-forward
  // terms retain the running dependency without dominating the exchange under
  // test. Baseline selection still happens once per frame, outside each loop.
  if (f == 31) for (i = 0; i < n; i++) x = frac(x + 0.123) // local access baseline
  if (f == 32) for (i = 0; i < n; i++) x = frac(local + 0.123) // local-slot substitution
  if (f == 33) for (i = 0; i < n; i++) { local = x; x = frac(x + 0.123) } // local write

  if (f == 34) for (i = 0; i < n; i++) x = frac(x + local * 0.0001 + 0.123) // persistent read baseline (local mirror)
  if (f == 35) for (i = 0; i < n; i++) x = frac(x + probeGlobal * 0.0001 + 0.123) // persistent global read
  if (f == 36) for (i = 0; i < n; i++) { local = x; x = frac(x + 0.123) } // persistent write baseline (local sink)
  if (f == 37) for (i = 0; i < n; i++) { probeGlobal = x; x = frac(x + 0.123) } // persistent global write

  if (f == 38) for (i = 0; i < n; i++) { arrayIndex = (arrayIndex + 1) % 16; x = frac(x + local * 0.0001 + arrayIndex * 0.0001 + 0.123) } // array access baseline (local-slot substitution)
  if (f == 39) for (i = 0; i < n; i++) { arrayIndex = (arrayIndex + 1) % 16; x = frac(x + probeArray[arrayIndex] * 0.0001 + arrayIndex * 0.0001 + 0.123) } // array read
  if (f == 40) for (i = 0; i < n; i++) { arrayIndex = (arrayIndex + 1) % 16; probeArray[arrayIndex] = x; x = frac(x + local * 0.0001 + arrayIndex * 0.0001 + 0.123) } // array write

  if (f == 41) for (i = 0; i < n; i++) x = frac(0.314159 + x * 0.0001 + 0.123) // direct zero-arg expression
  if (f == 42) for (i = 0; i < n; i++) x = frac(probeCall0() + x * 0.0001 + 0.123) // call with 0 args
  if (f == 43) for (i = 0; i < n; i++) x = frac(x * 1.0001 + 0.123) // direct one-arg expression
  if (f == 44) for (i = 0; i < n; i++) x = frac(probeCall1(x) + 0.123) // call with 1 arg
  if (f == 45) for (i = 0; i < n; i++) x = frac(x * 1.0001 + 0.25 + 0.123) // direct two-arg expression
  if (f == 46) for (i = 0; i < n; i++) x = frac(probeCall2(x, 0.25) + 0.123) // call with 2 args
  if (f == 47) for (i = 0; i < n; i++) x = frac(x * 1.0001 + 0.25 - 0.125 + 0.123) // direct three-arg expression
  if (f == 48) for (i = 0; i < n; i++) x = frac(probeCall3(x, 0.25, 0.125) + 0.123) // call with 3 args

  if (f == 49) for (i = 0; i < n; i++) x = frac(x * 1.0001 + 0.123) // branch baseline
  if (f == 50) for (i = 0; i < n; i++) { if (probeFlag) x = frac(x * 1.0001 + 0.123); else x = frac(x * 0.9999 + 0.123) } // global flag branch

  if (f == 51) for (i = 0; i < n; i++) { probeCaptureRgb(x, 0.7, 0.8); x = frac(probeR + probeG + probeB + x * 0.0001 + 0.123) } // RGB capture baseline
  if (f == 52) for (i = 0; i < n; i++) { probeCaptureHsv(x, 0.7, 0.8); x = frac(probeR + probeG + probeB + x * 0.0001 + 0.123) } // generated HSV conversion

  if (f == 53) for (i = 0; i < n; i++) x = frac(floor(x * 255) + 0.123) // bit operation baseline
  if (f == 54) for (i = 0; i < n; i++) x = frac((floor(x * 255) << 1) + 0.123) // bit shift
  if (f == 55) for (i = 0; i < n; i++) x = frac((floor(x * 255) & 255) + 0.123) // bit mask

  // #924 (wave 5): loop machinery and single-use locals.
  //   56 prices the catalogue's `i = i + 1` idiom against the `i++` identity loop (fn 0).
  //   57 runs the identity body eight times per loop trip, so its net against
  //      fn 0 is MINUS 7/8 of one iteration's compare+branch+increment machinery.
  //   58/59 pair a fused expression against the same work through a
  //      single-use local (the shape generated code emits thousands of times).
  //   57/60 pair an eight-body loop against a one-body loop with the SAME
  //      `i++` update over the same body count (n8 * 8, n8 = floor(n / 8)),
  //      so their net is exactly -7/8 of one iteration's compare + branch +
  //      increment; the runner normalizes per `iters`, and n8 * 8 differs
  //      from n by at most 7 (< 0.3% at the auto-tuned count).
  if (f == 56) for (i = 0; i < n; i = i + 1) x = frac(x + 0.123) // loop, i = i + 1 idiom
  if (f == 57) for (i = 0; i < n8; i++) { x = frac(x + 0.123); x = frac(x + 0.123); x = frac(x + 0.123); x = frac(x + 0.123); x = frac(x + 0.123); x = frac(x + 0.123); x = frac(x + 0.123); x = frac(x + 0.123) } // unrolled x8 body, n8 trips
  if (f == 58) for (i = 0; i < n; i++) x = frac(x * 1.0001 + 0.123) // fused expression baseline
  if (f == 59) for (i = 0; i < n; i++) { local = x * 1.0001; x = frac(local + 0.123) } // single-use local
  if (f == 60) for (i = 0; i < n8x8; i++) x = frac(x + 0.123) // unrolled-pair baseline: identity loop over n8 * 8 trips
  // #933 pow-to-multiply pricing: integer-exponent pow against the multiply
  //   chain the display-exact pass would emit. Odd probes price pow(base, k),
  //   even probes price the lowered form with the base hoisted to one local
  //   (the pass hoists any non-identifier base so it is evaluated once).
  //   Base stays in [0.5, 1.5) so every power fits 16.16.
  if (f == 61) for (i = 0; i < n; i++) x = frac(pow(x + 0.5, 2)) // pow k=2
  if (f == 62) for (i = 0; i < n; i++) { local = x + 0.5; x = frac(local * local) } // multiply chain k=2
  if (f == 63) for (i = 0; i < n; i++) x = frac(pow(x + 0.5, 3)) // pow k=3
  if (f == 64) for (i = 0; i < n; i++) { local = x + 0.5; x = frac(local * local * local) } // multiply chain k=3
  if (f == 65) for (i = 0; i < n; i++) x = frac(pow(x + 0.5, 4)) // pow k=4
  if (f == 66) for (i = 0; i < n; i++) { local = x + 0.5; local = local * local; x = frac(local * local) } // squared-square k=4

  acc = frac(x + local * 0.0001) // carry across frames so nothing is dead code
}

// Minimal render so the pattern is valid and faintly alive on the device. Kept
// trivial on purpose — we measure op cost in beforeRender, isolated from the
// per-pixel map/LED-output path.
export function render(index) {
  hsv(0, 0, 0.02)
}
