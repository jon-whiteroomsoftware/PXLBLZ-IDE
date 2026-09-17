# #1038 scope-to-proof map

Audit of issue #1038 ("Complete global-time Clip, Layer, Group, and timeline
authoring on v2") against actual proof. Authority: the canonical
[scene-retirement specification](../../../plans/scene-retirement-specification.md)
at commit `51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`, §§4, 6–9, 12–13.

Audit base: local main `0287bbb184e0aa856039f1ea495697674929a881` (native Stage
Zone isolation landed). The Layout-occurrence duplicate intent (decision D7 from
#1041) is in flight inside the #1041 candidate and is out of scope here.

Status vocabulary used below:

- **Proved** — a named test or committed browser record asserts the behavior at a
  consumer oracle (reopened `.pxlshow`/`.epe` through their importers, generated
  Fast/Precise frames or exported state, provider readback, history entries, or
  exact affected collections).
- **Partially proved** — some named partition or oracle surface is missing; the
  gap is stated.
- **Unproved** — no consumer-surface evidence exists.

A green generic suite, a commit count, or an `X-E2E:` trailer is never counted as
proof here.

## 1. "What #1038 must deliver"

| Scope item | Pure owner | Route adapter / editor | e2e spec | Evidence packet | Oracle | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary Clip creation, move/resize/split | `showClipCreationV2.ts`, `showClipTemporalV2.ts` | `admitShowV2PilotCreateClip` / `admitShowV2PilotClipTemporal`, `ShowV2ClipTimingEditor.tsx` | `e2e/show-v2-clip-timing.auth.spec.ts` | `issue-1038-clip-create`, `issue-1038-clip-temporal`, `issue-1038-clip-timing-workspace` | Reopened native `.pxlshow`/`.epe` with independently authored manual clock/Clip oracle in both modes; fourteen affected collections; one history/save per action | Proved |
| Linked and independent duplication, Make Independent / Rejoin | `showClipsV2.ts`, `showClipIdentityV2` paths | `admitShowV2PilotClipSharingEdit`, `ShowV2ClipSharingEditor.tsx` | `e2e/show-v2-clip-sharing.auth.spec.ts` | `issue-1038-clip-sharing-ui`, `issue-1038-clip-independence` | Effective runtime IDs/count, copied instance tracks, reopened `.epe` state; five durable writes, Undo/Redo, cold reopen | Proved |
| Ordinary Clip deletion | `showTransitionsV2.ts` (`delete-clip`) | `admitShowV2PilotClipDelete`, `ShowV2ClipDeleteEditor.tsx` | `e2e/show-v2-clip-delete.auth.spec.ts` | `issue-1038-clip-delete` | Validated-empty admission, dormant runtime re-add without revived appearance, reopened artifacts | Proved |
| Clip-scoped Replace Pattern | `showClipsV2.ts` (`replace-pattern`) | `admitShowV2PilotClipReplacementEdit`, `ShowV2ClipReplacementEditor.tsx` | `e2e/show-v2-clip-replace.auth.spec.ts` | `issue-1038-clip-replace`, `issue-1038-clip-replace-ui` | Other users' instance/controls/tracks/compiled member exact; trusted captured metadata; reopened artifacts | Proved |
| Appearance and Effects, including explicit Effect removal | `showClipAppearanceEditsV2.ts` | `admitShowV2PilotAppearanceEdit`, `ShowV2AppearanceEditor.tsx` | `e2e/show-v2-appearance.auth.spec.ts`, `e2e/show-v2-appearance-surface.auth.spec.ts` | `issue-1038-appearance-surface`, `issue-1038-appearance-removal`, `issue-1038-clip-appearance` | Native EPE Fast/Precise against independently authored complete-key programs; exact `removedIds`; untouched shared held Group user | Proved, with one measured Precise residual (§3 R6) |
| Property track/key authoring with exact activation and retained curves | `showPropertyEditsV2.ts`, `showPropertyAnimationV2.ts`, `showPropertyTrackTimeMappingV2.ts` | `admitShowV2PilotPropertyEdit`, `ShowV2PropertyEditor.tsx` | `e2e/show-v2-properties.auth.spec.ts` | `issue-1038-property-edits`, `issue-1038-property-adoption`, `issue-1038-property-boundaries` | Evaluator and emitted Fast/Precise values at boundaries ±1 ms and interiors; no discarded-key restoration | Proved |
| Global Insert Time | `showTimelineV2.ts`, `showPropertyTrackTimeMappingV2.ts` | `admitShowV2PilotInsertTime`, `ShowV2ClipTimingEditor.tsx` | `e2e/show-v2-clip-timing.auth.spec.ts` | `issue-1038-insert-time`, `issue-1038-insert-time-corrective`, **`issue-1038-audit`** | Exact authored hold/resume keys, normal runtime evolution, typed refusals; reopened artifacts | Partially proved — insertion at `p = 0` cannot be admitted while a participant-scope positive Transition coexists with any Clip/instance track (§3 R9) |
| Occurrence-local Group holds | `showGroupsV2.ts`, `showGroupEditsV2.ts`, `showTimelineV2.ts` | `admitShowV2PilotGroupOccurrenceEdit`, `ShowV2GroupOccurrenceEditor.tsx` | none registered | `issue-1038-group-occurrence-ui`, **`issue-1038-audit`** | §7 mapping example, unchanged definition/runtime identity, reopened artifact, held-time Restart non-retrigger | Proved (route regression rests on committed browser proof plus component tests, not a registered e2e spec) |
| Markers | `showMarkersV2.ts` | `admitShowV2PilotMarkerEdit`, `ShowV2MarkerEditor.tsx` | `e2e/show-v2-markers.auth.spec.ts` | `issue-1038-markers`, `issue-1038-marker-route`, `issue-1038-marker-order` | Unchanged playback recipe/`.epe` source and state; dormant Markers retained | Proved |
| Show End | `showLayoutIntervalsV2.ts` (`set-show-end`) | `admitShowV2PilotSetShowEnd` | `e2e/show-v2-layout-occurrences.auth.spec.ts` | `issue-1038-layout-ui`, **`issue-1038-audit`** | Exact refusal on invalid shortening, coverage truncation/extension, dormant Markers, Undo | Proved |
| Stable Layer operations incl. empty named Layers, ordering, explicit reassignment | `showLayersV2.ts` | `admitShowV2PilotLayerEdit`, `ShowV2LayerEditor.tsx` | `e2e/show-v2-layers.auth.spec.ts` | `issue-1038-layer-adoption`, `issue-1038-layers`, **`issue-1038-audit`** | Stable IDs/stacking through reopened EPE, materialized collision refusal, unchanged runtime/Restart | Proved |
| Group creation from ordinary selection | `showGroupCreationV2.ts` | `admitShowV2PilotCreateGroup`, `ShowV2GroupCreationEditor.tsx` | none registered | `issue-1038-group-create`, `issue-1038-group-ui` | Reopened native sharing/global animation/Restart equal to the independent selected schedule; atomic refusal of unrepresentable selections | Proved (route regression rests on committed browser proof plus component tests) |
| Group occurrence operations, bindings, linked/unique, Ungroup | `showGroupEditsV2.ts` | `admitShowV2PilotGroupOccurrenceEdit` | none registered | `issue-1038-group-occurrence-ui`, `issue-1038-group-delete`, **`issue-1038-audit`** | Fifteen affected collections, one shared runtime retained, reopened five-action schedules | Proved |
| Group definition-local Replace Pattern | `showGroupReplacementV2.ts` | `admitShowV2PilotGroupReplacementEdit`, `ShowV2GroupReplacementEditor.tsx` | `e2e/show-v2-group-replace.auth.spec.ts` | `issue-1038-group-replace`, `issue-1038-group-replace-ui` | Unaffected sharing users exact, authoritative bound/default payloads, accepted incompatible-animation refusal | Proved, with one unsettled classification (§3 R5) |
| Native Stage Zone isolation and authored guides | `showStagePresentationV2.ts` | `ShowStagePreview.tsx` prepared branch | `e2e/show-v2-prepared-stage.auth.spec.ts` | `issue-1038-stage-isolation`, `issue-1038-prepared-stage` | Real renderer input across a later Layout switch, solo rows, guides; artifact/recipe/runtime untouched | Proved, with three presentation residuals (§3 R7) |
| Integrated edit → history → save → reopen → native artifact proof for the named rows | — | `showV2PreparedEditAdmission.ts` | — | **`issue-1038-audit`** | See §2 | Partially proved — see the INSERT row in §2 |

## 2. Assigned §12 rows

Integrated sequence tests added by this audit slice live in
`src/store/showV2Integrated*.test.ts` and share
`src/test/showV2IntegratedSequenceHarness.ts`. Each drives the real
`admitShowV2Pilot*` path against one fixture and judges the delivered
`.pxlshow`/`.epe` through their importers.

| Row | Required sequence | Integrated test | Oracle | Status |
| --- | --- | --- | --- | --- |
| SHARING | Plain duplicate → Group repeat → Make Group Unique → explicit independence → Rejoin | `showV2IntegratedSharingSequences.test.ts` ("runs plain duplicate, Group repeat, Make Group Unique, independence and Rejoin as one admitted sequence") | Effective runtime ID set and `effectiveShowInstanceUseCountV2` after each step; one authored compiled member in the delivered `.epe`; shared `elapsed` advances exactly 125 ms per frame while two users are visible; six writes/history entries; reopened composition equals the saved record | Proved |
| RESTART | Shared visible users → entry reset → incoming Transition attach/resize → move/split/delete → duplicate → loop/seek | `showV2IntegratedRestartSequence.test.ts` | `deriveShowRestartEventsV2` after every step; delivered `.epe` `elapsed` equals `t − lastReset` at thirteen probes in both modes, including the next loop's entry at `showEnd + 2500`; authored control curve still followed after reset; coarse-step cold seek honors the same events | Proved for the timing/state axis. The §12 source partitions (ordinary function, reassigned function binding, shadowed local) and the `unsupported-restart` refusal stay with #1037's owner tests (`showV2Pilot.test.ts`, `showCheckpointBindingsV2.test.ts`); this slice adds no new coverage there |
| REPLACE | Shared/unshared Clip and Group definition/unique occurrence → replace → Undo/Redo → reopen | `showV2IntegratedSharingSequences.test.ts` ("replaces a shared ordinary Clip and a unique Group occurrence, then Undo/Redo and reopens") | Forked runtime for the selected ordinary Clip only; original runtime payload, linked definition, its children and Transition records byte-equal; Undo restores the pre-replacement binding, Redo restores the candidate composition; reopened import carries both Pattern references and ≥2 authored members | Proved |
| INSERT | Insert through static/animated Clip, exact key incl. discontinuity and last active key, shared track, zero scale/Freeze, gap, Layout boundary, visual/transfer interior refusal | `showV2IntegratedInsertSequence.test.ts` | Typed `visual-transition-window` / `layout-transfer-window` refusals with zero writes and preimage identity; gap insertion leaves the earlier Clip; one hold + one resume key on the shared instance track with the original outgoing kernel retained; right-boundary value `0.6` held across an exact discontinuity while the authored key keeps value `0.9` and its steps easing; last-active-key hold; switch extension with the transfer preserved; delivered `.epe` shows the shared runtime holding across the widened gap and the zero time-scale runtime never advancing | **Partially proved** — insertion at `p = 0` is mapped correctly by `insertShowTimeV2` but the complete record then fails `prepareShowStageV2`, so admission refuses `unsupported-pilot-record`. Recorded as §3 R9 with the smallest counterexample asserted in the test |
| GROUP-HOLD | §7 two-occurrence example; repeat insertion inside a hold; move/duplicate/unique/ungroup; internal Transition and shared-animation conflict | `showV2IntegratedGroupHoldSequence.test.ts` (two tests) | Exact §7 outcome (`[0,12000)` with a local 5000 hold, second occurrence at 22000, definition and runtime identity unchanged); repeat insertion extends the same hold identity to 3000 ms; move/duplicate/Make Unique preserve the hold list and `instanceBindings`; Ungroup reproduces the mapped materialized children; delivered `.epe` shows one reset at the internal Transition contribution and no retrigger during the hold; overlapping effective Group instance track refuses atomically with exact half-open adjacency accepted | Proved. The conflict partition runs on the same fixture **without** the internal Transition, because the lowering guard in §3 R9 forbids partial-activation tracks whenever a participant-scope positive Transition exists |
| LAYOUT-END | Repeated Layout definition → Make Unique → switch move/remove → shorten/extend Show End → Undo | `showV2IntegratedStructureSequences.test.ts` ("runs Make Layout Unique, switch move and removal, Show End edits and Undo…") | Cloned definition identity without cloning Zones; switch move leaves Clips, Markers and Group choreography fixed; removal extends the predecessor to full coverage; invalid shortening refuses; extension stretches coverage and leaves the dormant Marker at 90000; Undo restores the prior composition; delivered artifact keeps one continuous shared runtime | Proved. Transfer protection on shortening is covered by `showLayoutIntervalsV2.test.ts` ("refuses Show End shortening across content, track activation, or a timed transfer"); this fixture has no transfer |
| LAYERS | Empty named Layer → reorder → Group bind → remove/reassign | `showV2IntegratedStructureSequences.test.ts` ("runs empty named Layer, reorder, Group rebinding and removal…") | Empty named Layer with no materialized occupant; reorder changes ranks only, Clip and Group identities stable; colliding Group destination refuses atomically; rebinding to the empty Layer keeps the runtime; the vacated Layer removes cleanly; removing the now-referenced Layer without a plan refuses; delivered artifact reopens with one authored member | Proved. Explicit complete-reassignment partitions (`clip`, `group-layer-binding`, `transition-participant`) remain proved in `showLayersV2.test.ts` and `showV2LayerAdmission.test.ts` |
| ROUTE / FAILURE where a sequence crosses the real route | v1/v2 → edit → Undo/Redo → save → reload → export/import; missing dependency, invalid/stale/duplicate candidate, failed/superseded save | existing `src/store/showV2*Admission.test.ts` and `showV2PilotStore.test.ts`; the integrated sequences add write/history counting and reopened-import equality | Provider readback via the recording provider, history `past` length, `.pxlshow` v2 reopen equality, refusal-with-zero-writes | Proved by the landed per-slice suites; the integrated sequences confirm the same guarantees across multi-step sequences |
| Stage / guide obligations | Renderer and browser proof across later Layout switches, solo selection and authored guides in Fast/Precise without changing generated output | `showStagePresentationV2.test.ts`, `ShowStagePreview` component tests, `e2e/show-v2-prepared-stage.auth.spec.ts`, `.wrsp/ui-proof/1038-stage-isolation.json` | Pure window coverage of `[0, showEndMs)`, half-open ownership at a switch, transfer blending, guide derivation; component tests assert compilation/runtime identity unchanged under solo/guide toggles; seven committed captures across the switch | Proved, with the three presentation residuals in §3 R7 |

Rows owned by other children and **not** audited here: MODEL, TRANSITION,
DELETE-READD, V2-EDIT-WHOLE-OUTPUT, V2-EDIT-DIVERGENT-TRANSITION,
V2-EDIT-LAYOUT-TRANSITION, CURVE, ACTIVATION, CHAPTERS, PARITY, MCP, RETIRE.

## 3. Residual reconciliation

Classification key: **(a)** resolved by a landed commit; **(b)** accepted bounded
compiler restriction per the specification; **(c)** open Jon decision, quoted
verbatim and not answered here; **(d)** unaccepted representation gap.

| # | Residual | Class | Basis |
| --- | --- | --- | --- |
| R1 | "may unsupported timed Effect reordering refuse unchanged rather than add compiler work?" | (c) | Carried in the issue body and in `show-v2-appearance-management.md` as pending, not accepted either way. No implementation assumes an answer |
| R2 | "should resizing a Transition that carries Property ramps re-time the ramp window or keep refusing" (counterexample in `issue-1038-transition-route/`) | (c) | Ramp-carrying resize keeps its atomic refusal; `show-v2-transition-route.md` records the refusal as current behavior without claiming it is the accepted end state |
| R3 | Opposite held Effect ordering can produce a legacy recipe runtime variant; native lowering refuses `unsupported-runtime-sharing` | (d) | Documented in `showClipAppearanceSelectedTimeV2.test.ts` ("documents the unresolved opposite-order adapter gap against independently authored adjacent runs") and `showV2AppearanceAdmission.test.ts`. Bounded: it blocks one authored ordering, not the landed surface. Does not block `📦 implemented` for #1038 because the accepted behavior (refuse atomically, zero writes) is proved; the representation gap is epic-level work |
| R4 | Repeated Layouts plus positive Layer Transitions | (a) | Repaired by `b004c39b876ba48f6d3449bb21e48b057d58010e` with native output/state and real admission proof (`showLayoutTransitionPreparationV2.test.ts`, `showGlobalTransitionAdaptersV2.test.ts`) |
| R5 | Positive ordinary Transition plus materialized Group instance-control animation in one section prepares `unsupported-transition-property-track` | (d) | Landed refusal is atomic and proved, but §5 of the specification requires owner proof before an adapter guard counts as a compiler limit. Same guard as R9; see that row for the exact counterexample |
| R6 | An empty Effect stack loses the Effect stage's incidental clamp, exposing the fixture Pattern's pre-existing Precise `elapsed/50000` divergence | (b) | Reproduced from an independently authored no-Effect record (`issue-1038-appearance-surface/removal-precise-residual.json`); Fast and elapsed state exact. A Pattern-source arithmetic property, not an edit-owner defect |
| R7 | Stage presentation residuals: selected-Clip outline stays legacy-only; mask/guides follow authored occurrence boundaries rather than split-position animation; transfer blending unions Zone ownership instead of reproducing crossfade weights | (b) for the last two (deliberate, documented granularity in `show-v2-prepared-stage.md`); (c) for the first — it needs a native Clip focus seam decision | The prepared route publishes no Clip focus, so restoring the outline would require a new seam |
| R8 | Continuous-flat participant Transitions plus multiple Layouts keep their atomic refusal | (d) | `showLayoutTransitionPreparationV2.test.ts` records the complete flat routing recipe rejection as an unresolved preparation obligation, and the physical2D independent/span sampling mismatch as measured, not equivalent. Bounded to that routing class |
| R9 | With a participant-scope positive Transition present, every non-Layout/non-repeat property track must be activated over exactly `[0, showEndMs)`; section-scoped activation refuses `unsupported-transition-property-track` (`showCompositionLoweringV2.ts`). Consequence: Insert Time at `p = 0` shifts a full-Show activation off zero and makes the mapped candidate unpreparable | (d) | New finding of this audit. Smallest counterexample asserted in `showV2IntegratedInsertSequence.test.ts`: the same mapped candidate prepares `ready` as soon as the participant Transition and its two Clips are removed. Owner: `showCompositionLoweringV2.ts` (the guard), with #1035/#1037 supplying section-scoped activation evidence. §5 of the specification classifies this family (RL11, multi-key appearance plus Transitions) as requiring owner proof rather than an accepted compiler limit |
| R10 | Overlong scalar carrier escaping its Transition window and suppressing a later Layout baseline | (a) | Repaired as the #1052 bounded whole-output carrier at `cf76983b3a68046ca74b5c46eabc338eabecfb5a` |
| R11 | Short scalar-carrier coercion: already-admitted whole-output boundary scalar durations 1/99 coerced to 100 by legacy recipe conversion | (d) | Recorded in the issue ledger; `8666d889` preserves exact 1/99/100 handling only for its newly admitted interior-edge cases. No universal short-carrier claim exists |
| R12 | Measured arithmetic: one-LSB Precise difference for selected-time sectioning; near-zero Fast difference for neutral saturation/contrast on an untouched sharing user | (b) | Documented and measured; candidate-versus-independently-authored oracles remain exact. No tolerance widening |
| R13 | Replace lifecycle partition: replacing the old shared runtime's earliest contributing use changes its remaining contribution/reset schedule | (b) | Existing runtime semantics; proved against an independently authored replacement, with preimage equality proved separately where schedules are unchanged |
| R14 | Stage coordinates: inherited sample-from-position behavior is not proof of general sample/position independence | (b) | Explicit qualification boundary retained in `show-v2-prepared-stage.md` |
| R15 | RL08–RL10 and the independently established participant/static-cache restrictions | (b) | Bounded compiler refusals per §5; explicitly deferred to #1045 |

### What blocks `📦 implemented`

Only R9 is both new and load-bearing for an assigned §12 row: it prevents the
INSERT row's `p = 0` partition from completing through the real route. Every
other (d) residual (R3, R5, R8, R11) is a bounded representation gap already
recorded in the issue ledger and in a contract, with the landed behavior proved
to refuse atomically and write nothing. R9 shares its owner with R5, so one
repair can retire both.

## 4. Verification run for this slice

See the handoff for verbatim command output. The audit added no product
behavior: every change is a test, an evidence document, or a contract/reference
correction describing already-landed behavior.
