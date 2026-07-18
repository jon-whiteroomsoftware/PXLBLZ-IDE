# Comparison: Show rendering next opportunities

Status: reviewed synthesis input
Date: 2026-07-17

## Shared conclusion

Both proposals reject “add another generic cache” as the next strategy. The
completed epic already established the useful boundary: memory wins when it
removes an expensive Pattern evaluation or expensive stable field, and loses
when it replaces cheap arithmetic with array access, control flow, and larger
generated artifacts. The next program should target whole evaluations,
conditional consumers, and capacity bottlenecks.

Both proposals also agree that the evidence system is now behind the compiler.
The exact coordinate candidate had a positive abstract work estimate yet slowed
2,000-pixel Redline by 6.43%. Array traffic, bytecode growth, and dispatch shape
are still confounded. A native micro-cost table and fixture-level ablation
harness should therefore precede additional automatic cache selection.

## Agreements

### Authored temporal reuse is the strongest near-term FPS candidate

Claude's Freeze/Refresh policy and Codex's member update-rate policy are the
same governing idea: explicitly trade temporal fidelity for fewer complete
member evaluations while replaying RGB from the existing arena. Both keep Live
as the exact default, treat reduced cadence as authored approximation, preserve
clock semantics as a separate choice, and use planner-owned lifetimes and
invalidation.

Claude contributes the more complete mechanism. **Freeze at entry** reuses the
already-qualified snapshot state machine for a Scene lifetime. **Whole-frame
Refresh** is simple but bursty. **Rolling Refresh** spreads a `1/k` update over
successive frames and bounds pixel age, at the cost of a staggered visual. The
mechanism has stronger direct evidence than any other new FPS proposal because
snapshot/live Crossfade already measured +76.7% on Redline's transition and
+58.1% over exact live/live in the acceptance Show.

### Content-aware early termination should generalize

Codex's coverage-directed layer stack and Claude's frame-level opacity/ramp
short-circuits extend the same measured fact: a source with no visible
contribution should not force an expensive Pattern evaluation when skipping it
is semantically safe. The current two-layer key already measured +59.9% median.

The proposals differ in scope, not principle. Frame-level 0/1 endpoints are the
cheapest exact slice. Three-layer and then five-layer top-down coverage extend
`N + U` composition to cumulative uncovered regions. Authored analytic coverage
can eventually avoid even the upper RGB evaluation when a Pattern exposes a
cheap mask.

### Scalar fields have more useful producers

Both proposals extend the shipped one-plane scalar contract beyond Dissolve.
Claude proposes static masks, vignettes, gradients, glyphs, and regions as
Effects. Codex additionally proposes an authored Pattern contract that
separates expensive geometry/coverage from cheap shading so one field can feed
several palette or color variants.

The Effect family is the smaller immediate slice. The Pattern contract has a
higher theoretical ceiling—`k(G + S)` can become `G + kS + replay` when
geometry `G` dominates—but first needs a stock-library census proving that
real Patterns naturally contain this decomposition.

### Capacity needs its own optimization track

Both proposals distinguish “faster per frame” from “more Patterns fit.” Shared
Motion kernels proved that source and bytecode can fall by more than one third
with no FPS change, and the five-member acceptance Show already uses 170 of 256
persistent globals.

Claude proposes lifetime-coloring persistent globals for non-overlapping
Restart-only instances. Codex proposes one parameterized Pattern body with
instance state in an indexed array. Both preserve independent state. The
Restart liveness approach is smaller, avoids array traffic in active renderers,
and has a cheap compile-only census, so it should be tested first. State-vector
virtualization remains a fallback if repeated source/global pressure persists.

### Hardware evidence remains authoritative

Both proposals retain paired artifacts, 256/1,000/2,000-pixel Controller runs,
Fast/Precise parity for exact work, named visual deltas for approximations, and
restoration in `finally`. Neither treats source bytes, operation counts, VM
words, or browser timing as an FPS proxy.

## Claude's distinct contributions

### Micro-cost and ablation prerequisites

Claude identifies two concrete missing instruments:

1. extend the hardware profiler with array/global/local reads and writes,
   function calls, branches, generated HSV conversion, and relevant bit costs;
2. compile fixture counterfactuals with member bodies, capture wrappers, and
   composition selectively stubbed to attribute actual milliseconds.

This is more actionable than Codex's general call for calibrated profiles and
should lead the roadmap.

### `previous-rgb` Trails and Decay

The arena already declares `previous-rgb`, but no producer uses it. Claude
recognizes that a feedback Effect is not primarily an optimization; it is a
high-value LED visual that the new architecture makes cheap. The serial-output
microbenchmark already places three reads, three writes, and RGB output at the
wire floor. The open questions are plane contention, behavior across snapshot
boundaries, faster-output cost, and deterministic seek duration.

### Restart-only persistent-global liveness reuse

Restart semantics create provably dead private state outside a clip's active
window. Coloring non-overlapping lifetimes onto shared scalar slots may reclaim
capacity without changing the active render loop. A census can kill or justify
the idea before emitter work.

### Steady-state direct emission

Claude traces remaining per-pixel wrapper cost: route to capture wrapper,
member output globals, emit wrapper, then firmware output. Direct output for
phases with no capture, key alpha, or color adaptation might remove calls and
global traffic. Prior specialization results demand hardware proof, but the
micro-cost and ablation spikes make this candidate falsifiable.

## Codex's distinct contributions

### Authored field/coverage/shading decomposition

Pixelblaze Patterns can expose more than one internal render function. Codex
uses that freedom as a semantic performance contract: an expensive scalar
producer, optional exact coverage, and one or more cheap shading functions. It
could let several configured Pattern variants share fractal iteration, noise,
distance, or mask work while applying different palettes and controls.

This is the clearest route from “Patterns configured with different
properties” to less computation, but it is a larger authoring and compiler
contract than Claude's Effect-family extension. It should follow a library
census and one authored demonstration rather than lead the next implementation
arc.

### General multi-layer coverage composition

Claude's endpoint short-circuit addresses frame-constant invisibility. Codex
extends current keying to arbitrary top-down stacks and makes cost
output-dependent: top pixels plus pixels uncovered by the layers above. This
can compound savings across sparse overlays and organic black-background
Patterns. It should grow from the existing two-layer key, not be designed as a
new compositor.

### Shared Effect and adaptation kernels

Motion sharing suggests a systematic representation pass for repeated Effect
stacks, adaptation wrappers, property-track shapes, and stack compositors.
This is a bytecode/capacity candidate, not an FPS claim, and complements
Restart-global reuse.

### Packed route/plan lookup and spatial sample-and-hold

Codex proposes a 2,004-word lookup alternative for highly irregular physical
routing and an authored blocky spatial policy for topology-proven contiguous
maps. Both are sharply bounded, but neither has evidence that its target occurs
often enough to outrank the shared candidates. Keep them as kill-tests, not
roadmap commitments.

## Material disagreements

### Instrument first or build the obvious extension first

Codex initially ranked coverage-directed stacks ahead of instrumentation.
Claude puts micro-cost and ablation spikes first. Claude's ordering wins. The
coordinate-cache regression proves that structural operation counts do not
price array and code-shape exchanges reliably. Coverage endpoints can remain a
very small parallel exact slice, but new planner economics should wait for the
profile.

### Freeze/Refresh or field decomposition as the first large feature

Claude ranks temporal reuse first; Codex ranks coverage and field decomposition
first. Freeze/Refresh wins near-term priority because it reuses qualified
mechanisms, attacks whole-member cost, and has direct Controller evidence.
Field decomposition may ultimately scale better across several variants, but
its compatibility incidence and Pattern-author ergonomics are unknown.

### State-vector virtualization

Codex ranks array-backed state virtualization as a primary capacity track.
Claude explicitly defers it because indexed state access spends array words and
likely slows active code. Claude's objection wins for now. Run the Restart
liveness census first, then Effect/kernel interning. Reopen state vectors only
if real artifacts remain global/byte limited and a hardware counterfactual
shows acceptable runtime cost.

### Rolling Refresh certainty

Claude describes rolling refresh as an even-cost variant; Codex describes only
cadence refresh and flags state policy. Rolling refresh is mechanically
plausible but visually uncertain: staggered pixel age may shimmer, and writing
and replaying the same buffer needs careful per-index readiness. It should not
be bundled into the first Freeze slice. Qualify whole-frame Freeze and Refresh
first, then test rolling refresh as its own authored visual.

## Rejected or deferred ideas

- Exact transformed-coordinate caching remains disabled after its repeatable
  6.43% loss. A different hardware profile or substantially smaller emitter is
  required before reconsideration.
- A second full RGB framebuffer cannot fit the 2,000-pixel contract.
- Automatic temporal or spatial approximation from observed motion is rejected;
  Freeze, Refresh, and block sampling must be authored.
- Packed RGB remains deferred until a real concurrent-role census demonstrates
  pressure that justifies quantization and unpack cost.
- Universal table-driven routing is rejected. A packed lookup may be tested
  only for irregular layouts that exceed specialized-branch break-even.
- General compiler-inferred field extraction is deferred in favor of an
  authored contract.
- Property-specialized kernels and generated branch reduction retain their
  measured-neutral status; smaller source alone does not establish FPS.

## Resulting direction

The coherent synthesis is evidence-first, then whole-evaluation reuse, then
capacity:

1. measure native cache costs and fixture-level time attribution;
2. ship explicit Freeze, then qualify Refresh variants;
3. extend exact conditional composition from frame endpoints to multi-layer
   coverage;
4. add useful scalar-field Effects and census Patterns for a field/shading
   authoring contract;
5. test `previous-rgb` Trails/Decay as a cheap visual affordance;
6. reclaim capacity through Restart-global liveness and shared generated
   kernels;
7. pursue direct emission, state vectors, packed routing, packed RGB, or
   spatial sample-and-hold only when their kill-tests show a real target.
