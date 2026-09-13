# Built-in Show editing service

An ordinary editable Show route uses one `src/agent/editorAdmission.ts` owner
and one browser channel session for the open Show after signed-in capabilities
resolve. The built-in choice appears only when `/api/me` reports it available.
`POST /api/agent/builtin` independently authenticates the account, checks the
service switch and owned personal Show or exact stock Show identity, then
resolves the registered window through the account rendezvous owner. Browser
JSON cannot supply an authoritative account or binding. The shared account
slot refuses another connection; cross-window Disconnect/Forget remains outside
v1 (#1002).

The Worker requires protected `OPENAI_API_KEY`, `AGENT_SERVICE_ENABLED`,
`AGENT_ACCOUNTS`, and `AGENT_ALLOWANCE` configuration. Every signed-in account
is eligible when these bindings are available; the legacy
`AGENT_ACCOUNT_ALLOWLIST` binding no longer participates in built-in admission.
There is no browser credential field. Missing configuration refuses fresh work.
An already-started operation's surviving browser receipt remains readable when
service configuration or contact disappears; adopted saves remain store-owned.
A remote eligibility refusal does not erase a known local outcome. Closing the
Show, losing the advertised capability, or disposing the editor synchronously retires the browser
executor before best-effort network cleanup. Unknown contact never replays work.

Reasoning response and continuation items use one shared validator. It accepts
optional SDK `content` arrays of strict `reasoning_text` items, including the
empty array observed in live Luna responses. Encrypted continuation state remains
required; unknown fields and malformed content remain refused. Reasoning content
is never displayed as an edit result or logged.

The provider receives text and canonical local Show command schemas. Commands
run against a session-only private candidate through the shared executor;
`finish_turn` alone requests admission. Admission rechecks current Show revision,
metadata, and manual input ownership, then performs one history adoption and
personal save, or changes only the current stock draft. The drawer projects
those receipts rather than treating provider prose as proof of saving.

Only the qualified single `resize_clip` exact-duration Retry is offered. It
captures current state under a new operation linked by `retryOf`, preserves the
original failed activity and composer draft, and uses the original stable Clip
identity. It performs no new inference and consumes no message allowance. Other
failed requests retain their truthful activity and permit a fresh user request.
The built-in and external activity streams expose no Dismiss action.

## Dispatch and accounting bounds

The transport pins `gpt-5.6-luna`, high reasoning, Fast mode `service_tier: priority`,
and `https://api.openai.com/v1/responses`. It permits no hosted billable tools,
images, alternate endpoints, parallel function calls, or automatic provider
retries. Each operation permits six rounds; each round caps output at 8,192
tokens and serialized request size at 256 KiB. Four operation starts per rolling
minute per account and one unfinished operation per binding bound admission.

A single global Durable Object atomically reserves from a shared $10 UTC-day
allowance before each dispatch. The conservative input ceiling is the full
1,050,000-token context. Maximum reservation is $1.0794912 per round, including
the long-context cache-write and output rates. Integer nanodollars avoid
floating-point budget drift. Valid provider usage settles exactly once against
the original accounting day at the returned priority or default tier; missing or
malformed category data retains the
whole reservation. Cancellation after possible dispatch does not refund unknown
usage. An overrun halts dispatch persistently. The documented default-tier downgrade
is accepted at standard rates; unknown tiers halt dispatch. Reservations retain
their original amount across pricing upgrades, including legacy standard entries.

The same transaction admits at most 30 submitted built-in messages per
canonical account and UTC day. The first admitted provider dispatch for an
operation consumes one message; its later model/tool rounds consume none.
Authentication, ownership, validation, busy, rolling-minute, personal-limit,
shared-budget and other refusals before dispatch consume none. Once dispatch may
have happened, provider failure, cancellation, clarification and no-edit
completion keep the message charge. Operation and round identities make this
at-most-once under duplicate delivery. The counter spans Shows, windows,
reconnects and sign-in sessions. An operation first dispatched before midnight
keeps that message on its original day while later financial rounds reserve on
their own current UTC days.

`/api/me` and built-in command responses return the account's authoritative
limit, remaining messages, next UTC reset instant and allowance revision. The
drawer refreshes from command responses, window focus and a timer at the
server-provided reset. If the browser reaches that instant before the server's
UTC day advances, the drawer keeps the last valid reset target and makes four
bounded retries at 1, 2, 4 and 8 seconds. A later reset target or a successful
focus refresh replaces that retry series. It does not derive entitlement from
browser storage or poll the server continuously. Missing, malformed, failed or
stale status cannot enable new inference. The personal daily limit, insufficient
shared reservation, and persistent service halt remain distinct states. A halt
does not promise recovery at midnight.

Server-issued operation identities have a 24-hour admission horizon. Expiry
refuses new dispatch without cancelling already-started inference or adopted
saves. Bounded accounting records and tombstones cannot turn an expired duplicate
into a new paid call. Qualified local Retry creates a new editor operation but
does not invoke the provider or create another message charge.
Durable accounting stores identifiers and spend metadata, not Show content,
prompts, transcripts, or editor receipts.

Pricing and provider-schema evidence lives in
[the service decisions](../../plans/agent-show-service-decisions.md). Injected
transport tests do not qualify live provider response identity or billing. The
exact model response identity remains fail-closed until a live authorized
qualification; no paid call is part of the local proof.

## Refusal before browser admission

A built-in response may carry `dispatch: not_attempted` when that HTTP
invocation was refused before any editor delivery. This describes the current
invocation only; it does not prove that an earlier invocation of the operation
never ran. Authentication/configuration refusal, missing binding before the run,
and an allowance activation halted before relay dispatch use this marker.
Personal and shared allowance refusals also complete before provider transport
and do not consume a personal message.
Duplicate, finished, expired, unknown activation, relay pending, and caught
transport failures remain ambiguous and carry no such assertion.

The drawer sends one original run after successful begin, without replay. Only
for that original invocation, and only while no local admission request exists,
it combines this marker with a synchronous late-begin cancellation barrier to
show not-applied and release the composer. It restores the submitted prompt only
when a newer draft has not replaced it. A known local receipt always wins over
the marker; adopted saves retain their outcome. A delayed begin is cancelled
before later commands can adopt it. Ambiguous outcomes remain queryable and do
not release the request or imply permission to replay.
