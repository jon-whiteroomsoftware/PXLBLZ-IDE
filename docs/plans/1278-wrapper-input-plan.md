# #1278 plan: bind a hardware input to a Wrapper Control

Forward plan for [#1278](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1278) (epic #1235). It was written by the W5 planning lane on 2026-11-26 and moved out of the issue body at the eng lead's request. The 1278a lane commits it with its first slice. Spec: `docs/plans/wrappers-specification.md` §§1, 4–7, with decisions 3, 20 and 30. Plan review and dispositions: [comment](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1278#issuecomment-7205152877).

## Tests

Oracle: saved program bytes on the transport double, rendered frames for a stepped input value, and the stored profile. Expanded by W5 (2026-11-26 15:59 -07:00) through `systematic-test-design`; plan-review dispositions: [comment](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1278#issuecomment-7205152877).

**Invariants.**

- **B1 Replacement.** For an applied, bound and not opted-out Wrapper, the saved source exports no `sliderSlowMo`/`sliderDreamy` for it and samples the input once per real frame. Every other export is unchanged.
- **B2 Equivalence.** With smoothing 1 and no invert, the frames rendered for input reading `r` equal the frames of the same Pattern wrapped with the slider at `r`, frame by frame. With invert, they equal the slider at `1 - r`.
- **B3 Low end off.** At the input's low end the wrapped Pattern renders the frames of the unbound Wrapper with its slider at the left end, with one or both Wrappers on. With both on, a reading just above zero sets `position < 1` and turns off the native clock (`slowMo.ts:265`). A smoothed reading below 0.03 therefore counts as exactly off for both Wrappers (D2).
- **B4 Opt-out.** A Pattern whose own binding uses the Wrapper's input saves the same bytes it saves with that Wrapper unbound.
- **B5 One to one.** Every stored profile has each input on at most one of Brightness, Slow-mo and Dreamy, each Wrapper with at most one input, and no `inputId` on a disabled Wrapper. A profile breaking this is refused whole, and the prior stored profile is unchanged.
- **B6 Same record.** Binding from the Wrapper row and from the input card produce byte-equal `globalTransforms`.
- **B7 Signature.** A Pattern's artifact signature changes iff its saved bytes change. Binding rewrites exactly the Patterns where the Wrapper is applied and not opted out. Renaming the input rewrites nothing. A profile with no bound Wrapper keeps #1279's signatures byte for byte.
- **B8 Values.** Bind and unbind overwrite each Pattern in place under its program ID, and PXLBLZ sends no Control value for a Wrapper Control.
- **B9 Isolation.** Shows, foreign programs, the library Pattern and the preview are unchanged by any binding.

**Partitions** (pairwise, engine table in `src/engine/slowMo.test.ts` and `src/engine/controllerArtifactDelivery.test.ts`):

| Dimension | Values |
| --- | --- |
| Wrapper | Slow-mo; Dreamy; both applied with one bound; both bound to different inputs |
| Binding | unbound; bound; bound but the Wrapper skipped (memory, `control-name-taken`) |
| Pattern's own use of the input | none; same input on its own Control; a different input on its own Control |
| Input settings | smoothing 1; smoothing 0.2; smoothing 0; invert; fallback 0; fallback 0.5 |
| Input reading | 0; just above the bypass (0.03, 0.06); 0.5; 1 |
| Profile record | valid; dangling `inputId`; one input on two Wrappers; one input on Brightness and a Wrapper; `inputId` on a disabled Wrapper; digital input |
| Artifact | Pattern; Show; foreign program |

**Cases.**

- **E1 Emit** (`slowMo.test.ts`). Bound Slow-mo, bound Dreamy and each mix: no export for the bound Wrapper, the sample reads `analogRead(PIN)` in the outer `beforeRender` before `rate`/`kDn`, and the skip decision (applied, skipped, `arrayWords`) is identical to the unbound call on the same source and count.
- **E2 Frames** (`slowMo.test.ts`, emitted Controller code run in the preview runtime with stubbed `analogRead`, a time-driven Pattern). B2 at readings 0.25, 0.5 and 1 for Slow-mo alone, Dreamy alone, and both on different pins with one stepped and one held. Repeat with invert. A stepped reading 0 → 0.5 → 0 with smoothing 0.2 crosses both Slow-mo thresholds. The value follows outer frames, including one with no inner tick and one with several, never slowed frames.
- **E3 Low end** (`slowMo.test.ts`). B3 at reading 0 and fallback 0 for each Wrapper and for both on. Readings 0.01 and 0.029 render as the slider at the left end (D2), with both Wrappers on as well. 0.03 and 0.06 render as the slider at 0.03 and 0.06.
- **E4 Fallback** (`slowMo.test.ts`). The first frame uses the fallback; the value then converges by the smoothing factor, as `hardware-brightness-sample` does (`controllerProfilePassRecipe.ts:302-327`).
- **R1 Order** (`controllerProfilePassRecipe.test.ts`). With Brightness and Power limit on and a bound Slow-mo: recipe order is Pattern bindings → `wrappers` (carrying the input) → Brightness sample and intercept → Power limit. No separate inject pass exists for the Wrapper input. Rendered frames: Rendered frames: with a Dreamy trail showing, step an independently bound Brightness input to 0, and the next frame is dark. Raise it while the trail persists, and the output stays within Power limit.
- **R2 Opt-out** (`controllerProfilePassRecipe.test.ts`, `controllerArtifactDelivery.test.ts`). Three Patterns on one profile: one binds the same input to its own Control, one binds a different input, and one has no binding. Only the first regains the slider. On it, a reading step drives its own Control while the Wrapper follows the slider. The other Wrapper stays input-driven throughout. Repeat with the Wrappers exchanged. `control-name-taken` still skips a bound Wrapper. The generalised predicate keeps today's Brightness results for every existing `controllerProfile.test.ts` case.
- **V1 Validation** (`controllerProfile.test.ts`). Each invalid Profile record row in the table is a record-level issue (not `configuration`), plus two Slow-mo members on different inputs (#1279's duplicate rule). A digital input on a Wrapper is a `configuration` issue, which is storable and shown on the input card. The recipe gives that Wrapper no input, so the slider stays and its bytes match the unbound Wrapper's (D3).
- **V2 Refused whole** (`src/cloudflare/controllerProfiles.test.ts`, route test for `src/worker/routes/controllers/[id].ts`, `src/store/controllerProfileStore.test.ts`). For each invalid row, sent with an unrelated valid edit: the write is refused, and the complete prior row reads back unchanged. The store's optimistic update rolls back to the durable profile.
- **S1 Store sequences** (`controllerProfileStore.test.ts`; each step's output is the next step's input, asserting the whole `globalTransforms`, `inputs` and `patternBindings`):
  1. bind A → Slow-mo (Slow-mo turns on), then unbind (Slow-mo stays on, slider);
  2. bind A → Slow-mo, then A → Dreamy (moves; Slow-mo keeps its on state with no input);
  3. A drives Brightness, bind A → Slow-mo (Brightness disabled, Per-Pattern uses on A survive);
  4. bind A → Slow-mo, then B → Slow-mo (A released); then Brightness's input C → an occupied Dreamy (Brightness gone, Dreamy's prior input freed);
  5. bind A → Slow-mo, `setWrapperEnabled(slow-mo, false)` (`inputId` dropped), on again (slider);
  6. bind A → Slow-mo, `removeInput(A)` (Slow-mo stays on with the slider, one update);
  7. B6: the Wrapper-side and input-side calls from the same start give byte-equal profiles, after reload.
- **G1 Signature** (`controllerProfilePassRecipe.test.ts`, `controllerReconciliation.test.ts`). B7: three Patterns (applied, skipped, opted out) — binding changes only the applied Pattern's signature. Renaming the input changes none. Changing smoothing, fallback, invert or pin changes the applied one, including on an input with no Pattern use. Unbound profiles match #1279 signatures byte for byte, and a stored #1279 signature still reads `recognized`. A freshly saved bound artifact reads up to date through `readStoredArtifactSignature`. The reconciliation signature changes on bind, unbind and each sampling change, so a run is scheduled.
- **G2 Outcome** (`controllerArtifactDelivery.test.ts`, `controllerPushRecord.test.ts`). The confirmed `wrapperOutcome` carries the input's ID and saved name for each bound applied Wrapper, and nothing for an opted-out or skipped one. It round-trips through push-record storage and is absent for a Show.
- **P1 Panel** (`controllerPanelWrappers.test.ts`). An applied Wrapper whose outcome names an input becomes a row with `input: { name }` and no slider value. The name is the profile's current name for that input ID, or the saved name once the input is deleted and before the rewrite lands. An opted-out Pattern's row is a slider. A different program ID with no matching saved evidence falls back to reported exports.
- **U1 Page** (`ControllerProfilePage.test.tsx`, light). "Bind input" lists every analog input, marks one in use with "(now <Wrapper>)" and moves it when picked, and offers no "+ New input" (D1). The source text shows the input; "Use for a Wrapper" offers Brightness, Slow-mo and Dreamy.
- **F1 Flow** (`e2e/controller-reconciliation.auth.spec.ts` on the transport double). Three saved Patterns, one opting out: bind from the Wrapper row, reconcile, and read each saved program back (B1, B4). Set a Slow-mo value, bind, unbind and read each program's stored Control value (B8). Bind from the input card on a fresh profile and compare the stored profile (B6). Change a sampling setting, rename the input and unbind, counting saves per program for the applied, opted-out, name-collision, memory-skipped and Show cases (B7). Reconnect after each run, and no redundant Save follows. Shows and foreign programs keep their bytes (B9).

**Sequences** (whole state asserted after each step): S1 1–7; F1 set value → bind → reconcile → unbind → reconcile → read value; bind while a run is active folds into it (#1274's one-run rule).

**Preservation.** #1279's unbound-profile delivery bytes and signatures; the Brightness opt-out cases; Per-Pattern bindings; the preview's Wrapper sliders; `controller-wrappers.md`'s isolation clause.

**Proof.** Browser proof at desktop and 420 px: a row with a bound input, the picker on a Wrapper, the offer on an input, and the panel showing the input's name, recorded through the UI proof gate. F1 on the double. Bench with a potentiometer under a grant from Jon naming this issue: the control changes Slow-mo on two Patterns, the opted-out Pattern keeps its slider, and the slider value returns after unbind. The double models #1273 Q4 retention; only the bench proves it on firmware.

## Implementation plan

W5, 2026-11-26 15:59 -07:00. Plan only. Lead ruling (2026-11-26 16:57 -07:00): 1278a starts in a fresh lane once #1279 lands, serialized with 1277b on `controllerProfileStore.ts` and `controllerInputUses.ts`. 1278b waits for 1278a, #1277b and #1280 slice A. Bases: #1279 candidate `8fccfe45`, #1277's plan (comment 7203038811), #1280's body. Plan review and dispositions: [comment](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1278#issuecomment-7205152877).

**Emitted order and the input sample.** The Wrapper's input is sampled inside the `wrappers` pass, at the head of the outer `beforeRender`, before Slow-mo computes `rate` and Dreamy computes `kDn`. The recipe keeps #1279's order: Pattern and its bindings → `wrappers` (with the input) → Brightness sample and intercept → Power limit. A separate `inject` pass cannot do this: one placed before `wrappers` is renamed into the slowed `in_beforeRender`, and one placed after runs after the Wrapper (`wrapBeforeRender`, `passEngine.ts:524-544`), a frame late. So the knob responds in real time even while Slow-mo slows the Pattern. Brightness still scales what the Wrappers emit, and Power limit bounds the result.

**Untouched-slider bypass.** A bound Slow-mo sets `position = 1 - v` each frame from the smoothed reading `v`, then runs the existing hysteresis (`slowMo.ts:272-275`). At the low end it takes the native-clock bypass as an untouched slider does. Once engaged, the native clock stays off until the Pattern restarts. A slider moved away and back behaves the same way. A bound Dreamy sets `decay = 10000*v*v`. A smoothed reading below 0.03 counts as exactly 0 for both Wrappers (D2), so a resting knob renders as an untouched slider, even with both Wrappers on. The sample starts at the input's fallback and smooths toward the reading, as Brightness does (D4).

**Value restore.** None is written. Binding drops the Wrapper's export and unbinding restores it under the same name, with each Pattern overwritten in place under its program ID. On firmware 3.70, #1273 Q4 found the removed export's stored value kept and applied again on restore (`docs/reference/Pixelblaze device behaviour notes.md`, "Saved slider values survive an in-place Pattern rewrite"). Power-cycle survival is unmeasured, and a Pattern re-saved under a new ID starts at the left end. F1 asserts in-place overwrite and that no Control value is sent; the bench proves the firmware side.

### 1278a: engine, model, signature and store (needs #1279 on main)

- **`src/engine/slowMo.ts`.** `emitPatternWrappers(code, pixelCount, enabled, inputs?)`, where `inputs: Partial<Record<PatternWrapper, WrapperInputSample>>` and `WrapperInputSample = { pin, smoothing, fallback, invert }`. The skip decision ignores `inputs`. `emitWrapperSource` swaps a bound Wrapper's `export function slider…` for `var <p>in_<w> = FALLBACK` and prepends the sample to the outer `beforeRender`. The sample runs on every outer frame for either Wrapper alone or both, before any inner tick. After invert and smoothing, a value below 0.03 becomes exactly 0 (D2). The sample variable starts at FALLBACK (D4). The decision gains `inputs` naming the bound applied Wrappers. Preview emission is unchanged.
- **`src/engine/passEngine.ts`.** `WrappersPassRecipe.inputs?`. `applyWrappersPass` passes it through and adopts Controls only for unbound applied Wrappers.
- **`src/engine/controllerProfile.ts`.** The Wrapper member gains `inputId?: string`. `patternBindingOverridesHardwareBrightness` becomes `globalInputUsesOverriddenBy(profile, binding): GlobalInputUse[]` (`'hardware-brightness' | 'slow-mo' | 'dreamy'`), and the old name stays as a one-line wrapper only if a test needs it. `validateControllerProfile` adds record-level issues: a Wrapper `inputId` that names no input; an input on more than one of enabled Brightness, Slow-mo and Dreamy; an `inputId` on a disabled Wrapper. A digital input on a Wrapper is a `configuration` issue (D3), like Brightness on a digital input (`controllerProfile.ts:305-317`). `ControllerWrapperOutcome` gains `inputs?: Partial<Record<ControllerWrapperType, { inputId: string; name: string }>>`. The name is saved so the panel can still describe the saved program after the input is deleted.
- **`src/engine/controllerProfilePassRecipe.ts`.** `controllerProfilePassRecipe` resolves each enabled Wrapper's input, drops it for a Pattern whose own binding overrides it or for a digital input (D3), and puts it on the `wrappers` pass. A record that fails B5 contributes no input (the slider is used), so a bad stored row never emits two samplers. `controllerProfileArtifactSignature` adds `wrapperInputs` only when non-empty: for each bound, applied and not opted-out Wrapper, its type and the input's pin, signal, smoothing, fallback and invert. The input's ID and name are left out because neither reaches the bytes. The requested form carries the same, and `serializeArtifactSignature`, `readStoredArtifactSignature` and `ARTIFACT_SIGNATURE_KEYS` accept the key. `controllerProfileReconciliationSignature` adds Wrapper inputs and the per-Pattern overrides. The Brightness callers (`:236`, `:299`) move to the generalised predicate.
- **`src/engine/controllerArtifactDelivery.ts`.** Copy the decision's `inputs` into `wrapperOutcome`, and pass applied-and-bound inputs to the signature.
- **`src/engine/controllerPushRecord.ts`, `controllerMetadataStorage.ts`.** Round-trip `wrapperOutcome.inputs`. No new field outside the outcome.
- **`src/store/controllerProfileStore.ts`.** `bindWrapperInput(profileId, use: GlobalInputUse, inputId | null)`, which enforces one to one in one update: release the input from any other use (Brightness is disabled), replace the Wrapper's previous input, and turn the Wrapper on. `assignHardwareBrightness` delegates to it. `setWrapperEnabled(…, false)` drops `inputId`. `removeInput` clears Wrapper `inputId`s in the same update.
- **`src/engine/controllerInputUses.ts`.** `ControllerBrightnessUse` generalises to a Wrapper use `{ kind: 'wrapper', wrapper, label, scope, exceptPatternLabels, state }` for all three. `ControllerPatternUse.overridesBrightness` becomes `overrides: GlobalInputUse[]`.
- **Docs.** `docs/reference/contracts/controller-wrappers.md` gains the binding, order, opt-out, one-to-one and value clauses. Technical Reference §16 and `CONTEXT.md` "Wrapper Control" (an input can drive it).
- **Tests.** E1–E4, R1, R2, V1, V2, S1, G1, G2.

### 1278b: page, panel, flow and proof (needs 1278a, #1277b and #1280 slice A)

- **`src/components/ControllerProfilePage.tsx`.** Slow-mo and Dreamy `WrapperRow` `action`: "Bind input" opens the inline picker: every analog input, with one in use marked "(now Brightness)", "(now Slow-mo)" or "(now Dreamy)" and moved when picked, and no "+ New input" (D1). It shows "Unbind" when bound. `source`: the input's pin and name, then "every Pattern" or "every Pattern except <names>". The Inputs card's "+ Use for a Wrapper" offers Brightness, Slow-mo and Dreamy, and the card's use line shows the Wrapper and its scope. Every action calls `bindWrapperInput`.
- **`src/engine/controllerWrapperTags.ts`.** `wrapperRowSource(profile, type, patternNames)` and `wrapperBindingChoices(profile, type)`, both pure.
- **`src/engine/controllerPanelWrappers.ts`, `src/components/ControllerPanel.tsx`.** `ControllerPanelWrapperRow.input?: { name }` from `outcome.inputs`, with the name resolved by input ID from the current profile, falling back to the saved name. The panel renders the name in place of the `DeckSlider`. No live reading.
- **`e2e/fixtures/fakeControllerHelper.ts`.** Stored Control values per program ID, kept across a same-ID Save and across a removed export (modelling #1273 Q4), plus a log of Control writes.
- **`e2e/controller-reconciliation.auth.spec.ts`.** F1.
- **Docs.** Feature Guide §10 and the spec's §7 line for the panel name rule.
- **Tests.** P1, U1, F1, the browser proof captures and the bench run under Jon's grant.

**Size.** The developer budget is 220k (the `roles.yaml` default), so 60% is 132k. 1278a is about 550 lines of code and tests, plus the contract text: an estimated 80–95k with review and landing. 1278b is about 450 lines plus captures and the bench run: an estimated 85–100k. Together they would come to 165–195k, which does not fit, so the plan splits them.

**Decisions.** Jon answered W5's questions Q1–Q4 through AskUserQuestion in the eng-lead chat, at about 16:50 -07:00 on 2026-11-26, as relayed by the eng lead at 16:57 -07:00. He chose the recommended option each time. The option labels are verbatim; each rule follows the eng lead's relay.

- **D1, the bind list:** "All, mark in-use (Recommended)". "Bind input" lists every eligible input. An input already in use is marked, for example "(now Brightness)", and moves when picked. There is no "+ New input".
- **D2, the low end:** "Snap below 0.03 (Recommended)". A reading below 0.03 counts as exactly off for both Wrappers.
- **D3, input kinds:** "Analog only (Recommended)". A stored digital binding shows a warning on the input, and the Wrapper keeps its slider.
- **D4, the start value:** "Fallback, then smooth (Recommended)". The sample starts at the input's fallback and smooths toward the reading, as Brightness does. As a result, a fallback above zero briefly slows or smears each Pattern as it starts, and turns off Slow-mo's native clock until that Pattern restarts.

### 1278a delta against landed #1279 (W5b, 2026-11-26 18:10 -07:00)

Checked against local main `287b8a3b`. Landed names match the plan except as follows; landed code wins.

- **`controllerPushRecord.ts`, `controllerMetadataStorage.ts`: no edit.** Push records persist as one opaque JSON blob and `withPushRecord` deep-clones `wrapperOutcome`, so `wrapperOutcome.inputs` round-trips unchanged. G2 asserts it.
- **`controllerInputUses.ts`: deferred to 1278b.** `ControllerProfilePage.tsx` renders every use that is not `none` or `brightness` as a Pattern binding, so a new Wrapper use kind needs the page change, which 1278a excludes. The digital-input warning (D3) reaches the input card through the validation path `inputs.<id>.signal`, so 1278a needs no edit here.
- **One resolver.** `controllerProfile.ts` gains `wrapperInputsFor(profile, patternId?)`, which returns each enabled Wrapper's analog input after the one-to-one and opt-out rules. The recipe, both signatures and the delivery outcome all read it, so they cannot disagree.
- **Signature.** The key is `wrapperInputs` on the inner signature, in both the applied and the requested form. The reconciliation signature adds `wrapperInputs` and a per-binding `overridesWrappers`, each only when non-empty, so an unbound profile keeps #1279's bytes.
- **`slowMo.ts`.** Changes are limited to the two Control export strings and the head of the outer `beforeRender`. F1's Dreamy cold start (#1283) changes Dreamy's history, so the two are expected to conflict only textually.
