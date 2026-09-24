# #1039 activation evidence

The flip: version 2 is the production Show path. Specification
[`docs/plans/scene-retirement-specification.md`](../../../plans/scene-retirement-specification.md)
at commit `51a5c2acf2e1732610e1ee4c2e3d4e29f934511e`, sections 10 and 12; proof
rows ROUTE, DELETE-READD, REPLACE, LAYOUT-END, FAILURE, MCP, PARITY. Base
`58745a97`. The pre-activation readiness record it closes is
[`../issue-1039-cutover/inventory.md`](../issue-1039-cutover/inventory.md).

## What the flip is, exactly

`SHOW_V2_ROUTE_DEFAULT` is `true`, so `isShowV2RouteEnabled` answers yes
unconditionally and the consumers that must move together move: a fresh Show is
authored as a `ShowRecordV2`, the Show list reads stored version-2 documents
beside whatever is still version 1, `.pxlshow` import accepts a version-2
bundle, and an unbound MCP connection is described the v2 catalogue.

Which editor holds one Show is a second question, answered per record by
`opensOnShowV2Route`, because section 10 forbids migrating a row on read as
firmly as it forbids a mixed window:

| Routed Show | Editor | Commands | `read_show` |
| --- | --- | --- | --- |
| a stored version-2 document | `ShowEditorV2Route` | v2 | v2 |
| a row storage still holds as version 1 | the v1 `ShowEditor` | v1 | v1 |
| a built-in Show (no stored document) | the v1 `ShowEditor` | v1 | v1 |

Nothing in the application rewrites a stored row. `npm run show:v2-migrate` is
the only writer that converts one, with the preserved original and the per-row
readback [the runbook](../issue-1039-cutover/rehearsal.md) requires. So a user
whose rows the conversion has not reached sees exactly the editor they saw
before, with the Shows list marking the selected row `v1`, and the same URL
opens the v2 route once the conversion has run. Both states are driven on the
production URL in `e2e/show-editor-v2-route.auth.spec.ts`.

## What a converted Show loses until a later slice

The v2 editor has no counterpart for the v1 editor's output-contract summary and
Show properties, Stage map selection, Zone Map, Zone Layout definition routing
mode, or Show Trails. The v2 commands for most of them exist
(`set_output_contract`, `set_stage_map`, `update_zone`, `set_output_trails`), so
this is a missing editor surface rather than a missing capability, and an agent
can still author them. It is recorded in
[the editor contract](../../contracts/show-editor-v2.md#edit-doors)
and is the first thing a follow-up slice should close.

## Evidence

- [`test-design.json`](test-design.json): invariants, partitions, sequences,
  oracles, red evidence, fault-sensitivity checks and results.
- `.wrsp/ui-proof/1039-cutover.json` and its captures: the production URL with
  no query flag, at 1440 px and 390 px, showing a fresh version-2 Show, an
  unconverted row on the previous editor with its `v1` marker, the converted
  row on the v2 route, and the narrow layout.
- Parity: `show:v2-parity` 47 inventoried records matched; `show:v2-native-parity`
  40 compared Shows matched. Neither report's hashes changed.
- `check:artifact-oracle` passed: the exported `.pxlshow` and `.epe` reopened
  through their own importers.

## Residuals

Recorded in full in the worker handoff and in
[the inventory's remaining-work table](../issue-1039-cutover/inventory.md#what-remains).
The load-bearing ones: the remote row conversion and the deployed-tip MCP
transcript stay blocked by the recorded Cloudflare authorization failure; the
agent harness still speaks v1 vocabulary, which its own offline checks do not
notice because none of them drives the live editor; and built-in Shows stay on
the v1 catalogue because the Gallery, the stored keyframes and the resource
census still read `STOCK_SHOWS`, which section 2 also pins as the parity input.
