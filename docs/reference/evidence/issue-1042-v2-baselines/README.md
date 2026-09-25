# v2 baselines for #1042

This set guards #1042, the removal of v1 authoring code. It pins v2 outputs
only. The existing parity reports (`docs/plans/show-v2-parity-report.json` and
`show-v2-native-parity-report.json`) compare against the v1 stock builder and
the v1 converter, so they cannot outlive the removal.

**`baselines.json` and `runtime-frames.json` must stay byte-identical across every #1042 slice.** A slice
that changes either has changed v2 behaviour or output and does not land as a pure
removal or refactor. When #1042 closes, this directory is deleted (Jon,
2026-09-23): v2 then continues without a v1 reference.

## Corpus

- The 40 records of `STOCK_SHOWS_V2` (`src/pixelblaze/stock/showsV2.ts`), the
  native v2 stock builder.
- The 7 agent-baseline fixtures as committed v2 snapshots in `fixtures/`. They
  were generated once with `convertBaselineRecord`
  (`src/agent-harness/baseline/fixturesV2.ts`). Each snapshot carries the record
  and the personal Patterns and Libraries it needs. The check reads the JSON and
  never runs the converter.

## What is pinned per record

- `recordSha256`: SHA-256 of the record as key-sorted JSON.
- `preparation`: the `prepareShowV2ForCompile` status. All 47 records are
  `ready`; a refusal would record its issues.
- `compiled`: SHA-256 and byte length of the compiled Pattern source
  (`compileShow` over the prepared recipe, the compile step of
  `qualifyMigratedShowV2Record`).
- `pxlshowPayloadSha256`: SHA-256 of the `.pxlshow` export
  (`buildShowFileBundle` then `serializeShowFileBundle`) with fixed stamps, taken
  over the gunzipped payload so a zlib build difference cannot move it.
- `epe`: SHA-256 of the `.epe` text from `buildShowEpeExportV2`, with a fixed
  stamp and program id. It needs no network.
- `runtime`: Fast-preview frames from `createFastReplayRuntime`, using the
  settings of `scripts/show-v2-parity.ts` (8 map points, seed 1034, 16 ms
  steps). The frames are sampled at 0, 25%, 50% and 75% of Show End, then at
  Transition midpoints, up to 8 samples. The runtime advances one instance
  through the samples in order. The pinned value is the SHA-256 of the sampled
  pixel buffers.

## Runtime comparability (#1128)

`baselines.json` records the Node major that generated its runtime hashes.
`runtime-frames.json` stores each record's sampled times and pixel values so a
hash drift can identify the first changed sample and value. The check compares
runtime evidence only on that Node major. On another major, it still checks
the records and bytes outside runtime, reports why runtime was skipped, and
exits 3. Exit 0 means the full baseline matched; exit 1 means drift.

## Running it

```bash
npm run show:v2-baselines              # check (default); exit 1 drift, exit 3 partial Node-major check
npm run show:v2-baselines -- --write   # created this set; never re-pins it during #1042
npx vitest run src/engine/showV2Baselines.test.ts
```

`--write` exists to create the set. It is never used to re-pin during #1042:
the Vitest test pins the SHA-256 of `baselines.json`, `runtime-frames.json`, and each
`fixtures/*.json`, so a rewrite fails there even when the check agrees with the
rewritten file. Jon authorized the #1128 schema and frames-file digests
(2026-09-24); otherwise the set and its digests are deleted together when
#1042 closes, with Jon's say.

The Vitest test runs the same check in-process. It also statically reads the
direct imports of `scripts/show-v2-baselines.ts` and of the test itself: static,
side-effect, re-export and dynamic imports, through the `@/` alias, a `src/`
path or a relative path. It fails if either imports a v1 authoring module on
#1042's removal list, or `src/engine/showCommands` itself or anything under it
(with or without `/index`); `src/engine/showCommandsV2` stays allowed. Transitive reach through the
retained compiler (`showModel.ts`) is allowed: that is what #1042 refactors, and
these pins guard its output.
