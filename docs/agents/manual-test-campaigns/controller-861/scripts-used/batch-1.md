# Batch1 — connection and live basics
Read common.md. Execute only this batch, then cleanup/report. This is a manual script, not executable test code.

CX1: Connect from discovery through production helper. Verify header live identity and panel/profile name,IP,256pixels,firmware3.67 match bench. Capture.
CX2: Wait until current map,FPS and identity are loaded. Reload the connected app ONCE. Verify automatic reconnect to same Controller, fresh numeric FPS continues (observe two samples), one live entry. Do not replay reload to hide a failure.
CX3: Explicit disconnect; confirm disconnected UI. Reconnect by typing192.168.8.224; verify same identity/live facts.
CX5: Open profile from panel. Verify created-or-reused profile identity,map name/2D/256points and firmware. Refresh through UI; verify inventory/facts remain truthful and refresh completes. Read-only fresh config/map bytes can support freshness; no scripted provider writes.

Fixture: unique owned Live Pattern with source below, Run only (do not Save), after recording its Studio ID. Enable profile Limit power for this fixture; Keep up to date remains off. No baseline managed records may exist.

export var speed = 0.5
export var manualPhase = 0
export function sliderSpeed(v) { speed = v }
export function beforeRender(delta) { manualPhase = (manualPhase + delta * speed / 1000) % 1 }
export function render2D(index,x,y) { hsv(manualPhase + x * 0.2,1,0.05) }

LP1: Run fixture; verify its active name, brightness,map/count,IP,FPS,Controls/Variables and power summary with finite estimated draw/duty and limiting state. Observe manualPhase changing. Restore Limit power off afterward; capture baseline facts and generated telemetry.
LP2: Record brightness position/value. Move to a distinguishable modest level (at most25% brightness), verify displayed change, restore exact original position/value and verify raw baseline brightness via read-only config. No claim based on rounded1.28% alone.
LP3: Change fixture Speed slider from recorded value; observe position/value and phase-rate change if discernible; restore original. Only this run-owned control is touched.
LP4: Pause renderer: action becomes Resume and output/telemetry indicate pause. Resume: action becomes Pause and positive freshFPS returns.
LP5: Toggle Power section fold; close/reopen panel and verify fold retained, summary still available. Restore initial fold state.
LP6: Record variable names of fixture. Switch to a recorded baseline saved Pattern and verify displayed variable set changes (manualPhase disappears; no stale fixture controls). Restore exact baseline active saved ID. Never change foreign controls.
LP7: Open inline pixelcount editor, enter200 without applying, Escape. Verify256 remains on Controller and map matches.

Cleanup common contract; fixture should have no Controller saved ID. Record each case independently, supporting screenshots, source/ledger and exactafter-state. Return report to root, no next batch.
