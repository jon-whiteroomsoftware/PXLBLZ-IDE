# Detail gesture activity (#949)

Placement-pad gestures and native Effect reorder now bind their existing local
state to the shared field activity scope. The optional Property Beat movement
callback has the same registration, but no current ShowEditor caller supplies
that callback. Production change: 117 added and 30 removed lines across the three
components (net 87); the 43-line shared scope is unchanged.

Placement still previews while moving and commits once on pointerup or
pointercancel. Lost capture, removal and read-only transition discard preview
without authoring. Effect reorder preserves its transformation and foreign/legacy
payload fallback; a transient source-stack ID prevents retired local payloads from
reviving a finished drag. Returned save promises retain ownership through success
or failure. Per-move Property Beat authoring is unchanged.

## Consumer evidence

The DA sequence in `e2e/agent-baseline.auth.spec.ts` passed all four cases using the
real scripted bridge, without paid model calls or synthetic activity tokens:

| Sequence | While active | Terminal result |
| --- | --- | --- |
| Placement preview, lost capture | Waiting; complete visible/durable Show and history unchanged; no writes | Candidate adopts exact eight-second Clip |
| Placement preview, pointerup | Same preservation | Manual transform survives; old broad candidate refuses |
| Native Effect drag, dragend | Same preservation | Candidate adopts exact eight-second Clip |
| Native Effect drag, drop at 800px | Same preservation | Manual order survives; old broad candidate refuses |

Every result matched the complete durable Show, made one PATCH, and reopened
identically from the actual downloaded `.pxlshow` through `parseShowFileBundle`.
One Undo restored the original complete Show and exhausted history. The recorded
write arrays also include that later Undo write. The browser boundary asserted
zero page and serious console errors. Desktop captures use 1440x900; narrow uses
800x900. This qualifies the diagnostic editor route, not a production Agent panel
or hosted endpoint. The committed UI proof record carries the exact capture pin.

The in-app browser bootstrap listed only Chrome; two direct `iab` probes returned
unavailable after consulting connection troubleshooting. The disclosed fallback
used the repository's isolated Playwright runtime and synthetic account. Initial
fixture attempts lacked a 2D Stage, left the detail panel closed after overlay
submission, and attempted export behind the narrow detail panel. Each navigation
issue was diagnosed from its trace and repaired; these are not product fixes.
The first complete run passed in 18.3 seconds (22.2 seconds overall).

## Focused and fault evidence

The final focused run passed 95 tests across the three component suites and the
28-case activity suite. TypeScript and lint passed. The activity cases cover
foreign pointers, pointerup/cancel/lost capture, removed or disabled targets,
unmount, overlap and session rebinding, no-op/rejected/throwing callbacks,
asynchronous save success/failure, per-move callbacks, missing Effect sources,
retired local payloads and external fallback. Complete placement Show/history and
provider oracles distinguish manual adoption from cancellation.

Deliberately missing placement ownership and releasing it before manual adoption
both failed the focused oracle. Source was restored before browser capture. A
separate failing test caught aperture preview restart during save settlement; its
existing guard now checks the retained pointer lifetime. Detailed local logs and
the test-design packet are in `.wrsp/949-detail-gesture/`.

Physical-zone retained drafts remain unregistered. Property Beat movement has
component evidence only because its optional callback is not currently wired.
External native payload provenance is limited to observable stack lifetimes;
arbitrary payload authenticity is not claimed. Existing engine suites retain
transformation coverage. CONTEXT.md requires no vocabulary change. The coordinator
owns final committed-tip suites, native review and landing; publication is held.
