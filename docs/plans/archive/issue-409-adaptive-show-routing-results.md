# Issue 409 adaptive Show routing results

Pattern Prism was compiled in two forms from the same visual design. Emulator timings are operation-count proxies; controller FPS is authoritative.

## Resource comparison

| Variant | Source B | Device bytecode B | Routing arrays | Routing elements |
| --- | ---: | ---: | ---: | ---: |
| Fixed packed | 54304 | 25838 | 1 | 1024 |
| Adaptive predicates | 17171 | 5826 | 0 | 0 |

The packed form permanently allocates one 1,024-element routing array. The adaptive form uses scalar temporaries only, so routing RAM is constant with pixel count.

A lazy cache was rejected for this artifact. Caching owner plus local coordinates would reduce repeated predicate work, but restores pixel-count-proportional arrays, adds initialization cost, and those arrays cannot be freed during the Pixelblaze program's lifetime. It remains a possible bounded optimization when measured CPU pressure matters more than RAM.

## Emulator matrix

| Variant | Pixels | Fast ms/frame | Precise ms/frame |
| --- | ---: | ---: | ---: |
| fixed packed | 256 | 0.210 | 0.882 |
| adaptive predicates | 256 | 0.229 | 0.669 |
| adaptive predicates | 1024 | 0.437 | 2.671 |
| adaptive predicates | 4096 | 1.448 | 11.396 |

## Controller FPS

At the controller's configured pixel count, fixed packed measured 13.16 FPS (13.00-13.25), while adaptive predicates measured 13.33 FPS (12.68-13.57). The adaptive artifact was left active.

## Compatibility boundary

- Automated: normalized 2D maps at 16x16 and 32x32, arbitrary wiring order, full coverage, non-black output in every phase, continuous member clocks, and no fixed maximum index.
- Expected with changed composition: rectangular 2D maps. The geometry still fills the map, but grids, stripes, and radial sectors inherit the map aspect ratio.
- Approximate: patterns that use `index` or `pixelCount` for 2D structure. The compiler synthesizes a square route-local index from local coordinates.
- Not represented by this spike: explicit physical-pixel exceptions, disconnected surfaces, 1D strips, 3D volumes, overlapping logical zones, or logical zones with unequal pixel density.
- Human verified on the 256-pixel external matrix: every layout remained recognizable and changes between layouts were seamless, with no visible flash.

## Recommendation

Keep all three compiler strategies. Use coordinate predicates for supported logical geometry, fixed range/formula routing for installation-specific layouts, and packed tables only for irregular layouts that fit the explicit element budget. Compatibility should be derived from authored routing semantics and surfaced as Recommended, runnable with caveats, or fixed/incompatible.

Artifact: `artifacts/electromage/pattern-prism-adaptive.epe`
