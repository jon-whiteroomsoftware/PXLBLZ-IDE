# Logical Clip authoring test matrix

Logical Clip authoring tests qualify edits through one state-transition
contract. Accepted edits preserve their inputs, return a distinct composition,
validate the complete result, project the intended logical timeline, and retain
every durable reference. Refused edits return the original composition by
reference and leave the complete prior state unchanged.

The central table-driven matrix that carried these cases was retired with
Scenes. Its v2 replacement is partial: the v2 owner suites below cover some
partitions, and the rest have no v2 coverage yet. The shared assertions in
`src/test/showAuthoringContract.ts` accept only v1 compositions
(`ShowCompositionV1`, with `validateShowComposition` as the oracle); no v2
suite uses them.

## Declared partitions

Each row varies one load-bearing dimension and names the representative v2
case by its test title, or says it has none.

| Dimension | Partition | Representative v2 coverage |
| --- | --- | --- |
| Time | Ordinary time | `showClipsV2.test.ts`: `moves animation according to ownership (shared instance: %s)`, `trim then extend holds the retained value after reopening instead of resurrecting removed changes`, `splits at %s without changing appearance or instance ownership` |
| Time | Exact Scene boundary | No v2 coverage yet |
| Time | Scene Transition gap | No v2 coverage yet |
| Time | Fractional boundary | `showClipTemporalV2.test.ts`: `refuses a fractional startMs at the temporal owner instead of rounding it` |
| Time | Show End | `showClipCreationV2.test.ts`: `extends Show End for a Clip starting exactly at Show End (#1091)`; no v2 refused-move case yet |
| Time | Occupied destination | `showClipsV2.test.ts`: `returns the original record for no-op and rejects a move into another Clip`; `showClipTemporalV2.test.ts`: `names the validator overlap issue when a move lands on an occupied same-Layer range (#1098)` |
| Ownership | Main | No v2 coverage yet |
| Ownership | Overlay Layer | No v2 coverage yet |
| Ownership | Another Zone | `showClipsV2.test.ts`: `accepts a routed destination across Layout occurrences and refuses an unavailable destination Zone` |
| Ownership | Two-Scene logical Clip | No v2 coverage yet |
| Ownership | Three-or-more-Scene logical Clip | No v2 coverage yet |
| Relationship | Isolated Clip | `showV2ClipDeletePlanning.test.ts`: `plans a free Clip as a bare delete-clip intent` |
| Relationship | Transition-connected Clips | `showClipTemporalV2.test.ts`: `splits a connected Clip with incoming endpoints on the left and outgoing endpoints on the right` |
| Relationship | Group occupancy | `showClipsV2.test.ts`: `accepts exact materialized-Group adjacency, counts the effective sharer, and refuses one-millisecond overlap` |
| Relationship | Placement animation | `showClipsV2.test.ts`: `retargets every Clip-owned Property form and preserves Effect identity inside copied appearance` |
| Relationship | Instance animation | `showTransitionsV2.test.ts`: `keeps instance animation global when a materialized Group Clip shares the moved Clip instance` |
| Relationship | Nonlinear easing | `showClipTemporalV2.test.ts`: `partitions retained nonlinear Clip activation exactly and keeps one global instance owner on split` |
| Relationship | Divergent static presentation | No v2 coverage yet |

## Operation contract coverage

Each operation names one accepted and one refused v2 case where one exists.

| Operation | Accepted v2 case | Refused v2 case | Suite |
| --- | --- | --- | --- |
| Move | `moves animation according to ownership (shared instance: %s)` | `returns the original record for no-op and rejects a move into another Clip` | `showClipsV2.test.ts` |
| Resize | `maps both selected edges and connected successors atomically across fixed Layouts` | `refuses a clip-edge resize against a converted Property ramp carrier (#1061)` | `showClipTemporalV2.test.ts` |
| Split | `splits at %s without changing appearance or instance ownership` (`showClipsV2.test.ts`) | `refuses a split at or outside the clip bounds and a group child` (`showV2ClipTemporalPlanning.test.ts`) | as named |
| Duplicate | `duplicates at exact adjacency with fresh authored identities while preserving the shared runtime` | `refuses invalid duplicate start %s atomically` | `showClipsV2.test.ts` |
| Delete | `removes Clips with their tracks and Transitions and admits the empty Show` (`showCommandsV2/commands.test.ts`) | `refuses atomically when a removed carrier has no projection plan` (`showTransitionsV2RampCarrier.test.ts`): `editShowTransitionV2` refuses a deletion lacking a required Property-ramp projection plan and preserves the input record; the same suite refuses an invalid plan. The UI planner's `refuses the final remaining Clip` (`showV2ClipDeletePlanning.test.ts`) is a UI guard, not a refusal by the operation | as named |
| Inspector edit | No v2 coverage yet | No v2 coverage yet | none |
| Transition edit | `inserts, moves, resizes and resets one Transition as immutable atomic edits` | `refuses collision and unavailable-Zone cascades atomically` | `showTransitionsV2.test.ts` |

## Deterministic sequences

These sequences were qualified against v1 compositions. None has v2 coverage
yet.

| Sequence | Stress applied |
| --- | --- |
| Move twice | A three-Scene logical Clip is repartitioned twice without losing its root or segments |
| Resize, then split | A resized two-Scene logical Clip becomes two valid logical Clips |
| Split, then move | The right split result moves without changing the left result |
| Move, then inspect | A Clip moved into another Scene remains addressable through its new inspector owner |
| Duplicate, then delete | Removing the duplicate preserves the original Clip and its Pattern reference |
| Move, resize, split, persist, reload | The serialized multi-Scene result and unified projection survive reload |
| Partial static setter, split, export, reload, compile | Each divergent physical appearance survives structural authoring |

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
| Static presentation repartition | A destination Scene cannot merge two divergent pieces, and a destination gap cannot discard one |

These are operation-level contracts, not mutation-runner fixtures. Keep the
tests beside their owning engines and retain the mutation fragments only while
they represent the same load-bearing decisions.

## Review-defect map

This map records the invariant and partition that should have exposed each
review fix. The commits predate v2; the partitions above say which now have v2
coverage.

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
example. Keep the case beside its owning v2 engine and name it from the
matching row here. Add a sequence when the failure requires valid state
produced by an earlier edit.

Changing `showAuthoringContract.ts` runs the suites mapped to it in the
`wrsp.config.mjs` boundary map. Before handoff, run the targeted suites, the
full Vitest suite, and the relevant Playwright smoke suite.
