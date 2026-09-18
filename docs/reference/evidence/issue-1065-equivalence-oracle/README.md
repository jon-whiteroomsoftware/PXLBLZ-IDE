# Show editor equivalence oracle (#1065)

This diagnostic proves whether the existing Show editor presents the same UX and durable authoring behavior for independently stored v1 and converted v2 Show rows. Converter accounting is diagnostic context only: no converter difference permits a visual or behavioral mismatch.

It was intentionally red while a v2 row opened the rejected v2 route. Jon decided on 2026-09-18 that there is no route gate and a v2 Show opens in the existing editor, so the oracle now compares two rows of the same editor and its red rows are named product or method results rather than an expected mismatch.

## Run it

Regenerate the deterministic fixture pairs, then run the oracle:

```bash
npm run show:editor-equivalence:fixtures
npm run show:editor-equivalence
```

The second command provisions an isolated authenticated runtime, stores each v1 source, reads its persisted representation back, and converts that persisted representation into the independently stored v2 row. It also checks the raw committed v1/v2 fixture pair against the current converter so fixture drift still fails closed. It then runs both visual and pointer-gesture tests. A complete run exits nonzero while any verdict row is not equivalent; the rows that remain red are named below.

This spec is in no `runner.suites` entry and its only script is the non-required `show:editor-equivalence`, so no runner produces exact-tip evidence for it. That is why a full-matrix run at an exact code commit is retained here rather than cited from a runner receipt.

For manual inspection on the managed #1065 runtime:

```bash
npm run show:editor-equivalence:seed -- --issue 1065 --url http://localhost:5178/PXLBLZ-IDE/
```

The seed command prints the synthetic user's ordinary v1 and v2 routes without printing the session token or signing secret. It applies the same persisted-v1 conversion sequence as the Playwright oracle. Before storing that v2 row, both paths rerun the current converter and reject a committed fixture whose raw conversion has gone stale.

Raw captures and reports go to a run-specific directory under `/tmp/pxlblz-show-editor-equivalence/`. Set `PXLBLZ_EQUIVALENCE_RUN_ID` for a stable run name or `PXLBLZ_EQUIVALENCE_OUTPUT` for an explicit directory. Optional exact filters are:

```bash
PXLBLZ_EQUIVALENCE_FIXTURE=fresh \
PXLBLZ_EQUIVALENCE_VIEWPORT=desktop \
PXLBLZ_EQUIVALENCE_SURFACE=whole-editor \
PXLBLZ_EQUIVALENCE_RUN_ID=bounded-whole \
npm run show:editor-equivalence -- --grep 'visual oracle'
```

Unknown or empty filters fail closed. Filtered reports record the active filters, actual widths, `partialCoverage: true`, and the number of verdict rows. They are diagnostic probes and never represent full-corpus acceptance.

## Corpus and visual verdict

The committed corpus contains:

| Key | Fixed time | Purpose |
| --- | ---: | --- |
| `fresh` | 5 s | Fresh production v1 builder output |
| `installation-layouts` | 8 s | 64-pixel Installation with two Zones and three physical Layouts, including Layout switches |
| `groups-animation` | 10 s | Group reuse with property animation |
| `stock-lesson` | 4 s | Stock transition/value lesson |

Every case runs at 1440×1000 and 390×844. The strict consumer boundary is the complete existing editor pane. Named verdict surfaces include its header, timeline, toolbar, Stage canvas, preview strip, actions, Clip/Transition/Zone Layout/Show detail surfaces, transition palette, actual property-animation popover, computed open Zone rail, and Zone Map. The unmodified full window is retained as diagnostic evidence but excluded from the equivalence verdict because the library's selected-row position necessarily follows the two different storage IDs.

Every endpoint records x/y position, width, height, SHA-256, and exact RGBA comparison metrics. A moved surface fails even when its cropped pixels are identical. Before every independent capture, setup writes the persisted per-Show Zones rail state to the same closed baseline; a surface that opens the rail cannot contaminate any later surface or viewport. Every v1 and v2 capture is repeated; any nonzero repeat difference is classified as unstable evidence and fails before the cross-version result is considered. Missing v1 baselines are not accepted as expected red. Animations, transitions, caret, font readiness, transport time, and pointer parking are deterministic; no pixels or surfaces are masked and there is no tolerance.

## Behavioral verdict

The behavioral row has one safe movable ordinary Clip. The oracle pauses and rewinds, performs the same actual pointer drag on each ordinary route, then reads storage independently. It requires:

- the converted v1 result and saved v2 result to match after removing only top-level row `id` and `updatedAt`;
- exactly one settled save and history `{ past: 1, future: 0 }` after the drag;
- a fresh page to hydrate the saved moved row exactly;
- the existing v1 `Undo Show edit` control, a second settled save, history `{ past: 0, future: 1 }`, and the exact stored preimage after reload.

A missing ordinary v1 gesture or control on the v2 route is a product-unavailable result. Each operation is time-bounded, partial measurements remain in the report, and a global timeout is never relabeled as a UX mismatch.

## Exact-tip run `tip-6ee11aa7` (2026-09-18)

`exact-tip-summary.json` is the full matrix run at code commit `6ee11aa7`, on a clean tree, by

```bash
PXLBLZ_EQUIVALENCE_RUN_ID=tip-6ee11aa7 npm run -s show:editor-equivalence
```

It took 579 seconds: 9.0 minutes for the matrix test and 9.7 minutes for the whole spec. 80 comparisons, 72 strict verdict rows, **69 equivalent**. The behavioral verdict is equivalent on both stored versions: one settled save, history `{past: 1, future: 0}`, exact hydration on a fresh page, then Undo with a second save, `{past: 0, future: 1}` and the exact stored preimage after reload.

The summary records every verdict row with its raw strict `changedPixels` and `maximumChannelDelta`, the qualification that produced its verdict, and the retained captures. Fourteen rows are not pixel-exact; the `-v1-a.png` and `-v2-a.png` captures for each of those are in this directory (28 files, 5.1 MiB). Every other verdict row is exactly zero and has nothing to show.

Eleven of those fourteen are the approved source-size gauge value, qualified with its exact-zero symmetric counterfactual and byte-exact restoration: the `whole-editor` and `preview-strip` pair for each of the four fixtures at 1440, and the three 390 detail panels the gauge lies behind.

### The three red rows

- `fresh/390 whole-editor` and `fresh/390 preview-strip`, 8 pixels at channel delta 212, refused with `counterfactual-not-exact`. The counterfactual itself is exactly zero. What fails is restoration: on the v2 row, putting the gauge slots back leaves the preview help icon one level different at six pixels (x181-186, y8-9). The two restoration controls are acquired in independent page opens and are byte-identical to each other, while both differ from the two pristine controls at exactly those positions, so the residual is a systematic effect of the mutate-and-restore cycle rather than raster noise. It is therefore not classifiable, and it is not excused. Before `6ee11aa7` these rows read as qualified only because the pristine and post-restoration controls shared one group, which held both values by construction.
- `fresh/390 transition-palette`, 17 pixels at channel delta 1, refused with `counterfactual-not-exact`. The gauge lies behind this panel but does not explain it: normalizing the gauge leaves the difference untouched. Its cause is that opening the Transition palette on a v1 row previews the current item - a preview override plus a seek to the boundary midpoint - while the same handler is an unconnected no-op on a v2 row, so the timeline playhead paints `bg-amber-300` on one side and `bg-live` on the other and bleeds through the panel's backdrop blur. Jon decided on 2026-09-18 to leave this row red, tracked on #1066. No seek was settled, no preview was connected and the row is not special-cased.

### Correction to `e92ac9d7`

That commit's message cites "Full matrix at f79eb575: 71 of 72 verdict rows equivalent". That run predates the capture-identity rework, the control plan and the gauge exception it introduced, and this oracle's own identity test declares its two-row arrangement invalid, so it is not evidence for that code and must not be cited as such. The `tip-6ee11aa7` run above supersedes it.

## Recorded run

The compact JSON summaries and representative v1/v2 editor captures in this directory come from the 2026-09-17 oracle work and from the 2026-09-18 exact-tip run recorded below. Raw run directories remain external because the full matrix produces many PNGs and verbose converter accounting; only the captures for rows that are not pixel-exact are retained here.

The historical full run `full-final-20260917c` produced 80 comparisons and 72 strict verdict rows, but it is superseded as acceptance evidence. Its capture preparation persisted an opened Zones rail, so later surfaces and viewports were not guaranteed to begin from the same UI state. Its reported counts remain in `visual-summary.json` only as diagnostic provenance; they must not be cited as a qualified complete matrix. The representative whole-editor image preceded the Zones surface and remains illustrative, not acceptance proof.

The corrective focused run `repair-focused-20260917` passed both repair checks in an isolated authenticated browser: it opened and persisted the Installation fixture's Zones rail, then proved the next independent capture setup restored the closed baseline; it also proved that storage added `stageMapId: null` to v1, that the v2 row retained it, and that converting the persisted v1 row matched the stored v2 row after removing only row identity and timestamp. The pure oracle separately proves that `stageMapId` differences remain observable.

The corrected complete run `repair-full-20260917` produced all 80 comparisons and 72 strict verdict rows. All 80 were stable product comparisons, with zero unstable captures and zero invalid or missing v1 baselines. The strict verdict remains red: 24 dimension mismatches, 16 pixel mismatches and 32 missing v2 surfaces. Eight additional full-window diagnostics differed by pixels. The authenticated browser boundary also reported 155 HTTP 409 console errors during the run; they did not make any capture incomplete or unstable, but remain recorded diagnostic noise rather than accepted behavior.

The coordinator also opened the corrected persisted-v1-derived Installation pair on the ordinary managed routes and captured `repair-installation-v1.png` and `repair-installation-v2.png` at 1280×720. The pair confirms the v1 route retains the ordinary rail and layout while the v2 route remains the rejected form UI. The transport times differ, so this manual gross-layout comparison is provenance for the opened rows, not deterministic pixel evidence.

The bounded behavior run `repair-behavior-20260917` used the corrected persisted pair. Its v1 reference path again qualified one drag, one save, history depth one, exact moved-state hydration, then one Undo save and exact preimage restoration. The rejected v2 route did not expose the ordinary v1 Clip gesture, so the diagnostic exited red as designed.

Two P3 limitations remain filed on #1064 and were deliberately not widened into this repair: save counting observes request emission before the matching persistence response settles, and empty-string environment filters are interpreted as absent rather than rejected. Filtered probes therefore remain diagnostic only, and save-settlement precision must not be inferred from this evidence.
