# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-09-01
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,594
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.810 | 0.807 | 0.802-0.826 | 1.0× |
| `loop iteration, i = i + 1 idiom` | loop | `identity baseline` | 1.718 | 1.720 | 1.703-1.741 | 2.1× |
| `unrolled x8 body (net = -7/8 iteration machinery)` | loop | `unrolled-pair baseline (i++ loop, n8 * 8 trips)` | -2.756 | -2.753 | -2.770--2.751 | -3.4× |
| `single-use local` | memory | `fused expression baseline` | 1.459 | 1.465 | 1.420-1.474 | 1.8× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
