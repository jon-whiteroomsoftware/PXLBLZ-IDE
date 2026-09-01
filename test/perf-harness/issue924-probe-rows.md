# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-09-01
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,596
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.813 | 0.802 | 0.800-0.857 | 1.0× |
| `loop iteration, i = i + 1 idiom` | loop | `identity baseline` | 1.704 | 1.707 | 1.693-1.709 | 2.1× |
| `unrolled x8 body (net = -7/8 iteration machinery)` | loop | `identity baseline` | -2.538 | -2.536 | -2.547--2.533 | -3.2× |
| `single-use local` | memory | `fused expression baseline` | 1.465 | 1.472 | 1.415-1.495 | 1.8× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
