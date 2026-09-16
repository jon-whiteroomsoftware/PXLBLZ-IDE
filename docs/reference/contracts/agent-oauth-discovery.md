# Agent OAuth and MCP

The #963 server authorizes external clients and routes the production canonical
Show command catalogue through the same browser admission used by the built-in
agent. [Agent rendezvous](agent-rendezvous.md) owns the sole account attachment.
No diagnostic grammar, paid inference, remote provisioning or deployed-client
qualification is implied by the local protocol proof.

## Public boundary

The Worker serves `/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/mcp`, and OAuth
metadata at `/.well-known/oauth-authorization-server` and
`/.well-known/oauth-protected-resource/mcp` (also the root resource metadata
alias). Assets cannot intercept these routes. Every response is non-cacheable.

Deployment configuration is closed by default:

- `AGENT_SERVICE_ENABLED=1` admits external OAuth and MCP for every signed-in
  account. Authorization, access, and refresh recheck it. The separate built-in
  service also admits every signed-in account, then enforces its per-account
  message allowance and shared financial allowance at provider dispatch. These
  limits do not revoke or consume external grants. Revocation remains available
  after service disable.
- `AGENT_OAUTH_ORIGIN` is an exact origin, HTTPS for a hosted service. Literal
  localhost, 127.0.0.1 and ::1 HTTP origins are allowed for local proof only.
  Public request origins must match this configured origin exactly.
- `AGENT_OAUTH_CLIENTS` remains a JSON array of zero to eight preregistered public
  clients: `{clientId, clientName, redirectUris}`. IDs are bounded alphanumeric,
  underscore or hyphen strings. Each client has one to four
  exact HTTPS or literal-loopback redirect URLs without credentials/fragments.
  These deployment-owned records remain authoritative beside dynamic and
  metadata-document clients.
- HTTPS URL client IDs with a non-root path use Client ID Metadata Documents
  (CIMD), the preferred self-service path. The Worker's
  `global_fetch_strictly_public` flag prevents legacy same-zone and private
  network fetches. The pinned provider bounds the complete response to 5 KiB
  and 10 seconds, validates the exact client ID, JSON/UTF-8 document, redirect
  URIs and public metadata, follows redirects only under the strict-public
  fetch policy, and caches only validated public responses for their advertised
  lifetime up to seven days.
- Dynamic Client Registration remains available for compatibility. Registrations
  expire after 90 days, at most 1,024 live records are retained, and every
  registration request counts against a global 10-per-minute authority bound.
  Expired rows are removed while listing and do not consume capacity. The
  provider validates redirect, grant, response, and authentication metadata.
  It supports `none`, `client_secret_basic`, and `client_secret_post` for DCR;
  CIMD negotiates only `none` in provider 0.10.3. Implicit flow, plaintext PKCE,
  token exchange, and external bearer validation remain disabled. Provider 0.10.3
  exposes create-only DCR: it does not issue a registration access token or
  support client metadata update/delete, so an expired client registers again.

Consent visibly names the verified signed-in account and requesting client. The
account label is server-overwritten display metadata, HTML-escaped, and never an
authorization identity. A signed-out request is fully parsed and client-validated
before the server creates an opaque five-minute continuation. The HttpOnly,
SameSite=Lax cookie carries only that random identifier through the normal
identity-provider callback; the callback returns only to the same-origin
authorization route. The stored request never appears in a return URL. The
continuation is consumed into an account-bound consent nonce once, and expired,
tampered, reused, cancelled, or failed sign-in state stops locally.

The client request must name its validated redirect, `code` response,
S256 challenge, nonempty state, exact `/mcp` resource, and `agent:connect` scope.
Consent creates a random, one-use, account-bound nonce with a five-minute TTL.
POST requires the same origin and signed account; the stored request determines
the redirect. The page's same-origin referrer policy preserves the browser's
Origin header; form CSP permits only self and the validated client's redirect
origin. Native-browser regression tests exercise both requirements. Cancel returns `access_denied` with the original state. Allow
issues an authorization code only after consuming that nonce atomically.
At most four outstanding consent nonces and eight live grant/code families are
admitted per account, counted in the same transaction. Capacity refuses new
authorization without revoking an existing grant; provider implicit replacement
is disabled. Cancel remains possible when grant capacity is full.

Token requests use form encoding with a stream-enforced 16 KiB body bound,
validated client identity and exact resource. Duplicate parameters are refused.
MCP uses bearer headers on every request; URI bearer credentials and hostile
Origin headers are refused. A DCR request with an Origin must match one of its
submitted redirect origins; an MCP Origin must match an origin on the validated
grant client. Native clients may omit Origin. CORS responses never use a wildcard.
Metadata advertises S256, CIMD support, DCR, supported token authentication
methods, and the resource authorization server derived from the exact configured
token endpoint.

The MCP SDK serves stateless JSON initialization and stable `tools/list` metadata:
`get_connection`, `list_commands`, `list_patterns`, `list_controller_profiles`,
`read_show`, `get_context`, `begin_edit`, all canonical `SHOW_COMMANDS`,
`commit_edit`, `get_outcome` and `cancel_edit`. Listing
metadata neither claims an account slot nor reads Show contents. There is no GET
event stream, DELETE session, durable MCP session or tools-list notification.
Initialization therefore does not advertise resource-list changes. Every listed
tool publishes an output schema from one of five shared groups: connection,
catalogue, read, mutation or outcome. The schemas close the public result-code
domain and the shapes of command changes, refusals, binding-move notices and
instructions while leaving Show, context and receipt objects opaque. This keeps
new canonical commands on the same result contract without copying schemas into
the command registry. Discovery marks exactly `list_commands`, `read_show`,
`get_context` and `get_outcome` with `readOnlyHint: true`. `get_connection`
claims the account slot, so it is not read-only; no mutation advertises the hint.

The two discovery tools require the current browser binding and remain read-only.
`list_patterns` projects every stock and signed-account personal Pattern as its
actual `stock` or `user` reference identity, display name and authored exported
control names/kinds. Sliders alone publish the command range `0–1`; picker and
toggle exports are metadata only, and saved control values or the Studio's `0.5`
fallback are never called Pattern defaults. The optional case-insensitive `query`
matches ids or names, while `kind` selects `stock` or `user`. Source and Library
text never leave the browser. The exact captured source/Library graph must inspect
successfully; unknown metadata returns `unavailable` instead of an incomplete
catalogue. `list_controller_profiles` projects existing profile ids, names and an
optional last-known `pixel_count`. It never turns an installed-map observation or
push fingerprint into a current map id, reads hardware, or changes mutation
validation. Both results use the relay's existing 1 MiB bound without truncation.

`get_connection` uses the validated grant/client identity to claim the account
slot. An armed editor binds immediately; otherwise the call waits the full
30-second Answer window outside authorization serialization. A supplied
`call_id` only inspects that original call and never recreates an expired call.
Every content or edit tool requires the current `binding_id`; mutations also
require the server-issued `operation_id`, except `begin_edit`. Begin requires a
nonblank, single-line `intent` of at most 240 characters and a nonempty
`idempotency_key` of at most 128 identity characters. It returns the relay-assigned
operation ID. Later mutations accept an optional key scoped to that binding and
operation. The public client never supplies a delivery ID or sequence. The relay
assigns both, and the browser independently checks the immutable envelope and
strictly increasing sequence before execution.
The relay admits `begin_edit` only after `read_show` has completed successfully
for that binding generation. `get_context` can refresh focus later but does not
substitute for the full post-connect snapshot.

The client key names one canonical payload, including tool kind, command name and
arguments. Reusing it with the same payload returns the pending or retained result
without another browser delivery; changing the payload returns
`identity_conflict`. A repeated begin key retains its original operation even
after completion. Cached result bytes may expire after 60 seconds, leaving a
non-executable identity tombstone and an `unknown` result with the original
operation ID. An unkeyed later mutation is safe only as one attempt: after a
timeout, the client queries `get_outcome` and does not repeat it. Independent
commands may be sent together, but dependent commands and commit must await their
predecessors because relay admission order determines execution order.

Initialization describes the complete client protocol: connect, read the Show,
begin with a human-visible intent and stable key, send commands, commit, then
query the outcome until it settles. `read_show` supplies the canonical IDs used
by commands; `get_context` refreshes focus but never substitutes for the required
full read. A canonical command's domain `refused` result changes nothing and
keeps the same private operation open for a corrected command, commit or cancel.
The current successful no-change result is `noop`. Explicit whole-turn refusal,
commit or admission refusal, service or result-size failure, cancellation and
retirement remain terminal.

The relay admits at most ten ordinary calls at once, including the in-flight
head. A 256-delivery operation uses one delivery for begin, admits at most 253
ordinary commands, and reserves the remaining deliveries for commit and a
post-commit cancel. Longer choreographies split across committed operations and
read the Show again before each chunk. A keyed retry with the identical payload
only looks up its original admission: `pending` means that call can still finish,
while `unknown` means its result bytes are gone and never authorizes replay.
After an unkeyed timeout the client queries `get_outcome` and never repeats the
mutation. The scoped retry ledger is volatile; after binding or ledger loss the
client reconnects, reads the Show, and begins a fresh operation rather than
replaying an old call.

The relay retains and caches a keyed domain refusal like every other admitted
result, then continues with already-admitted successors in sequence. Every other
command failure terminates the relay operation and settles unsent followers as
unavailable. This matches the browser executor's refusal boundary without
turning an interim command issue into an operation outcome.

An explicit browser move keeps the validated grant while replacing its call and
binding IDs. The next actual MCP tool handler resolves the current binding once,
atomically consumes the current-slot move marker, and adds `connection_notice`
with `binding_moved`, destination Show ID/name when available, and an instruction
to call `get_connection` then refresh with `read_show`. This
best-effort notice can be consumed by `get_connection`, `list_commands`, a read,
or a mutation. Initialization, `tools/list`, and resources list/read neither
resolve the slot nor consume it. No server push or client wake is added.

Every tool carrying an old binding refuses before query or dispatch with a
top-level `binding_moved`, current destination, and the same refresh instruction.
That remains informative after the one-shot notice was consumed. A stale call-ID
inspection behaves the same while the grant has a newer binding; without a
current binding the established `no_live_editor` result remains. Concurrent or
lost notice responses are not acknowledged or replayed.

Every public `tools/call`, including `list_commands`, performs exactly one
account-owner fetch and consumes exactly one agent-window debit. Binding
resolution, the one-shot notice and relay work share that request; internal
inspection while a held connection waits cannot debit again. Owner refusal is
authoritative: `throttled` includes the nonnegative integer `retry_after_ms` for
the fixed-window remainder; `unauthorized` identifies invalid or expired
credentials; `unavailable` identifies an absent required service; and `unknown`
identifies an indeterminate owner transport. None becomes `no_live_editor`.
The established `no_live_editor` result remains for a missing, expired,
retiring or mismatched connection, while `binding_moved` remains the current
generation mismatch. The server adds no client-visible retry loop.

MCP request bodies are bounded to66 KiB before SDK parsing, allowing a64 KiB
normalized command plus its JSON-RPC envelope. OAuth forms remain16 KiB. No
input or captured reference context is truncated to fit. Relay/read results are
at most1 MiB; MCP encodes that result as both text and structured content, so its
wire response may contain two copies plus protocol framing.

The current in-process schema census covers 62 tools and 57 mutation tools.
The observed serialized `tools/list` response at integrated base
`b2f8426e7e391d440d00e124590d9f1772d1db6d` is271,687 bytes; the same catalogue
after server-owned identity is269,177 bytes, a reduction of2,510 bytes. These totals
include the shared output schemas introduced before this change; the earlier
132,075-byte catalogue measurement therefore is not this comparison baseline.
After moving the repeated mutation transport guidance into the server
instructions and adding the four read-only hints, the same 62-tool/57-mutation
catalogue is256,507 bytes, a further measured reduction of12,670 bytes.

The text copy is the exact JSON encoding of `structuredContent`. Successful
result codes are `bound`, `pending`, `commands`, `read`, `begun`, `changed`,
`noop`, `unchanged` and `outcome`; every other closed public result code sets MCP
`isError: true`. In particular, retrieving an `outcome` remains a successful
tool call even when its opaque receipt records a refused edit. The server's
independent schema tests validate both successful and error structured results,
because the pinned MCP SDK deliberately skips its own output validation when
`isError` is true.

The relay and MCP server carry an optional browser-owned validation diagnostic
inside an `invalid-candidate` receipt without parsing or rebuilding it.
`commit_edit` and later `get_outcome` therefore expose the same bounded terminal
detail in both JSON text and structured content. The diagnostic's 4 KiB limit
fits inside the existing 1 MiB relay result ceiling and creates no Worker
persistence or independent lifetime.

## Authority and persistence

`AgentOAuthAuthority` is a private SQLite Durable Object, named by configured
origin. It owns sign-in continuations, consent nonces, DCR clients, and OAuth
grants/tokens. It does not own
Shows, editor sessions, candidates, transcripts, adopted state, operation
receipts, or the account slot. There is no added D1 or KV deployment binding.

`@cloudflare/workers-oauth-provider` is pinned to **0.10.3**. The integration's
`oauthStorageKV` adapter implements only the library's exercised subset:
string and JSON `get`, string `put` with relative or absolute expiration,
`delete`, and prefix `list` with limit/cursor. Unsupported options fail. Values
are bounded to 64 KiB and keys to 512 characters. Reads enforce TTL immediately;
listing excludes expired values. Cursors use the last scanned key, so deleting
one revocation page cannot skip the following page.

Every bounded authorization mutation, including awaited cryptography, DCR, code
consumption, refresh rotation and revocation, runs inside one Durable Object
storage transaction. The adapter alone supplies no serialization. No held MCP
request, network client discovery, or rendezvous wait enters that transaction.
Each request that names a CIMD client resolves and validates it through a
separate provider before the transaction, then injects only that closed,
request-local `ClientInfo` into a provider instance with CIMD network lookup
disabled. Static clients resolve first and DCR clients resolve from expiring
authority storage; neither can be replaced by that injected value.
Provider background work fails explicitly rather than escaping its owner.
The public Worker executes MCP routing only after token validation returns. A
held attachment revalidates its grant after waiting.

Canonical account IDs contain colons, while the provider's token format uses
colon-delimited fields. `providerSubject` encodes the canonical account as
base64url; encrypted grant props retain the verified canonical account ID.
Validation checks that mapping and returns `ValidatedAgentGrant` privately:
`accountId`, `clientId`, validated client name and redirect origins, `grantId`,
and `expiresAt`. The browser and MCP response
never receive an account rendezvous capability.

Engineering defaults are five-minute access tokens, 24-hour refresh families,
provider ten-minute authorization codes, five-minute sign-in continuations and
five-minute consent nonces. The
authority admits at most 120 non-revocation requests per minute; revocation is
exempt so cleanup remains possible. An alarm scans up to 1,000 expiring records
per minute, preserving its cursor and deadline under traffic, and stops when
storage is empty. Static clients live in configuration; DCR clients use the
90-day/1,024-live/10-per-minute bounds above; CIMD records are not copied into
authority storage. Per-account nonce/grant caps and the issuance rate also bound
outstanding state. These defaults bound
issuance and retention; they are independent of Jon's 120-second arming and
30-second incoming-call decisions.

Local Forget revokes through the private account-bound grant seam without a
fresh CIMD fetch, so a changed or unavailable metadata document cannot strand
the browser binding or authorization. Public access, refresh, and live-grant
inspection still resolve current client metadata; a changed callback therefore
invalidates use of an existing CIMD grant.

The provider intentionally accepts the **current or immediately previous**
refresh token to recover a lost rotation response. Each successful refresh
rotates again; older generations are refused. This is not strict single-use
refresh. Reusing an already consumed valid authorization code revokes that
grant, while a different grant remains valid. Revocation rejects the family's
access and refresh credentials. Actual provider grant deletion records the
verified stored subject/grant and notifies its account owner after the auth
transaction commits. A pending call ends; a bound editor enters retiring state,
wakes its receive and refuses further dispatch/replies. The browser cancels
unapplied work synchronously, then acknowledges retirement. Only that ACK confirms
editing ended. OAuth revocation HTTP200 confirms credential revocation only;
notification failure or an unreachable editor remains unconfirmed. Work adopted
before acknowledgement retains its truthful save receipt. Local Forget first
retires browser work, then atomically ends the exact attached external binding
before attempting its grant removal. Failed grant removal reports editing ended
but Forget unconfirmed; it cannot leave that slot occupied. Another window
cannot invoke it for the owner. The account owner returns the grant only over
the private server seam, and the public result never exposes it.

## Qualification and next seam

Focused tests exercise the actual pinned provider, adapter, and workerd with
SQLite. They prove concurrent same-code redemption, independent-grant survival,
current/previous/older refresh generations, concurrent refresh recovery,
revocation, and persisted validation/rotation across runtime disposal/restart.
Production Worker tests prove signed/account-bound consent, safe sign-in
continuation and replay refusal, Cancel, forged
identity/redirect/resource/S256 refusals, failed exchanges without code
consumption, static and all supported DCR authentication modes, metadata,
initialization, the full canonical catalogue, and service/allowlist changes
followed by successful revocation, concurrent nonce capacity and grant capacity
without earlier-family revocation. A real Chromium form test uses a local
workerd listener and a cross-origin client callback. Adapter tests prove TTL and deletion-safe
pagination rather than assuming KV emulation is upstream-qualified.

Browser qualification uses the managed isolated runtime and synthetic identity.
The serve-only Cloudflare plugin accepts five nonsecret process binding
overrides: service enable, allowlist, OAuth origin, static clients, and a
literal-loopback-only isolated-runtime origin. These never enter Vite client
definitions and do not modify/copy canonical `.dev.vars` secrets.
The local proof is HTTP loopback. Hosted TLS and two independent real-client
interoperability runs remain #1009 qualification: one must use CIMD and one must
use DCR, then connect, edit, save, reopen, and exercise occupied/cancelled
recovery without replay or inferred outcomes.

Workerd routing proof covers authenticated attachment, receive/reply, a64 KB
canonical payload, public oversize refusal, actual grant revocation and original
window retirement ACK, plus local Forget and wrong-window refusal. Real admission
tests cover waiting cancellation before manual release and the opposite race
where adoption preceded retirement. All40 stock Show captures fit the read cap;
a stock edit remains an in-memory draft with one history group and no personal save.
The largest measured catalogue view was `stock-show-showcase-redline-installation`: 30,174 UTF-8 bytes for Show/context and458,346 bytes including retained capture/source
metadata. These are representative supported fixtures, not a claim that arbitrary
valid personal Shows fit. Oversized reads return `result_too_large`; oversized
capture is refused before retaining a request, with no truncation.

Final production browser proof follows the integrated editor UI. Cross-window
Disconnect and Forget remain #1002. This contract does not itself close #963 or
#957; issue proof records their final qualification.

## Primary sources

Checked 2026-09-10, with the MCP tool-result clauses rechecked 2026-09-15:

- [Cloudflare workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider),
  source commit `742e222c55f5adbd8975c964f2248ea8a1670770`, package 0.10.3:
  authorization, refresh recovery, revocation, supported KV calls and issuer
  derivation. The adapter/transaction composition is this project's responsibility.
- [MCP authorization 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization):
  protected resource metadata, resource audience, PKCE, bearer transport and
  client registration boundaries.
- [MCP transports 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):
  Streamable HTTP and Origin validation. Protocol behavior uses the repository's
  MCP SDK dependency; no diagnostic harness grammar is promoted.
- [MCP tools 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools):
  `isError` tool-execution failures, structured-content text compatibility and
  conformance to advertised output schemas.
