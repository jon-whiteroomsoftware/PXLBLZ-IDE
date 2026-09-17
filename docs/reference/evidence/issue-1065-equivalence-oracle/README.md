# Show editor equivalence oracle (#1065)

This diagnostic proves whether the existing Show editor presents the same UX and durable authoring behavior for independently stored v1 and converted v2 Show rows. It is intentionally red on the current rejected v2 route. Converter accounting is diagnostic context only: no converter difference permits a visual or behavioral mismatch.

## Run it

Regenerate the deterministic fixture pairs, then run the oracle:

```bash
npm run show:editor-equivalence:fixtures
npm run show:editor-equivalence
```

The second command provisions an isolated authenticated runtime, stores each v1 source and its converter-produced v2 record as separate rows, and runs both visual and pointer-gesture tests. A complete run is expected to exit nonzero until the v2 record opens in the existing editor. This diagnostic is deliberately excluded from the ordinary `test:e2e:shows` and final-suite commands while it records that known mismatch.

For manual inspection on the managed #1065 runtime:

```bash
npm run show:editor-equivalence:seed -- --issue 1065 --url http://localhost:5178/PXLBLZ-IDE/
```

The seed command prints the synthetic user's ordinary v1 and v2 routes without printing the session token or signing secret. Before storing a v2 row, the Playwright oracle reruns the current browser converter and rejects a committed fixture whose converted record has gone stale.

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

Every endpoint records x/y position, width, height, SHA-256, and exact RGBA comparison metrics. A moved surface fails even when its cropped pixels are identical. Every v1 and v2 capture is repeated; any nonzero repeat difference is classified as unstable evidence and fails before the cross-version result is considered. Missing v1 baselines are not accepted as expected red. Animations, transitions, caret, font readiness, transport time, and pointer parking are deterministic; no pixels or surfaces are masked and there is no tolerance.

## Behavioral verdict

The behavioral row has one safe movable ordinary Clip. The oracle pauses and rewinds, performs the same actual pointer drag on each ordinary route, then reads storage independently. It requires:

- the converted v1 result and saved v2 result to match after removing only top-level row `id` and `updatedAt`;
- exactly one settled save and history `{ past: 1, future: 0 }` after the drag;
- a fresh page to hydrate the saved moved row exactly;
- the existing v1 `Undo Show edit` control, a second settled save, history `{ past: 0, future: 1 }`, and the exact stored preimage after reload.

A missing ordinary v1 gesture or control on the v2 route is a product-unavailable result. Each operation is time-bounded, partial measurements remain in the report, and a global timeout is never relabeled as a UX mismatch.

## Recorded run

The compact JSON summaries and representative v1/v2 editor captures in this directory come from the 2026-09-17 oracle qualification. Raw run directories remain external because the full matrix produces many PNGs and verbose converter accounting.

The final full run `full-final-20260917c` produced 80 comparisons and 72 strict verdict rows. All rows were stable product comparisons: zero unstable captures and zero invalid or missing v1 baselines. Its verdict remained red: 24 pixel mismatches, 24 dimension mismatches, and 32 missing v2 surfaces. The representative fresh desktop whole-editor row was stable in both versions and then differed by 1,031,563 pixels with maximum channel delta 255. The bounded behavior row fully passed the v1 reference path: one save, history depth one, exact moved-state hydration, then one Undo save and exact preimage restoration. The rejected v2 route did not expose the v1 Clip gesture, so the behavioral verdict stayed red.
