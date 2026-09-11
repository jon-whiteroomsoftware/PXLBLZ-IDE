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
comma-separated `AGENT_ACCOUNT_ALLOWLIST`, and an owned personal Show or exact stock catalogue Show ID. The
allowlist uses canonical session account IDs, including the existing linked-login
resolution. Missing service configuration disables access. Stock registration uses
a transport-neutral exact-ID manifest tested against the real catalogue; arbitrary
`stock-show-*` prefixes are not admitted. Stock drafts never create D1 records.

The browser schema is closed: `register` takes `sessionId` and `showId`; other
commands also require `registrationId`. `answer` and `decline` additionally carry
`callId`; `disconnect`, `forget` and `retirement-ack` carry `bindingId`.
`poll`, `heartbeat`, `arm`, `disarm`, `receive`, `reply` and `leave` complete
the channel. Replies additionally carry operation/delivery IDs and their result. Unknown fields and agent/account/role claims are refused.
Control bodies are bounded to2 KiB; replies permit1 MiB of result plus2 KiB
of envelope. Identity strings are bounded to128 characters. Capabilities
remain in the live tab; callers must not persist them as a second workspace.

The internal `accountConnection` seam accepts credential-validated account and
agent identity. Both transports validate credentials, resource,
grant and scope before entering it. An external client cannot reach this seam
with a cookie or tool payload. The private Durable Object binding is the only
route to its `claim` and `inspect` commands; it is not a public HTTP endpoint.
Private bound responses include the exact registration/session/Show target for
routing. Transports must not relay these internal capabilities to MCP clients.
The [OAuth/MCP boundary](agent-oauth-discovery.md) validates external credentials
before using this same owner; the built-in service resolves its initiating window.

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
`no_live_editor`. The account owner holds external connection requests outside its storage
transaction for the full30-second call window. At most eight connection waits
are outstanding. A25-second relay wait never shortens that setup deadline.

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
Another window cannot disconnect the owner. Local Forget synchronously retires
browser work, then atomically ends its exact owning external binding and resolves
the trusted grant identity inside the account owner. Grant revocation follows
that committed end. `forgotten` confirms both; `disconnected_not_forgotten`
confirms editing ended but not credential removal. The UI explains that the agent
must reconnect before trying Forget again. No grant identity reaches the browser.
A failed or unknown owner request remains `retirement_unconfirmed`; an absent or
wrong binding is never inferred to have ended. Revocation callbacks racing an
already-confirmed end cannot turn it into an unconfirmed result. The browser
retains a retired binding identity only for subsequent local end controls after
unknown transport, never to restore its executor or replay work. `disarm`
clears only the armed slot belonging to its exact window.

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
queries. The volatile relay delivers canonical commands to the production browser session,
which delegates to those owners. Grant revocation marks a bound generation
retiring and wakes receive immediately. Browser retirement acknowledgement ends
that slot; OAuth credential revocation alone is not an editing-cancellation ACK.

The relay queues at most seven mutation jobs, reserving one additional slot for
read/outcome queries. Responses wait at most25 seconds and return pending rather
than cancel or replay. Browser requests have a35-second transport bound and
independent15-second liveness heartbeats. Operation identities are retained until
the binding retires: at most256 operations and256 deliveries per operation,
with a4 MiB aggregate encoded identity budget. Capacity refuses new identities;
it never evicts a tombstone into an executable state. Changed identity reuse is
refused. Server/browser cached results are each bounded to4 MiB aggregate and
1 MiB per result, with60-second cache eligibility. Cached-byte expiry leaves
tombstones and admission receipts intact. Admission capture reserves a16 MiB
aggregate encoded snapshot/source budget before retaining each new request.
No document, command, result or outcome is written to Durable Object storage.

Disconnect/close retire local private work synchronously before network cleanup.
A failed transport preserves the logical binding and known browser receipt;
receive resumes without re-registering or replaying delivered work. A query uses
the surviving receipt or returns unknown. A terminal browser receipt releases
lost-reply transport jobs while retaining unavailable-result tombstones. After commit consumes the private
copy, cancel still targets its retained admission request: waiting work cancels,
and an adopted save remains owned by the store.

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
  origin, exact schema, opt-in and personal/exact-stock Show ownership.
- [Runtime tests](../../../src/worker/agent/agentChannel.runtime.test.ts) bundle the
  actual Worker and run it with real local workerd, D1 and Durable Objects. They
  assert response-level authorization, simultaneous claims and Answers, account
  throttling, and cleanup after opt-out/deletion, service disable and allowlist removal. They make no inference calls.

Focused relay/OAuth workerd tests cover live tool routing, grant retirement and
local Forget. Browser admission tests cover stock drafts, waiting cancellation,
retirement ordering and adopted save preservation. Final integrated browser proof
remains recorded in #963/#957; supported external-client qualification is #964.

The private `resolveBuiltinConnection` seam resolves a surviving server-created
builtin claim only from the exact authenticated registration/session/Show
capability owning that slot. It refuses external slots and other windows or
accounts. Browser JSON cannot invoke this resolver or select a trusted actor.

The sole ordering exception is terminal `cancel_edit` behind exactly one already-
sent pending command. It retains the original operation, next sequence and
immutable delivery identity. The browser still validates ordinary sequence: if
the prior delivery never arrived, cancellation returns a gap refusal/unknown,
not success, and no earlier work is replayed to fill it. A confirmed cancellation
retires the old transport reply; a late reply cannot reopen work. No other
command can bypass a pending acknowledgement.

## Browser response ordering

After registration, the single receive loop owns connection snapshots. Arm,
Disarm and Answer responses report action results only: independent HTTP
responses can arrive out of order, so an older control snapshot must never
retire a binding already observed by receive. Each receive carries the last
server connection view observed by this browser. The account owner returns its
current view immediately when it differs, including transitions with no held
receive. A local wake epoch closes the snapshot-read to waiter-registration
gap; unchanged views remain held until a transition, delivery, or timeout. The
bounded comparison string is an observation hint, never authorization. Older
callers omitting the hint retain the existing held-receive behavior.
Local Disconnect and editor close still retire the executor synchronously and
invalidate already-held deliveries before network cleanup. A failed control
request does not replace a healthy receive stream with an inferred connection
state.

`browserSessionOrdering.runtime.test.ts` delays actual workerd control responses
until a newer bound receive has admitted a private operation. Arm and Disarm
retain that binding without cancellation; Answer preserves the same executor.
Same-binding outcome lookup and commit remain usable, with one capture and one
application. These transport tests make no provider calls.

The actual-workerd positive cases in `browserSessionOrdering.runtime.test.ts`
withhold receives before server dispatch, perform arm/disarm/Answer, then assert
the browser promptly observes armed/idle/bound respectively. The same file
retains delayed-control preservation cases. Neither control completion nor
connection observation replays an operation or changes retirement ownership.
