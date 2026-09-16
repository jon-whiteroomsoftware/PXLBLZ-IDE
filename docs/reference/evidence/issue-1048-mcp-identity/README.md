# Operation identity proof (#1048)

At `79364b1b7fa9bb1539933f39915656e97ba18028`, installed `codex-cli 0.153.4`
used the actual MCP Worker and live authenticated editor to add ten independent
Markers. All ten requests were written before awaiting responses; each returned
changed. Duplicate keyed begins recovered one server-minted operation. Commit
settled applied/saved and reopening proved all ten named Markers at their
expected times with distinct persisted IDs.

The [redacted client transcript](codex-parallel-client.json) records observable
results. The authenticated Playwright case passed in 11.5 seconds. Worker and
coordinator inspected both committed images. This qualifies real client
interoperability and editor persistence without model inference or hosted
publication. The fixture used only its synthetic account and owned Show.

[Actual-workerd evidence](workerd-proof.md) owns forced pending retry, exact
relay sequence ordering, terminal cancellation, and Durable Object eviction.
The [test model](test-design.json) records behavioral partitions and residuals.
The real-client duplicate begin may recover two known begun results; pending
is tested through controlled workerd timing rather than assumed from a race.

Final prerequisite rebase, review, authoritative suites and local landing remain
pending. New source changes require matching qualification.
