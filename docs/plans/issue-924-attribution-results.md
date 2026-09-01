# #924 — Wave-5 frame attribution at 256/500 px, and three cost rows

Wave-5 epic #923. Measured 2026-09-01 on the bench pb32 ("Burner bag",
firmware 3.67, native-serial output, declared profile absent → stamped
`native-serial (assumed)`). Runner: `test/perf-harness/issue924.hardware.test.ts`;
raw samples: `test/perf-harness/issue924-attribution.json`; probe rows:
`test/perf-harness/issue924-probe-rows.md` (appended to
`show-runtime-costs.md` as round four).

## Verdict

**Under 500 px the split is bimodal, and the epic should treat it that way.**

- A heavy member alone in one zone (ZippyZaps, Caustics, Kishimisu) is
  **95–97% member work** at both sizes. Show machinery is 4.1 ms at 256 px
  and 8.2 ms at 500 px regardless of member — about 16 µs/pixel for the
  simplest possible Show (one full-Stage zone, no effects). For these
  frames only the member-side levers move the number: the hold and its
  interpolated variants (#926/#927), quality (#932), unrolling (#931),
  display-exact strength reduction (#933), transcendental substitution (#934).
- A choreographed Show with light or medium members is **machinery-bound**:
  Redline 36%, aperture-shapes 19%, Portable zones 12–14%, the five-Pattern
  acceptance Show 62–67% Show overhead. The exact generated-code children
  (#928 route constants, #929 wrapper chain, #930 temporaries, #936 latched
  decode) pay here: 15–46 ms of removable machinery per frame at 500 px.
- The wire is 8.0 ms at 256 px (the ~124.5 FPS cap, not the 7.7 ms wire)
  and 15.3 ms at 500 px. It is 6–30% of light frames and under 6% of heavy
  ones; no candidate needs to care about it in this round.

The `render` vs `render2D` dispatch question (#936's folded probe) is
**closed with no build**: all four trivial entry points measure the same
median at 256, 500, and 2,000 px (8.032 / 15.348 / 60.353 ms) — the
firmware's reported FPS is quantized and the trivial frame is floor-bound,
so any dispatch difference is below the instrument. Recorded so it is not
re-proposed without a finer instrument. (The map probe confirms `render2D`
is the renderer called at every size, so the probes did compare the entry
points they name.)

## Attribution ladder (median FPS; ms = 1000/FPS)

Ladder: `trivial-output` (one constant `rgb`), `constant-members` (Show
scheduler, routing, effects, composition intact; member bodies replaced by
constants), `full`. Artifacts compile once at master 2,000 px and are
measured at 256 and 500 physical pixels (#555 convention); the Installation
Show therefore renders only its zone-0 placement at these sizes. Capture
elision was not exercised (recorded as unresolved Show overhead, as #531
did for ineligible fixtures).

Two qualifications the review surfaced (2026-09-01):

- **500 px rows of coordinate-routed fixtures are half-map rows.** The bench
  carries a 256-point map; the firmware keeps calling `render2D` above it
  with `x = index / pixelCount`, `y = 0.5` (measured, see the device
  behaviour notes). Pixels 256-499 of `portable-zones` and `aperture-shapes`
  therefore sit on the centre line and route by `x` alone, a different zone
  mix than a 500-point map would give. Their 256 px rows are the qualified
  attribution; the 500 px rows are kept as measured, labelled `half-map`.
- **Two fixtures are timeline windows, not steady holds.** The window is
  seconds 2-6 after activation. `aperture-shapes` changes Scene every 3 s
  and the acceptance Show's first hold is 1 s followed by a 6 s Crossfade,
  so those rows attribute the Show *as choreographed over that window*
  (the same window #531 used for the acceptance Show), not a steady state.
  The other six fixtures hold their first Scene for 20 s or more.

| fixture | routing | px | trivial | const | full | floor ms | Show ms | Pattern ms | full ms | Show % |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| redline-reference | index | 256 | 124.502 | 34.826 | 17.377 | 8.03 | 20.68 | 28.83 | 57.55 | 35.9 |
| hsv-steady-light | single | 256 | 124.502 | 82.382 | 70.788 | 8.03 | 4.11 | 1.99 | 14.13 | 29.1 |
| heavy-steady-zippyzaps | single | 256 | 124.502 | 82.341 | 6.903 | 8.03 | 4.11 | 132.71 | 144.86 | 2.8 |
| heavy-steady-caustics | single | 256 | 124.502 | 82.341 | 7.547 | 8.03 | 4.11 | 120.36 | 132.50 | 3.1 |
| heavy-steady-kishimisu | single | 256 | 124.502 | 82.341 | 11.204 | 8.03 | 4.11 | 77.11 | 89.25 | 4.6 |
| portable-zones | coordinate | 256 | 124.502 | 42.281 | 8.772 | 8.03 | 15.62 | 90.35 | 114.00 | 13.7 |
| aperture-shapes (window) | coordinate | 256 | 124.502 | 38.123 | 10.690 | 8.03 | 18.20 | 67.31 | 93.55 | 19.5 |
| five-pattern-acceptance (window) | index | 256 | 124.502 | 30.877 | 27.695 | 8.03 | 24.36 | 3.72 | 36.11 | 67.5 |
| redline-reference | index | 500 | 65.153 | 17.893 | 8.929 | 15.35 | 40.54 | 56.11 | 112.00 | 36.2 |
| hsv-steady-light | single | 500 | 65.153 | 42.469 | 36.489 | 15.35 | 8.20 | 3.86 | 27.41 | 29.9 |
| heavy-steady-zippyzaps | single | 500 | 65.153 | 42.490 | 3.540 | 15.35 | 8.19 | 258.97 | 282.50 | 2.9 |
| heavy-steady-caustics | single | 500 | 65.153 | 42.490 | 3.868 | 15.35 | 8.19 | 234.97 | 258.50 | 3.2 |
| heavy-steady-kishimisu | single | 500 | 65.153 | 42.490 | 5.742 | 15.35 | 8.19 | 150.63 | 174.17 | 4.7 |
| portable-zones (half-map) | coordinate | 500 | 65.153 | 21.761 | 3.887 | 15.35 | 30.61 | 211.30 | 257.25 | 11.9 |
| aperture-shapes (half-map, window) | coordinate | 500 | 65.153 | 20.388 | 5.482 | 15.35 | 33.70 | 133.36 | 182.41 | 18.5 |
| five-pattern-acceptance (window) | index | 500 | 65.153 | 16.268 | 13.423 | 15.35 | 46.12 | 13.03 | 74.50 | 61.9 |

Reading the table:

- The steady single-zone fixtures scale with N between 256 and 500 px
  (Show 4.11 → 8.19 ms, ×1.99; heavy-member Pattern work ×1.95–1.96;
  Redline Show ×1.96, Pattern ×1.95), so per-frame fixed cost is small
  there. The half-map and window rows do not (Portable Pattern work ×2.34,
  acceptance Pattern work ×3.50, acceptance Show ×1.89): their 500 px rows
  see a different zone mix and a different slice of the timeline, which is
  exactly why they are labelled rather than averaged.
- The single-zone Show machinery floor is 16 µs/pixel: at 256 px the
  constant-member rung of every single-zone fixture lands on the same
  82.34 FPS. That is the wrapper chain (#929), capture, and emit — the
  cheapest possible Show still costs a light member (EasedSweep, 2 ms)
  twice over.
- At 256 px, coordinate-routed Portable Shows carry 61–71 µs/pixel of
  machinery (portable-zones 61, aperture-shapes 71 over its window),
  index-routed Redline 81 µs/pixel, the acceptance Show 95 µs/pixel over its
  window. The wave-4 audit's per-pixel constants (#928) and the wrapper
  chain (#929) live inside these numbers.

## Added fixtures (separate labelled run, 256 px)

The issue's remaining partitions — the slow member, and the wave-2
effect-tax and mirror fixtures — were measured in a second, filtered run
(`issue924-attribution.added-fixtures.json`, `partial: true` by
construction, 256 px; the 500 px pass of that run failed on a Controller
request timeout after these rows and is not reported):

| fixture | routing | px | trivial | const | full | floor ms | Show ms | Pattern ms | full ms | Show % |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| heavy-steady-phantomstar | single | 256 | 124.502 | 82.341 | 8.162 | 8.03 | 4.11 | 110.37 | 122.51 | 3.4 |
| effect-tax (window) | single | 256 | 124.502 | 35.000 | 28.077 | 8.03 | 20.54 | 7.04 | 35.62 | 57.7 |
| mirror | single | 256 | 124.502 | 47.501 | 6.783 | 8.03 | 13.02 | 126.38 | 147.43 | 8.8 |

- PhantomStar inside a Show runs at 8.2 FPS at 256 px (its quality slider
  default gives 67 raymarch steps); the standalone 0.24 FPS figure in the
  optimization guide is from a different configuration. Member-bound like
  the other heavy members (3.4% Show).
- The two per-member colour Effects (hue rotate, posterize) cost 16.4 ms
  at 256 px on top of the 4.1 ms single-zone floor — ~64 µs/pixel of
  generated Effect arithmetic, the largest machinery share measured in
  this round. That is the #558/#907 posterize-branch territory and belongs
  on the wave-5 list as an exact candidate.
- The Mirror Effect's per-pixel mapping costs 8.9 ms at 256 px (~35
  µs/pixel) over the same floor.

## Cost rows (round four of `show-runtime-costs.md`)

Paired-baseline profiler, `beforeRender`, 2,593 iterations, 5 samples,
256 px (`test/perf-harness/issue924-probe-rows.md`; raw per-repetition
frame times in `issue924-probe-rows.samples.json`). The unrolled probe
pairs an eight-body `i++` loop against a one-body `i++` loop over the same
body count (`n8 * 8`, `n8 = floor(n / 8)`), so the two differ only in loop
machinery; the runner normalizes per `iters`, and `n8 * 8` is within 7 of
`n` (0.27%).

| operation | paired baseline | median net µs | vs mul | reading |
|---|---|---:|---:|---|
| loop iteration, `i = i + 1` idiom | identity `i++` loop | +1.708 | 2.1× | the catalogue's dominant increment idiom costs 1.7 µs/iteration more than `i++` |
| unrolled ×8 body | `i++` loop, `n8 * 8` trips | −2.752 | −3.4× | −7/8 of one iteration's machinery, so an `i++` loop's compare + branch + increment is **3.15 µs/iteration**; with `i = i + 1` it is **4.85 µs/iteration** |
| single-use local | fused expression | +1.471 | 1.8× | routing a value through a `var` read once costs the write, 1.47 µs — matching the #532 local-write row, now measured as a substitution rather than an added write |

Consequences the children inherit:

- #931 (unrolling): the per-iteration prize is 3.15 µs (`i++`) or 4.85 µs
  (`i = i + 1`); a 10-trip loop is 31–49 µs/pixel. The idiom rewrite
  `i = i + 1` → `i++` alone is a 1.7 µs/iteration exact win and needs no
  bytecode growth — it ships inside #931 as the first step.
- #930 (temporaries): each eliminated single-use local is 1.47 µs/pixel.

## Method notes

- Sample windows: 4 s (6–8 s for heavy members, which report 3–7 FPS;
  40 s for PhantomStar). The window sits inside the first Scene's hold for
  every fixture except the two labelled `window` above (aperture-shapes and
  the acceptance Show), whose rows attribute the choreography over seconds
  2–6.
- Constant-member twins are not always smaller than the full artifact (the
  aperture Show's grew 2%): a constant member loses specializations the real
  member qualified for. The ladder attributes that difference to Show
  overhead, as #531 did.
- Restoration: original active Pattern and 256-px count restored and
  verified in `finally` on a fresh connection whenever the probe socket has
  dropped (#906/#915); the pixel map was never touched.
- PhantomStar (~0.24 FPS) is measured in a separate labelled run
  (`issue924-attribution.added-fixtures.json`, 40 s windows) together with
  the wave-2 effect-tax and mirror fixtures; see the added-fixtures table.
