# Astra Medium review of the #959 behaviour proposal v1

Model `gpt-6-astra`, reasoning effort medium, read-only Codex exec session, 2026-09-06.
Reviewed `docs/plans/issue-959-shared-editing-ux-proposal.md` at v1; disposition is recorded in that document at v2. Verbatim output follows.

---

**Verdict: proceed with the listed changes.** The direction is viable, but target selection, request retirement, duplicate handling, and persistence outcomes need correction before detailed design depends on them.

**Findings, most consequential first**

1. **P1 — D3–D5: the initial target and the exclusive “connection” are undefined.**  
   Open two editable tabs before connecting an agent. D3 asks “the account’s live editing tab,” but there are two; D4 only handles a tab opened after a connection exists. Separately, two client processes can use the same OAuth grant: a binding containing only grant/tab/Show/scope does not distinguish them. An arbitrary tab choice or grant-wide routing would undermine the promised destination.

   **Smallest change:** define one exclusive *logical editing connection*, associated with a particular client session and an approved editor instance. Refuse initial pairing when the destination is ambiguous, or require the author to initiate pairing from the intended tab. Approval must atomically claim the slot and recheck account, editor instance, Show, scope, and pending attempt. Expired approval prompts cannot create bindings. This preserves one-connection-per-account without introducing multi-tab arbitration. MCP HTTP streams are not this exclusive connection. [MCP transports, “Session Management”](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

2. **P1 — D5: the lifetimes need dependency rules, not “none implies another.”**  
   A request passes server authorization; the author revokes access or disconnects the binding; its candidate later reaches the tab. D5 explicitly retires requests on cancel/reload/Show switch, but does not say revocation or disconnection retires already-admitted work. Checking only the revoked client’s *next* request is insufficient.

   “Grant (OAuth token)” also conflates authorization with an expiring credential. Token refresh need not require new consent or a new target binding.

   **Smallest change:** distinguish grant, access/refresh credentials, logical connection, binding, and edit request. Revocation invalidates the grant’s refresh path, bindings, and unapplied requests; ending a binding retires its unapplied requests. Define logout/account-change behavior too. Cancellation wins only before the authoritative application boundary; afterward the outcome is applied and reversal uses Undo. Assign enforcement to #946/#956. The current seam has neither cancellation nor request retirement. [Agent contract, “Present limits”](/Users/voidstar/src/pixelblaze-v2/docs/reference/contracts/agent-candidate-application.md)

3. **P1 — D6: reading the current document cannot resolve acknowledgement loss or prevent duplicates.**  
   The agent inserts five seconds, application succeeds, and the acknowledgement disappears. The author subsequently undoes that edit. Reading the document now cannot distinguish “never applied” from “applied and undone.” A retry with a fresh request identifier can insert time again. Even without Undo, duplicate delivery needs an explicit admission rule.

   **Smallest change:** require a stable edit-operation identity and a queryable application outcome, independent of the transport request identifier. Duplicate submissions must never create another application, history entry, or save. When the outcome cannot be recovered, report uncertainty and prohibit automatic resubmission. Reading current state supports replanning; it is not an application receipt. #946 owns the exact deduplication and retention policy. The roadmap explicitly requires retries not to duplicate transactions; existing commands are not generally idempotent. [Roadmap, “Waypoint 2”](/Users/voidstar/src/pixelblaze-v2/docs/plans/shared-agentic-show-editing-roadmap-prd.md); [Command contract, “Agreement”](/Users/voidstar/src/pixelblaze-v2/docs/reference/contracts/show-command-semantics.md)

4. **P1 — D2/D6: the feed omits outcomes the existing save policy produces.**  
   An agent edit applies, its personal save fails while still current, and the store restores the durable record **and matching history**. “Applied → save failed” does not tell the author that the change disappeared or that its undo entry was restored away. Conversely, a superseded failed update can resolve without that candidate having saved. A stock draft never attempts personal persistence.

   **Smallest change:** distinguish application events from current document presence and persistence status. Include “save failed; change rolled back,” “superseded,” and “draft only.” Retry creates a new adoption under the existing recovery policy; dismiss only removes the notice. Do not promise every accepted request eventually becomes saved/save-failed. Sequence G proves the draft case; current sequence E already proves corrected recovery. Sequence H additionally shows that saved does not mean the preview succeeded. [State contract, “Personal saves and recovery”](/Users/voidstar/src/pixelblaze-v2/docs/reference/contracts/show-state-history-persistence.md); [Baseline, “Historical observed outcomes”](/Users/voidstar/src/pixelblaze-v2/docs/reference/agent-editing-baseline.md)

5. **P1 — D1/D2/D6/D8: an external conversation does not automatically supply a PXLBLZ request boundary.**  
   An external agent interprets “resize and dim” as two tool calls. Does that create one edit or two? When does PXLBLZ capture “that Clip”: when the person speaks externally, when context is read, or when the mutation arrives? The IDE cannot observe external thinking, questions, or cancellation before a PXLBLZ operation exists. One connection also does not prevent two overlapping candidates from that client.

   **Smallest change:** define a bounded PXLBLZ edit transaction, captured editor context, explicit submission/completion, and structured application receipt. External conversation turns remain outside that contract. Require explicit target identities when external context cannot reliably ground a deictic reference. Show “asked a question” only when reported through a supported structured outcome; otherwise say where the author should continue. #946 owns transaction/admission details and #947 the tools. Existing `begin_edit`/`commit_edit` operate on private sessions, not the live editor. [MCP server, transaction tools](/Users/voidstar/src/pixelblaze-v2/src/agent-harness/mcp/showsServer.ts:288); [Agent contract, “Ownership and acceptance”](/Users/voidstar/src/pixelblaze-v2/docs/reference/contracts/agent-candidate-application.md)

6. **P1 — D1/D3/D7: the proposal locks implementation choices that #956 explicitly owns.**  
   Literal MCP self-calls do not establish shared semantics: both callers could still bypass the same admission checks or receive different validation. “Worker runs on PXLBLZ’s account” also mixes the inference payer with the author whose document is authorized. Finally, a Worker request is not an indefinitely surviving agent process: disconnect can interrupt orchestration and accounting.

   **Smallest change:** lock shared commands, author-scoped admission, explicit payer, and bounded service use. Treat literal built-in MCP transport, operating an authorization server, and Durable Objects/WebSockets as candidates for #956, unless Jon explicitly moves those decisions into #959. A built-in adapter calling the same application service may be simpler. Require per-author allowance reservation and bounded provider attempts; an MCP tool-call count alone is not an inference budget. Cloudflare documents a maximum 30-second `waitUntil()` extension after an HTTP response/disconnect. [Cloudflare context documentation](https://developers.cloudflare.com/workers/runtime-apis/context/)

   The proposal correctly names today’s missing infrastructure: current auth implements GitHub/Google client flows and signed session cookies, and the Worker configuration has D1 but no Durable Object binding. [auth.ts](/Users/voidstar/src/pixelblaze-v2/src/cloudflare/auth.ts); [wrangler.jsonc](/Users/voidstar/src/pixelblaze-v2/wrangler.jsonc). Ownership remains explicit in [#959, “Service and cost choice flow”](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/959).

7. **P2 — D4/D5/D7: exclusivity has no usable recovery path when the original window is unavailable.**  
   A sleeping laptop retains the binding; the desktop offers nothing; the external agent becomes unavailable. D7 offers built-in assistance, but D4 forbids starting it. Closing a crashed tab cannot reliably deliver a release message.

   **Smallest change:** expose authenticated disconnect/revoke management from another signed-in window, plus bounded stale-binding expiry. Switching services explicitly retires the old connection before acquiring the new one. This is release and reapproval, not concurrent editing or automatic takeover. Distinguish “authorized,” “editor reachable,” and “request outstanding”; an idle external agent need not hold an open stream. Also disclose that the connection limit does not protect against manual saves from another tab: cross-client persistence remains outside the existing contract. [State contract, “Known limits and discrepancies”](/Users/voidstar/src/pixelblaze-v2/docs/reference/contracts/show-state-history-persistence.md)

8. **P2 — D3/D8: two assurances are stronger than their evidence.**  
   OAuth can authenticate the wrong account successfully if that is the account selected in the browser. It cannot infer the account the author intended. Similarly, preserving “the three contracts” does not itself enforce the no-escape-hatch rule: the diagnostic server registers the whole grammar, including generics, and exposes `measure_show`, which executes generated Pattern code.

   **Smallest change:** replace “wrong account fails at the identity grant” with explicit account confirmation and account-equality checks throughout routing. Show account and distinguishable destination alongside client identity; a client-supplied display name alone is insufficient. Require an explicit production tool allowlist excluding generic patches and execution surfaces; #947 owns its contents. The diagnostic server is evidence of MCP exposure, not a production server ready to publish. [MCP server, `measure_show` and grammar registration](/Users/voidstar/src/pixelblaze-v2/src/agent-harness/mcp/showsServer.ts:127); [Harness README, opening scope](/Users/voidstar/src/pixelblaze-v2/src/agent-harness/README.md)

**Answers to the four reviewer questions**

1. **One connection hides a common case:** a sleeping/crashed original window, or returning to inspect the built-in conversation while an external agent is connected. Keep exclusivity, but allow remote release and read-only conversation inspection. The important simplification is one active editing authority, not inaccessible management.

2. **In-window approval can be sufficient without a pairing code**, provided finding 1’s binding checks hold and the prompt confirms account, actual client identity, and destination. OAuth alone does not exclude an unintended account. Reject ambiguous targeting rather than selecting a tab silently.

3. **Start without reconnect grace.** Reload and lost editor bindings require reapproval. Ordinary MCP stream turnover must not count as losing the editor binding. If brief editor-channel recovery later proves necessary, preserve the exact binding identity and refuse new mutations during uncertainty; never replay commands automatically.

4. **Opening the generic panel should not authorize editing.** An explicit “Use built-in assistant for Redline” choice can authorize it without another approval prompt, after cost disclosure. Opening or inspecting conversation should neither dispatch paid inference nor unexpectedly claim the account’s exclusive slot.

**Primary-documentation checks versus reasoning**

- **Verified — MCP authorization, 2025-11-25:** resource-server/authorization-server separation, discovery metadata, PKCE, audience-bound bearer tokens, and authorization on every HTTP request. DCR is optional; it is not a universal prerequisite. This does not establish browser-tab binding. [Authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- **Verified — MCP transport/lifecycle:** Streamable HTTP supports multiple streams, optional protocol sessions, and response redelivery. Initialization negotiates capabilities; elicitation cannot be assumed without negotiation. Transport loss is not cancellation. [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- **Verified — cancellation:** MCP cancellation is advisory and subject to completion races. Strong “cannot apply after cancellation” behavior must be enforced by PXLBLZ’s document owner. [Cancellation specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation)
- **Verified — Claude Code documentation:** remote OAuth, DCR/CIMD/preconfigured client registration, elicitation dialogs, and token refresh with a request retry after a 401 are documented. That retry reinforces the need for safe operation identity. [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- **Verified — Codex documentation:** remote MCP OAuth login and DCR/CIMD/preconfigured registration are documented. The inspected CLI page does not establish elicitation or progress-message presentation; I did not infer those from app-server capabilities. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- **Verified — hosted Claude documentation:** connector calls originate from Anthropic infrastructure; OAuth registration and refresh behavior are documented. Localhost proof would not qualify this path. [Remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Connector authentication](https://claude.com/docs/connectors/building/authentication)
- **Reasoned:** the failing sequences and proposed corrections above are design analysis, not executed interoperability tests. No source establishes that every client displays “waiting for approval,” exposes its conversation lifecycle, or supports the proposed targeting ceremony. Those remain qualification requirements.

**Not reviewed**

- No prototype, accessibility walkthrough, state diagrams, or implementation tests were executed.
- No live OAuth, revocation, hosted-client, Worker-channel, or billing integration was exercised.
- No detailed #946 admission algorithm or #947 command census was selected.
- This reviews the behavior proposal, not completion of #959. Its external-MCP delivery and qualification tickets must still be linked before the gate closes.

No files were edited, created, or staged.