# Opt-in v2 ordinary Clip timing workspace

Authority: scene-retirement specification §§4–9/12, assigned ROUTE/FAILURE/SHARING/RESTART/CURVE/ACTIVATION/INSERT/GROUP-HOLD/LAYOUT-END proof subset. This workspace was additive under the retired `?show-v2-pilot=1` route; its Clip timing, Add Clip and Insert Time controls moved onto the gated `?show-v2-editor=1` editor route with #1056 slice 6 (removed by #1067 Stage 1), and production-v1 activation is unchanged. The approved layout, supported partitions and limits are recorded in [the frontend contract](../evidence/issue-1038-clip-timing-workspace/frontend-contract.md).

## Checked commands

`showV2PreparedEditAdmission.ts` adds four explicit public requests to the existing closed private dispatch: typed Create, ordinary Clip temporal move/trim/extend/split, Insert Time and set-show-end. Each delegates directly to its pure owner. It exposes that owner's exact refusal code and complete affected collections; no generic candidate or transform callback is accepted. Marker and Transition-resize APIs stay compatible. Insert and Show End validate exact narrowed ingress before their broad pure owners. Temporal intents retain explicit Reset projection requirements; the visible workspace supplies no guessed projection plan.

The current record, revision, provider, route lifetime and trusted dependency references identify the immutable prepared capture. Changed candidates prepare once with the same captured semantic assets and Stage dimension/map context. The final synchronous identity check precedes one existing store adoption/history/save. No-op/refusal does not prepare or write. The store retains optimistic settlement, rollback and durable save recovery. Local identity-only adoption receipts permit current saved completion across the operation's own recapture and suppress external replacement/provider/dependency/route/revision results.

Only typed Create admits validated empty→ready. Other changed commands preserve ready/empty capability; ordinary temporal commands require a persisted Clip. Existing refused captures never bypass preparation. Empty contains no placeholder runtime.

## Native presentation and identity

`showV2TimelineEditorModel.ts` projects existing Zones/named Layers in rank order. Ordinary persisted Clips are semantic selectable buttons; selected start commits move, local Bounds apply one Trim/Extend transaction, Split receives one caller-supplied fresh right ID. Insert Time and Show End call their global pure owners. Selection, cancellation and drafts create no history. NumberField milliseconds are passed unchanged; no rounding or min/max coercion makes invalid authored timing valid. Keyed bounds forms restore current authored timing on refusal/rollback and changed record/selection.

Effective held Group Clips appear as noninteractive occupancy labeled with their definition name. Projection uses the exact IDs defined by the materializer, never prefix matching, and never edits a transient child. Group definitions, holds, bindings, authoritative payloads and Restart policies stay pure-owner controlled.

Source choices use captured personal assets and the immutable stock catalogue. Shared runtime matches compare source kind/id. Duplicate display names are disambiguated by identity. A sole match is selected; several require explicit selection; no match requires first setup. The same current derived choice drives the select, Add eligibility and submitted intent: zero matches uses first setup, one uses its exact runtime ID, and several retain only a valid user-explicit choice. An automatically selected sole runtime never becomes an implicit selection among newly multiple matches. Successful first setup followed by reopening Add reuses that newly existing sole runtime; disappearing explicit IDs clear the choice. Runtime option values encode IDs separately from the First-runtime option, so an authored runtime named `first` stays an existing runtime. First setup uses trusted source identity/name, normal time scale/offset and empty authored control overrides; initial appearance is complete neutral, entry Continue and span sampling are explicit.

Caller IDs come from the existing `newPersonalContentId` adapter allocator. The planner reserves persisted/effective owner IDs and definition-qualified defaults, calls once per required identity and refuses conflicting/blank plans atomically. No pure transformation allocates randomness, silently clones a runtime or retries a collision.

## Proof and limits

The native30-second fixture includes nonlinear shared time-scale and a held Group Restart; the visible sequence grows Show End to40 seconds. Every action is observed through persisted record/write/history, Undo/Redo, provider reload and native `.pxlshow`/`.epe` reopen. Generated Fast and Precise transport is compared against independently authored final choreography; fine animation boundary values use the public evaluator. Precise runtime checks use125ms steps and do not claim arbitrary-ms state exactness.

The narrow [Worker Group admission prerequisite](show-v2-worker-group-admission.md) preserves structural and domain checks during derived-record recursion without runtime code generation; authenticated invalid input is classified400. It changes no transformation, schema or compiler semantics.

No Layer/Group CRUD/create, Replace/independence, appearance/Property authoring, pointer gestures, native solo/guides, compiler/schema/source-metadata expansion or production cutover is included. Current Property-carrier/preparation refusals remain atomic. Browser proof and qualification are in [the test-design packet](../evidence/issue-1038-clip-timing-workspace/test-design.json); final suites and review belong to the coordinator.
