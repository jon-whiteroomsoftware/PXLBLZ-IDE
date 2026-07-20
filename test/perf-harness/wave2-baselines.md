# Wave-2 baseline FPS fixtures - Pixelblaze hardware (#555)

**Generated:** 2026-07-19 (device time 2026-07-20T04:39:16Z)
**Device:** Burner bag (`pb32`)
**Firmware:** 3.67
**Output profile:** native-serial (assumed); getConfig does not expose output topology
**Method:** per fixture and per size - activate, settle 2,000 ms, 16 FPS samples over 4 s, median and mean reported; original active Pattern and pixel count restored in `finally`; pixel map untouched. Same protocol as #531.

Each artifact is compiled once at master pixel count 2,000 and measured at
256 / 1,000 / 2,000 physical pixels (the firmware only renders physical
pixels, so one artifact yields a paired size ladder). Runner:
`ISSUE555_HARDWARE=1 npx vitest run test/perf-harness/issue555.hardware.test.ts`;
an "after" pass on an optimized build sets `WAVE2_LABEL` to keep paired
reports side by side. Raw samples: `wave2-baselines.baseline.json`.

## Fixtures

- **redline-reference** - stock `Redline Installation`, unchanged. Continuity with the #531 ledger (336.476 ms median full frame at 2,000 px there; 328.225 ms here, -2.5% run-to-run).
- **hsv-steady-state** - one zone, two >=20 s holds, one 2 s Crossfade; `EasedSweep` (arithmetically cheap) and `Caustics` (heavy) both emit through `hsv()`. The measurement window sits inside the first steady hold, where nothing consumes RGB.
- **effect-tax** - the HSV steady-state Show plus one animated hue-rotate and one posterize Effect on each scene member.
- **mirror** - single zone; heavy HSV member (`Caustics`) with the horizontal Mirror Effect (#543).
- **five-pattern-acceptance** - unchanged five-Pattern acceptance Show (#520) for whole-Show regression coverage.

## Baseline table

| fixture | px | source B | expanded B | bytecode B | VM words | globals | median FPS | mean FPS | frame ms (median) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| redline-reference | 256 | 19,126 | 30,035 | 11,810 | 6,096 | 55 | 17.075 | 16.907 | 58.566 |
| hsv-steady-state | 256 | 12,113 | 17,549 | 6,874 | 6,012 | 51 | 40.157 | 39.957 | 24.902 |
| effect-tax | 256 | 15,681 | 24,279 | 9,170 | 6,012 | 57 | 19.343 | 19.302 | 51.699 |
| mirror | 256 | 7,976 | 10,527 | 4,698 | 6,018 | 28 | 6.487 | 6.489 | 154.143 |
| five-pattern-acceptance | 256 | 50,344 | 89,327 | 28,926 | 6,012 | 170 | 19.608 | 19.056 | 51.000 |
| redline-reference | 1,000 | 19,126 | 30,035 | 11,810 | 6,096 | 55 | 4.771 | 4.885 | 209.600 |
| hsv-steady-state | 1,000 | 12,113 | 17,549 | 6,874 | 6,012 | 51 | 10.344 | 10.269 | 96.678 |
| effect-tax | 1,000 | 15,681 | 24,279 | 9,170 | 6,012 | 57 | 4.973 | 4.962 | 201.096 |
| mirror | 1,000 | 7,976 | 10,527 | 4,698 | 6,018 | 28 | 1.664 | 1.663 | 601.000 |
| five-pattern-acceptance | 1,000 | 50,344 | 89,327 | 28,926 | 6,012 | 170 | 4.153 | 4.141 | 240.800 |
| redline-reference | 2,000 | 19,126 | 30,035 | 11,810 | 6,096 | 55 | 3.047 | 3.049 | 328.225 |
| hsv-steady-state | 2,000 | 12,113 | 17,549 | 6,874 | 6,012 | 51 | 5.213 | 5.154 | 191.833 |
| effect-tax | 2,000 | 15,681 | 24,279 | 9,170 | 6,012 | 57 | 2.492 | 2.482 | 401.333 |
| mirror | 2,000 | 7,976 | 10,527 | 4,698 | 6,018 | 28 | 0.832 | 0.832 | 1,202.000 |
| five-pattern-acceptance | 2,000 | 50,344 | 89,327 | 28,926 | 6,012 | 170 | 1.701 | 1.668 | 588.000 |

## Observations for the wave-2 slices

- The effect-tax fixture pays 209.5 ms/frame over the HSV steady state at
  2,000 px (401.333 vs 191.833) - the per-pixel generated effect lines that
  #558 targets are a first-order cost on this fixture, not a tax on top of a
  dominant Pattern cost.
- The mirror fixture runs at 1,202 ms/frame at 2,000 px with a single heavy
  member - the #560 within-frame output-reuse headroom (up to ~40% of member
  work) is measured against this row.
- At low FPS the firmware reports quantized FPS values (601.000 and
  1,202.000 ms medians are exact reciprocals of reported FPS steps); treat
  sub-percent deltas on the mirror rows as noise.
- Redline continuity: 328.225 ms here vs 336.476 ms in #531 (-2.5%
  run-to-run drift on identical code); use paired before/after runs, not
  cross-report comparisons, for qualification.
