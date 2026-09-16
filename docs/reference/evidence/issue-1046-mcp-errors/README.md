# Issue #1046 MCP result proof

This packet records focused schema/runtime evidence and the real Codex client
before/after result probe. The live-browser qualification below follows landed #1047.

## Automated evidence

- `src/worker/agent/agentMcpResults.test.ts` enumerates the closed public result
  domain and its error classification. The exported table is also the TypeScript
  source for producer result codes and the runtime `isError` decision; internal
  journal states `accepted` and `known` are not members.
- `src/worker/agent/agentMcpRouting.test.ts` exercises the in-process MCP request
  path. It independently compiles the advertised JSON schemas with Ajv and
  validates bound, commands, no-live-editor, changed, refused, refused-receipt
  outcome and binding-moved results. It also proves text/structured equality,
  schemas on the full dynamic catalogue, and no true resource-change capability.
- `src/worker/agent/agentOAuth.runtime.test.ts` runs through the bundled Worker in
  actual workerd. It binds an authorized editor, disconnects that binding, then
  calls `read_show` with the retired ID and receives:

  ```json
  {
    "isError": true,
    "structuredContent": { "code": "no_live_editor" },
    "content": [{ "type": "text", "text": "{\"code\":\"no_live_editor\"}" }]
  }
  ```

  The same runtime discovery asserts every current tool has an `outputSchema`
  and initialization does not advertise `resources.listChanged: true`.

## Real-client result proof

The installed `codex-cli 0.153.4` client exercised the actual local Worker through
`codex app-server` and `mcpServer/tool/call`. An ephemeral client session used a
synthetic account, real OAuth authorization/code exchange, and a registered stock
binding explicitly disconnected before `read_show`. No model inference or user
configuration change was needed; credentials are omitted from the transcripts.

- [Before](codex-before.json): baseline `18560a7c11cd0098912ae8159172da49fff4c773`
  returned `no_live_editor` without `isError`.
- [After](codex-after.json): integrated code
  `b2f8426e7e391d440d00e124590d9f1772d1db6d` returns the identical text and
  structured payload with `isError: true`.
- `list_commands` remains a successful result with equal text and structured
  representations in both runs.

This qualifies the real client's tool-result boundary. It does not claim a
model-driven editing session, live browser adoption, or hosted deployment. The
fixture's local Worker and OAuth lifecycle are real; its account and binding
registration are synthetic. Fresh integration checks remain required after the
prerequisites land.

## Integrated live-browser proof

At `4ddf7b3ff874a2169b56963337e188b2a3fed0ae`, the installed Codex client read the live Show successfully, then received `isError: true` with `no_live_editor` after the browser clicked Disconnect and awaited the completed channel response. The authenticated Playwright case passed; both committed captures were visually inspected. The [redacted transcript](codex-live-browser.json) records the exact candidate and observable results. This adds real browser connection retirement to the earlier before/after protocol proof. Final review and authoritative committed-tip suites remain coordinator-owned; no hosted publication is claimed.
