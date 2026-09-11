# Agent MCP routing slice (#963)

This approved next slice connects validated external OAuth identity to the existing account rendezvous and one browser-owned private Show executor. The builtin service (#957) consumes the same executor and account owner. OAuth authorization is landed; this slice adds routing. Focused implementation evidence is recorded in the as-built contracts; integrated browser proof and client qualification (#964) remain separate.

## Ownership and admission

The server supplies account, grant, client, registration, binding, Show and editor-session identity. Browser or MCP arguments cannot select a trusted actor. The account Durable Object remains the sole attachment owner for both agent kinds. Every dispatch and reply revalidates the original binding and registration generation.

`begin_edit` captures the immutable full-Show request, current reference context and private Show in the browser. Registry commands mutate only that private copy. `commit_edit` delegates to existing `applyShow` validation, revision admission, input-wait and save receipts exactly once. Cancellation and outcome lookup delegate to that same session owner. No diagnostic grammar enters the production path.

The server relay carries delivery metadata and bounded volatile messages. It never persists Shows, candidates, transcripts or operation outcomes. OAuth authority remains separate and auth transactions never contain held MCP calls or tab polling.

## Identity, ordering and retirement

Caller operation IDs are scoped to the validated binding and editor session. Each operation binds its initial normalized intent and command payload identities. A delivery identity binds operation, command sequence and normalized payload; changed reuse is refused. MCP JSON-RPC IDs alone provide neither ordering nor idempotency. Commands execute serially in their accepted sequence; duplicate deliveries return the original session result without another mutation.

Capacity refuses new work instead of evicting an identity into availability. Retired operation tombstones survive for the whole binding/session lifetime. Ending that scope makes its old identities permanently invalid because a replacement binding has a new generation. Volatile relay loss never causes automatic replay: outcome lookup asks the surviving browser receipt, otherwise returns unknown.

Local Disconnect and authenticated local Forget retire unapplied work; adopted saves remain owned by the existing store and settle independently. Contact loss preserves logical binding and known browser receipts. Cross-window controls remain outside this slice (#1002).

## Engineering caps

These are resource policies, distinct from the accepted 120-second arming and 30-second incoming-call deadlines. Focused tests qualify each cap at its consumer boundary:

- One private edit in progress per binding and 16 MiB aggregate retained capture budget (Show, reference context and captured source metadata), up to 256 admitted operation identities per editor session; capacity refusal requires a new session rather than identity eviction.
- At most 256 command deliveries per operation and 4 MiB total retained normalized payload identity per session (capacity refusal, never eviction), with monotonically increasing sequence and immutable payload identity.
- At most eight queued relay deliveries per binding; 64 KiB request payload and 1 MiB result ceilings, measured as UTF-8 bytes before enqueue/response. Oversized Shows/context fail explicitly and are never truncated; qualify this ceiling against supported complex fixtures.
- One bounded tab poll and eight waiting callers per binding; no held request inside durable storage transactions.
- The incoming-call claim remains held for its complete 30-second Answer window independently of relay waits. A relay request may return an explicit pending/unknown transport result after 25 seconds; that is not cancellation or an execution timeout. Private edits retire only through explicit cancellation/end, session loss, or the existing registration retirement policy.
- Completed relay replies remain volatile for at most 60 seconds and at most 4 MiB aggregate cache per session; oldest cached results may be removed while their identity tombstones remain. Their removal never authorizes rerun; browser operation/delivery identities remain authoritative for the session.

## Required evidence and integration

Focused pure tests cover normalized payload reuse, ordered commands, capacity refusal, tombstones and retirement. Actual workerd and MCP SDK tests cover authenticated claim/held Answer, wrong-account/grant/generation refusal, duplicate delivery, relay loss and cancellation boundaries. A real browser flow must prove private mutation stays invisible before commit and one commit produces one existing history/save result, including stale admission and acknowledgement loss.

The schema owner is #957: `showCommandInputShape` and `showCommandFieldSchema` from `src/engine/showCommands/descriptorSchema.ts`. The executor provides begin, command, commit, outcome and cancel to both external relay and builtin provider adapters. Stock-draft registration and truthful grant revocation/Forget semantics must be resolved before claiming the complete production user path. Hosted client compatibility remains #964, not a consequence of local protocol proof.

## Revocation and confirmed editing end

OAuth credential revocation and confirmed browser editing retirement are distinct. Protocol revocation success proves credentials revoked; it does not assert distributed cancellation. The account owner marks the current generation retiring and wakes a held browser receive. The browser retires its executor and existing unapplied admission work, then acknowledges that generation. Only this acknowledgement confirms editing end. An unreachable browser leaves explicit retirement-unconfirmed/contact-loss state. No later adoption is allowed after confirmed editing end; an adoption that won the race before acknowledgement keeps its actual save outcome.

Local Disconnect and Forget retire synchronously before their first network await. Remote-revocation tests must cover commit already in active-input wait, manual release before retirement acknowledgement (truthful adoption may win), and release after acknowledgement (no adoption). Neither the 15-second heartbeat nor OAuth protocol200 is a cancellation oracle. Grant checks and dispatch/reply generation validation remain required even with prompt held-receive wakeup.

## Executable channel checkpoint

The production `createAgentBrowserSession({ admission, showId })` owns one
server-generated window registration, held receive loop and binding-scoped
private executor. It exposes the committed `AgentBrowserSessionPort` to the
separate drawer controller. Delivery events carry the local immutable request;
that request is not an authority accepted from the server or an MCP caller.
Contact loss preserves the executor and receipts. Disconnect and close retire
private work synchronously before network cleanup, and a held old response
cannot recreate that locally retired binding. The React owner closes admission.

The account relay delivers each accepted identity once, accepts replies only
from the original registration/session/Show/binding, and wakes held callers on
retirement. Read queries reserve one queue slot independently of mutation
identity capacity. Canonical single-resize Retry uses existing fresh admission
and retains its original failed receipt. The subsequent server integration adds
actual OAuth grant revocation for Forget, browser retirement acknowledgement and
full canonical MCP routing. Final browser qualification follows the integrated
#957 production editor rather than the earlier diagnostic surface.

Focused proof includes real workerd authenticated register/claim/receive/reply,
old-session reply refusal, disconnect of a held dispatch, exact stock catalogue
identity registration and owning-window disarm. Browser-session unit proof covers
contact loss without replay, request events, and synchronous local retirement;
it is not real browser UI or external-client qualification.
