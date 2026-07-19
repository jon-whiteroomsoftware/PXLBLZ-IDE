# Nested Studio entity organization (#426)

## Decision

Pattern and Show rails use compact recursive trees. Personal content supports folders, exact manual order, whole-row drag and drop, keyboard navigation, overflow actions, and recoverable Trash. Built-in content uses the same row grammar with a curated immutable hierarchy.

The tree stays continuous at every depth. It does not open a focus aperture, switch to a separate gallery, or apply automatic sorting. Names retain the central horizontal lane; each nested level costs 14 pixels and rows use one leading symbol: a disclosure chevron for folders or the existing entity icon for leaves.

This is visual organization only. Pattern and Show records keep their existing IDs, URLs, names, source, references, compilation behavior, and Controller bindings.

## User model

Patterns and Shows each have two structurally separate regions:

- **Personal** is mutable and starts directly beneath the main rail header without another labeled bar. Users create folders from the header action menu, rename them, reorder siblings, nest content, move nodes between folders, and move nodes to Trash.
- **Built-in** is immutable. The IDE supplies useful folders, while selection and disclosure behave like the Personal tree.

Patterns and Shows own independent organization documents. A folder contains one entity type; it cannot mix Patterns and Shows.

Manual order is authoritative. Drag and drop changes that order directly. The overflow menu provides **Move up**, **Move down**, and **Move to...** for precision and non-drag access. Sorted views are deferred until there is evidence that they add more value than the simple model.

## Interaction contract

The whole row is draggable; a dedicated drag handle is unnecessary. A drop near a row edge inserts before or after it. Dropping on the center of a folder moves the source inside that folder. The drop cue belongs to the active drag session and clears on drop, drag end, or when the pointer leaves the tree.

Folder and entity rows use the same 20-pixel rhythm:

```text
| active bar | indent | chevron or entity icon | name........ | count | menu |
```

The tree supports conventional keyboard movement:

- Up and Down move focus through visible rows.
- Right opens a collapsed folder.
- Left closes an open folder.
- Enter opens an entity or toggles a folder. Space always controls Preview playback unless focus is in a text-entry surface.
- The overflow menu exposes rename, relative reorder, destination move, and Trash.

Search replaces each tree with flat matching entities and their folder paths. It searches through collapsed folders and matches across both the entity name and path terms. For example, `friendly clockwork` finds `ClockworkIris` under `FPS Friendly`. Search never mutates disclosure state.

## Trash

Trash is an inert recovery area at the bottom of Personal content. Moving a folder moves its full subtree and preserves its original parent, position, and collapsed state. Restore returns the subtree to that exact location when the parent still exists.

Trash changes organization only. It does not delete Pattern or Show records, which keeps the first slice fully recoverable. Permanent deletion can be designed separately if it becomes necessary.

## Persistence

Organization is a versioned sidecar in the existing user-scoped settings store:

- `patternOrganization`
- `showOrganization`

Each document stores recursive nodes, Trash entries, and collapsed folder IDs. Entity nodes contain stable record IDs. Paths are derived from folder placement and never become identity.

On first load, the IDE migrates the current flat order into root-level entity nodes. Normalization removes stale or duplicate references and appends newly created records at the root without disturbing existing manual order. Writes are optimistic and serialized per entity type; a failed write rolls back the latest optimistic state.

The sidecar deliberately leaves the entity APIs and D1 record schema unchanged. Existing deep links, Show Pattern references, imports, exports, and Controller behavior continue to address the same records.

## Built-in hierarchy

Built-in Patterns use the existing gallery catalogue sections, including FPS Friendly, Living 1D, Test Patterns, and ShaderToy Ports. The dimension lens filters the tree, so entity rows do not spend permanent horizontal space on dimension pills.

Built-in Shows expose the curriculum structure directly:

```text
Learn
  100
  200
Showcases
  Effects
  Transitions & animation
  Installations
```

## Boundaries and follow-ups

The tree accepts up to eight folder levels. The current implementation intentionally omits arbitrary-depth virtualization, undo, permanent deletion, automatic sort views, and cross-type folders. Those features require evidence from real catalogues rather than expanding the first slice speculatively.

Maps, Mixins, and Libraries can adopt the same pure organization model later. Issue #426 ships the shared mechanism through Patterns and Shows, where catalogue size and user value are already clear.

## Verification

The production slice is covered by pure model, store, provider, resource-protection, component, and PatternList integration tests. Browser verification covers the signed-in Personal catalogue, curated Built-in trees, folder-path search, ordinary desktop layout, a 760-pixel narrow viewport, and console errors. The drag regression has a focused test proving that leaving the tree clears every stale drop cue.
