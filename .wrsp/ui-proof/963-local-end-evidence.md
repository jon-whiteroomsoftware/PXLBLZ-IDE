# Local Forget correction proof (#963)

Source: `a873e5b15ed158c2e3eac1f40e0de56b1071b4df`, on landed docs `5980a833`.

Repository Playwright/Chromium drove the managed isolated editor on port 5207.
The actual channel handler and AgentAccount ran in a workerd sidecar; synthetic
authentication and a trusted external claim were fixtures, and the OAuth
authority was explicitly unavailable. Personal persistence used the real managed
D1. No OAuth grant, provider inference or external client qualification occurred.

The real admission receipt entered active-input waiting. Local Forget cancelled
it before input release. The complete Show and durable record stayed equal to
the original, with zero history entries and zero save requests. The owned slot
ended; the chooser and actionable “Disconnected, but this agent could not be
forgotten” message were visible at 1440px and 800px. No page errors occurred.
Both images were opened and inspected. Cleanup left the exact fixture window.

The actual-route runtime regression was red in all four cases before repair:
failed revocation, ACK callback ordering, leave callback ordering, and lost
request followed by Disconnect. All four now pass. Focused lifecycle, relay,
ordering, owner and message coverage: 45 tests / 6 files passed. Normal source
hooks: 107 tests / 11 files plus lint and TypeScript passed. Wrong-window refusal
and no executor resurrection are included. Root owns final suites and review.

Local reproduction harness: `/tmp/963-local-end-proof.cjs`; sanitized observations:
`/tmp/963-local-end-proof/observations.json`. The committed runtime test retains
the repeatable injected authority/owner boundary. Initial harness-only JSON
output and envelope mistakes were corrected before successful consumer proof.
