# Every v1 Show diagnostic, and its v2 counterpart

Issue #1039. Specification `docs/plans/scene-retirement-specification.md` at
`51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`, sections 1 (no silent narrowing of
accepted behavior), 9 and 12 FAILURE. Base `79e98613`.

Three workers each found, by accident, a v1 validator with no v2 caller: the
Portable capability check, the Installation coverage check, and a third family
the coverage worker measured. Finding them one at a time is the wrong method.
This document replaces it with a complete enumeration, read from the code
rather than from memory, of every diagnostic the v1 product path can emit for a
Show, with the v2 check and test that pin each one — or `none`.

## Method

Every row was read from the named source file at base `79e98613`, not recalled.
Every `none` verdict and every counterexample below was measured by running the
two validators over the same authored data, not asserted. Where the rule is
version-independent it is now implemented once and shared; where v1's premise
is retired by the v2 representation the row names the specification section
that retires it.

**In scope**, as the dispatch names them: `src/engine/showAuthoringValidation.ts`
(`validateShowAuthoring` and everything it calls),
`src/engine/showPreviewArtifact.ts` (`compileShowForArtifact`'s refusals),
`src/engine/showModel.ts` normalizers that refuse or repair,
`src/engine/showImportPlan.ts` and `src/engine/showFileBundle.ts` import
refusals, and the v1 admissions that consume them (`src/agent/editorAdmission.ts`,
`src/store/showResizeAdmission.ts`).

**Out of scope.** `src/agent-harness/` is a diagnostic surface, not product
code, and is untouched. Compiler and lowering refusals are not authoring
diagnostics; the specification's section 5 ledger (RL08–RL11) governs them and
the rows below say so where a v1 authoring rule was in fact a scheduler
restriction.

## Severity vocabulary

`validateShowAuthoring` returns `{ valid, errors, warnings }`. Its two v1
consumers, `agent/editorAdmission.ts:223` and `store/showResizeAdmission.ts:92`,
read `valid` and `errors` only. So:

- **error** — the candidate is refused; nothing is adopted, saved or stamped.
- **warning** — the Show stays authorable; the diagnostic is reported and the
  candidate is admitted.
- **artifact refusal** — `compileShowForArtifact` returns `error` (no artifact)
  or `artifactBlocker` (artifact present, export and send disabled). The v2
  counterpart is a `buildShowV2RouteArtifacts` refusal, which the route surfaces
  as `blockedReason` and which gates the same three actions.

## 1. `validateShowAuthoring`'s own structural block

`src/engine/showAuthoringValidation.ts:131-175`. Every row is an **error**, and
the function returns as soon as any of them exists, so no warning from a later
step accompanies one.

| Code | v1 site | v2 counterpart |
| --- | --- | --- |
| `empty-identity`, `duplicate-identity` — Scene, Zone, Layout, Cell, Transition | `identities()` at `:135-149` | Zone and Zone Layout identity: `uniqueIndex(issues, 'zones' \| 'zoneLayouts', …)` in `validateShowRecordV2Domain`, pinned by `showCompositionV2.test.ts`. Clip, Layer, Transition, instance, Marker, track, Group identity: the same helper over the v2 collections. Scene and Cell identity is retired by the representation (specification section 1, "authored Scenes, flat cells … leave normal v2 persistence") |
| `invalid-scene-duration` | `:150-152` | Retired by the representation; `composition.showEndMs` owns loop length (specification section 3) and `validatePositiveTime` checks it |
| `unknown-cell-owner` | `:153-155` | Retired with cells; a v2 Clip's Zone and Layer are checked by `validateShowRecordV2Domain` (`missing-reference`) |
| `transition-missing-scene`, `routing-layout-required`, `transition-missing-layout` | `:156-161` | Retired: v2 Transitions name Clip participants, not Scene boundaries, and routing is a Layout occurrence, not a Transition kind (specification sections 3 and 5). `validateShowRecordV2Domain` checks participants and `layoutId` existence |
| `empty-identity`, `duplicate-identity` — a Zone inside one Layout | `:163` | **was none — ported this slice** (`showZoneLayoutStructure.ts`; `showZoneLayoutStructure.test.ts`, `showV2AuthoringStructureAdmission.test.ts`) |
| `layout-missing-zone` | `:164-166` | **was none — ported this slice**, same module and tests. A Portable Show's *logical* Zone list was partly covered by `portable-logical-zone-missing` in `showPortableCompatibility.ts`; an Installation Show and a Layout's physical zone entries were not covered at all |
| `invalid-physical-range` | `:167-169` | **was none — ported this slice**, same module and tests |
| `invalid-logical-routing` | `:170` | **was none — ported this slice**, same module and tests. A Portable Show was partly covered by `portable-logical-routing-invalid`; an Installation Show was not |
| `invalid-output-count` | `:172-173` | **was none — ported this slice** (`invalidShowOutputCountIssue`; `showOutputCountRule.test.ts`, `showV2AuthoringStructureAdmission.test.ts`) |

Measured counterexample for the Zone Layout family, taken at base `79e98613`:
an Installation Show over 16 pixels whose Layout assigns
`[{ start: 0.5, end: 14.75 }]` is `valid: false, errors: ['invalid-physical-range']`
on v1 and `valid: true` on v2, carrying only the Installation coverage warning.

## 2. `validateShowAuthoring`'s delivery warnings

| Code | v1 site | Severity | v2 counterpart |
| --- | --- | --- | --- |
| output count past `SHOW_MAX_OUTPUT_PIXELS` (no diagnostic code) | `:175` | warning | **was none — ported this slice** (`showOutputCapacityMessage`; `showOutputCountRule.test.ts`) |
| Installation coverage (no diagnostic code) | `:211-212` | warning | `validateInstallationCoverageV2` in `validateShowAuthoringV2`, pinned by `showAuthoringValidationV2.test.ts` and `showV2InstallationCoverageAdmission.test.ts` (landed at `79e98613`) |
| `portable-reference-map-unsupported`, `portable-physical-routing-unsupported`, `portable-renderer-unsupported` | `:213-217` | warning | `validatePortableShowCompatibilityV2`, pinned by `showPortableCompatibilityV2.test.ts` and `showV2PortableAdmission.test.ts` (landed at `79e98613`) |
| `portable-logical-zone-missing`, `portable-logical-routing-invalid` | `:213-217` | error | same owner, same tests |
| `portable-metadata-unavailable` | `:213-217` | error | same owner, same tests |
| Portable adaptation advisories (no diagnostic code) | `:218` | warning | same owner, same tests |

## 3. Dependency and metadata diagnostics

`src/engine/showAuthoringValidation.ts:176-210`, over `showPatternSites`,
`libraryDependencies` and `controlRequirements`.

| Code | Severity | v2 counterpart |
| --- | --- | --- |
| `pattern-reference-unavailable` | error, or warning under `allowExistingMissing` when the baseline already held it | `validateShowAuthoringV2` over `showPatternSitesV2`, sharing v1's `libraryDependencies` and `referenceIdentity`; `showAuthoringValidationV2.test.ts` |
| `library-reference-unavailable` | same | same |
| `pattern-metadata-unavailable` | error | same |
| `control-metadata-unavailable` | error | `controlRequirementsV2`; same test |

## 4. Composition diagnostics

`validateShowComposition` (`src/engine/showCompositionModel.ts:325`) and
everything it calls: `validateShowGroups` (`showGroupModel.ts:141`) and
`validateShowPropertyTracks` (`showPropertyAnimation.ts:125`).
`validateShowAuthoring` reports all of them as **errors**, carrying the
composition code through as the diagnostic code (`:174`). Its v2 counterpart is
`validateShowRecordV2Domain`, which every v2 pure owner, the v2 candidate
admission and v2 `.pxlshow` import run.

| v1 rule | v1 code | v2 counterpart |
| --- | --- | --- |
| Duplicate Pattern instance id | `duplicate-id` | `uniqueIndex('composition.patternInstances')` |
| Instance `time.timeOffsetMs` finite whole ms | `not-finite`, `not-integer` | **was none — ported this slice** (`showRecordTimeRules.test.ts`) |
| Instance `time.timeScale` finite | `not-finite` | **was none — ported this slice**, same test |
| Composition Scene references a Show Scene | `missing-scene` | Retired with Scenes (specification section 1) |
| Composition Zone exists | `missing-zone` | Clip `zoneId` `missing-reference` |
| Duplicate placement id | `duplicate-id` | `uniqueIndex('composition.clips')` and the Group-definition equivalent |
| Placement instance exists | `missing-instance` | Clip `instanceId` `missing-reference` |
| Placement start and duration are finite integers inside positive Scene-local time | `not-finite`, `not-integer`, `out-of-bounds` | `validateNonnegativeTime`/`validatePositiveTime` plus the Show End bound; global time replaces Scene-local time (specification section 3) |
| Placement opacity in `[0, 1]` | `out-of-bounds` | Appearance key `value.opacity` bound in `validateShowRecordV2Domain` |
| Placements on one Layer do not overlap | `overlap` | `clipsByLayer` overlap check |
| Duplicate overlay Layer id | `duplicate-id` | `uniqueIndex('composition.layers')` plus per-Zone rank uniqueness |
| Duplicate Layer transition id | `duplicate-id` | `uniqueIndex('composition.transitions')` |
| Non-Cut transition has positive duration | `out-of-bounds` | `validatePositiveTime`; a stored Cut is rejected outright (specification section 3, delta 1) |
| Transition endpoints exist | `missing-placement` | participant Clips must exist |
| Transition joins one Layer | `cross-layer` | `exactEndpoints` requires one Zone and Layer |
| Transition joins consecutive Clips at the exact gap | `invalid-transition` | `exactEndpoints` arithmetic, plus the whole-output contributor rules |
| An unrelated Clip may not start or stop at or inside a Layer transition; a Clip in another Zone may not do so after it begins; Fade and Motion may not pass over an unrelated Clip | `invalid-transition` | Not a record rule in v2. These are the scheduler restrictions the specification's section 5 ledger names RL08–RL10 and keeps as bounded **compiler** refusals; v2's whole-output scope has its own "cannot hide an intervening Clip" rule. Widening or relaxing them is deferred to #1045 |
| Private logical-Clip segments retain their ownership | `invalid-logical-clip` | Retired: hidden logical-Clip segments leave normal v2 persistence (specification section 1) |
| Group definition, occurrence, local instance, placement and transition identity and references | `duplicate-id`, `missing-definition`, `missing-scene`, `missing-zone`, `missing-instance`, `missing-placement`, `cross-layer`, `invalid-transition`, `overlap`, `out-of-bounds` | `validateGroups` in `validateShowRecordV2Domain`, over the v2 Group shape: definition-as-record validation, Layer bindings, holds, Zone availability across every intersected Layout occurrence, and a materialized re-validation |
| Group property track identity, owner and keyframe rules | `duplicate-id`, `invalid-property-track` | `validateGroups` validates each definition as a derived record, so the track rules below apply to Group-local tracks too |
| Composition `durationMs` positive whole ms | `not-finite`, `not-integer`, `out-of-bounds` | `composition.showEndMs` through `validatePositiveTime` |
| Duplicate Marker id | `duplicate-id` | `uniqueIndex('composition.markers')` |
| Marker time finite, whole, nonnegative | `not-integer`, `out-of-bounds` | **was none — ported this slice** (`showRecordTimeRules.test.ts`) |
| Duplicate property track id, duplicate keyframe id | `duplicate-track-id`, `duplicate-keyframe-id` | `uniqueIndex` over `composition.propertyTracks` and each track's keyframes |
| One track per property target in a Scene | `duplicate-target` | Deliberately changed: specification section 4 keeps one active authored owner per effective **instance** target (`findShowInstancePropertyTrackConflictsV2`) and states that Clip-owned appearance tracks remain independent |
| Track needs two keyframes | `too-few-keyframes` | `keyframes.length < 2` in `validatePropertyTrack` |
| Keyframe times ordered inside the owner | `unordered-keyframes`, `not-finite`, `not-integer`, `out-of-bounds` | `validatePropertyTrack` keyframe loop, over the track's own activation interval |
| Keyframe easing valid | `invalid-easing` | `validateShowEasing` in `validatePropertyTrack` |
| Keyframe value finite | `not-finite` | `Number.isFinite(keyframe.value)` |
| Target instance exists | `missing-instance` | `invalid-property-target` |
| Target placement exists | `missing-placement` | `invalid-property-target` |
| Target Effect exists and its kind matches | `missing-effect`, `effect-identity-mismatch` | `invalid-property-target`, over every appearance span intersecting activation |
| Animated control is authored on the instance | `missing-control` | **none, and deliberately so.** See residual R1 |
| Target Effect parameter is numeric | `missing-effect-parameter` | Owned by `showClipAppearanceEditsV2.ts:285-287` at the appearance edit owner, not by the record validator. See residual R2 |
| Keyframe value inside its target's authored range, and whole-numbered for a stepped Effect parameter | `out-of-bounds`, `not-integer` | **none.** See residual R3 |

## 5. Artifact-boundary refusals

`src/engine/showPreviewArtifact.ts:131-174`. `compileShowForPreview` consults
none of these: preview compiles a Show delivery refuses, in both versions.

| Refusal | v1 site | v2 counterpart |
| --- | --- | --- |
| `installationCoverageBlockingMessage` | `:138-139`, before compile | `buildShowV2RouteArtifacts` (landed at `79e98613`); `showV2RouteDelivery.test.ts` |
| `portableCompatibilityBlockingMessage` | `:140-161`, before compile | same owner and test, over materialized runtime uses |
| Compile failure | `compileShowForPreview` catch at `:121-122` | `prepareShowStageV2` returns `refused`; the route reports it as `blockedReason` |
| Target Controller pixel count past `SHOW_MAX_OUTPUT_PIXELS` for a Portable Show | `:163-169`, `artifactBlocker` | **none.** See residual R4 |
| `summary.resources.blockers[0].message` | `:170-173`, `artifactBlocker` | **was none — ported this slice** (`showV2RouteDelivery.ts`; `showV2RouteDelivery.test.ts`) |

Measured counterexample for the ledger row, taken at base `79e98613`: the Group
editor fixture as a 4,000-pixel Installation Show with complete coverage
prepared `ready` and delivered an `.epe` at 12,012 of 10,240 VM words.

## 6. Import refusals

v1: `src/engine/showImportPlan.ts` and `src/engine/showFileBundle.ts`.
v2: `src/engine/showImportPlanV2.ts` and `validateParsedBundleV2`.

| Refusal | v1 | v2 counterpart |
| --- | --- | --- |
| `unknown_stock_pattern` | `showImportPlan.ts:94-100` | `showImportPlanV2.ts:135` |
| `missing_bundled_pattern` | `:104-111` | `showImportPlanV2.ts:140` |
| `missing_bundled_map` | `:139-146` | `showImportPlanV2.ts:158` |
| `invalid_show` — invalid timeline metadata or composition | `:237-245` | `showImportPlanV2.ts:98-99`, over `validateShowRecordV2` |
| `invalid_file` — malformed envelope, missing version, invalid record, invalid cell list | `showFileBundle.ts:218-232`, `normalizeParsedShow` | `validateParsedBundleV2` plus `cloneValidShowRecordV2`, which runs the v2 schema and domain rules |
| `unsupported_version` | `showFileBundle.ts:231-236` | same site; the v2 bundle is accepted only under `acceptV2` |
| `missing_user_pattern`, `missing_custom_map`, `unsupported_library_reference`, `missing_user_library` | `buildShowFileBundle`, export side | The same functions, already version-aware through `isShowRecordV2` |
| Library dependency resolution on import | none — v1 import resolves no Libraries | `validateDependencies` in `showImportPlanV2.ts:210-219`. v2 is stricter here; that is #1044's landed design, not a gap |

**v1 import never runs `validateShowAuthoring`.** None of section 1's structural
errors, section 2's delivery warnings or section 3's dependency errors is an
import refusal in v1. So none of them became one in v2 either: the ported Zone
Layout and output-count checks are authoring-validator rules, reached by the
candidate admission, and `showImportPlanV2.test.ts` now pins that a `.pxlshow`
carrying `[{ start: 0.5, end: 14.75 }]` imports with those endpoints unchanged
and unrepaired.

## 7. Admission-owned diagnostics

| Diagnostic | v1 site | v2 counterpart |
| --- | --- | --- |
| `schema-*` raw-schema codes | `editorAdmission.ts:31-68`, Ajv over the v1 schema with `strictNumbers` | `validateShowRecordV2Structure` plus `rawSchemaDiagnostic` in `showV2CandidateAdmission.ts`, over the provisional v2 schema, also `strictNumbers` — which is why `not-finite` rows above are schema-covered in both versions |
| `map-metadata-unavailable` | `editorAdmission.ts:219-222` | `showV2CandidateAdmission.ts`, and the prepared-edit admission's `showV2StageMapAvailable` |
| `metadata-invalidated` | `editorAdmission.ts:78`, `:192-199` | `delivery.invalidated()` in `showV2CandidateAdmission.ts` |
| `validation-unavailable`, `admission-unavailable` | `editorAdmission.ts` fallbacks | same names in `showV2CandidateAdmission.ts` |
| `structure-invalid`, `composition-invalid`, `reference-unavailable`, `metadata-unavailable`, `delivery-invalid` fallbacks | `authoringFallback` at `:70-76` | the same map in `showV2CandidateAdmission.ts:87-93`, plus `domainCodes` for the v2 record codes |
| Resize admission refusal on `!valid` | `showResizeAdmission.ts:92,99` | The v2 counterpart is the prepared-edit admission, whose pure owners validate their own candidate through `validateShowRecordV2`; there is no caller-supplied v2 resize candidate to validate |

## 8. Normalizers that repair

The specification forbids a universal v2 normalizer (section 3: "No new
universal normalizer supplies these changes"). Each row below states what v1
silently repaired and what the v2 owner does instead. **A repair is not a
check, so none of these is ported.**

| v1 repair | v1 site | v2 |
| --- | --- | --- |
| Substitutes a default Layout when a Show has none | `normalizeShowRoutingState` | Refuses: the v2 schema requires at least one `zoneLayouts` entry and `validateLayoutCoverage` requires occurrences to cover `[0, showEndMs)` exactly |
| Drops routing transitions naming an unknown Layout | `normalizeShowRoutingState` | Retired with routing transitions; a Layout occurrence names an existing definition or the record is invalid |
| Rounds, clamps to zero, and sorts physical range endpoints | `normalizeRoutingLayout` | No normalizer. `editShowZoneLayoutDefinitionV2` refuses non-integer and negative endpoints at the owner; after this slice the candidate admission refuses non-integer endpoints too, and a negative integer endpoint stays admitted in both versions and is answered by the Installation coverage rule. Unsorted and overlapping ranges stay admitted in both |
| Renames a blank Layout name to `Untitled layout` | `normalizeRoutingLayout` | No normalizer and no record rule. `editShowZoneLayoutDefinitionV2` refuses a blank name at the owner; a candidate carrying one is admitted, where v1 would have renamed it. Reported as residual R5 |
| Inserts a Cut at every Scene boundary lacking a visual Transition; normalizes boundary kind, duration, easing and variant settings | `normalizeShowTransitionState` | Retired: Cut is absence (specification section 5) and v2 decode rejects a stored Cut (section 3, delta 1) |
| Coerces `restartOnEntry` to a Boolean | `normalizeShowEntryState` | Retired: `entryPolicy: continue \| restart` is a schema enum (specification section 3, delta 2) |
| Sorts instances, Scenes, Zones, placements, tracks and keyframes into deterministic order, and compacts Transform and Aperture objects | `normalizeShowComposition`, `normalizePlacementAppearance` | No normalizer. v2 validation is order-independent where order is not authored, and checks order explicitly where it is (appearance keys strictly increasing, holds strictly increasing, Layout coverage) |
| Removes overlay Layers empty in every Scene | `harvestEmptyShowOverlayLayers` | Retired: a v2 Layer keeps stable identity, name and rank through empty stretches (specification section 8); removal is an explicit owner operation |
| Clamps the output pixel count and normalizes map ids, or throws when the contract is unreadable | `normalizeShowOutputContract`, `requireShowOutputContract` | No normalizer. `cloneValidShowRecordV2ForWorker` validates a stored v2 row instead of repairing it, and after this slice a count that is not a positive safe integer is an authoring error rather than a silently clamped value |
| Normalizes output Effects on read and write | `normalizeShowOutputEffects` in `cloudflare/shows.ts` | The same helper on the v2 write path (`cloudflare/shows.ts:206`), so this row is shared rather than lost |
| Normalizes stored import metadata on read | `normalizeShowImportMetadata`, `cloudflare/shows.ts:96` | v1 rows only. A v2 row's `importMetadata` is validated by the provisional v2 schema instead of repaired, so an unreadable one refuses the row rather than being dropped |
| Normalizes Cell adaptations | `normalizeAdaptations` | Retired with cells; a v2 Clip's adaptations are authored on its Pattern instance and validated by the schema |

## Residual gaps

These are the rows this slice did **not** port, each with the measured
counterexample and the reason.

**R1 — `missing-control` is retired by a landed v2 decision, not missing.**
v1 requires an animated `instance-control` target to name a control the
instance authors in `controlTargets`. v2 deliberately does not:
`showPropertyEditsV2Boundaries.test.ts`, "keeps source-dependent controls
outside persisted CRUD validation and never seeds their payload", deletes
`controlTargets` and asserts the track add is `changed` and the record valid.
Porting v1's rule was attempted and reverted: it broke that test plus
`showClipReplaceV2.test.ts` and `showV2ClipReplacementAdmission.test.ts`.
Measured: v1 reports `missing-control` for an animated `sliderUnknown`; v2
reports nothing, by design. No action; the authoring validator's separate
`control-metadata-unavailable` question is unaffected.

**R2 — `missing-effect-parameter` exists in v2 at a different seam, with a
different record-level severity.** `showClipAppearanceEditsV2.ts:285-287`
implements exactly v1's rule and refuses an appearance edit that would preserve
an unusable target. But `showClipAppearanceEditsV2.test.ts`, "refuses a
complete candidate with an existing invalid numeric Effect parameter instead of
preserving an unusable target", explicitly asserts
`validateShowRecordV2(record)` is `[]` for that same record — the v2 owners
chose to keep such a record openable. v1 refuses the record outright, so v1's
candidate admission refuses it and v2's admits it. Measured: a track targeting
Effect `turn` parameter `nope` gives v1
`["missing-effect-parameter: Effect \"turn\" has no numeric parameter \"nope\"."]`
and v2 `[]`. Moving the check to `validateShowRecordV2Domain` would reverse a
landed, named v2 decision, so it is a product decision for the coordinator, not
a port.

**R3 — the animated-property value range cannot be ported without a product
decision.** v1 bounds every animated value by its target: time scale `[0, 4]`,
instance control, Clip opacity and Clip view `[0, 1]`, Transform scale
`[0.01, 8]`, rotation `[-8, 8]`, position `[-4, 4]`, Aperture size `[0.01, 8]`
and position `[-4, 4]`, and an Effect parameter inside its toolkit descriptor,
whole-numbered when that descriptor steps by one. `validateShowRecordV2` checks
only finiteness. Measured: a `clip-opacity` track keyframe of `5` gives v1
`["out-of-bounds: Keyframe value must be between 0 and 1."]` and v2 `[]`; a
time scale of `40` gives v1 `["out-of-bounds: Keyframe value must be between 0
and 4."]` and v2 `[]`.

The port was implemented, measured against the whole suite, and reverted. It
collides with landed #1037 curve retention: a v2 Clip trim seeds a retained
boundary keyframe from the evaluated original curve, and an overshooting easing
legitimately evaluates outside the nominal range. Measured counterexample —
`animatedRecord()`'s `clip-view` brightness track eased `back-in`, moved to
200 ms and trimmed to `[450, 950)`, seeds keyframes
`[[450, -0.06413656250000001], [950, 0.1825903124999999]]`; with v1's bound in
place the trim refuses with
`composition.propertyTracks[0].keyframes[0].value: Keyframe value must be
between 0 and 1`, breaking the three landed cases
`showPropertyAnimationV2.test.ts` "preserves back-in / back-out / back-in-out
through move, trim, extend, split and reopen". The decision the coordinator
owns is whether a derived boundary value is exempt from the authored range, or
whether the bound should widen to what the authored curve reaches. Until then
v2 is looser than v1 for every animated property value. Specification section 6
already settles exactly one of these targets — animated Show repeat scale,
which refuses an edit whose complete original source curve leaves `1–8` — which
is why this row is a decision and not an oversight.

**R4 — the Portable target-Controller pixel-count blocker needs a route
input.** `compileShowForArtifact` blocks export and send for a Portable Show
when the *connected Controller* reports more than `SHOW_MAX_OUTPUT_PIXELS`
pixels (`options.targetPixelCount`). Nothing supplies a target pixel count to
`buildShowV2RouteArtifacts` or `prepareShowStageV2`; the only pixel count in the
v2 preparation is the Show's own authored one, which this slice's capacity
warning and the ledger's `output-pixel-limit` blocker already cover. Closing
this row means passing the connected Controller's reported count from the route
into delivery, which is a UI path change this slice is not authorized to make.
Reported, not ported.

**R5 — a blank Zone Layout name is repaired by v1 and admitted by v2.**
`normalizeRoutingLayout` renames a blank or whitespace name to
`Untitled layout`; `editShowZoneLayoutDefinitionV2` refuses one at the owner;
no v2 record rule or authoring rule asks. A candidate carrying
`{ id: 'both', name: '  ', zones: [...] }` is admitted on v2 and would have
been silently renamed on v1. Porting the repair is forbidden (no new
normalizer); porting it as a refusal would be stricter than v1's callers, which
never refuse it. Reported, not ported.

**R6 — RL08–RL10 remain compiler restrictions.** Three of v1's
`invalid-transition` rules (an unrelated Clip starting or stopping inside a
Layer transition, a Clip in another Zone doing so after it begins, and Fade or
Motion passing over an unrelated Clip) are the scheduler restrictions the
specification's section 5 ledger names RL08–RL10 and keeps deferred to #1045.
They are not record rules in v2 and this slice did not make them one.

**R7 — Marker and instance times use the v2 safe-integer bound.** The two rules
ported in section 4 use `Number.isSafeInteger`, which specification section 3
requires of every v2 time, where v1 used `Number.isInteger`. The two differ only
for a value above 2^53 milliseconds. Making Markers the one v2 time field
outside section 3's contract would be the stranger choice; it is recorded here
rather than special-cased.

**R8 — scope.** `src/agent-harness/` is untouched; its `validateShowDocument`
is a v1-only diagnostic surface whose v2 counterpart belongs to #1041. No
compiler, schema or runtime-domain capability was widened. No UI path changed.
Authoritative committed-tip suites, exact-range review and landing are the
coordinator's.
