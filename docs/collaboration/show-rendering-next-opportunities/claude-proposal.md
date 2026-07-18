# Show rendering next opportunities — Claude proposal

Status: independent research proposal
Date: 2026-07-17
Task: `docs/plans/show-rendering-next-opportunities-task.md`

## Recommendation

After the render-target epic, compiled-Show frame time is dominated by authored
per-pixel Pattern arithmetic, not by composition overhead. Exact Redline runs at
about 3.04 FPS at 2,000 pixels: roughly 60 ms of each ~330 ms frame is the
serial output floor, leaving ~270 ms (~82%) in Pattern evaluation and
composition — about 135 µs, or ~190 multiply-equivalents at the measured
0.703 µs/multiply, per pixel. The acceptance Show is heavier still (~465
µs/pixel at 1.076 FPS exact). The shipped exact passes have already removed most
provable dead work; the remaining large wins therefore come from **authored
temporal-reuse policies** that spend the existing arena to replace whole-member
evaluation with replay, and from **cheap visual affordances** the arena now
makes nearly free. Exact compiler work still matters, but its remaining
candidates are single-digit percent and must be gated on two inexpensive
instrumentation spikes that the current evidence base clearly lacks.

Ranked opportunity map (research spikes first, then candidates):

| Rank | Item | Kind | Primary axis | Expected payoff |
| --- | --- | --- | --- | --- |
| S1 | Micro-cost profiler extension: array/global/local access, call, branch, generated HSV conversion | spike | evidence | calibrates every cache decision; explains #528 |
| S2 | Ablation attribution harness: where frame time goes per fixture | spike | evidence | answers research question 1 with hardware numbers |
| 1 | Freeze and Refresh-rate clip policies (Scene-lifetime snapshot hold, rolling refresh) | authored policy | FPS | ~2-4x on heavy backdrop members; mechanism proven at +58-77% for transitions |
| 2 | `previous-rgb` temporal Effects: Trails/Decay | affordance | new visual | high authored value at cost measured under the serial output floor |
| 3 | Scalar-field producer family: static masks, vignettes, gradients as Effects | affordance | new visual | reuses shipped #519 machinery; near-zero steady cost |
| 4 | Calibrated planner cost model in multiply-equivalents | compiler | selection quality | prevents future #528-class losses; no FPS claim |
| 5 | Frame-level compositor short-circuits (opacity 0/1 endpoints, zero-weight ramps) | exact | FPS | small, broad, near-free |
| 6 | Restart-instance persistent-global liveness reuse | exact | capacity | more Patterns per Show; 170/256 globals already used at five members |
| 7 | Steady-state direct-emit specialization (capture-wrapper and HSV-capture elision) | exact | FPS | single-digit %; gated on S1 |
| 8 | Packed-RGB plane representation | architecture | capacity | plan flexibility (concurrent roles); later |

The detailed candidate contracts follow the deliverable format below. Items 1-3
are the recommended next implementation arc once S1/S2 land; items 4-6 are
low-risk parallel compiler work; items 7-8 wait for measured justification.

### Spike S1 — micro-cost profiler extension

The committed `costs.md` table covers math built-ins only. No hardware
measurement exists for the operations every cache decision actually trades:
array element read, array element write, persistent-global read/write, local
read/write, a 0-3 argument user function call, an `if` branch on a global flag,
and the generated HSV-to-RGB conversion that `__pxlblz_show_capture_hsv` emits
for every captured hsv-output pixel. The #528 coordinate cache lost 6.43% while
its own work estimate predicted a win; without these numbers the planner cannot
distinguish "replay reads cost more than an 8-op producer" from "the 43%
bytecode growth changed dispatch cost." Extend `test/perf-harness/profiler.js`
and `profiler.ts` with these op codes, hand-load once, and commit the enlarged
table. Cost: hours. This spike is a prerequisite for candidates 4 and 7 and
sharpens every rejection criterion below.

### Spike S2 — ablation attribution harness

Nothing currently attributes a compiled Show's frame time across authored
Pattern math, composition/routing overhead, capture/replay work, and the output
floor. Build a devbench-style runner that compiles counterfactual artifacts of a
fixture (Redline, the acceptance Show, the five-surface fixtures) with specific
layers stubbed: (a) member render bodies replaced by constant `rgb()`, (b)
composition intact but capture wrappers elided, (c) full artifact, (d) trivial
output. The pairwise deltas attribute milliseconds by ablation on the
Controller, the same way #512's counterfactual options already isolate one pass.
This directly answers "where does time still go" with hardware evidence instead
of operation counts, and it sizes candidates 1, 5, and 7 before any of them is
prototyped. Cost: one to two days reusing `compileShow` options and
`controllerHardware.ts`.

### Candidate 1 — Freeze and Refresh-rate clip policies

**Repeated cost attacked.** The dominant one: full per-pixel evaluation of every
active member every frame, ~190-660 multiply-equivalents per pixel on the
measured fixtures, repeated even when the member's visual evolves slowly or the
author would accept a static backdrop.

**Mechanism.** Generalize the shipped snapshot/live Crossfade machinery from
Transition lifetime to Scene lifetime as two explicit clip evaluation policies:

- **Freeze at entry**: the first rendered traversal after Scene entry captures
  the member's complete output into planner-assigned `stage-rgb` planes; later
  frames replay it. Identical to the shipped snapshot capture/readiness/
  invalidation shape, held for the Scene instead of a boundary.
- **Refresh every t seconds**, with two pacing variants: *whole-frame* refresh
  (recapture on a schedule; simple, but the refresh frame costs a full
  evaluation, so pacing is bursty) and *rolling* refresh (each frame evaluates a
  `1/k` stride of pixels chosen by `index % k == phase` and replays the rest;
  cost is even, and every pixel's content is at most `k` frames old).

**Visual contract.** Explicitly approximate and authored, exactly like
snapshot/live Crossfade: a frozen or low-rate visual, never described as exact
continuation. The member's `beforeRender` clock policy remains a separate,
named fact. Rolling refresh additionally discloses staggered pixel age.

**Compatibility and invalidation boundary.** Scene entry/exit, Show-loop
re-entry, any pre-capture Effect or control change, and seek invalidate the
capture, using the existing generation/readiness pattern. A frozen backdrop
occupies all three planes for its Scene, so it conflicts with a snapshot
Crossfade at the Scene's outgoing boundary — favorably: the outgoing composite
is already captured, making the outgoing side of that Crossfade free. It
conflicts unfavorably with a simultaneous scalar field or shared-output plan;
the existing planner priority rules arbitrate, and a declined policy falls back
to live rendering with a disclosure, mirroring the arena-disabled snapshot
fallback.

**Expected tradeoffs.** CPU: a frozen member drops from full evaluation to
three plane reads plus compositing; a rolling `k=4` refresh of a ~190-mul-eq
member is roughly `190/4 + ~10` ≈ 58 mul-eq, about 3x for that member, with
whole-frame gain governed by the member's share (Amdahl). Memory: zero new
words; the policy binds existing planes. Source/bytecode: small — the capture
and replay emitters exist; the new code is policy plumbing plus the stride test.
Globals: one readiness/phase scalar per policy, matching #516's +1. Stack:
unchanged. Deterministic seek: Fast replay already reconstructs state from Show
start, so staggered pixel ages reconstruct exactly in preview; hardware does not
seek.

**Evidence.** The identical mechanism measured +76.7% median on Redline's
transition (#516) and +58.1% on the acceptance Show boundary (#520); the #515
micro-benchmark showed three-plane capture/replay/blend at the serial output
floor. Freezing extends the window from a 2-6-second Transition to a
10-30-second Scene, so the amortized payoff is strictly larger than the
measured transition case.

**Cheapest falsifying prototype.** Hand-compose a two-member fixture (one heavy
stock Pattern as backdrop, one cheap overlay) with a hand-written frozen and
rolling-refresh artifact; `devbench` against the live/live baseline at 256,
1,000, and 2,000 pixels. No compiler work needed to falsify the payoff.

**Rejection criteria.** Reject rolling refresh if the stride test plus replay
reads cost more than the evaluation they replace for the median stock Pattern
(S1 quantifies this); reject whole-frame refresh as a default if pacing
burstiness is visually objectionable on hardware review; reject the whole
candidate if planner conflicts force live fallback in most realistic plans
(check against the seventeen-Show census fixtures first).

**Interactions with shipped passes.** Builds directly on #515/#516/#517
machinery; composes with content-key composition (#527) — a frozen backdrop
under a keyed overlay costs replay plus `U` hole evaluations; the compile
summary reuses the snapshot disclosure vocabulary.

### Candidate 2 — `previous-rgb` temporal Effects (Trails, Decay)

**Authoring limitation attacked.** The arena's `previous-rgb` role is declared
in `showRenderTargetArena.ts` and the reference table but has no shipped
producer. Persistence/trail looks — the most characteristic LED aesthetic after
plain motion — currently require the author to hand-build feedback inside one
Pattern, which Shows cannot compose.

**Mechanism.** A new ordered clip Effect family: each presented frame writes the
final composite into `previous-rgb` planes and the next frame composites
`out = blend(live, previous * decay)` (max-decay for trails, lerp for smear).
The write happens at the existing capture boundary; the read adds three plane
reads plus blend arithmetic per pixel.

**Visual contract.** A new authored visual, not an approximation of anything;
frame `t` explicitly depends on frame `t-1`.

**Compatibility and invalidation.** The role needs all three planes for the
Effect's whole active lifetime, so it conflicts with snapshot Crossfade, frozen
backdrops, and shared output during overlap. The design must pick a policy:
suspend the trail across a snapshot boundary (trail fades in again after) or
force the boundary to live/live. Scene exit, seek, and loop re-entry clear
readiness; a partially warm buffer renders as the live frame (decay from
black), which is also the honest seek semantics — Fast replay reconstructs the
recursion from Effect start, so preview stays deterministic at higher seek
cost.

**Expected tradeoffs.** CPU: writes+reads+blend measured at the serial output
floor in the #515 table, so near-zero on the measured profile; faster output
hardware may expose it (the standing caveat). Memory: zero new words. Source and
bytecode: small emitter. Globals: one readiness scalar. FPS: neutral; this is an
affordance, not an optimization.

**Evidence.** The #515 operation table row "three writes, three reads, and RGB
output" at 16.57 FPS — the output floor — is the direct cost measurement.

**Cheapest falsifying prototype.** A hand-written 2,000-pixel pattern that
implements the trail loop over three arrays; `devbench` versus the same pattern
without the feedback path, on serial and, when available, a faster output
profile.

**Rejection criteria.** Reject as a default-available Effect if the faster
output profile shows a material cost, or if the planner-conflict policy cannot
be made comprehensible in the compile summary (an Effect that silently
disappears during every transition would be worse than its absence).

**Interactions.** First consumer of the declared `previous-rgb` role; exercises
the planner's overlapping-lifetime rejection path for real, which is currently
only synthetically tested.

### Candidate 3 — scalar-field producer family: static masks, vignettes, gradients

**Authoring limitation attacked.** #519 shipped the one-plane scalar-field
contract with exactly one producer (Dissolve's coherent noise). Static spatial
shaping — vignette, edge fade, glyph or region mask, radial/linear gradient — is
currently only possible by authoring it inside a Pattern, and recomputing such
geometry per pixel per frame is precisely the repeated work the field cache
already knows how to remove.

**Mechanism.** New Effect kinds whose parameter set names a field producer
(vignette shape, gradient axis, mask geometry) and whose per-pixel application
is `out = rgb * field(index)`. Each producer submits an exact Scene- or
property-epoch-lifetime candidate through the shipped planner path; a declined
candidate computes inline, exactly as Dissolve does today.

**Visual contract.** Exact: the field is a deterministic function of geometry
and frame-constant parameters; cached and inline paths must match Fast and
Precise checksums, the #519 discipline.

**Compatibility and invalidation.** Coordinate-domain key and lifetime rules are
already defined by `showScalarField.ts`; an animated mask parameter shortens the
lifetime to the property epoch and, below a profitability threshold, stays
inline. One plane per simultaneous field; multiple static Effects in one Scene
compete and the planner explains rejections.

**Expected tradeoffs.** CPU: producer cost (tens of ops for vignettes, more for
glyph tests) drops to one read per pixel after the first frame — the #519 shape
(+44% on a 48-op producer). Memory: zero new words. Source/bytecode: one emitted
producer body per field kind used. FPS payoff scales with producer expense;
cheap producers may be planner-declined, which is correct behavior.

**Evidence.** #519's measured +44.1% median for a comparable one-plane exact
field; #528's loss bounds the other side — a producer under ~10 ops/pixel
should not be cached, and the planner threshold (candidate 4) encodes that.

**Cheapest falsifying prototype.** Reuse the issue519 fixture with the noise
producer swapped for a vignette; verify checksum parity and run the
issue519-style hardware pass.

**Rejection criteria.** Per-producer: measured break-even from S1; a producer
family ships only when its cached form repeatably beats inline at 2,000 pixels.

**Interactions.** Pure extension of #519; increases planner contention with
candidates 1 and 2, which is the strongest argument for candidate 4.

### Candidate 4 — calibrated planner cost model

**Cost attacked.** Selection error, not runtime. `estimateSavedWork` ranks
candidates in abstract work units; #528 showed a candidate whose estimate was
positive and whose hardware result was a repeatable 6.43% loss. As candidates
1-3 multiply the number of things competing for three planes, uncalibrated
ranking becomes the binding risk.

**Mechanism.** Express every candidate's setup, replay, and avoided work in
measured multiply-equivalents from `costs.md` plus S1, per hardware profile.
Add explicit, documented break-even thresholds: a one-plane replay must avoid at
least `T_replay` mul-eq/pixel (S1 pins `T_replay`; current bracketing evidence
puts it between ~8, which lost, and ~48, which won). Keep bytecode-growth as an
independent gate: #528's 43% bytecode growth is a candidate cause of its loss,
and S2's ablation can separate the two.

**Visual contract.** None; compile-time only. **Tradeoffs.** Zero runtime
change; modest planner code. **Evidence.** #519 vs #528 is a natural
two-point calibration; S1 completes it. **Falsifier.** Re-run the #528
counterfactual under the calibrated model: it must be declined at 2,000 pixels
for the pb32 profile. **Rejection.** If measured op costs vary so much across
firmware/output profiles that a single table misleads, fall back to
conservative structural rules and per-profile qualification, as today.
**Interactions.** Improves every shipped and proposed cache; makes the compile
summary's "estimated work" language honest in physical units.

### Candidate 5 — frame-level compositor short-circuits

**Repeated cost attacked.** The emitter already renders a placement direct when
static opacity equals 1 and no track exists, but a placement with an opacity
*track* pays full per-pixel blend arithmetic — and full member evaluation — even
during frames where the ramp sits at exactly 0 or 1. Zero-weight members during
routing/adaptation ramps have the same shape.

**Mechanism.** Opacity and ramp values are frame constants. Compute per-frame
flags in the scheduler and branch once per pixel (or select the emit path per
frame) so an opacity-0 layer skips its member evaluation entirely and an
opacity-1 layer skips blend arithmetic. Exact by construction: skipping an
invisible layer's `render` is only exact when the renderer is proven
render-pure by the existing #518 Acorn analysis; unproven renderers keep
evaluation and skip only the blend.

**Visual contract.** Exact; Fast/Precise checksums must hold across ramp
endpoints. **Tradeoffs.** CPU: full member cost saved during endpoint frames —
material for entry/exit ramps that spend most of a Scene at an endpoint; ~1-2
ops/pixel of flag testing otherwise. Memory: none. Source: small. **Evidence.**
#527 measured +59.9% from the per-pixel version of the same idea; the
frame-level version is strictly cheaper to test. **Falsifier.** A two-layer
fixture with a long 0-hold opacity ramp, devbenched with and without the
short-circuit. **Rejection.** If added per-pixel flag branches measurably slow
non-ramped Shows (S2 attribution isolates this), restrict emission to Shows
with eligible ramps. **Interactions.** Complements #527; must respect the #520
lesson that transition bodies live in separate helper functions.

### Candidate 6 — Restart-instance persistent-global liveness reuse

**Limitation attacked.** The 256-persistent-global ceiling binds before CPU for
many-member Shows: the five-member acceptance artifact uses 170, and the census
projects ~185 for ten median members before routing and compiler globals. This
caps "combine more Patterns" regardless of FPS.

**Mechanism.** A Restart clip's private state is re-initialized at entry, so
its persistent globals are dead outside its active window. Color the globals of
provably non-overlapping Restart-only instances onto shared slots, emitting
entry re-initialization (which Restart semantics already require). Continue
instances, exported controls, and anything with cross-window liveness are
excluded conservatively.

**Visual contract.** Exact; checksums and deterministic seek must be
unchanged. **Tradeoffs.** Globals: the win axis; potentially large in
Scene-sequential Shows where members never overlap. CPU: unchanged steady
state; entry frames pay re-init they already conceptually owe. Source: small
init functions; symbol count unchanged or slightly up. **Evidence.** The
census tables and the acceptance artifact's 170/256 are the motivating
numbers; no hardware claim is made or needed. **Falsifier.** A compile-only
census over the seventeen saved-Show fixtures counting reclaimable slots; if
the median reclaim is small (most real Shows lean on Continue), the candidate
dies cheaply before any emitter work. **Rejection.** Reclaim below ~15% of
member globals, or any seek/loop-re-entry equivalence failure. **Interactions.**
None with the render loop; extends the ledger and compile summary ("globals
after liveness reuse").

### Candidate 7 — steady-state direct-emit specialization

**Repeated cost attacked.** Per-pixel indirection that survives #512: in steady
phases each pixel runs outer render → route branch → `renderCapture` wrapper →
authored renderer → `member_rgb` (three global writes) → `member_emit` (three
global reads plus `rgb()`), and hsv-output members pay a generated
`__pxlblz_show_capture_hsv` conversion in Show code rather than firmware-native
`hsv()`.

**Mechanism.** When a phase has no capture consumer, no key alpha, and identity
brightness, rewrite the member's output call sites (existing pass-engine
machinery) to call `rgb()`/`hsv()` directly, eliding the wrapper calls, global
traffic, and — for hsv members in uncomposited phases — the generated
conversion.

**Visual contract.** Exact. **Tradeoffs.** CPU: unknown until S1 prices calls
and global access; plausibly 5-15 mul-eq/pixel, i.e. single-digit percent on
heavy members, more on cheap ones. Source/bytecode: grows if phase-specialized
bodies duplicate renderers — the #513 kernel lesson says smaller or specialized
code is not automatically faster, so this ships only behind a repeatable
hardware win. Stack: slightly reduced. **Evidence.** Circumstantial only today;
S1/S2 make it decidable. **Falsifier.** Hand-elide the wrappers in one #518
fixture artifact and devbench the pair. **Rejection.** No repeatable 2,000-pixel
gain, or symbol/byte growth that erodes the #525 capacity win. **Interactions.**
Must preserve capture paths for candidates 1/2 and the routed-transition
function isolation from #520.

### Candidate 8 — packed-RGB plane representation (longer-term)

Packing quantized RGB into one plane via shift/mask bit operations would let one
plan hold a snapshot and a scalar field simultaneously, or two snapshots across
overlapping boundaries — a capacity and plan-flexibility play, not an FPS play.
It is honest to classify replay of quantized channels as approximate at the
16.16 axis even when 8-bit LED output would mask it, because post-replay
blending can shift final output by an LSB. Costs: pack/unpack ops per pixel
(unpriced until S1 covers bit ops), emitter complexity, and the documented
fixed-point shift traps. Hold until a real plan census shows concurrent-role
demand that the three-plane arena cannot satisfy; the falsifier is that census
plus a hand-packed devbench pair.

## User workflow

This run ships research artifacts, so the workflow below is the target shape
the candidates are designed against, not a committed UI.

An author building a 30-60-second Show composes Scenes and clips exactly as
today. Three new authored choices appear where their semantics live:

- **Clip evaluation policy** (candidate 1) joins the clip inspector beside
  entry behavior: Live (default), Freeze at entry, or Refresh every t seconds
  with a pacing choice. The picker uses the same explicit-approximation
  vocabulary as snapshot/live Crossfade: choosing Freeze states plainly that
  the visual stops changing while the clip's clock policy remains separate.
- **Trails/Decay and static-shaping Effects** (candidates 2-3) join the ordered
  clip Effect list with ordinary property targets, so boundary-owned ramps
  animate decay or vignette shape without new timing concepts.
- The **compile summary** remains the disclosure surface: the concise line
  extends the shipped pattern ("Frozen backdrop + one live Pattern per pixel";
  "Trails active - suspended during snapshot Crossfade"), and Advanced compiled
  cost lists each policy's plane occupancy, invalidation boundary, and the
  planner's accepted/declined explanation, as #517 already formats.

The author never manages planes, readiness, or invalidation. When policies
collide (a trail across a snapshot boundary), the compiler applies the
documented priority and names the fallback in the summary rather than silently
changing semantics.

## Information architecture and structure

- **Authored intent** stays in the Show record: evaluation policy on the clip,
  Effects in the clip's ordered list, all serialized like existing policies
  (snapshot/live precedent: absent policy keeps legacy behavior; new records
  get explicit defaults).
- **Selection** stays in the planner: every new producer/policy enters
  `showRenderTargetPlanner.ts` as a candidate with the existing lifetime,
  conflict, and exactness vocabulary. Candidates 1 and 2 add `stage-rgb` and
  `previous-rgb` producers; candidate 3 adds field producers. No new arrays and
  no fourth plane anywhere.
- **Evidence** stays in `test/perf-harness/`: S1 extends `profiler.js`/
  `costs.md`; S2 becomes a reusable attribution runner beside `devbench.ts`;
  each candidate that proceeds gets an issueNNN-style paired harness with the
  established `finally`-restore discipline.
- **Disclosure** stays in the compile summary's existing sections (render
  policy, materialization, ledger projection), extended rather than
  restructured.
- The ranked map, once reviewed, seeds the next epic's issue slices; failed and
  neutral results append to the cumulative ledger in the planner design doc so
  they are not re-attempted without new hardware evidence.

## Key interactions and states

- **Policy states.** A Freeze/Refresh capture has the same state machine as the
  shipped snapshot: unassigned → filling (first traversal) → ready → invalidated
  (Scene exit, loop re-entry, pre-capture change, seek). Rolling refresh adds a
  per-frame phase scalar; readiness is per-stride, and a seek rebuilds all
  strides from Show start in Fast replay.
- **Conflict resolution.** Required authored policies keep planner priority;
  when a trail Effect and a snapshot Crossfade overlap, the documented default
  is that the boundary wins the planes and the trail suspends for the boundary
  window, disclosed in the summary. The alternative (force live/live) remains
  an author-selectable override. This decision needs human review before
  implementation.
- **Preview parity.** Every policy renders identically in Fast and Precise
  preview and on hardware; frozen and rolling states are deterministic under
  seek because Fast replay reconstructs from Show start.
- **Failure states.** A declined policy never silently degrades: the clip
  renders live and the summary names the reason (conflict, no positive saving,
  arena disabled), matching the shipped fallback grammar.
- **Timeline signaling.** Scene X-ray and Super Detail gain read-only marks for
  frozen/refresh windows and suspended Effects so the author can see where a
  policy is actually in force without opening Advanced compiled cost.

## Accessibility and responsive behavior

The research deliverables have no UI. For the eventual authored surfaces, the
existing conventions carry over without new mechanisms: policy pickers and
Effect parameters are ordinary inspector controls (keyboard reachable, labeled
with scoped names such as "clip evaluation policy," never bare "mode"); compile
summary disclosures are text-first and readable by assistive technology;
Scene X-ray marks remain non-interactive decorations with their information
duplicated in the selectable inspector. Two candidate-specific notes: whole-
frame Refresh produces periodic frame-time spikes — visible judder, not flash,
so it is a quality concern rather than a photosensitivity one, but the pacing
choice should still name it; and Trails deliberately sustains motion smear,
which the preview should render faithfully rather than smoothing, so the author
judges the physical result. Narrow-window behavior follows the existing
timeline/inspector responsive rules; nothing here introduces a new layout
class.

## Implementation implications

- **Compiler.** Candidates 1-3 and 5 are emitter and planner extensions along
  shipped seams: new candidate kinds, new capture/replay call sites, and
  scheduler flags. Candidate 6 is a ledger/allocation pass with no render-loop
  change. Candidate 7 reuses pass-engine call-site rewriting. All keep
  `additionalArrayWords` at zero and the one-entry-point contract; routed
  transition bodies keep their #520 function isolation.
- **Resource axes.** Nothing here enlarges the envelope: zero new array words
  (all candidates bind existing planes), +1-2 persistent scalars per active
  policy, bounded source growth with the #513-style byte allowance, and
  explicit symbol accounting for any specialized bodies.
- **Verification.** Every exact candidate carries Fast/Precise checksum parity
  and a paired-counterfactual compile option; every authored policy carries
  deterministic-seek tests and a named visual contract; every FPS claim comes
  from a reversible Controller matrix at 256/1,000/2,000 pixels with the
  restore-in-`finally` discipline. Speculative FPS numbers in this document
  (the ~3x rolling-refresh model, the 5-15 mul-eq wrapper estimate) are
  hypotheses to be replaced by measurements, and are labeled as such.
- **Sequencing.** S1 and S2 first (days, high information value). Then
  candidate 1 behind its hand-built falsifier, candidate 2's hand-built cost
  probe, and candidate 6's compile-only census — all cheap kill-tests. The
  hardware matrix should add a faster/parallel output profile as soon as one is
  available, because candidates 1-3 lean on replay costs currently hidden under
  the serial floor.

## Alternatives considered

Preserved as evidence so they are not re-attempted without a materially
different mechanism or hardware profile:

- **Exact sample-coordinate caching** (#528): implemented, exact, and a
  repeatable -6.43% at 2,000 pixels; remains diagnostic-only. Its producer
  (~8 ops/pixel) sits below the replay break-even; candidate 4 encodes the
  lesson rather than retrying it.
- **Property-specialized render kernels** (#513): smaller source and bytecode,
  no stable pb32 runtime gain; remains opt-in. Candidate 7 differs (it removes
  global traffic and calls, not branches) but inherits the same gate.
- **Incremental coordinate accumulation** (deriving zone-local X/Y by running
  addition down the strip instead of mod/div/floor): rejected at analysis.
  16.16 addition drift accumulates across 2,000 pixels and breaks Precise
  exactness, and it would also require a firmware pixel-order guarantee the
  design has deliberately avoided depending on.
- **Transition-mix endpoint skipping** (skip the near-zero-weight side of a
  live/live Crossfade): exact only when the contribution rounds to zero at
  8-bit output, which holds for under ~0.2% of the ramp window; payoff is
  negligible. The frame-level opacity short-circuit (candidate 5) is the
  version worth having.
- **Member source-body deduplication via state vectors** (one body per Pattern,
  instance state in indexed arrays): trades scarce array words and per-access
  indexing cost for globals and bytes; likely a CPU loss on the measured VM.
  Deferred unless candidate 6's census shows the globals ceiling still binds
  after liveness reuse.
- **Automatic cross-frame exact memoization of live Pattern RGB**: unprovable
  in general (render-side state, time dependence); the Frame-lifetime rule in
  the shipped design already draws this boundary, and candidate 1 provides the
  honest authored alternative.
- **GPU-style prepasses, threads, freed arrays, larger envelopes**: excluded by
  the governing constraints; nothing above depends on them.

## Risks and unresolved questions

- **Plane contention becomes the norm.** Candidates 1-3 all want the same three
  planes. The planner's conflict machinery exists, but the *product* policy for
  who wins (boundary snapshot versus Scene trail versus frozen backdrop) is a
  human decision this proposal flags for review before any implementation
  ticket exists.
- **Replay cost is currently invisible.** Every payoff model here assumes plane
  reads stay cheap; that is proven only under the serial output floor. S1 plus
  one faster output profile is the guard; if replay is expensive on fast
  output, candidates 1-3 need per-profile qualification like everything else.
- **Why #528 lost is not actually known.** Read cost, bytecode growth, and
  dispatch-shape change are confounded. S2's ablation should separate them;
  until then, candidate 4's thresholds carry that uncertainty explicitly.
- **Rolling refresh visual acceptability** is untested: staggered pixel age may
  shimmer on spatially coherent patterns. The falsifier fixture needs a human
  visual review step (contact-sheet style, per #520) alongside FPS.
- **Seek cost for feedback Effects** grows with Effect duration since Fast
  replay reconstructs recursion from the Effect start; a long trail in a long
  Show may make timeline scrubbing sluggish. Needs a preview-side budget
  measurement before candidate 2 ships.
- **Global-liveness reuse versus future Continue-heavy authoring**: if real
  Shows overwhelmingly use Continue, candidate 6 reclaims little; its
  compile-only census answers this for a few hours of work.
- **Firmware variance**: all thresholds and floors are pb32/3.67 facts. The
  established discipline — hardware qualification per profile, conservative
  defaults elsewhere — applies to every item above and is restated here so no
  ranking in this document is read as a hardware-independent promise.
