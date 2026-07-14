# Distortion Effect review

The headless recommendation is Ripple, Swirl, Bulge / Pinch, Pixelate, and
Kaleidoscope. Each remains a one-source coordinate Effect: one output pixel
still evaluates one Pattern sample. Stretch is already covered by Scale and
Shear. Glitch remains deferred because its scanline jumps are style-specific
and discontinuous under animation.

This recommendation is implemented so the compiler, persistence model, cost
report, and deterministic fixtures can be reviewed together. It is not final
product approval. Representative-device frame rates and human visual review
remain open gates on issue #456.

## Candidate evidence

The candidate harness samples a fixed 16x16 coordinate lattice and hashes the
result. Generated-expression bytes measure the candidate math alone, before
the surrounding Show runtime. Operation counts are per evaluated output pixel.

| Candidate | Recommendation | Policy | Expression bytes | Scalar | Floor | Trig | Sqrt | atan2 | Preview hash |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Ripple | Ship | Smooth | 101 | 18 | 0 | 1 | 1 | 0 | `cecc0f39` |
| Swirl | Ship | Smooth | 111 | 22 | 0 | 2 | 1 | 0 | `dfddd3e5` |
| Stretch | Affine covers it | Cheap | 31 | 4 | 0 | 0 | 0 | 0 | `bf159c75` |
| Bulge | Ship | Smooth | 79 | 17 | 0 | 0 | 1 | 0 | `b10a0601` |
| Pinch | Ship as Bulge preset | Smooth | 97 | 17 | 0 | 0 | 1 | 0 | `a64874a9` |
| Pixelate | Ship | Cheap | 43 | 8 | 2 | 0 | 0 | 0 | `abea5145` |
| Kaleidoscope | Ship | Smooth | 110 | 19 | 1 | 2 | 1 | 1 | `d06792a5` |
| Glitch | Defer | Cheap | 78 | 13 | 3 | 1 | 0 | 0 | `7ffb36ef` |

## Selected compiler measurements

The real compiler measurement uses the same fixed 2D gradient Pattern for the
baseline and each selected Effect. The baseline generated artifact is 3,848
bytes. These deltas include the complete sampling and clip-addressing path, not
only the expression above.

| Effect fixture | Artifact bytes | Added bytes | Policy |
| --- | ---: | ---: | --- |
| Ripple | 5,882 | 2,034 | Smooth |
| Swirl | 6,424 | 2,576 | Smooth |
| Bulge | 5,806 | 1,958 | Smooth |
| Pinch | 5,808 | 1,960 | Smooth |
| Pixelate | 5,222 | 1,374 | Cheap |
| Kaleidoscope | 6,582 | 2,734 | Smooth |

Every fixture reports `N` Pattern evaluations, exact distortion operation
counts, Clip addressing, zero retained buffers, and deterministic generated
frames. The animated Ripple plus Pixelate fixture exercises the shared Effect
Property path and produces more than two distinct frame hashes.

## Review gates

- [ ] Review the six selected fixtures at low, medium, and high Amount values.
- [ ] Confirm that Bulge and Pinch read as presets of one operation.
- [ ] Confirm that Ripple, Swirl, and Kaleidoscope remain useful on low-resolution
  matrices rather than becoming noise.
- [ ] Run the fixtures on a representative Pixelblaze target and record pixels,
  firmware, artifact bytes, and steady-state frames per second.
- [ ] Accept, tune, or remove each provisional production variant.

The harness intentionally stores representative hardware FPS as `null` until
that measurement occurs. A blank benchmark is better than a very precise lie.
