# Clip appearance surface audit (#1038)

Every capability of the pure owner `editShowClipAppearanceV2`
(`src/engine/showClipAppearanceEditsV2.ts`) mapped to its editor exposure,
admission ingress and authenticated route coverage. "Before" is local main
`8666d8890b1768d0da55268c62c44b540d5395bc`; "after" is this slice.

## Held appearance patch fields

| Owner capability | Editor before | Editor after | Admission ingress | Route coverage after |
| --- | --- | --- | --- | --- |
| `opacity` | Clip opacity | unchanged | shape-checked object patch | `show-v2-appearance` |
| `view.brightness` | View brightness | unchanged | same | `show-v2-appearance` |
| `view.phase` | View phase | unchanged | same | `show-v2-appearance` (narrow keyboard) |
| `view.mirror` | Clip mirror | unchanged | same | `show-v2-appearance` |
| `transform.positionX/positionY/rotation/scaleX/scaleY` | **absent** | five numeric drafts | same | `show-v2-appearance-surface` |
| `transform: null` | **absent** | Clear component → Transform | same | model/component tests |
| `aperture.enabled/invert` | **absent** | two on/off selects | same | `show-v2-appearance-surface` (`enabled`) |
| `aperture.x/y/width/height` | **absent** | four numeric drafts | same | `show-v2-appearance-surface` |
| `aperture.aperture` (shape) | **absent** | select over `SHOW_CLIP_APERTURE_SHAPES` | same | `show-v2-appearance-surface` |
| `aperture.edge` | **absent** | hard/soft/dither select | same | model/component tests |
| `aperture.feather/rotation` | **absent** | two numeric drafts | same | `show-v2-appearance-surface` (`feather`) |
| `aperture.ringWidth/cornerRadius/crossWidth/starPoints/starInner/crescentOffset/polygonSides` | **absent** | seven numeric drafts | same | model tests |
| `aperture.<field>: null` (12 nullable fields) | **absent** | Clear component → Aperture detail | same | `show-v2-appearance-surface` (`feather`) |
| `aperture: null` | **absent** | Clear component → Aperture | same | model tests |
| `presentation` live/freeze/strobe + `cadenceMs` | **absent** | mode select and cadence draft | same | `show-v2-appearance-surface` (`live`, refused `freeze`) |
| `presentation: null` | **absent** | Clear component → Presentation | same | model tests |
| `blink.rateHz/duty/phase` | **absent** | three numeric drafts | same | `show-v2-appearance-surface` |
| `blink: null` | **absent** | Clear component → Blink | same | artifact test |

The admission ingress column is uniform because `validAppearanceIntentShape`
always checked operation, scope and identity shapes and left field values to
the pure owner; the gap this slice closes is entirely editor exposure.

## Effect operations

| Owner capability | Owner before | Editor before | After |
| --- | --- | --- | --- |
| `add-effect` | present | New Effect kind + Add Effect | unchanged |
| `update-effect` | present | Parameter + Value + Apply parameter | unchanged |
| `duplicate-effect` | present | Duplicate Effect | unchanged |
| `reorder-effect` | present | Place/Target + Move Effect | unchanged |
| `remove-effect` | **absent** | **absent** | new intent, admission ingress, Remove Effect action |

## Scopes

| Scope | Owner | Editor | Route |
| --- | --- | --- | --- |
| whole-clip | present before | present before | both specs |
| selected-time (retain / insert key) | present before | present before | both specs; `show-v2-appearance-surface` inserts an interior Aperture key |

Selected-time boundary refusals (exact end, outside-bar Transition
contribution) were already proved for `appearance`; this slice extends the same
partitions to `remove-effect` in
`src/engine/showClipAppearanceEffectRemovalV2.test.ts`.

## Legacy Effect removal behaviour, established before extending the owner

`remove_clip_effect` (`src/engine/showCommands/effects.ts:77`, descriptor at
`:95`) filtered the Effect out of the resolved placement's stack and passed the
new stack to `updateShowClipInspector`. That owner then called
`pruneRemovedEffectPropertyTracks`
(`src/engine/showClipInspectorModel.ts:289`, `:554`), which dropped each Scene
Property track whose `placement-effect` target named a placement of the same
logical Clip and no longer resolved to an existing `effectId`/`effectKind` in
that placement's stack. Tracks on other placements, other targets and every
other Effect kept their identity and order.
`src/engine/showCommands/commands.test.ts:970` asserts exactly that: the Effect
stack empties and the Scene's `propertyTracks` becomes `[]`; the command's
affected-entity computation (`:1775`) reports the removed track and its
keyframe IDs. Legacy did not refuse, and it did not touch Transition ramps.

The v2 owner expresses that cascade per appearance span, because one v2 Clip
carries the held stacks that several v1 placements used to carry. A Transition
property ramp still targeting the removed Effect is not silently deleted: the
existing reference check refuses the whole edit and names the Transition.
