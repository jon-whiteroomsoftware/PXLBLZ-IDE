# Controller hardware acceptance campaign (#862)

Goal catalog for the real-browser Controller acceptance campaign on the bench
Controller. Every goal is reached through visible PXLBLZ UI, travels through
the production store, Controller provider, Chrome extension, and physical
Controller, and is judged against the Feature Guide sections 2, 4, 6, 9, 10,
and 11. Node probes may support diagnosis and cleanup verification; they never
satisfy a goal.

Flags: `D` destructive (serialize ownership); `HW` bench hardware; `S` special
setup or an external surface; `X` probes an expected documented wall; `!`
targets a known oddity without assuming the verdict. Every goal in this catalog
is `HW`; the campaign is one serial hardware lane.

## Fixtures and canonical bench state

- Bench Controller: `Burner bag`, pb32, `192.168.8.224`. Two other Controllers
  answer discovery on the same network (`4' Mast 2` at `.208`, `4' Bike 3` at
  `.210`); the campaign never connects to, runs on, or edits them.
- Canonical inventory: the pre-existing saved programs on the bench are foreign
  content and are never deleted, renamed, imported-and-modified, or overwritten.
  Testers create only records prefixed with the campaign batch id (for example
  `C862-RS Durable`) and delete only those.
- Canonical device settings recorded before the campaign: 256 pixels, a 2D
  256-point installed map, the live brightness value read at connect, power
  limit off with a 25% fixed cap kept, no inputs, Keep-up-to-date off. The
  campaign ends with those restored; the coordinator re-installs the exact
  baseline map blob and re-checks the inventory with a Node probe.
- The pre-campaign running Pattern may be an unsaved run-only program. Once
  anything else runs it cannot be restored through the UI; the campaign ends
  with a saved pre-existing Pattern running and records which one.
- Extension: the campaign loads a copy of `extension/` whose manifest also
  injects on the issue-runtime port and statically grants the bench IP **and
  the FL1 decoy IP** (`192.168.8.250`, an address nothing answers). Without the
  decoy grant the helper stops FL1 at its authorization wall and the
  unreachable-host error is never reached; the 2026-08-16 run had only the
  bench grant, so its FL1 PASS covers the ungranted-address path, not the
  unreachable one. The just-in-time per-IP grant popup is not exercised on the
  unattended lane (no human present to accept the native prompt); a run with a
  human at the keyboard should use the unmodified extension and observe the
  pending-authorization hint instead.

## CX. Connect and observe (5)

- CX1 Connect from the discovery list to `Burner bag pb32 / v3.67 192.168.8.224`; the header pill names it, the panel opens, and the profile status band shows Connected, IP, Pixels 256, Firmware 3.67. Section 9, 10.
- CX2 Reload the browser page while connected; the connection recovers or is re-established through the UI and the panel shows fresh values (running Pattern, FPS changing) rather than the pre-reload snapshot. Section 9.
- CX3 Disconnect from the panel; pill and panel clean up; reconnect by typing the IP in the Connect menu; identity returns. Section 9.
- CX4 ! Stale-state rejection: while disconnected, change the running Pattern from the Controller's own web page (`http://192.168.8.224/`), then reconnect in PXLBLZ; the panel and Switch menu show the new running Pattern, not the old one. Section 9. S.
- CX5 Profile auto-creation on live connect and Refresh: profile shows device name, firmware, pixel count, map facts; Refresh re-reads them. Section 10.

## LP. Live panel (7)

- LP1 Panel reports brightness, FPS heartbeat (value changes over a few seconds), IP, pixel count, installed map row, running Pattern identity, Pattern controls, watched variables, and power telemetry (limiting label, duty, amps). Section 9.
- LP2 Brightness: record the current value, move it to a clearly different value, observe the panel report the new value, restore the recorded value exactly. Section 9.
- LP3 Pattern controls: move one control, observe the value applied, restore it. Section 9.
- LP4 Play/Pause: pause the Controller renderer, observe the paused state (FPS/label), resume, observe FPS return. Section 9.
- LP5 Power section folds and remembers its state across panel close/open; the header line keeps limiter, duty, and estimated draw. Section 9.
- LP6 Variables: the watched-variable list reflects the running Pattern; after Switch or Run to a different Pattern the list changes accordingly. Section 9.
- LP7 Pixel-count popover opens from the panel and can be cancelled without change. Section 9, 10.

## RS. Run, Save, refresh, read, import (8)

- RS1 Create Studio Pattern `C862-RS Run Only`; Run to the Controller; the panel shows it running; the profile's Saved PXLBLZ Patterns and Other Patterns counts do not change (no new row). Section 11.
- RS2 Run again unchanged: the UI reports the already-pushed state or a clean no-op; no inventory change. Section 11.
- RS3 Create Studio Pattern `C862-RS Durable`; Save; a Saved PXLBLZ Patterns row appears as Current with the running marker; Other count unchanged. Section 10, 11.
- RS4 Edit `C862-RS Durable` materially; Save again; the same row is overwritten (Saved count unchanged, no duplicate) and returns to Current. Section 11.
- RS5 Refresh saved Patterns; the row and running marker persist and match the panel. Section 10.
- RS6 Import a pre-existing Other Pattern from the profile inventory into Studio; the expected Studio Pattern opens or is created; the Controller inventory counts are unchanged; then move the imported Studio record to Trash (personal record only). Section 10, 11.
- RS7 Compile failure: introduce a syntax error into `C862-RS Run Only`; Run; a visible error with a reason appears; the running Pattern and inventory are unchanged; fix the source; Run succeeds. Section 11.
- RS8 Read-only built-in Pattern: open a built-in, Run it; a transient run works or the UI explains why not; nothing saved. Section 11.

## SW. Switch, inventory Run, delete (7)

- SW1 Panel Switch menu lists saved Patterns alphabetically, marks the running one, pins an unsaved running Pattern as `unsaved · running`; choose `C862-RS Durable`; running marker moves; menu closes. Section 9.
- SW2 Profile inventory row Run on a pre-existing Other Pattern changes the running Pattern and marker without opening a Studio Pattern or changing Run/Save dirty state. Section 10.
- SW3 Delete is disabled on the running row and explains why. Section 10. X.
- SW4 Save Studio Pattern `C862-SW Delete Me`; switch running to `C862-RS Durable`; delete `C862-SW Delete Me` from the inventory after confirmation; row gone after Refresh; every other row preserved; the Studio Pattern remains and Save re-arms for it. Section 10. D.
- SW5 Open the delete confirmation for a pre-existing Other Pattern; the warning says PXLBLZ has no recovery copy; Cancel; row preserved. Section 10.
- SW6 ! Sequencer indicator: turn Shuffle on from the Controller's own web page, return to PXLBLZ; a read-only sequencer icon appears first in the panel header with a tooltip warning; turn Shuffle off again and confirm the icon leaves. Section 9. S.
- SW7 Switch failure surfacing: attempt a switch while the Controller is busy or refresh mid-switch; the menu stays open with a reason or the change is confirmed; record which. Section 9. !.

## MP. Map send and read-back (4)

- MP1 Create and bake a 16x16 (256-point) 2D map in Studio; Send map to Controller; the confirm-first dialog appears; after send the profile Map row and the panel map row identify it (2D, 256 points, name or fingerprint match) with no mismatch chip. Section 6, 9, 10.
- MP2 Unchanged map: Send is disabled with the no-changes reason. Section 6. X.
- MP3 Import map from Controller: the match path opens the matching Studio map, or the new-import dialog states name and facts; record which. Section 6, 10.
- MP4 ! Send an 8x8 (64-point) map without changing the pixel count; the UI must surface the count mismatch (preflight checkboxes or amber `64≠256` chip) rather than silently succeed; then re-send the 256-point map so the panel shows 256 points with no chip. Section 6, 9. D.

## PC. Pixel count (2)

- PC1 Edit the Controller pixel count from 256 to 200 through the panel popover; commit; the live count reads 200; observe any blackout-before-shrink behavior the UI reports; note any map mismatch chip. Section 9, 10. D.
- PC2 Restore 256 through the same popover; the live count reads 256; the map row shows 256 points and no mismatch chip (re-send the 256-point map if needed). Section 9, 10. D.

## RC. Reconciliation with Keep Patterns up to date (5)

- RC1 Setup: with `C862-RS Durable` saved, Save two more Studio Patterns `C862-RC Managed B` and `C862-RC Managed C`; three managed rows read Current; pre-existing Other rows are the foreign content. Enable Keep PXLBLZ Patterns up to date. Section 10, 11.
- RC2 Code-affecting power edit: turn Limit power on (fixed cap); every managed row passes through queued/updating and returns to Current, including non-active saved rows; the active managed Pattern updates last. Section 10. D.
- RC3 The Other rows are untouched (same count, no status change) and the running Pattern is still the expected one after reconciliation. Section 10.
- RC4 Second code-affecting edit: turn Limit power off again (or add a hardware-brightness input and remove it); the same sequence repeats and ends Current for every managed row. Section 10. D.
- RC5 ! If any rewrite fails, the row reads FAILED with a reason rather than Current; record whether a retry path exists. Section 10.

## FL. Failure scenarios (3)

- FL1 Connect by IP to `192.168.8.250` (nothing there; the campaign extension copy must already grant it, see Fixtures); a visible retryable unreachable-host error appears; the Burner bag connection and Studio state are unaffected. Section 9. S.
- FL2 Save with the Controller disconnected: Save/Run are disabled or explain the missing Controller; the Studio Pattern keeps its dirty state. Section 11.
- FL3 Read-back failure: Refresh saved Patterns immediately after Disconnect; the UI reports offline state rather than stale rows claimed fresh. Section 10.

## CL. Cleanup and canonical state (3)

- CL1 Switch the running Pattern to a pre-existing saved Pattern; delete every `C862-` saved Pattern from the Controller through the UI; Refresh; only pre-existing rows remain and none is missing. Section 10. D.
- CL2 Restore brightness to the recorded value, Limit power off, Keep-up-to-date off, no inputs; pixel count 256; map 256 points; disconnect cleanly. Section 9, 10.
- CL3 Move every `C862-` Studio Pattern and map to Trash; the profile page still lists the bench profile. Section 2.

## Batches

Serial hardware lane, one persistent Chrome profile:

1. `b1` CX1-CX3, CX5, LP1-LP7 (pilot).
2. `b2` RS1-RS8.
3. `b3` SW1-SW7, CX4.
4. `b4` MP1-MP4, PC1-PC2.
5. `b5` RC1-RC5.
6. `b6` FL1-FL3, CL1-CL3.
7. `vf` verification of every non-PASS and PASS-with-error result.

## Run record

- 2026-08-16, main `4a43ca2f`, runtime `862:5177`, bench pb32 "Burner bag" fw
  3.67. Testers `gpt-5.6-sol` high, 8 batches (b1-b6, vf, vg), about 1.85M
  tokens, 131 screenshots. Catalog goals: 40 PASS, 1 BUG (SW3), 1 DRIFT (SW6),
  1 WALLED (RS7), 1 BUG refuted (CX2). Verification lane confirmed OB2, OB5,
  OB7, OB8 and refuted OB1, OB4, OB6. Findings filed as #871-#877; the
  consolidated report and verification trail are on #862. Bench restored to
  baseline (identical inventory, brightness, pixel count, map blob); the running
  Pattern ended as saved IridescentFibers because the pre-campaign program was
  unsaved.
