# Agent Show service decisions (#956)

The first service is for a small allowlisted testing audience. Reuse the existing app and
OpenAI setup, keep the feature absent without explicit URL opt-in, and preserve manual Show
editing throughout failures. Jon approved the complete policy package on 2026-09-08. It does not authorize deployment or claim a live
OAuth/MCP service exists.

## Accepted

| Decision | Contract |
| --- | --- |
| Audience | A server-configured allowlist of canonical authenticated app account IDs applies to built-in and external access; no invitation or admin UI initially. |
| Visibility | Explicit URL opt-in, disabled by default, due before the first newly exposed agent capability. It is not a credential or authorization substitute. |
| Built-in inference | Jon's existing OpenAI credential, held server-side; exact model `gpt-5.6-luna`, reasoning effort `high`; no model picker or silent model fallback. |
| Cost | $10 per day total for the built-in testing service, shared across allowed accounts. Every provider dispatch reserves against the allowance. The supported local exact-resize Retry performs no provider inference. External agents and unrelated API-key use are outside that accounting boundary. |
| Abuse protection | Simple request throttling in addition to authentication, allowlist and Show ownership/target grants. |
| Outcomes | One atomic accepted edit and one Undo step; save settlement reported separately. Session-only edit receipts; unknown history never permits replay. |
| Connection | One agent bound to one live window/Show, explicit Connect, no pairing code; departure/reload/release/revocation retires the binding. HTTP stream loss alone does not cancel a logical connection. |
| Speed | Optimize and measure phases without numerical model-latency targets. The separately accepted five-second active-input wait begins only after a candidate arrives. |

Authoritative product scope and scenarios remain in #946, #947, #956 and #959. Built-in and
external connections have distinct inference ownership but share one semantic/admission path.
External conversations stay in the external client.

## Policy package accepted 2026-09-08

1. **URL:** use `?agent=1` (or `&agent=1` on a URL with other parameters). Only the exact value
   `1` enables the feature. Keep the parameter through ordinary in-app navigation in that tab;
   no local-storage opt-in. Removing it or reopening without it turns the feature off, retires
   unapplied work and preserves already-adopted Show saves. The current URL is the opt-in source.
2. **Built-in conversation:** keep the transcript in the current Show editing session only.
   Reload or leaving the Show clears it. Do not create a chat database for the first version.
   Transcript lifetime and edit-receipt lifetime are separate accepted contracts.
3. **Deployment direction:** extend the existing Cloudflare Worker for the built-in streaming
   route and keep external MCP on the same platform. Avoid a new VM/process service. Qualify
   the actual execution plan and external live-tab routing before calling this production-ready;
   OAuth authorization and rendezvous are still implementation work.
4. **Operational records:** retain minimal redacted request counts, timing, error categories
   and aggregate spend rather than prompt/Show/Pattern/transcript bodies in application logs.
   Keep only the accounting state needed to enforce the allowance. Provider retention is a
   separate boundary and needs verification against the actual API/account settings; app-side
   transcript policy does not promise provider-side zero retention.

These four choices and the spending ceiling are accepted. Engineering can choose
bounded implementation mechanics; return to Jon for a
change in behavior, cost boundary or storage scope.

## Connection setup and recovery accepted 2026-09-10

Arming lasts **120 seconds** after Connect an MCP agent. An incoming authenticated call waits **30 seconds** for Answer before returning the typed refusal. These setup timers do not bound an established editing session or model execution.

Transport loss preserves logical binding and known operation/save outcomes. Restore contact queries the same operation; no automatic replay or new paid dispatch follows. Only confirmed binding retirement ends unapplied work; already-adopted saves continue normally. Missing session receipts remain unknown.

V1 offers Disconnect and Forget only in the bound window. Cross-window Disconnect/Forget is deferred to #1002, outside v1.9 gates. Single-slot refusal and bounded stale-binding expiry remain. Storage/claim mechanics stay under the approved shared atomic owner; no second connection or takeover is introduced.

## Implementation constraints and evidence

### Eligibility and secrets

`src/cloudflare/users.ts` resolves linked provider identities to a canonical app user ID.
`src/cloudflare/auth.ts` validates the app session, and existing Show routes scope queries to
`session.userId`. Reuse that account identity for the allowlist; never trust an ID supplied in
a tool payload. External resource-bound access tokens must map to this identity and still pass
the target grant. A browser cookie is not automatically an interoperable MCP OAuth server.

The harness credential contract in `src/agent-harness/README.md` supports `OPENAI_API_KEY` or
an explicitly named external env file. Reuse the protected local source for authorized testing;
hosted configuration needs a Worker secret. Do not import the diagnostic harness's provider,
filesystem or paid-call CLI code into the frontend or assume a local key is deployed.

### Spending and request bounds

Use shared atomic reservations before each paid dispatch, then settle known usage. The proposed
calendar boundary is UTC. A durable aggregate/reservation owner is financial state, not a Show
edit-history or conversation database. Choose the smallest implementation that survives restart
and concurrent Worker invocations. Identify each actual dispatch separately while deduplicating
network retransmission of the same dispatch. Explicit user Retry is a new paid attempt.

Reserve conservatively from the pinned Luna pricing and enforced input/output limits, including
reasoning/output accounting and every billable request category used. Unknown outcomes retain
sufficient reservation; client cancellation cannot establish that OpenAI billed nothing. Reuse
the harness's tested pure reservation concepts without copying its local filesystem ledger into
production. Exact request/output/round limits are configuration still to qualify, not inherited
from the old $20 experiment or numerical latency benchmarks. Exhaustion refuses before inference
and does not disable manual editing or separately authorized external-agent inference.

Cloudflare's rate-limit binding is deliberately permissive and local to a location; it cannot
serve as this global financial counter. It remains a candidate for burst protection. This is
supported by the [rate-limit binding documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
consulted 2026-09-07.

### Streaming and connection loss

Cloudflare documents no fixed HTTP wall-clock duration while the client stays connected;
CPU and other resource limits still apply. Network wait is not CPU execution. The current
account plan, effective CPU limit, memory/subrequest needs and interruption behavior must be
recorded before production qualification. Reuse the existing Worker only after that evidence,
not because the localhost experiment worked. See the [Worker limits documentation](https://developers.cloudflare.com/workers/platform/limits/),
consulted 2026-09-07; deployment-specific values remain unverified.

A completed private candidate is not an applied edit. On interrupted built-in inference, report
incomplete/unknown and do not admit a partial candidate or automatically pay for another turn.
After delivery/acknowledgement loss, query the same operation in the surviving editor session;
never convert uncertainty into replay. An ended HTTP request and a dropped logical agent binding
are distinct. External routing requires a shared live-tab rendezvous owner; per-Worker process
memory alone is not sufficient evidence of that connection contract.

Access-token expiry/refresh and grant expiry are distinct: renewed credentials can authenticate
the same still-valid grant; an expired/revoked target grant cannot authorize a new routed edit.
Define observable revocation checkpoints and late-message handling across the network without
claiming instantaneous distributed cancellation. Editor admission remains synchronous after its
current local eligibility checks. The accepted #959 binding/session model remains authoritative.

### Proof before the first exposed slice

- Exact URL enabling/non-enabling values, navigation, removal and reload; manual editing,
  Undo and save remain usable while agent access is off or denied.
- Valid listed account, unlisted account, missing/invalid credentials, wrong-owner Show,
  missing/expired/revoked grant, linked identities and two competing agent connections.
- Exact Luna/high dispatch, no user override, provider failure without silent fallback;
  no key in browser bundles, client responses, logs or tool arguments.
- Concurrent budget admission, duplicate delivery, explicit retry, missing usage, cancellation,
  day rollover and restart; exhausted budget starts zero new provider requests.
- Interrupted/truncated stream, malformed tool results, provider resource cutoff and deploy
  interruption; no partial candidate admission and no automatic paid replay.
- Same-session receipt lookup after lost acknowledgement versus unavailable retired-session
  history; every late request stays bound to its original Show and target identities.
- Approved transcript/log retention behavior and truthful cost/error status on the real route.

#957 implements the built-in path, #963 the external path and #964 per-client interoperability.
#949/#950 supply the qualified editor/command seam. The final #959 surface mock-up and its
interaction proof remain separate. Nothing in this packet makes those dependent issues done.

### Historical diagnostic implementation

B2 wired the DEV editable-Show bridge and manually injected overlay to exact
URL gating, session-only transcripts, whole-Show admission and truthful save
receipts. That checkpoint preceded hosted inference, OAuth/MCP, accounting and
the final drawer placement. Current behavior is described in the
[built-in service contract](../reference/contracts/agent-builtin-service.md) and
[connection contract](../reference/contracts/agent-rendezvous.md). Live-provider
and client qualification remain separate from implementation and local proof.

### Built-in implementation bounds (2026-09-10)

The production candidate uses a 256 KiB serialized request ceiling, at most six
provider rounds per user operation, 8,192 output tokens including reasoning per
round, one active private operation per binding, and four starts per minute per
account. Every dispatch uses exact `gpt-5.6-luna` / `high`, the global
`https://api.openai.com/v1/responses` endpoint, `service_tier: default`,
`truncation: disabled`, text and local function tools only. Hosted billable tools,
regional/Fast uplifts and provider retries are absent.

The [official standard pricing table](https://developers.openai.com/api/docs/pricing),
fetched on 2026-09-10, lists Luna short-context input/cache-read/cache-write/output
at $0.20/$0.02/$0.25/$1.20 per million tokens and long-context rates at
$0.40/$0.04/$0.50/$1.80. The [model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
lists a 1,050,000-token context and 128,000 maximum output. Reservations use the
entire context as the conservative input ceiling, rather than subtracting an
output allowance or estimating tokens from bytes. At the highest applicable
rates, each actual dispatch reserves $0.5397456: 1,050,000 input tokens at the
long cache-write rate plus 8,192 output tokens at the long output rate. Arithmetic
uses integer nanodollars. This is a conservative accounting bound, not an invoice
claim; current implementation proof uses injected transport and makes no paid call.

A single global Durable Object owns the $10 UTC-day allowance across accounts.
Server-issued operation identities carry a 24-hour horizon for admitting new
dispatches. Expiry refuses further dispatch; it does not cancel an already-started
provider request, end a browser binding, or interfere with adopted saves. Explicit
Retry obtains a new operation. Duplicate rounds never authorize another call.
Operation tombstones remain for 48 hours and day accounting for three days;
old identities refuse after cleanup, and late known usage settles only its
original retained day. Missing, malformed or unavailable usage keeps its full
reservation; cleanup never credits that reservation into a current day's budget.
A persistent overrun halt survives ordinary metadata cleanup. Capacity limits
(2,048 retained operations and 4,096 dispatches per day) refuse new work instead
of evicting deduplication state. These stores contain accounting/identity metadata
only, not Shows, command arguments, transcripts or editor receipts.

The pinned `openai` 7.10.0 Responses `ResponseUsage` schema requires
`input_tokens_details.cache_write_tokens`, `cached_tokens`, and
`output_tokens_details.reasoning_tokens`; the representative transport fixture
is checked against that SDK type. No missing category is silently treated as zero.
The model page currently lists `gpt-5.6-luna` itself as the current snapshot;
response identity must match it and the default tier exactly. Live response
identity and usage compatibility remain qualification requirements: injected
responses prove the control flow, not a paid provider session. An unexpected
model/tier persists the same halt as an accounting overrun and retains spend.

Production v1 keeps the existing finite Retry qualification: one successful
canonical `resize_clip` with its resolved Clip ID and exact duration. Retry gets
a new operation and `retryOf` on fresh state, retaining the original failure and
composer draft. Multi-command plans, generated IDs and relative intent are not
replayed. Other failures offer their truthful outcome and Dismiss; a fresh user
request remains available. This does not reduce the canonical edit tool surface.

Recovery in a surviving editor uses the channel's local outcome journal and the
same admission/store receipts. Removing the service credential or eligibility
refuses remote requests and new dispatch; it does not turn a known local saved
or saving outcome into an unknown failure. This adds no remote recovery exception.
After editor departure, session receipts are intentionally unavailable, while an
already adopted personal save remains owned by the store and persistence provider.
