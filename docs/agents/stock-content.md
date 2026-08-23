# Stock content and catalogue changes

Adding or reordering stock Patterns, Shows, and toolkit variants fans out through
a fixed chain of census and qualification suites. The failures arrive one at a
time over roughly twenty minutes if you discover them by running the suite
repeatedly, so work the chain deliberately instead.

The governing rule throughout: **measure, never guess**. Re-pinning a census
without understanding what moved turns a real capacity finding into paper.

## Gallery keyframes

Every public Gallery Pattern and Gallery Show (`galleryShows.ts`, #894) ships a stored keyframe (#888) in
`src/pixelblaze/stock/keyframes/<Name>.json.gz`, keyed by its compiled code,
thumbnail map, seed, and format version. After adding, editing, retiring, or
re-tuning the recommended settings of a stock Pattern — or changing the engine
in a way that alters compiled output — run:

```bash
npm run gallery:keyframes            # all public Gallery Patterns (~30 s)
npm run gallery:keyframes -- Name    # one Pattern
```

`src/pixelblaze/stock/galleryKeyframes.test.ts` fails when any public Pattern
or Gallery Show is missing a keyframe or its key is stale (Show artifacts are
named `show--<id>.json.gz`; pass the Show id to regenerate one). To hand-pick a poster moment, add
the Pattern to `src/pixelblaze/stock/keyframeOverrides.ts` and re-run.

## Adding a stock demo Pattern

Stock demos are built in themed cohorts of three, one per dimensionality
(1D/2D/3D). Jon greenlights a cohort without naming one, so the theme is the
agent's call; each cohort should contrast technically with the previous one.
Shipped themes have included per-pixel field evaluation, living simulations,
emergent collectives, and clockwork mechanics.

A new demo needs all five of these. Missing any one fails `npm test`:

1. `src/pixelblaze/stock/patterns/<Name>.js` in the Pixelblaze dialect. Respect
   the fixed-point authoring traps in
   [`Optimizing Pixelblaze patterns.md`](../guides/Optimizing%20Pixelblaze%20patterns.md)
   — the `fx` identifier shadow and the ±32767 constant limit — along with the
   device array rules. Keep 16.16 magnitudes under 32768 in hash constants and
   wrap accumulating clocks with `mod`.
2. A parseable **manifest** in that source file. `patterns.test.ts` requires one
   for every stock Pattern, with a name matching the file, a `runsOn` that
   includes the Pattern's native dimensionality, and documented controls.
3. A `RECOMMENDED_SETTINGS` entry in `src/pixelblaze/stock/patterns.ts`.
4. Smoke coverage in `src/pixelblaze/stock/patterns/_smoke.test.ts`.
5. A `CONTROL_DESCRIPTIONS` entry in `src/pixelblaze/controlDescriptions.ts` for
   **every** slider. The first cohort missed this one and left the suite red.

For `render2D` sample coordinates on the stock plane map, y = 0 is the top of
the frame and y increases downward (`camera.ts` flips pos y into clip space;
verified with a `hsv(0, 0, y)` gradient capture, #819). An earlier note here
claimed the opposite and cost a review cycle — probe with a gradient before
relying on either axis for directional behaviour.

## Changing the stock Show catalogue

Editing `src/pixelblaze/stock/shows.ts` fans out in this order:

1. **`shows.test.ts` census** — count, name/level/order rows, and the reference id
   list, plus doctrine tests keyed off the FOUNDATION/COMPOSITION/OUTPUT id lists.
2. **`stockEntityOrganization.test.ts`** — rail folders derive from data; only the
   tests pin them.
3. **`showDirectColorSinksCatalogue.test.ts`** — pins which Shows are
   direct-sink eligible. Adding one means reviewing the named Precise-mode
   approximation in the Technical Reference.
4. **`test/perf-harness/issue514.test.ts`, `issue536.test.ts`, `issue540.test.ts`**
   — real capacity gates, not pins. `514` rejects Shows over the activation
   proxy or the 256-global ceiling. `536` compiles at a **frozen compiler
   vintage** with no kernel or slot sharing, so a Show that is comfortable in
   production can be over-ceiling there and flip the emission verdict; reshape
   the fixture rather than accepting a flipped verdict. Adding a stock *Pattern*
   also moves 514's pattern corpus, 536's member-global totals, and 540's field
   and shading census.
5. **Qualification suites and disclosure strings** are keyed to specific
   reference fixture ids and exact compile-bar text. When a fixture retires,
   preserve its shape as an engine test fixture rather than losing the
   qualification subject.

Recensus protocol: probe the actual new summary values, re-pin, and append a
recensus note to the existing comment chain. Verify that every gate *verdict* is
unchanged, not merely that the counts were updated.

## Changing toolkit variants

Adding or reordering a Show toolkit variant touches a fixed census set. Run these
together and re-pin in one pass:

- `SHOW_VISUAL_TOOLKIT_CONTRACT_VERSION` in `showVisualToolkitFreeze.ts` must
  increment for **any** intentional registry or descriptor change — reviewers
  reject a silent same-version change — and the freeze fingerprint and fixture
  count re-pinned with it.
- Pins live in `showVisualToolkit.test.ts` (variant order),
  `showVisualToolkitPresentation.test.ts` (catalogue length),
  `showTransitionAuthoring.test.ts` and its component sibling (item counts), the
  stock `shows.test.ts` census (the stock reference must exercise every
  shape-reveal variant), and the perf-harness byte and global ledgers.
- Fixtures live in `showVisualToolkitFixtures.ts` and `catalogueShapeSettings`.

Per-variant parameter defaults belong in `constraintsByVariant` in
`showVisualToolkit.ts`, which supports `defaultValue`, `min`, and `max`. The
palette materializes resolved defaults, so a normalize-time fallback alone never
reaches persisted records.

Registry-touching changes also move the perf-harness ledgers, which are **not** in
the pre-commit focused set. Run them before requesting review of any such range.

## Portable Shows, Installations, and community Patterns

The stock Show catalogue separates finished pieces by output contract.
**Portable Shows** holds Shows for standard square maps; **Installations** holds
Shows bound to a specific stock map. The first Portable Show is the Coronal Mass
Ejection remix, ported from `scripts/promo/cme-teaser.ts`, whose Pattern ships as
stock `CoronalMassEjection` credited to ZRanger1.

**ZRanger1 has granted blanket permission** (2026-08-05) to ship their Pattern
code, in their words a "take this code and use it to make cool things" licence.
Shipping ZRanger1 Patterns as stock or remix content is therefore cleared
outright — credit them in the established shape; no further per-Pattern
permission is needed.

A new finished Show follows that same shape: a stock Pattern with its manifest
and structured credit, the builder ported through engine operations rather than
hand-written JSON, a note crediting the author, the collection matching its
portable or installation output contract, and census re-pins per the catalogue
interlock above.

## Probing and measurement

Write a temporary `_*-probe.test.ts` **inside the worktree** — path aliases only
resolve in-tree — and append results to the scratchpad, because vitest swallows
`console.log`. Delete probes before committing; `git add -A` will otherwise grab
them, and a probe left under `src/` breaks other agents' `npm test`.

## Authoring Shows by script

Promo and teaser Shows are authored programmatically rather than by hand in the
editor, because hand-written composition JSON is fragile — cells and the
composition sidecar must agree — while the engine's own pure functions produce
exactly what the editor would. `scripts/promo/cme-teaser.ts` is the worked
example.

The shape: build a flat ShowRecord with `createShowWithOutputContract` and the
showModel mutators, project it with
`projectFlatShowToCompositionV1WithCellOrigins` stamping
`executionModel: 'deterministic-loop'`, add tracks with `addShowPropertyTrack`
and `addShowPropertyKeyframe`, compile-check with `compileShowForPreview`, then
POST or PATCH `/api/shows` with a locally minted session cookie.

Gotchas worth knowing before the first run:

- `compileShow` rejects single-scene Shows; keep at least two Scenes.
- One Pattern continuing across a Cut is one **held cell**, not two cells. Two
  cells means two restarted instances.
- Property tracks are Scene-local, in Scene-relative milliseconds. Instance
  time-scale tracks **replace** the instance's base time scale while active.
- Deleting a visual Transition persists as a `kind: 'cut'` record rather than a
  removal.
- Pattern-clock hue landing must be calibrated empirically rather than derived;
  two-point interpolation converges quickly.
