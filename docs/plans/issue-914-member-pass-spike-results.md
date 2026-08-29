# #914 — Automating hand-proven member-Pattern moves: spike results

Wave-4 epic #903, candidate 12. The question: can the hand-proven
member-Pattern optimizations from `docs/guides/Optimizing Pixelblaze
patterns.md` — loop-index tabling and lazy position-only memoization — be
detected and applied mechanically as compiler passes over authored member
source, and is there enough eligible stock content to justify building them?

**Answer: decline both passes as builds; keep the analysis and its
verdicts as living evidence.** The detection rules work — proven by recall
against the pre-optimization sources of the hand-optimized demos and
precision against the shipped versions — but the measured economics say no
pass is worth building today: the hand sweep exhausted Rule A (one site
remains catalogue-wide), and Rule B's naive opportunity class evaporated
under paired hardware measurement — single cheap-call memoization is a
measured **loss**, per-frame coordinate transforms disqualify the
biggest-looking sites, and the surviving exact class is four marginal
op-chain sites. The spike's lasting value is the refined cost model
(subtree pricing against the profiled table, a ~10× mul memo breakeven),
two soundness rules the guide now needs (transform taint, sentinel range
proof), and one shippable pattern edit (IridescentFibers +5.3%).

## Detection rules

Both rules extend the #513/#566 frame-invariant analysis
(`src/engine/showFrameInvariantHoisting.ts`) with signals it deliberately
lacks; the spike's port lives in `test/perf-harness/issue914.ts`.

- **Rule A — loop-index tabling.** In render-reachable code, a `for` loop
  with a statically-known trip count (2–128; init/test/update literals,
  including the catalogue's dominant `i = i + 1` idiom) whose body contains
  a maximal call subtree depending only on the induction variable
  (module-scope table, filled at load) or induction variable plus
  frame/control state (beforeRender table, refilled per frame). The
  operand-tabling discipline holds: the site is replaced whole, never
  merged with neighbouring factors, so multiply order and both checksums
  are untouched. The fill loop replicates the site's induction-dependent
  single-assignment locals and computes the expression verbatim.
- **Rule B — lazy position-only memoization.** A maximal call subtree
  whose dependencies are position/index and immutable constants only,
  **priced against the profiled cost table** (`costs.md` ×mul ratios):
  the subtree's estimated device cost must clear a ~10× mul breakeven,
  because the lazy read path — floor 1.9 + bound compare + array read 1.6
  + sentinel compare + branch — runs ~7× mul. This gate is measured, not
  modeled: memoizing a single `atan2` (2.7× mul) lost 12.9% and 5.5% on
  hardware (below). Cached in a `pixelCount` array filled lazily per index
  with sentinel 0 (a 0-valued result recomputes each frame — exact either
  way; a value-shifted sentinel is NOT float64-exact, so sentinel 0 is the
  only mechanical choice unless value-range analysis proves 0 impossible).
  Control-coupled sites are **needs-invalidation** (the PulseLoom class:
  refill when a slider moves); frame-dependent subtrees are not candidates
  at all. **Position stability itself is gated:** any per-frame call to a
  firmware coordinate transform (`rotate`, `translate`, `scale`,
  `resetTransform`, 3D variants) animates the mapping feeding render's
  position params, so such a Pattern has no exact sites
  (BlueHolidayStar2D's beforeRender `rotate()` is the ground case — its
  31× mul triple-`pow` site looked like the catalogue's best candidate and
  would have frozen frame-one coordinates).

Three classifier extensions were forced by ground truth — each invisible
without it:

1. **Copy-propagation with kill positions.** A local's declarator class is
   valid for reads before its first reassignment (hoisted to the start of
   any loop containing one). Kishimisu's `exp(-len0)` reads `px`/`py`-derived
   values before the octave loop reassigns them; flow-insensitive
   mutation analysis kills the site.
2. **Out-var classification.** `Shader.toUV`-style helpers return values by
   writing globals (`ux`/`uy`), which reads as render-mutation. A
   fixpoint joins each writer's call-site argument classes into its
   parameter classes and each assignment's class into the global's class;
   self-feeding accumulators (any RHS reading a render-mutated global) are
   excluded, since they carry state across pixels.
3. **Interprocedural pure-value functions.** Post-bundle library helpers
   (`smoothstep`) are top-level functions; a fixpoint marks bodies that
   assign only locals, call only pure builtins or pure functions, and read
   only params/locals/immutable globals. A call classifies as the union of
   its argument classes.

Plus one suppressor: the shipped Kishimisu's lazy-fill arm still contains
`exp(-len0)`; the store-through-a-local-into-a-subscript idiom classifies
it **already-cached** so a pass would not stack a redundant second cache.

### Recall / precision (ground truth)

Fixtures in `test/perf-harness/fixtures/issue914/` preserve the
pre-optimization sources from git history (`5cace60a^`); tests in
`issue914.test.ts`:

- Pre-table NeonSquircles: Rule A finds ≥3 module-table sites (the colour
  `cos` terms) and the index+time anim term as a frame-table site, all at
  trip count 20 — exactly what the hand pass tabled (+25.3%).
- Pre-memo Kishimisu: Rule B finds `exp(-len0)` as an exact site.
- Shipped NeonSquircles: zero Rule A sites. Shipped Kishimisu: zero exact
  `exp` sites; one already-cached.

## Methodology, claim scope, and where the census tool lives

The census was produced by a spike-local static analyzer (detection rules
over acorn ASTs, extending the #513/#566 frame-invariant classification
with loop-index and position signals, a device cost model, and a modeled
language subset with conservative exclusion). Its final state is archived
in git history at commit feee49f1 (`test/perf-harness/issue914.ts` plus
the recall/precision/census tests, all passing there); it is deliberately
NOT kept in the tree as tested infrastructure. Nineteen candidate-review
rounds demonstrated why: a committed analyzer implicitly claims soundness
over arbitrary member source, an unbounded surface that adversarial
review probes indefinitely, while the census it produces had not moved in
any decision-bearing class for the final eight rounds. The tool is
methodology; the repository keeps its evidence.

What the repository claims, precisely:

- The paired hardware measurements (`issue914-transform-pairs.json`) and
  the per-mode checksum parity of the four hand-generated transforms
  (`issue914.test.ts`, executing only the emulator bench over committed
  fixtures) are reproducible, executable evidence.
- The committed census (`issue914-eligibility-census.json`) is a dated
  data artifact: the archived tool over the 101-Pattern catalogue as of
  this issue. The tail counts carry the tool's residual scope/aliasing
  approximations (reviews found edge cases in constructs no stock
  Pattern uses); the decision-bearing classes — zero exact memo sites,
  one tabling site — were additionally verified by hardware measurement,
  which is the evidence the decline rests on.
- Re-running the census is part of any future build proposal or major
  catalogue change, using the archived tool or a successor — a deliberate
  step, not an auto-running suite with implied soundness.

## Eligibility census (101 stock Patterns; 83 analyzed, 18 outside the subset)

Analysis runs where a real pass would sit: post-bundle, post-manifest-strip,
post-tiny-helper-inlining (the `showMemberLowering.ts` step-3 seam), so
library helpers are visible as top-level functions.
`ISSUE914_CENSUS_OUT=1` writes `issue914-eligibility-census.json`.

| Rule | Sites | Where |
|---|---:|---|
| A module-table | 0 | — |
| A frame-table | 1 | IridescentFibers (10-iteration `sin(t + layer)` term) |
| B exact (≥10× mul total AND an exp/pow-class call, position-stable) | **0** | — (among the 83 analyzed; the 18 excluded are unknown, and the decline is robust to them — see Recommendation) |
| B below-breakeven | 98 | the `atan2`/`hypot`/`clamp`/`frac` tail across 35 Patterns — including four op-chain sites past the total threshold (ClockworkIris 11.4×, HelixForge3D 13.1×, NebulaSphere 13.1×, SceneSplice 13.5×) that the measured op-chain loss demotes |
| B needs-invalidation (control-coupled) | 8 | ImpactEngine ×2, LavaLamp3D, LineDancer2D, NebulaShells3D, PerlinKaleidoscope2D, SceneSplice, SceneSplice3D |
| B disqualified by animated transforms | — | BlueHolidayStar2D and CarriesHolidayStar2D's 31× mul triple-`pow` star distances (per-frame `rotate()`) |
| C palette | 2 | NebulaSphere, PlasmaNebula |

Reading: the hand sweep (#248/#266) genuinely exhausted Rule A on IDE
content, and the external cohort's loops are dynamic-bound
(`octavesM`-style) or accumulator-carried, which the rules correctly
refuse. The ZRanger1 cohort — the unoptimized class this spike hoped to
harvest — ends with **zero exact sites**: its per-pixel `atan2`s price
below the read path, its heavyweight star distances sit under animated
transforms, and LineDancer2D's site is both helper-scoped and
control-coupled.

One helper-scoped site: LineDancer2D's `atan2` sits inside `kal(x, y, t1)`
where `index` is not in scope; recorded as an eligibility precondition —
**a site must have `index` in scope after tiny-helper inlining.**

## Hand-generated transforms, measured

Four fixtures apply the mechanical generation shape (bare module cache +
built stamp, allocate-once in `beforeRender` when `pixelCount > 0`,
floored and bounded index, sentinel 0; table fills replicate dependent
locals verbatim): `CoronalMassEjection.memoized.js` and
`TunnelOfSquares2D.memoized.js` (the below-breakeven `atan2` class, kept
as the negative evidence), `IridescentFibers.tabled.js` (Rule A
frame-table), and `ClockworkIris.memoized.js` (the surviving exact class —
an op-chain site whose value is legitimately 0 in the inter-ring gaps, so
the sentinel recomputes there: the honest economics of the mechanical
sentinel rule).

**Exactness: proven.** `benchDemo` checksums are bit-identical for all
four pairs in Fast float64 AND Precise 16.16 (`issue914.test.ts`; the
emulator is the checksum guard here, not the stopwatch — §9's caveat that
it reads table wins backwards).

**Hardware (Burner bag, pb32 fw 3.67, 256 px native map,
`issue914-transform-pairs.json`):**

| Pattern | class | base → transformed median FPS | Δ | bytecode |
|---|---|---|---:|---|
| CoronalMassEjection | B below-breakeven (`atan2`, 2.7×) | 70.86 → 61.75 | **−12.9%** | 462 → 666 B |
| TunnelOfSquares2D | B below-breakeven (`atan2`, 2.7×) | 27.83 → 26.32 | **−5.5%** | 702 → 906 B |
| ClockworkIris | B op-chain past total threshold (11.4×) | 37.81 → 35.05 | **−7.3%** | 1450 → 1654 B |
| IridescentFibers | A frame-table (10× `sin` term) | 4.38 → 4.61 | **+5.3%** | 1428 → 1544 B |

Three of four generated transforms are measured losses. The read path
(floor + bound compare + array read + sentinel compare + branch) beats
`atan2` outright, and even an 11.4×-mul op chain loses — partly the
interpreted-op pricing, partly ClockworkIris's honest sentinel economics
(the band value is legitimately 0 across the inter-ring gaps, so those
pixels pay the read path AND the recompute every frame). The catalogue's
only measured-positive memos — Kishimisu's `exp(-len0)` +2.5% and
PulseLoom's exp-bump caches +37.6% — are exp-dominated with proven
nonzero ranges, which is exactly what the final gate demands. The one
Rule A site is a genuine +5.3%, delivered by a mechanical transform that
holds both checksums.

## Ledger gating rule (Rule B arrays)

A memo array costs `pixelCount + PIXELBLAZE_ARRAY_HEADER_WORDS` (= 4) VM
words at the Show's output pixel count, permanent once allocated. Gate:
price each selected site against `buildShowVmResourceLedger`'s
`remainingWords` after all existing allocations (render-target planes
included), selecting in descending estimated-saved-work order; a candidate
that does not fit is rejected with a
`{ status: 'rejected', reason: 'vm-word-budget', estimatedSavedWork,
detail }` decision mirroring the render-target planner's shape — reported,
never silent. At 2,000 px beside the three-plane arena
(10,240 − 6,012 = 4,228 free), two 2,004-word memo arrays fit and a third
rejects; at 256 px each costs 260 words. Added source is also priced
against `SHOW_ARTIFACT_BUDGET_BYTES` like `selectShowFrameInvariantHoists`.

## Recommendation

**Decline both passes as compiler builds.**

- **Rule A (index tabling):** the detection works and the transform is
  measured (+5.3%, bit-exact), but the hand sweep left exactly one
  eligible site in 101 Patterns. A compiler pass for one site is pure
  liability; the win ships as a one-line pattern edit instead — the
  checksum-proven `IridescentFibers.tabled.js` fixture is the edit,
  proposed as a small follow-up (stock-content edits fan out across census
  suites, `docs/agents/stock-content.md`).
- **Rule B (lazy memoization):** among the 83 Patterns inside the
  modeled subset, the profitable class — position-stable,
  exp/pow-dominated, sentinel-provable, `index` in scope — has **zero**
  sites; every broader class measured negative on hardware. The 18
  excluded Patterns are unknown to the tool, and the decline does not
  need them to be: it rests on the measured economics. Only
  exp/pow-class subtrees clear the ~7×-mul lazy read path, and the
  strongest single-call site ever measured (Kishimisu's `exp(-len0)`,
  13.3× est) bought +2.5% — so a qualifying site, wherever one exists
  or appears, is worth a Kishimisu-style hand edit to that one Pattern,
  never a compiler pass. Reopening the pass question requires new
  economics (a cheaper read path or a heavier eligible class), not a
  new site; re-running the archived census is the first step of any
  such proposal.
- **Rule C (palette specialization):** two static-stop sites
  (NebulaSphere, PlasmaNebula); stays a census-recorded candidate of the
  #907 family, not built from this issue.
- **Guide additions earned by measurement:** the memo breakeven model
  (read path ~7× mul; single cheap calls and op chains lose; only
  exp/pow-class sites with proven nonzero range pay), the per-frame
  coordinate-transform taint (a beforeRender `rotate()` silently breaks
  any position-keyed cache), and the float64 non-exactness of value-shift
  sentinels.

## Evidence

- `test/perf-harness/issue914.ts` — detection rules (spike-local port).
- `test/perf-harness/issue914.test.ts` — recall/precision, checksum
  parity, census with coverage invariants.
- `test/perf-harness/fixtures/issue914/` — pre-optimization ground truth
  (provenance in headers) and the three generated transforms.
- `test/perf-harness/issue914-eligibility-census.json` — full census.
- `test/perf-harness/issue914-transform-pairs.json` — paired hardware
  measurements.
