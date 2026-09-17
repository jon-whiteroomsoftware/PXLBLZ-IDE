# #1039 pre-activation inventory and readiness

Issue #1039, epic #1032. Specification
[`docs/plans/scene-retirement-specification.md`](../../../plans/scene-retirement-specification.md)
at commit `51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`, sections 9-13; proof rows
ROUTE, FAILURE, MCP, DELETE-READD, REPLACE, LAYOUT-END, PARITY. Base local main
`51b36469feac03475e382103e284fad8959658ac`.

This is the readiness record section 10 requires before coordinated activation. It
enumerates every production consumer of the v1 record and flat-cell path, names
the landed v2 owner for each, and states whether that consumer can switch.

**Readiness verdict: not ready.** Twelve of the nineteen consumers below have a
landed v2 owner and can switch on demand. The ordinary Show editor route cannot:
the production editor is v1-only and no v2 replacement for it exists. Because
section 10 forbids a window in which the editor accepts v2 while commands assume v1,
and because the browser command/admission path captures whatever record the
editor route holds, the editor blocks the whole coordinated switch. The
counterexample and its consequences are in
[Blocking counterexample](#blocking-counterexample) below.

## How to read the tables

- **Consumer** - the production module a user reaches without a flag.
- **v1 surface** - what it consumes today.
- **Landed v2 owner** - the module that already implements the same concern on
  `ShowRecordV2`, landed on the base commit.
- **Switch** - `ready` (can move with no new product decision), `blocked`
  (needs something that does not exist), `follows` (mechanical once its named
  blocker clears).

## Persistence and transport

| Consumer | v1 surface | Landed v2 owner | Switch |
| --- | --- | --- | --- |
| D1 row read | `showRecordFromRow` in `src/cloudflare/shows.ts` reads the flat columns; `record_json` short-circuits to the v2 codec | same function - already version-discriminated (#1044) | ready |
| D1 row write | `updateD1Show`/`createD1Show` write flat columns | `replaceD1ShowV2`, `replaceD1ShowV2IfCurrent`, `createD1Show`'s `isShowRecordV2` branch | ready |
| D1 list | `listD1Shows` **skips** every row with `record_json` unless `includeV2` | same function with `includeV2: true` | ready, and **coupled**: after row conversion the v1 list returns nothing, so the list and the editor must switch in the same release |
| Worker routes | `GET/POST /api/shows`, `PATCH /api/shows/:id` are v1 unless `?show-version=2` | the same routes' `show-version=2` branch | ready |
| Remote provider | `listShowDocuments`, `replaceShow` | `listShowDocumentsV2`, `replaceShowV2` in `remotePersonalContentProvider.ts` | ready |
| Provider interface | `PersonalContentProvider` v1 methods required | `listShowDocumentsV2?`/`replaceShowV2?` optional | ready; activation makes the v2 pair required |
| Row migration | none | `rehearseShowV2Migration`/`rollbackShowV2Migration` (`src/engine/showV2Migration.ts`) over `createD1ShowV2MigrationStore` (`src/cloudflare/showV2Migration.ts`), backed by migration `0028`'s `personal_show_v2_migration_backups` and `..._outcomes` tables | ready as an owner; **had no operator entry point** before this candidate |

Storage stays backward compatible either way: the v2 writer keeps the legacy
columns present (`scenes_json`/`cells_json` written as `'[]'`,
`composition_json` as `NULL`) and #1042 owns their retirement.

## Store and editor route

| Consumer | v1 surface | Landed v2 owner | Switch |
| --- | --- | --- | --- |
| Show store - documents | `shows: ShowRecord[]`, `showHistories`, `showSaveFailure`, `loadShows`, `updateShow` | `showV2Pilots`, `showV2Histories`, `showV2SaveFailure`, `openShowV2Pilot`, `updateShowV2Pilot`, `undo/redoShowV2Pilot`, `reloadShowV2Pilot` | follows the editor |
| Show store - ~40 v1 mutators | `addScene`, `placeClip`, `extendCell`, `updateCellPattern`, `updateBoundaryTransition`, ... all `ShowCell`/`ShowScene`-shaped | the #1038 pure owners (`showClipsV2`, `showTimelineV2`, `showGroupsV2`, `showLayersV2`, `showLayoutIntervalsV2`, `showPropertyEditsV2`, ...) plus `showV2PreparedEditAdmission` | follows the editor |
| Fresh Show creation | `createNewShow` -> `createShowWithOutputContract` (v1, two Scenes + Crossfade) | none - no v2 fresh-Show builder exists | blocked |
| **Show editor route** | `ShowEditor.tsx` (11 085 lines, zero `V2` references) plus ~20 v1-shaped satellites: `ShowClipEntityDetail`, `ShowTransitionAuthoring`, `ShowLayerTransitionEditor`, `ShowPropertyAnimationEditor`, `ShowPatternInstanceControls`, `ShowArtifactInventoryPopover`, ... driven by `projectShowTimeline`, `projectShowStrip`, `showRoutingTransitionAfter`, `showBoundaryClipIdentity` | **none.** The v2 surface is 14 form panels totalling 1 400 lines behind `?show-v2-pilot=1` (`ShowV2RoutePilot.tsx`, 243 lines) | **blocked - see below** |
| Stage preview | `ShowStagePreview` default kind over the v1 record | `ShowStagePreview kind="prepared-v2"` over `showPreparedStageV2` | ready; follows the editor because it is rendered from the route's record |

## Commands, admission and MCP

| Consumer | v1 surface | Landed v2 owner | Switch |
| --- | --- | --- | --- |
| Command registry | `SHOW_COMMANDS`/`applyShowCommand` (`src/engine/showCommands/registry.ts`) | `SHOW_COMMANDS_V2`/`applyShowCommandV2`/`runShowCommandV2Transaction` (`src/engine/showCommandsV2/registry.ts`) - #1041 | follows the editor |
| Private executor | `agentPrivateExecutor.ts` applies `applyShowCommand` to a `ShowRecord` capture | none - the executor is typed to `ShowRecord` end to end | follows the editor |
| Editor admission | `src/agent/editorAdmission.ts`: `resolveEditableShow` capture, `captureAgentShowSnapshot`, `validateShowAuthoring`, `schemas/show-record.schema.json` | `showV2PreparedEditAdmission.ts` - but it admits *UI* intents, not agent command candidates | blocked with the editor |
| Private admission owner | `src/agent/privateAdmissionOwner.ts` (34 lines) wraps `applyShowCommand` | none | follows the executor |
| MCP tool surface | `agentMcpRouting` registers `SHOW_COMMANDS` tools and the v1 schema resource | the same function's `catalogue: 'v2'` option registers `SHOW_COMMANDS_V2`, `AGENT_MCP_INSTRUCTIONS_V2` and `SHOW_AUTHORING_V2_SCHEMA_URI` - default off | ready at the tool surface, blocked at the executor it dispatches into |
| MCP `list_commands` | always describes `SHOW_COMMANDS`, **including under `catalogue: 'v2'`** | - | **defect**: under the v2 catalogue an agent is told about v1 commands that match none of the registered tools. Repaired in this candidate. |
| Builtin turn / tools | `builtinTurn.ts`, `builtinTools.ts` use `SHOW_COMMANDS` | none | follows the executor |
| Agent harness | `src/agent-harness/` grammar and bridge bind `SHOW_COMMANDS` | none | follows the executor; `agent:smoke`, `agent:corpus`, `agent:baseline:fixtures` all speak v1 vocabulary |

## Stock, Gallery and artifacts

| Consumer | v1 surface | Landed v2 owner | Switch |
| --- | --- | --- | --- |
| Stock catalogue | `STOCK_SHOWS` in `src/pixelblaze/stock/shows.ts` - 40 entries carrying `.show` (v1) **plus** `collection`/`level`/`order`/`track` metadata | `STOCK_SHOWS_V2` in `showsV2.ts` - 40 records, **records only, no catalogue metadata** | follows the editor; the metadata has to move with it, and `shows.ts` must stay as the pinned parity input (section 2) |
| Gallery facts | `galleryShowFacts` reads `stock.show.zones` and `showLoopDurationMs(stock.show)` | none for facts; `galleryShowChapters` already reads `stockShowV2ById` | partial - chapters are v2 today, facts are v1 |
| Gallery keyframes / Live | stored keyframes and playback run the pinned v1 record | none | follows the stock catalogue |
| Resource census | `showResourceCensus.test.ts` over `STOCK_SHOWS` | none | follows the stock catalogue |
| Export `.pxlshow` | `ShowEditor.tsx:2250` `buildShowFileBundle(activeShow)` writes version 1 | `buildShowFileBundle` already emits version 2 for a `ShowRecordV2` | ready; follows the editor because it exports the route's record |
| Import `.pxlshow` | `PatternList.tsx:281` `parseShowFileBundle(bytes)` with `acceptV2` unset, so a v2 file is refused as `unsupported_version`; `planShowImport` is v1 | `parseShowFileBundle(bytes, { acceptV2: true })`, `planShowImportV2`/`applyShowImportPlanV2` | ready - and this is the one consumer that must keep **both**: section 1 and section 10 require ordinary v1 import to survive through the isolated adapter |
| Export `.epe` | v1 compile path | `buildShowEpeExportV2` | follows the editor |
| Compile / preview | `compileShow` over a v1 recipe | `prepareShowV2ForCompile` + `lowerShowCompositionV2ForCompile`, which lower v2 to the same transient v1 compiler recipe | ready - the compiler is already shared, and section 1 keeps the lowered recipe a transient implementation detail |

## `read_show` returns v2 only

section 10 requires that after activation `read_show` return v2 and that no window
remain where the editor accepts v2 while commands assume v1. On this base the
guarantee holds for a structural reason rather than a defended one:

- `read_show` is a query dispatched through `queryExternalTool` to the browser
  binding, which answers from `createAgentEditorAdmission(...).getShow()`.
- `getShow()` returns `structuredClone(store().resolveEditableShow(showId))`  - 
  the v1 document the editor route holds.
- The v2 pilot route does not register an agent binding at all, so while the
  pilot is open there is no editor for a command to attach to.

So today the editor and the command path are consistently v1, and the pilot is
consistently outside the command path. There is exactly one seam that can create
the forbidden window, and it is the one this candidate must not open: making the
ordinary route hold a `ShowRecordV2` without simultaneously replacing
`agentPrivateExecutor`, `editorAdmission`, `privateAdmissionOwner` and the
store's admission primitives, all of which are typed to `ShowRecord`. That is
why the editor blocks the switch rather than leading it.

## Blocking counterexample

Smallest concrete counterexample for "activate the ordinary editor on v2":

> Open any personal Show on the ordinary route and drag a Clip's trailing edge.
> The production editor resolves that gesture through `projectShowTimeline`,
> `showBoundaryClipIdentity` and the store's `extendCell`/`updateShowCell...`
> mutators, all of which address content by `ShowCell.id` inside a
> `ShowScene`. A `ShowRecordV2` has no `scenes` and no `cells`; its Clips carry
> global `startMs`/`durationMs` on a `ShowLayerV2`. There is no landed component
> that draws a v2 timeline, hit-tests a v2 Clip, or turns a drag into a
> `showClipTemporalV2` intent. The 14 landed v2 panels are typed forms: the
> nearest equivalent is `ShowV2ClipTimingEditor`, a numeric duration field.

Consequences if the switch were forced anyway:

- Replacing `ShowEditor` with `ShowV2RoutePilot` would retire timeline direct
  manipulation, the Clip inspector, the Layout lane, the Show summary, Pattern
  instance controls, the transition palettes, controller send and the artifact
  inventory. That is a product decision about shipped behavior, not an
  implementation detail, and section 1 forbids silently narrowing accepted behavior.
- Keeping `ShowEditor` and feeding it a lowered v1 recipe would let the user
  edit compiler-synthesized Scenes and cells - precisely the "hidden logical-Clip
  segments" and "Scene-local ownership" section 1 removes from normal v2 persistence.

Both are out of scope for this issue as dispatched, and the second is
specification-prohibited. The editor's v2 surface is therefore named as the
blocker, the `?show-v2-pilot=1` gate stays, and the consumers marked *follows
the editor* stay on v1 with it, so no forbidden mixed window is opened.

## What this candidate does deliver

1. This inventory and readiness record.
2. The `list_commands` defect repair, so the prepared v2 catalogue is internally
   consistent: under `catalogue: 'v2'` every command surface - tool list,
   instructions, schema resource and `list_commands` - describes the same
   vocabulary.
3. The section 10 migration runbook as an operator script over the landed owner, with
   readback that reopens and compiles each converted row, plus the rehearsal and
   rollback rehearsal on local D1.

## What remains

| Item | State |
| --- | --- |
| Coordinated application activation (editor, store mutators, fresh Shows, stock readers, executor, admission, production MCP, exports) | blocked on a v2 editor surface; needs Jon's decision on how the ordinary route is rebuilt |
| Proof rows ROUTE, MCP, DELETE-READD, REPLACE, LAYOUT-END through the **production** editor | blocked with the activation |
| Remote row conversion and the deployed-tip transcript | deferred and blocked by the recorded Cloudflare migration authorization failure; no push, deploy or remote migration attempted |
| Legacy column retirement | #1042, explicitly out of scope here |
