# Issue #525 shared Motion transition results

Issue #525 made the 21-Scene Motion Transitions reference activatable without
changing its visual output. The production compiler now shares invariant routed
transition structure and parameterizes only the Motion values that vary. This is
a source-capacity win; controller measurements do not support an FPS claim.

## Fixture and boundaries

The authoring correction landed first and is intentionally separate from the
compiler optimization. Reusing the reference Show's two content Pattern
instances reduced its artifact from 150,937 to 107,943 bytes while retaining 21
Scenes and 20 boundary entities. Physical three-plane arena declarations from
#515 add 90 bytes, making 108,033 bytes the unrolled #525 baseline. The complete
Show has three Pattern instances: two content instances shared by every Scene
and one additional referenced instance required by the choreography.

The benchmark compares three generated representations:

- **Unrolled** repeats each routed Scene-stack wrapper and transition body.
- **Shared environment** interns equivalent stacks and emits routing/local-index
  setup once, but keeps one exact Motion body per boundary.
- **Family kernels** also groups direction-parameterized Cover, Reveal, and Push
  bodies and affine-parameterized Zoom In bodies. Seven scheduler-written
  scalar globals carry direction, endpoint scale, anchor, and signed rotation.

Production selects family kernels only for compatible all-Motion, single-zone,
2D routed sequences when the candidate is smaller. Mixed transition families,
routing switches, routing-property ramps, placement property tracks, transition
ramps, and non-single logical layouts retain unrolled emission.

## Compile and resource results

| Representation | Source bytes | Expanded bytes | Controller bytecode | Persistent globals | VM words | Activation headroom | Stack plans | Kernels |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Unrolled | 108,033 | 190,117 | 59,202 | 144 | 6,012 | -39,649 B | 21 | 20 |
| Shared environment | 73,180 | 124,181 | 41,102 | 68 | 6,012 | -4,796 B | 2 | 20 |
| Family kernels | 67,552 | 114,054 | 37,722 | 75 | 6,012 | +832 B | 2 | 11 |

The selected representation removes 40,481 source bytes (37.5%) and 21,480
Controller-bytecode bytes (36.3%) from the unrolled baseline. Its transition
emission is 21,997 bytes rather than 101,197, avoiding 79,200 emitted bytes. It
adds no array words and no per-pixel branch depth; the existing three-plane
arena remains the entire 6,012-word VM allocation.

## Exactness

`npm run issue525` samples the start, midpoint, and end of all 20 Motion
boundaries: 60 score times in Fast and Precise execution. Both compact
representations match the unrolled checksums at every sample.

The regression corpus also sweeps Cover, Reveal, Push, Content Grow, Content
Shrink, Zoom In, and Zoom Out across Clip and Wrap addressing and hard and full
blend policies. It varies direction, anchor, endpoint scale, rotation, and spin
direction. The family representation remains exact in Fast and Precise modes.
A mixed Motion/Wipe sequence proves that incompatible choreography falls back to
unrolled emission.

## Controller qualification

Hardware measurements used controller `.224`, pb32 firmware 3.67. Each isolated
probe temporarily changed pixel count, activated one representation, collected
24 FPS samples for six seconds, and restored the original Pattern and 256-pixel
configuration in `finally`. The harness polls activation and restoration for up
to ten seconds and reconnects after a controller-side reset.

| Pixels | Representation | Mean FPS | Median FPS | Min | Max |
| ---: | --- | ---: | ---: | ---: | ---: |
| 256 | Unrolled | 5.295 | 5.333 | 3.902 | 6.009 |
| 256 | Family kernels | 5.615 | 5.623 | 5.133 | 6.029 |
| 1,000 | Unrolled | 1.411 | 1.362 | 1.286 | 1.558 |
| 1,000 | Family kernels | 1.426 | 1.413 | 1.325 | 1.559 |
| 2,000 | Unrolled | 0.655 | 0.665 | 0.611 | 0.669 |
| 2,000 | Shared environment | 0.669 | 0.665 | 0.629 | 0.779 |
| 2,000 | Family kernels | 0.668 | 0.665 | 0.628 | 0.779 |

The 2,000-pixel median is unchanged at 0.665 FPS. Mean differences are about 2%
and smaller than the observed range, so the measured runtime disposition is
neutral. The selected source activates inside the measured source budget; the
unrolled source remains useful as a benchmark counterfactual but is not a
production-fit artifact.

One combined 1,000-pixel run activated the oversized baseline and then lost the
controller connection before the compact candidate activated. Earlier broad
matrix work showed the same failure after several large sequential pushes.
Those rows are excluded from comparisons. Isolated runs succeeded, and the
hardened restoration poll returned the controller to its original program and
pixel count. This distinction matters: source activation fit, compiled bytecode
size, and steady-state FPS are separate axes.

## Decision

Family kernels are the production representation for compatible sequences.
They are exact, use no scarce array memory, fit the measured activation budget,
and do not impose a measured runtime regression. The shared-environment form
remains a benchmark boundary that proves where the two structural savings come
from. Unrolled emission remains the safe fallback for incompatible Shows.
