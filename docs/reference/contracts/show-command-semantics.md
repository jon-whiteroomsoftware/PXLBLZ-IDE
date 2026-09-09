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
Transition refuse. The manual exceptions below do not broaden the agent operation.

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
intermediates and swaps are not. Broad diagnostic requests retain whole-Show
admission rather than the internal qualified Layer guard.

### Manual resize commits

Ordinary pointer and composition-inspector duration commits use
`resizeShowClipManually`, which delegates to the exact owner. Start-only inspector
edits remain connected move operations; other inspector properties and Group
isolation retain their existing owners. The inspector refuses excess duration.
Pointer feedback may bound a fixed-start end resize to the exact owner's reported
capacity; release submits that painted integer extent again, never the preview
composition. A 12000 ms pointer request can paint and commit 8000 ms while the
same 12000 ms exact inspector/agent request refuses.

Only two source-qualified manual Transition exceptions use legacy Show
canonicalization: a fixed-end leading-edge edit reducing an incoming Layer Transition
to zero, and a resize breaking a visual Scene-boundary junction into a Cut.
The exact owner tags these specific refusals; invalid sources, unknown targets,
Group ownership, other topology failures and capacity refusals do not trigger
that path. Group children remain editable through their separate isolation
inspector. Boundary-to-Cut edits collapse boundary time and therefore remain
outside exact global-range equivalence with agent requests.

A malformed historical cross-Scene Layer Transition is rejected by the real
Show-file importer, with a repaired-record positive control. Its legacy engine
repair remains a diagnostic, not an accepted source for the shared operation.
A separate valid-source multi-Scene fixture proves endpoint retargeting and
complete manual/canonical record parity.

Pointer release conservatively refuses if the captured Show, composition or
current saved/draft identity changed. It does not replay independent metadata
edits. Accepted changes retain the editor's Pattern-slot persistence wrapper and
ordinary store history/save recovery; no-op, refusal and cancellation save nothing.
This semantic convergence does not migrate manual callbacks to agent admission
or qualify Layer-independent model context, arbitrary private batches or live
active-input waiting. [Manual proof](../evidence/issue-950-resize/manual.md)
records the finite consumer cases.

[Adapter/session/artifact and route evidence](../evidence/issue-950-resize/README.md)
records the bounded qualifications and residuals.

[Exact resize owner](../../../src/engine/showExactClipResize.ts) delegates to the
existing timeline and Layer Transition engines.
[Exact resize tests](../../../src/engine/showExactClipResize.test.ts) qualify
complete compositions, projected ranges, retained identities, connected timing,
immutable refusals, Main/overlay bounds, logical Scene spans and supported no-op
classification. These pure cases supply no adoption or browser evidence.

### Diagnostic move-then-resize qualification

The finite move-B-then-resize-A batch uses the private grammar transaction and
conservative whole-Show editor admission. The exact resize owner receives a valid
intermediate record after the move; its valid-input precondition is unchanged.
No partial candidate escapes a declared refusal, incomplete completion or failed
final validation. A refused operation may still be repaired within the existing
private transaction; refusal is not a permanent taint on later corrected work.
The [candidate contract](agent-candidate-application.md#bounded-mixed-batches)
and [consumer evidence](../evidence/issue-950-resize/mixed-batch.md) bound this
qualification. Other grammar commands and arbitrary temporary invalidity remain
outside it.
