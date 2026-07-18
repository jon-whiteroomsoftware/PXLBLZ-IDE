# Table-driven Show score results

Issue #542 separated repeated Show choreography from the executable machinery
that choreography selects. Compatible compiled Shows now carry each Pattern
instance, Scene-stack renderer, and Transition kernel once. A compact score
selects and configures that machinery in `beforeRender`.

This representation changes generated code structure, not Show semantics.
Pattern identity, private state, Controls, clock continuity, evaluation policy,
authored boundary identity, and Fast/Precise output remain unchanged.

## Shipped representation

Each boundary uses five words:

| Field | Meaning |
| --- | --- |
| outgoing stack | index of the interned source Scene stack |
| incoming stack | index of the interned destination Scene stack |
| Transition kernel | index of unique generated Transition machinery |
| easing | scheduler-only easing identity |
| duration | boundary duration in seconds |

Regular boundary cadence uses a generated initialization loop instead of
literal timing assignments. `beforeRender` resolves the active row, computes
Transition progress, and writes the active stack, kernel, and easing state. The
pixel renderer branches only over unique stack plans and Transition kernels.
Scene count no longer multiplies that per-pixel machinery. The score consumes
ordinary interned-plan words and no render-target planes.

Pattern-state ownership remains the first identity boundary. Equal source or
names do not merge instances. Stack identity includes routing, ordered
placements, member identity, render function, view, opacity, content key,
Effects, sample domain, and static property targets. Kernel identity includes
the complete composition environment and every discrete policy that changes
the emitted body. Easing stays frame-rate scheduler data.

## Compatibility and fallback

The first production envelope accepts one logical 2D Zone, static placements,
one routing layout, and cut, Crossfade, Fade through color, wipe, dither, or
portal boundaries. It rejects routing switches, routing-property ramps,
placement property tracks, Transition Effect ramps, Freeze at entry, and other
structures without an exact frame-time configuration path.

`showScoreSharing: 'none'` retains the unrolled counterfactual.
`showScoreSharing: 'force'` exercises a compatible candidate in tests and
benchmarks. Production `auto` selects a compatible score only when generated
source is smaller. An incompatible forced compilation remains byte-for-byte
identical to the baseline and reports its reason.

Boundary easing is now lowered for every Transition family and preserved by
routed sequences. This correctness repair was required before score and
unrolled playback could be compared across the complete Easing reference.

## Measurements

The permanent census covers Wipe and Mix, Shape Reveal, Easing, and the Motion
control. Historical rows reproduce the former one-Pattern-instance-per-Scene
representation; unrolled rows use the current three-instance stock references.

| Reference | Historical source | Current unrolled source | Selected source | Historical reduction | Plan words |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wipe and Mix | 184,903 B | 128,272 B | 26,443 B | 85.7% | 134 |
| Shape Reveal | 118,696 B | 87,125 B | 29,299 B | 75.3% | 79 |
| Easing | 141,684 B | 98,581 B | 18,929 B | 86.6% | 104 |

Controller qualification used Burner bag pb32 firmware 3.67:

| Reference | Unrolled bytecode | Selected bytecode | Change |
| --- | ---: | ---: | ---: |
| Wipe and Mix | 72,690 B | 15,310 B | -78.94% |
| Shape Reveal | 48,906 B | 16,322 B | -66.63% |
| Easing | 55,502 B | 11,942 B | -78.48% |

All selected artifacts activated at 256, 1,000, and 2,000 pixels. The unrolled
Wipe artifact did not activate at 1,000 or 2,000 pixels within 15 seconds.
Shape median FPS changed +2.8%, -5.6%, and +2.5% across those sizes; means were
+2.4%, +1.4%, and +4.3%. Wipe and Easing were non-regressive. The qualified
runtime disposition is therefore neutral: source, bytecode, transport, storage,
and activation capacity improve, but production makes no general FPS claim.

Fast and Precise replay match at the start, midpoint, and end of every nonzero
boundary across all qualified families and every Easing curve. The hardware
harness restored Controller program `pxbg3carHT6eYhdRh` and its original
256-pixel configuration.

## Product disclosure and repeatability

The compile summary and Show compile bar report the selected representation,
boundary, stack, and kernel counts, score words, initialization assignments and
operations, avoided emitted bytes, cadence, qualified pb32 bytecode range, and
runtime-neutral disposition.

- `npm run issue542` runs the source, expanded-source, Pattern-instance,
  persistent-global, VM-word, score-plan, and selection census.
- `npm run issue542:hardware` performs reversible Controller activation,
  bytecode, latency, and FPS probes.

## Follow-on representation opportunities

The result exposes four related candidates without expanding #542's shipped
scope:

1. Parameterize Motion direction, scale, rotation, anchor, addressing, and edge
   policies so Motion boundaries join the score.
2. Allocate exact reusable Pattern slots for non-overlapping Restart lifetimes,
   resetting the complete slot at entry and reusing both state and code.
3. Store Property-animation keyframes as frame-rate target/value/time/easing
   rows interpreted in `beforeRender`.
4. Extend one-Zone stacks to a Scene-by-Zone matrix over one fixed Installation
   router.

Together these target Motion Transitions, Property Animation, and 205
Installation Composition. They must retain the current exact emitter, prove
Fast/Precise parity, count VM words and globals separately, and qualify source,
Controller bytecode, activation, and runtime before production selection.
