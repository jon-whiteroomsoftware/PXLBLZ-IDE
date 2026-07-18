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
