# Scene retirement: design assessment and proposed next step

> Historical planning record. The current design and worker contract is the
> [Scene-free Show implementation specification](scene-retirement-specification.md).
> Read that document for implementation; superseded proposals and provisional gates
> below are retained solely as provenance.

Current accepted product decisions are consolidated in [Show v2 authoring decisions](show-v2-accepted-authoring.md). This assessment preserves the historical diagnosis and earlier proposals; conflicting recommendations below are superseded.

Status: appearance ownership and selected-time editing accepted by Jon; remaining recommendations are proposed. This document assesses the paused #1033/#1034
experiment at `a186df09353ab8c13099198a4e822b0c051c6a14` against base
`d685125b34c694f311972e258efb48d12cf05cd8`. It does not approve the full provisional schema. After discussing this approach
and accepting the appearance-editing rule, Jon directed stabilization to continue.
Implementation is limited to the compiler-preparation experiment below; any next
review retains the original lineage and uses the documented one-attempt
non-convergence acknowledgement after required evidence passes.

## Recommendation

Keep global Clips, explicit Pattern-instance identity, independent Zone Layout
intervals, and compiler-derived sections. Retain the experiments and regression
cases. Stabilize the preservation interface before extending conversion coverage
or starting the editor pilot.

The largest design risk is allowing the existing compiler's several input forms
to decide what the new authored model can express. The repeated bugs show that
preservation is currently distributed across conversion and three lowering paths.
The latest missing fields are a symptom of that distribution.

The next deliverable should establish one owner for complete compile preparation
and demonstrate its obligations through a small set of discriminating Shows.
It should leave the product choices below visibly provisional until Jon decides.

## What the experiment established

The [provisional design](scene-retirement-design.md) identifies real semantics
that persisted Scenes currently carry: timing, property activation, appearance,
routing, and Transition contribution. Removing Scene storage requires explicit
owners for those semantics. Compiler-derived sections remain compatible with the
accepted epic and do not restore authored Scenes.

The paused tracer compiles 22 of 47 inventoried records; 20 refuse conversion and
five refuse lowering. The accepted records match sampled Fast/Precise frames and
mapped scalar state. The repaired sampler examines 8–180 times per record/mode.
The last committed candidate passed the four required suites. None of this
covers the remaining flat repeat/split counterexample or establishes complete
migration support. Personal exports are unavailable; baseline personal fixtures
are synthetic repository fixtures.

Three review rounds exposed two related defect classes:

| Round | Preservation defects | Evidence defects |
| --- | --- | --- |
| 1 | Later appearance keys and changing split position disappeared | Flat sources were available but omitted from the harness lookup |
| 2 | Distinct Restart instances merged; flat Freeze/Blink disappeared | Accounting was tautologically complete; a time-invariant Pattern masked lost state; corpus sampling missed semantic boundaries |
| 3 | Uniform repeat scale and split position disappear only in flat lowering | The harness reads nonexistent `summary.transitions`; its script is outside effective TypeScript coverage |

The third reviewer found the previous identity, appearance, activation,
accounting, and OAuth repairs sound within the inspected scope. That is useful
review evidence, not a claim that every combination has been qualified.

My orchestration error was treating definition and feasibility work as a delivery
queue before the authoring choices and preservation interface were settled.
Repeated full-range review became an architectural discovery mechanism. Further
review should follow a changed design and discriminating proof.

## The authored model

The persisted record should express decisions an author can explain. Compiler
section IDs, legacy cell IDs, and emitter selection have no ownership role here.

| Concept | Proposed ownership | Consequence |
| --- | --- | --- |
| Clip | Global interval, Zone, stable Layer, instance reference, appearance over that interval | Moving a Clip preserves its identity and translates its owned times |
| Pattern instance | Source reference, controls, private state and clock | Two Clips may share one runtime; equal source never implies shared identity |
| Appearance | Held appearance values plus explicitly active property animation | An imported change inside one Clip remains inspectable and editable |
| Property track | Typed target, keyframes, activation interval | A key endpoint cannot make a value leak outside the source contribution |
| Zone Layout interval | Definition reference, split/routing values and transfer | A routing change does not implicitly restart Patterns |
| Show sample remapping | Repeat scale and its animation | Repeat scale does not manufacture a Zone Layout change |
| Transition | Authored identity, participants, visual policy and timing relation | Compiler resource grouping does not merge distinct authored entities |
| Show End / Marker | Loop duration / narrative label | Moving a Marker cannot change emitted behavior |

Existing edit, validation, adoption and persistence responsibilities remain as
specified by [Show command semantics](../reference/contracts/show-command-semantics.md)
and [Show state/history](../reference/contracts/show-state-history-persistence.md).
An edit owner produces an atomic candidate; validation checks it; adoption owns
history and saving. This proposal changes none of those contracts.

### Decision 1: appearance changes inside one Clip

Accepted by Jon in the design discussion: one Clip can contain editable appearance
changes; a change at the selected time holds until the next appearance change,
and applying a value across the whole Clip is explicit. This acceptance does not
settle the remaining move/trim/split or shared-runtime policies.

Retain the provisional held appearance keys as an explicit
Clip-owned concept. A Clip spanning 0–10 seconds may have opacity 1 until 5 seconds
and opacity 0.25 afterward without creating another Clip or runtime instance.
Those changes must be available through the authoring surface, not hidden import
payload. The exact UI belongs to the pilot design.

Proposed evaluation order: choose the held appearance at time t, then apply each
active property track to its named property. When the track is inactive, the held
appearance supplies the value. An Effect target must exist throughout the track's
active contribution; removing the Effect cannot silently redirect its track.

Accepted editing rule: an edit at the selected time changes the held value from
that point until the next appearance key. Applying a value across the whole Clip
is an explicit operation. Proposed subsequent edit policies: Move translates owned times. Trim keeps
the value at the new start and removes unreachable keys; Split gives both Clips
the appropriate starting appearance while preserving instance sharing. These
move/trim/split policies remain proposals; no editing behavior is implemented by
this decision.

The alternative is to split divergent imports into ordinary Clips. That is easier
to explain locally but changes Clip identity and subsequent editing behavior; it
would require revisiting the epic's one-ordinary-Clip preservation requirement.
I recommend keeping appearance keys and proving their editing rules, rather than
quietly taking that scope change.

### Decision 2: runtime identity and Restart

Recommendation: retain Pattern-instance identity as the sole authority for runtime
sharing. Preserve existing flat Restart by converting it to distinct instances,
as the repaired tracer now demonstrates. Preserve explicitly shared Continue.

Do not introduce a general operation that resets a shared instance while another
Clip uses it. Keep that unresolved/unsupported until its intended behavior is
specified. This preserves existing independently instantiated behavior without
claiming that separate instances and resetting a shared runtime are equivalent.
The provisional `entryPolicy: restart` therefore still needs an explicit
supported-domain decision; successful flat conversion does not settle it.

### Decision 3: Transition scope

Recommendation: keep authored Transition participants separate from the compiler's
resource schedule. Preserve the current interaction model. Independent simultaneous
positive Transitions remain deferred as already agreed. Whole-boundary v1
Transitions need their own contribution proof before admission; one-participant
Layer examples do not qualify them.

The experiment below does not decide all G0–G7 gates. Group materialization,
Layout-crossing behavior, incoming pre-roll and the complete edit policy still
need their named evidence before dependent work starts.

## Compiler preparation: one preservation owner

The proposed external interface is a pure compile-preparation operation:

```ts
prepareShowV2ForCompile(record, exactSources)
  -> { status: 'ready', recipe, provenance }
   | { status: 'refused', issues }
```

This is a proposed interface, not executable code. It owns domain validation,
source resolution and compilation eligibility through the existing helpers, and
returns the existing Show recipe consumed by `compileShow`. A ready recipe is
not a hardware-capacity verdict; the compiler and resource ledger still own that.
Neither result adopts, saves or changes the source record.

Internally, one module resolves effective Show settings, Pattern identities,
Clip appearances, routing/sample semantics and contribution intervals before
selecting a compatibility emission path. Common Show-envelope and derived-Scene
construction live there. Defaults are resolved once under the current semantics;
absence is preserved where absence changes compiler selection or behavior.

The three current routes may initially remain as private adapters. Each consumes
the same resolved obligations and declares which combinations it supports. An
adapter emits them completely or returns a typed refusal. It cannot reconstruct
identity from equal source, omit an owned setting, or silently substitute a default.
A shared helper for split/repeat alone would leave the wider omission pattern
intact; the common owner must also cover identity, time, appearance, and sampling.

Do not force every Show through the routed representation now. The experiment
already found different sampling and lifecycle behavior between legacy paths.
First centralize semantic preparation; unify emission only when its equivalence
is demonstrated. No compiler rewrite or persistent intermediate representation
is proposed. Any private prepared data must remain transient and must not retain
a hidden v1 record inside v2.

Migration accounting and compile preservation are separate obligations. The
converter audit shows where source data went. It cannot prove that a later
adapter emits that data correctly. End-to-end tests must cross both operations.

### Proposed change locations

- `src/engine/showCompositionLoweringV2.ts`: own the compile-preparation operation,
  shared effective settings and identity resolution; keep compatibility emitters
  private. Return the existing recipe through `showRecordToCompileRecipe` after
  complete emission. Avoid adding a public wrapper that leaves each emitter
  responsible for the same preservation decisions.
- `src/engine/showCompositionLoweringV2.test.ts`: exercise the complete preparation
  seam with the matrix below; retain the review counterexamples.
- `src/engine/showRecordV1ToV2.ts` and its tests: retain independent migration
  accounting and explicit refusals. Do not equate accounting success with compile
  preservation or add emitter-specific fields to the authored record.
- `scripts/show-v2-parity.ts` and its test: consume preparation results, remove
  the nonexistent metadata input, and qualify the real semantic sampler call.
- `tsconfig.node.json`: include the harness and its test, or a dedicated referenced
  script-check project if their imports require one. The normal check must execute
  that project; merely creating a configuration is insufficient.
- `docs/plans/show-v2-tracer-evidence.md` and its report: regenerate only after
  source freeze, correct the compiled-window claim, and retain unresolved limits.

The experiment leaves `showCompiler.ts`, production consumers and the current
engineering contracts unchanged. If that proves infeasible, report the smallest
counterexample before expanding scope.

## Smallest useful experiment

Build one table-driven preservation suite at this consumer seam:

`v1 + exact sources -> v2 conversion -> compile preparation -> existing compiler
-> Fast/Precise replay and reopened EPE`.

The v1 side independently compiles the original record. Expected routing and
state landmarks also have hand-calculated assertions so two sides cannot agree
merely by sharing an incorrect helper. Keep the currently known red cases before
repair. Use one stateful Pattern whose channels expose sample coordinates and
elapsed time, plus scalar exports for private time and call counts.

| Case | Deliberate variation | Required evidence |
| --- | --- | --- |
| Flat sampling | Repeat 1 versus 2; split 0.5 versus 0.3; nondefault repeat and split together on a supported two-Zone flat form | Current omission fails; routed pixel ownership and coordinate-sensitive output match after repair |
| Runtime sharing | Three sequential Clips; shared Continue versus distinct Restart; a gap | Expected member graph/count, private clocks and time-varying frames at entries |
| Segmented appearance | One Clip crosses an appearance key; a property activation begins/ends inside its lifetime | Held values and active overrides match; no leaked Effect value after activation |
| Transition route | Existing supported positive Layer Transition, constant nondefault routing/sample settings | Same settings survive this route; incoming/outgoing output and state match at window neighbors |
| Refusal combinations | Transition plus unsupported appearance keys; unsupported routing change; missing exact source | Exact reason, no partial recipe, immutable input |

For each applicable adapter, run default and nondefault settings. Include the
known high-risk interactions above; do not multiply every feature into an
unbounded Cartesian product. Unsupported combinations get explicit negative
cases rather than disappearing from the matrix.

Probe start/end neighbors and each semantic interval midpoint, first and second
loop, and continuous versus cold seek. Keep Fast and Precise schedules identical
on both sides; preserve the documented fixed-step residual limits. Assert
complete frame arrays and mapped scalar state, not only generated-code equality.
Provenance must cover compared runtime members without merging or dropping them.

Fault checks must demonstrate that removing instance mapping, routing/sample
carriage, an appearance field, or an accounting correspondence makes the owning
case fail. A sampler integration test must use the real recipe/model types.
Remove the nonexistent compiled-summary Transition input and its claim; source
and v2 Transition windows already provide those boundaries. Add the harness and
its test to effective TypeScript checking without weakening compiler settings.

Success means these named cases pass, faults are detected, current accepted corpus
cases retain their results, and both remaining review findings are repaired.
It does not mean the other 25 records become supported or the v2 schema is approved.
No editor, persistence, Group, or hardware change belongs in this experiment.

## Delivery and decisions

The appearance rule is accepted and the bounded stabilization experiment is
authorized. Other product gates remain pending. The sequence below records the
design and delivery responsibilities; it does not turn those gates into defaults.

1. Jon decides the proposed appearance ownership and editing direction, and the
   bounded runtime/Transition policies above. I own the revised design directly.
2. Record the accepted decisions in the governing plan. Specify the compile-
   preparation seam and experiment before delegating any bounded implementation.
3. Implement the stabilization experiment under #1034. Keep its candidate lineage,
   original counterexamples, and three-review history. Discussion does not silently
   reset the review breaker; a further attempt needs the documented explicit path.
4. After focused proof, submit the required committed-tip suites once, then use
   Opus 5 xhigh for review. A reviewable repair is not product-model acceptance.
5. Complete the outstanding #1034 proof families and resolve the remaining named
   gates before #1035/#1044. Reassess whether the provisional schema stays simple
   enough for authors as those decisions are made.

The frozen tracer and definition worktrees remain preserved. This assessment accompanies the stabilization candidate. It records accepted
appearance ownership and proposed remaining product decisions; it changes no
production reference or review approval state.
