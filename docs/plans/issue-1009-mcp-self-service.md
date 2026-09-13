# MCP self-service onboarding execution design

Issue #1009 opens external MCP onboarding to every signed-in account while the
built-in Pixelblaze agent retains its existing server-enforced allowlist and
allowance. The normal editable Show route exposes an untimed setup panel. Only
the explicit **Ready to connect** action arms that exact editor for 120 seconds;
OAuth consent selects an account and application, never a Show.

The approved visual source is preserved byte-for-byte in
`issue-1009-mcp-onboarding/mcp-onboarding.html`, with its adjacent
`geist.woff2` and OFL-1.1 license. The HTML remains a simulated design artifact,
not browser or protocol proof.

## Provider boundary

The implementation keeps `@cloudflare/workers-oauth-provider` pinned to 0.10.3
and uses one client-resolution boundary for preregistered, dynamically
registered, and Client ID Metadata Document clients. A static client remains
authoritative when its configured ID matches. A DCR client resolves from the
authority's expiring client record. An HTTPS URL client ID resolves through the
provider's CIMD validator before the Durable Object transaction, then enters the
transaction as a closed, request-scoped validated client value. Provider calls
inside the transaction have network CIMD lookup disabled and can read only that
validated value or stored/configured clients.

CIMD validation uses the pinned provider's bounds and the Worker's
`global_fetch_strictly_public` compatibility flag:

- the client ID is HTTPS, has a non-root path, and has no userinfo, fragment,
  control characters, backslash, or dot segments;
- the response must finish within 10 seconds and fit within 5 KiB, including a
  declared or streamed size check;
- the fetched document's `client_id` exactly equals its URL; JSON, UTF-8,
  redirect URI schemes, required name/redirect fields, and public metadata are
  validated before use;
- the provider follows Fetch redirects under the strictly-public network flag,
  so the original target and every redirect target are refused if they resolve
  to a private network; no same-zone legacy routing is allowed;
- only validated 200 responses may be cached, according to their public
  `Cache-Control` lifetime, capped at seven days; no-cache, private, missing-TTL,
  error, and invalid responses are not cached;
- each authorization start, token exchange/refresh, protected MCP request, and
  live-grant inspection re-resolves a CIMD client. Consent Allow performs a
  preflight read of the one-use nonce, resolves the named client outside the
  transaction, then consumes that same account-bound nonce in the transaction.

The provider accepts `client_secret_basic`, `client_secret_post`, and `none` for
DCR. Preregistered clients retain their existing `none` method. CIMD negotiates
only `none` in 0.10.3; it may
select `none` from a client's supported choices and rejects a client that offers
only an unsupported asymmetric method. Public clients must use S256 PKCE.
Implicit flow, plain PKCE, token exchange, and external bearer validation remain
disabled.

DCR uses `/oauth/register`, a 16 KiB outer request bound, a 90-day client
lifetime, at most 1,024 live DCR records, and at most 10 registration requests
in a rolling minute for this authorization-server authority. Expired
records do not consume capacity. Registration metadata remains subject to the
provider's implemented grant, response, redirect, and token-auth method
validation. Provider 0.10.3 supplies creation only: it issues no registration
access token and has no client update/delete endpoint, so clients re-register
after expiry. An empty static-client array leaves CIMD and DCR available. The
existing authority-wide 120-per-minute non-revocation bound still applies.
Protocol revocation remains available after service or rate changes. Local
Forget uses the private account-bound grant identifier and remains available
when a CIMD document changes or disappears; public access, refresh, and grant
inspection continue to require current client metadata.

## Authentication and consent continuation

A signed-out authorization request is parsed through the same validated client
and redirect boundary before sign-in. The Worker stores no raw authorization
query in a return URL. It places an authenticated, expiring, one-use
continuation identifier in an HttpOnly, SameSite=Lax cookie and carries only the
same-origin consent route through the identity-provider round trip. The callback
creates the normal account session, consumes the continuation for that account,
and redirects to the stored authorization request. A cancelled, expired,
tampered, reused, or different-account continuation fails locally without
redirecting to a client callback or mutating a Show.

The consent page uses the application shell's Geist typography, dark surfaces,
compact amber action, and compact red notice treatment. It escapes the account
and application names. The client-supplied name is presentation only. Allow and
Cancel always use the redirect URI already validated and stored with the
one-use request; neither accepts a return URL from form input.

## Eligibility and editor lifecycle

Shared external-agent access requires service availability and a signed-in
account. Built-in access layers the existing allowlist and allowance on top and
rechecks it at every server entry. A same-origin, session-authenticated
capability response returns only effective booleans and the canonical MCP
endpoint; it never returns the allowlist. Unknown capability state exposes no
built-in choice.

An editable Show mounts the browser session without URL eligibility gating.
Registration does not arm. The drawer setup state is untimed and survives arm
expiry, call expiry, cancellation, and retry. Existing account slot, 30-second
incoming Answer, 120-second arm, registration liveness, admission, history,
save, Disconnect, and Forget ownership stay with their current modules.

## Test model

The approved seams are the public Worker protocol and real editable Show route
named in #1009. Tests do not inspect private helper state when the public response
or rendered route can serve as the oracle.

The governing invariants are: external authorization never supplies account or
Show ownership; built-in dispatch always rechecks built-in eligibility; every
OAuth callback was validated before it can be used; resource and scope remain
exact; public authorization-code clients use S256; a nonce/code is consumed at
most once; dynamic and metadata clients cannot bypass storage/network bounds;
opening setup never starts an arm; and recovery never takes over, recreates a
call, replays inference, or guesses an outcome.

The test design partitions are:

1. signed-out, signed-in non-allowlisted, signed-in allowlisted, service-disabled,
   eligibility-removed, ordinary URL, and legacy URL cases at the capability,
   channel, and built-in routes;
2. empty/static/DCR/CIMD client resolution, DCR reuse/expiry/rate/capacity, and
   actual-provider authorization/token/refresh/revocation behavior;
3. malformed, oversized, timed-out, private-network, redirected-private,
   changed, and hostile metadata, including exact redirect and permitted
   loopback-port partitions;
4. signed-out continuation through sign-in, cancel, expiry, tamper, replay, and
   account mismatch at real Worker and browser form boundaries;
5. untimed setup, explicit arm boundaries, incoming call boundaries,
   cancel/re-arm, occupied slot, Disconnect, Forget, and truthful unknown states;
6. desktop and narrow Show routes, keyboard focus, long labels, and clipboard
   success/failure.

The pinned provider source owns the CIMD network, redirect, timeout, response
size, and cache implementation. Repository tests exercise the local seam: CIMD
resolution must finish before a Durable Object transaction and only its
validated request-local result can enter that transaction. The full hostile
metadata matrix above remains a source-audit partition until it is exercised
through a reachable HTTPS candidate.

Focused tests and a real isolated browser route can establish repository-owned
behavior. Final qualification still requires a reachable HTTPS candidate and two
independent real MCP clients, one through CIMD and one through DCR, plus durable
Show reopen and occupied/cancelled recovery. Mocks and the approved HTML do not
substitute for that external proof.
