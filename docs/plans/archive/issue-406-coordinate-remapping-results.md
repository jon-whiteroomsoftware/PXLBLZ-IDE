# Issue #406 coordinate-remapping prototype results

Measured with `npm run issue406` on a 32x32 map for 64 measured frames after 16
warm-up frames. The fixture uses the same Pattern body for all candidates.

| Candidate | Artifact bytes | Scalar globals | Per-frame trig | Per-pixel remap work | Fast ms/frame | Precise ms/frame |
|---|---:|---:|---:|---|---:|---:|
| Baseline | 3,858 | 0 | 0 | none | 0.0599 | 0.0587 |
| Synchronized tiling | 4,021 | 1 | 0 | 2 multiply + 2 `frac` | 0.0270 | 0.0488 |
| Center rotation | 4,424 | 3 | 2 | 4 multiply + 6 add/subtract + 2 `frac` | 0.0265 | 0.0512 |

The emulator timings are host-load and JIT sensitive and do not imply that
extra coordinate work is faster than the baseline. They show no observed
regression at this scale. Structural cost selects synchronized tiling: it has
the smallest source/storage footprint and the fewest deterministic operations.
A physical Pixelblaze FPS comparison remains the authoritative performance
gate.
