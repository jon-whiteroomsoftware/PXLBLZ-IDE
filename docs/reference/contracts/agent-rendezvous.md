# Agent account rendezvous

The Worker coordinates one agent connection per canonical signed-in account.
A browser registration identifies one live editor session and Show; a separate
server-issued registration capability authorizes that window's channel actions.
Built-in and external agents share the account slot. The browser retains
ownership of edit admission, operation receipts, history and saves.

## Authentication and target ownership

`POST /api/agent/channel?agent=1` accepts the existing signed session cookie,
same-origin JSON, and exactly one enabling query parameter. Registration, arming,
Answer and status require `AGENT_SERVICE_ENABLED=1`, membership in the
comma-separated `AGENT_ACCOUNT_ALLOWLIST`, and an owned personal Show. The
allowlist uses canonical session account IDs, including the existing linked-login
resolution. Missing service configuration disables access. Stock drafts currently
receive `show_unavailable`.

The browser schema is closed: `register` takes `sessionId` and `showId`; other
commands also require `registrationId`. `answer` and `decline` additionally carry
`callId`; `disconnect` carries `bindingId`. `poll`, `heartbeat`, `arm` and `leave`
complete the channel. Unknown fields and agent/account/role claims are refused.
Bodies are bounded to 2 KiB and identity strings to 128 characters. Capabilities
remain in the live tab; callers must not persist them as a second workspace.

The internal `accountConnection` seam accepts credential-validated account and
agent identity. Both future transports must validate credentials, resource,
grant and scope before entering it. An external client cannot reach this seam
with a cookie or tool payload. The private Durable Object binding is the only
route to its `claim` and `inspect` commands; it is not a public HTTP endpoint.
Private bound responses include the exact registration/session/Show target for
routing. Transports must not relay these internal capabilities to MCP clients.
There is no OAuth authorization server or `/mcp` execution endpoint in this
foundation.

## Slot and lifetime

Connect arms a registered window for 120 seconds. An external claim binds to
that window atomically. Without an armed window, one incoming call occupies the
slot for 30 seconds; every eligible registered window can observe it through
polling. The first matching Answer binds atomically. Decline or expiry releases
the pending call. A new external call after arming has expired follows the same
30-second knock path as any call with no armed window, regardless of whether
an alarm or that request swept the expired arm. Expired pending-call inspection
and Answer remain `no_live_editor`; neither recreates that call. Competing callers
receive `occupied`. A built-in claim supplies
its validated initiating window and claims that target in one transaction,
without an arm/claim race.

A trusted caller uses `inspect` with its original identity, call and binding IDs
to resolve the pending call or surviving binding. Inspection never claims,
retries or replays an operation. An expired, declined or mismatched call returns
`no_live_editor`. The later transport owns holding its HTTP request while a call
is pending and presenting Connect guidance.

Heartbeat renews registration liveness. After 45 seconds without heartbeat,
contact is lost while the logical binding remains. At 300 seconds the
registration expires and releases its slot. Active sessions have no absolute
execution timeout. Heartbeats should run every 15 seconds; background timer
suspension can cause explicit stale retirement. These are engineering defaults,
separate from the accepted 120/30-second setup timers.

Every window action checks registration, session and Show identity. Disconnect
also checks the binding generation, so an old Disconnect cannot end a later
connection in the same window. Alarms sweep current deadlines transactionally;
a late alarm cannot expire a renewed registration using an older deadline.
Registration is not automatically replaced on duplicate session IDs or capacity
pressure. A failed registration acknowledgement does not authorize retrieving
another window's capability; the client must report unresolved setup rather than
claim success.

`leave` retires the registration and its binding. `disconnect` ends only its
matching local binding and keeps the registration. Both retain authenticated
account, origin and capability checks but permit cleanup after URL opt-out,
allowlist removal, service disable, Show deletion or request throttling. Cleanup
responses disclose no connection metadata. Sign-out must request leave before
losing its cookie; an unreachable tab is eventually retired by stale expiry.
Another window cannot disconnect the owner. Forget is unavailable until grant
revocation exists.

## Storage and failure ownership

One SQLite-backed Durable Object per account stores at most eight registrations,
one slot and an atomic request counter. The coordinator limits non-cleanup
commands to 240 per minute per account. It does not evict live registrations or
bindings to admit competitors. Its alarm deletes inactive coordination state
after the registration/slot deadlines and throttle window have elapsed.

Only identity, deadline and counter metadata are durable. Show documents,
candidates, conversation bodies and operation receipts never enter this store.
The [candidate application](agent-candidate-application.md) and
[history/persistence](show-state-history-persistence.md) owners continue to retire
unapplied work, preserve adopted save settlement and answer session-only outcome
queries. This foundation does not deliver editor commands or itself prove those
cross-layer obligations.

Cloudflare documents transactional, strongly consistent per-object storage and
recommends SQLite-backed namespaces. The implementation uses its key-value
transaction and alarm APIs; the Wrangler class migration provisions that
namespace on eventual deployment. No D1 schema migration is introduced.
[Cloudflare storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
and [Durable Object state](https://developers.cloudflare.com/durable-objects/api/state/)
were checked on 2026-09-10. Hosted provisioning and deployment remain unqualified.

## Owners and evidence

- [Rendezvous transitions](../../../src/engine/agentRendezvous.ts) and
  [tests](../../../src/engine/agentRendezvous.test.ts) qualify setup deadline
  boundaries, stale generations, contact preservation and bounded registrations.
- [Alarm lifecycle tests](../../../src/worker/agent/AgentAccount.test.ts) check
  renewed liveness and stale generations through the owner's response seam.
- [Account owner](../../../src/worker/agent/AgentAccount.ts) serializes persistent
  state; [internal transport seam](../../../src/worker/agent/accountConnection.ts)
  shares eligibility between built-in and external callers.
- [Browser route](../../../src/worker/routes/agent/channel.ts) validates cookie,
  origin, exact schema, opt-in and personal-Show ownership.
- [Runtime tests](../../../src/worker/agent/agentChannel.runtime.test.ts) bundle the
  actual Worker and run it with real local workerd, D1 and Durable Objects. They
  assert response-level authorization, simultaneous claims and Answers, account
  throttling, and cleanup after opt-out/deletion, service disable and allowlist removal. They make no inference calls.

OAuth/grant revocation, stock-draft qualification, client polling integration,
live tool routing and admission/save proof remain under #963 and #957. The runtime
suite qualifies this server foundation; it is not supported-client MCP proof.

The private `resolveBuiltinConnection` seam resolves a surviving server-created
builtin claim only from the exact authenticated registration/session/Show
capability owning that slot. It refuses external slots and other windows or
accounts. Browser JSON cannot invoke this resolver or select a trusted actor.
