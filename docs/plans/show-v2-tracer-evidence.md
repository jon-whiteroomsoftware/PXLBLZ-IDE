# Show v2 tracer evidence (#1034)

## Result and boundary

The additive tracer converts, validates and compiles **47/47 available records**:
40 stock Shows and seven agent baseline fixtures. Every source leaf is accounted
for. Fast/Precise matched-time output and mapped scalar state, second-loop v1/v2
parity, and the declared cold-seek comparison have no failures. The focused proof
suite contains 204 passing tests across 14 files.

This completes the conversion/lowering experiment and its measured restriction
ledger. It does not switch production import, editor, commands, history, saves,
MCP, or D1 to v2. The normal compiler is unchanged. The v2 codec remains explicitly
provisional; ordinary production `.pxlshow` adoption belongs to #1044/#1039.
Review, exact-tip suite results and local landing are recorded in
[#1034](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1034).

Jon's [accepted authoring decisions](show-v2-accepted-authoring.md) govern the next
owners. Independent simultaneous positive Transitions remain deferred. Existing
source-preservation success does not approve every provisional field or every
future authoring operation. Jon assigned UX separately and directed a stop after
#1034's reviewed local landing.

## Reproduction and measured differences

- [Machine-readable report](show-v2-parity-report.json): source/dependency hashes,
  outcomes, equality flags, sample times, member mappings and lifecycle diagnostics.
- [Harness](../../scripts/show-v2-parity.ts): `npm run show:v2-parity` verifies the
  committed report; `-- --write` regenerates it for deliberate review.
- Original experiment base: `d685125b34c694f311972e258efb48d12cf05cd8`.
  The report retains the original plan hash as baseline provenance and hashes the
  actual provisional schema bytes. It is not a claim that this evolving plan is frozen.
- Personal authored exports: unavailable, zero records, confirmed by Jon on
  2026-09-14. Synthetic personal fixtures do not establish personal-export coverage.
  No personal account records were changed.

| Comparison | Equal | Explanation of remaining differences |
| --- | ---: | --- |
| Compiler recipe | 33/47 | Derived placement IDs replace Scene suffixes; stable Layer ranks can contain gaps; one-Zone Layer scope is explicit; flat lowering carries explicit identity-valued brightness/time scale. |
| Generated Pattern and Effect source | 46/47 | `long-timeline` adds explicit brightness/time-scale descriptors. Actual replay still matches in both modes. |
| Compiler summary | 44/47 | `personal-base` and `personal-library-pattern` report projected member IDs consistently in specialization/source inventory. `long-timeline` has the source-size change below. |

For `long-timeline`, the compiler's artifact-byte estimate changes **16,820 →
17,283** (+463). Estimated VM words remain **6,012**, persistent globals **58**,
render-target allocations **three**, and resource blockers **zero** on both sides.
These are compiler estimates, not measurements on hardware. Both Group corpus
records have exact recipe, source and summary equality. The report also records
300 retired flat compatibility shadows with exact source paths; composition
remains authoritative and no Pattern or appearance payload is silently discarded.

## Consumer oracle and its limits

Conversion → provisional serialize/parse → compile preparation → existing
`showRecordToCompileRecipe`/`compileShow` → deterministic runtime is the additive
consumer path. Tests also reopen normal `.epe` output with `parseEpe` and replay
its source. These are artifact/runtime proofs; no browser or production-save
claim is inferred from them.

The corpus executes the actual default-compiled artifacts. When physical Pattern
slot reuse is selected, a second unslotted compile checks complete logical member
provenance; it never replaces the default artifact for output/state comparison.
Flat identity aliases require a complete converter-proven member mapping. Unknown,
duplicate, missing or split members fail the oracle. Compiler-owned empty members
remain explicitly accounted for.

The harness uses seed 1034, eight map points, and 16 ms deterministic stepping,
splitting the last step to reach a named millisecond. It samples the union of source
and converted intervals, their midpoints, and boundary ±1 ms. Group content is
materialized before sampling. The corpus has **2,211 probes per mode**, 4,422 across
Fast and Precise. Results copy frames/exports before advancing. Each artifact is
replayed separately because implicit Pattern globals can contaminate interleaved
runtime objects; an identical-artifact regression enforces that isolation.

Comparisons are exact at these probes, including Precise output words; no wider
numerical tolerance was introduced. Captured state includes exported scalar member
values, not arbitrary hidden arrays. Exact-source equality is additional evidence
for unchanged internals, not a universal substitute for lifecycle tests.
Second-loop parity compares v1 and v2 at the same phase. Cold seek reconstructs
from Show start to `min(512, ShowEnd-1)` and compares live stepping on each path.
It does not assert equivalence for every UI seek policy, every timestep or every
physical map. Focused cases separately inspect actual loop boundaries and shared
instance counters on consecutive frames.

`fixedStepFreshPhaseResiduals` is diagnostic: a fresh first-loop phase need not
match a later phase for continuous Shows, and fixed-point timestep rounding can
also accumulate. All 47 retain that diagnostic. It is not waived v1/v2 divergence;
second-loop v1/v2 comparisons pass. A focused deterministic-reset fixture uses
exact 1000 ms/250 ms deltas and proves its intended reset in both modes.

## Measured restriction ledger

Classifications use the plan's closed vocabulary. “Supported” is bounded to the
named fixtures/accepted representation. An unproved form receives a typed refusal;
that is not permission to discard a valid legacy Show during later cutover.

| ID | Enforcing source and smallest measured partition | Consumer evidence / current scope | Classification and residual |
| --- | --- | --- | --- |
| RL01 | `showCompositionV2.ts` + provisional schema: valid record versus duplicate IDs, missing references, unsafe time and unknown fields | `showCompositionV2.test.ts`, `showRecordV1ToV2.test.ts`: reopen/validation, immutable refusals | `intentional-domain-rule`; validation never repairs. |
| RL02 | `showCompositionV2.ts`: adjacent Clips versus overlap on one Zone/Layer | Validator and `showClipsV2.test.ts`: overlap/move refusal leaves preimage unchanged | `intentional-domain-rule`; different Layers can contribute together. |
| RL03 | `showClipsV2.ts`: move through former Scene time versus occupied/out-of-range destination | Reopened held appearance, exact ranges, runtime after trim/extend | `removed-by-model`; connected Transition edits remain #1035. |
| RL04 | `showClipsV2.ts` and current `showTimelineAuthoring.ts` | Plain move/split needs no Scene boundary; animated trim/split refuses without shortening a curve | `removed-by-model` for proved plain edits; broader animation/Insert Time owners #1037/#1038 remain unimplemented. |
| RL05 | Current `showBoundaryTransitionTimeRepair.ts`; accepted deletion policy | Current-owner baselines in the design; no v2 Transition-deletion owner is claimed | `removed-by-model` as accepted representation policy; its executable edit proof remains #1035. |
| RL06 | Converter/global-section lowerer: shared Clip across two Layouts; Layout + visual boundary versus an interior Layout edge | `showV2LayoutConversion.test.ts`, `showV2MixedLayout.test.ts`: exact switches/source, Fast/Precise two-loop output/state; interior edge refuses | `supported-or-safely-narrowed`; arbitrary crossing edits require Zone-availability proof. Disappear/re-add uses separate Clips sharing one instance. |
| RL07 | `showCompositionV2.ts` Group bounds: occurrence inside one Layout versus crossing its end | `showV2Groups.test.ts` reopens/materializes legal bindings; crossing refuses without mutation | `supported-or-safely-narrowed` tracer domain; accepted crossing behavior still requires #1038 implementation/proof, not necessarily compiler work. |
| RL08 | `showCompositionModel.ts` / `showCompositionLowering.ts`: full-window unrelated contribution in same/different Zone | `showV2ScopeProof.test.ts`: Crossfade live/live, Wipe, Dither and Portal preserve composite with opacity 0.4; current v1 Fade/Motion rejects it | `requires-compiler-work` to widen Fade/Motion scope; existing supported behavior retained. |
| RL09 | Same scheduler: unrelated Clip ends around [400,600) | Same-Zone 399/601 ready, 400/500/600 refused (`showV2PreparationContract.test.ts`); other-Zone start/end edges 399/400/601 accepted, 401/600 refused (`showV2ScopeProof.test.ts`) | `requires-compiler-work` to widen the refused edge cases; no blanket cross-Zone authoring rule inferred. |
| RL10 | `resolveLocalLayerTransitions` and v2 preparation: separated versus coincident positive windows | `showCompositionLoweringV2.test.ts`: two Zones, Crossfade + Wipe both [400,600) is schema-valid but compiler-ineligible | `requires-compiler-work`; independent render-target scheduling remains deferred. |
| RL11 | `showCompositionV2.ts` distinguishes Layer participants from explicit whole-output scope | Unequal contributor sets preserve all six visual kinds in `showV2BoundaryConversion.test.ts`; coincident independent events remain separate and refuse | `supported-or-safely-narrowed`; one visual effect for all simultaneous junctions is not permanent policy. |
| RL12 | `showRecordV1ToV2.ts` flat projection | `showCompositionLoweringV2.test.ts` independent/span/repeat coordinate matrix; report includes exact expansion/source mapping | `supported-or-safely-narrowed`; one-Zone Clip identity is not faked for a multi-Zone cell. |
| RL13 | Converter held-appearance reconciliation and lowerer | Divergent opacity/Transform/Aperture becomes one Clip with stable keys; exact boundary/interior replay. Gaps/ownership conflicts and multi-key positive-Transition combinations refuse | `supported-or-safely-narrowed`; broader combinations need preservation proof. |
| RL14 | Lowerer `unsupported-restart`; accepted clock decision | Legacy Continue/private Restart identities preserve state; authored v2 Restart refuses. Shared simultaneous users advance once per frame (`showV2LifecycleProof.test.ts`) | `supported-or-safely-narrowed`; new shared clock-reset semantics belong to #1037 and do not mint instances. |
| RL15 | Converter structural-Cut accounting | Plain zero-duration Cut retires with source ID/time; residual carrier payload refuses (`showRecordV1ToV2.test.ts`) | `removed-by-model`; unsupported Cut carriers still block cutover of those forms. |
| RL16 | Explicit track activation in converter/validator/lowerer | Cut Effect disappears at exclusive end then returns static; incoming/outgoing animation preserves original curve and source contribution (`showV2BoundaryConversion.test.ts`) | `supported-or-safely-narrowed`; arbitrary activation crossing derived sections and unsupported ramp targets refuse. |

The smallest independent-window counterexample is two Zones, each with an outgoing
Clip ending at 400 ms and an incoming Clip starting at 600 ms, with separate
Crossfade and Wipe events. The existing scheduler rejects their overlapping
200 ms windows even though the Zones differ. This is proposed domain widening,
not a lost supported v1 record. No compiler workaround was added.

## Consolidated proof mapping

Rows refer to the [design matrix](scene-retirement-design.md#consolidated-proof-matrix).
Tests below live in `src/engine/` unless named otherwise. A row family can contain
both measured preservation and explicitly deferred authoring; this table does not
claim that every future editor operation is implemented by the tracer.

| Rows | Executed proof | Remaining owner / limit |
| --- | --- | --- |
| D01–D05 | `showCompositionV2.test.ts`, `showRecordV1ToV2.test.ts`: structure, references, immutable refusal, provisional reopen | Production admission #1044/#1041. |
| Y01–Y08 | Converter tests preserve empty Layer IDs/names and refuse conflicting legacy names/order; Group tests preserve explicit shells/bindings; Quadrille preserves relative stacking | Layer-reorder UI and full authoring #1038. |
| E01–E12 | `showClipsV2.test.ts`: move, trim→extend→reopen, split, collision/no-op, owned-animation move; connected/animated unsupported edits refuse atomically | Existing v1 owner baseline remains in design. Connected move/resize/delete/Replace/Reset #1035; full command adoption #1044. |
| T01–T08 | Lowering/BoundaryConversion/FlatTransition tests plus stock Transition reference Shows cover Cut, six visual kinds, both Crossfade policies and current variants | One-sided UX #1045. |
| T09–T16 | ScopeProof, PreparationContract, BoundaryConversion and MixedLayout: continuing alpha composite; same/different Zone edge guards; unequal sets; two routing/visual boundaries; independent overlap refusal | Unsupported scheduler widening is RL08–RL11, deferred. |
| A01–A14 | Lowering tests cover source-owned half-open activation, Effect absence/re-add and exact divergent appearance; BoundaryConversion covers incoming pre-roll/outgoing contribution; PropertyCarrier covers split/repeat origin/duration/easing; stock animation/easing records cover current target families | Arbitrary global tracks, Clip/instance/effect boundary ramps, exact nonlinear trim/split and Insert Time #1037. Safe refusal, not destructive curve sampling. |
| S01–S10 | Lowering tests: continuous/deterministic loops, Continue/private Restart, Freeze/Blink. LifecycleProof: gaps, Strobe, Trails, rolling-refresh, same instance on two Layers/two Zones advances once per frame; reopened `.epe` replay | Shared clock-reset event and orphan cleanup commands #1037/#1038. |
| L01–L12 | LayoutConversion, MixedLayout, PropertyCarrier: reused Layout definitions, split/repeat changes, zero/nonzero transfers, two visual-boundary transfers, disappearing/returning Zone, exact source/state | Group crossing and general Layout edits #1036/#1038; interior visual-window Layout edge refuses. |
| G01–G12 | Groups: reopened definitions/local Layers, explicit bindings, default sharing, legacy private IDs, collision/unused-definition validation, local Transition/track translation; two corpus Group records exact | Make Unique/Ungroup/Delete/Insert Time command endpoints and Layout-crossing authoring #1038. |
| C01–C16 | All 47 inventoried sources/dependencies hashed; converter immutable accounting; divergent appearance, scalar carriers, flat projection/sampling, unknown/missing-source refusals | No personal-export compatibility claim; unproved valid forms remain fail-closed before cutover. |
| P01–P06 | Actual artifacts, equality counts/resource differences above, Fast/Precise semantic probes, repeated-loop parity, cold seek, complete member provenance | Eight-point deterministic domain; no hardware performance claim. |
| R01–R02 | Provisional codec round trip plus normal EPE parser and replay in lowerer/Group/LifecycleProof tests | Ordinary authored-v2 `.pxlshow` importer deliberately unwired. |
| R03–R06 | Inventoried only: save/reopen, Undo/Redo, stale/duplicate admission, failed persistence recovery | Deferred production integration #1044/#1039; current v1 contracts unchanged. |

## Fault sensitivity and repaired findings

The final Layout tests kill moving a simultaneous routing switch from outgoing
end to incoming hold start, and omitting preceding visual duration when locating
a later routing switch. The latter fails on the second boundary, not merely a
single boundary screenshot. Earlier increments killed missing incoming animation
offset, scalar ramp origin, Group track translation, duplicate compiler-member
acceptance, and dropped Layout easing. Dropped easing initially survived sampled
frames; an explicit public recipe assertion was added and killed it. Runtime-only
qualification is not claimed for that field.

Review corrections also cover empty Transition-array source accounting, shared
flat runtime splitting, typed scheduler refusal before recipe emission, held
repeat targets reaching the wrong route, and same-Layout split values disappearing.
Each correction retains a public-boundary regression. Candidate receipts and
committed-tip runner evidence remain attached to the issue/local review store.

## Documentation and next gate

This evidence replaces the incremental 2/22/35/42/43/45-record diary; those results
remain in Git/issue history. The current report and this ledger describe the final
47-record tracer. The design links the measured representation and limits.
`CONTEXT.md`, the Feature/Technical References and command/history/candidate
contracts were checked and remain unchanged because production semantics did not
switch. No README, stock source, personal data, or compiler internals changed.

The evidence makes later authoring work concrete; it does not silently resolve a
new UX or compiler-domain decision. No #1035 implementation, editor pilot or
publication is part of this completion run.
