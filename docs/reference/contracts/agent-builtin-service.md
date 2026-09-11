# Built-in Show editing service

The editable Show route requires exact `?agent=1`. Its production drawer uses
one `src/agent/editorAdmission.ts` owner and one browser channel session for the
open Show. `POST /api/agent/builtin` authenticates the account, checks the
service allowlist and owned personal Show or exact stock Show identity, then
resolves the registered window through the account rendezvous owner. Browser
JSON cannot supply an authoritative account or binding. The shared account
slot refuses another connection; cross-window Disconnect/Forget remains outside
v1 (#1002).

The Worker requires protected `OPENAI_API_KEY`, `AGENT_SERVICE_ENABLED`,
`AGENT_ACCOUNT_ALLOWLIST`, `AGENT_ACCOUNTS`, and `AGENT_ALLOWANCE` configuration.
There is no browser credential field. Missing configuration refuses fresh work.
An already-started operation's surviving browser receipt remains readable when
service configuration or contact disappears; adopted saves remain store-owned.
A remote eligibility refusal does not erase a known local outcome. Closing the
Show, opting out, or disposing the editor synchronously retires the browser
executor before best-effort network cleanup. Unknown contact never replays work.

The provider receives text and canonical local Show command schemas. Commands
run against a session-only private candidate through the shared executor;
`finish_turn` alone requests admission. Admission rechecks current Show revision,
metadata, and manual input ownership, then performs one history adoption and
personal save, or changes only the current stock draft. The drawer projects
those receipts rather than treating provider prose as proof of saving.

Only the qualified single `resize_clip` exact-duration Retry is offered. It
captures current state under a new operation linked by `retryOf`, preserves the
original failed activity and composer draft, and uses the original stable Clip
identity. It performs no new inference. Other failed requests offer Dismiss or
a fresh user request; Dismiss changes activity presentation only.

## Dispatch and accounting bounds

The transport pins `gpt-5.6-luna`, high reasoning, standard `service_tier: default`,
and `https://api.openai.com/v1/responses`. It permits no hosted billable tools,
images, alternate endpoints, parallel function calls, or automatic provider
retries. Each operation permits six rounds; each round caps output at 8,192
tokens and serialized request size at 256 KiB. Four operation starts per rolling
minute per account and one unfinished operation per binding bound admission.

A single global Durable Object atomically reserves from a shared $10 UTC-day
allowance before each dispatch. The conservative input ceiling is the full
1,050,000-token context. Maximum reservation is $0.5397456 per round, including
the long-context cache-write and output rates. Integer nanodollars avoid
floating-point budget drift. Valid provider usage settles exactly once against
the original accounting day; missing or malformed category data retains the
whole reservation. Cancellation after possible dispatch does not refund unknown
usage. An overrun halts dispatch persistently.

Server-issued operation identities have a 24-hour admission horizon. Expiry
refuses new dispatch without cancelling already-started inference or adopted
saves. Bounded accounting records and tombstones cannot turn an expired duplicate
into a new paid call. Explicit user Retry creates a new operation identity.
Durable accounting stores identifiers and spend metadata, not Show content,
prompts, transcripts, or editor receipts.

Pricing and provider-schema evidence lives in
[the service decisions](../../plans/agent-show-service-decisions.md). Injected
transport tests do not qualify live provider response identity or billing. The
exact model response identity remains fail-closed until a live authorized
qualification; no paid call is part of the local proof.
