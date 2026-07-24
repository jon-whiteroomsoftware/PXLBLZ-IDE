# Logical Clip authoring test matrix

Logical Clip authoring tests qualify edits through one state-transition
contract. Accepted edits preserve their inputs, return a distinct composition,
validate the complete result, project the intended logical timeline, and retain
every durable reference. Refused edits return the original composition by
reference and leave the complete prior state unchanged.

`src/engine/showAuthoringMatrix.test.ts` owns the cross-operation matrix and
short edit sequences. Operation-specific suites retain detailed regressions for
mechanisms that would make the central matrix unreadable. The shared assertions
live in `src/test/showAuthoringContract.ts`.

## Declared partitions

The matrix varies one load-bearing dimension at a time. A row names the
representative executable case; nearby operation-specific regressions can
exercise additional combinations without expanding this into a Cartesian
product.

| Dimension | Partition | Representative executable coverage |
| --- | --- | --- |
| Time | Ordinary Scene time | Accepted move, resize, and split rows in `showAuthoringMatrix.test.ts` |
| Time | Exact Scene boundary | `exact Scene start after a Transition` matrix row |
| Time | Scene Transition gap | Refused move matrix row; `disables Split inside the hidden Scene Transition gap` |
| Time | Fractional boundary | `fractional boundary rounded once` matrix row; `rounds one fractional logical Clip split boundary` |
| Time | Show End | Refused Show End move matrix row; `adds a Clip at Show End by extending the final interval` |
| Time | Occupied destination | Refused duplicate matrix row; `rejects a move that would overwrite another Clip` |
| Ownership | Main | Accepted and refused operation rows use Main as the baseline owner |
| Ownership | Overlay Layer | `overlay Layer ownership` matrix row |
| Ownership | Another Zone | `another Zone` matrix row |
| Ownership | Two-Scene logical Clip | `logical Clip spanning two Scenes` matrix row |
| Ownership | Three-or-more-Scene logical Clip | `logical Clip spanning three Scenes` matrix row and consecutive-move sequence |
| Relationship | Isolated Clip | Baseline operation rows |
| Relationship | Transition-connected Clips | `Transition-connected Clips` matrix row and Transition edit rows |
| Relationship | Group occupancy | Refused `Group-occupied destination` matrix row |
| Relationship | Placement animation | `placement animation` matrix row and animated split regression |
| Relationship | Instance animation | `instance animation` matrix row and partitioned-keyframe regressions |
| Relationship | Nonlinear easing | Refused `nonlinear instance easing across Scenes` matrix row |

## Operation contract coverage

Every operation has an accepted and refused representative in the table-driven
matrix. More specialized regressions remain beside the owning engine.

| Operation | Accepted partition | Refused partition | Primary specialized suite |
| --- | --- | --- | --- |
| Move | Ordinary Scene time | Scene Transition gap | `showTimelineClipAuthoring.test.ts` |
| Resize | Ordinary Scene time | Non-positive duration | `showTimelineClipAuthoring.test.ts` |
| Split | Ordinary Scene time | Exact Clip boundary | `showTimelineClipAuthoring.test.ts` |
| Duplicate | Empty destination | Occupied destination | `showTimelineClipAuthoring.test.ts` |
| Delete | One of multiple Clips | Final remaining Clip | `showCompositionModel.test.ts` |
| Inspector edit | Placement-owned property | Out-of-bounds duration | `showClipInspectorModel.test.ts` |
| Transition edit | Isolated derived Cut | Non-positive duration | `showLayerTransitionAuthoring.test.ts` |

The accepted callback checks visible logical Clip identity plus the references
specific to the operation: Pattern instances, placement or instance property
tracks, Transition endpoints, logical segment roots, or destination ownership.
`validateShowComposition` remains the full structural oracle. The refused
callback compares both the Show and composition to deep snapshots and requires
same-reference refusal.

## Deterministic sequences

Each step below independently passes the accepted-edit contract. A sequence
therefore localizes a failure to the first state transition that violates
validation, projection, or reference integrity.

| Sequence | Stress applied |
| --- | --- |
| Move twice | A three-Scene logical Clip is repartitioned twice without losing its root or segments |
| Resize, then split | A resized two-Scene logical Clip becomes two valid logical Clips |
| Split, then move | The right split result moves without changing the left result |
| Move, then inspect | A Clip moved into another Scene remains addressable through its new inspector owner |
| Duplicate, then delete | Removing the duplicate preserves the original Clip and its Pattern reference |
| Move, resize, split, persist, reload | `showStore.test.ts` verifies the serialized multi-Scene result and unified projection |

## Mutation-driven refinements

The targeted mutation command in
[`verification.md`](verification.md#show-authoring-mutation-qualification)
qualifies one load-bearing fault boundary for each operation family. Its first
run exposed three missing distinctions that ordinary coverage did not:

| Boundary | Strengthened oracle |
| --- | --- |
| Split plan | Exact Clip start and end remain disabled; only a strict interior time is splittable |
| Inspector accepted no-op | An exact no-op Start may accompany an opacity change, and the placement change still commits |
| Inspector refused edit | An invalid Start refuses the colocated opacity change even when Duration equals the current value |

These are operation-level contracts, not mutation-runner fixtures. Keep the
tests beside their owning engines and retain the mutation fragments only while
they represent the same load-bearing decisions.

## Review-defect map

This map records the invariant and partition that should have exposed each
review fix. The named regression is retained in the operation-specific suite;
the matrix row supplies the broader neighboring partition.

| Commit | Defect family | Detecting invariant and partition |
| --- | --- | --- |
| `b675fe4` | Inspector Start edit left a connected chain behind | Transition-connected inspector edits move the complete chain; exact Start edit |
| `0bcc403` | Inspector duration edit left an outgoing endpoint on an old segment | Every Transition endpoint resolves after logical repartition; multi-Scene resize |
| `b588a44` | Trimming away the root Scene stranded a Transition endpoint | Endpoint identity follows the surviving outer segment; Transition-connected trim |
| `7af5df0` | Growth created a new end segment without retargeting its Transition | Endpoint identity follows the new outer segment; multi-Scene growth |
| `7af5df0` | Duplicate continuation IDs collided with existing IDs | Every physical placement ID remains unique; multi-Scene duplicate |
| `208952d` | Clone overlapped a Layer Transition | Refused edits preserve full state; Transition-gap destination |
| `208952d` | Layout and time insertion cut through one logical Clip | Structural commands reject partial logical ownership; exact internal boundary |
| `2658720` | Clone ignored occupied time and Scene ownership | Destination interval must be empty and owned by one valid span; occupied and Scene-boundary partitions |
| `2658720` | Layout edits could partially capture a logical Clip | A logical Clip is indivisible to layout ownership; multi-Scene relationship |
| `1b8de14` | Inspector staged opacity before a timing move completed | Multi-field edits commit atomically; overlay move across a Scene |
| `01e0e2d` | Cross-Scene move discarded or misplaced instance keyframes | Every moved keyframe maps to a Scene hold; instance-animation and Transition-gap partitions |
| `1c4d9f6` | Fractional split rounded the two halves inconsistently | One rounded boundary governs both halves; fractional-time partition |
| `1c4d9f6` | Layout duplication failed to remap logical roots | Copied segments resolve to the copied root; multi-Scene duplicate |
| `e4feffc` | Hidden segments could disagree on presentation | All segments of one logical Clip share placement-owned presentation; multi-Scene validation |
| `ad8e725` | Move would silently linearize nonlinear animation | Unsupported nonlinear repartition refuses atomically; nonlinear-easing partition |
| `ad8e725` | Split or clone plan disagreed with commit at a Transition gap | Plan and commit share the same hold/gap partition; Transition-gap partition |
| `498e9ed` | Scene split and Insert Time could cut through a logical Clip | Show structure cannot bisect logical ownership; exact internal boundary |
| `aed18aa` | Invalid timing could still commit opacity | Inspector edits are one atomic transaction; refused out-of-bounds edit |
| `7b4b493` | Malformed aliases enabled destructive coalescing | Invalid logical identity refuses before mutation; delete partition |
| `7b4b493` | Clone accepted unsupported multi-Scene placement animation | Unsupported animation refuses without partial copies; placement-animation partition |
| `3dddeee` | Delete removed only one segment or left placement tracks | Delete owns every segment, track, and connected reference; multi-Scene delete |
| `3dddeee` | Group selection captured only part of a logical Clip | Group membership expands to complete logical identity; Group partition |
| `d2b539b` | Split and connected edits retained physical endpoint assumptions | Endpoints resolve through logical start/end segments; animated split and Transition-connected partitions |
| `6202fd8` | Transition authoring and connected movement treated segments as separate Clips | Connected edits operate on the projected logical Clip and repartition all segments |
| `fd44de7` | Inspector, split, duplicate, and independence edits updated only visible segments | Placement-owned edits apply to the complete logical identity; two-Scene partition |
| `dc453e9` | Drag and resize snapping disagreed with commit across hidden owners | Preview plans and commits use the same global boundary and ownership partition |
| `2655bd9` | Layer moves retained invalid Transitions and reload lost empty Layers | Cross-Layer moves detach incompatible relationships; persistence retains authored ownership |

## Maintenance rule

A logical Clip bug adds or sharpens a partition before it adds an isolated
example. Put the smallest representative case in the central matrix when the
defect generalizes across operations. Keep mechanism-heavy regressions beside
their engine, and link them from this document. Add a sequence when the failure
requires valid state produced by an earlier edit.

Changing `showAuthoringContract.ts` runs the central matrix, the four
operation-specific authoring suites, and the persistence sequence through
`scripts/test-selection.mjs`. Before handoff, run those targeted suites, the
full Vitest suite, and the relevant Playwright smoke suite.
