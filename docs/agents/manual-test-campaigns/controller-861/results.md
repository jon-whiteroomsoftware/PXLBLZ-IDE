# Manual pass results, September 8, 2026

One pass was executed as separate batches, in order 3, 1, 2, 4, 5, 6. The early batch 3 attempt was inconclusive and was retried before the successful manual approach was adopted. Batch 1 had a bounded continuation for its remaining live cases. There was no successful automated full campaign, and no combined manual rerun is planned.

## Outcomes

All 42 required cases were attempted: **37 PASS, 1 accepted anomaly, 1 approval-blocked, 2 evidence gaps, and 1 execution error**. The other two catalog cases were deliberate exclusions. The [case ledger](case-status.json) contains all 44 distinct IDs.

| Batch | Passed cases | Other outcomes |
| --- | --- | --- |
| 1: connection/live | CX1, CX2, CX3, CX5, LP1, LP3, LP4, LP5, LP6, LP7 | LP2 accepted execution anomaly |
| 2: Run/Save/import | RS1–RS8 | None |
| 3: switching/inventory | SW1, SW2, SW3, SW4, SW6, CX4 | SW5 approval-blocked; SW7 excluded |
| 4: maps/count | MP1, MP3, PC1, PC2 | MP2 explanation evidence missing; MP4 source-entry execution error |
| 5: reconciliation | RC1–RC4 | RC5 excluded |
| 6: failures/cleanup | FL2, FL3, CL1, CL2, CL3 | FL1 retryable-error text not captured |

No confirmed product failure has been established. That does not turn missing evidence or execution errors into passes.

## Exceptions retained at the pause

- **LP2:** an accessibility brightness increment jumped unexpectedly; exact fractional restoration was not achieved. Jon accepted 1% as the new baseline, classified the anomaly as minor, and directed no fix. Later batches preserved 1%.
- **SW5:** automatic approval review rejected opening a foreign Pattern's deletion confirmation. The intended action was inspect and Cancel, never deletion. No click executed; no alternate tool bypass was attempted.
- **MP2:** unchanged map Send was disabled as expected, but the no-changes explanation was not captured. The explanation criterion remains unproved.
- **MP4:** input/clipboard handling did not establish the intended fixed 64-point fixture. No send of that fixture occurred. The worker stopped the bounded obstacle and continued independent count checks; the mismatch-cancellation criterion remains unproved.
- **FL1:** the controlled loopback address was refused and the bench remained connected, but explicit retryable-error text was not captured. The exact failed decoy was removed. This is incomplete evidence, not a confirmed product failure.
- **SW7/RC5:** deliberate busy/switch races and induced rewrite failures were agreed exclusions throughout.

## Evidence and restoration

The local reports in [evidence-index.json](evidence-index.json) contain exact fixture ledgers, screenshots, observations, deviations, and cleanup evidence. The index preserves report hashes and original local paths; those temporary paths are not public or portable evidence links. This check-in preserves the execution scripts and result record, not the entire raw capture archive. Some captures contain unrelated clipboard text and must not be published indiscriminately.

All six batches completed cleanup and restored the original 16 saved Controller IDs and exact baseline active ID, pixel count 256, sequencing off, renderer running, power limiting off with the retained 25% cap, automatic updates off, and the installed map's SHA-256:

`66f8bec1f1d0eb622bda379da918a9fa6d57cfa7daf89d9800e56f3b89eb97db`

Owned saved Controller fixtures were deleted only by exact recorded ID. Owned Studio fixtures were moved to Trash; prior Trash was preserved. Each batch explicitly disconnected before its dedicated browser was closed. The accepted brightness exception is stated above.

Batch 5 additionally retained all three owned saved artifacts before/on/off. Independent hash comparisons verified that every file changed on enabling power limiting and changed again on disabling it. Visible queued/updating/Current transitions and the active Pattern matched those readbacks. Foreign ID/name pairs remained unchanged; this does not claim equality of every foreign bytecode file.

## Timing

Batch 2 took 18m23s active time, excluding a 33m36s Mac-lock pause. Batch 4 took 9m20s and batch 5 took 12m28s, both including cleanup. Earlier rough progress estimates are superseded by the reports' clock readings. Batch 6 took 8m03s through explicit disconnect; the coordinator then closed its setup session with exit 0, completing CL3. Hardware calls stopped there. These observations characterize this execution; they are not a performance or repeatability guarantee.
