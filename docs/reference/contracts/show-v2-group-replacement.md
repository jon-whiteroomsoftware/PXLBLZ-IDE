# Definition-local Group Clip Pattern replacement

`replaceShowGroupDefinitionClipPatternV2(record, intent)` changes one named local
Clip's Pattern across every linked occurrence of its definition. Make Group Unique
first when the edit should select one occurrence. The pure owner never parses
source, guesses exports, opens confirmation, allocates IDs or adopts a record.
Incoming reference, name and exported slider descriptors are trusted resolved
metadata using `ResolvedShowPatternReplacementV2` from the Clip owner.

## Explicit plans and authority

The intent explicitly selects `definitionId`, `clipId`, replacement metadata and
either `linked-occurrences` or `dormant-definition`. The context must match the
actual occurrence count. A slot plan is exactly `retain` or a supplied fresh
`split` slot ID; unnecessary or missing splits refuse.

Linked replacement receives `runtimePlansBySourceRuntimeId`, exactly one plan for
each distinct selected source resolved by `groupRuntimeBindings`. Top-level
payloads remain authoritative. One effective Clip use requires `retain`; more
than one requires `independent` with a supplied fresh runtime and exact fresh
track/key identities over retained **effective** animation. One destination is
shared by all selected uses of that source, including repetitions where every old
use was selected. Different old sources never coalesce. Counts include ordinary,
invisible and materialized Group Clips.

The owner materializes once and delegates copies to the landed instance-track
helper on that resolved global-time projection. Copies become authored top-level
tracks; compatible values, activation, keys, easing/retained curves and all
time-scale animation survive at delta zero. Original forked source payloads and
owners stay exact. Definition authority needed by retained sources is hoisted
under its same stable ID; hoisting is not runtime allocation.

A split is required when another local Clip uses the slot, or when a fork must
preserve its original Group instance-track ownership. Only the selected local
Clip retargets. Linked occurrence bindings point the new slot to each planned
destination; old slots/binding values/tracks remain. Sole sources can prune
incompatible authored controls and safely owned local animation. An incompatible
mixed retain/fork or foreign Group track which cannot be pruned without changing
unrelated users refuses atomically with a control/track/runtime/owner explanation.
There is no Group mutation, implicit fork or animation disabling escape.

## Dormant definition

With zero occurrences the owner edits local templates and local instance tracks
only. A shared slot needs an explicit fresh local slot, plus exact fresh IDs for
every retained local instance-control/time-scale track and key. The original
template/tracks and other local Clips remain exact; incompatible controls are
omitted from the copy. Clip appearance/tracks and Transitions do not move.

Even a selected-only dormant slot must split if its derived default runtime ID
already has top-level authority. That payload remains exact, and the supplied
slot and derived default ID must both be globally fresh. Later default-bound
occurrences then read the new local template. No composition instance is created,
changed, removed or hoisted in dormant replacement.

## Result and validation

The owner returns `ShowGroupReplacementResultV2`, retaining the existing Group
affected vocabulary without changing any existing result union. Changed records
are complete and unaliased. Affected collections identify the local definition,
Clip/slot, changed bindings, modified/copied/hoisted runtimes and copied/removed
track/key owners; discarded controls are explicit targets. Static template losses
without an effective-runtime counterpart retain their local slot target.
Refusal/no-op return the original record identity and empty affected collections.
Track removal is owner-scoped: top-level and definition-local track/key IDs may
have equal strings, and removing one never selects the other scope. Separate
removal sets govern the top-level and selected-definition arrays. Flat affected
IDs retain their existing raw-ID vocabulary; the affected Group definition and
source/result owner collections identify their scope, including repeated nested
key strings. Unrelated definitions and same-ID compatible animation remain exact.
Same-reference/name all-compatible requests still validate supplied identity plans
before becoming no-ops. A source change or fresh runtime selects the explicit
continuous execution policy.

Complete preimage/result validation, Layout availability and materialized
RL08–RL10 Transition placement remain enforced. Pattern payloads, clocks and
evaluation policy are copied from authoritative sources rather than stale local
templates. Local Clip timing/sampling/appearance/entry policy, definition and
Transition IDs/settings, holds, Layers and unrelated definitions remain exact.
Retained unconsumed animation is preserved according to the separate
[compile-preparation contract](show-v2-compile-preparation.md).

## Evidence and limits

[Group replacement tests](../../../src/engine/showGroupReplacementV2.test.ts)
reopen `.pxlshow` and delivered `.epe`, replay Fast/Fidelity controls, clocks and
frames, and prove other ordinary/local/linked users retain their source and
compiled Pattern member. Generated private names alone use an explicit bijection
which preserves references/constants/control flow/order and owner attribution;
authored names/values/operations are not normalized. Exact old-user output/state
and complete source payload/track equality accompany that comparison.

The fixtures cover per-source sharing classes, sole/default authority, dormant
hoisted authority and later resolution, complete invalid identity plans, exact
half-open repeated animation, held nonlinear curves, Restart, attached Crossfade,
Make Group Unique before Replace and admitted mixed/foreign-owner refusals.
Scoped-ID regressions prove unrelated ordinary nonlinear animation through both
delivered replay modes, inverse top-level/local pruning, identical owner-scoped
key IDs and dormant-definition preservation.
Precise Score boundaries can cross before a nominal millisecond; comparisons
isolate actual contributors and explicitly compare unchanged ordinary output
after Score wrap. No tolerance or source-eligibility bypass accepts a candidate.
Group deletion and compiler expansion remain separate owners. Editor adoption,
its explicit target context and the required animation-loss confirmation are the
[adoption contract](show-v2-group-replacement-adoption.md).

Two further specification edges are now pinned by tests rather than only by the
rules above. A linked `split` that no other local Clip and no original Group
instance track requires is refused, so the slot splits only where the rules
demand it. A linked fork leaves an ordinary sharing user's Clips, its attached
Transition identity and settings, its instance payload and its delivered
compiled Pattern member exact, with identical Fast output and exported state.
