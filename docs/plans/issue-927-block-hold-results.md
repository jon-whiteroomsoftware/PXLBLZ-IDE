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

## Ladder (median FPS, one pass per rung)

| member | px | exact | 1D lerp ×2 | 2D block ×2 | 1D lerp ×4 | 2D block ×4 |
|---|---:|---:|---:|---:|---:|---:|
| ZippyZaps | 256 | 7.005 | +78% | **+226%** | +226% | +279% |
| ZippyZaps | 500 | 3.591 | +79% | **+283%** | +229% | +320% |
| Caustics | 256 | 7.266 | +77% | **+219%** | +225% | +270% |
| Caustics | 500 | 3.721 | +78% | **+273%** | +227% | +308% |

Evaluations per pixel: 1D lerp ×K = 1/K; 2D block ×K = 1/K². At 256 px the
2D block at K = 2 lands exactly where the 1D lerp at K = 4 does (both a
quarter of the evaluations); at 500 px it pulls ahead (+283 vs +229%), and
K = 4 adds only ~50 points more because the bilinear replay (~6 array
reads, 9 multiply-adds, one clamped division) is now the floor.

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

Build the 2D block hold at K = 2 as the stop that sits between the 1D lerp
×2 and ×4: same FPS as the 1D ×4 at 256 px, more at 500 px, and a
structurally better image on cellular content. Do not offer K = 4 in 2D
under the ≤500 px scope. Requirements for the build, from the spike:

- eligibility exactly where #937's lerp applies (synthesized coordinates,
  index-routed), plus a zone whose width is known at compile time;
- one arena plane for the two anchor rows, declared to the planner with a
  lifetime and a reason when declined (plane owned by a snapshot or
  Trails window → fall back to the 1D lerp);
- total-latch coverage as in #937; the frame-start reset at index 0 and
  the ascending-order contract (#936) already hold.

Costs to be honest about: ~20 µs per held pixel of replay (the 1D lerp
replays for ~6 µs), so the 2D form only pays for members above roughly
60 µs per pixel, which is exactly the heavy class this wave targets.
