# Agent account rendezvous

The Worker coordinates one agent connection per canonical signed-in account.
A browser registration identifies one live editor session and Show; a separate
server-issued registration capability authorizes that window's channel actions.
Built-in and external agents share the account slot. The browser retains
ownership of edit admission, operation receipts, history and saves.

## Authentication and target ownership

`POST /api/agent/channel` accepts the existing signed session cookie and
same-origin JSON on ordinary editable Show URLs. Registration, arming, Answer
and status require `AGENT_SERVICE_ENABLED=1` and an owned personal Show or exact
stock catalogue Show ID. The built-in transport admits every authenticated
account and applies its separate per-account message and shared financial
allowances at provider dispatch. Missing service configuration disables access. Stock registration uses
a transport-neutral exact-ID manifest tested against the real catalogue; arbitrary
`stock-show-*` prefixes are not admitted. Stock drafts never create D1 records.

The browser schema is closed: `register` takes `sessionId` and `showId`; other
commands also require `registrationId`. `answer` and `decline` additionally carry
`callId`; `disconnect`, `forget` and `retirement-ack` carry `bindingId`.
`move-external` carries the externally visible `expectedBindingId` observed by
that window; it never carries agent, grant or source-window identity.
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
For one public MCP `tools/call`, the validated account and grant select one
private account-owner request. That request resolves or creates the connection,
atomically compares any supplied binding generation, consumes any move notice
for that public response, and performs the relay query or dispatch when one is
required. It derives the complete claim from owner state; the MCP payload never
supplies or receives that capability. A held `get_connection` keeps its single
public-call debit while internal wakeups and final inspection remain uncounted.

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

The drawer keeps an expiry, missed-call or occupied notice while a new arm
request is unresolved. Only an accepted `armed` control result clears that
notice; its connection view or the receive stream supplies the exact server
deadline. A refusal keeps or replaces it with the current actionable failure,
and an older arm result cannot erase the notice from a newer attempt or
cancellation.
An idle server snapshot arriving before the browser deadline tick still records
No agent connected or Missed connection from the prior armed or pending state.
Explicit Cancel or Not now clears that state before its control request, so the
same idle snapshot does not fabricate an expiry notice.

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
account, origin and capability checks but permit cleanup after capability or
service configuration changes, Show deletion, or request throttling. Cleanup
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

A different registered window may explicitly replace a live external binding.
The ordinary connection view identifies the external client, whether its Show
matches this window, a bounded registration-time Show-name snapshot when one is
available, and the opaque current binding generation. It exposes no call,
registration, session, grant or credential identity. A built-in, pending or
retiring slot keeps the existing non-movable projection. Personal Show names
come from the same-account D1 lookup; stock names come from a lightweight exact
ID/name manifest qualified against the stock catalogue. Names authorize
nothing, and an absent or invalid snapshot uses the generic other-Show wording.

The move route validates the destination session and Show, privately inspects
the exact observed source, confirms that source grant is still live, then asks
the account owner to compare-and-replace the exact agent/binding pair. The owner
serializes that final comparison. One competing request wins; stale discovery,
repeated requests and lost-response retries return `connection_changed` without
creating another generation. Success retains the agent identity but gives the
destination registration a fresh call ID, binding ID and volatile relay. Old
heartbeats, receive/reply traffic, leave, disconnect and operation envelopes
cannot dispatch into or retire the destination generation. The system makes no
new promise about settlement of work already in flight in the old envelope.

Grant retirement remains the race owner. Retirement committed before the final
replacement in the account owner prevents movement. If replacement reaches that
owner first, including while an authority notification is still in flight, the
later retirement marks the fresh binding retiring and follows the existing
browser ACK path. There is no cross-object transaction.
The old browser latches the local `Agent moved to another editor.` notice after
receive observes loss of its owned external generation. The destination's receive
snapshot alone creates its executor and owned connection; the move HTTP result
is only a control result. Repeated unchanged receive views preserve an unresolved
move intent, while a changed authoritative view supersedes it. Contact loss does
not strand that intent: its eventual HTTP result still settles the pending UI,
and a late result from an older intent cannot settle a newer one.

The drawer's setup Back action invalidates its arm generation, sequences disarm
after any already-sent arm, and returns to the chooser immediately. Armed
snapshots remain suppressed through the first later non-armed observation. A
new Ready attempt waits for that observation before arming, so delayed snapshots
from the cancelled generation cannot reopen setup or fabricate expiry. Change
agent ends the exact local binding, then returns to that chooser without revoking
external OAuth authorization. Both preserve the drawer transcript and built-in
draft. Change agent is disabled while an editor operation is active, saving, or
has an unknown outcome; the explicit Cancel, Disconnect, and Forget recovery
paths retain their existing ownership.

## Storage and failure ownership

One SQLite-backed Durable Object per account stores at most eight registrations,
one slot and two independent fixed-window counters. Each public agent call uses
one debit from the existing 240-per-minute agent window. The separately retained
240-per-minute control window applies to non-liveness browser setup and movement;
it is not a new quota. Exhaustion in either window returns `throttled` with a
nonnegative integer `retry_after_ms` until that fixed window resets. Neither
window evicts a live registration or binding. Browser liveness is exempt from
the agent window rather than protected by it. The complete accounting table is:

| Class | Account-owner commands | Accounting |
| --- | --- | --- |
| Agent calls | One combined request for every external `get_connection`, `list_commands`, read, mutation, commit, cancel or outcome call; trusted built-in claim/connect and relay query/dispatch | One agent-window debit per eligible public invocation, including a held call; never one per internal transition |
| Browser setup and movement | Register, Arm, Answer, Decline, movement inspection and compare-and-replace | One control-window debit per owner command, preserving the existing 240-per-minute bound |
| Browser liveness | Heartbeat and Poll; the Heartbeat/Poll phases inside Receive and Reply | Exempt from both windows |
| Cleanup | Disarm, Leave, Disconnect, retirement acknowledgement, local Forget/disconnect and grant retirement | Exempt so cleanup remains available during throttle |
| Private continuation | Trusted inspection and built-in resolution, held-call resolution, move-notice compatibility inspection, expiry and alarm work | Exempt; an internal continuation cannot stand in for a separately debited public call |

Legacy stored objects with the former shared counter seed both independent
windows with cloned values on first use, preserving the stricter in-flight
bound without coupling later debits. The alarm deletes inactive coordination
state after registration/slot deadlines and both counter windows have elapsed.

Only identity, deadline and counter metadata are durable. Show documents,
candidates, conversation bodies and operation receipts never enter this store.
The [candidate application](agent-candidate-application.md) and
[history/persistence](show-state-history-persistence.md) owners continue to retire
unapplied work, preserve adopted save settlement and answer session-only outcome
queries. The volatile relay delivers canonical commands to the production browser session,
which delegates to those owners. Grant revocation marks a bound generation
retiring and wakes receive immediately. Browser retirement acknowledgement ends
that slot; OAuth credential revocation alone is not an editing-cancellation ACK.
External replacement ends the old volatile relay and creates an empty relay for
the fresh destination binding. A bounded move notice lives only on that current
slot and disappears when the slot is replaced or retired.

The relay and its client-key map are volatile. If an account owner is recreated
while its durable slot still says bound, it cannot reconstruct which client calls
were admitted. The first connection resolution, dispatch, retry or query marks
that old generation retiring before any delivery. The browser observes retirement
and cancels unapplied private work through the existing owner; an adopted save
continues under store ownership. The client reconnects under a fresh binding and
reads the Show again before opening another operation. Payloads, keys, documents
and receipts are never persisted to bridge this loss.

The relay admits at most ten ordinary canonical jobs, including the sent head.
Each has one response waiter and at most65,536 bytes of canonical payload identity.
Eight separately bounded read/outcome jobs remain available when that queue is
full. Calls wait at most25 seconds and return `pending` without cancelling their
job. Only the head of an operation is sent. Delivery IDs are assigned at admission;
sequences are assigned only when a job becomes sendable, so removing an unsent job
cannot create a browser sequence gap.

Terminal cancel has separate admission capacity. It discards unsent ordinary
followers as `result_unavailable` and may follow the one sent head using the
browser's existing cancel-after-sent check. At most one terminal-cancel job exists
for an operation. Equivalent later cancels join that job without another waiter,
delivery ID or sequence: an unkeyed join returns `pending`, while a keyed join
shares the first cancel's retained exact result. Joined keys debit the aggregate
identity-byte budget and the operation's 256-entry key bound. The sent head then
cannot release later ordinary work; a confirmed cancel makes its late reply
unknown. Read and outcome queries never consume this terminal path or infer a
cancelled receipt.

Operation identities are retained until the binding retires: at most256 operations
and256 deliveries per operation, with a4 MiB aggregate encoded identity budget.
One operation reserves sequence0 for begin, sequences1 through253 for at most253
ordinary commands, sequence254 for commit and sequence255 for cancellation after
a pending commit. A refused delivered command consumes its sequence. Ordinary
capacity therefore directs the client to commit or cancel before lifecycle slots
are exhausted. Capacity refuses new identities; it never evicts a tombstone into
an executable state. Changed identity reuse is refused. Server/browser cached
results are each bounded to4 MiB aggregate and1 MiB per result, with60-second
cache eligibility. Cached-byte expiry leaves tombstones and admission receipts
intact. Admission capture reserves a16 MiB aggregate encoded snapshot/source
budget before retaining each new request. Browser requests retain their35-second
transport bound and independent15-second liveness heartbeats.

Disconnect/close retire local private work synchronously before network cleanup.
A pending browser registration keeps its own 35-second request deadline when
the editor closes. If its acknowledgement arrives after close, the client sends
Leave for that exact registration without installing a window, receive loop or
heartbeat. Other session requests still abort on close. A lost acknowledgement
or destroyed document cannot perform this cleanup; server expiry remains the
bounded fallback. A late acknowledgement from an old editor cannot retire a
new editor registration.
A failed transport preserves the logical binding and known browser receipt;
receive resumes without re-registering or replaying delivered work. A query uses
the surviving receipt or returns unknown. A terminal browser receipt releases
lost-reply transport jobs while retaining unavailable-result tombstones. After commit consumes the private
copy, cancel still targets its retained admission request: waiting work cancels,
and an adopted save remains owned by the store.
A defensive `throttled` Receive response leaves the browser executor and binding
intact, surfaces the ordinary Too many requests refusal, and continues receiving;
it never manufactures contact loss. Healthy Heartbeat, Receive, delivery, Reply
and cleanup continue after the agent window is exhausted.

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
  origin, exact schema and personal/exact-stock Show ownership.
- [Runtime tests](../../../src/worker/agent/agentChannel.runtime.test.ts) bundle the
  actual Worker and run it with real local workerd, D1 and Durable Objects. They
  assert response-level authorization, simultaneous claims and Answers, account
  independent agent/control throttling, browser liveness and delivery after agent
  exhaustion, external discovery/movement, and cleanup after capability
  loss/deletion, service disable and allowlist removal. They make no inference calls.

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
