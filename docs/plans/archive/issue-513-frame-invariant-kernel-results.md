# Issue 513 frame-invariant and render-kernel results

Frame-invariant hoisting is enabled for production Show compilation; render-
kernel specialization remains diagnostic and opt-in. On the pb32 Controller,
seven exact Redline hoists improved the three-run aggregate at 2,000 pixels by
1.68%, while the structurally smaller kernel artifact did not produce a stable
runtime gain. Fast and Precise output matched the #512 compiler boundary at all
nine sampled score times.

## Reproduce

```bash
npm run issue513
PIXELBLAZE_IP=192.168.8.224 npm run issue513:hardware
```

The hardware harness compiles artifacts with the Controller's embedded compiler,
records the original active Pattern and pixel count, measures 256, 1,000, and
2,000 pixels, and restores the original state in `finally`. Set
`ISSUE513_PIXEL_COUNTS=2000` for a shorter paired repeat.

## Selected frame work

The Acorn-backed pass searches renderer-reachable local initializers and selects
only pure expressions whose dependencies are constant for one frame. Redline
contributes seven bindings: `density`, `ringCount`, `spokeCount`, `thick`,
`finalPunctuation`, `hitWidth`, and `surfaceGlow`. Their initializers move into
one generated update function that runs after the member's authored
`beforeRender` and before the first pixel evaluation.

At 2,000 pixels, the pass moves 18 operations per evaluated pixel, or an
estimated 35,982 operations per frame, into seven once-per-frame updates. It
adds 558 source bytes and 332 Controller bytecode bytes. The whole-Show VM
ledger remains 6,096 words because the seven cached values are scalars rather
than array allocations.

Expressions depending on pixel index, sample coordinates, `pixelCount`,
renderer-mutated state, unknown calls, or local evaluation order remain in the
renderer. The pass also preserves authored Pattern state: it creates no second
Pattern instance or clock.

## Exactness matrix

Fixture: `stock-show-showcase-redline-installation`, 2,000 pixels. Score samples
were taken at 0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, and 59.5 seconds.

| Numeric mode | Production hoisting matches #512 boundary |
| --- | --- |
| Fast | Yes, all 9 score times |
| Precise 16.16 | Yes, all 9 score times |

Aurora Sphere and Pendulum Wave select frame-invariant work in unrelated stock
Pattern tests. A renderer-mutated private-state fixture selects nothing.

## Final pb32 hardware matrix

Controller: pb32, firmware 3.67. Original configuration: 256 pixels. Each
artifact settled for 2 seconds and contributed 24 FPS samples over 6 seconds.

| Pixels | #512 boundary FPS | Production hoisting FPS | Change |
| ---: | ---: | ---: | ---: |
| 256 | 16.640 | 17.111 | +2.83% |
| 1,000 | 4.713 | 4.836 | +2.62% |
| 2,000 | 3.007 | 3.010 | +0.07% |

The final 2,000-pixel pass was close to neutral, so the production decision uses
three paired all-seven-invariant runs rather than selecting the most favorable
sample:

| Run | #512 boundary | Hoisting only | Change | Combined with kernels | Kernel only |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.968 | 3.080 | +3.76% | 3.008 | 2.994 |
| 2 | 2.986 | 3.023 | +1.23% | 3.039 | 2.990 |
| 3 | 3.007 | 3.010 | +0.07% | 3.043 | 2.993 |
| Aggregate mean | 2.987 | 3.037 | +1.68% | 3.030 | 2.992 |

The aggregate shows a modest hoisting gain whose relative value is clearer at
smaller output counts. It does not support describing #513 as a large Redline
speedup.

## Kernel decision

Kernel emission separates 18 configuration plans from two inline render bodies.
It reduces delivered source and Controller bytecode, but its hardware result
changed sign across repeated experiments, including earlier function-call and
inline forms. Plan count minus kernel count is only a worst-case branch bound;
common plans can exit the baseline chain early, and kernel selection introduces
its own state and dispatch.

Production compilation therefore retains the baseline dispatch and reports
`hardware-profile` as the decline reason. Explicit benchmark compilation can
still emit the candidate so another Controller or output profile can qualify it
later. Smaller code is useful evidence, not a CPU benchmark wearing a fake
mustache.

## Epic ledger line

```text
03 #513 frame-invariant hoisting · paired 2,000 px mean 2.987 -> 3.037 FPS (3 runs) · incremental +1.7% · cumulative reference 2.358 -> 3.037 FPS, +28.8%
```
