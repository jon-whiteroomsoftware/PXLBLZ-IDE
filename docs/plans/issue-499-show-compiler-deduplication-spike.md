# Issue 499 Show compiler size and deduplication spike

Issue: [#499](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/499)

Related: [#503](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/503), [#502](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/502)

The Show compiler can preserve the repetitive, clone-friendly authored model
while emitting a sparse representation of the unique runtime work. The Redline
Installation stress fixture now compiles from 311,791 source bytes and a
91,366-byte Controller image to 18,889 delivered source bytes and an 11,346-byte
Controller image. The output remains pixel-identical in the verification sweep.

The result changes the practical model for long Shows. A minute of choreography
does not require a minute of duplicated renderer code. It can compile into a
fixed runtime, unique Pattern programs, interned render plans, and a compact
schedule.

## Result

The firmware compiler on a Pixelblaze running firmware 3.67 is the program-size
authority. Source measurements remain useful for controller storage and transfer
cost, but they are not treated as bytecode measurements.

| Measurement | Baseline | Optimized | Reduction |
| --- | ---: | ---: | ---: |
| Generated source delivered to the Controller | 311,791 B | 18,889 B | 93.9% |
| Expanded source before final symbol compaction | 311,791 B | 29,405 B | 90.6% |
| Controller image | 91,366 B | 11,346 B | 87.6% |
| Opcode bytes | 91,328 B | 11,308 B | 87.6% |
| Opcodes | 22,832 | 2,827 | 87.6% |
| Export table | 30 B | 30 B | unchanged |
| Controller headroom in the measured 68,384-byte budget | -22,982 B | 57,038 B | fits |

The final symbol pass removes another 10,516 bytes, or 35.8%, from the already
deduplicated source. It does not change bytecode size because firmware opcodes
refer to compiled bindings rather than retaining source identifier text.

Redline still evaluates one Pattern source per output pixel. The compiler did
not mix the Show down, merge independent Pattern state, lower the 4,000-pixel
Stage resolution, or alter the authored choreography.

## Why the baseline grew so quickly

The unique authored Pattern was never the large part. Its bundled source is
4,675 bytes, about 1.5% of the baseline artifact. The original compiler expanded
eight authored Scenes into 16 scheduling intervals and then emitted similar
capture, stack, routing, Effect, and setup code for 57 active Scene-Zone cells.

| Baseline fact | Count |
| --- | ---: |
| Authored Scenes | 8 |
| Derived compiler Scenes | 16 |
| Derived Scene-Zone cells | 57 |
| Generated stack wrappers | 57 |
| Generated functions | 209 |

That representation made code size approximately proportional to the number of
cells. The optimized representation makes code size proportional to unique
Pattern programs and unique semantic render plans. Redline's 80 Scene-Zone
lookup entries resolve to 18 interned plan bodies.

## Optimizations

The reductions were implemented and measured cumulatively because later passes
depend on the representation established by earlier passes.

| Compiler state | Redline source | Controller image where measured |
| --- | ---: | ---: |
| Baseline | 311,791 B | 91,366 B |
| Dead Scene-stack and inactive-dimension wrappers removed | 137,015 B | - |
| Single opaque physical placements routed directly | 99,735 B | - |
| Physical Zone routing shared across Scenes | 73,055 B | 23,398 B |
| Exact render plans interned with a compact lookup table | 44,068 B | 16,702 B |
| Unused adapters and runtime helpers removed | - | 15,002 B |
| Repeated cut scheduling canonicalized | 33,765 B | - |
| Static affine Effects baked into plans | 28,287 B | 11,218 B |
| Plan configuration cached by plan and physical Zone | 29,717 B | 11,462 B |
| Dead cut-only state removed | 29,405 B | 11,346 B |
| Compiler-owned symbols compacted | 18,889 B | 11,346 B |

The final compiler has these properties:

- Only the active output dimension is emitted for member capture and Scene-stack
  wrappers.
- A single opaque placement bypasses source-over stack machinery.
- Physical routing finds Zone ownership and local coordinates once, then selects
  an interned render plan.
- Render-plan canonicalization preserves Pattern-instance identity and all
  non-commutative orderings while excluding editing-only placement identity.
- A fixed 80-element Scene-Zone table selects 18 unique Redline plans.
- Equal-duration cut runs use arithmetic Scene selection instead of repeated
  branches. Pattern setup is canonicalized independently so shared members
  advance once per frame.
- HSV, time, adaptation, hash, transition, and output helpers are emitted only
  when the generated program uses them.
- The brightness and power-output path is inlined into the sole member capture
  adapter, removing one function and one call per evaluated pixel.
- Static affine placement Effects are compiled to their final six sampling
  coefficients. Redline no longer performs per-frame trigonometry, matrix
  composition, determinant calculation, or inversion for those Effects.
- Static plan configuration is cached by both plan id and physical Zone id.
  With pixels rendered in Stage order, Redline configures approximately five
  Zone runs per frame instead of repeating setup for roughly 4,000 pixels.

The plan cache adds 244 Controller bytes. That small static cost buys a large
runtime reduction and is retained deliberately.

## Compact generated symbols

The compiler first emits explicit internal names such as
`__pxlblz_show_c0_renderCapture2D`. A deterministic final pass parses the
program, counts compiler-owned identifier uses, and assigns the shortest names
to the most frequent bindings: `__pxlblz_a`, `__pxlblz_b`, and then longer
letter-only suffixes as needed.

The pass is syntax-aware. It rewrites Identifier nodes, not matching text in
comments or strings, and it avoids names already present in the program. The
Pixelblaze-required exports `beforeRender`, `render`, `render2D`, and `render3D`
remain stable. Metadata maps stable IDE watcher keys to compact runtime names, so
introspection still reports semantic keys such as `__pxlblz_show_c0_ticks` even
though the delivered binding is abbreviated.

The artifact retains `expandedCode` for structural diagnostics and tests. Its
`code` and `fxCode` fields contain the compact representation that preview,
export, and Controller delivery execute. The summary reports both
`expandedArtifactBytes` and delivered `artifactBytes`.

## Runtime and memory findings

Pixel count is not encoded by duplicating generated source or bytecode. Redline's
4,000-pixel count changes how often the outer renderer runs, not how many copies
of the Pattern program the Controller stores. The optimized Show adds no
per-pixel color or Effect buffer. Its largest new table is the fixed 80-element
Scene-Zone plan lookup.

The Output Expander is a separate boundary. Its public implementation describes
one output data buffer rather than front and back frame buffers; eight fully
allocated channels use 5,760 bytes. That memory belongs to output transport,
not to each Show Pattern or Scene. The public repositories inspected did not
include the Pixelblaze firmware VM or compiler source, so firmware compiler
behavior was measured directly instead of inferred from an unavailable source
implementation.

Generated-state diagnostics remain approximate. A production diagnostic should
count emitted global scalars and arrays from named compiler chunks rather than
reconstructing them after generation.

## Semantic verification

Compiler tests cover active dimensions, opaque routing, interning, static Effect
baking, plan-cache Zone identity, scheduler canonicalization, Pattern-instance
advance semantics, transitions, long 16.16-safe schedules, controls, and stable
introspection across compact symbols.

The Redline equivalence sweep compiled the unchanged Show with both the baseline
and optimized compilers. Nine frames spanning the 60-second arc rendered all
4,000 mapped pixels. All 108,000 RGB channel comparisons matched exactly; the
maximum numeric difference was zero.

The firmware 3.67 compiler accepted the final compact source and produced the
11,346-byte Controller image reported above.

## Canonicalization rules

Canonical render plans distinguish editing identity from runtime semantics:

- Omitted values normalize to explicit semantic defaults.
- Maps and named targets use stable key order.
- Physical Zones follow canonical Zone Layout order.
- Editing-only placement ids do not split otherwise equivalent plans.
- Placement ids targeted by animation or transitions remain semantic.
- Pattern-instance identity, clock, controls, and private state remain distinct
  even when source text is identical.
- Effect order, overlay order, transition order, and affine operation order are
  preserved. These sequences are non-commutative and are never sorted merely to
  increase deduplication.

Equivalent code and equivalent state remain separate questions. Several
placements may share routing and render-plan code while retaining independent
Pattern state. Several placements of one Pattern instance share its source body
and state exactly once.

## Follow-up diagnostic

The next useful slice is an always-available artifact diagnostic. Named emission
chunks should attribute exact expanded and delivered UTF-8 bytes to:

- unique Pattern members and their placement reuse counts;
- runtime, scheduler, Scene timing, and Zone routing;
- unique render plans and the Scene-Zone references to them;
- Effects, transitions, property ramps, exports, and provenance;
- generated scalar globals and array elements.

When the extracted firmware compiler is available, the diagnostic should add
actual opcode and export-table totals. Per-category bytecode attribution may
require ordered counterfactual compiles because the firmware compiler does not
publish source-span accounting.

Source and bytecode must remain separately labeled. The compact source is only
27.6% of the measured activation budget, but that ratio is a source-storage
signal, not a literal firmware-capacity measurement. The actual final Controller
image uses 16.6% of the bytecode budget.

## Conclusion

Full Redline now fits in one ordinary Pixelblaze Pattern with roughly five-sixths
of the measured Controller program budget free. No mixdown or resolution fallback
is necessary for this fixture. Further size work has sharply diminishing value;
the higher-value follow-up is exposing the attribution model so future Shows can
explain their own source, bytecode, state, and runtime pressure.
