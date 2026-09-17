# Native v2 Zone and Zone Layout definition owners

The production v2 Show editor writes the Show's Zone collection through
[`editShowZoneV2`](../../../src/engine/showZonesV2.ts) and its Zone Layout
definitions through
[`editShowZoneLayoutDefinitionV2`](../../../src/engine/showZoneLayoutDefinitionsV2.ts),
adopting both through the closed prepared-edit dispatch
(`admitShowV2PilotZoneEdit`, `admitShowV2PilotLayoutDefinitionEdit`). Canonical
Scene-retirement specification §§6-9 govern the edit pipeline and §7's Zone and
Layout rules; this contract describes the landed behavior.

Both owners are a representation port. v1's `addShowZone`, `removeShowZone`,
`addShowRoutingLayout`, `updateShowRoutingLayout` and `removeShowRoutingLayout`
in `showModel.ts` are the specification of what each edit means, and the three
deliberate differences are named below. Nothing here widens the compiler,
schema or runtime domain, and no MCP command was added: Jon's #943 scope
principle keeps the command set on content inside Shows, not Show structure.

## Zones

| Intent | Behavior |
| --- | --- |
| `add` | Appends the caller's complete Zone and routes it in **every** Layout definition, as v1's `appendZoneToLayout` does: physical ranges start one pixel after the definition's largest assigned end, and a fixed-arity operator (Full surface, Moving split, Soft split, Checker, Grid) becomes a horizontal stripe subdivision carrying the new member, with v1's own reason - those operators cannot describe one more Zone, and stripes is the least surprising valid default. |
| `remove` | Refuses the last Zone. Otherwise cascades explicitly through the owners that already hold those rules - the Group occurrence owner for occurrences bound to the Zone, the Clip-deletion owner for its Clips with that owner's Transition and Clip-track cascades, then the Layer owner for its now-unreferenced Layers - and finally drops the Zone's membership and ranges from every definition, dropping an operator that named it exactly as v1 does. |

Identity is never allocated inside either owner: `add` takes the complete new
Zone, and the editor seeds it from `showV2AddZoneIntent` with v1's defaults -
`zone-<n>`, 60 nominal pixels and the next palette color - plus a fresh
workspace id.

A Clip whose removed Transition carries a Property ramp needs one complete ramp
projection plan, which `remove` forwards to the Clip-deletion owner under
`clipRemovals`. Without it that owner's own `unsupported-property-carrier`
refusal is reported and nothing is written. Removing the last Zone that holds
content may leave a valid empty Show, which the dispatch's existing
deleting-to-empty rule admits for this owner as it does for Clip and Group
deletion.

Removal can only narrow a definition to the removed Zone or widen it to the
whole Zone set, so it cannot orphan a surviving Clip. Addition can: a
definition with no explicit Zone entries and no operator routes every Zone
today, and appending the new Zone's ranges would make it the only routed one.
The shared result check refuses that atomically instead of writing what v1
wrote silently.

## Zone Layout definitions

| Intent | Behavior |
| --- | --- |
| `add` | Appends a definition with v1's default body: nominal contiguous physical ranges from the Show's Zones, plus - for a Portable contract - a clone of the first definition's operator, or Full surface on the first Zone when there is none. |
| `duplicate` | Appends an exact clone of one existing definition under a fresh identity and name. |
| `rename` | Writes one definition's name; an identical name is a true no-op. |
| `remove` | Refuses the last definition, and refuses while any Layout occurrence still names this one. |
| `set-routing` | Writes the complete operator - kind, parameters and member Zones - or `null` for physical ranges. Every member Zone must exist, `validateShowLogicalRouting` must accept the operator, and a Portable contract refuses `null` because it routes by normalized Stage position. |
| `set-physical-ranges` | Writes one Zone's ranges on a physical definition, each range ordered low-to-high and the list sorted by start, exactly as v1's `parseShowRoutingRanges` normalizes them. An entry is added for a Zone the definition does not list yet. A definition that routes by operator refuses. |

### Three deliberate differences from v1

1. **A colliding name is refused, not uniquified.** v1's `addShowRoutingLayout`
   and `addShowZone` silently renamed to `<name> 2`. Definition and Zone names
   reach the compiler as recipe keys, so the owners refuse a collision -
   compared case-insensitively, as v1 compared - and the caller supplies the
   name it wants. The editor seeds one that is already free.
2. **Removing a used definition is refused.** v1 removed a definition by
   dropping the routing switches that named it, after which the interval at
   time zero re-pointed at whatever definition was first in the list. A v2
   occurrence names its definition explicitly and the first occurrence cannot
   be removed, so that rewrite has no exact v2 form. The refusal names the
   occurrences; the author selects another definition on them first, through
   the occurrence owner that already performs exactly that edit. Both sides are
   tested.
3. **A non-2x2 Grid reads as Grid.** v1's routing-mode projection recognized a
   grid only at 2 columns by 2 rows and displayed anything else as physical
   ranges, which no longer described the record. The v2 projection reports Grid
   with its columns and rows as editable parameters.

Ranges that miss, overlap or exceed the output contract's pixel count are
accepted, because v1 accepts them and reports the gap through Installation
coverage instead; refusing them would narrow shipped behavior. The editor shows
the same coverage arithmetic beneath the fields. Since #1039 that gap is a
verdict again on the v2 path as well: `validateShowAuthoringV2` reports it as a
delivery warning and `buildShowV2RouteArtifacts` refuses delivery, exactly where
v1's two callers do. Both surfaces read `validateInstallationCoverageV2`, the
same projection the editor's arithmetic comes from, so an owner that accepts the
edit and a delivery that refuses the result are never disagreeing about the
numbers.

## Result shape

Each owner consumes an immutable preimage and an explicit intent, applies only
its own cascades on a private candidate, and validates one complete candidate
through `validateShowRecordV2`, `validateShowLogicalRouting` for every
definition, and `validateShowLayoutAvailabilityV2`. It returns
changed / unchanged / refused with exact affected collections: Zones, Layers,
Clips, instances, Transitions, tracks, Layout definitions, Group occurrences and
removed ids for the Zone owner; Layout definitions, Layout occurrences, Zones
and removed ids for the definition owner. A refusal or no-op returns the
original record identity with every collection empty, and writes no history,
save or timestamp. Typed refusal codes are `last-zone`, `last-definition`,
`definition-in-use`, `duplicate-name`, `identity-conflict`, `missing-target`,
`missing-zone`, `invalid-request`, `unsupported-contract`, `unsupported-content`,
`unsupported-property-carrier`, `invalid-routing`, `zone-unavailable`,
`invalid-record` and `invalid-result`.

Both admission wrappers check the complete public intent shape - exact known
fields, nonblank identities, whole nonnegative range indexes - before the typed
owner, so a malformed runtime object never reaches preparation or adoption.

## Proof

- `src/engine/showZonesV2.test.ts`, `src/engine/showZoneLayoutDefinitionsV2.test.ts`
  and `src/engine/showV2ZoneLayoutEditorModel.test.ts`: immutable preimage,
  reopened records through the provisional codec, `prepareShowStageV2` for the
  `references missing zone` counterexample, every refusal code, and the v1
  parameter conversions.
- `src/store/showV2ZoneLayoutAdmission.test.ts`: one preparation, one history
  entry and one save per accepted edit; Undo and Redo; malformed ingress before
  preparation; owner refusal and true no-op writing nothing; a stale revision.
- `src/components/ShowV2ZoneLayoutEditor.test.tsx` and the two new cases in
  `src/components/ShowV2ShowPropertiesEditor.test.tsx`: the surface, asserted at
  the adopted record rather than component state.
- `e2e/show-editor-v2-zones-layouts.auth.spec.ts`, registered in
  `test:e2e:shows`: both flows on the production Show URL, with Fast and Precise
  Stage frames either side of a Layout switch, the reopened `.pxlshow` and
  `.epe`, Undo, a reload and the 390 px pass.
- Evidence and fault-sensitivity record:
  `docs/reference/evidence/issue-1039-zones-layouts/test-design.json`.

## Residuals

- **The Stage's spatial LED selector.** `ShowZoneSpatialSelector` - dragging
  across the Stage map to select an Installation Zone's LEDs - still takes a v1
  `ShowRecord`, and its draft coverage preview runs through
  `updateShowPhysicalZoneSelection`, which returns one. Porting it means
  narrowing that shared component's props, a v1-editor change this slice was
  not scoped to make. The data is fully authorable here, and
  `showV2ShowSurfaceResiduals.test.ts` pins the seam: the exact ranges
  `compactSpatialIndexes` produces are what `set-physical-ranges` accepts, so
  the port stays a projection instead of becoming a second writer.
- **A fresh Show cannot gain a second Zone yet.** A fresh v2 Show's two Clips
  carry `zoneSampleMode: 'independent'`, which the lowerer admits only while the
  Show has exactly one Zone; with two it refuses with
  `composition.clips: lowering requires repeat-mode Clip sampling evidence
  before compilation.` The Zone owner accepts the edit and the prepared-edit
  dispatch then refuses it, so nothing is written and the message is shown. No
  editor route offers a Clip-sampling control - only `update_clips` writes
  `zone_sample_mode` - so the authenticated spec writes `span` through the
  provider before adding a Zone. Closing this needs either a Clip-sampling
  control or a fresh-Show sampling decision, both outside this slice.

  `src/engine/showCreationV2ZoneSampling.test.ts` now measures what creating a
  fresh Show with `span` would cost, at a reopened `.epe` replayed in Fast and
  Precise over the Show's own declared Stage. It is more than the generated
  bytes, so the decision is a product one:

  - A fresh **Portable** Show changes artifact dimension. `independent` keeps
    the 1D `render(index)` artifact both stock Patterns are written for, byte
    for byte the fresh v1 Show's; `span` emits `render2D(index, x, y)` against
    the Portable 2D reference. The two disagree on the **first frame**, before
    any Transition.
  - A fresh **Installation** Show is identical at every sampled time through its
    own timeline - 0, 16000, 29984, 30000, 31008, 32000, 45008, 58000 and
    61968 ms, in both modes, frames and member state alike - and then differs at
    Show End: the routed emitter wraps its Show clock (`% 62`) while the flat
    emitter, and so every fresh v1 Show, holds its last Clip forever. In Fast
    the first differing sample is 62016 ms; in Precise it is 61984 ms, because
    the emulated 16.16 Show clock accumulates about +25 ms over the Show's
    frames and wraps before nominal Show End. v1 makes the same switch the
    moment a second Zone is added, so this is the routed emitter's established
    behavior arriving one edit earlier.
  - On a Controller whose pixel count does not match the declared Stage, `span`
    addresses the Zone's declared range and reports its nominal count to the
    Pattern, where the flat artifact adapts to the pixels actually present. A
    30-LED Controller running this 60-pixel Show sees different output from the
    first Clip.
