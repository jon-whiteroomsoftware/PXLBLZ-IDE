# Controller manual pass: issue 861

This record preserves the scripts used for one manual pass through six Controller acceptance batches. Jon explicitly chose separate manual batches, with no combined run or repeat campaign, followed by recording the scripts and pausing. Automation remains paused. The pass does not claim the original automated two-campaign requirement is complete.

## Reading this record

[scripts-used](scripts-used/) contains the original execution documents, copied without rewriting their steps. [script-hashes.json](script-hashes.json) records their SHA-256 hashes. They are historical scripts, not commands to resume automatically. In particular, batch 3 contains one-time recovery IDs and older pilot wording; those IDs confer no authority in a future run. Its historical brightness baseline was superseded by the accepted 1% baseline in common.md after LP2.

A future run must obtain its own authorization, baseline, owned fixture ledger, prepared browser, current runtime, and recovery path. Old fixture names or IDs must never be used as a cleanup selection. The completed reports and case ledger distinguish passes, execution problems, missing evidence, accepted anomalies, permission blocks, and deliberate exclusions.

## Tested environment and method

The worker was `gpt-6-astra` at `low`, using Computer Use in one dedicated Chrome for Testing profile with the production helper. The runtime was issue 861 at localhost:5176 with synthetic Studio identity local-agent-32, served from the paused `codex/861-current` candidate based on `06b919e3`, including its uncommitted changes. These observations are evidence for that running candidate, not a claim that the later main revision was tested.

The candidate's setup-only launcher prepared and closed the browser; no automated scenario or full campaign ran during the manual batches. That launcher is part of paused work and is not introduced by this documentation commit. Future execution needs a prepared dedicated browser rather than assuming that command exists on main.

The bench was Burner bag at 192.168.8.224, stable identity pixelblaze_pb32_3cd4ee549434, pb32 firmware 3.67, with 256 pixels and 16 baseline saved Patterns. The accepted cleanup brightness became 1%. Each batch used one connection owner and explicit Studio/native UI handoffs. Raw map and saved-file HTTP reads supplemented visible UI proof without another observer WebSocket.

Navigation could adapt; case outcomes could not silently change. The worker stopped bounded input or permission obstacles, preserved evidence, and continued independent cases. No product or harness fixes were made in this manual track. Jon accepted LP2 as a minor anomaly and directed continuing without fixing it.

## Status

The single manual pass is finished and hardware work is paused. All 42 required cases were attempted: 37 passed, one is an accepted anomaly, one is approval-blocked, two have incomplete evidence, and one had an execution error. Two additional catalog cases were deliberate exclusions. See [results](results.md) and the exact [case ledger](case-status.json). Final cleanup and dedicated browser closure were verified. No repeat run is planned.
