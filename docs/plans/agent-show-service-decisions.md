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
| Cost | $10 per day total for the built-in testing service, shared across allowed accounts. Every provider dispatch and retry counts. External agents and unrelated API-key use are outside that accounting boundary. |
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

### Current diagnostic implementation

B2 wires the existing DEV editable-Show bridge and manually injected overlay to exact
URL gating, session-only transcripts, whole-Show admission and truthful save receipts.
It does not implement hosted inference, OAuth/MCP, logging/accounting or final #959
placement. The accepted Cloudflare direction still requires runtime qualification.
