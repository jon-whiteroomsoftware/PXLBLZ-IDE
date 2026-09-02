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

## Ladder (median FPS, two passes per rung, identical to 0.01 FPS)

| member | px | exact | 1D lerp ×2 | 1D lerp ×4 | 2D block ×2 (array replay) | 2D block ×2 (scalar-cached replay) | 2D block ×4 (scalar-cached) |
|---|---:|---:|---:|---:|---:|---:|---:|
| ZippyZaps | 256 | 7.01 | +78% | +226% | +66% | **+75%** | +212% |
| ZippyZaps | 500 | 3.59 | +79% | +229% | +78% | **+87%** | +267% |
| Caustics | 256 | 7.26 | +78% | +225% | +215% | **+247%** | +208% |
| Caustics | 500 | 3.71 | +78% | +228% | +266% | **+311%** | +260% |

Evaluations per pixel, measured (fill counter): 2D ×2 0.261 and ×4 0.071
on the full 45×45 stage; on a 256-px strip the ×2 form evaluates rows 0,
2, 4 and the lookahead row 6 (92 evaluations, 0.36 per pixel) against the
1D lerp ×4's 65 (0.25), which is where the strip-sized gain goes.

Two findings that changed the recommendation:

- **The replay, not the evaluations, decided the first ladder.** Six array
  reads per pixel cost ~100 µs on this VM; caching the cell's four anchors
  in scalars and reloading them only at anchor columns (`scalarCache`)
  buys 9–45 points. The first ladder also carried an out-of-range read on
  the last column (review P1), fixed before these numbers.
- **The gain is member-dependent in a way the evaluation count does not
  predict.** Caustics at 2D ×2 beats the 1D lerp ×4 (+247 / +311% against
  +225 / +228%) on the same or fewer evaluations; ZippyZaps at 2D ×2 gains
  no more than the 1D lerp ×2 (+75 / +87%) despite evaluating fewer pixels.
  The wrapper is identical, so ZippyZaps' per-evaluation cost must rise
  when its anchors are evaluated ahead of order (its render path keeps
  per-pixel accumulators the lookahead visits out of sequence); this was
  not isolated and is the open question a build would have to answer.

## Drift (emulator, 12 frames, 8-bit channels) and the contact sheets

| member | variant | evaluations | mean | rmse | p95 | changed ≥ 2 |
|---|---|---:|---:|---:|---:|---:|
| ZippyZaps | 1D lerp ×4 | 1/4 | 1.81 | 5.88 | 8 | 22.9% |
| ZippyZaps | 2D block ×2 | 1/4 | 3.77 | 17.48 | 10 | 14.6% |
| ZippyZaps | 2D block ×4 | 1/16 | 6.57 | 20.77 | 38 | 37.6% |
| Caustics | 1D lerp ×4 | 1/4 | 12.78 | 26.25 | 60 | 59.3% |
| Caustics | 2D block ×2 | 1/4 | 7.28 | 17.99 | 37 | 47.9% |
| Caustics | 2D block ×4 | 1/16 | 19.10 | 34.09 | 78 | 79.4% |

The numbers split by content and the contact sheets do not: at the same
evaluation count the 1D lerp streaks structure horizontally (Caustics'
cells become dashes) while the 2D block keeps shapes and softens them. The
mean-delta metric under-weights that anisotropy. K = 4 in 2D is mush on
both members.

## Recommendation (Jon's verdict pending)

**Decline the build under the ≤500 px scope; keep the scalar-cached spike
as the reopen point for the large-installation round.** At 256 px the 2D
block ×2 evaluates more pixels than the 1D lerp ×4 (the lookahead row is a
fixed cost on a short stage) and lands between the 1D ×2 and ×4 depending
on the member; the 1D lerp already covers that FPS range with a
structurally simpler replay. The 2D form's advantages — cellular content
keeps its shape (contact sheets), and +311% against +228% on Caustics at
500 px — grow with stage height, which is the expander round's domain.

If Jon's eye rates the 2D ×2 sheets as clearly better than the 1D ×4
ones, the build is: eligibility as #937 plus a compile-time zone width;
one arena plane for the two anchor rows, declared to the planner with a
lifetime and a decline reason; the scalar-cached replay; total-latch
coverage as in #937; and the ZippyZaps out-of-order cost isolated first.
No K = 4 in 2D under this scope.
