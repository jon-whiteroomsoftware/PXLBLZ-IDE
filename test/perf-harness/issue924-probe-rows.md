# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-09-01
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,593
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.793 | 0.805 | 0.729-0.819 | 1.0× |
| `loop iteration, i = i + 1 idiom` | loop | `identity baseline` | 1.691 | 1.708 | 1.632-1.719 | 2.1× |
| `unrolled x8 body (net = -7/8 iteration machinery)` | loop | `unrolled-pair baseline (i++ loop, n8 * 8 trips)` | -2.757 | -2.752 | -2.783--2.747 | -3.4× |
| `single-use local` | memory | `fused expression baseline` | 1.468 | 1.471 | 1.434-1.495 | 1.8× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
