# Controller Wrapper delivery

The Controller profile owns the enabled set. The saved Pattern owns the
applied set. Reconciliation compares the applied set for the candidate with
the signature recorded for the saved program.

## Profile and delivery

Slow-mo and Dreamy are independent members of `ControllerProfile.globalTransforms`.
Each has an id, type and enabled flag. A missing member reads as off. The
profile store writes toggles through its serialized profile update path.

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

## Reconciliation and saved evidence

The scheduling inputs include enabled Wrappers and, while enabled, the
confirmed profile pixel count. A profile update or connection uses the
existing single reconciliation run for that Controller. A count change that
changes fit can change the emitted program. A count change with the same
applied set and emitted source can settle without a device write.

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

Wrapper Control values are firmware state. The IDE uses in-place Save with
the existing program id. Bench readings on firmware 3.70 confirmed stored
value survival across inactive rewrites and removed and restored exports.
The same export name recovers its previous value. The probe did not measure
power-cycle survival. [#1273](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1273)
