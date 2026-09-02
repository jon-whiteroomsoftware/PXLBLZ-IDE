# Native operation cost table - Pixelblaze hardware

**Generated:** 2026-09-01
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** Controller-native output (topology is not exposed by getConfig)
**Pixel count:** 256
**Inner-loop count:** 2,588
**Samples per operation:** 5

Each operation is subtracted sample-by-sample from its declared paired baseline. The table reports net time per loop iteration and normalizes median cost to one multiply.

| operation | group | paired baseline | mean net us/iteration | median net | min-max net | relative to mul |
|---|---|---|---:|---:|---:|---:|
| `mul` | arithmetic | `identity baseline` | 0.813 | 0.808 | 0.800-0.844 | 1.0× |
| `exp(-t), t in [0.1, 3.1]` | transcendental | `identity baseline` | 22.133 | 22.120 | 22.083-22.240 | 27.4× |
| `reciprocal quartic for exp(-t)` | arithmetic | `identity baseline` | 11.644 | 11.636 | 11.630-11.671 | 14.4× |
| `pow(b, 1.3), b in (0, 1]` | transcendental | `identity baseline` | 8.465 | 8.458 | 8.451-8.496 | 10.5× |
| `cubic fit for pow(b, 1.3)` | arithmetic | `identity baseline` | 6.781 | 6.768 | 6.761-6.837 | 8.4× |
| `asin on [0, 0.98)` | inverse-trig | `identity baseline` | 4.784 | 4.773 | 4.766-4.821 | 5.9× |
| `Abramowitz-Stegun asin (sqrt + cubic)` | arithmetic | `identity baseline` | 12.314 | 12.304 | 12.285-12.368 | 15.2× |
| `Shader.tanh (exp + divide)` | transcendental | `identity baseline` | 46.067 | 46.068 | 46.022-46.103 | 57.0× |
| `rational fastTanh` | arithmetic | `identity baseline` | 11.820 | 11.818 | 11.807-11.839 | 14.6× |
| `log on [0.5, 1.5)` | transcendental | `identity baseline` | 1.483 | 1.477 | 1.475-1.506 | 1.8× |
| `acos on [0, 0.98)` | inverse-trig | `identity baseline` | 4.868 | 4.863 | 4.859-4.891 | 6.0× |
| `reciprocal (divide)` | arithmetic | `identity baseline` | 2.215 | 2.209 | 2.204-2.242 | 2.7× |

## Method and caveats

- Paired baselines preserve the loop, indexing, or direct-expression shape needed to isolate memory, call, and branch exchanges.
- Near-zero or negative net values are indistinguishable from their paired baseline on this profile; they are not clamped into a claimed win.
- Controller FPS remains authoritative for complete Show artifacts. Native micro-costs calibrate hypotheses but do not qualify production defaults by themselves.
