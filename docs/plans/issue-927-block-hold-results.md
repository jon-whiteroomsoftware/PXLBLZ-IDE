# #927 — 2D block hold with a row buffer (spike)

Wave-5 epic #923, candidate 7 (2D) in the advisory. Measured 2026-09-01 on
the bench pb32 (firmware 3.67, native serial, profile stamped
`native-serial (assumed)`) at 256 and 500 px on the #926 heavy fixture (one
2,000-pixel zone, a 45×45 synthesized coordinate domain; ZippyZaps and
Caustics as members). Harness: `test/perf-harness/issue927.ts`; ladder:
`issue927-block-ladder.json`; drift: `issue927-drift.json`; contact sheets
in `docs/plans/images/issue-927-*-contact.png` (exact | 1D lerp ×4 | 2D
block ×2 | 2D block ×4, t = 6 s, 45×45 domain, 8× upscaled).

## What was built

Anchors on every K-th row and column (the last row and column clamped).
When a block-row begins, the next anchor row's anchors are evaluated into a
row buffer after the previous one shifts down; every pixel paints the
bilinear blend of its four surrounding anchors. Anchors are bit-identical
to the baseline (`issue927.test.ts`, three full frames), member evaluations
are ~N/K² per frame, and the Controller compiler accepts K = 2 and 4. The
spike's buffers are two plain arrays (2 × 3 × 23 words at K = 2); a build
would declare one arena plane through the lifetime-aware planner (#718).

## Ladder (median FPS, mean of two passes per rung, passes within 0.02 FPS of each other; measured candidates carry no instrumentation)

| member | px | exact | 1D lerp ×2 | 1D lerp ×4 | 2D block ×2 (array replay) | 2D block ×2 (scalar-cached replay) | 2D block ×4 (scalar-cached) |
|---|---:|---:|---:|---:|---:|---:|---:|
| ZippyZaps | 256 | 7.00 | +78% | +226% | +67% | **+75%** | +213% |
| ZippyZaps | 500 | 3.59 | +79% | +229% | +78% | **+88%** | +267% |
| Caustics | 256 | 7.25 | +78% | +225% | +215% | **+246%** | +208% |
| Caustics | 500 | 3.72 | +78% | +228% | +267% | **+310%** | +260% |

Evaluations per pixel, measured on an instrumented twin of the wrapper
(same output, one counter write per evaluation; the measured candidates
carry none): 2D ×2 0.265 and ×4 0.072 on the declared 2,000-pixel zone
(fills clamp to the zone, so the partial last row costs no out-of-zone
evaluations); on a 256-px strip the ×2 form evaluates rows 0, 2, 4 and
the lookahead row 6 (92 evaluations, 0.36 per pixel) against the 1D lerp
×4's 65 (0.25), which is where the strip-sized gain goes.

Two findings that changed the recommendation:

- **The replay, not the evaluations, decided the first ladder.** Six array
  reads per pixel cost ~100 µs on this VM; caching the cell's four anchors
  in scalars and reloading them only at anchor columns (`scalarCache`)
  buys 9–45 points. The first ladder also carried an out-of-range read on
  the last column (review P1), fixed before these numbers.
- **The gain is member-dependent in a way the evaluation count does not
  predict.** On these strips the 2D ×2 form evaluates MORE pixels than the
  1D lerp ×4 (92 against 65 at 256 px, 161 against 126 at 500 px, the
  lookahead row being a fixed cost); Caustics still beats it (+246 / +310%
  against +225 / +228%) while ZippyZaps gains no more than the 1D lerp ×2
  (+75 / +88%).
  The wrapper is identical, so ZippyZaps' per-evaluation cost must rise
  when its anchors are evaluated ahead of order (its render path keeps
  per-pixel accumulators the lookahead visits out of sequence); this was
  not isolated and is the open question a build would have to answer.

## Drift (emulator, 12 frames, 8-bit channels) and the contact sheets

| member | variant | evaluations / px | mean | rmse | p95 | changed ≥ 2 |
|---|---|---:|---:|---:|---:|---:|
| ZippyZaps | 2D block ×2 | 0.265 | 0.98 | 3.92 | 4 | 12.1% |
| ZippyZaps | 1D lerp ×4 | 0.251 | 1.81 | 5.88 | 8 | 22.9% |
| ZippyZaps | 2D block ×4 | 0.072 | 2.61 | 7.22 | 10 | 34.5% |
| Caustics | 2D block ×2 | 0.265 | 6.11 | 14.36 | 31 | 46.3% |
| Caustics | 1D lerp ×4 | 0.251 | 12.78 | 26.25 | 60 | 59.3% |
| Caustics | 2D block ×4 | 0.072 | 18.04 | 32.22 | 73 | 78.5% |

After the last-column fix the 2D block ×2 drifts LESS than the 1D lerp ×4
on both members at a similar evaluation count on the full stage (0.265
against 0.251 per pixel; ZippyZaps 0.98 vs 1.81 mean, Caustics 6.11 vs
12.78), and the contact sheets (regenerated after that fix) agree: the 1D
lerp streaks structure horizontally (Caustics' cells become dashes) while
the 2D block keeps shapes and softens them. K = 4 in 2D is mush on both
members. (The first ladder's drift table, taken before the fix, had the
2D rows worse; those numbers were the out-of-range last column.)

## Recommendation (Jon's verdict pending)

**Decline the build under the ≤500 px scope; keep the scalar-cached spike
as the reopen point for the large-installation round.** At 256 px the 2D
block ×2 evaluates more pixels than the 1D lerp ×4 (the lookahead row is a
fixed cost on a short stage) and lands between the 1D ×2 and ×4 depending
on the member; the 1D lerp already covers that FPS range with a
structurally simpler replay. The 2D form's advantages — better drift at
a similar full-stage evaluation count (table above, contact sheets), and
+310% against +228% on Caustics at 500 px — grow with stage height, which
is the expander round's domain.

If Jon's eye rates the 2D ×2 sheets as clearly better than the 1D ×4
ones, the build is: eligibility as #937 plus a compile-time zone width;
one arena plane for the two anchor rows, declared to the planner with a
lifetime and a decline reason; the scalar-cached replay; total-latch
coverage as in #937; and the ZippyZaps out-of-order cost isolated first.
No K = 4 in 2D under this scope.
