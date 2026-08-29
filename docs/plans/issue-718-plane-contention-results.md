# Issue 718 plane-contention census results

Status: complete; recommendation is to keep three planes
Date: 2026-08-29

The fourth-plane question was framed measurement-first: declaring planes is
runtime-free (#515 measured 0.0%), so a fourth compiler-owned plane (2,004
words at 2,000 px; arena 6,012 -> 8,016, residual 4,228 -> 2,224) pays only
where the three-plane arena forces role contention, and the issue required
at least one measured contention scenario from a real stock Show, not a
synthetic one.

## Result

**No such scenario exists.** The census walked the render-target planner's
decisions across all 40 stock Shows and the five wave-2 fixtures (45
artifacts): 8 plane candidates appear across 5 artifacts, every one is
selected, and zero decisions carry a contention-class reason
(`explicit-conflict`, `arena-unavailable`,
`insufficient-overlap-capacity`). The closest coexistence — the acceptance
Show's snapshot/live Crossfade (planes 0/1/2, t = 1-7 s) and scalar-field
Dissolve (plane 0, t = 14-20 s) — occupies disjoint lifetimes, which is
exactly the time-sharing the lifetime-aware planner (#517) was built to
find. Raw data: `test/perf-harness/issue718-contention-census.json`.

**Recommendation: keep three planes.** A fourth plane's 2,004 words would
relieve nothing in the shipped catalogue while halving the residual the
plan-table program (#717) draws on. The word budget therefore stays as
documented: arena 6,012, residual 4,228 at 2,000 px.

The per-scenario FPS ladder the issue sketched is moot by the issue's own
terms: with no real contention scene, only a synthetic one could be
measured, and the acceptance criteria exclude synthetic scenes.

## The census is a living falsifier

`test/perf-harness/issue718.test.ts` asserts the zero and writes the census
JSON on every run. The day a Show class introduces a real collision, the
suite fails with the offending candidate, reason, conflict set, and
estimated saved work already collected — the evidence this issue demanded
as its entry condition. That failure, not fresh optimism, reopens the
fourth-plane/packed-RGB question (Rule 9).

## Premises recorded for a future reopening

Two premises shifted during wave 4 and are recorded here so a reopened
program starts ahead:

- **Packed RGB no longer dies on #564.** The #715 odd-guard 2x15 packing is
  arithmetic (`(lo << 1) | 1` at pack time, `floor(((w - hi) * 256) * 128)`
  to decode), so the bitwise integer-coercion negative does not apply. An
  8-bit-per-channel snapshot fits one plane at one word per pixel; 8-bit is
  display-equivalent on 8-bit LEDs and would sit in the same
  `authored-snapshot` exactness class snapshots already occupy.
- **Plane fills got an order of magnitude cheaper.** #909 measured
  `mutate` at 0.684 us/element against 7.320 for the interpreted loop, so
  any future fill/decode pre-pass (including a packed-snapshot decode) is
  priced off the helper, not the loop.

The one *designed* contention stays as shipped: Trails suspends while a
required Transition snapshot owns the planes, an authored and disclosed
policy (#537). If a user Show ever makes that suspension visually
unacceptable, the packed one-plane snapshot above is the shape to price —
against the census failure that documents the demand.
