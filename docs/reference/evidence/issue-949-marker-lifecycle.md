# #949 Marker button lifecycle correction

Seven production lines retire a non-settling Marker move when the Marker leaves
the rendered set, including Hide Markers and times beyond Show End. An authored
move already saving remains owned until its existing callback completes. This is
the exact corrective for the P2 finding on landed `595c33d0`.

Source and captures: `4fbc425069fe9bc2a9b1b06da584472eff8d9b7d`.
Three actual-handler removal/hide/out-of-duration cases first failed with Waiting
instead of Applied. Four focused cases now pass, including a hidden move with a
deferred provider save. Full Show/history/provider preservation and later request
and gesture admission are asserted. Removing the settling guard makes its oracle
fail (Applied instead of Waiting); source was restored before committed proof.
Normal hooks passed lint, typecheck and all 250 ShowEditor tests. The existing
Technical Reference overview remains accurate; the detailed candidate contract
carries this lifetime correction. Optional post-commit reporter SIGPIPE141 remains
the previously diagnosed issue-body pipeline failure, without retry or bypass.

The actual editor proof uses managed issue949 port5178 and an isolated repository
Playwright context. In-app discovery listed only Chrome and selecting iab failed.
Actual mouse-down followed by keyboard Enter on Hide Markers or Undo removed the
Marker button while its parent survived. On the old source, the next diagnostic
request remained Waiting in both cases. On the committed correction, it applied
and saved; full visible and durable Shows agree, late pointerup preserves the
record, and a restored Marker gesture waits and releases normally. No activity
tokens or paid model calls were used. Raw [before](issue-949-marker-lifecycle/before.json)
and [after](issue-949-marker-lifecycle/after.json) records retain these outcomes.

The two inspected desktop captures in `.wrsp/ui-proof/949-marker-lifecycle.json`
show the recovered Show and hidden/removed Marker. The short existing Marker-added
confirmation and reference-map delivery warning remain visible; these are not
Controller delivery proof. Browser probe setup corrections were explicit: Space
did not activate Hide, hidden visibility persisted to the next fixture, and the
focused Marker intentionally owned Command-Z. Enter on the existing controls
reproduced the intended operations without changing keyboard behavior.

Duration filtering and deferred persistence use component oracles; this small
correction does not requalify narrow layouts, all pointer devices or other timeline
families. The original timeline GA blank-app/invalid-candidate failure remains
unexplained, as recorded in its existing evidence. Logs and test-design packet are
in `.wrsp/949-marker-lifecycle/`. The coordinator owns final suites, exact corrective
review, landing and cleanup. Publication remains held.
