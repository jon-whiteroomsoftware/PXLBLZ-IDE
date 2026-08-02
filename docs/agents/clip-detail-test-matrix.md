# Clip detail dialog test matrix

The Clip Entity Detail dialog qualifies through one round-trip contract: every
editable control's emitted patch is applied through `updateShowClipInspector`,
re-projected with `projectShowClipInspector`, and the re-projected value must
be exactly what the dialog then displays, including clamping and
normalization. A refused edit must return the same `ShowRecord` reference and
re-project to the unchanged prior value. This closes the seam the per-issue
suites leave open: the component suite asserting patch shapes and the engine
suite asserting update semantics can each pass while the two layers disagree
about a range, a unit, or a normalization step.

`src/components/ShowClipEntityDetail.matrix.test.tsx` owns the cross-field
matrix and the scope, read-only, and typed-edit lifecycle sweeps.
`ShowClipEntityDetail.test.tsx` retains per-issue regressions for mechanisms
that would make the matrix unreadable (takeover focus management, preview
generation races, layout classes). The engine suites remain the primary oracle
for model semantics.

## Declared partitions

| Dimension | Partition | Representative executable coverage |
| --- | --- | --- |
| Scope | `global` | Capability sweeps plus every matrix row listing `global` |
| Scope | `scene-main` | Baseline scope for Place, Effects, and Playback rows |
| Scope | `scene-overlay` | Local timing, Opacity, layer assignment, and logical Clip timing rows |
| Stage | 2D (`transformEnabled`) | Place rows; `offers every tab` sweep |
| Stage | non-2D | `drops only the Place tab off a 2D Stage` sweep |
| Mode | editable | Every round-trip row |
| Mode | read-only | Read-only sweep: every control disabled, tabs navigable, zero patches under any interaction |
| Commit | accepted | Every non-refused row; accepted scene edits also pass `validateShowComposition` |
| Commit | refused | `an impossible Duration is refused without partial state` |
| Commit | typed-edit lifecycle | Lifecycle sweep: no commit while typing, Escape abandons, one blur commits once |

## Field family coverage

Every editable control in the dialog has a round-trip row. The table names the
family and its load-bearing conversion, which is what the round trip actually
qualifies.

| Family | Fields | Conversion under test |
| --- | --- | --- |
| Header timing | Start, Duration | Seconds to logical-Clip milliseconds through connected move/resize |
| Header view | Brightness, Opacity | Percentage text to clamped fraction |
| Pattern | Source pattern | Combobox value to `{ ref, name }` plus stale control-target invalidation |
| Pattern | Speed | Multiplier text to instance `timeScale` |
| Pattern controls | Enable, disable, target value | Checkbox and percentage to the compacted `controlTargets` map (enable adopts the Studio default; disabling the last target clears the map) |
| Place content | X, Y, Width, Height, Rotation | Position/multiplier text to transform units; degrees to turns |
| Place aperture | Summary select; Viewport X, Y, Width, Height | First selection enables the Viewport via `enableViewportForContent`; geometry edits store aperture units |
| Effects | Add, remove | Palette application to a normalized appended Effect; removal to an empty stack |
| Effects | Mirror | Palette Mirror routes to `view.mirror`, never the Effect stack |
| Playback | Presentation, Strobe cadence | Mode select to compacted presentation; seconds to rounded `cadenceMs` |
| Playback | Blink toggle, rate, duty, phase | Default gate adoption; Hz clamp; fraction clamps |
| Playback | Phase, Evaluation | Fraction and policy enum round-trip |

Every row carries a display oracle asserted after re-rendering with the
re-projected value: the control must show the stored value, not merely accept
the input. The harness's `onPatch` mirrors
`ShowEditor.commitClipInspectorPatch` exactly - it applies each patch through
the real engine and returns `false` on refusal - so the refused row also
qualifies the field-level contract that a refused commit reverts the draft to
the stored value.

`onMoveLayer` is a routing callback rather than a patch; its representative
lives in `ShowClipEntityDetail.test.tsx` (`commits local timing, opacity, and
layer assignment only for an overlay`).

## Layered fault sensitivity

Deliberate-mutation probes during #658 established the division of labor:

| Mutated boundary | Detecting suite |
| --- | --- |
| Dialog emits a distorted value (halved Brightness) | Matrix round-trip rows |
| Engine clamp drifts (`timeScale` clamp narrowed) | Matrix round-trip rows |
| Capability cut loosened (`sourceOverOpacity` for `scene-main`) | `showClipInspectorModel.test.ts` capability pinning |

The capability sweeps in the matrix intentionally derive their expectations
from `showClipInspectorCapabilities`, so they qualify the capabilities-to-
rendering agreement in both directions (nothing missing, nothing extra). The
capability table itself is pinned literally in the engine suite; keep both, or
a capability change becomes invisible to one side.

## Cross-facet persistence

The Playwright journey `authors every Clip detail tab in one pass and reloads`
(`e2e/shows.auth.spec.ts`) edits one value in each of the four tabs against the
real store, reloads, and verifies all four survived together. Per-facet reload
coverage cannot catch one facet's patch clobbering another's on the same
placement; the journey exists for exactly that failure.

## Maintenance rule

A Clip detail bug adds or sharpens a matrix row before it adds an isolated
example. When a new control lands in the dialog, add its round-trip row in the
same change; the read-only and lifecycle sweeps pick it up automatically only
if it renders as a standard disabled-capable control, so verify the sweep
still passes rather than assuming. Keep mechanism-heavy regressions
(focus management, preview races, layout) in `ShowClipEntityDetail.test.tsx`
beside their issue history, and keep model semantics in the engine suites.
Before handoff, run the matrix, the component suite, the inspector-model
suite, and `npm run test:e2e:shows` when the dialog surface changed.
