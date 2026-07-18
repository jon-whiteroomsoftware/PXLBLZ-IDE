# Independent Design Proposal: Show rendering next opportunities

## Recommendation

The next program should stop treating the framebuffer as the main source of
speed. The completed epic shows that memory helps when it removes a Pattern
evaluation or a genuinely expensive visual field, but loses when it merely
replaces cheap arithmetic with array traffic and generated control code. The
next large wins should therefore come from changing the unit of reuse.

I recommend three primary tracks, in this order:

1. Generalize content-aware composition from one keyed pair to an exact
   coverage-directed layer stack. This extends a measured 59.9% win with the
   smallest new semantic surface.
2. Add an authored Pattern decomposition contract that separates expensive
   geometry or coverage from cheap shading. One scalar evaluation can then
   drive several palette variants, masks, and conditional layers. This directly
   realizes the idea that a Show may use multiple render functions and Pattern
   variations without repeating their most expensive work.
3. Virtualize scalar Pattern-instance state for repeated copies of the same
   source. One parameterized code body plus a compact state array can replace
   many alpha-renamed bodies, trading abundant residual array words for source,
   bytecode, and persistent globals.

Two authored approximation policies should follow as optional visual tools:
member update-rate reduction and topology-qualified spatial sample-and-hold.
Both can produce order-of-magnitude computation reductions, but only by making
temporal or spatial stepping part of the Show's visual contract.

Before any of these becomes a production default, the benchmark system should
learn native operation weights and attribute cost by compiler stage. The failed
coordinate cache is decisive evidence that the current abstract work score is
not predictive enough.

### Ranked opportunity map

| Rank | Candidate | Contract | Primary payoff | First falsifying probe |
| ---: | --- | --- | --- | --- |
| 1 | Coverage-directed layer stacks | exact | avoid hidden lower Pattern calls | extend keyed two-layer harness to 3 and 5 layers at varied coverage |
| 2 | Authored field/coverage plus shading functions | exact | share expensive geometry across variants and masks | one iterative or noise field feeding 2 and 5 palette variants |
| 3 | Scalar-state instance virtualization | exact | fit many repeated Pattern instances in byte/global budgets | parameterize one array-free Pattern at 2, 5, and 10 instances |
| 4 | Explicit member update-rate policy | authored approximation | divide expensive background evaluations by a chosen cadence | 2,000-pixel expensive background at 30, 15, 10, and 5 Hz |
| 5 | Packed route/plan lookup for irregular Stages | exact | replace long irregular routing predicates with one lookup | synthetic layouts with 4-64 disjoint ranges at 256/1,000/2,000 pixels |
| 6 | Shared Effect and adaptation kernels | exact | reduce repeated source and bytecode | repeated identical Effect stacks across 2, 5, and 10 members |
| 7 | Topology-qualified spatial sample-and-hold | authored approximation | evaluate coherent Patterns once per contiguous pixel block | 1D and proven row-major maps at block widths 2, 4, and 8 |

## User workflow

Most compiler wins should remain automatic and disclosed, not configured as
memory management.

For exact coverage composition, an author places ordinary overlays or keyed
clips. Advanced compiled cost reports how many layers can terminate the stack,
which layers require both sources in feather regions, and why a stack remained
on ordinary back-to-front composition. No new cache control is required.

For authored Pattern decomposition, a Pattern may optionally expose semantic
render roles in addition to its ordinary firmware renderer:

- a field function computes a normalized scalar used by color or geometry;
- a coverage function computes exact alpha or an exact opaque/empty decision;
- one or more shading functions turn the field into RGB under different public
  controls or palettes;
- the ordinary renderer remains the fallback and hardware-bound public entry
  point.

The Show compiler, not the Pattern author, decides whether compatible consumers
share the field, call coverage before color, or use the ordinary renderer. The
Pattern editor explains which controls belong to field identity and which only
change shading. A Show author can therefore place several configured variants
without understanding cache keys.

Instance virtualization is similarly automatic. Advanced compiled cost says
that repeated instances share one code body while keeping independent clocks,
controls, and private scalar state. A Pattern that uses unsupported dynamic
features simply retains isolated code bodies.

The approximation policies need explicit controls because they change motion:

- **Update rate** selects Live, 30, 15, 10, 5, or a bounded custom Hz value for
  one clip or layer. The description says that Pattern pixels hold between
  updates while the Show clock continues.
- **Spatial detail** selects Full or a topology-qualified block size. The UI
  offers it only when physical ordering proves that adjacent indexes form the
  advertised neighborhood.

These controls should become exportable output affordances only after their
compiled semantics are stable. A generated Pattern can then expose a quality or
performance slider without exposing implementation arrays.

## Information architecture and structure

### 1. Coverage-directed composition

The compositor should represent every layer as a color producer plus an alpha
contract:

- `opaque`: alpha is always one;
- `empty`: alpha is always zero;
- `analytic`: alpha comes from a cheap exact mask or Effect expression;
- `derived`: alpha is calculated from rendered RGB, as current luma/chroma keys
  do;
- `unknown`: ordinary composition is required.

Rendering proceeds from top to bottom. Once accumulated alpha reaches one, the
compiler stops. For a stack of layers, the evaluation cost becomes:

```text
top pixels + pixels uncovered by top
           + pixels uncovered by top two
           + ...
```

Feathered pixels still evaluate every source needed for the exact blend. An
opaque top over 90% of the output preserves the current `N + U` behavior; a
five-layer stack can compound the savings when each upper layer covers part of
what is below. Unknown or render-state-sensitive alpha falls back without
changing output.

This mechanism uses no framebuffer. It should be planned before RGB-output
reuse because conditional evaluation changes which consumers are semantically
required. Shared output may still serve a layer evaluated at several sites.

### 2. Pattern field and coverage contract

The compiler needs an authored, inspectable boundary rather than attempting to
reverse-engineer arbitrary Pattern source. A Pattern-side descriptor should
name:

- producer function and scalar range;
- coordinate/sample domain;
- field controls, time, and private-state dependencies;
- shading-only controls;
- exact coverage interpretation, if one exists;
- whether evaluation mutates state;
- compatible render dimensions;
- invalidation and expected consumer identities.

For `k` variants whose expensive geometry costs `G` and shading costs `S`, the
direct cost is approximately `k(G + S)`. Shared field evaluation costs
`G + kS + capture/replay`. If geometry dominates, the theoretical speedup
approaches `k`; if shading dominates or only one consumer exists, the planner
rejects the field.

The existing scalar-field contract and arena plane provide the storage and
lifetime model. The important addition is that the Pattern declares the
semantic split. The first implementation should support one exact scalar field
and stateless shading. Multi-channel fields, approximate resampling, and
compiler-inferred decomposition should remain out of scope.

Coverage is a high-value special case. A Mandelbrot-like Pattern can expose its
escape/interior decision or distance as a field. The compositor can use that
decision to avoid a lower Pattern under opaque regions, and the color function
can reuse the same iteration result rather than recomputing it. A single field
therefore serves both composition and shading.

### 3. Scalar-state instance virtualization

Today independent Pattern instances commonly receive alpha-renamed copies of
their source and private globals. For repeated copies of one source, compile a
single parameterized function family and place instance scalar state in a flat
array:

```text
state[instanceBase + slot]
```

One body then receives an instance base or current-instance index. Independent
clocks, controls, and mutations remain isolated because every scalar access is
rebased. A Pattern with `S` scalar globals and `K` instances changes from about
`K*S` persistent globals and `K` source bodies to one body, a few dispatcher
globals, and `K*S + 4` array words in a flat state array. This is primarily a
capacity optimization; indexed reads and writes may make it slower.

Selection should therefore be pressure-aware:

- prefer isolated direct globals when bytecode and persistent-global headroom
  are ample or hardware shows a meaningful speed advantage;
- choose virtualization when repeated bodies approach activation bytes or the
  256-global ceiling;
- reject Patterns with unrewritable dynamic access, unsupported member arrays,
  aliasing that cannot be proven, or incompatible function identity.

The first slice should target array-free scalar-state Patterns and prove exact
Fast/Precise behavior. Pattern-owned arrays can remain per-instance allocations
until a separate packing design proves safe.

### 4. Authored member update rate

The arena's RGB role can hold an expensive full-stage or full-zone member while
other composition stays live. An authored cadence refreshes that member every
`K` eligible frames and replays it between refreshes. If the member dominates
frame cost `C`, its average evaluation contribution approaches `C/K` plus
capture/replay.

This is not exact continuation. The Pattern clock may advance, but rendered
pixels are sampled and held. Render-time state mutation must either run only on
refresh (the declared visual policy) or make the member ineligible. The policy
competes with snapshot transitions, shared RGB output, and any other three-plane
role during overlapping lifetimes.

This can be a dramatic win for ambient backgrounds, slow noise, star fields,
and expensive fractals that visually tolerate 5-15 Hz while overlays and
Transitions remain at the output rate. It should never be silently inferred
from low motion.

### 5. Packed route and plan lookup

Static physical layouts with many irregular ranges may spend meaningful time
testing predicates and reconstructing local indexes. One 2,000-element 16.16
array can encode route id and local index or a direct plan token for every
physical pixel. It costs 2,004 permanent words, leaving 2,224 residual words at
the output ceiling before member arrays and other tables.

This is justified only when it replaces a sufficiently long predicate chain.
Contiguous physical ranges should retain specialized arithmetic, which already
won. The compiler should generate direct and lookup counterfactuals and select
from a hardware profile keyed by range count, layout form, and output size.
Logical routing and changing layouts are not initial candidates.

### 6. Shared Effect and adaptation kernels

Motion kernel sharing proved that parameterized generated code can cut source
and bytecode without affecting FPS. Apply the same representation choice to
identical Effect stacks, adaptation wrappers, property-track shapes, and stack
compositors. Intern structure; write changing constants and instance references
as parameters or compact plan data.

This should be selected on emitted and measured bytecode, not expected runtime
speed. It is valuable because byte capacity, not pixel memory, can prevent ten
Pattern Shows even when per-frame work is acceptable. It complements instance
virtualization: one removes repeated compiler wrappers, the other repeated
Pattern bodies.

### 7. Topology-qualified spatial sample-and-hold

On a provably contiguous 1D strip or row-major surface, an authored block size
can evaluate one representative sample and reuse its RGB for the next `K-1`
physical pixels through scalar globals. This needs no framebuffer and divides
member renderer calls by roughly `K` for that placement.

The visual result is pixelation, not an exact optimization. It is invalid on
arbitrary maps where adjacent physical indexes are not spatial neighbors. The
first probe should avoid interpolation, which either needs future samples or
additional buffering under one-pass execution.

### Enabling measurement layer

Every candidate should pass through one common counterfactual harness that
records:

- emitted source and Controller bytecode;
- VM allocation by owner and persistent globals;
- exact renderer-call and array-access counts where statically provable;
- candidate rebuild or refresh counts;
- paired Controller FPS at 256, 1,000, and 2,000 pixels;
- output configuration and wire-floor estimate;
- Fast and Precise checksums or the declared approximation delta;
- restored Controller state.

Add native microbenchmarks for array read/write, branch depth, function call,
`sin`, `sqrt`, division, modulo, noise kernels, and RGB output under serial and
faster output profiles. The planner can use calibrated ranges rather than one
dimensionless operation score. It should still require paired artifact evidence
before enabling a new production default.

## Key interactions and states

The render-target planner must coordinate field sharing, update-rate snapshots,
Pattern-output reuse, and Transition snapshots. Each candidate declares its
plane role, lifetime, producer, consumers, exactness, refresh/rebuild cost, and
conflicts. A rejected candidate always retains the ordinary direct path.

Coverage composition occurs before cache selection. It changes the required
consumer graph: a lower layer is conditional, not absent. Cost reporting should
show best, measured/estimated typical, and worst renderer counts rather than a
single misleading number when coverage is output-dependent.

Field/shading consumers are compatible only when field-affecting coordinates,
time, state, and controls match. Palette or shading-only controls may differ.
A change to a field control invalidates the producer; a shading-only change does
not.

Virtualized instances have an exact fallback boundary. One unsupported global,
array, function alias, or dynamic access keeps that Pattern source on isolated
bodies. Mixed artifacts may virtualize one Pattern family and isolate another.

Authored update-rate and spatial-detail changes invalidate their snapshot or
held sample immediately. Seek rebuilds derived state before presenting a frame.
A Transition that needs all three RGB planes temporarily suspends or rejects an
overlapping cadence cache; it must not replay stale ownership.

## Accessibility and responsive behavior

Automatic exact optimizations need only concise status and expandable evidence.
Do not encode selected/rejected state by color alone; use text such as
**Coverage stack selected - 82% of lower pixels skipped** or
**Field sharing rejected - field controls differ**.

Approximation controls require names that describe the visible consequence.
`Update rate: 10 Hz` is clearer than `Temporal cache: 3`; `Spatial detail:
4-pixel blocks` is clearer than `Decimation: 4`. Keyboard controls and generated
Pattern sliders need numeric values and stable defaults. Narrow layouts may
stack the control and explanation without hiding the exact/approximate badge.

Compiled-cost tables should keep CPU, memory, bytecode, globals, and visual
contract in separate columns. A single green “optimized” state would conceal
important tradeoffs.

## Implementation implications

The first tracer bullet should generalize the current luma/chroma key planner
to three exact layers without adding saved-model types. It can use existing
key Effects as alpha providers, emit top-down early exits, and compare renderer
counts and FPS against ordinary back-to-front composition. A five-layer fixture
then tests scaling and interactions with feather regions.

The second tracer bullet should define a Pattern-side field/coverage descriptor
and implement one stock demonstration Pattern whose expensive scalar field
feeds two palette variants. The compiler should emit direct and shared versions
behind a diagnostic switch. Do not infer fields from arbitrary JavaScript in
this slice.

The third tracer bullet should prototype scalar-state virtualization entirely
in the transpiler/compiler with an array-free Pattern fixture. Measure 2, 5,
and 10 copies for source, bytecode, globals, VM words, and FPS. It should ship
only as a capacity fallback until runtime cost is characterized.

The cadence experiment can reuse the render-target planner but needs a new
authored policy and seek tests. The routing lookup and Effect interning spikes
are independent representation experiments and can proceed after instrumentation
lands.

No candidate should broaden the 2,000-pixel contract. No experiment should add
untracked arrays. The planner must include all parameter tables and state arrays
in the whole-Show resource ledger before artifact actions remain available.

## Alternatives considered

**General transformed-coordinate caching.** The completed exact candidate made
2,000-pixel Redline 6.43% slower while adding source and bytecode. Reconsider
only for a different hardware profile or a much smaller emitter, not from
static avoided-operation estimates.

**A second full RGB framebuffer.** Six 2,000-element planes cost 12,024 words
before any Pattern state and exceed the 10,240-word pool. Lower output counts
could fit, but making the platform architecture depend on two full buffers
would fracture the supported contract.

**Automatic visual-motion detection.** Inferring that a Pattern “looks slow”
does not authorize temporal approximation and is unreliable for stateful or
event-driven Patterns. Cadence must be authored.

**Compiler-inferred arbitrary field extraction.** General program slicing
across mutable Pixelblaze source is substantially riskier than an authored
field contract. It can be revisited after explicit fields prove value.

**Universal table-driven routing.** A 2,004-word lookup is wasteful for simple
contiguous ranges and may be slower than specialized branches. It should be a
profiled alternative for irregular layouts, not a new default.

**Function-kernel specialization as a runtime assumption.** Prior property
kernel work reduced branches but did not show a stable pb32 speedup. Reuse the
mechanism for bytecode pressure, and require new hardware evidence for runtime
claims.

## Risks and unresolved questions

- Pixelblaze array access may erase the runtime value of virtualized state even
  when the byte/global savings are excellent. The selection objective must be
  explicit: capacity versus FPS.
- A field producer that mutates state can make one evaluation with several
  consumers semantically different from several evaluations. The initial
  contract should require render-pure field production.
- Coverage derived from RGB still requires rendering the upper source. The
  largest new gain needs analytic or authored coverage, not simply more key
  thresholds.
- Top-down composition can change renderer side-effect order. Exact selection
  must prove that skipped calls were semantically conditional under the authored
  alpha contract or require render-pure layers.
- A cadence snapshot may monopolize all three planes and prevent exact scalar
  or RGB reuse elsewhere. The UI should expose the selected tradeoff without
  asking the author to schedule planes.
- The current Controller evidence is pb32 firmware 3.67 with primarily serial
  output. Faster output profiles may reverse array-versus-compute decisions.
- Source bytes and measured bytecode are correlated but not interchangeable.
  The compiler still lacks a first-class per-owner bytecode attribution model.
- The one-pass runtime may block richer spatial resampling. Any proposal that
  needs a future neighbor, a complete current frame, or two RGB generations
  should be rejected early unless it supplies a bounded alternative.
- It remains unknown how often real community Patterns naturally separate into
  expensive scalar geometry and cheap shading. A library census should classify
  built-ins before committing to a public Pattern contract.
