# MCP discovery proof (#1051)

The installed `codex-cli 0.153.4` app-server client called the actual local MCP
Worker and live authenticated browser editor at
`a8d65201d8c66e590604d9d33cfbc471fa485914`.

[Redacted result transcript](codex-live-client.json) records the returned Pattern
identity, command outcomes, saved receipt and reopened Show. The committed
[reopened browser capture](../../../../.wrsp/ui-proof/1051-discovery-reopened.png)
shows the synthetic test Show with the newly authored CometLoom Clip. The test
asserted its accessible name and persisted reference through the production API.

The isolated authenticated Playwright fixture passed its one acceptance case
in 6.8 seconds (11 seconds including command setup). No model inference, hosted
deployment or physical Controller is claimed. This qualifies the protocol before
#1048; its later identity schema requires fresh client qualification. The temporary
fixture and synthetic artifacts were cleaned after capture. Root also inspected
the full capture. Final prerequisite integration, authoritative suites, review
and landing remain outstanding.
