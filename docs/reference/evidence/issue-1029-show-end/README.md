# Issue 1029 exact Show End proof

The coordinator ran the real synthetic OAuth MCP connection against code commit
`a8863539d2d70f30be41f86c98e28224a2a7e8cf`. The 16-step sequence in the
[success record](success-proof.json) created four independently animated
Coronal Mass Ejection Layers, removed the original Clips and empty Layer, set
Show End to exactly 30 seconds, added eight property tracks with 24 keyframes,
and committed one saved result. The saved Show has one positive 30-second Scene,
four independent Pattern instances, eight tracks, and 24 keys.

Keyboard Undo and then keyboard Redo ran before reload. Undo restored the full
62-second baseline record and Redo restored the full 30-second result; only the
store-owned save timestamps differed. A fresh reload retained the saved result
without a compile error. The [browser record](browser-proof.json) captures these
checks and reports zero console error-level logs.

The browser downloaded the actual [Show bundle](four-layer.pxlshow) and
[compiled EPE](four-layer.epe). The [artifact oracle](artifact-proof.json)
reopened them through `parseShowFileBundle` and `parseEpe`, verified the EPE
hash, and compiled both preview and artifact output with the observed Stage
dimension of 2 and pixel count of 256. The first artifact harness omitted the
required 2D Stage context. The coordinator corrected the harness only and did
not edit or replay the product operation.

The meaningful-fade fixture was seeded through authenticated isolated REST. The
real `set_show_end` request for 32,000 ms returned the stable
`unsupported-topology` refusal because it would remove the destination of a
two-second crossfade. The [refusal record](refusal-proof.json) shows the complete
live Show and provider record stayed unchanged and Undo remained disabled.

A separate Cut fixture was seeded through authenticated isolated REST. The
coordinator changed Show End from 60 to 30 seconds through the visible textbox
and Enter key; the saved result contained one positive Scene. The committed
[UI proof](../../../../.wrsp/ui-proof/1029-show-end.json) includes the saved,
reopened, refusal, and manual captures. Every screenshot was opened and
inspected.

An earlier live run against `90e80acbd8263c6db3c63d4b2548c6d9acd21b30`
exposed the stale compiler rule that rejected the valid one-Scene routed result.
Commit `a8863539d2d70f30be41f86c98e28224a2a7e8cf` corrected that compiler seam;
the coordinator restored the complete baseline and repeated the full successful
sequence for the evidence recorded here. The earlier saved but uncompilable
state is diagnostic history and is not completion proof.
