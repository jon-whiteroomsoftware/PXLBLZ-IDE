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

The committed-source `RC951` scripted browser sequence passed at
`4919cd37e96fb4074ee16bbf222b5b1a7985f8ff` (5.1 seconds; 10.6 seconds including
harness setup). A no-paid-model bridge turn produced one save/adoption. The
actual downloaded `.pxlshow` reopened to the complete visible and durable Show;
one Undo restored its complete preimage with one additional save and no earlier
history. [Records](RC951.json), [reopened export](RC951-export.json) and
[inspected capture](RC951-result.png) retain the synthetic evidence.

The fixture intentionally contains the unrelated pre-existing `orphan-track`
for `unrelated-orphan`. The compiler reports that unused instance as missing
before and after deletion. This packet qualifies authoring preservation and
export/reopen, not compilation, preview rendering or Controller delivery.

Coordinator in-app proof on the same source commit used synthetic local-agent-08
at managed runtime 5178. Ordinary overlay deletion removed `clip-ov`, retained
the Transition and undid exactly. Connected `clip-b` deletion showed the existing
confirmation; confirming removed the target and crossfade while both Group
buttons and `clip-ov`/`clip-a`/`clip-c` DOM ranges stayed unchanged. One Undo
restored the target and crossfade and disabled Undo. Cancel preserved content;
no browser errors were observed. The committed `.wrsp/ui-proof/951-remove-clip.json`
package pins the coordinator's four inspected JPEG captures to that source.

The inspector overlapped the first confirmation when left open
([capture](inspector-overlap.jpg)); closing it with the existing Escape action
before Delete exposed the complete confirmation. This is an observed layout
residual, not a layout change or repair in this slice.

The coordinator owns authoritative final suites and cross-family review. The existing whole-Show
stale-response and duplicate-delivery guards are unchanged; this sequence does
not independently requalify them. No Controller or hosted service is used.

The command contract and Technical Reference pointer now identify shared
removal ownership. The canonical inventory was regenerated; diagnostic inventory
content is unchanged. CONTEXT and Feature Guide need no change: domain names and
the existing confirmation workflow are unchanged. The active command census stays
forward-looking until coordinator review and landing.
