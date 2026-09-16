# Issue #1046 MCP result proof

This packet records the worker-prepared proof at commit time. Final integration,
the exact-base before/after probe, and real-client qualification remain owned by
the coordinator after #1047 lands.

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

## Real-client route (pending)

The installed client inspected during preparation is `codex-cli 0.153.4`. The
remaining acceptance proof should use the integrated local or hosted MCP origin:

1. Add the streamable HTTP server with `codex mcp add pxlblz-1046 --url <origin>/mcp --oauth-resource <origin>/mcp --oauth-client-registration DCR`, then run `codex mcp login pxlblz-1046`.
2. Open and arm an authorized Show editor, let the Codex session call
   `get_connection`, and record the returned binding.
3. Have the same session call `list_commands`; capture the ordinary tool result.
4. Disconnect that browser binding, then call `read_show` with the recorded old
   binding. Capture Codex rendering the tool call as an error with the unchanged
   `no_live_editor` structured payload.
5. Record `codex --version`, the endpoint kind (local or hosted), and the redacted
   transcript in this packet or issue #1046. Remove the temporary MCP entry with
   `codex mcp remove pxlblz-1046` after capture.

This worker did not perform OAuth consent or mutate the user's Codex MCP
configuration, so the required real-client transcript is not yet claimed.

## Remaining integration proof

Rebase onto landed #1047, rerun the current tool-schema census (the observed 62
tools are a baseline, not an invariant), and capture the exact-base/current
in-process probe transcript. Final suites, review, landing, publication and issue
updates remain coordinator-owned.
