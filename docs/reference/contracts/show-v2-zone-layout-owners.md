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
Zone, and the editor seeds it from `planShowV2ZoneAdd` (`src/engine/showV2ZonePlanning.ts`) -
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

A Zone Layout's *structure*, as distinct from its coverage, is a v1 rule that
now reaches the v2 path too. `validateShowZoneLayoutStructure` is the one
implementation both authoring validators read, over the fields each version
names - `routingLayouts` on a `ShowRecord`, `zoneLayouts` on a `ShowRecordV2`.
It reports four structural errors, exactly as `validateShowAuthoring` always
did, before any dependency or delivery question: a Layout naming a Zone the
Show does not have (`layout-missing-zone`, for a physical entry and for a
routing operator's member list alike), a physical range endpoint that is not a
safe integer (`invalid-physical-range`), a routing operator
`validateShowLogicalRouting` rejects (`invalid-logical-routing`), and a blank or
repeated Zone identity inside one Layout (`empty-identity`,
`duplicate-identity`). The definition owner already refuses each of these at the
owner, so the surface this restores is the agent candidate: before #1039 a
candidate assigning `[{ start: 0.5, end: 14.75 }]` validated, saved and
reopened on the v2 path where v1 refuses it.

Nothing stricter than v1 came with it. A *negative* integer endpoint stays
admitted in both versions and is answered by Installation coverage; unsorted and
overlapping ranges stay admitted; and v2 `.pxlshow` import keeps an unrepaired
Layout, because v1 import never ran this rule - it rounded the endpoints through
`normalizeRoutingLayout` instead, and specification section 3 forbids v2 a
universal normalizer of its own.

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

- `src/engine/showZonesV2.test.ts` and `src/engine/showZoneLayoutDefinitionsV2.test.ts`: immutable preimage,
  reopened records through the provisional codec, `prepareShowStageV2` for the
  `references missing zone` counterexample, every refusal code, and the v1
  parameter conversions.
- `src/store/showV2ZoneLayoutAdmission.test.ts`: one preparation, one history
  entry and one save per accepted edit; Undo and Redo; malformed ingress before
  preparation; owner refusal and true no-op writing nothing; a stale revision.
- `src/components/ShowEditorV2Tracer.test.tsx` (v2 Zone and Zone Layout
  definition wiring): the production surface routes each Zone and Layout
  definition edit through its admission door.
- `e2e/show-editor-v2-zones-layouts.auth.spec.ts`, registered in
  `test:e2e:shows`: both flows on the production Show URL, with Fast and Precise
  Stage frames either side of a Layout switch, the reopened `.pxlshow` and
  `.epe`, Undo, a reload and the 390 px pass.
- Evidence and fault-sensitivity record:
  `docs/reference/evidence/issue-1039-zones-layouts/test-design.json`.

## Residuals

- **The Stage's spatial LED selector is ported.** #1066 slice 7 narrowed
  `ShowZoneSpatialSelector` to the fields both backings share and routed its v2
  commit through `planShowV2PhysicalZoneSelection`.
  `showV2ShowSurfaceResiduals.test.ts` still pins the seam: the exact ranges
  `compactSpatialIndexes` produces are what `set-physical-ranges` accepts, so
  the selector stays a projection instead of becoming a second writer.
- **No editor route offers a Clip-sampling control.** Only `update_clips`
  writes `zone_sample_mode`, so a Show that needs `span` can only reach it
  through an agent command or the provider. A fresh Show no longer needs it to
  gain a Zone (#1063); two steps past that still do, and both are this control's
  gap rather than the lowerer's:

  - `ShowV2AddClipEditor` (removed by #1067 Stage 1) wrote `zoneSampleMode: 'span'` for every new Clip. A
    fresh Show's own Clips sample `independent`, and mixed sampling is not
    flat-eligible, so the first Clip added to a second Zone refuses with
    `composition.clips: This multi-Zone arrangement requires span Clip sampling
    before compilation.` Nothing is written and the message is shown.
  - A second Layout occurrence over a participant Transition refuses on the
    continuous-flat route with `unsupported-layout-occurrences`.

  `e2e/show-editor-v2-zones-layouts.auth.spec.ts` therefore adds its Zone and
  its Layer with no setup at all, and writes `span` through the provider only
  before adding a Clip.

  A fresh Show keeps `zoneSampleMode: 'independent'`, which is what keeps its
  artifact byte for byte the fresh v1 Show's.
  `src/engine/showCreationV2ZoneSampling.test.ts` measures what creating it with
  `span` would have cost instead, at a reopened `.epe` replayed in Fast and
  Precise over the Show's own declared Stage. Jon chose the lowering change over
  that flip on 2026-09-17, on this measurement:

  - A fresh **Portable** Show would change artifact dimension. `independent`
    keeps the 1D `render(index)` artifact both stock Patterns are written for;
    `span` emits `render2D(index, x, y)` against the Portable 2D reference. The
    two disagree on the **first frame**, before any Transition.
  - A fresh **Installation** Show is identical at every sampled time through its
    own timeline - 0, 16000, 29984, 30000, 31008, 32000, 45008, 58000 and
    61968 ms, in both modes, frames and member state alike - and then differs at
    Show End: the routed emitter wraps its Show clock (`% 62`) while the flat
    emitter, and so every fresh v1 Show, holds its last Clip forever. In Fast
    the first differing sample is 62016 ms; in Precise it is 61984 ms, because
    the emulated 16.16 Show clock accumulates about +25 ms over the Show's
    frames and wraps before nominal Show End.
  - On a Controller whose pixel count does not match the declared Stage, `span`
    addresses the Zone's declared range and reports its nominal count to the
    Pattern, where the flat artifact adapts to the pixels actually present. A
    30-LED Controller running this 60-pixel Show sees different output from the
    first Clip.

  Adding a Zone reaches the wrap anyway, and from v1: a two-Zone Show compiles
  through the routed emitter in both models, so the fresh Show stops holding its
  last Clip the moment it gains a second Zone - in v2 exactly where v1 does.
