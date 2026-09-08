# Show command semantics

The Show command registry defines edits for callers of `applyShowCommand` and
`runShowCommandTransaction`. A command returns a candidate Show or a typed
refusal; the caller owns adoption, history, and persistence. This agreement
covers the registry, not every direct engine mutation or editor gesture.

## Agreement

- Commands preserve their input record on acceptance and refusal. Callers use
  the returned record rather than expecting an in-place edit.
- Registry names and each descriptor's fields define the invocation interface.
  Unknown commands and missing, mistyped, or unknown arguments produce typed
  issues. Domain refusal carries a reason; optional remedies and candidates
  help the caller recover. Descriptor schemas own invocation shape; the
  [generated coverage report](../show-command-coverage.md) owns the inventory.
- An unchanged engine identity result alone is a typed refusal, not success.
  `resize_clip` separately validates an already-satisfied request and returns
  the original record with zero changes and no timestamp. Some
  commands also explicitly refuse no change, such as renaming to the current
  name. Such a step aborts its containing batch; replay is not guaranteed to
  succeed merely because the desired state already exists.
- Clip, marker, and transition ids identify existing targets. Moving or resizing a Clip retains its
  identity; creation and removal follow their command's semantics. Names,
  selection, and timeline positions do not replace those ids. Overlay layers
  are addressed by index; each descriptor defines the target convention.
- A transaction evaluates commands in order against successive candidate
  records. The first refusal returns its zero-based step and issues, without
  returning a partially accepted record. Earlier successful steps do not
  mutate the caller's original record.
- A successful transaction returns one candidate and its accumulated changes.
  Persisting that candidate once is the caller's responsibility and is what
  gives the batch one editor history entry. Evaluation itself writes no store
  or durable state. An empty transaction returns the original record.

## Limits callers must preserve

The registry validates invocation shape and delegates domain acceptance to the
command. It does not establish a universal final-document validation pass or
hardware delivery readiness. Each command still applies its own preconditions
inside a transaction; a batch cannot assume every temporarily invalid
intermediate state is permitted.

The descriptor's `touches` paths describe possible writes. They are not a read
set or a proof that two commands commute. This interface supplies no document
revision comparison, concurrent merge, cancellation, or persistence guarantee.
See [Show state, history, and persistence](show-state-history-persistence.md)
for adoption and save behavior.

## Ownership and evidence

[Registry types and evaluation](../../../src/engine/showCommands/registry.ts)
own this interface; the imported command families own operation semantics.
[Registry tests](../../../src/engine/showCommands/registry.test.ts) exercise
input validation, representative immutable edits and refusals, ordered batches,
and failure without partial mutation.
[Command tests](../../../src/engine/showCommands/commands.test.ts) exercise
individual outcomes, including retained Clip target ids for move and resize.
These are executable examples, not exhaustive proof over every possible Show.

## Internal exact Clip resize

`resizeShowClipExactly` accepts a resolved logical Clip id and safe integer global
milliseconds: exactly one duration or end time, with an optional start time.
It returns a changed composition, a valid already-satisfied no-op, or a typed
refusal. All outcomes preserve the supplied Show and composition. A no-op
requires a valid composition and supported target before checking the requested
range; an unchanged low-level engine result is never sufficient evidence.

The operation selects ordinary or Layer-Transition-connected resize centrally.
Accepted results retain the named Clip's exact requested range and logical id,
including supported spans across Scenes. Connected successors move as required
by the existing authoring engine; unrelated Clips remain fixed. The result
reports changed and moved logical Clip ids. Fixed-start requests beyond the
same-Layer neighbor or Show-end capacity refuse with that range, accounting for
the downstream chain. Other engine constraints can also refuse an arrangement.

Transitions retain their identities and visual settings. Explicit leading-edge
resize that keeps the Clip's end fixed may adjust incoming Transition duration;
the result reports its previous and new duration. Segment endpoint references
follow the logical Clip when Scene coverage changes. Group-owned Clips,
Transition removal, and edits that would remove a visual Scene-boundary
Transition refuse. Existing manual authoring paths retain their own behavior.

The registry `resize_clip` descriptor owns `clip_id`, exactly one safe-integer
`duration_ms`/`end_ms`, and optional safe-integer `start_ms`. The diagnostic
adapter derives its argument leaves from this definition and delegates raw
validation and evaluation to the registry. Both return exact/no-op/refused
outcomes; capacity refusals carry `availableRange`. Changed results include the
actual target range, changed/moved logical Clip ids and Transition duration
adjustments. No duplicate overlap or time-conversion policy lives in either
adapter. The diagnostic `resize_connected_clip` spelling is historical
compatibility through the same owner, not a production alias.

Boundary comparison normalizes both the original and planned Show through the
same existing Transition normalizer, so materializing an implicit Cut does not
falsely count as visual Transition removal. The returned Show retains every
original authored Transition, including explicit Cut identity and easing.

The operation requires a valid input composition. Registry transactions and
private grammar sessions accept no-op before/after a changed step. Wholly no-op
private work creates no history entry or candidate. The existing valid-intermediate
move-B then resize-A sequence is qualified; arbitrary temporarily overlapping
intermediates and swaps are not. Manual gesture/inspector convergence and paired
mouse/agent proof remain pending. Broad diagnostic requests retain whole-Show
admission rather than the internal qualified Layer guard.

[Adapter/session/artifact and route evidence](../evidence/issue-950-resize/README.md)
records the bounded qualifications and residuals.

[Exact resize owner](../../../src/engine/showExactClipResize.ts) delegates to the
existing timeline and Layer Transition engines.
[Exact resize tests](../../../src/engine/showExactClipResize.test.ts) qualify
complete compositions, projected ranges, retained identities, connected timing,
immutable refusals, Main/overlay bounds, logical Scene spans and supported no-op
classification. These pure cases supply no adoption or browser evidence.
