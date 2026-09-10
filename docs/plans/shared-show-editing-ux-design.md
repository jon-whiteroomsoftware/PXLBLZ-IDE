# Shared Show editing: accepted interaction design (#959)

Status: Jon accepted the drawer on 2026-09-10 and the coordinating Astra review corrections later that day. Fable authored the original design; Astra reviewed it directly, without a Fable self-review. This document specifies intended behavior, not shipped capability.

The primary interactive artifact is [agent-drawer-prototype.html](agent-drawer-prototype.html). The older shared-show-editing prototype, proposal, diagrams and captures are historical design evidence; they do not override this document. #946 owns admission, #947 canonical commands, #956 service policy, #957 the shared drawer and built-in service, #963 external MCP, #964 client qualification and #958 release acceptance.

## Review corrections accepted by Jon — 2026-09-10

This section is the current implementation contract and supersedes conflicting earlier design/history below. The drawer layout stays as accepted. The primary prototype is `docs/plans/agent-drawer-prototype.html`; its simulated reducer is design evidence, not production admission or persistence code.

- **Retry / Dismiss:** a supported built-in Retry creates a new operation with `retryOf`, captures current state, preserves the resolved intent/target and unrelated composer draft, and passes ordinary admission. The original failure remains unchanged. Dismiss removes recovery actions only; it never relabels a rollback as cancellation or saving success. External failures offer Dismiss and “Ask your agent to try again from current state”; v1 does not start external inference from the drawer. Retry has no countdown and never replays an old candidate.
- **Lost contact:** HTTP/stream loss preserves the logical binding, operation identity and known applied/save outcome. Show “contact lost” independently of the edit's outcome. Restoring contact queries `get_outcome` for the same operation, with no automatic replay or new paid dispatch. A confirmed ended binding retires unapplied work; local Disconnect/Forget, departure, reload, sign-out and stale expiry remain end conditions. Already-adopted saves settle normally. Unavailable receipts say “outcome unknown”, never “cancelled” without evidence. Session-only receipts remain unchanged.
- **Cross-window recovery deferred:** Disconnect and Forget from another signed-in window belong to #1002, outside v1.9 implementation/qualification/release gates. V1 retains one account slot, refuses competing attachment and offers local-window Disconnect/Forget. A sleeping/crashed binding is released by the existing bounded stale-binding expiry; no automatic takeover is added. Another window may explain the occupied slot, but has no remote recovery controls.
- **Gesture wait:** within the existing five-second wait, cancelling a gesture without a committed edit allows the candidate's eligibility recheck; committing a conflicting manual edit changes the revision and refuses the whole-Show candidate. The prototype demonstrates both, not guaranteed application after a drag.
- **Setup timers:** arming lasts 120 seconds; an incoming call waits 30 seconds for Answer. These do not limit an established editing session or inference. Expiry returns the typed no-live-editor/Connect guidance without applying anything.
- **Unread outcomes:** count distinct operation outcomes changed while tucked, not working/read/system events. Opening clears the unread set; a later save failure becomes unread again even when application was previously seen. Preserve the actual outcome text.

Required implementation proof: original failed entry plus a new retry identity; intervening manual change and unrelated composer draft preserved; Dismiss leaves outcome/document/history unchanged; external failure starts no IDE-side inference; lost contact before application and after application/before save acknowledgement; same-session lookup and unknown after session loss, with no duplicate adoption or paid dispatch; gesture cancellation, committed conflicting drag, and five-second expiry; 120-second arming and 30-second call expiry; occupied-slot refusal without cross-window controls. Browser assertions inspect visible activity plus complete Show/history/save results. Prototype simulations do not qualify real MCP clients or production persistence.

## Drawer and attribution

**Surface.** The agent drawer: a right-edge mirror of the entity drawer (same 22 px edge tab with a vertical AGENT label, same tucked / open-overlay / pinned modes, hover-open, click-away and Escape tuck an overlay, pin persists). Width 340 px. Header row is the entity drawer's 40 px row: "AGENT" label, spacer, a ⋯ menu, the pin as a 26 px HeaderAction with the Lucide pin filling when pinned. No close button. The edge tab is hidden whenever the drawer is open or pinned. Choosing an agent pins the drawer if it was open; the author may tuck it afterwards.

**Anatomy, top to bottom.** (1) Identity: the agent's name once, 14 px semibold, a status dot before it, an unplug icon button (Controller `DisconnectGlyph`, 24 px bordered square) at the row's right; one status word beneath (connected, working, thinking, waiting for you to finish, contact lost); an actions row only when needed (Restore contact when contact is lost; Connect again only after a confirmed ended binding, Cancel while working). (2) ACTIVITY as a pure header with "Nothing yet." beneath when empty. (3) One stream: for the Pixelblaze agent the author's messages, its replies and its actions interleaved; for an MCP agent the actions alone. (4) A one-line composer, Pixelblaze agent only. No boxes; sections are divided by seams.

**Stream lines.** An action line is a small dot, the intent text, and a state word at the right: working, waiting for you, applied, saved, not applied, rolled back, superseded, cancelled. Change details are one quiet indented line per command-change description from the registry. System lines (connected, reading the Show, contact lost) are muted and never repeat the agent's name. Refused and rolled-back lines are red. Supported built-in failures offer Retry and Dismiss; external failures offer Dismiss and guidance to ask the agent to try again. MCP call names are hidden by default; "Show MCP calls" in the ⋯ menu appends them in small teal mono under each line. It is a debugging view.

**Empty state.** Two rows, no note: "Use the Pixelblaze agent. Ask for edits here. It works on this Show with you." and "Connect an MCP agent. Claude Code, Codex, or a Claude connector edits this Show from where you already talk to it." The word "assistant" is not used anywhere; both kinds are agents. No payer, allowance or cost language anywhere in v1.9 (D7's disclosure is deferred until a paid path exists).

**Arming.** "Point your agent at", the MCP URL as a selectable block, a collapsed "How to add an MCP server" fold-out with the Claude Code and Codex commands each with a copy button and the Claude connector steps, then "Then ask it to edit this Show. Once it connects you can close this drawer." and a Cancel button.

**The call (knock, D3 amendment).** With nothing connected, an authenticated agent's call opens the drawer as an overlay with an amber-ruled section: "Claude Code is calling. It wants to edit this Show from here." with Answer (primary) and Not now. Answer arms and binds in one click. The edge tab rings amber and reads ANSWER while a call is held. Jon: "looks really nice."

**Verbs.** Disconnect is the one verb, as the unplug icon button. "Forget this agent" (server-side revoke) lives in the ⋯ menu for MCP agents only. Release/revoke wording is retired.

**Edge tab states (the only tucked-state signal).** Dot: none when nothing is connected; agent colour when connected; amber pulsing while working; amber while waiting for a gesture; hollow when dropped; red after a refusal or rollback. Label: AGENT, WORKING, WAITING, ANSWER. A count badge for outcomes that landed while tucked, red when the latest was a refusal or rollback; cleared when the drawer opens.

**On-entity highlights (the applied signal).** Stroke carries the meaning and colour reinforces it, so the vocabulary survives colour collisions with the timeline's amber live, blue Clip accent, indigo automation and orange markers (Jon, 2026-09-10): solid outline is the author's selection (amber), dashed outline is something the author is moving (amber), and a double outline (`3px double`, 1 px offset) means an agent touched this entity. When an edit applies, every entity named in the change list gets the double outline in the agent colour with a brief glow (about two seconds) that fades and leaves the double line. Timeline-wide commands (insert time, set Show end) draw a band with double-ruled edges at the affected time instead of outlining every Clip. Outlines clear when the author touches that entity, makes any manual edit, or undoes. A stale refusal draws the double outline in red on the targeted Clip. No toast, no auto-scroll, no focus change; off-screen changes stay off-screen. The header status chip in the prototype is not built. The purple line under the main lane in the prototype is the existing speed automation track, static scenery.

**Agent colour.** Violet `#c4b5fd` (Jon, 2026-09-10: "the best of the three, and it's quite visible"). Dim variant `rgba(196,181,253,.18)` for the glow and the band fill. It sits near the indigo automation track and the Transition glyph, which is why the double stroke, not the colour, carries the meaning.

**Activity states.** Pixelblaze agent: sending, thinking (streamed), working, waiting for you, then terminal. MCP agent: derived from tool calls only: reading the Show, working (begin to commit), waiting for you, then terminal; otherwise connected. The drawer never claims thinking it cannot see.

**Flows confirmed.** S1 Pixelblaze agent first time; S2 MCP agent IDE-first; S3 the call; S4 stale refusal and replan; S5 gesture wait; S6 rollback and retry; S7 timeline-wide band; S8 drop, reconnect, disconnect. The updated prototype adds separate gesture outcomes, expiry, dismissal and lost-contact recovery walkthroughs; simulation is not live qualification.

## Connection and request state

One agent binds one account slot to one live editor instance and Show. The feature requires the exact accepted `?agent=1` gate and authenticated allowlisted ownership. OAuth identity grants and the transient Show binding are separate. Explicit Disconnect preserves the identity grant; Forget invalidates it server-side. V1 performs those actions only from the bound window; #1002 owns cross-window controls.

IDE-first: choose Connect an MCP agent, arm for 120 seconds, then the first authenticated live-editor call claims the slot atomically. Agent-first: an authenticated call with no armed window is held for 30 seconds and shown in open eligible Show windows; Answer atomically binds the chosen window, while Not now/expiry returns the typed refusal. Simultaneous Answers cannot bind two windows. Competing attachments refuse without retargeting or changing the existing connection.

OAuth uses authorization-code/PKCE, account-naming consent, resource-bound access tokens, refresh and server-side revocation on the existing Cloudflare platform. Access-token refresh can preserve a valid grant; grant expiry/revocation invalidates routing and retires unapplied work. Every routed edit rechecks account, scope, Show and editor instance. Client interoperability is qualified separately; no portable setup flow is claimed from the mock-up.

| State | Drawer and client meaning |
| --- | --- |
| None | Two agent choices; no work starts until explicitly chosen. |
| Arming / incoming call | Setup UI plus Cancel or Answer / Not now; the accepted setup deadline applies. |
| Connected | Agent name, status and local Disconnect; external Forget in the menu. |
| Working | Built-in progress from its owned loop; external progress from observed tool calls only. |
| Waiting | Candidate awaits actual manual input settlement, with Cancel and the five-second deadline. |
| Applied, saving | One accepted edit/history entry; save is still pending. |
| Saved / draft | Durable save versus an in-memory stock draft are explicitly distinct. |
| Refused | Typed reason and unchanged manual state/history; no agent write. |
| Rolled back / superseded | Actual store settlement, never guessed from network status or highlights. |
| Contact lost | Binding and known operation outcome retained; Restore contact checks the same operation. |
| Outcome unknown | Receipt unavailable; no automatic resubmission. |
| Cancelled / retired | Confirmed pre-application cancellation or ended-session work; cannot erase an adopted save. |
| Connected elsewhere | Occupied-slot explanation only in v1; remote Disconnect/Forget deferred to #1002. |

A request captures operation/session/Show identity and context before inference, builds a private candidate, then passes authoritative admission. A model saying it finished is not application. Duplicate delivery reads the same receipt; altered identity or stale/conflicting state refuses. A retry is a new operation linked to the failed one. Session departure/reload retires pending work and clears the session transcript; already-adopted saves retain ordinary ownership. No grace queue, retargeting, automatic replay, hardware actions or raw-patch escape hatch is introduced.

The drawer and its highlights render the admission owner's typed change list and persistence events. They never apply records or implement rollback themselves. Manual editing, Undo/Redo and save remain available when agent access is disabled, refused or unavailable. Tucking the drawer does not end a session or clear a draft.

## Service policy and unavailable states

[agent-show-service-decisions.md](agent-show-service-decisions.md) records the accepted policy. Built-in service uses exact Luna/high, the existing protected OpenAI credential, account allowlisting, throttling and a shared $10/day allowance. These are backend constraints; v1 has no payer, price, allowance-counter or model-picker UI. Exhaustion/provider unavailability uses a truthful “Pixelblaze agent unavailable” state and disables submission; manual editing remains available and switching to an external agent is explicit. Opening the drawer never authorizes a paid call. External conversations stay in the external client. A built-in clarification appears in the same stream; no external thinking/clarification state is invented without an observed event.

## Qualification scenario matrix

These stable S1–S21 identifiers belong to the original qualification matrix. The drawer prototype has separately named walkthroughs; it does not simulate every qualification row. #1002's cross-window actions are excluded from v1 qualification, while single-slot refusal remains required.

| # | Scenario | Author sees | External client result | Document / history / persistence |
| --- | --- | --- | --- | --- |
| S1 | Built-in: open, clarify, edit, save, undo, focus returns | Choice, conversation, question, applied then saved, Undo restores, focus back on the timeline | n/a | +1 history; saved; undo restores the prior record |
| S2 | External: pair, verify target, discover commands, edit, applied and saved, disconnect, reconnect | Arming, row with Show, applied then saved, disconnected, Connect again, row | Connection summary; `list_tools`; `applied` then `saved`; `no_live_editor`; new summary | +1 history; saved; second session starts from current revision |
| S3 | Wrong, expired or revoked pairing | Panel unchanged (wrong); "revoked" line (revoked) | `wrong_account`; 401 then OAuth; 401 | Untouched |
| S4 | Wrong account or session | Panel unchanged | `wrong_account` / `no_live_editor` | Untouched |
| S5 | Two tabs | Second tab: occupied-slot explanation; cross-window actions deferred to #1002 | Unchanged | Untouched |
| S6 | Navigate away and back during a request (baseline D) | On return: None, "Connect again"; old work retires; the new session does not restore its transcript | `retired` for the old op; `no_live_editor` after | Untouched; the late candidate never applies |
| S7 | Reload | Same as S6 | Same as S6 | Untouched |
| S8 | Cancel, then a late response | Cancelled | `cancelled`; late result `retired` | Untouched |
| S9 | Duplicate or retried delivery | One feed entry | Second `commit_edit` with the same op returns the original outcome | Exactly one history entry and one save |
| S10 | Manual drag or field edit during inference (baseline A, C) | Manual edit stays; agent entry "Refused: the Show changed while I was working" | `stale_base` with current revision | Manual edit preserved and saved; no agent history entry |
| S11 | Two agent candidates on one base | First applied; second refused stale | `applied`; `stale_base` | +1 history |
| S12 | Manual undo while a candidate waits | Undo applies; the candidate is stale | `stale_base` | Undo's record is current |
| S13 | Target Clip deleted during inference (baseline B) | "Refused: that Clip no longer exists" | `target_gone` | Untouched |
| S14 | Gesture active when the candidate arrives | "Waiting for your drag to finish", then applied or refused | `applied` or `stale_base` after the bounded wait | Depends on whether the drag changed the base |
| S15 | Save fails after visible application (baseline E) | "Save failed, change rolled back", supported built-in Retry and Dismiss; external retry guidance | `save_failed`, `rolled_back: true` | Store restores the durable record and matching history |
| S16 | Save fails after a later manual edit | Agent entry "Superseded" | `superseded` | Later edit owns the outcome |
| S17 | Transport loss after application, before acknowledgement | Feed shows the true outcome (applied, saved) | On reconnect, `get_outcome(op)` returns it; if outside the ledger window, `unknown` | Applied and saved; no replay |
| S18 | Built-in allowance exhausted or provider down | Row states it; composer disabled; external route offered | n/a | Untouched |
| S19 | External agent unavailable | Row "contact lost"; restore contact and query existing outcome; choose another agent only after explicit Disconnect | n/a | Untouched |
| S20 | Stock Show draft | Applied entries read "Applied (draft, not saved)" | `applied` with `persistence: draft` | In-memory draft only; no personal write |
| S21 | Keyboard-only, narrow window | Panel reachable by Tab; Escape collapses and returns focus; announcements read outcomes; no trap | n/a | Untouched |


## Implementation handoff and proof

#957 candidate 1 introduces the pure drawer state model, shared right-edge drawer mechanics, thin agent components and timeline attribution, driven by the existing diagnostic bridge with no paid calls. #957 candidate 2 replaces that transport with the authenticated built-in service. #963 implements OAuth, `/mcp`, live-tab routing, single-slot binding, timers, held call, optional one-line `intent`, activity events and outcome lookup; it reuses the same drawer and admission owner.

Production tool definitions derive from SHOW_COMMANDS through the shared descriptor adapter. Typical surface: `get_connection`, `list_commands`, `read_show`, `get_context`, `begin_edit`, allowlisted semantic commands, `commit_edit`, `get_outcome`, `cancel_edit`. Intent is display metadata, not a command or authorization grant. No diagnostic generic patch/grammar escape hatch is promoted.

Read the existing agent-candidate-application, show-command-semantics and show-state-history-persistence contracts before implementation. Keep those as-built references truthful and update them only with implemented evidence. The original proposal and review retain source provenance; conflicting historical layout/payer/cross-window requirements are superseded here.

Engine tables cover each state transition, unread operation accounting, highlight clearing, retained failure and fresh retry, cancellation/retirement, lost contact and known/unknown outcomes. Store/real-route checks assert complete Show and history, actual save requests and reopened `.pxlshow`/`.epe` artifacts. Include all finite cases in the accepted correction section plus S1–S21, excluding only the explicitly deferred cross-window actions. Rendering tests alone never prove admission or durability.

Browser proof captures tucked, empty, arming, call, working, waiting, applied/saving, saved, refused, rolled back, contact lost, unknown, and pinned built-in conversation. Exercise desktop and narrow resilience, keyboard, focus, console and announcements. External qualification pins each supported client's version and observes OAuth, tools, notification support, expiry/revocation, duplicate/stale delivery and acknowledgement loss. Hosted Claude requires a real reachable endpoint; localhost proof is insufficient. Production and release acceptance remain separate from prototype checks.

## Accessibility and keyboard

The Agent edge tab is keyboard reachable and exposes connection/status/unread meaning in its accessible name. The drawer is a labelled region, not a modal dialog; no focus trap is introduced. Terminal outcomes use polite live announcements, progress does not flood them. All icon buttons have accessible names. Overlay Escape/click-away tucks it while respecting existing editor/portal keyboard ownership; pinned state remains deliberate. Composer drafts and selection survive unrelated activity and retry/dismiss. New activity does not steal timeline focus or scroll the timeline. Reduced motion removes pulsing/glow motion while retaining stroke and text meaning.

Prototype source checks are reproducible with `node scripts/check-agent-drawer-prototype.cjs`. They cover the scripted walkthroughs and targeted save-ownership, operation-identity, history and edge-state regressions; they do not replace browser or production qualification.

## Remaining qualification limits

Runtime/route and per-client interoperability remain implementation evidence, not assumed support. The stale-binding lifetime and resource bounds must be concretely qualified under #956's existing engineering authority; the 120/30-second setup timers are already decided. Narrow layouts are resilience, not a new phone editor design. Cross-window recovery is explicitly deferred to #1002.
