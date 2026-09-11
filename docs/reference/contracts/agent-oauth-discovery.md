# Agent OAuth and MCP

The #963 server authorizes external clients and routes the production canonical
Show command catalogue through the same browser admission used by the built-in
agent. [Agent rendezvous](agent-rendezvous.md) owns the sole account attachment.
No diagnostic grammar, paid inference, remote provisioning or deployed-client
qualification is implied by the local protocol proof.

## Public boundary

The Worker serves `/oauth/authorize?agent=1`, `/oauth/token`, `/mcp`, and OAuth
metadata at `/.well-known/oauth-authorization-server` and
`/.well-known/oauth-protected-resource/mcp` (also the root resource metadata
alias). Assets cannot intercept these routes. Every response is non-cacheable.

Deployment configuration is closed by default:

- `AGENT_SERVICE_ENABLED=1` and `AGENT_ACCOUNT_ALLOWLIST` retain their shared
  server eligibility meaning. Authorization, access, and refresh check current
  eligibility. Revocation remains available after disable/removal.
- `AGENT_OAUTH_ORIGIN` is an exact origin, HTTPS for a hosted service. Literal
  localhost, 127.0.0.1 and ::1 HTTP origins are allowed for local proof only.
  Public request origins must match this configured origin exactly.
- `AGENT_OAUTH_CLIENTS` is a JSON array of at most eight preregistered public
  clients: `{clientId, clientName, redirectUris}`. IDs are bounded alphanumeric,
  underscore or hyphen strings, never metadata URLs. Each client has one to four
  exact HTTPS or literal-loopback redirect URLs without credentials/fragments.
  Dynamic registration, client metadata fetches, external token validation,
  implicit flow, plaintext PKCE, and token exchange are disabled.

Consent visibly names the verified signed-in account and requesting client. The
account label is server-overwritten display metadata, HTML-escaped, and never an
authorization identity. Authorization requires the existing signed account session and exact `agent=1`
opt-in. The client request must name its registered redirect, `code` response,
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
known public client ID, and exact resource. Duplicate parameters are refused.
MCP uses bearer headers on every request; URI bearer credentials and hostile
Origin headers are refused. Present Origin values are limited to the configured
service origin and preregistered redirect origins; native clients may omit
Origin. CORS responses never use a wildcard. Metadata advertises S256 and the
resource authorization server derived from the exact configured token endpoint.

The MCP SDK serves stateless JSON initialization and stable `tools/list` metadata:
`get_connection`, `list_commands`, `read_show`, `get_context`, `begin_edit`, all
canonical `SHOW_COMMANDS`, `commit_edit`, `get_outcome` and `cancel_edit`. Listing
metadata neither claims an account slot nor reads Show contents. There is no GET
event stream, DELETE session, durable MCP session or tools-list notification.

`get_connection` uses the validated grant/client identity to claim the account
slot. An armed editor binds immediately; otherwise the call waits the full
30-second Answer window outside authorization serialization. A supplied
`call_id` only inspects that original call and never recreates an expired call.
Every content or edit tool requires the current `binding_id`; mutations also
require `operation_id`, `delivery_id` and increasing `sequence` (begin is zero).
These caller identifiers are scoped by the validated account, grant and binding;
they never authorize a window or select an actor. The server rechecks the original
generation at dispatch and browser reply. The editor executes closed canonical
arguments against its private immutable capture and adopts only through admission.

MCP request bodies are bounded to66 KiB before SDK parsing, allowing a64 KiB
normalized command plus its JSON-RPC envelope. OAuth forms remain16 KiB. No
input or captured reference context is truncated to fit. Relay/read results are
at most1 MiB; MCP encodes that result as both text and structured content, so its
wire response may contain two copies plus protocol framing.

## Authority and persistence

`AgentOAuthAuthority` is a private SQLite Durable Object, named by configured
origin. It owns only consent nonces and OAuth grants/tokens. It does not own
Shows, editor sessions, candidates, transcripts, adopted state, operation
receipts, or the account slot. There is no added D1 or KV deployment binding.

`@cloudflare/workers-oauth-provider` is pinned to **0.10.3**. The integration's
`oauthStorageKV` adapter implements only the library's exercised subset:
string and JSON `get`, string `put` with relative or absolute expiration,
`delete`, and prefix `list` with limit/cursor. Unsupported options fail. Values
are bounded to 64 KiB and keys to 512 characters. Reads enforce TTL immediately;
listing excludes expired values. Cursors use the last scanned key, so deleting
one revocation page cannot skip the following page.

Every bounded authorization mutation, including awaited cryptography, code
consumption, refresh rotation and revocation, runs inside one Durable Object
storage transaction. The adapter alone supplies no serialization. No held MCP
request, network client discovery, or rendezvous wait enters that transaction.
Provider background work fails explicitly rather than escaping its owner.
The public Worker executes MCP routing only after token validation returns. A
held attachment revalidates its grant after waiting.

Canonical account IDs contain colons, while the provider's token format uses
colon-delimited fields. `providerSubject` encodes the canonical account as
base64url; encrypted grant props retain the verified canonical account ID.
Validation checks that mapping and returns `ValidatedAgentGrant` privately:
`accountId`, `clientId`, `grantId`, `expiresAt`. The browser and MCP response
never receive an account rendezvous capability.

Engineering defaults are five-minute access tokens, 24-hour refresh families,
provider ten-minute authorization codes, and five-minute consent nonces. The
authority admits at most 120 non-revocation requests per minute; revocation is
exempt so cleanup remains possible. An alarm scans up to 1,000 expiring records
per minute, preserving its cursor and deadline under traffic, and stops when
storage is empty. Static clients live in configuration. Per-account nonce/grant caps and the
issuance rate also bound outstanding state; max-eight-client registration alone
would not do so. These defaults bound
issuance and retention; they are independent of Jon's 120-second arming and
30-second incoming-call decisions.

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
retires browser work, then revokes the exact attached external grant and ends
that binding; another window cannot invoke it for the owner.

## Qualification and next seam

Focused tests exercise the actual pinned provider, adapter, and workerd with
SQLite. They prove concurrent same-code redemption, independent-grant survival,
current/previous/older refresh generations, concurrent refresh recovery,
revocation, and persisted validation/rotation across runtime disposal/restart.
Production Worker tests prove signed/account-bound consent, Cancel, forged
identity/redirect/resource/S256 refusals, failed exchanges without code
consumption, metadata, initialization, the full canonical catalogue, and eligibility changes
followed by successful revocation, concurrent nonce capacity and grant capacity
without earlier-family revocation. A real Chromium form test uses a local
workerd listener and a cross-origin client callback. Adapter tests prove TTL and deletion-safe
pagination rather than assuming KV emulation is upstream-qualified.

Browser qualification uses the managed isolated runtime and synthetic identity.
The serve-only Cloudflare plugin accepts exactly four nonsecret process binding
overrides: service enable, allowlist, OAuth origin and clients. These never enter
Vite client definitions and do not modify/copy canonical `.dev.vars` secrets.
The local proof is HTTP loopback; hosted TLS and actual client interoperability
remain #964 qualification, including registration compatibility beyond static
clients.

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

Final production browser proof follows the integrated #957 editor UI. Hosted TLS,
actual Codex/Claude client interoperability and callback behavior remain #964.
Cross-window Disconnect and Forget remain #1002. This contract does not itself
close #963 or #957; issue proof records their final qualification.

## Primary sources

Checked 2026-09-10:

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
