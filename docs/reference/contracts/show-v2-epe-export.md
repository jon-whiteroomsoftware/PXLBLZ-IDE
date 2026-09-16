# Native v2 EPE export

`buildShowEpeExportV2(record, generatedCode, options)` wraps an already compiled
Pixelblaze program in the ordinary `.epe` envelope. It returns
`{ status: 'exported', filename, text, source }` or a typed `invalid-record` /
`empty-show` refusal with a product explanation. The existing
`ShowEpeExportOptions` supplies the optional program ID, preview, timestamp, user
Maps and resolved attribution. The helper never mutates the Show or its options.

The helper validates the complete persisted record and its canonical Group
projection. It resolves effective runtime authority through
`materializeShowGroupsV2`: explicit top-level bindings win over stale local
templates, and default-bound Groups retain their stable runtime payloads. Source
credits come only from effective Clip consumers, including invisible or future
uses. Unused slots, unrelated resolver entries and dormant definitions do not
invent source credits. Available Pattern authors are matched by exact source
kind/ID; missing author metadata stays missing.

Metadata records native Layout occurrence names, start/duration and timed transfer
direction/easing/source association; materialized Clip start/duration/identity;
and ordinary or occurrence-qualified Transition kind, settings, time and easing.
Readable timing labels include exact millisecond facts, so nearby times remain
distinguishable. General Markers do not become chapters or execution boundaries.
Show name/ID, Stage Map and output-contract metadata use the existing stamping
and map-compatibility primitives. Custom Map names/fingerprints do not expose
local database IDs; portable reference resolution never becomes a fixed output
pixel count. Attribution text is escaped before entering source comments.

Generated code remains exact beneath the metadata/header. This owner neither
compiles source nor invokes direct lowering, creates a legacy `ShowRecord`,
normalizes choreography, changes lifecycle, or manufactures a runtime. Source
resolution and compiler eligibility stay upstream. A structurally valid empty
effective Show explicitly refuses this user-facing export capability, independent
of raw preparation's behavior. Unsupported compiler preimages are not broadened.

## Compatibility and evidence

The legacy exporter remains unchanged for pinned options. Narrow structural map
inputs and exposed description/escaping primitives add no legacy runtime logic.
Fixed SHA-256 pins cover ordinary export, custom installation/fingerprint and
attributed portal output; the latter two were compared against the exact landed
pre-extraction exporter source before recording their literal hashes.

[Consumer tests](../../../src/engine/showEpeExportV2.test.ts) reopen `.pxlshow`
records through the versioned codec, prepare and compile supported ordinary,
shared/held nonlinear Group Restart, split-position Layout animation, ordinary
whole-output / Group-local Transitions and converted timed routing fixtures.
Delivered files reopen through `parseEpe`; Fast and Precise frames and nonempty
exported state match the pre-export artifact at boundaries/interiors and loop
crossing. Precise code is regenerated from the reopened source itself.

The pure adapter is additive. `showV2Pilot.ts`, prepared Stage preview and route
adoption remain a separate integration slice. In-range Show repeat-scale animation
joins consumer qualification after its temporal prerequisite lands. No UI,
provider, persistence, schema or emitter behavior changes here.
