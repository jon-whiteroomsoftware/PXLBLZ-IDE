# Show Output Contracts

## Decision

Every new Show chooses one immutable output-contract kind before the timeline
opens. The contract describes what the finished choreography promises, not
merely how the preview happens to be configured.

- An **Installation Show** targets one known physical build. It owns an exact
  pixel count and an output map. It may use logical zones and physical zones.
- A **Portable Show** targets a compatible family of 2D mapped surfaces. It
  owns logical zones and a reference preview configuration, but no exact LED
  identity or physical zone ranges.

There is no conversion command between contracts. Re-creating a Show under the
other contract is deliberate because topology-dependent routing cannot be
translated honestly in the general case.

The creation-and-persistence slice is implemented in issue #434: new records
carry the versioned contract, creation remains provisional through the final
action, reopening restores the contract, and the right pane is read-only output
context. Issue #435 implements Installation authority and coverage: the saved
count drives preview and compilation, every physical layout must cover it exactly
once, invalid ranges remain editable while artifact actions are blocked, and the
Stage reports saved map/count/coverage. Issue #436 implements Portable 2D
authority: editable reference output, normalized full-surface/stripe/grid/split
routing, runtime-count compilation, 2D renderer capability analysis, aspect
warnings, and removal of physical/Controller authoring. Artifact metadata
round-trip and Controller checks are implemented in issue #437: one optional
versioned banner record survives EPE, read-back, renderer adapters, and saved
inventory; Installation exact mismatches block while Portable compatibility is
advisory. Issue #438 classifies legacy records without guessing, issue #439
restores the Show keyboard-authoring loop, and issue #340 adds saved-map spatial
selection for Installation physical zones. All implementation slices are
software-complete and awaiting human review; paired teaching Shows remain the
independent content follow-up in #363.

**Portable** is the final UI label. The creation comparison pairs it with the
scope descriptor **Resolution-independent 2D**.
Avoid **Portable panel**: panel implies flat rectangular hardware, while the
current 2D contract can also cover rings, curved mapped surfaces, and irregular
2D coordinates. The stored enum must not depend on display copy.

## Product model

The contract choice matches two common authoring intentions:

1. Pixelblaze installation work begins with a real LED count and usually a real
   map. Those facts are part of the artwork and deployment target.
2. Resolution-independent composition begins with normalized coordinates and a
   promise that the choreography remains recognizable across compatible output.

Both contracts use the same timeline, transitions, clips, logical zone rows,
and generated-Pattern pipeline. They fork only where physical identity changes
what can be authored or guaranteed.

| Capability | Portable Show | Installation Show |
| --- | --- | --- |
| Pixel count | LED-resolution independent; reference preview count only | Required exact count |
| Output map | Compatible 2D map family | Required exact or generated map |
| Logical spatial zones | Yes | Yes |
| Physical index/range zones | No | Yes |
| Zone coverage rule | Logical routing covers normalized output | Physical zones account for the Show pixel count |
| Controller check | Compatibility advisory | Exact-count/map compatibility confirmation |
| Artifact metadata | Portable compatibility contract | Installation output contract |

Portable does not currently promise 3D. The compiler has no complete 3D
logical-routing vocabulary, zone-local coordinate policy, remapping policy, or
map compatibility test. A future 3D contract should be evidence-led rather than
inferred from the preview renderer's ability to draw a volume.

## Creation flow

**New Show** opens a substantial interstitial before any record is created. The
recommended design is one compact comparison sheet inside the normal three-pane
IDE shell. Portable and Installation remain aligned as two columns in one
surface; each column carries its visual, best use, included capabilities,
limitations, and action. It is not a multi-step wizard and does not split the
choices into independent cards or a second comparison table.

After choosing a contract:

- Installation asks for Show name, pixel count, and output map. A fixed-geometry
  map supplies and locks its measured count. A generated map accepts the chosen
  count. The initial physical zone receives the entire output so the Show begins
  valid.
- Portable asks for Show name plus an optional reference map and reference pixel
  count used only for preview. The UI explicitly says these are not an exact
  hardware promise. Initial scope is compatible 2D mapped surfaces.

The chosen contract remains visible in the editor header and Show properties.
The editor must not depend on users remembering the interstitial.

Creation is provisional until the final **Create Show** action. **Cancel** and
Escape leave the flow without creating a record and restore the previously open
Show. If no Show was open, they return to the Shows empty state. Escape must not
steal the first press from an open native menu, popover, or other dismissible
control.

Stock Shows later provide a second teaching path. Each contract should have a
small progression from one simple example to advanced routing. Examples may
link into creation, but unavailable stock content must not be simulated in the
first implementation.

## Editor and preview boundaries

The center pane owns Show mutations. Show properties provide the durable output
contract and any editable setup fields permitted by that contract.

The right pane remains the read-only output surface. It previews the saved
output contract and reports Stage/map, renderer, transport, pixels, zones, and
compatibility. It does not change the Show's output map or pixel count.

Preview overrides may eventually let an author test a Portable Show against a
different compatible map or count. Such overrides must be visibly temporary and
must not rewrite the saved reference configuration or artifact contract.

## Zones and validation

Logical zones are semantic normalized regions and remain useful in both
contracts. Physical zones are Installation-only because they name actual LED
indexes or ranges.

An Installation Show must account for exactly its master pixel count. Validation
reports errors without automatically repairing authored ranges:

- overlapping physical ownership is an error;
- out-of-range indexes are errors;
- missing pixels are an error before compile, export, Run, or Save; and
- the UI reports assigned, overlapping, missing, and total pixels in plain
  language.

Marquee selection on a spatial Stage belongs to Installation physical-zone
authoring. Logical zone authoring should not require physical LED selection.

## Persistence and artifacts

Add an explicit versioned contract to the Show record. A representative shape
is:

```ts
type ShowOutputContract =
  | {
      kind: 'portable-2d'
      referenceMapId: string | null
      referencePixelCount: number
      compatibility: {
        dimensions: readonly [2]
        mapClass: 'continuous-surface'
        resolution: 'variable'
      }
    }
  | {
      kind: 'installation'
      pixelCount: number
      outputMapId: string | null
      outputMapFingerprint?: string
      resolution: 'fixed'
    }
```

Exact field names should follow existing persistence conventions. The compiler,
EPE export, source comments, Controller read-back, and artifact inspection all
carry the same contract. Controller send compares it with the connected device
without silently changing the Controller's shared map.

Existing Shows need a deterministic migration. Because current Shows already
carry a saved Stage and may bind Controller ranges, migration should classify
only cases that can be proven. Ambiguous records should open a one-time contract
choice with their current Stage/count prefilled; migration must not guess
portability from a map dimension alone.

## Fast timeline keyboard loop

Show authoring should support the repeated loop: select an entity, make one
inspector change, tap Space, inspect the result, and adjust again. Keyboard
transport is scoped to the Show workspace rather than installed as an
application-wide shortcut.

The initial shortcut contract is:

| Key | Show workspace behavior |
| --- | --- |
| Space | Toggle play/pause |
| Left Arrow | Seek backward exactly 1 second |
| Right Arrow | Seek forward exactly 1 second |
| Home | Seek to Show time zero |
| Delete | Delete the selected timeline entity, preserving existing confirmation rules |

Relative seeks clamp to `0..duration`, use the accurate Show seek path, and
preserve whether playback was running before the seek. Holding an arrow uses the
operating system's normal key repeat. Do not add time-window-based exponential
acceleration initially: it makes the same key sequence produce different seek
distances and works against exact editing. Revisit a coarse-seek modifier only
if repeated one-second seeking proves insufficient.

The existing transport **Go to Show start** button remains the visible and
pointer-accessible route to zero; its tooltip discloses the Home shortcut.
Timeline navigator thumbs, text fields, sliders, and other controls retain their
own Arrow-key behavior.

Focus behavior is part of the command contract:

- choosing a discrete inspector value and closing its menu returns focus to the
  last selected timeline entity or the timeline workspace;
- text, number, range, and content-editable controls keep focus while editing so
  Space and Arrow keys retain their ordinary field meaning;
- Enter commits a text/number edit and may return focus to the timeline; Escape
  cancels or exits that edit before it can affect the enclosing creation/editor
  flow; and
- implementation uses a Show-scoped focus-return helper or control wrapper, not
  `document.activeElement.blur()` or a global form policy.

The delivered keyboard slice extends the same focus classification and tests
across selected-entity deletion, select commit followed by Space, one-second
seeks, clamping, playback preservation, Home, and controls that own Arrow keys.

## Delivered slices

The second Show round shipped as these independently reviewable vertical slices:

1. Persist the contract and migrate existing Shows.
2. Create Shows through the educational interstitial.
3. Enforce Installation map/count semantics and zone coverage.
4. Enforce the Portable 2D capability boundary and logical-zone vocabulary.
5. Carry contracts through compile, export, import, inspection, and Controller
   compatibility checks.
6. Move saved Show mutations out of the right pane and expose read-only output
   facts there.
7. Complete the fast timeline keyboard loop and focus-return contract.
8. Add Installation spatial zone selection after the contract and validation
   model are stable.

The paired stock-Show learning progression was split into independent content
issue #363 after both contracts became authorable and inspectable end to end.

## Design evidence

The approved interactive design artifact is
[show-output-contracts-mockup.html](../show-output-contracts-mockup.html). It keeps
the normal three-pane Studio shell, reserves the right pane for output, and uses
one compact two-column comparison rather than separate cards or a wizard. Each
column leads with the user-visible promise, gives terse examples for unfamiliar
terms, and keeps its limitations beside its capabilities.

Earlier guided-path and example-led variants were rejected or deferred and are
not retained as implementation authority. The standalone mockup is design
evidence only; current production behavior belongs to the reference docs.
