# Wrappers specification

A Wrapper is built-in behaviour that a Controller profile applies to every
Pattern PXLBLZ saves on that Controller. PXLBLZ wraps the Pattern's code, and
the wrapped Pattern is what the Controller stores. This document specifies the
first four Wrappers, the Controller profile page that presents them, and the
preview controls that ship alongside.

Epic: [#1235](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1235).
Prototype: [`wrappers-ux-prototype.html`](wrappers-ux-prototype.html), accepted
by Jon on 2026-11-25. The violet tour bar in the prototype is scaffolding; the
page above it is the design. This document supersedes
[`device-wide-calm-control.md`](device-wide-calm-control.md) and the "Native
controls for Slow-mo and Dreamy" section of
[`controller-pattern-source-url-import.md`](controller-pattern-source-url-import.md)
for current design. As-built reference stays current until each slice lands.

Nothing after the hardware probe
([#1273](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1273)) may
start on a Controller path until Jon has said go on its report. Section 10 lists
which slices the probe gates.

## 1. The model

Three terms carry the design.

- **Wrapper**: one behaviour a Controller profile adds to Patterns. A Wrapper is
  on or off for the whole Controller.
- **Wrapped Pattern**: the code PXLBLZ saves on the Controller after applying
  the profile's Wrappers. The Pattern in the library is unchanged.
- **Wrapper Control**: a native Pixelblaze slider that a Wrapper adds. The
  Controller saves its value per Pattern, like any slider the Pattern's author
  wrote.

| Wrapper | Wrapper Control | Hardware input |
| --- | --- | --- |
| Slow-mo | one slider | optional |
| Dreamy | one slider | optional |
| Power limit | none | none |
| Brightness | none | required |

Slow-mo and Dreamy are separate Wrappers. Each works with no hardware input:
the slider on the Controller is the control. Binding a potentiometer is an
optional second step that replaces the slider with the knob. Brightness has no
software form, because the firmware already has a brightness slider; it exists
in a profile only while an input drives it.

Wrappers apply to Patterns. A Show saved on a Controller is excepted from
Slow-mo and Dreamy, and whether Shows ever take them is deferred. Power limit
and Brightness reach Shows today through the same delivery path and keep doing
so (section 8).

## 2. Decisions

Jon's words are recorded verbatim on the epic. This table is an index.

| # | Decision | Source |
| --- | --- | --- |
| 1 | The hardware probe runs first | [1 to 9](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1235#issuecomment-7168423161) |
| 2 | Slow-mo and Dreamy are two Wrappers | same |
| 3 | Software sliders first; input binding is a later step | same |
| 4 | The web preview never changes anything on a Controller | same |
| 6 | Brightness stays input-required | same |
| 7 | Wrapper Controls get their own group in the Controller panel | same |
| 8 | Existing per-Pattern input bindings keep working | same |
| 9 | Existing profiles switch to always-on rewrites | same |
| 10 | The name is Wrapper | [10 to 15](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1235#issuecomment-7168827117) |
| 12 | A wrapped Pattern at defaults runs within 10% of unwrapped | same |
| 17 | The prototype's page shape is accepted | [17 to 24](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1235#issuecomment-7169476459) |
| 18 | A reason for a skipped Wrapper uses progressive disclosure | same |
| 19 | Brightness is absent until an input is selected | same |
| 20 | A bound input covers every wrapped Pattern, with a per-Pattern opt-out | same |
| 21 | The preview restores each Pattern's last values | same |
| 22 | The preview sliders ship and `?slowmo=1` goes | same |
| 23 | A Pattern that cannot take a Wrapper is saved without it | same |
| 25 | Patterns only; Shows get their own treatment | [25, 26](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1235#issuecomment-7169813909) |
| 26 | The word is "skipped" | same |
| 27 | The Controller panel needs no note for a Pattern skipped for memory | [27 to 29](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1235#issuecomment-7169979485) |
| 30 | Both Wrapper Controls read as amounts, with the left end off | [30, 31](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1235#issuecomment-7171646073) |
| 31 | Power limit and Brightness still apply to Shows | same |

Decision 5 (Shows are not wrapped) was reopened by decision 24 and settled for
now by decisions 25 and 31.

## 3. What exists today

The design reuses more than it adds. These are the facts the slices start from.

- **The wrapper is preview-only.** `src/engine/slowMo.ts` emits one wrapper
  holding both behaviours. Nothing on a Controller send or save path calls it.
  It runs in the preview behind `?slowmo=1` (`src/dev/slowMoFlag.ts`).
- **One wrapper, nine buffers.** The wrapper always allocates nine
  `array(pixelCount)` buffers: two frame endpoints and one persistence buffer,
  each in three channels. Slow-mo alone needs the six endpoint buffers. Dreamy
  alone needs the three persistence buffers.
- **One exported slider.** The wrapper exports `slider__pxlblz_slowmo_speed`.
  Dreamy is a runtime global with no export. Speed position 1 is full speed and
  bypasses the blend above 0.97.
- **Refusals exist, with one gap.** `planSlowMo` declines a Pattern with no
  render function, a shadowed `time`, `rgb`, `hsv` or `hsv24`, a reserved
  identifier, or wrapper arrays over the VM's 10,240 words. It does not count
  the Pattern's own arrays, so a Pattern that fits alone and overflows when
  wrapped is not caught.
- **Profile transforms already wrap Patterns and Shows.**
  `controllerProfilePassRecipe` emits hardware brightness, then power cap, then
  per-Pattern bindings. `prepareControllerArtifactDelivery` applies that recipe
  to Patterns and to Shows.
- **Rewrites and progress already exist, behind a switch.** A profile with
  `keepPatternsUpToDate` rewrites managed saved artifacts when its
  reconciliation signature changes. The queue supersedes a pending run with a
  later one, and the saved-programs pane already draws a progress bar from the
  `pending`, `running`, `attention` and `not-responding` phases.
- **A per-Pattern binding already overrides brightness.**
  `patternBindingOverridesHardwareBrightness`: a Pattern that binds an input to
  one of its own Controls is excepted from the global use of that input.
- **Per-Pattern preview settings persist.** The Settings cascade stores sparse
  per-Pattern overrides on `PatternRecord.settings` and, for stock demos, in
  `demoOverrides`. Slow-mo and Dreamy are session state outside it.

## 4. Engine

The engine produces a wrapped Pattern from a Pattern, a pixel count and the set
of Wrappers to apply. It stays pure TypeScript and decides everything a caller
needs to know: the code, which Wrappers were applied, and why any was skipped.

**Two Wrappers from one emitter.** The emitter takes Slow-mo and Dreamy as
independent switches and allocates only the buffers the enabled set needs: six
for Slow-mo, three for Dreamy, nine for both. Active Dreamy uses the output of
Slow-mo when both Wrappers are applied.

**Wrapper Controls.** An applied Wrapper with a bound analog input samples
that input and omits its slider export unless the Pattern binds the same
input to one of its own Controls. Every other applied Wrapper keeps its
slider. Slow-mo uses `sliderSlowMo` (“Slow Mo”) and Dreamy uses `sliderDreamy`
(“Dreamy”), the two names verified in both Controller panels.
[#1273](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1273)

Both Wrapper Controls read as amounts (decision 30). The left end is off, and
moving right gives more Slow-mo or more Dreamy. Dreamy already works this way.
Slow-mo inverts today's `position`, where 1 is full speed: an amount `a` plays
at rate `2 ** (-4 * a)`, and the blend is bypassed near zero as it is near
full speed today. At the left end a Wrapper Control leaves the Pattern looking
as it does unwrapped, so a slider nobody has touched is off on every surface.

**Dreamy at zero.** Given the same Pattern state and Slow-mo inputs, both
Wrappers produce the same frames as Slow-mo alone while Dreamy is at zero,
including engagement, release and 0 ms frames. Dreamy bypasses its color
capture and history updates while off. Each activation clears its history and
seeds it from the first eligible active render, including at 0 ms. After
priming, 0 ms frames hold the active history.
[#1283](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1283)

**The skip decision.** The engine decides, per Pattern, which enabled Wrappers
can be applied. A structural refusal (no render function, a shadowed built-in,
a reserved identifier) skips both Slow-mo and Dreamy. Memory is decided in a
fixed order, Slow-mo then Dreamy, each against the words that remain, so a
Pattern with room for one keeps that one. The decision is a pure function of
the Pattern's source, the pixel count and the enabled set, and it returns a
reason for each skipped Wrapper.

A Pattern may already use a Wrapper's Control name. The engine skips that
Wrapper with `control-name-taken`, naming the existing Control in the reason.
The other Wrapper keeps its place in the memory decision. Power limit and
Brightness are unaffected by a skip. [#1276](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1276)

Memory accounting must include the Pattern's own arrays, which today's check
omits. The engine slice owns the method. The fail-closed rule is fixed here: a
Pattern whose own array use cannot be bounded is skipped for memory, never
wrapped on a guess.

**Order.** The Pattern's own code and its per-Pattern bindings run innermost.
Slow-mo and Dreamy capture that output. Brightness scales what they emit, so
turning the knob is not smeared by Dreamy. Power limit is outermost: it bounds
what the LEDs receive, whatever the Wrappers inside it do.

**Isolation.** A profile with no Wrappers and no inputs still produces plain
Pattern code, byte-identical to today's. Wrapper state never reaches the
library Pattern, an export, or a push to a Controller whose profile has the
Wrapper off.

## 5. Controller profile model

**Wrappers are profile transforms.** `globalTransforms` gains a Slow-mo and a
Dreamy member, each with `enabled` and an optional `inputId`. The column is
JSON, so the two new members need no migration. Power limit and Brightness keep
their present records.

**Signatures follow what was applied.** The artifact signature covers enabled
Wrappers and their input bindings, because both change the code. It is computed
after the skip decision. A Pattern saved without a skipped Wrapper is therefore
up to date, not permanently stale. A profile with neither Wrapper enabled
produces the same signature as today, so adopting this change rewrites nothing
on its own.

**Values are not code.** Moving a Wrapper Control changes a value on the
Controller and never schedules a rewrite. A rewrite must leave each saved value
as it found it. If #1273 shows the firmware drops values when a Pattern is
overwritten in place, the rewrite reads them first and writes them back.

**Rewrites are always on.** `keepPatternsUpToDate` is removed from the model,
the store, the Worker and the D1 schema. A change to the reconciliation
signature always schedules a run, and connecting a Controller with stale
managed artifacts starts one. Existing profiles that had the switch off start
rewriting stale artifacts on their next connect (decision 9).

The schema change has an order. The Worker names `keep_patterns_up_to_date` in
its queries, and a push to `main` deploys the Worker, so dropping the column
before the code that stops naming it is live breaks every profile read. The
code goes first and is published; the migration that drops the column follows
as its own candidate.

**One run.** A change made while a run is pending or running folds into that
run. There is never a second run for one Controller. A disconnect leaves the
remaining artifacts waiting, and reconnecting resumes from them.

## 6. Controller profile page

The page has three parts, in this order: Wrappers, Inputs, and what PXLBLZ has
saved on the Controller. The prototype is the reference for layout and wording.

**Wrappers.** One row per Wrapper with a switch. Slow-mo and Dreamy rows state
their source, "slider, set per Pattern" or the bound input, and offer "Bind
input". Power limit carries its percentage. Brightness has no switch and no
row until an input drives it.

**Inputs.** One entry per physical control. An input can drive one Wrapper for
every Pattern, and can also be used for one Pattern's own Control. Binding
works from either side: "Bind input" on a Wrapper, or "Use for a Wrapper" on an
input. Both write the same record.

**Saved by PXLBLZ.** One progress line covers two groups, Patterns and Shows.
There is no keep-up-to-date switch. The line reads "N of M up to date" at rest,
shows a bar with "Updating d of t" while a run is active, "restarted" when a
change folded into the run, and "n waiting for <Controller>" while offline. A
run can be paused and resumed. A pause lasts for the browser session and is
not stored in the profile.

Each row shows a tag for every Wrapper applied to it. A Wrapper that was
skipped for a Pattern shows as a greyed tag. Hover or keyboard focus reveals
the reason, for example "Skipped: not enough memory. Needs 2,340 array words,
512 free." The Wrapper's row carries a count, "1 skipped", that points at the
affected rows. No reason is visible at rest.

The Shows group carries one line while Slow-mo or Dreamy is on: "Shows keep
their own timing: no Slow-mo or Dreamy." It names only the Wrappers that are
on. Show rows carry tags for Power limit and Brightness and no greyed tags. A
greyed tag means one thing: a Pattern that was tried and skipped.

## 7. Controller panel

The panel lists a wrapped Pattern's Wrapper Controls in a "Wrappers" group,
above and apart from the Pattern's own Controls. A Pattern with its own "speed"
Control and a Slow-mo Wrapper Control shows both without confusion. A Wrapper
Control driven by an input shows the input's name in place of the slider.
The panel looks up the saved input ID in the current profile and uses the
name from the saved outcome if the profile no longer has that input.

The saved outcome for the active program determines which Wrapper Controls
appear. When that outcome is unavailable, the panel uses the reserved export
names the Controller reports. The Controller supplies each slider value.
A slider without a usable reported value shows a dash and can still be
moved. Moving it sends a live Control update and leaves the saved code alone.

The panel reads the active Control report from `getConfig()` and reseeds it
after an in-place rewrite reactivates the same saved program. On firmware
3.70, the active report omitted Dreamy after that Wrapper was turned off.
The saved program's `getControls(id)` still held its previous Dreamy value.
[Firmware 3.70 bench readback](http://Agent-Mini.local:8642/files/pxlblz-briefs/1274-always-on-rewrites/b2-bench-readback.json)

A skipped Wrapper has neither a row nor a note (decision 27). A memory skip
confirms the reserved name was free, so the panel hides a leftover value for
that export. A reported reserved name stays in the Pattern's own Controls
when the Wrapper was skipped for a name clash, refused before the name check,
or unevaluated in the saved outcome.

The group shows "Slow-mo and Dreamy are off for Shows." when a Show is selected
and both Wrappers are on. If only one is on, the line names that Wrapper.

The Saved Patterns picker shows only the Wrappers recorded as applied to
each saved program. Show rows carry their applied Power limit and Brightness
tags (decision 31).

## 8. Shows

A Show keeps its own timing. Slowing a Show stretches its whole timeline, and
Dreamy overlaps the Show's own Effect Trails, so wrapping Shows is a separate
design and is deferred. Delivery skips Slow-mo and Dreamy for any artifact
whose binding key marks it as a Show. Power limit and Brightness continue to
apply (decision 31), because Power limit protects the supply and both apply
today.

## 9. Preview

The preview's Slow-mo and Dreamy sliders ship to everyone, labelled as preview
only. The `?slowmo=1` flag and `src/dev/slowMoFlag.ts` are removed, along with
the flag's uses in the render scripts and Playwright configuration.

Both values join the Settings cascade as per-pattern fields. A user's change
writes a sparse override for that Pattern, and switching Patterns restores each
Pattern's last values. Both sliders read as amounts, as the Wrapper Controls
do, and the lab's "speed" slider becomes "Slow-mo". The stored Slow-mo field is
the amount. Defaults are no Slow-mo and no Dreamy, with both sliders at the
left end. A Pattern the wrapper declines runs unwrapped and shows the reason,
as it does today.

The preview never reads or writes a Controller, and a Controller profile's
Wrappers never change the preview.

## 10. Slices and order

| Slice | Issue | Starts when |
| --- | --- | --- |
| Hardware probe | #1273 | now |
| Always-on rewrites | #1274 | now |
| Preview sliders ship | #1275 | now |
| Engine: two Wrappers | #1276 | #1273 go |
| Profile model and delivery | #1279 | #1276 |
| Controller profile page | #1277 | #1274, #1279 |
| Controller panel group | #1280 | #1279 |
| Input bound to a Wrapper Control | #1278 | #1277, #1280 |

Each slice updates the reference docs it changes. `CONTEXT.md` gains Wrapper,
wrapped Pattern and Wrapper Control with the profile-model slice, and its
Controller profile and managed-artifact entries lose "opt-in" with the
always-on slice.

## 11. Open points

- **Never-set sliders (#1273).** Decision 30 relies on the firmware showing
  and applying the left end for a slider with no saved value. If the probe
  finds otherwise, the finding goes to Jon before the engine slice fixes its
  defaults.
- **Value survival (#1273).** Whether the rewrite must carry values across.
- **Over-budget behaviour (#1273).** What the Controller reports when a wrapped
  Pattern's arrays exceed the VM budget, and whether a save can detect it.
- **A live reading for a bound input.** The prototype animates a reading in the
  Controller panel. The build shows the input's name. A live reading needs an
  exported variable and is a follow-up.
- **Shows.** Whether Shows ever take Slow-mo or Dreamy is deferred.
