# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-07-17
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,593
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.815 | 0.807 | 0.802-0.847 | 1.0× |
| `local read` | memory | `local access baseline` | -0.015 | 0.000 | -0.065-0.007 | 0.0× |
| `local write` | memory | `local access baseline` | 1.459 | 1.469 | 1.408-1.488 | 1.8× |
| `persistent global read` | memory | `persistent read baseline` | 0.005 | 0.005 | -0.054-0.064 | 0.0× |
| `persistent global write` | memory | `persistent write baseline` | -0.002 | -0.002 | -0.015-0.018 | -0.0× |
| `array read` | memory | `array access baseline` | 1.298 | 1.309 | 1.229-1.333 | 1.6× |
| `array write` | memory | `array access baseline` | 2.731 | 2.722 | 2.657-2.803 | 3.4× |
| `user function call (0 args)` | call | `direct zero-arg expression` | 1.912 | 1.899 | 1.892-1.948 | 2.4× |
| `user function call (1 arg)` | call | `direct one-arg expression` | 2.403 | 2.414 | 2.334-2.440 | 3.0× |
| `user function call (2 args)` | call | `direct two-arg expression` | 2.922 | 2.930 | 2.857-2.956 | 3.6× |
| `user function call (3 args)` | call | `direct three-arg expression` | 3.433 | 3.449 | 3.367-3.461 | 4.3× |
| `global flag branch` | dispatch | `branch baseline` | 1.492 | 1.500 | 1.437-1.524 | 1.9× |
| `generated HSV conversion` | color | `RGB capture baseline` | 35.352 | 35.308 | 35.283-35.449 | 43.7× |
| `bit shift` | fixed-point | `bit operation baseline` | 0.791 | 0.797 | 0.763-0.812 | 1.0× |
| `bit mask` | fixed-point | `bit operation baseline` | 0.788 | 0.799 | 0.746-0.820 | 1.0× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
## Round two - 2026-07-20 (#556)

**Device:** Burner bag (`pb32`) | **Firmware:** 3.67 | **Output profile:** native-serial (assumed); getConfig does not expose output topology
**Pixel count:** 256 | **Inner-loop count:** 2,593 | **Samples per operation:** 5 | **Sink calls per pixel:** 16

Same paired-baseline method as round one. Built-in baselines replace the call with one same-shape multiply, so their net is "built-in minus one multiply". Rows marked *per call* run in `render(index)` and are normalized per native call (`pixelCount x reps` calls per frame); all other rows are per loop iteration in `beforeRender`.

| operation | group | paired baseline | mean net us | median net | min-max net | relative to mul | unit |
|---|---|---|---:|---:|---:|---:|---|
| `mul` | arithmetic | `identity baseline` | 0.818 | 0.807 | 0.804-0.851 | 1.0x | per iteration |
| `div by constant` | arithmetic | `constant-multiply baseline` | 0.615 | 0.627 | 0.555-0.638 | 0.8x | per iteration |
| `div by variable` | arithmetic | `variable-multiply baseline` | 0.631 | 0.631 | 0.620-0.641 | 0.8x | per iteration |
| `mod by constant` | arithmetic | `constant-mod-multiply baseline` | 0.005 | 0.013 | -0.041-0.025 | 0.0x | per iteration |
| `mod by variable` | arithmetic | `variable-mod-multiply baseline` | 0.011 | 0.014 | -0.021-0.031 | 0.0x | per iteration |
| `less-than` | comparison | `comparison-multiply baseline` | 0.036 | 0.049 | -0.026-0.062 | 0.1x | per iteration |
| `range check (&&)` | comparison | `single-bound baseline` | 0.562 | 0.576 | 0.505-0.583 | 0.7x | per iteration |
| `ternary select` | comparison | `arithmetic select baseline` | -3.518 | -3.507 | -3.574--3.493 | -4.3x | per iteration |
| `sin` | builtin | `scaled-angle multiply baseline` | 0.576 | 0.580 | 0.522-0.600 | 0.7x | per iteration |
| `cos` | builtin | `scaled-angle multiply baseline` | 0.662 | 0.664 | 0.611-0.697 | 0.8x | per iteration |
| `floor` | builtin | `scaled-index multiply baseline` | -0.239 | -0.226 | -0.302--0.215 | -0.3x | per iteration |
| `frac` | builtin | `scaled-index multiply baseline` | -0.261 | -0.254 | -0.325--0.221 | -0.3x | per iteration |
| `abs` | builtin | `offset multiply baseline` | -0.326 | -0.318 | -0.383--0.298 | -0.4x | per iteration |
| `clamp` | builtin | `unit multiply baseline` | 0.248 | 0.248 | 0.170-0.325 | 0.3x | per iteration |
| `min` | builtin | `unit multiply baseline` | -0.007 | 0.006 | -0.068-0.029 | 0.0x | per iteration |
| `max` | builtin | `unit multiply baseline` | -0.036 | -0.023 | -0.084--0.018 | -0.0x | per iteration |
| `wave` | builtin | `unit multiply baseline` | 0.901 | 0.905 | 0.873-0.916 | 1.1x | per iteration |
| `triangle` | builtin | `unit multiply baseline` | 0.112 | 0.114 | 0.096-0.120 | 0.1x | per iteration |
| `square` | builtin | `unit multiply baseline` | 0.333 | 0.348 | 0.266-0.360 | 0.4x | per iteration |
| `hypot` | builtin | `unit multiply baseline` | 1.630 | 1.645 | 1.573-1.658 | 2.0x | per iteration |
| `atan2` | builtin | `unit multiply baseline` | 0.982 | 0.991 | 0.925-1.024 | 1.2x | per iteration |
| `sqrt` | builtin | `domain-offset multiply baseline` | 1.281 | 1.274 | 1.265-1.307 | 1.6x | per iteration |
| `pow` | builtin | `domain-offset multiply baseline` | 6.788 | 6.790 | 6.751-6.816 | 8.4x | per iteration |
| `time` | builtin | `frame-source multiply baseline` | 0.434 | 0.449 | 0.368-0.456 | 0.6x | per iteration |
| `random` | builtin | `frame-source multiply baseline` | 0.348 | 0.357 | 0.270-0.403 | 0.4x | per iteration |
| `native rgb sink` | color | `sink keep baseline` | 1.700 | 1.706 | 1.668-1.716 | 2.1x | per call |
| `native hsv sink` | color | `native rgb sink` | 0.397 | 0.374 | 0.352-0.454 | 0.5x | per call |
| `mul` | arithmetic | `identity baseline` | 0.809 | 0.807 | 0.800-0.817 | 1.0x | per iteration |
| `call via function-valued var (0 args)` | call | `direct call baseline (0 args)` | -0.002 | 0.001 | -0.054-0.038 | 0.0x | per iteration |
| `call via function-valued var (1 arg)` | call | `direct call baseline (1 arg)` | 0.004 | 0.000 | -0.004-0.020 | 0.0x | per iteration |
| `call via function-valued array element (0 args)` | call | `direct call baseline (0 args)` | 1.557 | 1.572 | 1.514-1.586 | 1.9x | per iteration |
| `call via function-valued array element (1 arg)` | call | `direct call baseline (1 arg)` | 1.572 | 1.570 | 1.564-1.589 | 1.9x | per iteration |

### Round-two findings

- Native hsv() costs 0.374 us/call more than native rgb() with precomputed arguments; the generated VM conversion is 35.308 us/pixel (round one), so the delta is the steady-state direct-sink prize (#557).
- Function values can be stored in scalars and array elements and called; rebinding is available (costs in the call rows above).


### Round three - 2026-07-20 (#559)

Same method (2,593 iterations, 5 samples, paired baselines, reversible probe
load). The production shared HSV capture chain (slot through two 4-arg calls
plus dispatch) versus the #559 per-member specialized conversion, both over
the same direct-write RGB baseline:

| operation | mean net us | median net | vs mul |
|---|---:|---:|---:|
| `shared HSV capture chain (slot-dispatched)` | 39.641 | 39.606 | 49.1x |
| `#559 specialized per-member conversion` | 22.925 | 22.908 | 28.4x |
| `delta (specialization win per call)` | 16.716 | 16.737 | 20.7x |

Raw samples: `issue559-probe.json`. The round-one 35.308 us row measured the
conversion without slot dispatch; the production chain's 39.6 us includes it.

### Round-two caveats

- `floor`, `frac`, `abs`, `min`, and `max` measure at or below their
  same-shape multiply baselines: on this firmware those calls cost no more
  than the multiply they replace. Peepholes that trade them for arithmetic
  (#564) start from zero or negative headroom.
- The negative `ternary select` row means the ternary is ~3.5 us cheaper per
  iteration than the two-multiply arithmetic select it was paired against -
  conditional select is the cheap form on this VM.
- The duplicated `mul` row comes from the separate function-valued probe
  Pattern and doubles as a cross-Pattern consistency check (0.807 us both).
- Native sink rows sample `render(index)` at 256 px with 16 calls per pixel;
  the sink-keep baseline exchanges one local write for the native call, so
  absolute sink costs carry that shape; the hsv-vs-rgb pairing is exact.

### Round four - 2026-09-01 (#924)

Same paired-baseline method (2,596 iterations, 5 samples, 256 px, native
serial assumed). Targeted run via `PROFILE_ONLY=56,57,59` with the table
redirected by `PROFILE_OUTPUT` (`issue924-probe-rows.md`), so the committed
full tables above are untouched. The unrolled probe (fn 57) pairs an
eight-body `i++` loop against a one-body `i++` loop over the same body
count (fn 60, `n8 * 8` trips), so their net is exactly -7/8 of one
iteration's compare + branch + increment.

| operation | group | paired baseline | mean net us | median net | min-max net | vs mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.810 | 0.807 | 0.802-0.826 | 1.0x |
| `loop iteration, i = i + 1 idiom` | loop | `identity baseline` (an `i++` loop) | 1.718 | 1.720 | 1.703-1.741 | 2.1x |
| `unrolled x8 body` | loop | `unrolled-pair baseline (i++ loop, n8 * 8 trips)` | -2.756 | -2.753 | -2.770--2.751 | -3.4x |
| `single-use local` | memory | `fused expression baseline` | 1.459 | 1.465 | 1.420-1.474 | 1.8x |

### Round-four findings

- The unrolled body removes 7/8 of an iteration's compare + branch +
  increment, so an `i++` loop's machinery is 2.753 x 8/7 = **3.15 us per
  iteration**; the catalogue's `i = i + 1` idiom adds 1.72 us on top
  (**4.87 us per iteration**). Unrolling and the `i++` rewrite are both
  exact (#931).
- A single-use local costs its write, 1.47 us, measured as a substitution
  against the fused expression rather than as an extra write (#532 row);
  forward substitution in generated code pays exactly that per site (#930).
