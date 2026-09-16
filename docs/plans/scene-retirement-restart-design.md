# #1037 Pattern Restart: captured-baseline contract

Status: accepted by Jon on 2026-09-15. This document records the design adopted
by #1037. The implementation remains subject to committed-tip verification and
review before landing.

## Recommendation

Capture the compiled Pattern's initial scalar values once, before any execution callbacks, and restore that baseline at Restart. Pair this with an explicit, conservative supported source domain and an inventory of compiler-owned state. Stop using a boolean from the legacy initializer-replay analyzer as evidence that a full Restart is possible.

The existing shared instance survives. Restart restores its Pattern state and private clocks; the scheduler reapplies the controls and adaptations at the event's Show time. Other Clips sharing the instance observe that same reset. Event timing, coalescing, Group materialization and loop policy remain governed by the Scene-retirement specification.

The trade-off is additional scalar storage and a smaller admitted source domain.
The final census over 47 Show records and 41 unique Pattern dependencies admits
19 Patterns and refuses 22. The previous initializer-replay analyzer admitted 23;
the four newly refused Patterns are GlyphRain, Harmonograph and Kishimisu because
they mutate array state, and Mandelbrot2D because it creates implicit `x2` and
`y2` bindings. These are intentional fail-closed results.

One-effective-instance qualification through public preparation and final Show
compilation admits the same 19 source dependencies. Its 416 observations contain
166 ready and 250 typed refusals. Seven Luma dependencies meet the source contract
but exceed the existing 256-persistent-global limit inside the already-full Luma
showcase: LumaChevron, LumaDots, LumaPinwheel, LumaRings, LumaSpiral, LumaStripes
and LumaWeave. That is a capacity result for those dense Show contexts, not a
source-domain refusal. Forcing every eligible Clip in every Show to Restart is
retained only as a stress measurement; 11 records compile and 36 refuse at source
eligibility, while the artificial all-Restart Luma showcase reaches 386 globals.

## What the pre-adoption investigation established

The legacy analyzer recorded assignments such as `saved = counter || 0; counter = 0`. It accepted identifier initializers without proving their dependencies. After three increments, executing those assignments produced `[saved, counter] = [3, 0]`, although startup produced `[0, 0]`. A read-only JavaScript diagnostic reproduced this and showed that copying the captured baseline restores `[0, 0]`.

The assignment walker skips executable expressions in assignment targets. The fourth review proved a function reassignment concealed in a computed array index survives Restart.

The old reset inventory was incomplete beyond those two cases. A diagnostic
admitted an implicit variable with no reset assignments, and admitted a Pattern
using persistent palette state while listing only its scalar counter. The adopted
planner now refuses both through the public typed preparation channel. Generated
artifact tests prove the palette refusal and the supported scalar, clock and
coordinate reset paths.

Relevant code: `src/engine/showPatternMemberReset.ts`, `showMemberLowering.ts`, and `showCompiler.ts`. Governing behavior: `docs/plans/scene-retirement-specification.md` section Restart and `docs/reference/contracts/show-v2-clip-edits.md`.

## Why capture values

A baseline copy stores the value initialization actually produced. It does not evaluate an initializer a second time, does not depend on reset order, and cannot accidentally read a previous run's scalar state. Capture occurs after all admitted member declarations initialize and before controls, `beforeRender`, render, or any other execution callback. It must be emitted in every selected artifact representation.

For example:

```js
var saved = counter || 0
var counter = 0
// Capture after member initialization:
var initial_saved = saved
var initial_counter = counter
// Restart:
saved = initial_saved
counter = initial_counter
```

Generated names use the existing collision-safe allocator. The saved baseline is private, immutable to authored code and omitted from public controls/exports. It is created once per compiled instance, never per Clip or occurrence, and never recaptured after execution or a loop boundary.

This is a scalar copy, not an object snapshot. It cannot restore an array's mutated contents, a closure's private environment or a reassigned function. Those cases require refusal in this increment. Creating a fresh runtime would violate the accepted identity invariant. General deep snapshots would introduce aliasing, memory and firmware semantics that this epic does not need.

## Supported domain for this increment

The checker covers the bundled Pattern, including libraries, and the final transformed member. Authored-source analysis supplies useful locations; final analysis verifies that compiler transforms have not introduced unaccounted state.

Initial state consists of explicitly declared scalar variables and ordinary declared functions. Scalar initializers use numeric/boolean literals, admitted scalar identifiers and an explicit list of pure operators. Forward references can remain admitted when ordinary compilation admits them: the baseline captures the actual startup result. No initializer function calls, object/array values, function values or side effects are added to the domain. Uninitialized declarations use the ordinary compiler's startup semantics; this feature must not invent a different zero/undefined policy.

Runtime bodies support ordinary scalar calculations, branches, loops, local scalar declarations and direct calls to declared functions or classified builtins. Parameter/local shadows remain legal. Resolve bindings correctly; spelling alone must not cause rejection.

Refuse implicit persistent variables, writes to declared function bindings,
first-class function values/closures, object or array state, dynamic calls,
destructuring/default/rest forms and unrecognized syntax in this initial profile.
In particular, a computed member assignment is outside the profile; it cannot
hide an uninspected assignment. This is the accepted narrowing of previously
accidental admission.

Use an explicit AST visitor with a fail-closed default. Every admitted node specifies all executable children and read/write binding roles. Never return from an assignment after inspecting only its left binding and right value. Unsupported syntax refuses even in a branch that appears unreachable; no reachability or general alias analysis is required.

Builtins need an enumerated classification: pure calculation, render output, member-private state, or external environment. Unknown builtins refuse. `random()` in a runtime body retains the existing shared/environment generator behavior; resetting one Pattern must not rewind other members' random stream. The guarantee is restored Pattern-owned state under the same subsequent external inputs, not identical future random draws or sensor readings. Initializer calls remain outside the profile.

## Compiler state and the reset transaction

The reset plan covers more than source variables:

| State | Obligation |
| --- | --- |
| Authored and transform-generated scalar bindings | Capture and restore initial values; prove generated scratch values are overwritten before use or include them. |
| Declared functions | Prove bindings remain unchanged; refuse unsupported function state. |
| Elapsed clocks and stepped-clock accumulators | Restore the established startup/time-offset values using existing ownership. |
| Coordinate-transform matrix | Use the existing member reset path and prove startup equivalence. |
| Active palette and any other persistent builtin state | Provide an explicit reset implementation and proof, or refuse Restart for users of that facility. Initial scalar-only scope may simply refuse palette use. |
| Authored controls, Property tracks, adaptations and placement bindings | Rebind at current Show time before post-reset execution; do not restore stale control values from startup. |
| Render captures, output reuse, freeze/refresh caches and derived scratch | Output reuse is recomputed after the scheduler. A Transition-owned snapshot intentionally keeps its captured image while the live member restarts. Member-owned freeze/refresh and unsupported capture policies refuse. Generated scalar scratch is captured or proved overwritten. |
| Global Show time, other instances and external inputs | Preserve; they are outside this instance's reset. |

The scheduler transaction remains: advance the pre-event interval under its existing bindings; restore private state; bind the post-event controls/adaptations; advance and render the following interval. Use the existing ordinary setup path to avoid a second implementation of control binding. Exact-boundary, zero-delta and held-time behavior must be tested, including whether a control callback changes other private values.

Every persistent field of an emitted runtime facility must have a declared reset treatment. This inventory is finite because the compiler owns the facilities. New facilities cannot become Restart-compatible by default.

## Interface and change scope

Introduce one compiler-internal restart-plan result: either a complete plan, or a refusal containing a stable reason, originating Pattern/Clip and useful source location when available. The plan contains captured scalar bindings and required runtime reset actions. Callers must not combine a boolean from one analyzer with reset strings from another.

`showPatternMemberReset.ts` continues to own legacy reset-replay analysis for
existing consumers. A dedicated Restart planner owns captured-baseline
eligibility. Deterministic-loop reset uses the captured baseline only for a
Restart-enabled member, so its loop baseline and later Clip Restart agree. A
member without Restart retains the legacy initializer replay and emitted bytes.

`showMemberLowering.ts` supplies binding identity and generated-runtime requirements. `showCompiler.ts` owns baseline emission, runtime-state reset and scheduler integration. Public v2 preparation surfaces the existing typed failure channel with the new diagnostic, before save/adoption can claim success. No persisted schema change is needed.

## Required proof

The acceptance oracle is an exported/reopened `.epe` executing after Restart, compared with an independently cold-initialized instance receiving equivalent controls, external inputs and post-entry frame deltas. Test helpers must not use the reset planner to calculate expected initial state.

Required partitions and sequences:

- Forward, backward, repeated and uninitialized scalar declarations; startup captures the final initial values. Multiple Restarts never recapture mutated state.
- Function direct/compound/update writes, writes nested inside targets/arguments and unsupported binding forms refuse; ordinary functions and lexical shadows pass.
- Implicit variables, array/object/closure state, unclassified builtins and unknown AST forms refuse with no partial adoption.
- Every admitted compiler runtime facility: reset or recompute its state before observation. Palette and cache cases either have consumer proof or an explicit refusal.
- Two Clips sharing one instance, an unrelated instance, simultaneous events, multiple crossed boundaries, pre-roll, loop and cold seek; preserve identity and unrelated state.
- Controls and animations at the boundary, stepped/frozen time and zero delta; no extra reset or extra callback caused by the reset implementation.
- Optimizations enabled/disabled and every eligible artifact representation; baseline capture must survive transformation and resource accounting.

Fault-sensitivity checks should remove a capture/restore, move capture after execution, ignore an executable child, omit one runtime reset and skip control rebinding. The corresponding acceptance cases must fail.

Keep the existing parity report and committed-tip suites as regression gates. Add baseline variables and source to the existing resource ledger; report measured cost rather than assuming it is negligible. Hardware equivalence beyond the existing supported compiler domain is not established by JavaScript tests.

The repeatable corpus result is stored in
[`restart-census.json`](../reference/evidence/issue-1037-animation/restart-census.json).
Regenerate it with `tsx scripts/show-restart-census.ts`. The report separates the
source profile, one-authored-Restart public qualification, resource blockers and
the optional all-Restart stress result.

## Adopted implementation sequence

1. Run a read-only compatibility census on the 47-record parity corpus and existing Restart fixtures. Report Patterns newly refused, reasons, baseline binding counts and implicated runtime facilities. Stop for a scope decision if this makes normal intended usage impractical; do not broaden the language ad hoc.
2. Write the failing artifact-level cases and the explicit source/runtime capability tables. Implement the planner and scalar capture/restore as one bounded repair.
3. Verify identity, control rebinding, runtime facilities and resource cost; update specification, contract and issue proof together. Preserve the previous candidate lineage and review history.
4. Submit the final committed tip through the required suites and the authorized
   review while preserving the existing candidate lineage and non-convergence
   record.

## Decision outcome

Jon approved the captured scalar baseline design. The measured source profile
qualifies 19 of 41 dependencies, with four new deliberate refusals relative to
legacy reset replay. Public preparation uses
the same bundled and transformed compiler path as final emission, including
resolved libraries, and returns a typed refusal when the plan is incomplete.

Restart-bearing flat records select the existing routed global-sections
representation. For a single Zone, independent and span sampling are equivalent,
so this selection does not add a sampling or track capability. No-Restart flat
records retain the continuous-flat representation.

The generated baseline is private compiler state. It is absent from controls,
manifests and persistence, counts against the existing persistent-global limit,
and is never recaptured. The shared environmental random generator is not
rewound. Exported and reopened `.epe` tests are the acceptance oracle.
