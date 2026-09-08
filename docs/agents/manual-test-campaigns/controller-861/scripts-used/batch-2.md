# Batch2 — Run, Save, import and rejection
Read common.md. Execute only this batch; no automated scenarios.

Preparation: create one run-owned plain native Pattern to exercise new Studio import. Disconnect Studio, open native UI, record complete pre-save inventory. Edit/New Pattern; name uniquely; type `export function render(index) { hsv(0,0,0.02) }` (typing compiles/runs live), Save New. Verify saved acknowledgment and one exactnew ID; record ownership immediately. Close native tab, reconnect Studio. Verify Other row with exactID. This is setup, not an acceptancepass. Use postfixture inventory count for RS1/RS2, originalbaseline for cleanup.

Create owned Studio Run Only source `export function render(index) { hsv(0,0,0.02) }` and recordID.
RS1: Run it. Verify active fixture and unchanged saved inventory IDs/count.
RS2: Without changing source, inspect Run: no-op/unavailable with No changes explanation. Verify no new saved record.
RS3: Create owned Durable with same source. Save. Record new ControllerID; verify exactlyone managed row,Current and running.
RS4: Materially change Durable source to `export function render(index) { hsv(0.5,0,0.03) }`; Save. Verify same ControllerID overwritten, no duplicate row,Current and active. Retain exactsource observation.
RS5: Refresh inventory; sameDurableID and runningmarker remain correct.
RS6: Import exact owned native plainPattern. Must offer creation of a new Studio identity; if it offers Open/Restore, do not accept substitute coverage. ConfirmImport, record newStudioID immediately. Verify source, then move only that Studio copy to Trash. Controller inventory including nativeID remains unchanged.
RS7: Edit Run Only to invalid source `export function render(index) {`. Verify compileerror, Run visibly gated with fix-errors reason; currentDurable and inventory preserved. Do not bypass disabled action. Repair source to validoriginal plus comment, Run; verify activeRunOnly and sameinventory. Invalid rejection isPASS, not exclusion.
RS8: Open built-in TestPattern1D (expand/search library as needed); Run. Verify built-in active, no savedrow added. Clear any library search after selection to avoid hidingcleanup records.

Cleanup: restore exactbaseline active; delete exactownednative andDurable IDs, trashonlyownedStudio records. Fullbaseline inventory/config/map preserved. Report all outcomes and deviations; no nextbatch.
