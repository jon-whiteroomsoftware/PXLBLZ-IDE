# Connect the existing Show editor to v2

Jon accepted recommendation B on 2026-09-17 for the bounded #1065 tracer.
This document does not authorize #1066, #1067, publication or deployment.
The current base is `4cbfb23f5bed833bb5d826147999504f452ea257`. There is no route
gate and none is wanted: Jon decided on 2026-09-18 that a v2-stored Show opens in
the existing editor on main, ungated, as each slice lands, and the rejected
`ShowEditorV2Route` is no longer mounted. Nothing may be pushed without Jon's
explicit word for that push. The governing specification is
[Scene retirement](scene-retirement-specification.md), last changed at
`51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`. Jon selected Opus 5 Extra High
(`claude-opus-5` / `xhigh`) for code reviews throughout this migration.

## Recommendation

Choose **B: migrate the existing editor in place by adapting its data and operation
callbacks**, while retaining their markup, styling, controls, focus behavior and
layout. The tracer must connect reads for every oracle-visible surface and corpus
record before it qualifies; only Clip drag becomes writable in that slice. Later
write callbacks can migrate surface by surface. Both stored versions should enter
the current `ShowEditor` and `ShowWorkspace` through the existing route seam in
`App.tsx`, preserving one component tree. The rejected v2 UI is discarded as a code source, design
reference and source of guidance, by Jon's explicit direction. Do not port its
route orchestration, hooks, forms or adapters into the existing editor. The v1
editor alone defines the UX. Design its backend connections from the new engine's
documented command and state contracts. Existing engine owners are the backend
being connected; the rejected UI implementation is not a shortcut to that work.
The rejected v2 route appeared in the oracle only as the failing comparison
target. It is unmounted since #1065, so both stored versions now reach the same
editor and the oracle compares that editor against itself.

The strongest argument for A is compelling: less code changed inside the large
editor should mean less opportunity for visible regressions. But A's apparent
simplicity depends on two assumptions the source does not support: a total
v2-to-v1 display projection already exists, and editor writes all preserve their
intent until they reach the store. Neither is true. Correcting both assumptions
would require a substantial compatibility model alongside the operation adapters.

## Why the proposed below-editor seam is larger than it appears

[ShowEditor](../../src/components/ShowEditor.tsx) has 10,878 lines. Its store
selectors are only part of the editing boundary. The component calls pure legacy
owners itself, then passes their resulting whole `ShowRecord` through `updateShow`.
Clip inspection, property key changes, Group edits and physical Zone selection
all use this path. The wrapper also restores transient lesson Pattern selections
before persistence. Replacing the store's named mutators does not intercept these
operations while they still carry their intent.

For example, an inspector patch is applied by `updateShowClipInspector` before
`updateShow` sees it. A v2 adapter receiving only the resulting legacy snapshot
would have to recover the selected authored Clip, the changed fields and the
appropriate appearance scope. A whole-record diff is not an owner intent. It
cannot serve as the general write contract without introducing another authoring
engine. The connection should capture each operation at its existing callback and
submit it to the already-landed v2 planner and admission.

The compiler's [legacy-shaped lowering](../../src/engine/showCompositionLoweringV2.ts)
is also not a total editor model. Its public legacy-record entry refuses Restart,
Layout split-position animation and some Repeat-scale animation because those
features need the complete prepared recipe. Other records encounter the bounded
compiler restrictions. Compiler sections, materialized Group uses and derived
placement identities describe emitted execution; they are not stable authoring
identities for selection and editing. A display model must remain usable when
preparation refuses, and its identity must survive edits, Undo and reload.

Derive display inputs from authored v2 engine data, against the existing v1
component contracts, without routing through compiler output. The existing v1
[timeline view model](../../src/engine/showTimelineViewModel.ts) is a presentation
contract to preserve. Existing leaf rendering and control composition can survive,
but their controller contracts need inspection. In particular,
`ShowClipEntityDetail`'s current value/patch boundary cannot express v2 appearance
ownership, selected-time key identity and dirty fields; its operation boundary
needs adaptation. B does not require every leaf to understand the stored version.

## Costs and risks

| Concern | A: legacy-shaped model below the editor | B: existing components over explicit data and operations |
| --- | --- | --- |
| Visible markup | Initially little change; equivalence still needs proof | Preserve existing markup and CSS while changing inputs/callbacks; every slice needs proof |
| Read path | Build a total legacy-shaped model, including stable synthetic identities and global/local time mappings | Derive display data from authored v2 records and add bounded adapters at existing v1 surface contracts |
| Write path | Adapt named store mutators **and** embedded whole-record callbacks; generic snapshot translation is insufficient | Replace each legacy owner call at its intent boundary with the corresponding v2 planner/admission |
| Difficult content | Reconstruct Group, animation and Transition ownership through the compatibility model | Preserve authored v2 identities and use the documented engine owner vocabulary directly |
| Preview and export | Must bypass the display projection and consume authoritative v2 preparation | Preserve the v1 Stage presentation; connect authoritative prepared engine output under its documented contract |
| Main risk | A projection that renders common cases but fails on valid native v2 records, or silently misaddresses edits | Accidental layout, selection, keyboard or transient-state changes while refactoring the large container |
| Later retirement | Compatibility ownership and identity mapping remain to remove | Legacy branches can retire after cutover, without a second UI implementation |

Both choices must touch routing, editor record selection, history, save settlement,
agent binding and the remaining surface callbacks. B is more explicit about that
work. Its cost is controlled by preserving the presentation and reviewing one
surface at a time, rather than combining the connection with structural cleanup.
This is not a trivial prop swap: `ShowTimelineWorkspace` still takes a legacy
record/composition and recomputes legacy projections for its grid, gestures and
property lanes. Keep the version distinction in the container backing and bounded
per-surface adapters; do not spread a `ShowRecord | ShowRecordV2` union through
every leaf. Preserve the v1 branch while each v2 connection is proved.
No elapsed-time estimate is justified before the tracer qualifies these seams.

## Accepted tracer boundaries

The tracer should connect the existing route/workspace to authoritative v2 data,
render every named oracle surface for the complete requested corpus, and implement one
ordinary pointer Clip move. The gesture retains its existing hit targets,
quantization, snapping and visual feedback. Translate the settled ordinary v1
move into the documented `ShowClipTemporalIntentV2`, then let the closed
prepared-edit admission own adoption. Do not reuse the rejected
`showTimelineGesturesV2` helper. One accepted move must create one history entry
and one save, survive reload, and compare equal through the converter. Undo
restores the exact preimage through the same history owner.

The tracer must stop for diagnosis if it needs any of the following:

- a new panel, a second renderer for an existing surface, or changed markup/style
  to accommodate the backend;
- compiling or persisting a display projection instead of the v2 record;
- guessing an authored identity or user intent from compiler-generated sections
  or a complete legacy record diff;
- a capture mask, tolerance or changed v1 baseline to hide a visible difference;
- widening a compiler restriction or discarding authored content to render it.

The conversion contract already records differences such as Scene-label chapter
Markers and retired silent uses. Those facts are not permission to relax UX
comparison. The oracle must report any visible difference and its cause. An
unavoidable conflict between a named accepted model change and pixel equivalence
returns to Jon with the smallest concrete pair; neither side is silently weakened.

## Remaining uncertainty

The largest unproved assumption is that existing component contracts can express
all accepted v2 edits while preserving the existing interaction. An unchanged
component can still receive subtly different selection, activation or timing data.
The tracer must therefore qualify actual read projections and one real gesture,
not merely demonstrate that the component mounts. I am least confident about the
cost of the property-animation and Group connections, where authored identity and
time ownership differ most. That uncertainty favors a bounded in-place tracer
before committing to the rest of the migration.

## Evidence and decision status

The [coordinator's four-corpus paired inspection](../reference/evidence/issue-1065-coordinator-comparison/README.md)
records the rejected route at desktop and narrow widths, solely as failure evidence.
The [automated oracle and run evidence](../reference/evidence/issue-1065-equivalence-oracle/README.md)
provide the repeatable acceptance command. Its verdict at the time of that inspection was red:
the stored v2 record then opened in a visibly different editor and lacked the
ordinary v1 Clip gesture. Since #1065 connected the existing editor, the stored
v2 record opens there instead; only the ordinary Clip move is connected, and
every other command is fenced until #1066. The v1 behavioral reference qualified one drag, one save, one
history entry, exact moved-state hydration and exact Undo restoration. No product
UI or engine behavior changed in this slice. The oracle must become green through
the connection work; the rejected screen cannot become its accepted baseline.

**Decision accepted 2026-09-17: proceed with the bounded #1065 tracer after the
oracle corrections. #1066 and #1067 remain out of scope, and nothing may be pushed.**

**Decision by Jon, 2026-09-18: no route gate and no opt-in.** A v2-stored Show
opens in the existing editor on main as each slice lands. Everything earlier in
this document that reads "the gate remains on" or "the rejected route holds a v2
row" is obsolete. Pushing still needs Jon's explicit word for that push.
