# Controller Wrapper delivery

The Controller profile owns the enabled set. The saved Pattern owns the
applied set. Reconciliation compares the applied set for the candidate with
the signature recorded for the saved program.

## Profile and delivery

Slow-mo and Dreamy are independent members of `ControllerProfile.globalTransforms`.
Each has an id, type and enabled flag, and may name an `inputId`. A missing
member reads as off. The profile store writes toggles through its serialized
profile update path.

The delivery engine uses the target Controller's reported pixel count and
the bundled Pattern source, including libraries and per-Pattern bindings.
The Wrapper pass runs after those bindings. Brightness and Power limit act
outside the Wrapper pass, in that order. Brightness acts immediately on
Dreamy's output. Power limit retains its frame-based response.

`emitPatternWrappers` reports the actual applied set and a structured reason
for each skipped Wrapper. Structural refusals skip both. A Control-name
clash skips the Wrapper whose export matches. The array budget includes
authored arrays and generated Wrapper buffers. It reserves words in
Slow-mo–then–Dreamy order and skips Wrappers when the source's array use
cannot be bounded. An enabled Pattern with no confirmed count waits for a
valid count before delivery.

An empty applied set keeps the legacy recipe order, source and artifact
signature. A Show binding bypasses Wrapper evaluation. Brightness and
Power limit continue through the Show's usual delivery path. The library
Pattern, its ordinary `.epe` export and its preview remain independent of
Controller profile settings.

## Input-driven Wrappers

An enabled Slow-mo or Dreamy may name an analog profile input
([#1278](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1278)).
`wrapperInputsFor(profile, patternId)` is the single resolver. The pass
recipe, both signatures and the saved outcome read it.

- **One to one.** Each input has at most one profile-wide use: enabled
  Brightness, Slow-mo or Dreamy. A disabled Wrapper names no input.
  Validation refuses a record that breaks either rule, or that names a
  missing input. The server refuses the whole write, and the store rolls
  back to the durable profile. `bindGlobalInputUse` and the store's
  `bindWrapperInput` keep the rule in one update. The input leaves its other
  use and the target Wrapper releases its previous input. A bound Wrapper
  turns on. Brightness turns off when its input moves. Turning a Wrapper
  off releases its input. Deleting a driving input leaves its Wrapper on
  with its slider.
- **Analog only.** A digital input on a Wrapper is a storable
  `configuration` issue on the input. The Wrapper keeps its slider.
- **Opt-out.** A Pattern that binds the same input to one of its own
  Controls keeps the Wrapper's slider, and its bytes match the unbound
  Wrapper's. `globalInputUsesOverriddenBy` generalises the Brightness rule,
  which is unchanged.
- **Emission.** A bound, applied Wrapper exports no slider. The sample
  runs inside the Wrapper pass, at the head of the outer `beforeRender`,
  before Slow-mo's rate and Dreamy's decay. It reads once per real frame,
  never once per slowed frame. It matches the hardware-brightness sample:
  it starts at the input's fallback, applies invert, then smooths. A
  smoothed value below 0.03 counts as exactly off, so a resting knob
  renders as an untouched slider. When Dreamy becomes active, either source
  of its value uses the same empty-history start. The skip decision ignores
  the binding. Preview emission is unchanged.
- **Evidence.** `wrapperOutcome.inputs` names each applied, input-driven
  Wrapper's input ID and its name at save time. The artifact signature
  gains `wrapperInputs` for those Wrappers: type, pin, signal, smoothing,
  fallback and invert. The input's ID and name are left out, because
  neither reaches the bytes. The reconciliation signature gains bound input
  IDs, sampling settings and each binding's overridden Wrappers. An equivalent
  sampler with a different input ID can refresh saved metadata without writing
  the program. All three keys appear only
  when nonempty, so an unbound profile keeps its earlier bytes and
  signatures.

## Reconciliation and saved evidence

The scheduling inputs include enabled Wrappers and, while enabled, the
confirmed profile pixel count. A profile update or connection uses the
existing single reconciliation run for that Controller. A count change that
changes fit can change the emitted program. A count change with the same
applied set and emitted source can settle without a device write.
Each confirmed panel poll can bring the matching Wrapper-enabled profile's
count up to date, including after enablement or profile loading. A stale
Wrapper preparation detected before the first device mutation stops its write
pass and requests fresh planning. The preceding Pattern source remains
available to detect edits the pass left unwritten. Once a device mutation
starts, an intervening source edit waits for Save confirmation, activation
when required, and receipt publication before replanning. An overlapping
foreground Save retains precedence over its job.
An obsolete plan can be replaced within the same automatic retry. A no-write
metadata update that loses its live plan leaves reconciliation pending.

The durable artifact signature records the applied Wrappers when the set is
nonempty. Skip reasons and slider values are absent from the signature. The
Run/Save dirty check compares requested inputs before preparing delivery. It
keeps its comparison separate from the durable signature.

A Pattern Save can record `wrapperOutcome` with its applied and skipped
sets and the confirmed program id. If Wrappers were enabled, the record also
carries the evaluated pixel count. The profile and Controller panel can use
the applied set as evidence that a native export belongs to a Wrapper. An
absent record signals unavailable evidence. A no-write reconciliation can
refresh the skip decision when the current receipt, slot and source identity
agree. This preserves the flash receipt's hash and timestamp.

Saved-program freshness can show PUSH AGAIN before the current Wrapper
decision is available when saved evidence establishes a disabled applied
Wrapper, a changed non-Wrapper signature or an edited source. With Wrappers
enabled, CURRENT requires a matching decision for the enabled set and count.

Wrapper Control values are firmware state. The IDE uses in-place Save with
the existing program id. Binding an input removes the Wrapper's export, and
unbinding restores it under the same name. Bench readings on firmware 3.70
confirmed stored value survival across inactive rewrites and removed and
restored exports.
The same export name recovers its previous value. The probe did not measure
power-cycle survival. [#1273](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1273)

## Live panel

The active program's confirmed outcome determines membership in the Wrappers
group. Without an outcome, the panel uses exact reserved exports from the live
report. A value for an export skipped for memory is treated as leftover state
because that skip follows a successful name check. Name conflicts, structural
refusals, and unevaluated exports keep the reported Control in the Pattern's own
group when an outcome is present.

The panel seeds Controls from `getConfig().activeProgram.controls`. An
in-place activation of the same saved program invalidates that Controller's
old seed, including when its panel is closed or another Controller is selected.
When another Controller is selected, activation leaves the refresh for the next
visit. Recovery after an uncertain write refreshes the seed from live config.
If the recovery config request times out, the last known Controls remain visible
until the next successful config read replaces them.
On firmware 3.70, removing Dreamy omitted its export from the active report
while `getControls(programId)` still held the stored value `0.5`.
[Firmware 3.70 bench readback](http://Agent-Mini.local:8642/files/pxlblz-briefs/1274-always-on-rewrites/b2-bench-readback.json)

The panel displays an indeterminate slider until it has a usable position.
Moving a slider sends a volatile Control write and leaves the rewrite queue
untouched. The saved Show binding identifies Shows and the panel names only
the profile's enabled Slow-mo and Dreamy Wrappers in its Show message.
