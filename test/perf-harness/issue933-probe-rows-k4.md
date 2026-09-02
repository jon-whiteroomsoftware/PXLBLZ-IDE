# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-09-01
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,592
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.802 | 0.800 | 0.799-0.808 | 1.0× |
| `pow(base, 4), integer exponent` | transcendental | `identity baseline` | 7.658 | 7.650 | 7.648-7.677 | 9.6× |
| `multiply chain k=4 (hoisted base)` | arithmetic | `identity baseline` | 4.699 | 4.692 | 4.688-4.731 | 5.9× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
