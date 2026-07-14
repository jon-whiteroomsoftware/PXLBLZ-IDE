# Show visual-toolkit headless freeze

The UI-neutral Show visual-toolkit contract is frozen at version 1 with
fingerprint `68ba010c`. The fingerprint covers the complete registry and its
variant-to-fixture mapping. An intentional descriptor change must update the
contract version, fingerprint assertion, and this evidence record together.

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

## External gates

Representative hardware FPS remains `null`. The repository has no connected
Pixelblaze result from which to derive it. Complete the gate by recording:

- Pixelblaze model and firmware;
- map dimensions and pixel count;
- fixture id and generated artifact bytes;
- steady-state frames per second; and
- any visible divergence from the deterministic capture.

The signature SDF review in #452 and distortion review in #456 also remain
human gates. This freeze does not convert deterministic evidence into visual
approval.

## Reproduction

```bash
npx vitest run src/engine/showVisualToolkitFreeze.test.ts
npm run lint
npm test -- --run
npm run build
```

The focused freeze test audits registry validity, fixture coverage, the version
fingerprint, deterministic capture and seek, persistence normalization,
compiled budgets, EPE export/reload, and legacy visual equivalence.
