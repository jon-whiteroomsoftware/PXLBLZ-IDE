# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-09-01
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,589
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.792 | 0.803 | 0.736-0.812 | 1.0× |
| `pow(base, 2), integer exponent` | transcendental | `identity baseline` | 2.282 | 2.286 | 2.222-2.325 | 2.8× |
| `multiply chain k=2 (hoisted base)` | arithmetic | `identity baseline` | 2.539 | 2.549 | 2.479-2.570 | 3.2× |
| `pow(base, 3), integer exponent` | transcendental | `identity baseline` | 7.629 | 7.629 | 7.622-7.639 | 9.5× |
| `multiply chain k=3 (hoisted base)` | arithmetic | `identity baseline` | 3.623 | 3.622 | 3.614-3.631 | 4.5× |
| `pow(base, 4), integer exponent` | transcendental | `identity baseline` | 7.642 | 7.649 | 7.583-7.675 | 9.5× |
| `squared-square k=4 (hoisted base)` | arithmetic | `identity baseline` | 5.074 | 5.085 | 5.020-5.090 | 6.3× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
