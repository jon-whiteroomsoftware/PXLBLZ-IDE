# Overlay Layer creation evidence (#951)

The approved sparse Group repair and consumer proof are complete; final suites,
review and landing remain coordinator work. Layer creation now realizes target-Zone
implicit shells through the Group materializer's shared shell owner before
prepending the fresh empty Layer. It retains Group definitions and occurrences.

The accepted sparse importer regression failed before the repair and now passes.
Focused tests cover multiple occurrences, ordinals and Scenes, unchanged other
Zones, collisions, complete input/output preservation, and sparse/nonsparse
canonical, diagnostic and manual parity. The real-editor sequence uses sparse input and passed against source commit
`a77b98dfba69f988a54773fb2b363545a66a1bcb` in 5.5 seconds (9.0 seconds total).
[Fresh records](L951-sparse.json), [reopened export](L951-sparse-export.json) and
[capture](L951-sparse-result.png) prove one save, complete visible/durable/export
identity, one-step Undo, manual insertion invalidating a pending old-index
request, and duplicate delivery producing one adoption/save. The complete
expected record includes the preserved implicit shell below the new empty Layer.
The harness reported no unexpected console errors.

All 118 focused tests across six files passed; normal source-commit hooks passed
lint, locator/coverage checks, typecheck and 68 staged tests. The deliberate
[omit-shell fault](sparse-fault.json) failed the regression; source was restored
before those checks. Coordinator final suites and native review remain pending.

The coordinator's fresh IAB check at the same source commit also passed. Actual
Add → Layer in main left the top overlay row empty, preserved the Group's
53.2258% start and 1.6129% width while its overlay index changed from zero to
one, and retained the main Group on main. One Undo restored the exact row
indices and DOM styles; console errors were empty. The coordinator opened both
[added](951-layer-fixed-added.jpg) and [Undo](951-layer-fixed-undo.jpg) JPEGs.
[Provenance](IAB-provenance.json) records the route and observed values. No TSX
changed, so these are ordinary consumer evidence rather than an invented UI gate.

## Historical blocker and decision

An accepted Show can contain a Group overlay ordinal without a corresponding
authored Layer. The importer retains that sparse form. Before insertion,
materialization supplies `scene-2:zone-1:group-layer:1`; after insertion, the same
Group child resolves into the newly minted Layer instead. Both complete
compositions validate, so validation does not detect the changed identity or
the loss of a fresh empty topmost Layer.

The [accepted sparse fixture](951-sparse-group.pxlshow),
[import result](951-sparse-import.json) and
[before/after materialized records](951-sparse-group.json) preserve the exact
reproduction. The materialized JSON is the identity oracle; the images establish
the actual manual operation. At source `982e10d2d194923414cdeee0358138be86a28c58`,
the coordinator imported that file through the in-app browser into
`/studio/shows/d2613f73-3814-41aa-ae83-e6416ae772a4` on the shared issue runtime
at port 5178. Add → Layer in main accepted; both Group buttons remained visible,
and one Undo restored the prior Show. Console errors were empty. The coordinator
opened and inspected both [before](951-sparse-before.jpg) and
[after](951-sparse-after.jpg) JPEGs.

Jon approved preserving implicit Group Layers before creating a fresh empty
topmost Layer on 2026-09-09. The repair above implements that extension through
shared Group semantics; these files retain the pre-repair evidence. A bounded
refusal was considered but was not chosen.

## Initial slice evidence

The existing manual Layer helper owns canonical and diagnostic creation.
Complete-output tests first exposed unrelated Marker-order normalization drift
and acceptance of duplicate Scene mappings; the repaired owner preserves order
and refuses invalid mappings before mutation.

Focused engine/canonical/adapter, actual MCP, coverage and grammar breadth/structure
checks passed (120 tests across seven files). TypeScript project checking passed.
The rich fixture has two Scenes, two Zones, unequal overlay counts, placement
tracks, a boundary Transition and a mixed main/overlay Group. Materialization
before and after creation proves the Group still resolves to the same old Layer.
The canonical and diagnostic results pair with the manual helper using fixed IDs.
The existing diagnostic add_clip succeeds at the newly created overlay index zero.

The real scripted `L951` editor sequence passed in 5.6 seconds. One creation
produced one PATCH; the downloaded Show reopened through `parseShowFileBundle`
to the complete visible and durable record. Undo restored the whole prior Show.
A pending old-index Clip request was refused with `revision-conflict` after
manual Add-menu Layer insertion. Delivering the same new Layer candidate twice
produced one adoption/save. [Records](L951.json), [export](L951-export.json) and
[capture](L951-result.png) retain the synthetic consumer evidence. The first run
had a test-only receipt assertion typo (`code` instead of `reason`); the corrected
run passed. The authenticated harness reported no unexpected console errors.

Three bounded injected faults (append instead of prepend, lose prior membership,
accept colliding identities) failed the focused behavioral tests. Source was
restored and rechecked; [fault records](faults.json) retain the outcomes.
[Fixture](fixture.pxlshow) supplies the same rich authored record for coordinator
manual IAB proof. Final committed-tip suites, native review, landing and IAB
inspection belong to the coordinator and remain pending at source freeze.

The command contract and Technical Reference ownership pointer were updated.
Both canonical and diagnostic coverage inventories were regenerated without a
content change: this exposes a new command over an already-covered subtree.
CONTEXT and Feature Guide need no change because terminology and manual UI remain
unchanged. No TSX file changed; manual Add already called the shared helper.
