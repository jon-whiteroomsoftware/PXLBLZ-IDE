# Issue 410 adaptive spatial-operator results

Controller: pb32, firmware 3.67, configured pixels 256.

## Operator matrix

| Operator | Pixels | Source B | Bytecode B | Fast ms | Precise ms | Hardware FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| grid | 256 | 517 | 538 | 1.010 | 3.031 | 54.95 |
| stripes | 256 | 468 | 478 | 0.342 | 1.246 | 83.06 |
| checker | 256 | 522 | 538 | 1.093 | 1.903 | 73.27 |
| rings | 256 | 566 | 558 | 0.706 | 1.812 | 65.64 |
| pinwheel | 256 | 611 | 602 | 0.986 | 1.588 | 60.31 |
| wave | 256 | 502 | 506 | 1.450 | 1.885 | 78.06 |
| soft-split | 256 | 484 | 482 | 0.582 | 2.232 | 82.38 |
| grid | 2048 | 517 | 538 | 0.811 | 1.676 | 9.27 |
| stripes | 2048 | 468 | 478 | 1.232 | 1.285 | 10.53 |
| checker | 2048 | 522 | 538 | 0.936 | 1.487 | 9.27 |
| rings | 2048 | 566 | 558 | 1.016 | 1.752 | 8.32 |
| pinwheel | 2048 | 611 | 602 | 1.391 | 1.954 | 7.63 |
| wave | 2048 | 502 | 506 | 0.862 | 1.477 | 9.89 |
| soft-split | 2048 | 484 | 482 | 1.106 | 1.114 | 10.44 |

## Resource boundary

- [ElectroMage documents](https://electromage.com/pixelblaze/) 256 globals, 256 stack variables, and 10,240 array elements for Pixelblaze V3.
- The operator probes use one scalar global (`t`); the showcase uses two (`t` and elapsed time).
- [Arrays are the only dynamically allocated Pattern memory](https://electromage.com/docs/language-reference/) and cannot be freed during the program lifetime.
- Firmware activation probes: array(2048)=active; array(4096)=active; array(6144)=active; array(8192)=active; array(10240)=active; array(10241)=active.
- The documented 10,240 figure is therefore not a hard activation cutoff on firmware 3.67. The spike deliberately did not allocate toward heap exhaustion.
- PXLBLZ should reserve headroom for member Pattern buffers rather than spend the device maximum on routing; operator formulas consume constant routing memory.

## Representation comparison at 2048 pixels

| Strategy | Source B | Bytecode B | Array elements | Hardware FPS |
| --- | ---: | ---: | ---: | ---: |
| direct | 178 | 181 | 0 | 16.18 |
| lazy-cache | 330 | 293 | 2048 | 16.18 |
| baked | 31789 | 41085 | 2048 | 16.18 |

The three strategies were tied on hardware. Lazy caching bought no measurable runtime improvement. Baking consumed 2,048 permanent elements and 41,085 bytes of bytecode, roughly 60% of the previously measured 68,384-byte activation budget, to reproduce a 181-byte formula.

The lazy cache has three distinct costs: one 2,048-element permanent array, a first-pass formula plus array write for every pixel, and a recurring array read/branch thereafter. The FPS sampler measures the steady state after settling, so it does not quantify the first-pass hitch; that unmeasured startup cost cannot improve the tied steady-state result.

## Compatibility boundary

- All seven candidates require normalized continuous 2D Stage coordinates and are independent of pixel index/wiring order.
- Grid, stripes, checker, wave, and soft split remain structurally meaningful on rectangular planes, although their visual proportions change.
- Rings and pinwheel assume approximately isotropic coordinates. Wide/tall maps turn circles into ellipses unless the compiler receives aspect correction.
- Irregular but continuous 2D maps are runnable; sparse/disconnected surfaces can create visually surprising gaps at region boundaries.
- 1D strips and 3D volumes require separate operator definitions rather than silent projection through this 2D vocabulary.
- Pattern buffers and neighbor/index-dependent effects remain a separate compatibility constraint even when routing itself is adaptive.

## Artifact

- Standalone unchanged EPE: `artifacts/electromage/adaptive-spatial-operator-showcase.epe`
- The showcase was verified on the 256-pixel external matrix: all phases looked good on hardware.
- The same EPE was imported into PXLBLZ and visually approved at 2,048 preview pixels without recompilation; automated coverage also exercises 256 and 1,024 pixels.

## Preliminary recommendation

- Adopt grid, stripes, checker, rings, pinwheel, wave, and soft split as the candidate Stage-space vocabulary.
- Prefer direct formulas for static and animated operators. Cache only measured bottlenecks because caches scale with pixel count and cannot be freed.
- Treat soft boundaries as explicit two-renderer cost; hard ownership keeps one renderer per pixel.
- Keep exact physical routing as a separate installation-bound representation.
- Budget routing arrays against total merged-Pattern pressure: 0 elements is preferred; up to 2,048 is a conservative compatibility fallback; 2,049-4,096 requires an explicit measured justification; larger routing allocations should be rejected by default even when firmware can activate them.
