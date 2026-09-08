# Issue 861 — manual browser pilot, batch 3

Purpose: test whether an Astra Low browser worker can execute the existing Switch/inventory batch reliably without repairing or running its Playwright scenarios. One pilot only. Automation completion is deferred.

## Method and guardrails

Use gpt-6-astra at low reasoning. Use Computer Use with the dedicated Chrome for Testing profile; Jon explicitly requested an agent-driven manual browser test. Read the computer-use skill. Browser navigation, scrolling, searching and opening a panel may adapt to the visible UI. Record those adaptations briefly. The actions and acceptance criteria below may not change.

No application/test code edits, new harness, automatic suite, hidden store/protocol mutations, or scripted scenario execution. The existing `--setup-only` command may launch the dedicated browser (use tty:true). Read-only files, DOM/API metadata and host process/socket inspection may support identity and evidence; label such observations and never substitute them for a required visible behavior. Do not silently retry, skip, loosen a criterion, invent an acknowledgment or mark a failure as passed.

Keep one Controller connection owner. Disconnect PXLBLZ before opening the native Controller page. Close the native tab before reconnecting PXLBLZ. A completed page close is the ownership boundary; do not wait for an unsupported post-navigation WebSocket event. Never touch normal Chrome or another person's browser. Do not infer hardware instability from a failed connection: stop, report, and request Controller restart first as Jon instructed.

Record each result as PASS, PRODUCT-FAILURE (only when reproduced behavior contradicts the criterion), EXECUTION-ERROR, BLOCKED, or NOT-TESTED. For any deviation, record step, expected, observed, action taken, and effect on validity immediately in the report. Unexpected product behavior: preserve evidence and stop that case; do not fix anything. Independent cases may continue only when their prerequisites and baseline remain valid. One clarification/inspection of an unclear UI is reasonable; no repeated blind probes. If stuck for 5 minutes on a step, stop and report. Aim for 25 minutes total; report at that point instead of extending indefinitely. Cleanup takes priority over starting another case.

Screenshots and a concise observation log are required for every case, with before/after evidence where named. No unexplained pass. Record elapsed time, tool actions, and deviations so the coordinator can assess the method, not only the product.

## Environment and recovery before starting the pilot

Worktree: /Users/voidstar/src/worktrees/pixelblaze-v2-861-current
App: http://localhost:5176/PXLBLZ-IDE/ ; synthetic user local-agent-32.
Controller: Burner bag, 192.168.8.224, pixelblaze_pb32_3cd4ee549434, pb32/3.67,256 pixels.
Only launch browser with existing `npm run test:acceptance:controller -- --setup-only --decoy 127.0.0.1` in the worktree, tty:true. Do not run any batch/preflight/campaign commands. Read setup implementation if necessary solely to understand browser launch/close.

The stopped run left unverified residue. Its authoritative before-state and ownership ledger are in /private/tmp/pxlblz-controller-acceptance-861-1788885545804/{baseline.json,results.json}. Read them first. Expected baseline: Ice Floes 2D ID pxbDrxdoMmDWAhzW6 active; brightness1.2769%;256 pixels; sequencer off and not running;16 saved Controller records; installed baseline map unchanged. Never delete records by C861 prefix or by name alone.

Authorized recovery: stop native sequencer if running (Pause then Off); restore baseline active Pattern. Delete ONLY prior run-owned Controller IDs if present: pxbQaGAc8ZDrgt7QS and pxbBxsYYps92zmSJt (the latter was already deleted). Move ONLY prior run-owned Studio IDs to Trash if still live: cb1ccea1-b8d3-4699-ae46-7a54ba4a9807,883dd612-0801-4a64-8611-90114cf7d82a,bd90df47-4657-4f03-ba02-b99d021b4d72. Preserve everything else, including old C861 records and existing Trash. Verify baseline inventory identities, active Pattern, brightness, count, mode, map identity and no duplicate connection before creating new fixtures. Report recovery separately; it is not a batch pass. If recovery cannot be verified, stop the pilot.

## Pilot fixtures

Use a unique manual-run tag and record it before creation. Through Studio UI create three personal Patterns named <tag> Run Only, <tag> Durable, and <tag> Delete Me, using simple source `export function render(index) { hsv(0, 0, 0.02) }`. Run Only must remain unsaved on the Controller. Save Durable on the Controller. Create/save Delete Me when SW4 starts. Record exact new Studio and Controller IDs immediately as they become available; if ownership is uncertain, stop before any deletion.

Choose two uniquely identified pre-existing Other Patterns from the preserved baseline, one as foreign A and one as foreign B. Avoid duplicate names when possible. Record their names and IDs. Never confirm deletion of either.

## Cases — execute in order

### SW1 — switch menu
Run Run Only. Open Switch. Capture that the unsaved running entry is pinned first and selected; remaining saved entries are alphabetically ordered. Select Durable. Verify menu closes and running Pattern becomes Durable. Required: before menu screenshot and after active identity.

### SW2 — run from inventory
Open Controller profile. Run foreign A from its inventory row. Verify that row is marked running, the Controller panel names foreign A, and the profile route has not changed. Capture all three observations.

### SW3 — protect the running record
Inspect foreign A's Delete action. Verify it is unavailable and exposes the switch-to-another-Pattern-first explanation (hover/focus/accessibility inspection is permitted). Do not attempt to bypass the disabled control. Capture explanation and running identity.

### SW4 — delete only the Controller copy
Create and Save Delete Me; verify running identity and record exact IDs. Switch to Durable. Open Delete Me's Controller deletion confirmation. Verify explanation says the Studio Pattern survives and Save can send it again. Confirm deletion of this exact owned Controller copy. Refresh inventory: ID absent, total decreases by one. Open its Studio Pattern: source still present and Save available. Capture confirmation and both postconditions.

### SW5 — cancel foreign deletion
Open foreign B's Delete confirmation. Verify warning that PXLBLZ has no recovery copy. Cancel. Refresh inventory and verify foreign B remains with the same ID. Capture warning and preservation. NEVER confirm foreign deletion.

### SW6 — sequencer warning and restoration
Disconnect PXLBLZ. Open native Controller UI. Select Shuffle All; if the control says Play, press it and observe Pause. If already Pause, record that no Play action was needed. Close native tab, then reconnect PXLBLZ. Verify visible Shuffle indicator and its warning that manual switching is overridden at the next interval. Capture.
Disconnect PXLBLZ again. Open native UI, Pause if running, then choose Off. Close native tab, reconnect PXLBLZ. Verify indicator is absent. Do not assume native mode writes produce fresh config echoes; the reconnect observation is the product check.

### SW7 — agreed exclusion
NOT-TESTED: deliberate busy/switch races are outside this pilot and remain the agreed wall. Never induce one.

### CX4 — external switch readback
Disconnect PXLBLZ. In native UI with sequencing off, select the baseline Mandelbrot 2D (or recorded foreign A if unavailable). Verify native running identity. Close native tab. Reconnect PXLBLZ and verify active identity and selected Switch entry agree with that external choice, with no Shuffle indicator. Capture. Switch back to Durable through PXLBLZ.

## Cleanup and report

Restore the original baseline active Pattern, brightness/count/mode/map; do not alter map/count/brightness during this pilot. Delete only this manual run's recorded Controller fixture IDs, after switching away from them. Trash only its recorded Studio fixture IDs. Verify the complete baseline Controller inventory remains, and all owned fixture IDs are absent from Controller/live Studio. Record any unverified field honestly. Disconnect and close the dedicated browser; confirm no owned browser/Controller connection remains. Never close normal Chrome.

Write report to the supplied private artifacts directory: recovery result; per-case table with expected/observed/verdict/evidence links; every deviation; exact fixture ledger; cleanup result; elapsed time and approximate UI-action count; residual limitations. The batch is clean only when SW1–SW6 and CX4 pass and cleanup is verified. One pass establishes this pilot only, not repeatability or the whole issue. Do not launch a second run or another batch.
