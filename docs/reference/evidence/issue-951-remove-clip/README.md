# Logical Clip removal

The shared removal owner deletes a complete logical Clip and only its newly
orphaned dependencies. The [importable fixture](951-remove.pxlshow) contains
ordinary overlay `clip-ov`, connected main `clip-b`, shared-instance survivors,
a mixed Group and an unrelated orphan instance with a track.

The owner tests compare complete literal expected compositions, validate the
result and retain the immutable input. Cases cover Main, overlay, multi-Scene,
connected/unconnected, sole/shared instance users, unrelated Groups and orphan
data, Group-child/missing/malformed/last-Clip refusal, and removal followed by
an independent marker edit. Adapter tests pair manual/canonical/diagnostic
records and reopen the serialized `.pxlshow`; MCP tests discover the actual
schema, remove, refuse repeat removal, Undo and Redo with exact exports.
Central canonical and diagnostic golden runs qualify every declared touch path.

The first red test exposed retained orphan instances and tracks. The second
exposed the connected path's whole-composition normalization (marker order and
optional fields) as well as retained orphan dependencies. Focused checks passed
185 tests across eight suites after both repairs. Source typecheck and focused lint passed. Four deliberate faults (one segment only,
lost shared instance, retained orphan, moved neighbor) were each killed by the
owner assertions; the restored nine-case suite passed.

Browser evidence is pending on the committed source. `RC951` in the scripted
baseline drives a no-paid-model bridge turn, one save/adoption, downloaded
Show-file reopen and one Undo restoring the complete preimage. The coordinator
owns actual in-app ordinary and confirmed connected deletion proof, authoritative
final suites and cross-family review. No Controller or hosted service is used.
