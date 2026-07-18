# Shared generated Effect kernels (#538)

## Decision

Production compilation shares the generated matrix-update body for every
compatible repeated family of at least two animated Scale Effects. The selected
representation is an exact capacity optimization: it reduces source,
Controller bytecode, and persistent globals without adding array words or
per-pixel branches. It does not claim an FPS improvement.

The first family is intentionally narrow. Each member must have one Scale
Effect, the same ordered Effect and parameter structure, the same animated
property-track shape, the same adaptation shape, and the same composition
environment. Other affine families and mixed stacks remain unrolled.

## Representation contract

The compiler emits one parameterized matrix kernel per compatible structural
group. Every Pattern instance retains its own clock, private state, Controls,
Effect parameter globals, final six-value affine matrix, and authored identity.
A small member-owned update wrapper calls the shared kernel and copies its six
results into that member's matrix.

The wrapper is required for correctness. Placement property tracks call the
member update entry point after assigning animated values. Sharing the body
without preserving that entry point would bypass the property-track contract.

Structural identity includes:

- Effect order, kinds, and parameter names;
- the Effect index and parameter targeted by property animation;
- mirror, shutter, stepped-clock, and brightness adaptation shape;
- output dimension, content-key, coordinate-field, and static-plan context;
- independent member ownership of clocks, Controls, and state.

Unsupported families and structures with no repeated identity report an
explicit unrolled reason. `generatedEffectKernelSharing: false` retains the
counterfactual artifact.

## Capacity results

The fixture uses one animated Scale Effect per member and measures the complete
generated Show artifact. Fast and Precise replay match at every 2/5/10-member
score point.

| Members | Compact source | Expanded source | Controller bytecode | Persistent globals | VM words | Per-pixel branches |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 baseline | 7,665 | 12,591 | 4,586 | 51 | 60 | 5 |
| 2 shared | 5,954 | 8,930 | 3,962 | 45 | 60 | 5 |
| 5 baseline | 18,334 | 29,735 | 10,718 | 120 | 60 | 11 |
| 5 shared | 12,584 | 18,880 | 7,898 | 96 | 60 | 11 |
| 10 baseline | 36,409 | 58,494 | 20,938 | 235 | 60 | 21 |
| 10 shared | 23,857 | 35,649 | 14,458 | 181 | 60 | 21 |

At two members, the selected representation saves 1,711 compact source bytes,
3,661 expanded bytes, 624 Controller-bytecode bytes, and six persistent globals.
At ten members it saves 12,552 compact bytes, 22,845 expanded bytes, 6,480
bytecode bytes, and 54 globals. VM array use and per-pixel branch count do not
change.

The global formula is exact for one group:

```text
baseline scratch globals = 6 * members
shared scratch globals = 6
globals avoided = 6 * (members - 1)
```

Member-owned Effect parameters and final matrices remain separate and are not
included in that reclaim.

## Controller qualification

The reversible probe used controller `.224`, pb32 firmware 3.67, at 2,000
pixels. It activated baseline and shared artifacts for all three member counts,
collected ten FPS samples per artifact, and restored the original Pattern and
256-pixel configuration in `finally`.

| Members | Baseline median FPS | Shared median FPS | Change |
| ---: | ---: | ---: | ---: |
| 2 | 16.521 | 16.473 | -0.29% |
| 5 | 16.330 | 16.268 | -0.38% |
| 10 | 16.346 | 16.252 | -0.57% |

The sub-0.6% median differences are runtime-neutral for this probe. Selection
therefore rests on exact output and fewer measured bytecode bytes. Since the
smallest two-member case is already smaller, production selects every compatible
group with at least two members.

## Verification

- Pure structural-planner tests cover compatible grouping, property/adaptation/
  environment separation, instance ownership, and bytecode-gated selection.
- Compiler tests cover shared emission, member wrappers, property-track shape,
  incompatible fallback, and Fast/Precise parity.
- `npm run issue538` pins the 2/5/10 capacity matrix and zero per-pixel branch
  growth.
- `npm run issue538:hardware` compiles, activates, measures, and restores the
  Controller state.
