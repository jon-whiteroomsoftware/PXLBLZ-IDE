# #1039 pre-activation inventory and readiness

Issue #1039, epic #1032. Specification
[`docs/plans/scene-retirement-specification.md`](../../../plans/scene-retirement-specification.md)
at commit `51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`, sections 9-13; proof rows
ROUTE, FAILURE, MCP, DELETE-READD, REPLACE, LAYOUT-END, PARITY. First recorded
against local main `51b36469feac03475e382103e284fad8959658ac`; revised against
`c13ea6d19756de0c06d66d61b418a286b48dc04b`, after #1056 landed the v2 editor.

This is the readiness record section 10 requires before coordinated activation. It
enumerates every production consumer of the v1 record and flat-cell path, names
the landed v2 owner for each, and states whether that consumer can switch.

**Readiness verdict: not ready, and the blocker has moved.** #1056 rebuilt the
ordinary Show editor route on `ShowRecordV2` behind one version gate, so the
editor is no longer what blocks the switch; see
[What #1056 changed](#what-1056-changed) below for the rows this revision
supersedes. The blocker is now the command side: `agentPrivateExecutor`,
`editorAdmission`, `privateAdmissionOwner` and the store's candidate-delivery
admission are typed to `ShowRecord` end to end. Section 10 forbids a window in
which the editor accepts v2 while commands assume v1, and section 1 forbids
silently narrowing accepted behavior, so the gate cannot be flipped until those
four move together with it. The counterexample is in
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
| Row migration | none | `rehearseShowV2Migration`/`rollbackShowV2Migration` (`src/engine/showV2Migration.ts`) over `createD1ShowV2MigrationStore` (`src/cloudflare/showV2Migration.ts`), backed by migration `0028`'s `personal_show_v2_migration_backups` and `..._outcomes` tables | **was not ready.** The owner had no operator entry point, could not convert a flat v1 row (no source lookup was passed to the converter), and stopped at a byte-for-byte readback rather than reopening and compiling. All three are repaired in this candidate and rehearsed; see [rehearsal.md](rehearsal.md). |

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
- `ShowEditorV2Route` registers no agent binding at all, so while it is open
  there is no editor for a command to attach to.

So today the v1 editor and the command path are consistently v1, and the v2
route is consistently outside the command path. There is exactly one seam that
can create the forbidden window, and it is the one neither candidate opens:
making the ordinary route hold a `ShowRecordV2` without simultaneously replacing
`agentPrivateExecutor`, `editorAdmission`, `privateAdmissionOwner` and the
store's admission primitives, all of which are typed to `ShowRecord`. That is
why the command side blocks the switch.

An agent binding must therefore be registered on the v2 route in the same
commit that switches the executor, and never before.

## What #1056 changed

#1056 rebuilt the ordinary Show editor route on `ShowRecordV2` behind
`SHOW_V2_ROUTE_DEFAULT` in
[`showV2RouteGate.ts`](../../../../src/engine/showV2RouteGate.ts), and retired
`ShowV2RoutePilot` and its `?show-v2-pilot=1` gate. The as-built surface is
[`show-editor-v2.md`](../../contracts/show-editor-v2.md); what it leaves for
this issue is
[its activation handoff](../issue-1056-editor-v2-s6/activation-handoff.md).

These rows of the tables above are superseded:

| Row | Was | Now |
| --- | --- | --- |
| Show editor route | `blocked` - no v2 editor existed | `ready` - `ShowEditorV2Route` draws, edits, previews and exports a v2 record behind the gate |
| Fresh Show creation | `blocked` - no v2 fresh-Show builder | `ready` - `createShowV2WithOutputContract`, in the current two-Clip two-sided Crossfade shape |
| Show store - documents | `follows the editor` | `ready` for the route's own documents; the v1 collections stay v1-typed and a v2 row is listed beside them |
| Stage preview, exports, import, compile/preview | `follows the editor` | `ready`, and wired on the gated route today |

Two capability gaps the handoff named are closed by this candidate: a stored v2
row is now renamed, duplicated and trashed from the Shows rail like a v1 row,
and the v2 Send-to-Controller row releases a successful push result. One
remains open and is named under [What remains](#what-remains): the v1 timeline's
zoom, snap and diagnostic toggles.

## Blocking counterexample

Smallest concrete counterexample for "flip `SHOW_V2_ROUTE_DEFAULT` now":

> Open any personal Show on the ordinary route with the gate on, then ask the
> agent to rename it. `read_show` is answered from
> `createAgentEditorAdmission(...).getShow()`, which returns
> `store().resolveEditableShow(showId)` - a `ShowRecord` looked up in the
> v1 `shows` collection. A converted Show is not in that collection, so the
> agent is handed `undefined` for a Show the user has open and can see. Give the
> executor the v2 record instead and the next step fails harder:
> `applyShowCommand` addresses `ShowScene` and `ShowCell`, and the commit path
> validates the candidate against `schemas/show-record.schema.json` and
> `validateShowAuthoring`, neither of which describes a `ShowRecordV2`.

So the gate cannot be flipped alone. Four owners have to move with it, and none
of them is a rename of a type:

- `agentPrivateExecutor` folds `applyShowCommand` over a private `ShowRecord`;
  its v2 counterpart is `applyShowCommandV2`, whose outcome shape
  (`status`/`record`/`changes`/`issues`) differs from v1's `ok`/`record`.
- `editorAdmission` validates through the v1 JSON schema,
  `captureShowAuthoringBaseline`, `validateShowAuthoring` and
  `captureAgentShowSnapshot`, and resolves its stage dimension and metadata the
  v1 way.
- `privateAdmissionOwner` wraps `applyShowCommand`.
- The store's `deliverShowEditCandidate` / `admitShowEdit` path normalizes and
  reconciles a `ShowRecord` (`normalizeShowRecord`,
  `forfeitShowExecutionModelOnCastChange`,
  `reconcileShowExecutionModelOnCastReturn`) and adopts it through
  `adoptPersonalShowReplacement`. The v2 route's own edits go through a
  different owner - `showV2PreparedEditAdmission`, which admits typed UI intents
  rather than caller-supplied candidates - so there is no v2 candidate-delivery
  admission for an agent command sequence to adopt through.

Forcing the flip without them has exactly two outcomes, and section 1 and
section 10 forbid both: agent editing of Shows silently disappears for every
converted Show, or the command path keeps a v1 record while the editor holds a
v2 one. The gate therefore stays off in this candidate, every consumer stays
consistent with it, and no forbidden mixed window is opened.

## What the candidates have delivered

The first candidate:

1. This inventory and readiness record.
2. The `list_commands` defect repair, so the prepared v2 catalogue is internally
   consistent: under `catalogue: 'v2'` every command surface - tool list,
   instructions, schema resource and `list_commands` - describes the same
   vocabulary.
3. The section 10 migration runbook completed and made operable: the two gaps
   the first real rehearsal exposed (flat rows could not convert; readback
   proved storage but not usability), an operator command over the landed
   owner, and the local rehearsal with its interruption, resume, idempotent
   repeat and rollback.

The second candidate, on the rebuilt editor route:

4. The two carried pre-flip capability gaps closed - the released Controller
   push result, and a stored v2 row that renames, duplicates and trashes from
   the Shows rail with the organization reconciled against both collections.
5. The three carried operator-plumbing correctives on the conversion command -
   a working `npm run` entry point, `--stop-after` interrupting only after an
   outcome is durable, and the Stage dimension resolved from the record.
6. The whole runbook re-rehearsed on this base through the repaired command,
   with rollback and a reconversion of the restored copy. See
   [rehearsal.md](rehearsal.md).

## What remains

| Item | State |
| --- | --- |
| The command side: `agentPrivateExecutor`, `editorAdmission`, `privateAdmissionOwner`, the store's candidate-delivery admission, the builtin turn/tools, the production MCP catalogue and the agent-harness vocabulary | **the blocker.** All v1-typed; the counterexample is above. This is the work that has to land with the flip |
| Flipping `SHOW_V2_ROUTE_DEFAULT`, and the consumers that follow it | blocked on the row above; the gate stays off, so every consumer stays consistent |
| The v1 timeline's zoom, snap and diagnostic toggles on the v2 surface | open pre-flip parity work under section 1; the v2 surface is fit-to-width by construction, so zoom means giving it a viewport |
| Proof rows ROUTE, MCP, DELETE-READD, REPLACE, LAYOUT-END through the **production** editor and production MCP | blocked with the activation; gated-route equivalents are #1056's, prepared-path equivalents are #1044's and #1041's |
| Remote row conversion and the deployed-tip transcript | deferred and blocked by the recorded Cloudflare migration authorization failure; no push, deploy or remote migration attempted |
| Legacy column retirement | #1042, explicitly out of scope here |
