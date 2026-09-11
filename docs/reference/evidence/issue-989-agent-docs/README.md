# #989 Agent documentation slice

This inventory covers Agent editing only. The wider release sweep remains open:
Pattern, Map, Library, Mixin, Controller and release-campaign documentation are
not claimed complete here. README.md remains outside this slice.

| Document | Disposition and source |
| --- | --- |
| [Feature Guide](../../PXLBLZ%20Feature%20Guide.md#agent-editing) | Updated exact URL opt-in, both connection channels, timers, finite Retry, Dismiss, local retirement, allowance and Privacy navigation against the production drawer and MCP source. |
| [Privacy](../../PXLBLZ%20Privacy.md) | Added factual Agent content/provider/authorization processing. OpenAI primary data-controls source is linked; no tenant Zero Data Retention configuration is assumed. |
| [CONTEXT](../../../../CONTEXT.md) | Added connection/binding/session and operation/private-candidate/outcome terminology. |
| [Candidate application](../../contracts/agent-candidate-application.md#agent-drawer) | Removed obsolete diagnostic-only external attachment wording; preserved admission and qualification limits. |
| [Service decisions](../../../plans/agent-show-service-decisions.md) | Historical B2 status and provider dispatch versus local no-inference Retry clarified. |
| [UX design](../../../plans/shared-show-editing-ux-design.md) | Accepted handoff retained with current-contract pointers and separate qualification. |
| [MCP routing plan](../../../plans/agent-mcp-routing-slice.md) | Design history points to current implementation contracts. |
| [Historical baseline](../../agent-editing-baseline.md) | Preserved measurements; separated historical proposals from accepted policy and current behavior. |
| [Technical Reference](../../PXLBLZ%20Technical%20Reference.md), [OAuth/MCP](../../contracts/agent-oauth-discovery.md), [rendezvous](../../contracts/agent-rendezvous.md) | Inspected final MCP edits and retained them. No competing rewrite. |
| Docs catalogue | Existing Guide and Privacy routes suffice. Engineering-contract links intentionally resolve to repository main; publication remains held. |

## Proof

`consumer-facts.json` records the actual captured commit and managed isolated
runtime5209. Repository Playwright loaded the candidate's real docs route,
read the Agent section, activated Privacy by keyboard, checked the OpenAI
primary-source href and rendered its disclosure at desktop and720px. No page
runtime errors or narrow horizontal overflow were observed. Screenshots and
native manifests are committed under `.wrsp/ui-proof/989-*`.

The established in-app-browser discovery failure justified repository Playwright;
no endpoint interception or synthetic provider was involved in this docs journey.
The docs catalogue's five focused tests pass. Relative links in changed documents
were checked locally; external repository links are not represented as published.

The product behavior sources are the #957 built-in evidence and #963 local MCP
packet. The latter uses real local OAuth/channel/admission/persistence with a
synthetic callback client. No paid provider, real external-client version, hosted
connector, deployed endpoint or physical Controller qualification is claimed.
#964 owns client qualification. Root owns final suites, review and landing.
