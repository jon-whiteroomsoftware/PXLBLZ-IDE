# Command refusal correction proof (#1049)

The installed `codex-cli 0.153.4` client exercised actual MCP calls against the
live authenticated editor at `8caa1a1e28a314e3ed95535782f01a161032cf6c`.
The [redacted transcript](codex-live-client.json) records one operation that
accepted a Stage-map removal, refused an empty rename, accepted its correction,
then committed with an applied/saved receipt. Reopening the Show proved both
accepted edits survived.

The authenticated Playwright fixture asserted one working activity row during
refusal, no terminal outcome or unread badge, then the same row saved with the
interim issue cleared. Three committed images were inspected by the worker and
coordinator. The acceptance case passed in 8.1 seconds (12.6 seconds including
setup). A filesystem handshake paused the real client for interim capture;
no delivery acknowledgement or save result was simulated.

This qualifies the independent refusal slice under the public identity schema
before #1048. Final instructions, identity adaptation, fresh qualification,
review, authoritative suites and local landing remain pending. No hosted
publication or model inference is claimed.
