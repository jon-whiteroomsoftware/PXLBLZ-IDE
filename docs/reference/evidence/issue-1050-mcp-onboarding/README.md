# Issue #1050 MCP onboarding evidence

Captured 2026-09-15 for the client-specific MCP setup UI. This packet pins the
user-facing setup syntax to current primary sources and records the local command
surfaces used to check the copied commands.

## Official references

- OpenAI Codex MCP documentation:
  <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>. The Streamable HTTP
  example uses `codex mcp add <name> --url <url>`.
- Claude Code MCP documentation:
  <https://code.claude.com/docs/en/mcp>. The remote HTTP example uses
  `claude mcp add --transport http <name> <url>`.
- Claude custom connector help:
  <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>.
  The individual-account path is **Customize → Connectors → + → Add custom
  connector**, followed by the remote MCP URL.

## Installed command evidence

`codex-cli 0.153.4` reports:

```text
Usage: codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)
--url <URL>  URL for a streamable HTTP server
```

`Claude Code 2.1.257` reports:

```text
Usage: claude mcp add [options] <name> <commandOrUrl> [args...]
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp
```

The UI therefore copies these origin-relative forms:

```text
claude mcp add --transport http pxlblz <origin>/mcp
codex mcp add pxlblz --url <origin>/mcp
```

Claude.ai and Other copy only `<origin>/mcp`. The endpoint remains visible and
independently copyable for every picker state.

## Must-test cases

The named cases M1–M5 in `test-design.json` cover the four clients across
desktop, 760-pixel, and 390-pixel widths; picker keyboard behavior; clipboard
success and failure; the two connection timers; and the visible Docs catalog
route. The committed UI-proof records pin the real in-app-browser captures to
the implementation commit. Real third-party client qualification remains the
existing #1009 boundary and is not claimed by this packet.
