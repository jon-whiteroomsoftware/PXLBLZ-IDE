# Pattern field/shading research results (#540)

## Conclusion

A narrow Pattern field/shading contract is technically justified. It is not a
universal Pattern optimization: 7 of 62 reviewed Patterns (11.3%) have a clean,
expensive, render-pure scalar producer that can be shared exactly across two or
more cheap shading consumers. The qualifying family is coherent noise,
inverse-distance density, and signed-distance geometry. Multi-channel
raymarchers and Patterns that accumulate RGB inside their expensive loop do not
qualify.

The diagnostic proved a large Controller win. Sharing one exact metaball field
raised median FPS by 40.4-68.8% with two consumers and 109.9-110.7% with five
consumers across the 256, 1,000, and 2,000-pixel matrix. Fast and Precise output
matched. The trade is one `pixelCount + 4`-word scalar plane, one persistent
global, 162-196 compact source bytes, and 56 Controller bytecode bytes.

This result supports a separate human-reviewed public authoring/API proposal.
It does not add a saved Pattern contract or production compiler behavior.

## Proceed gate

The gate was recorded before prototype measurements:

- review every bundled Pattern and a representative attributed community sample;
- require at least three candidates and at least 10% incidence;
- require expected fan-out of at least two consumers;
- require a reviewed producer operation score of at least 40;
- require exact scalar separation, a render-pure producer, and a complete
  field/shading/mixed control partition.

The corpus contains 59 bundled Patterns and three community Patterns. Seven
Patterns passed, for 11.3% incidence. The gate therefore opened.

The deterministic source of truth is
`test/perf-harness/issue540.ts`. It records every Pattern's geometry cost,
shading separability, exact coverage, Controls, time/state dependencies,
reviewed purity, operation score, provenance, and notes. The report also keeps
the independent syntax-based render-state analysis so uncertain helper calls
are not silently promoted to pure.

## Credible scalar producers

| Pattern | Scalar producer | Exact coverage | Control boundary | Score |
| --- | --- | --- | --- | ---: |
| Caustics | Voronoi/noise light intensity | none; tinted base is always present | density, sharpness, speed / tint | 120 |
| Gyroid Glow 3D | gyroid signed field `g` | alpha from field | scale, speed / color, thickness | 75 |
| Kaleido Bloom | repeated dot/ring SDF union | alpha from field | breathe, speed, zoom / color spread | 44 |
| Magnetic Filaments | signed inverse-distance charge field | alpha from field plus cheap analytic cores | speed is mixed / contrast, glow, spacing | 54 |
| Metaball Garden | inverse-square density `f` | alpha from field | blob count, speed / palette; softness is mixed | 80 |
| Shape Shifter | blended signed distance `d` | alpha from field | shape, speed / color, contours, feather | 85 |
| Topographic Bloom | smooth-unioned signed distance `d` | alpha from field | layers and speed are mixed / color, spacing | 76 |

These are reusable producers, not merely similar-looking expressions. Each
producer returns one scalar whose downstream shading is materially cheaper than
recomputing the producer.

## Reviewed negatives

The following expensive bundled Patterns fail because the expensive path
produces multiple coupled values, performs stateful render work, or accumulates
color directly:

Aurora Sphere, Crystal Lattice 3D, Event Horizon, Harmonograph, Iridescent
Fibers, Kishimisu, Lava Lamp 3D, Mandelbulb Heartbeat, Moire Cathedral,
Murmuration, Nebula Sphere, Neon Circuit Board, Neon Squircles, Orrery 3D,
Phantom Star, Plasma Nebula, Redline Machine, Ribbon Loom, Scene Splice, Scene
Splice 3D, Shader Showcase, Star Nest Reimagined, Tempest Volume 3D, and Zippy
Zaps.

The following bundled Patterns do not contain a distinct scalar producer costly
enough to repay capture and replay:

Clockwork Iris, Comet Loom, Compass Rose, Core Pulse 3D, Crystal Rain 3D, Eased
Sweep, Ember Spire, Firefly Choir, Glyph Rain, Heat Shimmer Tiles, Helix Forge
3D, IQ Palettes, Impact Engine, Kinetic Sculpture, Lattice Warp 3D, Metro Lines,
Nebula Shells 3D, Pendulum Wave, Pulse Loom, Rivalry Ring, Shoal Scatter 3D,
Signal Mandala, Stained Glass Weather, Standing Wave Organ, Test Pattern 1D,
Test Pattern 2D, Test Pattern 3D, and Voxel Fireflies 3D.

The community sample is copied as attributed research fixtures from the
[Electromage Pattern library](https://electromage.com/patterns/):

| Pattern | Author | Classification |
| --- | --- | --- |
| Coronal Mass Ejection 2D | ZRanger1 | expensive noise scalar, but render-mutating undeclared scratch prevents direct contract use |
| Line Dancer 2D | ZRanger1 | no profitable scalar split; the polar helper mutates coordinate scratch |
| Mandelbrot Set 2D | JEM (ZRanger1) | ideal escape-iteration scalar and exact empty mask, but undeclared scratch must first be localized |

Mandelbrot is the most useful near miss: a very small Pattern refactor could
make it contract-safe, and the escape value could drive both color and
coverage-directed composition.

## Diagnostic contract

The prototype declares only enough structure to falsify the optimization:

- output: one scalar metaball density;
- coordinate domain: normalized 2D map coordinates;
- lifetime: one frame;
- exactness: exact;
- purity: render-pure;
- field Controls: blob count and speed;
- shading Controls: palette and threshold.

Two consumers are compatible when every field Control matches. Shading Controls
may differ. The direct artifact evaluates `k(G + S)`. The shared artifact
evaluates `G + kS`, writes `G` once into a scalar plane, and reads it for each
shading consumer. The direct and shared artifacts retain the same consumer and
compositing order.

## Measurements

Controller: Burner bag Pixelblaze pb32, firmware 3.67. Each result used a drain
Pattern before both sides, 1,500 ms settle, and 12 samples. The original program
`pxbg3carHT6eYhdRh` and 256-pixel configuration were restored.

| Pixels | Consumers | Direct median FPS | Shared median FPS | Change | Scalar-plane words |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 256 | 2 | 18.756 | 26.341 | +40.44% | 260 |
| 256 | 5 | 7.976 | 16.765 | +110.19% | 260 |
| 1,000 | 2 | 4.817 | 6.770 | +40.54% | 1,004 |
| 1,000 | 5 | 2.044 | 4.307 | +110.67% | 1,004 |
| 2,000 | 2 | 2.008 | 3.390 | +68.81% | 2,004 |
| 2,000 | 5 | 1.026 | 2.154 | +109.87% | 2,004 |

The two-consumer artifact grows from 1,556 to 1,718 source bytes and from 1,430
to 1,486 bytecode bytes. The five-consumer artifact grows from 2,393 to
2,588-2,589 source bytes and from 2,162 to 2,218 bytecode bytes. Both add one
persistent global. Fast and Precise frames match at the sampled times.

The software benchmark is deliberately secondary. Fast preview became much
slower with the explicit array because V8 can inline and eliminate repeated
pure calculations that Pixelblaze executes. Precise emulation was 8.2% slower
at two consumers and 7.1% faster at five consumers. Neither software runtime is
used as a Controller performance proxy; the divergence is itself evidence that
Controller measurements remain mandatory for this optimization class.

## Decision and boundary

The research result is positive, with three restrictions:

1. Sharing must remain authored and explicit. Compiler-inferred program slicing
   is outside the evidence and would make dependency mistakes difficult to see.
2. The first production contract should support one render-pure scalar field,
   explicit dependencies, stateless shading, and exact replay only.
3. The compiler must cost producer work, expected fan-out, arena ownership,
   source/bytecode growth, VM words, and globals. Non-profitable or uncertain
   cases must remain direct with a reported reason.

Multi-channel fields, implicit extraction from arbitrary Pattern code, and
stateful producers remain future research.
