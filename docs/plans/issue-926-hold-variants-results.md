# #926 — Hold, evolved: hold, parity, lerp, and refresh on heavy members

Wave-5 epic #923, candidate 7 in the advisory. Spike; no product change.
Measured 2026-09-01 on the bench pb32 (firmware 3.67, native serial,
profile stamped `native-serial (assumed)`) at 256 px; visual drift from
the emulator (Fast, 12 frames, a 256-index strip of the fixture's 45×45
synthesized domain — see the drift section). Harness:
`test/perf-harness/issue926.ts`; ladder: `issue926-variants-ladder.json`.

Corrections after review (advisory findings on the landed range): the
drift figures describe a strip, not a 16×16 surface; single-zone Portable
Shows are not lerp-compatible; the spike's lookahead read a virtual pixel
at the final anchor. Each is corrected in place below. The shipped pass
(#937) measured its own ladder and is the authority for the build.

## Verdict

- **The plain hold is at the (K−1)/K ceiling on heavy members**: ×2
  +92%, ×4 +268% on both ZippyZaps and Caustics. Member-bound frames leave
  nothing else to pay for.
- **Hold-and-lerp keeps most of it — ×2 +79%, ×4 +227% — for roughly half
  the visual drift** at the same K. It needs coordinates the dispatcher
  synthesizes from the index (Installation Shows). A Portable Show — single
  zone included — derives its zone coordinates from the firmware-provided
  `x`/`y`, so advancing `index` alone does not sample the next pixel; the
  shipped pass declines those as `coordinate-routed`.
- **Alternating-parity anchors are free** (within 1% of the hold) and turn
  the static pixelation into a per-frame shimmer; whether that reads
  better is a question for the eye, not the ladder.
- **Content decides the artifact size.** Caustics (voronoi cells) drifts
  7× more than ZippyZaps (smooth field) at ×2 hold. Any default K needs
  the catalogue sweep Jon asked for in #913, not one Pattern's contact
  sheet.
- **Hold over Rolling Refresh was not exercised**: the recipe-level
  `evaluationPolicy` on a routed-scene clip did not engage the policy (no
  refresh machinery in the artifact; the "refresh-only" rows are 3.5%
  below baseline, machinery without the policy). Composition stays an
  open row for a follow-up that builds the fixture from a Show record.

Decision with Jon: which variants deserve a build behind a compile option
(the dial's stops are deferred with the UX). The evidence favours offering
lerp wherever coordinates are synthesized and the plain hold elsewhere.

## Ladder (256 px, median FPS, 6 s windows)

| member | variant | K | FPS | ms/frame | vs baseline | bytecode |
|---|---|---:|---:|---:|---:|---:|
| ZippyZaps | baseline | 1 | 6.869 | 145.6 | — | 5,782 |
| ZippyZaps | hold | 2 | 13.183 | 75.9 | +91.9% | 5,942 |
| ZippyZaps | parity | 2 | 13.133 | 76.1 | +91.2% | 5,990 |
| ZippyZaps | lerp | 2 | 12.287 | 81.4 | +78.9% | 6,178 |
| ZippyZaps | hold | 4 | 25.255 | 39.6 | +267.6% | 5,942 |
| ZippyZaps | parity | 4 | 25.072 | 39.9 | +265.0% | 5,990 |
| ZippyZaps | lerp | 4 | 22.505 | 44.4 | +227.6% | 6,178 |
| Caustics | baseline | 1 | 7.181 | 139.2 | — | 6,870 |
| Caustics | hold | 2 | 13.780 | 72.6 | +91.9% | 7,030 |
| Caustics | parity | 2 | 13.725 | 72.9 | +91.1% | 7,078 |
| Caustics | lerp | 2 | 12.808 | 78.1 | +78.3% | 7,266 |
| Caustics | hold | 4 | 26.419 | 37.9 | +267.9% | 7,030 |
| Caustics | parity | 4 | 26.239 | 38.1 | +265.4% | 7,078 |
| Caustics | lerp | 4 | 23.449 | 42.6 | +226.5% | 7,266 |

Not evidence (policy did not engage): ZippyZaps refresh-only 6.635 FPS,
refresh + hold ×2 12.758; Caustics 6.931 / 13.308.

## Drift versus baseline (Fast, 12 frames, 8-bit channels, strip geometry)

Geometry caveat: the fixture declares a 2,000-pixel zone, so the compiler
synthesizes a 45×45 coordinate domain and the 256 rendered indices are its
first rows — a strip, not the 16×16 panel the earlier heading claimed. The
supplied 16×16 map is ignored by physical routing. Hold error grows with
the spatial gradient across each stride, and a strip of a wider domain
samples the field more finely per index than a 16×16 domain would, so
these numbers are a lower bound on 16×16 drift. The relative verdict —
lerp about half the hold's mean drift at the same K — is the finding
carried forward; absolute figures for a real surface come from the #937
contact sheets, not this table.

| member | variant | K | mean | RMSE | p95 | max | changed ≥ 2 |
|---|---|---:|---:|---:|---:|---:|---:|
| ZippyZaps | hold | 2 | 0.82 | 3.53 | 3 | 99 | 11.7% |
| ZippyZaps | parity | 2 | 0.89 | 3.85 | 4 | 99 | 12.0% |
| ZippyZaps | lerp | 2 | 0.47 | 2.85 | 2 | 93 | 5.2% |
| ZippyZaps | hold | 4 | 2.13 | 6.13 | 9 | 99 | 28.7% |
| ZippyZaps | parity | 4 | 2.17 | 6.23 | 9 | 105 | 29.0% |
| ZippyZaps | lerp | 4 | 1.26 | 4.57 | 5 | 101 | 15.5% |
| Caustics | hold | 2 | 6.06 | 14.81 | 31 | 162 | 39.5% |
| Caustics | parity | 2 | 6.04 | 14.56 | 30 | 149 | 39.5% |
| Caustics | lerp | 2 | 2.82 | 7.95 | 13 | 136 | 32.0% |
| Caustics | hold | 4 | 15.04 | 30.28 | 61 | 226 | 65.6% |

(Caustics parity ×4 and lerp ×4 rows are in `drift926.log` of the session;
the pattern holds: lerp ≈ half the hold's mean drift.)

## How the variants are built

All three wrap the compiled artifact the way #913 did: every `rgb(` paint
routes through one latch helper, and a new `render2D` gate decides per
pixel. `hold` replays the latch for `index % K != 0`; `parity` gates on
`(index + frame) % K` with the frame counter advanced in `beforeRender`;
`lerp` demotes the dispatcher to an inner function, evaluates it at
`min(index + K, pixelCount − 1)` on every anchor (plus once at index 0 for
the first anchor), keeps the previous lookahead as the current anchor
sample, and paints `cur + (next − cur) * (index % K) / K`. The ladder was
measured before the clamp, when the final anchor read a virtual pixel at
`index == pixelCount`; one lookahead per frame is cost-neutral, so the FPS
rows stand. Anchors are bit-identical to the
baseline for hold and parity and equal the baseline sample for lerp
(`issue926.test.ts`); every candidate compiles on the cached Controller
compiler.

## What a build would need

- The lerp lookahead as an emitter concern: the dispatcher synthesizes
  zone coordinates from the index for Installation Shows; a lookahead call
  is one more evaluation per anchor. Portable Shows (any zone count) take
  their coordinates from the firmware and keep the plain hold.
- Total latch coverage as a compile-time invariant (the #913 P1 class):
  every paint site, including transition arms and the black fallback.
- The catalogue contact-sheet sweep before any default; contact sheets
  for these two members are rendered from the same artifacts
  (`npm run render -- --file <wrapped.js>`), see the issue.
