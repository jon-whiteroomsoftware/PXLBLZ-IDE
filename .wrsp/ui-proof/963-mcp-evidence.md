# Local MCP proof, #963

This is repository Playwright 1.60.0 / Chromium proof against managed isolated
runtime 5208. The in-app browser was unavailable after discovery and two selection
attempts. OAuth, MCP, tab channel, private executor, editor admission, history and
D1 persistence were real. Only the preregistered synthetic client's callback UI
was fulfilled by the harness. No provider call, paid inference, hosted client,
production deployment or #964 interoperability qualification was performed.

## Current source

Source `f03286b59972bc05c230ccf9aa6ca8cb13ca43e0`, stacked on landed connection
observation corrective `fdc6f94aa42a8f6b007747d13bfb1d5828ed2084`:

- [Forget](963-mcp-forget.png): real private rename entered input waiting;
  local Forget cancelled it, restored the chooser and revoked the bearer (401).
  No history, save or durable Show change occurred.
- [Grant revocation while waiting](963-mcp-revoke-waiting.png): refresh-token
  revocation at the issuer's advertised `/oauth/token` endpoint returned 200;
  the original browser acknowledged `editing_ended`. Releasing the controlled
  real editor activity token afterward produced no adoption/history/save.
- [Grant revocation after adoption](963-mcp-revoke-saved.png): the saved receipt,
  renamed durable Show, one history group and one save survived revocation and
  browser retirement acknowledgement. The bearer was refused afterward.
- [Consent desktop](963-mcp-consent-desktop.png) and
  [390-pixel consent](963-mcp-consent-narrow.png): current verified Local Agent 11
  account and requesting Local test agent visible; keyboard focus, no overflow,
  actual Cancel with `access_denied`, no page errors. No grant was created by this
  ancestry refresh. Allow/code exchange was exercised in the retirement run.
- [800-pixel drawer](963-mcp-narrow-800.png) and
  [390-pixel drawer](963-mcp-narrow-390.png): read-only keyboard-opened, settled
  content visible. Document widths 801/391 match the same editor with opt-in
  omitted. Existing toolbar clipping at 390 is not mobile-editor qualification.

The retirement run passed all three data/receipt assertions before a later blanket
390-pixel overflow assertion failed. That assertion was separately diagnosed by
the baseline comparison above; no OAuth/edit matrix was replayed for diagnosis.
The final fixture used pre-provisioned synthetic `github:local-agent-11`, explicitly
allowlisted through the existing nonsecret development binding. Its own window
was left and its retained refresh token revoked in `finally`.

## Earlier observed core, not relabelled as current-source captures

At `acd46c01db6bcb8c41fa193c150fb6fbc310cb23`, synthetic Local Agent 09 completed
consent Cancel/Allow, code exchange, all 53 advertised tools, personal and stock
private renames through actual endpoints. Current Show reads remained unchanged
before commit. Personal adoption produced one history group, one save and the
renamed durable list result; stock adoption produced one history group and zero
personal saves. [Personal private](963-mcp-core-personal-private.png),
[personal applied](963-mcp-core-personal-applied.png),
[stock private](963-mcp-core-stock-private.png), and
[stock draft](963-mcp-core-stock-applied.png) retain that source provenance.
The personal captures were refreshed by a later run that passed its personal
assertions before a subsequent fixture failure; they are not current-tip proof.
Waiting Cancel and Disconnect also preserved the original Show with zero saves.
These facts were not repeated as a full matrix after the connection-only rebase;
the changed connection/retirement flows were exercised on current source above.

Early fixture failures used an unsupported single-Show GET, a client timeout equal
to the 30-second incoming hold, and the wrong guessed revocation URL. Repeated
full navigations exhausted eight registrations until normal 300-second retirement;
unretained grants later reached the eight-grant limit (Allow POST 429,
`temporarily_unavailable`; isolated read-only grant count eight). Old fixture state
was preserved. No limit was changed, no grant reset occurred, and no cross-window
release was used. The corrected harness uses discovery, a longer client timeout,
observed registration readiness, explicit own-window leave and retained-token
revocation. No credential or private header is included here.

## Focused qualification and limits

Current integration: TypeScript and 68 tests across 10 affected files passed,
including actual workerd positive/negative response ordering, OAuth/MCP, relay,
private admission and refusal recovery. Earlier full focused packet passed 155
checks across 16 files, including the real 31-second expiry case.

All 40 stock captures were measured. Largest representative was
`stock-show-showcase-redline-installation`: 30,174 UTF-8 Show/context bytes and
458,346 retained capture/source bytes. Arbitrary personal Shows may exceed the
1 MiB read or 16 MiB capture ceiling and are explicitly refused, never truncated.
The 100-character configured client-name bound yields at most 825 serialized
connection characters even with maximally escaped names and conservative
128-character identities; the receive observation's 1024-character cap fits.

Reproduction seams: `agentOAuth.runtime.test.ts`,
`browserSessionOrdering.runtime.test.ts`, `agentRelay.runtime.test.ts`,
`agentPrivateAdmissionOwner.test.ts`, and the managed runtime procedure in
`docs/agents/dev-runtime.md`. The browser harness drove ordinary consent and Agent
drawer controls and used a controlled store activity token only to hold the real
manual-input admission boundary. Root owns final committed-tip suites, review,
landing and issue completion.
