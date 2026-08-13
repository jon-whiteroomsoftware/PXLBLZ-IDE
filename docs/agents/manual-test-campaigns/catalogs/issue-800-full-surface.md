# Full-surface campaign goal catalog (#800)

This is the non-Show catalog used by the second manual test campaign on
2026-08-10. Its preserved heading and summary call it a 150-goal catalog; the
source comment enumerates 148 IDs. Keep that historical discrepancy visible
until a new campaign deliberately adds or recovers the two goals.

Flags: D=destructive, HW=bench hardware, S=special setup,
X=expected-WALLED probe, !=aimed at a pre-identified oddity. An exclamation
mark directs attention; it does not predetermine the verdict.

The original documentation oracle was Feature Guide Parts 1, 2, and 3. Testers
act as users; API setup is allowed for prerequisites only.

## GA. Gallery and Pattern detail (12)

- GA1 Browse the Gallery signed-out; filter by dimension chips; results match badges. Section 1.
- GA2 Filter by a directory via the select; URL becomes `/gallery/<slug>`; shareable (reload keeps it). Section 1.
- GA3 ! Set dimension filter + search text, copy URL, open in new context: which filter state survives? Directory is in the URL; lens and search are not. Record as observation/DRIFT per docs claims. Section 1.
- GA4 Search Patterns by name; clear with X. Section 1.
- GA5 Open a card -> `/p/<slug>`; Gallery back control returns to the same card (scroll/highlight). Section 1.
- GA6 Unknown `/gallery/<slug>` and `/p/<slug>` fail gracefully. Section 1.
- GA7 On Pattern detail: View code shows read-only source; toggle back to preview. Section 1.
- GA8 Run/Pause preview on detail page; Reset appears only after changing a control. Section 1.
- GA9 Detail page Pattern controls (slider/color) affect the live preview. Sections 1, 5.
- GA10 Open in Studio from detail: signed-out lands on the welcome gate; signed-in opens the demo in Studio. Sections 1, 2.
- GA11 Historical launch-gate check: the "Studio opens soon / invite-only"
  banner tested by this campaign was retired for release 1.9 in #825.
- GA12 3D Pattern detail: orbit drag, zoom slider, Reset view. Section 5.

## PL. Pattern lifecycle and rail (16)

- PL1 Create a new Pattern (authenticated); it appears in rail and editor opens. Section 2.
- PL2 Rename from the editor header inline title; survives reload. Section 2.
- PL3 Rename from the rail row menu; survives reload. Section 2.
- PL4 Create folder; move Pattern in via Move to...; reorder; drag-and-drop a row into a folder. Section 2.
- PL5 Move to Trash (soft); Restore from Trash. Section 2. D.
- PL6 Move to Trash then Empty Trash; gone after reload. Section 2. D.
- PL7 ! Header "Delete pattern" (hard) vs rail "Move to Trash": delete a Pattern via the header dialog; confirm it does not pass through Trash. Record the two-concepts UX. Section 2.
- PL8 Import a `.epe` (use one exported in this campaign or export first); Pattern opens; notice behavior on missing preferred map. Section 8.
- PL9 Export `.epe` from the actions menu; file non-empty (driver downloads command). Section 8.
- PL10 Copy code (actions menu); clipboard/eval check; disabled when compile broken. Section 8.
- PL11 Clone a built-in demo into Patterns; snapshot keeps current control settings. Section 2.
- PL12 Built-in Patterns tree: browse sections; Test Patterns present in rail but absent from Gallery. Sections 1, 2.
- PL13 ! Frozen lens: set dimension filter to 1D, switch to Maps rail, return to Patterns, set filter to All - do 2D/3D built-ins render? Section 2.
- PL14 Rail search: type, click a result (it must select despite blur-clears-query), clear. Section 2.
- PL15 Signed-out (S: no-session driver): Gallery + docs public; `/studio` gated to welcome page; no personal tree. Sections 1, 2.
- PL16 Last-active Pattern restores on reload at `/studio/patterns`. Section 2.

## ED. Editor and value fields (14)

- ED1 Type invalid code: compile badge goes red with marker; preview keeps last good frame. Section 4.
- ED2 Fix the code: badge green; preview updates within about a second. Sections 4, 5.
- ED3 Autosave: make a clean edit, wait 5s, reload - edit survived. Section 4.
- ED4 ! Broken-source persistence: make a breaking edit, wait 5s, reload - what survived? Autosave skips broken source; record actual behavior and any user signal. Section 4.
- ED5 Completion: typing a built-in function offers snippet completion with params. Section 4.
- ED6 Hover docs on a built-in function; signature help on `(`. Section 4.
- ED7 Library hover: `NS.fn(...)` from a stock Library shows its doc. Sections 4, 7.
- ED8 Demo Patterns are read-only: no edits stick, no compile badge, lock glyph shown. Section 2.
- ED9 Value field (use a Controller/inspector or PixelCountPopover): exact entry commits on Enter, Escape reverts. Section 4.
- ED10 Value field grip: press-drag previews and commits; click pins the slider dialog. Section 4.
- ED11 Shift-drag fine adjust stays fine for the gesture. Section 4.
- ED12 Empty/duplicate Pattern rename rejected with visible error. Section 2.
- ED13 Undo (Cmd+Z) in Monaco works; find widget opens (Cmd+F). Section 4.
- ED14 ! Actions menu on a Test Pattern demo while signed out (S): does the menu open empty? Section 2.

## PV. Preview deck (16)

- PV1 Run/Pause from deck; Space toggles except when typing in editor. Section 5.
- PV2 Speed selector changes animation rate (0.1x vs 4x observable). Section 5.
- PV3 Renderer Fast to Precise swap; Pattern keeps running; note FPS change. Sections 5, 20.
- PV4 Brightness slider dims preview. Section 5.
- PV5 Light size + diffusion sliders visibly change rendering. Section 5.
- PV6 Map select: switch between recommended and other-dimension maps; render adapts; adaptation status strip appears on dimension mismatch. Sections 5, 6.
- PV7 Coordinate view select on a multi-view family (Cylinder): Strand/Surface/Spatial. Section 6.
- PV8 Fit Contain vs Fill on a 2D map. Section 6.
- PV9 Pixel count popover: exact value, quick resolution steps, Apply; locked chip on fixed-count map. Section 5.
- PV10 Embedding select (1D Shape / 2D Display) changes viewport shape. Section 6.
- PV11 Interior opacity only on solid-eligible embeddings (sphere/cylinder); verify present there and absent on flat. Section 6.
- PV12 3D map: orbit, zoom, auto-orbit pause/resume, reset; pole density slider only on pole Shape. Section 5.
- PV13 Pattern controls: slider, toggle, color picker each affect the running Pattern; help hint only on curated built-ins. Section 5.
- PV14 Var watcher: expand, values tick while running; absent when Pattern exports none. Section 5.
- PV15 Reset preview appears only with active overrides and clears them. Section 5.
- PV16 Per-Pattern settings cascade: change map + pixel count on Pattern A, switch to B and back - A keeps its choices after reload. Sections 2, 5.

## LM. Libraries and Mixins (14)

- LM1 Create a Library; auto-name Lib1; skeleton compiles. Section 7.
- LM2 Rename Library (namespace rules enforced; invalid rejected). Section 7.
- LM3 Use the Library from a Pattern: call `Lib1.fn(...)`; completion/hover know it. Section 7.
- LM4 Library context pane lists functions with inline badges and facts. Section 7.
- LM5 Clone a stock Library; edit the clone. Section 7.
- LM6 Stock Libraries read-only (badge, no edits). Section 7.
- LM7 Delete a Library via rail trash; a Pattern calling it now errors (record behavior). Section 7. D.
- LM8 Create a Mixin; kind pill bind; header parse errors surface. Section 7.
- LM9 ! Mixin provenance pane on stock pot-binding: does the Header block render prose garbage for `@target`/`@wraps`? (#782 evidence). Section 7.
- LM10 ! Mixin "Used by": bind a Mixin (via Controller input binding if feasible) and check whether Used-by ever changes from the empty message. Section 7.
- LM11 Clone a stock Mixin; delete own Mixin with confirm. Section 7. D.
- LM12 Transform inspection panel: after a profile-enabled push shows pass tree + View generated artifact dialog (pair with HW batch if needed). Section 7. HW?.
- LM13 Mixin rename + kind display for intercept/inject stock Mixins. Section 7.
- LM14 API Reference: `/reference/<lib>` public; My Libraries group appears only when entered from Studio with personal Libraries. Sections 3, 7.

## DC. Docs, API, and accounts (10)

- DC1 Docs button from Studio; Back button returns to origin (Studio vs Gallery). Section 3.
- DC2 Docs deep link `/docs/<id>` signed-out renders reader. Section 3.
- DC3 ! `/docs` with no id: reader shows primer but URL stays `/docs`; reload + aria-current behavior. Section 3.
- DC4 In-doc links navigate within docs; images render. Section 3.
- DC5 API Reference catalog: built-in + provided Libraries; two-column layout with room. Section 3.
- DC6 Unknown doc/reference IDs fail gracefully. Section 3.
- DC7 Account menu: Privacy & account data link; Log out works (S: dedicated driver, end of batch). Section 2. D.
- DC8 Welcome gate: Back to Gallery; sign-in buttons present; acknowledged flag skips gate next time. Section 2.
- DC9 Auth-failure banner: visit with `?auth=<bogus-code>` param; banner + dismiss; param stripped. Section 2. S.
- DC10 Keyboard Shortcuts doc exists and matches at least 3 tested shortcuts. Sections 3, 4.

## MP. Map authoring (18)

- MP1 Create a new map; skeleton opens; record persists immediately. Section 6.
- MP2 Edit map source to a simple 2D grid; within about 5s it bakes; context pane shows points + facts. Section 6.
- MP3 ! Bake-loss window: edit source and navigate away within 2s; return - is the bake stale vs source? Any indicator? Section 6.
- MP4 Introduce an eval error: "Holding last good bake" banner + inline error; source still saved. Section 6.
- MP5 Parse error: red badge, no bake attempt. Section 6.
- MP6 Map rename from header and rail; survives reload. Section 6.
- MP7 Map folders + Move to... + trash restore. Section 6. D.
- MP8 Empty Trash deletes map records. Section 6. D.
- MP9 Delete map via header confirm; route falls back. Section 6. D.
- MP10 Stock maps: browse families; per-view buttons (Strand/Surface/Spatial) open correct views; read-only title. Section 6.
- MP11 Clone a stock map; clone is editable, baked at current pixel count. Section 6.
- MP12 2D context viewport: wire-order coloring + index labels; overlaps fact counts duplicates. Section 6.
- MP13 3D context viewport: orbit + zoom; camera remembered per map. Section 6.
- MP14 ! Map "Used by": Pattern using the map lists it; Controller line admits it cannot record identity (stub text) - record exact text. Section 6.
- MP15 New unbaked map absent from Preview Map select until baked. Sections 5, 6.
- MP16 `gridDims` detection: 16x16 grid map shows layout readout in deck telemetry. Sections 5, 6.
- MP17 Dimension inference: author 1D, 2D, 3D maps; dimension pills/badges and lens filtering agree. Section 6.
- MP18 ! No map export: confirm there is no download/copy path for a map (expected WALLED; record). Section 6. X.

## CP. Controller profile page (16)

Profile seeded via API unless noted.

- CP1 Profile page loads from rail; status band shows Offline, IP, pixels from stored metadata. Sections 9, 10.
- CP2 ! Rail row menu on a profile: is Rename present? Half-wired: expect absent; header title also not renamable - record. Section 10.
- CP3 ! No "New controller profile" path anywhere (rail menu offers only folder) - expected WALLED; record where a user would look. Section 10. X.
- CP4 Profile folders/reorder/trash with Controllers. Section 10. D.
- CP5 Power: choose LED construction preset; supply budget + unit + voltage interplay (other unit disabled without voltage). Section 10.
- CP6 Power: duty cap direct mode editable %; enforce switch on/off; ! field stays editable while enforcement off (only dimmed) - record. Section 10.
- CP7 Power: derived cap mode requires load + budget; toggle disabled with no tooltip when underivable - record UX. Section 10.
- CP8 Power: override load flow; "Use estimate" disabled when preset is custom - record. Section 10.
- CP9 Add input; name it; adjust pin/signal/smoothing/fallback/invert; remove input (no confirm - record). Section 10.
- CP10 Input brightness switch arms hardware-brightness; Use-for-brightness button appears per state. Section 10.
- CP11 Use for one Pattern offline: select disabled with explanatory placeholder. Section 10.
- CP12 Binding editor offline: Pattern select disabled; target kinds switchable; variable min/max/quantize fields. Section 10.
- CP13 Keep-up-to-date switch toggles and persists. Section 11.
- CP14 Saved Patterns pane offline: empty state + Connect button opens the header dropdown. Section 11.
- CP15 Zones: ! no zone editing surface on the profile page (#775) - expected WALLED; profile zones still seed Shows (verified last campaign). Record page text. Section 10. X.
- CP16 Refresh + Import map disabled offline with tooltips. Section 10.

## CS. Controller live and saved Patterns (12)

All goals require hardware.

- CS1 Connect via discovery entry; pill appears with live phase; panel opens. Section 9.
- CS2 Direct IP connect path (`192.168.8.224` in the original campaign). Section 9.
- CS3 Live panel: brightness slider (volatile), FPS, IP, installed map row, variables list. Sections 9, 10.
- CS4 Renderer transport pause/play on Controller. Section 9.
- CS5 Pixel count: read current value; do not change Controller pixel count - verify the popover exists and cancel. Section 10.
- CS6 Run an ordinary Pattern to the Controller; feedback; already-pushed suppression on second Run. Section 11.
- CS7 Save a Pattern; appears in Saved PXLBLZ Patterns as CURRENT; edit Pattern -> PUSH AGAIN. Section 11.
- CS8 Saved list: sort by name/id/status; source links navigate back. Section 11.
- CS9 Import an Other Pattern from Controller. Choose a pre-existing Pattern not created by this campaign only if it can be imported without altering the Controller; otherwise use one the campaign saved. Section 11.
- CS10 Refresh saved Patterns; disabled while offline/loading. Section 11.
- CS11 Profile auto-creation/refresh on live connect: metadata (Controller name, firmware, pixel count) fills in; Refresh updates. Section 10.
- CS12 Map fingerprint: after map push (MC2; the source comment called this
  "CS13 in MC") the profile Map row matches; mismatch chip when preview count
  differs. Sections 6, 10.

## MC. Map push and import (6)

All goals require hardware.

- MC1 Send a baked custom 2D map to the Controller; preflight always confirms; Push map + count checkboxes when count differs. Sections 6, 10.
- MC2 After push: Controller map row updates; fingerprint recorded (see CS12). Section 6.
- MC3 Unchanged map: send disabled "No changes since the last send". Section 6.
- MC4 Unbaked map: send disabled "Bake the map before sending". Section 6.
- MC5 Import map from Controller: match path opens matching Studio map; or new-import dialog with name + facts; imported record read-only frozen source - record. Sections 6, 10.
- MC6 ! Import-map caveat only on non-match path; no authoring-source recovery - record exact dialogs. Section 6.

## DS. Discovery and Extension (6)

Run with the hardware batch.

- DS1 Extension-absent pitch (S: driver without Extension): Install + I've-installed-it reprobe. Section 9.
- DS2 Discovery list shows the bench Controller with metadata; Rescan spins. Section 9.
- DS3 ! Silent discovery failure: with Extension but network blocked (offline command), list shows the no-Controllers empty state blaming Controllers - record. Section 9. S.
- DS4 Per-host authorization: pending phase shows "Authorize this Controller in the helper" hint. Section 9. Observe only if the grant is not already present.
- DS5 Duplicate suppression: connected Controller does not double-list in discovery. Section 9.
- DS6 Disconnect from panel; pill/state clean up. Section 9.

## PR. Persistence and resilience (8)

- PR1 Controller profile edit rolls back on failed PATCH (offline command); silent? H4 analog for Controllers. S.
- PR2 Map source edit offline: behavior + recovery. S.
- PR3 Two tabs, same Pattern: last-writer-wins analog. S.
- PR4 localStorage/sessionStorage audit: only prefs, no personal content. S(eval).
- PR5 Pattern settings cascade payload: `/api/patterns` PATCH carries settings on preview changes. S(apilog).
- PR6 Rapid edits to Pattern source: PATCH cadence (autosave tick about 4s vs per-edit). S(apilog).
- PR7 Beta-access middleware: API returns 401 for unauthenticated writes (curl-style eval fetch without cookie? skip if driver-bound - optional).
- PR8 Rail organization (folders/order) persists via settings endpoints; survives reload. Section 2.

Preserved source summary: Total 150. Wave plan: (GA, PL) -> (ED, PV) ->
(LM, DC) -> (MP, PR) -> (CP + MP remainder) -> hardware solo (CS, MC, DS)
-> verification.
