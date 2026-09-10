# #997 candidate 1 qualification

The coordinator successfully exercised Pattern and Show Run/Save through the real Controller popover on the combined #997 candidate and #999 transport repair. All eight fresh captures were taken at `f9b09a5a36b21d88264386605fd9fb7e6bbf5398` on port 5180 and visually inspected before packaging. The distinct transport base is `fa7b2fb67abce34ea19b60a931d69972aec9fef3`; its review was still pending when this proof was prepared. This records candidate 1 qualification, not final approval or completion of #997.

Each JPEG is 1593 × 866 pixels. The coordinator separately read the unchanged browser layout viewport as 1593 × 865 CSS pixels, with devicePixelRatio 2.5; screenshot dimensions are not substituted for layout dimensions.

The captures cover WavyBands, 101 Clips, Cuts, and Blank Time, and 301 Installation Mapping. Pattern and Show header rows remain. The Show-header capture has the popover open; the Pattern-header capture has it closed. Warning-dependent preflight remains shared with the retained header. Cancel preserved the prior active program. The Installation preflight showed “This Installation Show requires 1000 pixels; the Controller reports 256.” and a map fingerprint mismatch, with Unsupported disabled; the coordinator cancelled without sending.

## Primary device readback

The coordinator drove UI actions using the temporary localhost:5180 helper against Burner bag pb32, firmware 3.67, 256 pixels. Independent bounded readbacks and recovered PBP artifacts establish the following results. Every readback reports brightness `0.095481` and `socketClosed: true`. Unrelated inventory is omitted.

| UI operation | Readback UTC | Active program | Consumer result |
| --- | --- | --- | --- |
| show-save | 2026-09-10T01:45:55.060Z | `pxbzhMJSJ8jSvxMkn` | Saved active; show / `stock-show-101-clips-cuts-blank-time`; source `1b22d0ad` matches stamp |
| show-cancel | 2026-09-10T01:46:29.435Z | `pxbzhMJSJ8jSvxMkn` | Previous Show Save active id preserved |
| show-run | 2026-09-10T01:47:12.013Z | `pxbKyXkYLtdy4E4aB` | Transient; absent from saved inventory |
| pattern-run | 2026-09-10T01:48:06.039Z | `pxb8wE2kFx5Z7WSjv` | Transient; absent from saved inventory |
| pattern-save | 2026-09-10T01:48:59.834Z | `pxbHkwaZoggJHbHiF` | Saved active; pattern / `demo:WavyBands`; source `eeda537f` matches stamp |

Readback source files were under `/tmp/`; complete-file SHA-256 digests preserve their identity:

- `pxlblz-999-replacement-show-save.json`: `4d9279191d04597738bfade98910cc5d1ed27c3e9a4ea0538efd7aaed3ad279b`
- `pxlblz-999-replacement-show-cancel.json`: `7d850fd83a327377cfd4f363477f12b36294ad2d080c91a9e9c03a0c269aafac`
- `pxlblz-999-replacement-show-run.json`: `3779e5447214e3f6de9c004d1865ba7b18bcf272780f2bf0973678fa9efc34ea`
- `pxlblz-999-replacement-pattern-run.json`: `146d5dcf7cece6227465e88c55dac50e4d8e771b7ca5d2ddb11e1213b280a7b4`
- `pxlblz-999-replacement-pattern-save.json`: `7d6ba2000c6ac2ca146136ac4dd76dace2ea3e4f0f733763ecc086c92ca7369f`

## Limits and remaining gates

The Pattern captures visibly report “Map unavailable” following a reload. No map-read success is claimed. One route reload initially left the Controller disconnected; ordinary UI Connect IP recovered it. Reconnect behavior is not qualified here. Browser logs observed by the coordinator contained only Vite debug and React information, with no warning or error during this qualification.

[The earlier checkpoint](997-qualification-checkpoint.md) records three historical Show Save failures and the shared failure-feedback repair. Those capture identities remain unchanged. The original Failed to fetch cause remains unproved; successful later delivery does not establish its cause. The Show stamp's 1970 timestamp is authored stock metadata, not the operation time.

#999 owns the separately approved activation-confirmation repair. Candidate 1 compilation and snapshot semantics are unchanged by this proof-only package. The coordinator owns final exact-tip #997 suites, serialized review and landing after this commit; no final-suite success for this proof tip is claimed here. Candidate 2 row removal waits for candidate 1 landing. No implemented label or issue closure is claimed.
