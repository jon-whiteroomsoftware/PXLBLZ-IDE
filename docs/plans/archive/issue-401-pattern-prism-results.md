# Issue #401 - Pattern Prism catalog Show

Pattern Prism is a deterministic 25-second Show for a 16x16 serpentine matrix.
One stock Ribbon Loom cell spans four semantic zones in **Repeat per zone** mode,
so one Pattern instance and clock render into four independently normalized
domains. Five scenes select four named routing layouts: Full panel, Four
quadrants, Alternating vertical strips, Pinwheel interleave, then Full panel
again.

## Artifact

- Browser-exported EPE: `artifacts/electromage/pattern-prism.epe`
- Source Pattern: stock `RibbonLoom`, ISC license
- Stage: stock Square 2D map
- Generated source: 54,304 bytes including provenance/header
- Device bytecode: 25,838 bytes on firmware 3.67
- Routing: bounded packed table, 1,024 elements, one renderer per physical pixel

The EPE carries a 100x150 JPEG preview, a normal controller-format program ID,
the permanent PXLBLZ URL, source attribution, named layout schedule, and the
exact generated source covered by the regression fixture.

## Hardware progression

The first four-cell build duplicated Ribbon Loom four times and measured about
13.6 FPS on the full panel but only 4.7-5.0 FPS on irregular layouts. Sharing one
member through Repeat per zone improved quadrants but single-pixel strip branches
still measured about 4.9 FPS. The guarded packed representation removed that
layout-dependent collapse.

The final exported EPE was parsed from disk, compiled independently of the app,
pushed run-only to the 256-pixel controller, and observed for a complete loop at
brightness 0.3. Firmware-reported FPS stayed between about 12.7 and 13.2 across
all layouts. No activation failure or layout-specific frame-rate collapse
occurred. Physical visual approval for continuity, black flashes, and catalog
copy remains the explicit human gate before upload.

## Proposed catalog copy

**Pattern Prism: One Pattern, Many Layouts** keeps a single Ribbon Loom animation
alive while a PXLBLZ Show remaps the same 16x16 LEDs through a full panel, four
repeated quadrants, alternating strips, and a pinwheel interleave. Inspect the
source to see one ordinary Pattern isolated behind a compact timeline and routing
layer. Built with PXLBLZ-IDE. License: ISC.
