# PXLBLZ visual performance cost model

Evaluate every visual strategy through three ledgers. Optimizing only one can move the failure elsewhere.

## 1. Artifact and state ledger

This ledger answers: will the authored result compile, fit, and activate?

- Pattern source and generated Show scaffolding consume artifact bytes even when only one branch runs at a time.
- A compiled Show represents independent Pattern instances by giving their top-level bindings private identities. Unique instances can therefore duplicate Pattern source, renamed state, controls, and wrappers rather than adding only a small instance record.
- Reusing one explicit Pattern instance shares its private state and clock. Repeated placements can still look different through Effects, routing, palette, phase, masks, address modes, and scheduling.
- Globals and array entries consume VM words. A compact parameter table can be far cheaper than several duplicated programs, but it is not free.
- Generated scene, stack, routing, and transition code may grow per placement or boundary even when Pattern instances are shared. Compare one repeated boundary with many repeated boundaries to expose this slope.

Do not create unique instance IDs merely because scene records are distinct or because resetting sounds conceptually tidy. Buy independent identity only when the audience needs an independent clock, private state history, or control state.

## 2. Active render ledger

This ledger answers: can the Controller calculate each frame fast enough?

- Pixel count multiplies per-pixel work.
- Count Pattern evaluations at steady state and at the worst transition. A Show can have many compiled members but activate only a few; artifact size and active work are separate facts.
- Move frame-invariant work to `beforeRender`. Keep the per-pixel path focused on sample-dependent geometry, masks, and color.
- Cheap primitives include comparisons, multiply, `abs`, `min`, `max`, `floor`, `frac`, hard masks, stripes, blocks, and shared affine transforms.
- Use repeated trigonometry, `sqrt`, `atan2`, iterative noise, SDFs, and additional full Pattern evaluations only when they create a visible signature.
- Branch on coarse Zone or physical identity before expensive detail when the branch can exclude work.
- Cuts and selectors are usually cheaper than live/live full-frame blends. A blend is justified when the boundary itself is a visible event.

Controller bytecode size and FPS do not always move together. Measure both; do not infer runtime speed solely from source length.

Treat source activation, compiled bytecode, and steady-state FPS as separate
qualification axes. A source artifact can exceed the Controller's activation
envelope even when its compiled bytecode would fit, and a smaller artifact may
still render at the same speed. Name the win on the axis that actually moved.

## 3. Memory and concurrency ledger

This ledger answers: does the plan fit the VM while preserving the required simultaneous state?

- Record top-level globals, arrays, stack pressure, render-target planes, cached fields, and reserved words.
- Count simultaneously live sources during transitions, Effects, and composites. State that persists across Scenes may occupy memory even when not currently rendered.
- Share cached data only when reuse exceeds storage and lookup cost.
- Prefer compact scalar parameters over copied fields. Materialize full RGB, coordinate, or scalar planes only when several consumers make recomputation more expensive.
- Leave headroom for controls, generated wrappers, and compiler changes; a design that touches the theoretical ceiling is not robust.

## High-purchase ordering

Try these mechanisms in order, stopping when the visual law is strong enough:

1. Timing, contrast, palette role, and hard rhythmic gates.
2. Fold, repeat, mirror, phase, address, and affine transformation.
3. Shared Pattern identity arranged through placement and topology.
4. One selective field, distortion, or signature geometry.
5. One additional independent source or renderer.
6. Full-frame live/live composition or several unique stateful Patterns.

This is not a ban on expensive material. It is a demand that expensive material remain scarce enough to be noticed.

## Measurement matrix

Record at least:

| Dimension | Small slice | Scaling probe | Production peak |
| --- | --- | --- | --- |
| Content | one Pattern or Scene | repeated same vs varied | complete artifact |
| Static | source and artifact bytes | bytes per instance/boundary | activation headroom |
| State | globals and array words | words per shared/unique item | VM headroom |
| Active | evaluations and costly operations | work per pixel/boundary | peak transition work |
| Runtime | preview timing when useful | representative stress | Controller FPS or supported proxy |

If hardware is unavailable, label runtime estimates as estimates and preserve a hardware verification step. Preview correctness is necessary but is not proof of Controller performance.

For hardware comparisons, run large or activation-bound representations in
isolated reversible sessions. Poll until the pushed program is actually active,
collect the same sample window, then poll restoration of the original program
and pixel count. Reconnect when a large push resets the controller connection.
Do not compare later rows from a sequential matrix after an activation failure
or disconnect; rerun each representation alone. Report median with mean and
range so connection or cadence noise cannot turn a neutral result into a win.
