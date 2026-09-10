# Shared Show editing UX: behaviour proposal (#959)

Historical proposal and review record. The accepted 2026-09-10
[interaction design](shared-show-editing-ux-design.md) supersedes conflicting
layout, payer-copy, retry, transport-loss and cross-window recovery provisions
below. Cross-window Disconnect/Forget is deferred to #1002; this historical
record does not impose it on v1.9.

Status: v2, 2026-09-06. Drafted by Fable 5.1 from design conversations with
Jon. v1 was reviewed by Astra Medium (`gpt-6-astra`, medium) on 2026-09-06
with the verdict "proceed with the listed changes"; the disposition of its
eight findings is at the end. Jon accepted the two flow changes the review
asked for (pairing initiated from the intended Show, release or revoke from
any signed-in window) and added three constraints of his own, recorded under
D4, D5 and D9. Nothing here is supported behaviour. These decisions are the
base for the detailed design (state table, prototype, diagrams, downstream
issues); they are not yet Jon's approval of that design.

## The shape of it

An author edits a Show three ways: by hand, with the assistant PXLBLZ provides,
or with an agent they already have (Claude Code, Codex, a Claude connector)
connected over MCP. The proposal makes those three cases one experience with
one visible difference. Every agent, built-in or external, issues the same
finite Show commands, has them admitted by the same live editor tab under the
author's own account, and is listed in the same place with the same outcomes
and an explicit payer. The IDE gains one agent panel, with its own real estate
like the control panel, as the single entry point for everything agent-shaped:
what this is, which options exist, how to connect your own agent, who is
connected, what they did to the document, and who pays. Conversation lives in
the client. For the built-in assistant the client is inside the IDE, so the
panel shows it; for an external agent the client is outside, so the panel does
not.

Connecting is started from the Show the author wants edited. Two grants are
involved. Identity is standard OAuth: the client obtains a token for the
author's PXLBLZ account through the browser the author is already signed into.
Target is ours: the author clicks Connect in the agent panel of the intended
Show, which arms that window as the only destination, and the agent's first
call binds to it. The token says which account; the armed window says which
Show and which tab. No pairing code, no secret on screen.

Two simplifications carry most of the weight. At most one agent connection per
account at a time, bound to one window and one Show; a second attempt fails
and names the active one. And the connection is lightweight and transient: it
ends when the author leaves the Show, and re-establishing it is one click,
because the client already holds its identity grant and can read current state.

## Decisions

### D1. Same commands, same admission, explicit payer

Both agent kinds see the same finite command set as MCP tools (#947 owns the
census and an explicit production allowlist; the diagnostic server's generic
patch and execution tools are not on it). Every command is admitted by the
live editor tab against the author's current document, under the author's
account, whoever pays for the inference. The built-in assistant differs from an
external agent only in who runs the client and who pays. Whether the built-in
client literally speaks MCP to the same server or calls the same application
service through an adapter is #956's choice; the requirement here is that no
path bypasses the shared commands or the shared admission. Manual editing is
unchanged and needs no connection.

### D2. One agent panel; outcomes, not conversation

The robot button opens an agent panel with dedicated real estate, using
progressive disclosure: with nothing connected it explains the two options and
how to connect; with a connection it shows the connection and the activity
feed; with the built-in assistant active it also shows the conversation. The
IDE never mirrors an external agent's conversation. Where the author must
decide, the panel is explicit: choose a service, connect, cancel a pending
request, retry a failed save, release, revoke. Otherwise it stays quiet: an
applied edit is a feed line and an ordinary history entry.

Feed outcomes distinguish application from presence from persistence, because
the store's recovery policy can remove an applied change:

- pending, attributed to the agent
- waiting for your gesture to finish
- applied (visible, one undo step), not yet saved
- saved
- save failed, change rolled back (retry re-adopts; dismiss removes the notice)
- superseded (a later edit owns the visible and durable outcome)
- draft only (stock Show; nothing is saved by design)
- refused, with the reason (stale base, target gone, unsupported, ambiguous)
- cancelled
- outcome unknown (acknowledgement lost; see D6)
- asked a question (only when reported as a structured outcome; otherwise the
  feed says where the author should continue)

### D3. Two grants, no pairing code

Identity grant: the MCP client runs OAuth against PXLBLZ acting as its own
authorization server. The consent page reuses the existing cookie sign-in and
shows the account it is granting for, since OAuth authenticates whichever
account the browser holds and cannot infer the one the author meant. The
client then sends a bearer token on every MCP request. The token identifies
account, client, and scope. It never reaches the tab.

Target grant: the author opens the agent panel in the Show they want edited
and chooses Connect your own agent. That arms this window as the only
destination for a bounded time and shows the MCP URL and a short per-client
note. The agent's first call that needs a live editor binds to the armed
window; approval atomically claims the account's single slot and records
client session, editor instance, Show, and scope. An agent that calls with no
armed window gets a typed "open the agent panel in the Show you want to edit
and choose Connect", which it relays; nothing edits. Account equality is
checked at binding and on every routed command, not assumed from the grant.

### D4. One connection, one window, one Show; ends when you leave

At most one agent connection per account at a time, of either kind. A second
connection attempt fails: an external agent receives a typed refusal naming
the active connection and how to release it; the built-in choice says "Claude
Code is connected to Overture; release it to use the assistant". Built-in and
external are never both active, which keeps the payer unambiguous.

The binding belongs to one editor instance and one Show. Leaving the Show,
reloading, or closing the tab ends it, with no grace period and no queue;
edits are saved as they apply, so nothing is lost by dropping the session.
Another window that opens an editable Show sees "agent connected in another
window" and can release or revoke it from there (D5), which is the recovery
path when the bound window is asleep or gone. This is release and reapproval,
not takeover: the new window then connects from its own agent panel. A bounded
stale-binding expiry covers a window that died without releasing.

Deliberately unsolved: multi-tab arbitration, agent-to-tab selection, two
agents on one document, and manual saves racing from a second tab, which
remain outside the persistence contract (#802).

### D5. Lifetimes and what ends what

Five things with separate lifetimes, and explicit dependency rules:

- Grant: the author's consent to a client. Ends by revocation from any
  signed-in window, or by expiry (#956). Revocation is server-side and also
  ends the binding and every unapplied request; a revoked client's next call
  gets 401.
- Credential: the access and refresh tokens that carry the grant. Refresh
  never re-prompts and never re-binds.
- Connection: the account's single logical agent slot, claimed at binding.
- Binding: the connection's editor instance and Show. Ends with the window,
  the Show, release, revocation, or stale expiry. Ending it retires every
  unapplied request. An MCP HTTP stream is not the binding; stream turnover
  and idle periods do not end it.
- Request: one edit from submission to a terminal outcome. Cancellation wins
  only before the tab's application boundary; after that the outcome is
  applied and reversal is Undo. A late result after cancel, release, reload,
  or Show switch is refused and reported, never applied.

Panel actions map directly: Release ends the binding (and connection); Revoke
ends the grant. Sign-out ends everything for that account in that browser.
Transport loss is neither cancellation nor release; it is a feed state.

### D6. Stable operation identity; applied is not saved; stale is refused gracefully

Every edit request carries a stable operation id and the document revision it
was planned against. The tab admits it once, against the current revision, in
one serialized step; a duplicate delivery of the same id never creates a
second application, history entry, or save. When the base revision is stale,
because the author kept editing or the request queued behind slow inference,
the tab refuses with a reason the author can read ("that Clip moved while I
was working; I haven't applied this") and the agent may replan from current
state. Stale refusal is an expected outcome, not an error path.

Every accepted request shows as applied and then as saved, rolled back, or
superseded, under the store's existing recovery policy. The feed never shows
success on the strength of a model reply or a private commit. When the agent
loses the acknowledgement, it asks the server for the outcome by operation id;
reading the current document is for replanning, not a receipt. If the outcome
cannot be recovered the feed shows "outcome unknown" and the agent must not
resubmit automatically. #946 owns the revision, deduplication, and retention
policy this depends on.

### D7. Cost is disclosed, never fallen back to

With nothing connected the panel offers two choices, not a default: use the
built-in assistant for this Show (who pays and the remaining allowance), or
connect your own agent. Opening the panel or reading a past conversation
authorizes nothing and claims no slot; the explicit choice does. The connected
row always shows the payer: "PXLBLZ pays, N requests left today" or "your
agent pays (Claude Code)". Exhausted allowance or a down service is stated, and
the external route offered; nothing switches silently. An external agent that
drops is shown as dropped, and the built-in route offered as a choice after
the old connection is released. Built-in use reserves allowance per author and
bounds provider attempts; #956 owns the accounting.

### D8. No escape hatch

There is no arbitrary code, raw document patch, device Run/Save, or hardware
control tool on either path. The production tool surface is an explicit
allowlist over the finite command census (#947), not "whatever the diagnostic
MCP server registers".

### D9. Transient connection, cheap reattach

The connection is expected to drop: network loss, a closed laptop, a client
restart. Reattaching is one click. The identity grant survives the drop, so no
OAuth rerun; the author chooses Connect again in the Show's agent panel; the
client already has the server's instructions and reads current state through
the ordinary tools. Nothing from the previous binding is replayed. The panel
shows the dropped connection, and a new agent connecting after a drop looks
the same as a first connection.

### D10. An edit has an explicit boundary

An external conversation does not define a PXLBLZ request. The tools do:
begin an edit capturing editor context (selection, playhead, hovered Clip) at
that moment, one or more commands, commit. One commit is one request, one
operation id, one history entry. Deictic references ("that Clip") ground
against the captured context or an explicit id; ambiguity is a typed refusal
or a question, never a guess. #946 owns the transaction and admission detail.

## What this asks of the other issues

Inputs, not decisions made here.

- #956: PXLBLZ as an OAuth authorization server for MCP clients (today it is
  only an OAuth client to GitHub and Google; the consent page reuses the cookie
  sign-in); a persistent tab channel on the Worker (none exists; a Worker
  request cannot host a long agent loop, since `waitUntil` extends at most 30 s
  after the response); grant, credential, connection, and binding storage with
  server-side revocation and stale expiry; whether the built-in client is a
  literal MCP client or an adapter over the same application service; built-in
  allowance reservation; supported clients at launch.
- #946: revision-based admission, operation-id deduplication and its retention
  window, the outcome-lookup tool, gesture wait, and the stale-refusal wording.
- #947: the finite command census and the production allowlist.

## Deliberately not doing

Multi-tab arbitration, two simultaneous agents, agent-to-tab selection, a
pairing code, mirroring an external chat into the IDE, showing the agent's
reasoning in the IDE, automatic replay after any drop, cross-device or
multi-user editing (#802), and any client's own install or configuration
screens beyond one representative note per client.

## Verified and still to verify

Astra verified from primary documentation on 2026-09-06: MCP 2025-11-25
authorization (resource and authorization server separation, PKCE,
audience-bound bearer tokens on every request; dynamic client registration is
optional), transports and lifecycle (multiple streams, optional protocol
sessions, capability negotiation; elicitation cannot be assumed), and that
cancellation is advisory, so "cannot apply after cancel" must be enforced by
the document owner. Claude Code documents remote OAuth, elicitation dialogs,
and token refresh with a retry after 401 (which is why D6's operation id
matters). Codex documents remote OAuth login; its page does not establish
elicitation or progress presentation. Hosted Claude connects from Anthropic
infrastructure, so localhost proof is not hosted proof.

Still open, and qualification requirements rather than design claims: whether
each client shows a server-sent "waiting for approval" message while a call
is blocked; whether any client exposes its conversation lifecycle; token
lifetime and refresh behaviour per client.

## Astra review disposition (v1, 2026-09-06)

| # | Finding | Sev | Disposition |
| --- | --- | --- | --- |
| 1 | Initial target undefined with two tabs open; a grant shared by two client processes is not a binding | P1 | Accepted. D3: pairing initiated from the intended Show arms one window; binding keyed on client session and editor instance; atomic slot claim. Jon accepted 2026-09-06. |
| 2 | Lifetimes need dependency rules; revocation must retire admitted work; token refresh conflated with consent | P1 | Accepted. D5 rewritten with five lifetimes and explicit end rules. |
| 3 | Reading the document is not an application receipt; retry after lost ack can duplicate | P1 | Accepted. D6: operation id, outcome lookup, "outcome unknown", no automatic resubmission. |
| 4 | Feed omits rollback, superseded, draft-only outcomes the save policy produces | P1 | Accepted. D2 feed list extended. |
| 5 | External conversation does not supply a request boundary or grounded references | P1 | Accepted. New D10. |
| 6 | Proposal locks #956 choices (literal MCP self-call, authorization server, Durable Objects); Worker cannot host a long loop | P1 | Accepted. D1 restated as requirements; transport and hosting moved to the #956 inputs list with the 30 s constraint. |
| 7 | Exclusivity has no recovery when the bound window is unavailable | P2 | Accepted. D4/D5: release or revoke from any signed-in window, stale expiry. Jon accepted 2026-09-06. |
| 8 | "Wrong account fails at OAuth" and "three contracts preserved" overstate their evidence | P2 | Accepted. D3 shows and checks the account; D8 requires an explicit allowlist (#947). |

Reviewer questions: one-connection hides the sleeping-window case (resolved by
finding 7); in-window approval is sufficient given finding 1's checks and an
account-bearing prompt; start without reconnect grace (adopted in D4 and D9);
opening the panel must not authorize (adopted in D7).

## Next

State table pairing what the author sees with what the MCP client receives
for each feed state and connection state; the scenario matrix with document,
history, and persistence outcomes; a standalone HTML prototype under
`docs/plans/` in the app's visual language with guided walkthroughs; SVG state
and flow diagrams; then the roadmap, #946/#947/#956 scope notes, and the
external MCP delivery and qualification issues the gate requires.
