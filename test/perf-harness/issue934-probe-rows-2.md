# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-09-01
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,587
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.814 | 0.812 | 0.801-0.843 | 1.0× |
| `exp(-t), t in [0.1, 3.1]` | transcendental | `identity baseline` | 22.196 | 22.192 | 22.134-22.261 | 27.3× |
| `pow(b, 1.3), b in (0, 1]` | transcendental | `identity baseline` | 8.468 | 8.458 | 8.436-8.532 | 10.4× |
| `64-entry table + lerp for exp(-t)` | memory | `identity baseline` | 14.832 | 14.820 | 14.803-14.878 | 18.3× |
| `(1 + t/16)^-16 for exp(-t)` | arithmetic | `identity baseline` | 17.753 | 17.744 | 17.707-17.839 | 21.9× |
| `quadratic fit for pow(b, 1.3)` | arithmetic | `identity baseline` | 4.926 | 4.909 | 4.899-4.990 | 6.0× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
