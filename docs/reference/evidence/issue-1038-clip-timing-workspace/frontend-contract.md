# #1038 ordinary Clip timing workspace: frontend/admission contract

Approved implementation contract; Transition admission is landed. Canonical specification §§4–9/12 at `31d428c9f9cdb8f14db3182cc21c81356996cc7c`; inspected landed main `7523b46376ce9b042516377613b28ff065f3ea1a`. Implementation base is coordinator-pinned landed `ef0240ca6ed905cb3c90b4c181a7363615d5fd05`. This contract composes the already-landed owners; no kernel/compiler/schema or production-v1 cutover changes.

## Layout mockup

Reuse current opt-in pilot grid, zinc surfaces, existing type hierarchy/live focus color and compact fields/buttons. No new palette, cards, badges or explanatory prose. Stage keeps its existing renderer/transport.

```text
Desktop (existing two columns)
┌──────────────────────────────┬─────────────────────────────────────┐
│ Existing Show/Transition     │ Existing prepared Stage + transport │
│                              │                                     │
│ Clips                [Add]   ├─────────────────────────────────────┤
│ Selected Pattern             │ Timeline                 0 … 30 s   │
│ Start [10000] ms             │ Zone / named Layer                  │
│                              │ [ Pattern ▬▬ ]   [ Pattern ▬▬ ]    │
│ Bounds                       │ Group-name ░░░ (occupancy only)      │
│ Start [10000] End [20000] ms  │ Next named Layer                    │
│ [Trim] [Extend]              │ [ Pattern ▬▬▬▬▬ ]                   │
│ Split at [15000] ms [Split]  │                                     │
│                              │                                     │
│ Insert Time                  │                                     │
│ At [7500] Duration [1000] ms │                                     │
│ [Insert Time]                │                                     │
│ Show End [30000] ms          │                                     │
│                              │                                     │
│ Existing Markers/history/    │                                     │
│ reload/artifacts/status      │                                     │
└──────────────────────────────┴─────────────────────────────────────┘

Add expanded in the left column (one local form, not a modal):
Pattern [existing PatternCombobox]
Zone [existing select]  Layer [existing select]
Runtime [existing runtime ID / First runtime]
Start [0] ms  Duration [1000] ms     [Add Clip] [Cancel]

Narrow: existing vertical route layout; same timing column, then Stage,
then timeline rows. Each column scrolls as existing layout permits;
fields stack, action buttons wrap. Timeline fits available width;
no fixed desktop width/horizontal document scroll.
```

Timeline rows are a native presentation of persisted Zone/Layer IDs/rank and ordinary Clips. Bars are semantic buttons: click/Enter/Space selects one ordinary Clip, `aria-pressed` names selection. Labels use trusted Pattern names; accessible names include Zone/Layer/start/end to distinguish repeated voices. Effective held Group occupancy is muted noninteractive content with the Group name and an accessible occupancy description; no transient child becomes an ordinary selected Clip. No pointer gestures, custom keyboard shortcuts, solo/guides or inoperative controls. Timeline ticks are presentation only; exact owner milliseconds govern edits. Stage playback does not move authored data.

## Interaction and text admission

Use `NumberField` editor variant/step1/suffix `ms`, matching current Marker/Transition controls. Do not add clamping/rounding that makes an invalid requested time look accepted: pure owners enforce safe integers/intervals/Show End. Drafts do not rebuild Stage or save per keystroke. Existing Enter/apply commits and Escape/blur cancellation remain.

- Selected **Start** commits typed move, retaining Clip duration and owner-defined component cascade.
- **Bounds** are local start/end drafts. Explicit **Trim** or **Extend** commits both together; trim must be contained, extend must contain the current interval. A mixed inward/outward request refuses, not a hidden multi-operation rewrite. Refusal restores the current record's bounds.
- **Split at** is a local draft; Split submits one interior-time intent/fresh right identity. Select the new right Clip only after own-current saved receipt; external/superseded completion cannot change selection. Undo/reload preserves selected persisted ID if it still exists, otherwise selects the first ordinary Clip in deterministic start/ID order. Selection alone writes no history.
- **Add** opens local fields. Pattern choice comes from trusted immutable stock catalogue plus captured personal Pattern assets. Zone/Layer are explicit existing destinations. Changing Zone resets an invalid Layer choice. A sole matching effective runtime is selected; several matches require an explicit runtime ID; no match uses explicit first-runtime setup (source/name from trusted resolver, timeScale1/offset0 and empty authored control overrides). This is not an independence operation. Initial appearance is the existing neutral complete value; continue entry and existing sampling default are explicit in the pure intent. Add Clip commits once; Cancel writes nothing. Only own-current saved creation selects its new Clip.
- **Insert Time** submits its two local drafts once. **Show End** commits one exact value through the existing Layout owner. Neither derives timing from Scene offsets. Existing carrier/Transition/availability/range refusals remain honest; no guessed Reset projection plan.
- Pending controls disable only the current timing operation. Own saved/rollback feedback uses the existing status output and receipt-aware draft recovery; obsolete external/provider/route/dependency completion is silent. No second status panel/save queue.

Only headings/field labels/action names/content names and actual existing refusal/saved state are admitted. No subtitle/tutorial/read-only badge. Group name plus noninteractive occupancy styling supplies the consequential editable-versus-projected distinction. Runtime IDs appear only in the runtime choice where authors must distinguish shared state.

## Typed admission/capability shape

Reuse exact `ShowV2PilotPreparedEditContext`/capture/adoption receipt from the frozen checked core; preserve public Marker and resize APIs. New public wrappers accept only these explicit intents (private dispatch stays closed):

```ts
type CreateRequest = Context & { intent: CreateShowClipIntentV2 }
type TemporalRequest = Context & {
  intent: Extract<ShowClipEditIntentV2,
    { kind: 'move' | 'trim' | 'extend' | 'split' }>
}
type InsertRequest = Context & { intent: ShowInsertTimeIntentV2 }
type EndRequest = Context & {
  intent: Extract<ShowLayoutEditIntentV2, { kind: 'set-show-end' }>
}
// admitShowV2PilotCreateClip / admitShowV2PilotClipTemporal
// admitShowV2PilotInsertTime / admitShowV2PilotSetShowEnd
```

Each outcome is applied(saved|superseded), unchanged or typed owner/admission refusal, with that existing owner's affected collections preserved (not a persistence receipt). Refused/no-op effects are empty. No arbitrary candidate/transform callback. Exact validation→candidate preparation once→final synchronous revision/provider/route/dependency check→one existing adoption/history/save. Compile eligibility uses the parent's frozen semantic assets/stable map/profile; no second current compile, direct lowering or asynchronous identity reread.

| Operation | Current admitted capability | Required changed capability |
| --- | --- | --- |
| Typed Create | ready or explicitly structurally validated empty | ready only; empty→ready is the sole new cross-capability path |
| Temporal | ready, selected persisted ordinary Clip exists | ready; empty/missing ordinary Clip refuses |
| Insert Time / Set Show End | ready or explicitly structurally validated empty | same ready/empty capability |
| Existing Marker / resize | unchanged existing partitions | unchanged existing discipline |

Refused nonempty capture is never a generic fallback. Empty creation still needs trusted map/output/source preparation; missing map/source may refuse until resolved. No placeholder runtime. `Context` is not replaced by a caller-selected dimension/asset map.

Fresh IDs use the existing adapter allocator `newPersonalContentId` (`personalContentMetadata.ts5`, already used by ShowEditor/Show store). Reserve/check complete effective/persisted owner IDs, definition-qualified defaults and the current operation's allocations. Creation supplies fresh Clip/start-key and, only for first setup, instance IDs; Split supplies a fresh effective right Clip ID. Collision/invalid allocation refuses atomically; no silent reuse, new deterministic naming policy or allocation inside a pure owner. Tests inject collisions through the existing allocator interface.

## Ownership and exact supported proof

New native row/timing presenter and pure presentation/draft-intent model, closed checked wrappers, pilot wiring, own tests/contracts/evidence. Pure create/Clip/Transition/Group/time/Layout owners, schema/compiler/provider/history and frozen trees untouched. Whole-Clip appearance/Replace/independence, Layer CRUD, Group lifecycle/isolation/create, Property CRUD and pointer manipulation are later named adoption work.

Consumer partitions: explicit empty→Create→ready and ready→Create, zero/one/multiple effective source matches (including authoritative Group runtime), missing source/map/provider and collision refusal; connected ordinary move and both bounded resize directions; exact nonlinear/pre-roll/outgoing Split and right selection; shared tracks fixed on Clip edits/mapped once on Insert; Group occupancy/held-time read-only; inserted curve/key/hold boundaries and forbidden visual/transfer windows; valid growth/protected shortening/empty Show End; all malformed/unsafe/no-op inputs; stale revision/Undo/reload/provider/Pattern/Map/Library/profile/route; own recapture and current rollback versus external supersession.

One authenticated30–60-second workflow creates/selects/edits/splits/inserts/sets end, asserts one history/PUT each, Undo/Redo/provider reload and reopened exact native .pxlshow/.epe/Fast+Precise choreography. No-op/refusal/cancel/selection writes zero. Fresh committed desktop/narrow (plus intermediate resize check) keyboard/overflow/console proof on managed issue runtime, IAB-first with honest fallback provenance; root owns final suites/review/landing.

No new product decision is required by these partitions. Pending Group-create remains pending and excluded. Reset projection requiring explicit caller metadata stays an existing typed refusal without a projection-plan UI; source/runtime and capability admission are the real supported premises, not mock-only success.
