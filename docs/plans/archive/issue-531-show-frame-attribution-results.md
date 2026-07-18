# Issue #531 - Show frame-time attribution results

The five-Pattern acceptance Show spends most of its frame in generated Show
machinery, while Redline is almost evenly split between Show overhead and
authored Pattern work. At 2,000 pixels on the measured pb32, the physical output
floor is 60.353 milliseconds. Redline adds 142.547 milliseconds of unresolved
Show overhead and 133.576 milliseconds of Pattern work; the acceptance Show adds
348.980 and 179.667 milliseconds respectively.

This is the structural result the next optimization slices needed. Pattern
optimization alone cannot make the acceptance Show fast: nearly 60% of its
current frame remains after all member bodies are replaced by constants.

## Method

The diagnostic harness builds an explicit artifact ladder without adding a
production compiler option:

1. `trivial-output` emits one constant RGB value and measures the physical output
   floor.
2. `constant-members` preserves the Show scheduler, routing, Effects,
   composition, capture/replay, and output while replacing member `beforeRender`
   and render bodies with dimension-matched constants. Required control exports
   remain present.
3. `capture-elided` replaces capture and emit wrappers with direct RGB only when
   one render-pure member owns each output pixel and no Effect or compositor
   consumes captured values.
4. `full` is the ordinary production or named counterfactual artifact.

The ordinary artifact is byte-for-byte identical to direct `compileShow` output.
Fast and Precise checksums prove the constant-member/capture-elided exchange is
exact for the eligible output-reuse fixture. Other fixtures record capture and
composition as unresolved Show overhead rather than applying an invalid direct
emission shortcut.

The Controller ran each artifact at 2,000 pixels after a 2,000 millisecond
post-activation settle, then collected 16 FPS samples over four seconds. The
runner restored the original active Pattern and 256-pixel configuration in
`finally` and never touched the pixel map. The complete source, expanded source,
bytecode, VM-word, global, FPS, and frame-time distributions are in
[`issue-531-controller-attribution-report.json`](./issue-531-controller-attribution-report.json).

## Reference Show attribution

| Fixture | Output floor | Unresolved Show overhead | Pattern work | Full median frame | Dominant removable region |
| --- | ---: | ---: | ---: | ---: | --- |
| Redline production | 60.353 ms | 142.547 ms | 133.576 ms | 336.476 ms | balanced |
| Five-Pattern acceptance | 60.353 ms | 348.980 ms | 179.667 ms | 589.000 ms | Show machinery |

The constant-member rung retains generated Effects and scalar fields. It removes
only authored member state/update/render work. This distinction matters: a
compiler-generated field belongs to Show overhead even when its visual input is
associated with a Pattern transition.

## Previously qualified wins

The controlled rungs line up with the mechanisms claimed by the earlier epic.

| Fixture | Attributed baseline component | Selected change | Interpretation |
| --- | ---: | ---: | --- |
| #518 output reuse | 102.533 ms Pattern work | -105.311 ms | Removes almost exactly one full Pattern-evaluation budget across repeated surfaces. |
| #519 scalar field | 387.647 ms unresolved Show overhead; 28.000 ms member work | -143.750 ms | Removes compiler-owned scalar-field production, not authored member rendering. |
| #527 content key | 153.847 ms Show/composition; 143.967 ms Pattern work | -134.367 ms | Skips most lower-member evaluation through exact coverage-directed composition. |

The eligible #518 boundary separates its remaining non-Pattern work further:
48.447 milliseconds of routing/scheduler work and 8.867 milliseconds of capture
wrappers sit above the 60.353 millisecond output floor. Capture wrappers matter,
but routing and whole member evaluations are much larger targets.

## Coordinate cache finding

The #528 coordinate candidate remains phase-dependent. In this harness's settled
2-6 second window, the direct artifact measured 336.476 milliseconds median and
the coordinate candidate 337.333 milliseconds: a 0.857 millisecond loss. Mean
frame time moved in the other direction by 6.786 milliseconds. This short window
does not reproduce #528's two longer paired passes, both of which changed median
FPS from 3.008 to 2.814 (-6.43%).

The combined evidence explains why one global coefficient would be wrong.
Coordinate capture/replay can be neutral in one Scene interval and lose over the
weighted choreography. #532 prices two array reads plus one branch near 8.2
milliseconds per 2,000-pixel frame, below the prior roughly 23 millisecond
full-window regression. The remaining loss can plausibly come from generated
dispatch/calls, rebuild phases, and code shape, but the phase-specific matrix
does not assign that residual to a preferred cause.

## Decision

No production default changes in #531. The harness is now reusable evidence
infrastructure, and the results prioritize whole-evaluation reuse and generated
Show-structure reductions over scalar-read caching or capture-wrapper-only
specialization.
