# Restart-instance global-liveness census (#536)

## Decision

Stop after the compile-only census. Do not add persistent-global lifetime reuse
to production Show emission.

The conservative representative median reclaims 0% of member globals, below
the 15% research gate. The weighted aggregate is 395 of 2,621 member globals,
or 15.07%, but that aggregate is dominated by very large reference Shows that
remain over another Controller limit. No representative Show moves from over
the 256-global limit to eligible.

This is a negative production decision, not a claim that lifetime coloring is
incorrect. The boundary fixture proves that five disjoint Restart members can
fall from 63 to 49 total globals after paying for exact activation tracking.
The opportunity is too sparse in practical Shows to justify the added compiler
and lifecycle surface now.

## Conservative contract

The census colors half-open Pattern-instance lifetimes. Two slots may share a
color only when their owners never overlap. A selected implementation would
also need one last-active scalar per participating member plus one frame epoch
so entry initialization runs on first entry, loop re-entry, and deterministic
seek reconstruction without running every frame.

The candidate set excludes:

- every member used in more than one Scene, which has Continue ownership;
- every member with live exported Controls;
- exported Pattern variables, whose watch identity must remain stable;
- scheduler-owned adaptation, Effect, and Control globals;
- arrays and initializers containing calls such as `random()`;
- missing, invalid, or otherwise unproved lifetimes.

The remaining set contains private authored scalar bindings plus the generated
elapsed-time, pixel-count, RGB-capture, and alpha fields whose initialization
can be reproduced exactly. The gate charges activation tracking, entry
assignments, added symbols, and a pessimistic source-byte upper bound. It adds
zero steady-state per-pixel render operations.

## Census

The machine-readable report is
[`test/perf-harness/issue536.ts`](../../../test/perf-harness/issue536.ts). It
covers all 19 stock Shows, the five-Pattern acceptance Show, and disjoint and
overlapping boundary fixtures. The focused suite pins every case and every
exclusion.

| Case | Member globals | Total globals | Net reclaim | Init work |
|---|---:|---:|---:|---:|
| Effects | 66 -> 53 | 74 -> 61 | 13 (19.7%) | 24 assignments, 5 symbols, <=740 bytes |
| Built from Basics | 182 -> 179 | 191 -> 188 | 3 (1.6%) | 12 assignments, 3 symbols, <=382 bytes |
| Installation Composition | 240 -> 229 | 249 -> 238 | 11 (4.6%) | 68 assignments, 13 symbols, <=2,143 bytes |
| Distortion Effects | 90 -> 67 | 98 -> 75 | 23 (25.6%) | 36 assignments, 7 symbols, <=1,098 bytes |
| Color + Output Effects | 150 -> 107 | 158 -> 115 | 43 (28.7%) | 60 assignments, 11 symbols, <=1,814 bytes |
| Wipe + Mix Transitions | 426 -> 316 | 543 -> 433 | 110 (25.8%) | 149 assignments, 28 symbols, <=4,579 bytes |
| Shape Reveal Transitions | 261 -> 201 | 334 -> 274 | 60 (23.0%) | 88 assignments, 17 symbols, <=2,694 bytes |
| Property Animation | 271 -> 222 | 306 -> 257 | 49 (18.1%) | 88 assignments, 17 symbols, <=2,695 bytes |
| Easing | 336 -> 253 | 429 -> 346 | 83 (24.7%) | 116 assignments, 22 symbols, <=3,559 bytes |
| Five-Pattern acceptance | 97 -> 97 | 170 -> 170 | 0 | five Continue owners overlap |
| Redline | 48 -> 48 | 55 -> 55 | 0 | one continued controlled member plus empty routing |
| Five disjoint Restart fixture | 55 -> 41 | 63 -> 49 | 14 (25.5%) | 25 assignments, 6 symbols, <=774 bytes |
| Five overlapping fixture | 55 -> 55 | 62 -> 62 | 0 | all owners Continue and overlap |

Eleven of the 20 representative cases reclaim zero globals. Nine reclaim at
least one. Four start over 256 globals, but their projections remain over the
limit: 543 -> 433, 334 -> 274, 306 -> 257, and 429 -> 346. Those same reference
artifacts are already over the measured 68,384-byte activation budget, so the
weighted aggregate does not create a runnable Show.

## Why emission stops here

The median result is the representative gate specified by the design. The
15.07% weighted value is useful sensitivity evidence, but it weights a 28-
instance reference Show far more heavily than an ordinary two- or three-member
Show. Treating it as the selection metric would optimize the census rather
than practical eligibility.

Production emission would also need to rewrite expanded member declarations,
preserve watch bindings, inject exact entry initialization across every
scheduler shape, and prove loop and seek equivalence. That complexity is not
justified when the median benefit is zero and no global-limit failure is
rescued.

Reopen this candidate only if a later design can virtualize public/watch state,
compress activation tracking materially, or a real user Show is blocked solely
by globals and the conservative projection makes it eligible.

## Verification

- Pure half-open lifetime coloring covers disjoint, overlapping, Continue,
  Control, public-state, array, unknown-initializer, and initialization-cost
  cases.
- Compile fixtures cover Scene and routed-Scene lifetimes, transition overlap,
  five disjoint members, five overlapping members, and the acceptance Show.
- No production emitter or active render loop changed, so Fast/Precise parity,
  Controller FPS, loop re-entry, and seek qualification are intentionally not
  claimed.
