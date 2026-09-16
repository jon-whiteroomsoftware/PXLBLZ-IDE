# Show v2 timeline edits

Canonical authority is [the Scene-retirement specification](../../plans/scene-retirement-specification.md)
§§7–9 and proof row `INSERT`. This additive pure owner is independent of the
production v1 timeline and persistence path.

## Insert Time

`insertShowTimeV2(record, { atMs, durationMs })` accepts safe integer milliseconds,
`0 <= atMs <= showEndMs`, and positive duration. The complete preimage must pass
v2 domain and Layout-availability validation. Show End grows once; shifted dormant
Markers receive their own checked addition.

A half-open interval ending at insertion stays left. An interval starting there
shifts right. A strictly crossing interval grows by the inserted duration.
Ordinary crossing Clips receive a fresh held appearance key at insertion; authored
keys at or after insertion shift, with the authored exact-boundary identity retained
on the right. Appearance uses the original right-boundary value throughout the
inserted interval. IDs are deterministic and collision-safe within the Clip.

The [Property time kernel](../../../src/engine/showPropertyTrackTimeMappingV2.ts)
maps the complete top-level track array once. Shared instance tracks never map per
Clip. Strict crossing activation gains held/resume keys, including constant regions
before the first or after the last authored key. Nonlinear restriction retains the
original curve base, delta, easing, duration and elapsed offset; easing is never
rescaled to a new endpoint interval.

Crossing Group occurrences gain a definition-local hold. Insertion within an
existing hold, at its left boundary, or at its right resume boundary extends that
same persisted hold ID. Later occurrences shift. Definition payloads, runtime
bindings, Layer destinations, translation and Restart policy remain exact. Explicit
`trackActivation` maps independently as a global interval, including pre-roll and
outgoing coverage outside the nominal occurrence. Local tracks remain unchanged;
the existing materializer projects their held time.

Layout coverage remains exact. The first occurrence stays at zero. Insertion at a
noninitial switch extends its predecessor and shifts the destination; insertion at
Show End extends the final occurrence. Incoming transfer settings and duration stay
unchanged. Strict interior insertion in a positive visual Transition or incoming
Layout transfer refuses. A visual endpoint is mapped and then validated with its
unchanged-duration window; current attachment rules refuse both endpoints. A hold
strictly before the complete window shifts it intact. Layout transfer endpoints
remain conditional on complete mapped validation.

Markers at or after insertion shift, even when dormant beyond Show End. Pattern
values evolve normally through the inserted duration. This operation creates no
runtime, reset event, implicit Freeze or compiler feature.

## Compilation adapter

The existing global-section preparation route intersects numeric tracks with each
represented section's contribution interval. It uses the same exact Property
restriction kernel, remaps Clip targets to their transient placements, and mints
collision-safe transient track/key identities. Authored persisted tracks remain
unchanged. Instance activation begins at the section start, excluding incoming
pre-roll from a second activation. A partial contribution that cannot retain its
activation still refuses; RL08–10, source eligibility and Restart limits remain
unchanged. The participant route coalesces exactly structurally equal complete
appearance values only for animated targets that previously refused multi-key
projection. Persisted keys remain exact; actual field or floating differences
remain honest unsupported divergence. Previously admitted exact single-section tracks retain their original
identities and endpoint representation, preserving generated source bytes.

## Atomic result and proof

Changed results contain an unaliased complete validated record and all §9 affected
collections. Refusal returns the exact input identity and empty collections.
`updatedAt` remains unchanged; adoption owns history/save clocks. Nested affected
key arrays contain one raw persisted ID per affected owner key and preserve repeated
strings; Clip/track collections identify the owners. Materialized Group keys are
reported through their persisted occurrence, not as newly authored top-level keys.
Definitions, Layers, instance payloads, removed IDs and discarded control targets
are unaffected.

[Timeline tests](../../../src/engine/showTimelineV2.test.ts) reopen persisted v2 and
`.epe` artifacts and execute Fast/Precise output with trusted Libraries. Manually
authored mapped records prove routing, shared state advancement, holds and Restart;
independent arithmetic proves nonlinear and exact discontinuous output. Fine
`p-1`, `p`, `p+d-1`, `p+d` evaluator/identity checks remain. Precise arithmetic probes
use binary-exact 125ms replay steps: existing 1ms Q16 delta accumulation drifts and
is not an arbitrary-millisecond exact-state guarantee. Numeric output differs from
the real-valued oracle by less than four Q16 units, and displayed 8-bit output is
exact at the selected probes. Matched runtime comparisons retain exact exported
state. [Test design and named faults](../evidence/issue-1038-insert-time/test-design.json)
record the domain, sequences and qualification.

This slice owns Insert Time only. Marker CRUD, Set Show End wrappers, command
registration and production UI/store adoption remain separate owners.
