# Activating the v2 Show route (#1039)

What #1056 slice 6 leaves for the coordinated cutover, written from the landed
code rather than from a plan. Authority is the
[Scene-retirement specification](../../../plans/scene-retirement-specification.md)
§10 and the as-built
[editor contract](../../contracts/show-editor-v2.md).

## The single gate to flip

```
src/engine/showV2RouteGate.ts
export const SHOW_V2_ROUTE_DEFAULT = false   →   true
```

`isShowV2RouteEnabled()` returns `true` immediately when that constant is
`true`; otherwise it answers the development-only `?show-v2-editor=1` opt-in and
a production build answers `false` however the URL is written. Nothing else
reads the flag, the search parameter or `import.meta.env` for this decision.

Flipping it alone is **not** an activation: §10 forbids a window where the
editor holds a v2 record while commands assume v1, so the flip lands in one
release with the command-side work listed below.

## Every consumer that follows the gate

| Consumer | What it does when the gate answers yes |
| --- | --- |
| `src/App.tsx` (`showV2RouteEnabled`) | renders `ShowEditorV2Route` for the routed Show instead of the v1 `ShowEditor`, stands the missing-Show guard aside, and leaves the ordinary active-Show open to the v1 path |
| `src/App.tsx` fresh-Show creation | calls `createNewShowV2` instead of `createNewShow`, then routes to the new Show |
| `src/store/showStore.ts` (`loadShows`) | also reads `listShowDocumentsV2` and fills `showV2Rows` |
| `src/components/PatternList.tsx` (import) | parses with `acceptV2: true` and plans a version-2 bundle through `planShowImportV2` / `applyShowImportPlanV2` |
| `src/components/rail/ShowsRailSection.tsx` | lists `userShowsV2` beside the v1 rows and opens one through `onOpenShowV2` |

The Show list, the route and creation therefore switch together by construction.

## What #1039 still owns

1. **The flip itself**, in one release with the rest of this list.
2. **The store's v1 collections.** `shows` stays `ShowRecord[]`: a v2 row is
   listed beside it as a summary row, never inside it. Retyping the 25
   `(showId, …)` v1 mutators, `resolveEditableShow`, the edit session and the
   save queue is #1039's, and it is what makes the Shows rail able to rename,
   duplicate and trash a v2 row - today it offers none of those for one.
3. **The executor and command admission.** `agentPrivateExecutor`,
   `editorAdmission`, `privateAdmissionOwner` and the MCP surfaces are
   untouched by this slice and remain v1-typed. No surface on the v2 route
   registers an agent binding, which is what keeps the mixed window closed
   while the gate is off; switching them is the other half of the release.
4. **The rehearsed row conversion**, per specification §10's runbook, with the
   per-row source hash, outcome and readback.
5. **The reference sweep** (#1043) for the public vocabulary, and the legacy
   owner retirement (#1042).

## Acceptance flows already proved

Proved on the gated route in `e2e/show-editor-v2-route.auth.spec.ts` and the
committed captures in `.wrsp/ui-proof/1056-s6*.png`:

- A fresh Show is authored natively as v2 in the current two-Clip two-sided
  Crossfade shape, and compiles to exactly what a fresh v1 Show compiles to
  (`src/engine/showCreationV2.test.ts`).
- Delete the second Clip, add a replacement at the freed boundary: no ghost
  Transition, the first Clip's timing and Show End unchanged, the boundary a
  plain derived Cut.
- The transport, the playhead and the keyboard seek (`A`, `←`, `→`, `Space`).
- The Show summary, the artifact gauge and inventory, and both artifacts
  reopened through their own importers.
- A `.pxlshow` exported from the route and re-imported through the Show list as
  its own v2 record, with the v1 list still empty.
- The Show list offering a converted row, which opens on the same route.
- Undo, Redo, `Reload saved v2`, and a save failure rolling back with no
  history entry (`src/components/ShowV2ClipTimingCompletion.test.tsx` and the
  other completion suites, now hosted by the editor route).
- Connected move and resize, Replace Pattern, Reset to Cut, Layout spanning,
  animation and Show End through the slice 2-5 specs, all on this route.

Proved elsewhere and unchanged by this slice: the 47-record parity report, the
artifact oracle, `agent:smoke` and the fake-agent corpus, which remain v1 until
#1039.

## What is deliberately absent for a v2 record

- Renaming or duplicating a v2 row from the Shows rail (see 2 above).
- The v1 timeline's zoom, snap and diagnostic toggles, which belong to
  `ShowTimelineWorkspace`.
- Any command, agent or MCP path (see 3 above).
