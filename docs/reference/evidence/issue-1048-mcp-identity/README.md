# Operation identity proof (#1048)

The latest normal-client proof was captured at
`13992d36c20b4dfb23214446ee681f29c34bd69b` and landed with its evidence at
`0bc2adb62cb6f23d91e19afb47259a75f377b19b`. Installed `codex-cli 0.153.4`
used the actual MCP Worker and live authenticated editor to add ten independent
Markers. All ten requests were written before awaiting responses; each returned
changed. Duplicate keyed begins recovered one server-minted operation. Commit
settled applied/saved and reopening proved all ten named Markers at their
expected times with distinct persisted IDs.

The [latest redacted transcript](codex-parallel-client-followup.json) records
those results. The authenticated Playwright case passed in 39.6 seconds.
Worker and coordinator inspected both committed captures, indexed by
[the capture record](../../../../.wrsp/ui-proof/1048-parallel-markers-followup.json).
All four authoritative suites and the host evidence gate passed at the landed
tip. Native review cleared the post-commit follower and complete-begun capacity
corrections, with one advisory follow-up for saving-status query recovery.

This qualifies real client interoperability and editor persistence without
model inference or hosted publication. The fixture used only its synthetic
account and owned Show. Controlled relay tests separately qualify waiting,
saving, cancellation and response-size boundaries; the normal-client run does
not claim to force those races.

Earlier [original](codex-parallel-client.json),
[rebased](codex-parallel-client-final.json), and
[repaired](codex-parallel-client-repaired.json) transcripts retain their original
captured source identities. They are historical evidence, not captures of later
source changes.

[Actual-workerd evidence](workerd-proof.md) owns forced pending retry, exact
relay sequence ordering, terminal cancellation, and Durable Object eviction.
The [test model](test-design.json) records behavioral partitions and residuals.
The real-client duplicate begin may recover two known begun results; pending
is tested through controlled workerd timing rather than assumed from a race.

Issue #1048 records the latest candidate review, authoritative suite identities,
local landing and any remaining corrective work. New source changes require
qualification at their affected boundary.
