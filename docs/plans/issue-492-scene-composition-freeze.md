# Issue 492: Scene-composition release freeze

## Outcome

Scene composition now has one automated release gate over the production path.
The gate does not replace the existing catalogue or branch tests. It joins the
new version-1 composition model to the exact preview, artifact, deterministic
replay, EPE, and Controller-preparation paths that ship.

The physical release decision is complete. Both frozen compositions ran on a
representative firmware-3.67 Pixelblaze on 2026-07-16. The four-renderer
Crossfade window remained smooth and usable, so three and four simultaneous
renderers remain warnings while five remains outside the v2 support envelope.

## Frozen production fixtures

`src/engine/showCompositionFreeze.ts` owns two deterministic fixtures:

| Fixture | Output contract | Composition facts | Stress fact |
| --- | --- | --- | --- |
| `portable-local-composition` | Portable 2D, 64 preview pixels | local Main cuts, one overlay, shared Continue instance, explicit Restart instance, placement Effect, Animation speed, brightness, Effect, and opacity keyframes, top-level Crossfade | 60,019 UTF-8 generated-source bytes; 87.8% source-size proxy against the separately measured 68,384-byte compiled-bytecode activation ceiling |
| `installation-routed-composition` | fixed 64-pixel Installation with two physical Zones | two simultaneous Zone stacks, Main plus overlay in each Zone, top-level Crossfade | four simultaneous Pattern renderers per pixel at the worst instant |

The Installation reports two renderers per pixel in steady state and `4 * N`
Pattern evaluations during its Crossfade. This corrects the older
transition-only cost description that treated every Scene as one source even
when an overlay stack was active.

For both fixtures, `showCompositionFreeze.test.ts` requires:

1. version-1 model validation succeeds;
2. preview and artifact compilation emit byte-identical generated code;
3. repeated deterministic seeks agree at local cuts, overlay boundaries, the
   top-level transition, and later Scene-local time;
4. normalized JSON round-trips without identity or ordering drift;
5. EPE stamping feeds Controller preparation without an adapter or block; and
6. exact artifact and renderer-pressure measurements remain inside the frozen
   release envelope.

The first integrated run found a real defect: a placement-owned Property track
was copied into derived intervals where its placement was inactive. Model
validation accepted the authored track, but the compiler then rejected the
missing interval-local placement. `showCompositionLowering.ts` now emits a
placement-owned track only in intervals where that owner is active. Instance
tracks remain available across the whole Scene because the instance owns its
clock and private state independently of placement visibility.

## Persistence and schema safety

The flat Show remains the compatibility authority. `composition_json` is an
additive nullable sidecar.

- A valid version-1 sidecar is normalized and semantically validated on load.
- Malformed version-1 data, an unknown future version, or semantically invalid
  ownership is discarded without changing the flat Scenes, Zones, cells,
  routing, Transitions, or output contract.
- Create and update reject an unsupported composition envelope with HTTP 400
  before issuing a D1 write.
- Returning to a flat Show still writes SQL `NULL`.
- The D1 column contract has a direct create-to-row normalized round-trip test.

This is deliberate fail-safe behavior, not a destructive migration. A newer
client may preserve future data in D1; an older v2 client continues to load the
flat Show rather than guessing at a schema it does not understand.

## Release pressure envelope

`showCompilePressure.ts` keeps code-size and simultaneous-source pressure
separate. The thresholds are product support boundaries:

| Axis | Normal | Warning | Block |
| --- | --- | --- | --- |
| Generated artifact | below 80% of measured activation budget | 80% to below 100% | at or above the measured 68,384-byte activation budget |
| Worst-instant Pattern renderers per pixel | one or two | three or four | five or more |

One renderer is the steady-state target. Two is an intentional Crossfade or
bounded blend. Three and four are valid but disclosed because overlays can add
their work to a Transition window. Five is blocked because it lies beyond the
largest v2 release fixture, not because the code claims a universal Pixelblaze
hardware limit.

The Show compile bar turns amber or red, names the exact renderer count, and
states every warning or block. A blocked Show remains previewable and its code
remains inspectable, but export, Run, Save, and background Controller
reconciliation do not publish it.

## Existing branch evidence retained

The release gate depends on, rather than duplicates, the focused suites:

| Behavior | Authority |
| --- | --- |
| flat Show projection, Continue/Restart identity, one/multi-Zone and fixed Installation recipe parity | `showCompositionProjection.test.ts` |
| local Main schedules, gaps, overlay order, placement identity, Property-track offsets | `showCompositionLowering.test.ts` |
| atomic edits, split/restart, overlay collision and layer operations | `showCompositionModel.test.ts` |
| typed keyframe constraints and easing equivalence | `showPropertyAnimation.test.ts` |
| preview/artifact agreement and deterministic seek | `showPreviewArtifact.test.ts` |
| Controller renderer and output-contract preparation | `showControllerArtifact.test.ts` |
| routed layouts, span/repeat sampling, Transitions, Effects, and renderer formulas | `showCompiler.test.ts` and the focused Effect/Transition suites |
| all 59 visual-toolkit variants and 104 headless fixtures | `showVisualToolkitFreeze.test.ts` |
| D1 sidecar save/load and unknown-version safety | `src/cloudflare/shows.test.ts` |

Span and repeat remain top-level flat compatibility behavior; version 1 does
not invent a second local representation for them. The unified compiler still
applies those branches after composition lowering where they are authored.

## Human Controller gate

The gate ran both frozen fixtures on a representative firmware-3.67 Pixelblaze.
The final exact Installation run used the attached 256-pixel matrix so the
long schedule and physical Zone behavior were visible at useful density. For
each fixture the review:

1. activate the exact EPE-stamped source produced by the gate;
2. observe output at every `sampleTimesMs` boundary;
3. confirm no compiler, activation, transport, or watchdog failure;
4. record minimum/mean FPS and the Controller model;
5. verify the Installation's two physical Zones and its transition window; and
6. judge whether the four-renderer window remains usable or whether the warning
   boundary must become a lower block.

The Portable artifact compiled to 23,134 bytes of Controller bytecode and ran at
about 14.27 mean FPS. The Installation artifact compiled to 12,778 bytes of
Controller bytecode and ran at 21.99 mean FPS, with a 22.44 maximum and one
transient 11.17 minimum sample. Human review described the motion as
exceptionally smooth. The Installation stayed in Scene 1 through 30 seconds,
crossfaded from 30 to 32 seconds, held the swapped Scene-2 Zone states through
62 seconds, and then looped correctly. This run also exposed and verified the
fix for using millisecond Show clocks beyond Pixelblaze's signed 16.16 range.

`representativeHardwareFps` remains `null` in the deterministic fixture result:
automated measurement never substitutes a local replay estimate for dated
physical evidence. This section and the Technical Reference own the human gate.

## Automated verification

```bash
npx vitest run src/cloudflare/shows.test.ts
npx vitest run src/engine/showCompositionLowering.test.ts
npx vitest run src/engine/showCompilePressure.test.ts
npx vitest run src/engine/showCompositionFreeze.test.ts
npx vitest run src/components/ShowEditor.test.tsx -t "release-envelope warnings"
npx playwright test --config playwright.auth.config.ts shows.auth.spec.ts --grep "opens built-in Show lessons|ships the dense Timeline frame"
npm test -- --run --maxWorkers=1
npm run lint
npm run build
```
