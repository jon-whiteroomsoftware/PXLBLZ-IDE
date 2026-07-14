# Show visual-toolkit headless freeze

The UI-neutral Show visual-toolkit contract is frozen at version 1 with
fingerprint `f81bca37`. The fingerprint covers the complete registry, its
variant-to-fixture mapping, and every fixture's compile recipe, persisted
record behavior (excluding the volatile `updatedAt` storage timestamp),
progress samples, capture geometry, stage dimension, and start time.
An intentional descriptor or fixture change must update the contract version,
fingerprint assertion, and this evidence record together.

The freeze does not approve the production authoring UI. It establishes the
stable engine contract that #457 can render without family-specific rules.

## Catalogue coverage

The registry contains 59 variants with 104 deterministic fixtures:

| Kind | Registered variants |
| --- | ---: |
| Property animation | 5 |
| Effect | 19 |
| Transition | 35 |

Every variant resolves to at least one fixture. The Property matrix now covers
Animation speed, Brightness, Pattern control, Split position, and Repeat scale
through the same fixture, persistence, seek, compiler, and cost path used by
Effects and Transitions. The combined affine fixture covers Translate, Rotate,
Scale, Shear, and Wrap while retaining their shared implementation.

Each fixture compiles twice to identical generated source, seeks to progress
`0`, `0.25`, `0.5`, `0.75`, and `1`, produces identical frame checksums on a
second run, and survives JSON normalization without schema drift. A compiled
animated-distortion fixture also exports and reloads through the standard EPE
envelope. A legacy Pixel Dissolve plus string easing compiles and renders
byte-for-byte identically after normalization.

## Compiled measurements

All automated captures use 256 normalized 2D sample points. Across the complete
matrix:

| Pattern-evaluation formula | Fixtures |
| --- | ---: |
| `N` | 100 |
| `N + E` | 2 |
| `2N` | 2 |
| `S * N` | 0 |

No fixture exceeds the measured 68,384-byte generated-source budget. The
largest artifact is `effect-animated` at 10,004 bytes, or 14.63% of that
budget. The same fixture has the largest generated scalar allocation at 16.
No fixture allocates generated array elements, and no fixture emits a
compatibility warning under its declared stage dimension.

These are compiler facts, not UI ratings. The eventual simple cost signal can
summarize them, while its advanced view can preserve the literal formula,
Effect operation counts, memory, artifact bytes, budget ratio, coverage, and
compatibility warnings.

## Hardware freeze evidence

The external hardware gate passed on 2026-07-14 using a `pb32` Pixelblaze named
Burner bag, firmware 3.67, with a 256-point 2D map. The run compiled and pushed
all 104 frozen fixtures plus ten explicit Hard/Blend SDF policy probes. Every
Pattern became the reported active program and returned usable FPS telemetry:
114 of 114 measurements completed without a compiler, transport, activation,
or watchdog failure.

The 104 frozen fixtures measured 29.47-80.49 mean FPS. The slowest was
`effect-color-composed-animated` at 29.47 FPS; the fastest was
`property-pattern-control` at 80.49 FPS. The selected distortion set measured
31.37-42.05 FPS, including the animated Ripple plus Pixelate composition. The
required Hard/Blend SDF probes measured 50.16-54.39 FPS. The focused tables in
`issue-452-sdf-review.md` and `issue-456-distortion-review.md` pair each required
fixture with its generated artifact size and mean FPS.

The user approved the deterministic silhouettes and distortion output before
the hardware run. The physical measurement therefore verifies compiler and
performance viability; it does not replace that visual review. Side-profile
cat and Bastet remain implemented but provisional by choice. The benchmark used
run-only pushes, created no saved Patterns, and restored the prior
`ClockworkIris` program (`pxbg3carHT6eYhdRh`) after completion.

`representativeHardwareFps` remains `null` in the deterministic CI result
because CI has no Controller. The dated external report is the source of truth
for hardware performance rather than a context-free constant in the engine.

## Reproduction

```bash
npx vitest run src/engine/showVisualToolkitFreeze.test.ts
npm run lint
npm test -- --run
npm run build
```

For a live rerun, compile `allShowVisualToolkitFixtures()` to temporary `.js`
files with `compileShow()`, then pass the complete file list to the existing
hardware runner:

```bash
PIXELBLAZE_IP=192.168.8.224 npm run devbench -- /tmp/show-toolkit/*.js --settle 500 --sample 1500
```

The focused freeze test audits registry validity, fixture coverage, the version
fingerprint, fingerprint sensitivity to fixture evidence, deterministic capture
and seek, persistence normalization, compiled budgets, EPE export/reload, and
legacy visual equivalence.
