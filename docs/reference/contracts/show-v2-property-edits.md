# Additive v2 persisted Property edits

`editShowPropertyV2(record, owner, intent)` is the native pure Property CRUD owner.
The [canonical specification](../../plans/scene-retirement-specification.md) §§4/6/9 governs.
Explicit `owner` selects the persisted Show or one Group definition. Materialized
child/track IDs are validation inputs and never writable aliases. A definition
edit affects every linked occurrence; isolation uses the existing Make Unique owner.

## Closed intents and admission

The six operations are `add-track`, `update-track`, `remove-track`, `add-key`,
`update-key` and `remove-key`. Add-track supplies complete caller identity, target,
activation and keys, including complete structurally valid retained descriptors.
Track update permits only explicit target and activation fields. Activation changes
never crop, shift, sample or discard keys; excluded keys make the complete result
invalid. All nine existing target forms remain available in Show scope; definition
scope admits the existing local Clip/instance forms. Global targets stay global.

Key add supplies an ordinary complete key. Key update permits only time/value/easing;
identity and descriptor patches refuse. Track IDs are persisted-owner scoped, key
IDs track scoped. Fresh caller IDs must satisfy the current complete record's
identity/conflict validation; existing same-string IDs in other owners are valid.
Malformed operations, missing owners/references, duplicate identities and invalid
structure/time/target/descriptor/effective shared ownership refuse atomically.
Add-key times and explicitly supplied update-key times are checked as numeric,
nonnegative safe-integer milliseconds before sorting or reauthor arithmetic.
BigInt, coercible strings and other malformed times are typed `invalid-intent`
refusals with the original record and every affected collection empty. Ordinary
complete-record activation/time admission still applies after that ingress check.
No owner invents controls, source metadata, runtime payloads or GC.

Preimage and complete candidate pass structural/domain and Layout availability
checks, including Group materialization and effective instance-track conflicts.
Source-dependent final preparation stays at the existing trusted admission boundary;
structural CRUD success is not a claim of source/compile eligibility. Missing
export/control baselines and existing unsupported source/domain shapes remain typed
preparation refusals. The edit-local repeat restriction policy is not applied to
ordinary complete curve authoring, activation-only setters or unaffected data.

## Exact reauthoring and results

The immutable `reauthorShowPropertyKeyframeInTrackV2` helper is shared with the
existing record-level key wrapper, whose behavior remains unchanged. Explicit
key edits replace the edited outgoing descriptor. Endpoint changes also reauthor
the old and new preceding segments; easing-only changes preserve the preceding
kernel. Key insertion reauthors its preceding segment, and deletion reauthors the
remaining predecessor. Unrelated descriptors/IDs stay exact. No sampled fit or
hidden history is retained. An explicitly equal scalar may therefore change data
by clearing a descriptor; no-op is decided from complete final authored data,
independent of object-field order.

Changed results own a completely unaliased record and preserve timestamps, runtime
payloads, appearance, holds and other owners. No-op/refusal returns exact input
identity and empty affected collections. Refusals expose typed code/message.
The existing §9 collections include the persisted changed track ID and changed/
removed raw Property key IDs. Removed IDs report removed track/key identities.
Clip, effective instance, Layer and Layout target collections identify targeted
owners/consumers; Group-definition and linked occurrence collections state the
requested definition scope. Nested key strings remain owner-scoped and are not
claimed globally unique. This owner neither writes history nor adopts/saves.

## Evidence and inherited boundary

[The packet](../evidence/issue-1038-property-edits/test-design.json) covers public
CRUD sequences, strict malformed/no-op/refusal/unaliasing, target/reference/activation
and effective Group conflict partitions. All nine target forms are reopened through
native EPE and compared in Fast/Precise modes with independent authored choreography;
fine evaluator boundaries and independent quadratic formulas complement125ms replay.
Linked held Group reauthoring preserves authoritative shared runtime payloads.
Seven named semantic faults are killed with exact source restoration.

An inherited exact-interior-key descriptor/Group-hold defect is separately preserved
in [the reproduction](../evidence/issue-1038-property-edits/inherited-hold-counterexample.json).
A stored key value differing from its outgoing descriptor's source-start value passes
existing admission; current evaluator/emitter choose the descriptor at that exact
interior boundary and the hold mapper changes the preceding ordinary interval and
interpolates through the supposed hold. Canonical right-key boundary ownership is
unchanged. This CRUD slice neither narrows descriptor admission nor repairs shared
evaluator/emitter/hold projection; coordinator-directed correction follows separately.
No UI, store/history adapter, schema/compiler/domain expansion or production cutover
is included.
