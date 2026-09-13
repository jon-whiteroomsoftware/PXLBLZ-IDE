# Issue #1021 bulk Clip and Layer authoring proof

This packet records consumer proof captured from code commit
`1b4af601a0f6b7c736908033ceae44bbe3ee9d4f` on the managed isolated issue
runtime at `http://localhost:5212/PXLBLZ-IDE/`. The runtime identity endpoint
reported that exact commit and worktree. The browser used the synthetic local
account `github:local-agent-15`; no session, OAuth, binding, or client secrets
are retained here.

## Production MCP and in-app browser

The external client registered and authorized through the runtime's production
OAuth and `/mcp` routes, then initialized MCP protocol `2025-11-25`. Discovery
returned PXLBLZ Agent `0.2.0`, 62 tools, all three bulk commands, the recursive
Clip property schema, and both versioned schema/reference resources.

One real operation created two Layers containing two configured Clips, swapped
the two occupied Clip times atomically, changed placement properties, and set
the shared `bands` Pattern instance to `.72x` through two linked Clips. The
editor displayed one activity item for the operation with these two aggregate
command lines:

- `Created 2 Layers with 2 Clips.`
- `Updated 4 properties across 4 Clips; 8 linked Clips also affected.`

The authoritative outcome advanced from `saving` to `saved`. The in-app browser
capture [IAB-success.jpg](./IAB-success.jpg) shows the connected production MCP
client, both aggregate lines, the generated LineDancer2D Clip at 80% opacity,
and the generated WavyBands Clip at 55% brightness. Reloading the route from
durable storage preserved those values, the swapped placement, and the shared
`.72x` state.

A second `update_clips` operation changed both generated Clip opacities to 76%
and 61%. One editor Undo restored the exact preceding Show, and one Redo
restored the exact operation result. Canonical hashes omit only `updatedAt`,
which the save owner restamps:

| State | Canonical Show SHA-256 |
| --- | --- |
| Before the Undo/Redo operation | `a5db9b960e8bafc97e1571d853dffc64797b7b79f0038447ec6ce24c3cd4f6d8` |
| Operation result | `15d978a533aba155738e480d2839f92a6015bae0448cbe1a73aae635ab739135` |
| After one Undo | `a5db9b960e8bafc97e1571d853dffc64797b7b79f0038447ec6ce24c3cd4f6d8` |
| After one Redo | `15d978a533aba155738e480d2839f92a6015bae0448cbe1a73aae635ab739135` |

The Show actions menu exported `quadrille-copy.pxlshow` through the real editor
export path. The real Show importer reopened all 2,620 bytes and returned the
exact visible Show. The generated export remains ignored; its byte SHA-256 and
reopened Show hash are in `consumer-facts.json`.

## Atomic refusal, stale admission, and rollback

A shape-valid `update_clips` request combined an unknown Clip, an unavailable
Layer index, and an unknown Pattern control. It returned one refusal containing
all three typed issues. The complete Show SHA-256 was
`d756f2e2e99eaa5aa1ce60370887829255aff8b94b65a70d09a061ffaf314224`
before and after the refusal.

The stale proof began another valid two-Clip `update_clips` candidate through
production MCP. Before commit, the in-app browser added `Marker 1` at the
playhead, creating a real manual editor revision. Commit returned
`refused/revision-conflict`: the marker remained, the existing 76%/61% values
remained, and the candidate's proposed 33%/44% values never appeared. A
canonical diff contained only the new marker.

The save-failure case used the repository Playwright browser against the same
authenticated runtime because the in-app browser API does not expose network
route interception. It prepared a fresh two-Clip `update_clips` candidate
through `window.__pxlblzEditor` and the production command registry, then
aborted exactly one Show `PATCH`. Admission first reported `applied/saving` and
settled as `applied/rolled-back`; visible state, durable state, and reopened
state all matched the preimage, and no Undo entry remained. The capture
[playwright-save-rollback.png](./playwright-save-rollback.png) shows the real
editor's rollback notice and restored 76%/61% Clips. This is controlled failure
evidence; the production external MCP and in-app browser evidence above remain
the primary interaction proof.

Both captures also show `Output blocked: Peak: 6 Patterns per pixel (limit 4)`.
The two added overlapping Layers deliberately exceed this Show's configured
Controller compilation capacity. The issue proves authoring, validation,
history, export, and persistence. It does not claim this modified proof fixture
is ready to compile or send to a Controller.

## Focused qualification

The rebased candidate passed TypeScript and 318 focused tests covering bulk
authoring, schemas, command/timeline behavior, production OAuth/routing,
built-in and diagnostic adapters, private execution/admission, and the #1009
agent lifecycle paths. The targeted Show-authoring mutation run killed 140 of
140 mutations with zero survivors. The final exact-tip suites and candidate
review are owned by the coordinating agent.
