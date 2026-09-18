# The Show suite on the v2 backing: what passes, what fails, and why (#1066)

`e2e/shows.auth.spec.ts` now runs against both stored record versions from one
unmodified set of test bodies (`npm run test:e2e:shows:v2`, slice 0). This is
the inventory that run produced. It orders the remaining slices of #1066; it is
a diagnostic record, not a gate.

Measured at `01317257` on branch `codex/issue-1066-both-backings`, eight shards
at `--workers=1`. **38 of 87 cases pass on the v2 backing, 49 fail.** The v1
run is unchanged at 87/87.

## How a case reaches the v2 backing, and what that proves

- A row the harness seeds is converted through the product's own
  `convertShowRecordV1ToV2` and stored under the same identity through
  `PUT /api/shows/<id>?show-version=2`. It then opens the way a converted row
  will open in production.
- A built-in Show has no stored row and cannot be given one, so it opens
  through the landed development-only preview parameter
  (`SHOW_V2_ROUTE_PREVIEW_PARAM`), which converts in memory for the session and
  writes nothing. All 40 stock Shows convert cleanly without Pattern sources,
  so every one of them does reach the v2 record.
- Every navigation waits for the editor's own agent registration to carry
  record version 2 before the test body proceeds, so no verdict below is v1
  behavior misreported as v2. Adding that wait changed no verdict.

Two limits apply to the failures and are marked in the table:

- **Save barrier substituted.** The suite's 31 `waitForCurrentShow` barriers read the
  version-1 record shape and nothing projects a version-2 document back into
  it. On the v2 run the barrier waits for the version-2 save to reach storage
  instead, and annotates the test. A case marked *(barrier)* failed because no
  version-2 save arrived at all, which is a stronger statement than the
  original predicate, not a weaker one.
- **Secondary `409 (Conflict)`.** Four cases failed only on the boundary's
  console-error check, from stale `/api/agent/channel` rendezvous on a reused
  account after a worker restart. Each was re-run alone; three pass and one
  (line 3654) fails for a real reason. The table records the true verdict.

## Verdicts

Class key: **a** unconnected v2 command, **b** missing v2 read, **c**
helper/seeding gap in this harness, **d** engine gap (the v2 owner refuses what
v1 accepts), **e** not applicable to v2 by design. No case fell into **e**.

| Line | Case | V | First cause | Cl | v1 owner → landed v2 owner |
| --- | --- | --- | --- | --- | --- |
| 15 | lesson Pattern swap (#828) | ✗ | `Try with Pattern` absent: the whole lesson live strip is v1-only | b | `ShowEditor.tsx:2812` `legacyShow && builtInContext?.note` → needs the built-in note surface on the v2 record |
| 53 | built-in Show Reset vs session edits (#363, #619) | ✗ | brightness edit writes nothing, so Reset never enables | a | `commitClipInspectorPatch` (`:2069`) → `admitShowV2PilotAppearanceEdit`; the built-in draft path (`resolveEditableShow`, `resetStockShowDraft`) has no v2 counterpart at all |
| 98 | Show End drag preview (#592) | ✗ | label never changes while dragging | a | `onSetShowEnd` (`:3079`), preview basis `:4412` reads `show` → `admitShowV2PilotSetShowEnd` |
| 135 | Delete targets the final Clip (#63) | ✗ | Clip still present after Delete | a | `requestDeleteClip` (`:1560`), `onRemoveCompositionClip` (`:3331`) → `admitShowV2PilotClipDelete` |
| 156 | Show End diamond clipped by header (#63) | ✓ | | | |
| 189 | Show End hidden when zoom moves it offscreen (#63) | ✓ | | | |
| 206 | Show End aligned across a Stage split (#63, #967) | ✓ | | | |
| 238 | Stage undistorted at both divider limits (#1006) | ✓ | | | |
| 311 | compact transport above the divider (#1006) | ✓ | | | |
| 341 | Show split remembered across switches (#967) | ✓ | | | |
| 374 | Show strip across the workspace breakpoint (#63) | ✓ | | | |
| 386 | compact sparkline gutter and playhead (#63) | ✓ | | | |
| 404 | property label not forced into a zero gutter (#63) | ✓ | | | |
| 419 | collapsed Zone summaries (#63) | ✓ | | | |
| 471 | Zone Layout names on the ruler (#63) | ✗ | interval reads `Moving split X50%`: split position is hardcoded | b | `movingSplitLayout` (`:5134`) reads `show?.routingLayouts`; the v2 `laneCells` arm hardcodes `splitPosition: 0.5` |
| 503 | Scene-local animation into one sparkline (#363, #599) | ✓ | | | |
| 516 | built-in Clip summary to its field (#599, #650) | ✓ | | | |
| 547 | toolbar in one visible desktop row | ✓ | | | |
| 586 | toolbar labels disclose as width allows | ✓ | | | |
| 607 | simultaneous Pattern copies (#839) | ✓ | | | |
| 628 | header title before lower-priority controls (#836) | ✓ | | | |
| 732 | header at phone width (#836) | ✓ | | | |
| 772 | toolbar groups separated when space runs out | ✓ | | | |
| 796 | Show Trails enabled and retained | ✗ | Enable Trails checkbox does not change state | a | `onUpdateOutputTrails` (`:3246`) → `admitShowV2PilotShowMetadata` |
| 822 | scroll, trackpad pan and Shift-wheel pan (#476) | ✓ | | | |
| 851 | playhead hidden outside the panned viewport | ✓ | | | |
| 871 | Undo restores a deleted Clip | ✗ | the Clip is never deleted | a | as line 135 → `admitShowV2PilotClipDelete` (Undo/Redo already dispatch by backing, `:3839`) |
| 888 | Transition time reclaimed after a resize (#695) | ✗ | trailing resize writes nothing | a | `onResizeCompositionClip` (`:2997`) → `admitShowV2PilotClipTemporal` (`trim`/`extend`), `admitShowV2PilotTransitionResize` (`resize-trailing`) |
| 934 | Snap preference after a reload | ✓ | | | |
| 947 | Option-drag duplicate onto another Layer (#668) | ✗ | no editor: conversion refuses `unsupported-boundary-transition` — "Whole-boundary scope requires two nonempty contributor sets without unrelated contribution or boundary carriers" | d | `convertShowRecordV1ToV2`, path `transitions` |
| 1040 | Clip drag snapping modifiers (#789) | ✗ | same refusal as line 947 | d | as above |
| 1146 | detail panel beside its Clip (#665) | ✓ | | | |
| 1183 | exact Clip edit across a reload | ✗ | *(barrier)* no version-2 save after a brightness edit | a | `commitClipInspectorPatch` (`:2069`) → `admitShowV2PilotAppearanceEdit` |
| 1204 | Escape dismisses the panel, focus returns | ✓ | | | |
| 1218 | panel moves by keyboard navigation | ✓ | | | |
| 1242 | Clip Effect survives a reload | ✗ | added Effect never appears in the stack | a | `commitClipInspectorPatch` → `admitShowV2PilotAppearanceEdit` |
| 1257 | Mirror only through its Transform row | ✗ | `show-effect-mirror` never turns on | a | as line 1242 |
| 1284 | edited Effect parameters after a reload | ✗ | Amount field never appears (no Effect was added) | a | as line 1242 |
| 1308 | browsing the Effect palette commits nothing | ✓ | | | |
| 1366 | remove one Effect, keep the stack | ✗ | Effects never added | a | as line 1242 |
| 1383 | duplicate and reorder Effects | ✗ | Effects never added | a | as line 1242 |
| 1409 | Transition family kept after a reload | ✗ | family never changes | a | `onApplyItem` (`:3498`), `onUpdateBoundaryTransition` (`:3406`) → `admitShowV2PilotTransitionEdit` |
| 1422 | edited Transition parameters after a reload | ✗ | parameter field never appears | a | as line 1409 |
| 1451 | browsing the Transition palette changes nothing | ✓ | (secondary 409 in the sharded run; passes alone) | | |
| 1469 | Portable output contract reloaded | ✗ | *(barrier)* no version-2 save after the contract edit | a | `onUpdatePortableReference` (`:3237`) → `admitShowV2PilotShowMetadata` |
| 1555 | second Show without route/active-Show looping | ✓ | | | |
| 1569 | authored Show file round-trip (#853) | ✗ | no download is ever offered | a | `exportAuthoredShowFile` (`:2533`) returns on `!legacyShow` → needs the native v2 export owner |
| 1627 | Cancel and Escape leave no Show record | ✓ | | | |
| 1644 | Shows Trash emptied after confirmation (#793) | ✗ | the test body reads `/api/shows` directly and the row is a version-2 document | c | test body `:1663`; no v2→v1 projection exists, so this is a reported finding, not a harness bug to fix silently |
| 1680 | offline save rollback notice (#792) | ✗ | `show-save-failure` never renders | b | `showSaveFailure` (`:1075`, used at `:2802`) is the v1 state; the store's `showV2SaveFailure` is unread |
| 1730 | disabled Show controls explain themselves (#796) | ✓ | | | |
| 1755 | duplicate from the rail, clone a built-in (#794) | ✗ | the test body reads `/api/shows` directly | c | test body `:1767`; same reason as line 1644 |
| 1780 | focus after a discrete edit, keyboard transport | ✗ | Replace Pattern never applies | a | `commitClipInspectorPatch` pattern arm → `admitShowV2PilotClipReplacementEdit` |
| 1823 | paused frames at preview brightness (#826) | ✓ | | | |
| 1853 | Clip Transform values after a reload | ✗ | *(barrier)* no version-2 save | a | `commitClipInspectorPatch` → `admitShowV2PilotAppearanceEdit` |
| 1893 | soft ellipse aperture after a reload (#591) | ✗ | *(barrier)* no version-2 save | a | as line 1853 |
| 1924 | complete Place controls without a scrollbar | ✓ | | | |
| 1989 | inline placement at the panel floor | ✓ | | | |
| 2071 | discontinuous Installation LED ranges | ✗ | `Select LEDs for main` never opens | b | the Stage spatial selector is guarded by `legacyShow` (`:3890`); the write then needs `admitShowV2PilotZoneEdit` |
| 2116 | invalid coverage persisted, then repaired | ✗ | the pixel-range edit writes nothing | a | `onUpdateRoutingLayout` (`:3440`) → `admitShowV2PilotLayoutDefinitionEdit` |
| 2156 | measured output map locked to its count | ✓ | | | |
| 2203 | Clip evaluation policy after a reload | ✗ | the select never holds `freeze-at-entry` | a | `onUpdateRestartOnEntry` (`:3394`) and the policy arm of `commitClipInspectorPatch` → `admitShowV2PilotClipEntryPolicy` |
| 2218 | every Clip detail tab in one pass (#658) | ✗ | *(barrier)* no version-2 save | a | `commitClipInspectorPatch` → appearance, instance-property and entry-policy admissions |
| 2276 | appended Zone Layout interval (#624) | ✗ | Append writes no interval | a | `onAppendLayoutInterval` (`:3086`) → `admitShowV2PilotLayoutOccurrenceEdit` |
| 2331 | shared moving-split property (#623) | ✗ | the Zone Layouts lane is absent | b | `movingSplitLayout` (`:5134`) reads `show?.routingLayouts` |
| 2410 | transition-scoped sample repeat tiling (#654) | ✗ | `Animate repeat scale` does not change state | b | `hasSampleRemap` (`:5137`) is gated on `show.scenes`; the sample-repeat lane never renders on v2 |
| 2452 | per-parameter Property animation (#648) | ✗ | *(barrier)* no version-2 save | a | `onPropertyAnimationChange` (`:3266`) → `admitShowV2PilotPropertyEdit` |
| 2492 | Scene-local animation through the overview (#490, #649) | ✗ | *(barrier)* no version-2 save | a | as line 2452 |
| 2544 | Transition parameters swap with the family | ✗ | the new family's field never appears | a | `onApplyItem` (`:3498`) → `admitShowV2PilotTransitionEdit` |
| 2563 | spatial Transition parameter after a reload | ✗ | Ring width field never appears | a | as line 2544 |
| 2582 | marquee Group, linked edit, make unique (#587) | ✗ | no editor: conversion refuses `unsupported-boundary-transition` | d | as line 947 |
| 2689 | timeline fit, preview space, manual sizing (#1006) | ✗ | `Rename zone zone-7` absent: adding a Zone writes nothing | a | `onAddZone` (`:3124`, `:3421`) → `admitShowV2PilotZoneEdit` |
| 2795 | paused Stage pixels through resizing (#63) | ✓ | | | |
| 2844 | connected-delete confirmation at 1440px (#993) | ✗ | no editor: conversion refuses `ambiguous-layer` — overlay ordinal 0 in Zone `zone-1` has divergent names | d | `convertShowRecordV1ToV2`, path `composition.scenes.*.zones[zone-1].overlays[0].name` |
| 2844 | connected-delete confirmation at 640px (#993) | ✗ | same refusal | d | as above |
| 3281 | lesson pointer toggles release focus (#978) | ✓ | | | |
| 3323 | strip summaries at the usable width clamp (#968) | ✓ | | | |
| 3438 | hover reads, click pins, Escape peels (#985) | ✗ | strip geometry differs: the live strip is absent | b | `ShowEditor.tsx:2812` |
| 3492 | Aperture narration Heart 1/9 → Star 2/9 | ✗ | narration absent | b | `ShowEditor.tsx:2812` |
| 3511 | three Pattern slots share one popover | ✗ | Pattern chip unreachable | b | `ShowEditor.tsx:2812` |
| 3558 | chooser Reset preserves Clip edits and Undo (#987) | ✗ | Undo stays disabled: the Clip edit wrote nothing | a | `commitClipInspectorPatch` → `admitShowV2PilotAppearanceEdit` |
| 3605 | 560-wide editor keeps one strip row | ✗ | strip absent | b | `ShowEditor.tsx:2812` |
| 3628 | 103 follows the Clip under the playhead | ✗ | narration absent | b | `ShowEditor.tsx:2812` |
| 3641 | 105 narrates its three intervals | ✗ | narration absent | b | `ShowEditor.tsx:2812` |
| 3654 | 102 compact chip at 760px | ✗ | Pattern chip absent | b | `ShowEditor.tsx:2812` |
| 3667 | Stage outlines follow selection (#983) | ✓ | (secondary 409 in the sharded run; passes alone) | | |
| 3719 | Quadrille outlines across pane sizes (#983) | ✓ | (secondary 409 in the sharded run; passes alone) | | |

## What the failures amount to

Thirty-one failures are class **a**, and they are not thirty-one problems: the
whole v1 command surface is fenced behind two lines. `editableShow`
(`ShowEditor.tsx:1394`) and `legacyShow` (`:2530`) are null on a v2 backing, and
53 handler sites guard on them. All 13 landed v2 read projections are already
consumed by the existing editor, which is why class **b** is confined to five
places, and 22 admissions are already landed in
`src/store/showV2PreparedEditAdmission.ts`, of which exactly one
(`admitShowV2PilotClipTemporal`, for `move`) is wired, at `:1533`.

Two class **d** refusals block five cases and belong in the engine, filed
separately:

- `unsupported-boundary-transition` on a whole-boundary Transition whose
  neighbouring Scene contributes no Clip in that Zone. Smallest counterexample:
  the fixture at `e2e/shows.auth.spec.ts:949` — two Scenes in `zone-1`, `main`
  non-empty in Scene 1 and empty in Scene 2, one boundary Transition.
- `ambiguous-layer` when one overlay ordinal carries different names in
  different Scenes. Smallest counterexample: `src/test/showRemoveClipFixture.ts`
  — Zone `zone-1`, overlay ordinal 0, divergent `name` across Scenes.

Two cases (1644, 1755) are class **c** in the sense the issue asks about: their
test bodies read `/api/shows` directly, and a version-2 document is absent from
that listing. They cannot pass on v2 without editing the test, so they are
reported here rather than worked around. Nothing projects a v2 document back
into the v1 shape, and inventing one for a test would be a second
implementation of the record.

## Proposed landing slices

Ordered nearest to the working Clip move first, then by dependency and size.
Each slice connects existing owners through the existing handlers; none adds a
panel, a form or a second implementation.

1. **The rest of the Clip temporal intents.** `move` is connected; add
   `trim`/`extend` and `replace-placement` (cross-Layer and cross-Zone drops)
   and `split` through the same `admitShowV2PilotClipTemporal`, and the
   connected forms `resize-leading`/`resize-trailing`/`move-connected` through
   `admitShowV2PilotTransitionResize`. Handlers: `onResizeCompositionClip`,
   `onMoveCompositionClip`, `onSplitCompositionClip`. Green: **888**.
2. **Clip delete, with Undo and Redo.** `requestDeleteClip` and
   `onRemoveCompositionClip` → `admitShowV2PilotClipDelete`; history already
   dispatches by backing. Green: **135, 871**.
3. **The Clip detail panel's appearance surface.** One chokepoint,
   `commitClipInspectorPatch`, routed to `admitShowV2PilotAppearanceEdit` and
   `admitShowV2PilotInstanceProperties` for brightness, transform, aperture and
   the Effects stack. Green: **1183, 1242, 1257, 1284, 1366, 1383, 1853, 1893,
   3558**; part of **2218**.
4. **Entry policy and Replace Pattern.** `onUpdateRestartOnEntry` and the
   pattern arm of `commitClipInspectorPatch` →
   `admitShowV2PilotClipEntryPolicy`, `admitShowV2PilotClipReplacementEdit`.
   Green: **1780, 2203, 2218**.
5. **Transitions.** `onApplyItem`, `onUpdateBoundaryTransition`,
   `onDurationChange`, `onResetToCut` → `admitShowV2PilotTransitionEdit` and
   `admitShowV2PilotTransitionResize`, plus the palette preview, whose
   `onPreviewItem` (`:3480`) returns early on `!legacyShow` and is the red
   `transition-palette` oracle row. Green: **1409, 1422, 2544, 2563**.
6. **Show level: Show End and Show metadata.** `onSetShowEnd` →
   `admitShowV2PilotSetShowEnd` (with the drag preview basis at `:4412`);
   `onUpdateOutputTrails`, `onUpdatePortableReference`, `onUpdateTargetProfile`
   → `admitShowV2PilotShowMetadata`. Green: **98, 796, 1469**.
7. **Zones, the Zone Map and Zone Layout definitions.** `onAddZone`,
   `onUpdateZone`, `onRemoveZone` → `admitShowV2PilotZoneEdit`;
   `onAddRoutingLayout`, `onUpdateRoutingLayout`, `onRemoveRoutingLayout` →
   `admitShowV2PilotLayoutDefinitionEdit`; the Stage spatial selector's
   `legacyShow` guard at `:3890`. Green: **2071, 2116, 2689**.
8. **Zone Layout occurrences on the timeline.** `onAppendLayoutInterval`,
   `onInsertLayoutInterval`, `onDuplicateLayoutInterval`,
   `onMakeLayoutIntervalUnique` → `admitShowV2PilotLayoutOccurrenceEdit`.
   Green: **2276**.
9. **The two unread timeline lanes.** The Zone Layouts lane's split cell
   (`movingSplitLayout`, `splitPositionAt` already reads
   `layoutOccurrences[].parameters.splitPosition`) and the sample-repeat lane
   (`hasSampleRemap`), the latter with the `repeatScale: 1` conversion
   provenance Jon approved on 2026-09-18. Green: **471, 2331, 2410**.
10. **Property animation.** `onPropertyAnimationChange` →
    `admitShowV2PilotPropertyEdit`. Green: **2452, 2492**.
11. **The built-in lesson surface.** One guard, `ShowEditor.tsx:2812`, renders
    the live strip, narration, Reading card and Pattern-slot chooser only for
    `legacyShow`; the built-in Pattern-slot selection and Reset draft path
    (`resolveEditableShow`, `resetStockShowDraft`) has no v2 counterpart and
    needs a decision, because a built-in Show is not a stored row. Green:
    **15, 3438, 3492, 3511, 3605, 3628, 3641, 3654**, and with slice 3, **53**.
12. **Header export and the save-failure notice.** `exportAuthoredShowFile`
    (`:2533`) through the native v2 export owner, and the unread
    `showV2SaveFailure` beside `showSaveFailure` (`:2802`). Green: **1569,
    1680**.

Outside the slice sequence:

- **Engine gaps**, filed separately and fixed in the engine, not papered over:
  `unsupported-boundary-transition` and `ambiguous-layer` above. They block
  **947, 1040, 2582** and both **2844** cases, and no editor work can reach
  those cases until the converter accepts their records.
- **Reported findings**, not slices: **1644** and **1755** read the version-1
  listing from inside the test body.
