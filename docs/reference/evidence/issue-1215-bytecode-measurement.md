# Native Show bytecode measurements (#1215)

All 45 measured native Shows fit below the historical 68,384-byte reference when counted as complete bytecode blobs. Quadrille leads both delivered source (66,223 UTF-8 bytes) and bytecode (38,122 bytes), leaving 30,262 raw reference bytes. A host run independently read back the exact Quadrille bytecode from the Controller's saved PBP, observed activation, restored the original live state and saved Pattern, and removed only the temporary Pattern. This establishes storage and activation of those bytes; firmware recompilation, VM allocation, a firmware-3.70 ceiling, visual correctness, and sustained operation were not tested.

## Revisions and inputs

Measurements completed at **2026-10-24T16:44:31.195Z**, from corpus revision **129f868bb51c8f158b1d163ec9dbc6cc16ead466**. Every row retains that `measuredBase`. Integration base and checked local main are **eaf64e12dcd3126fe3a0da792ba75f100f6c09cb** (#1216). The intervening native-input diff removes Phase only; no delivered native source dependency for the remaining measured Shows changed. Phase (`stock-show-phase`) was explicitly excluded: one excluded Show, 45 included. Its subsequent removal does not make these fresh measurements of the integration base. **#1200 Cloudburst has not landed in checked local main; its refresh remains pending for the developer.** The host-confirmed Quadrille hashes remain tied to the original measured corpus.

The canonical input is `STOCK_SHOWS_V2` in `src/pixelblaze/stock/showsV2.ts`, resolved by `showsV2Compile.ts` and the existing `compileStockShowV2` fixture. `exportShowV2ForDelivery(record, {artifact}, [])` produces the delivered EPE; `parseEpe(epe.text).src` reopens its exact hardware source. The script checks equality with the exported source and that the source ends with the compiled artifact. No stripping, rewriting, or ablation occurs. Native inputs are independent of `npm run census`, whose `showResourceCensus.test.ts` enumerates `V1_STOCK_SHOWS`; no legacy figures are joined to native code.

The private cached web compiler came from the pb32 Controller at 192.168.8.249, firmware **3.70**, 256 pixels. The developer refreshed it at 2026-10-24T16:30:17Z using `wrsp-log env ISSUE906_REFRESH=1 PIXELBLAZE_IP=192.168.8.249 npx vitest run test/perf-harness/issue906.oracle.test.ts`: six tests passed, EXIT:0. The sole cache entry, `device-compiler-73a371805212.js`, has SHA256 **73a3718052127814302cd14ad3af73217b0dea0bc150da7ae85eaad550261d9b**. The measurement script hashes the file actually chosen by the lexicographic cache loader and rejects a null compiler. The compiler implementation is private and absent from these outputs.

## Gate 1: codegen anchors

All twelve committed whole-program anchors and all four deltas agree. These are offline counts from the cached compiler, not a repeat of historical dynamic short-circuit hardware behavior. Gate 1 UTC: 2026-10-24T16:44:27.692Z. Sources: `test/perf-harness/codegen-facts.md:10–24`, `issue906.oracle.test.ts:61–142`, and [#906 completion](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/906#issuecomment-5460586105).

| Anchor | Expected words | Actual words |
| --- | --- | --- |
| empty | 37 | 37 |
| assignment | 40 | 40 |
| && | 43 | 43 |
| bitwise & | 42 | 42 |
| &#124;&#124; | 43 | 43 |
| ternary | 44 | 44 |
| if/else | 46 | 46 |
| arithmetic select | 48 | 48 |
| loop | 55 | 55 |
| unrolled x4 | 57 | 57 |
| local read | 43 | 43 |
| global read twice | 43 | 43 |

| Delta | Expected words | Actual words |
| --- | --- | --- |
| assignment | 3 | 3 |
| literal versus variable | 0 | 0 |
| 3.14159 / 2 versus literal | 2 | 2 |
| identity arithmetic | 8 | 8 |

The 256-value literal-array case emits 316 words versus 44 for `array(256)`: `(316 - 44) * 4 / 256 = 4.25 B/value`, inside the strict (3.9, 4.7) range. Exact anchor and synthetic source strings are in the JSON.

## Gate 2: complete bytecode units and corpus

`oracleWords` counts the entire program's 32-bit words. `wordBytes = 4 * oracleWords`. The existing serializer in `test/perf-harness/controllerHardware.ts:62–77` adds two little-endian uint32 header lengths and the export records. Every observed export name is ASCII; encoded-name bytes equal name length. Each export record is a four-byte global slot, name bytes, and a zero terminator. Export addresses are global slots, not function code offsets, so they cannot support function-size attribution.

For every row, `exportFramingBytes = 8 + sum(4 + encodedNameBytes + 1)` and `blobBytes = wordBytes + exportFramingBytes = headerWordBytes + headerExportBytes + 8`. This is the **complete bytecode section**, distinct from the enclosing saved PBP. The script evaluates the existing serializer unchanged and reconciles both header lengths with the serialized bytes.

The historical 68,384-byte statement-filler activation observation is likewise a complete blob count (`issue314.ts:264–276` and [#314 findings](../../plans/archive/issue-314-perf-harness-spikes.md)). The 70,475–77,111 largest-activating literal-heavy observations also count complete blobs (`issue715.hardware.test.ts:79–103` and [#715 results](../../plans/issue-715-packed-data-pricing-results.md)). Those pb32 firmware-3.67 observations varied with run/state; they establish neither a universal capacity nor today's 3.70 ceiling. `headroomBytes = 68384 - blobBytes` is a raw comparison; negative values would remain negative. A sum of headrooms across independent Shows is arithmetic only, never a pooled memory allowance.

The same-source native estimate calls `estimateShowBytecodeBytes` in `showVmResourceLedger.ts:181–241`: 20 bytes per numeric element assignment, 4.25 bytes per value in qualifying numeric table literals, ordinary source at parity, parser failure at source bytes. The estimator behavior is preserved. The resource ledger in JSON describes the compiled artifact; `nativeEstimateBytes` separately prices the complete reopened delivered source, including its provenance banner.

| Aggregate | Count / bytes |
| --- | --- |
| Shows | 45 |
| sourceBytes | 1350195 |
| nativeEstimateBytes | 1349646 |
| oracleWords | 182858 |
| wordBytes | 731432 |
| exportFramingBytes | 1723 |
| blobBytes | 733155 |
| headroomBytes | 2344125 |

### Twelve largest delivered sources

Source rank is descending UTF-8 bytes, ties by id. Quadrille is also the heaviest blob (rank 1).

| Rank | Show id | Source B | Native estimate B | Words | Blob B | Headroom B |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | stock-show-remix-quadrille | 66223 | 66223 | 9521 | 38122 | 30262 |
| 2 | stock-show-reference-property-animation | 64173 | 64173 | 8661 | 34682 | 33702 |
| 3 | stock-show-showcase-luma-sources | 53750 | 53750 | 7785 | 31178 | 37206 |
| 4 | stock-show-portable-ember-floe | 48663 | 48749 | 7091 | 28402 | 39982 |
| 5 | stock-show-installation-cloudburst | 47561 | 47561 | 8315 | 33311 | 35073 |
| 6 | stock-show-remix-overture | 47057 | 47057 | 6349 | 25434 | 42950 |
| 7 | stock-show-showcase-compositing-key-effects | 46712 | 46518 | 6047 | 24226 | 44158 |
| 8 | stock-show-106-built-from-basics | 45510 | 45510 | 6499 | 26034 | 42350 |
| 9 | stock-show-installation-after-hours | 44836 | 44836 | 8621 | 34522 | 33862 |
| 10 | stock-show-installation-black-sun | 42650 | 42650 | 5745 | 23018 | 45366 |
| 11 | stock-show-reference-shape-reveal-figures | 39337 | 39429 | 4747 | 19026 | 49358 |
| 12 | stock-show-installation-totality | 38501 | 38501 | 6122 | 24526 | 43858 |

### Complete same-unit table

The [CSV](issue-1215-bytecode-measurement.csv) contains all counts, hashes, formulas’ inputs and unrounded ratios; the [JSON](issue-1215-bytecode-measurement.json) additionally preserves exports, inventories, histograms, probes and sanitized host evidence.

| Show id | Source B | Estimate B | Words | Word B | Framing B | Blob B | Headroom B |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stock-show-remix-quadrille | 66223 | 66223 | 9521 | 38084 | 38 | 38122 | 30262 |
| stock-show-reference-property-animation | 64173 | 64173 | 8661 | 34644 | 38 | 34682 | 33702 |
| stock-show-showcase-luma-sources | 53750 | 53750 | 7785 | 31140 | 38 | 31178 | 37206 |
| stock-show-portable-ember-floe | 48663 | 48749 | 7091 | 28364 | 38 | 28402 | 39982 |
| stock-show-installation-cloudburst | 47561 | 47561 | 8315 | 33260 | 51 | 33311 | 35073 |
| stock-show-remix-overture | 47057 | 47057 | 6349 | 25396 | 38 | 25434 | 42950 |
| stock-show-showcase-compositing-key-effects | 46712 | 46518 | 6047 | 24188 | 38 | 24226 | 44158 |
| stock-show-106-built-from-basics | 45510 | 45510 | 6499 | 25996 | 38 | 26034 | 42350 |
| stock-show-installation-after-hours | 44836 | 44836 | 8621 | 34484 | 38 | 34522 | 33862 |
| stock-show-installation-black-sun | 42650 | 42650 | 5745 | 22980 | 38 | 23018 | 45366 |
| stock-show-reference-shape-reveal-figures | 39337 | 39429 | 4747 | 18988 | 38 | 19026 | 49358 |
| stock-show-installation-totality | 38501 | 38501 | 6122 | 24488 | 38 | 24526 | 43858 |
| stock-show-showcase-zone-layouts-stripes-grid | 36273 | 36079 | 4282 | 17128 | 38 | 17166 | 51218 |
| stock-show-reference-shape-reveal-transitions | 33227 | 33227 | 4303 | 17212 | 38 | 17250 | 51134 |
| stock-show-205-groups-linked-reuse | 32981 | 32981 | 4888 | 19552 | 38 | 19590 | 48794 |
| stock-show-reference-aperture-icons | 32425 | 32425 | 3321 | 13284 | 38 | 13322 | 55062 |
| stock-show-204-presentation-modes | 32178 | 32178 | 2413 | 9652 | 38 | 9690 | 58694 |
| stock-show-302-installation-composition | 31223 | 31223 | 4770 | 19080 | 38 | 19118 | 49266 |
| stock-show-showcase-transform-effects | 30724 | 30724 | 4926 | 19704 | 38 | 19742 | 48642 |
| stock-show-reference-aperture-shapes | 30285 | 30285 | 3840 | 15360 | 38 | 15398 | 52986 |
| stock-show-reference-wipe-transitions | 30265 | 30380 | 3663 | 14652 | 38 | 14690 | 53694 |
| stock-show-showcase-zone-layouts-splits | 26273 | 26079 | 2861 | 11444 | 38 | 11482 | 56902 |
| stock-show-showcase-zone-layouts-radial | 26135 | 25941 | 2868 | 11472 | 38 | 11510 | 56874 |
| stock-show-showcase-color-adjustment-effects | 26085 | 26085 | 3119 | 12476 | 38 | 12514 | 55870 |
| stock-show-reference-zoom-spin-transitions | 25205 | 25205 | 3264 | 13056 | 38 | 13094 | 55290 |
| stock-show-reference-dissolve-transitions | 24679 | 24679 | 3077 | 12308 | 38 | 12346 | 56038 |
| stock-show-202-content-clip-viewport | 23261 | 23261 | 3345 | 13380 | 38 | 13418 | 54966 |
| stock-show-showcase-redline-installation | 23219 | 23380 | 2806 | 11224 | 38 | 11262 | 57122 |
| stock-show-206-changing-zone-layouts | 21688 | 21726 | 2653 | 10612 | 38 | 10650 | 57734 |
| stock-show-102-transitions-values | 21402 | 21402 | 3102 | 12408 | 38 | 12446 | 55938 |
| stock-show-105-portable-zones | 20512 | 20512 | 2587 | 10348 | 38 | 10386 | 57998 |
| stock-show-reference-easing | 19657 | 19538 | 2241 | 8964 | 38 | 9002 | 59382 |
| stock-show-reference-blend-fade-transitions | 19542 | 19590 | 2554 | 10216 | 38 | 10254 | 58130 |
| stock-show-remix-coronal-mass-ejection | 19434 | 19434 | 3391 | 13564 | 38 | 13602 | 54782 |
| stock-show-100-getting-around | 19174 | 19174 | 2633 | 10532 | 38 | 10570 | 57814 |
| stock-show-reference-slide-transitions | 18619 | 18619 | 2468 | 9872 | 38 | 9910 | 58474 |
| stock-show-207-aperture-shapes-edges | 18167 | 18167 | 2349 | 9396 | 38 | 9434 | 58950 |
| stock-show-303-compile-simplify-deliver | 18051 | 18051 | 2476 | 9904 | 38 | 9942 | 58442 |
| stock-show-showcase-distortion-effects | 17368 | 17368 | 1779 | 7116 | 38 | 7154 | 61230 |
| stock-show-201-layers-property-animation | 17052 | 17052 | 2309 | 9236 | 38 | 9274 | 59110 |
| stock-show-203-pattern-instance-lifecycle | 15876 | 15876 | 2153 | 8612 | 38 | 8650 | 59734 |
| stock-show-301-installation-mapping | 15000 | 14806 | 1899 | 7596 | 38 | 7634 | 60750 |
| stock-show-103-clip-transform | 14938 | 14938 | 1854 | 7416 | 38 | 7454 | 60930 |
| stock-show-101-clips-cuts-blank-time | 12335 | 12335 | 1668 | 6672 | 38 | 6710 | 61674 |
| stock-show-104-effects-and-ordering | 11969 | 11969 | 1493 | 5972 | 38 | 6010 | 62374 |

Ratios use `sourceToBlob = sourceBytes / blobBytes`, `estimateToBlob = nativeEstimateBytes / blobBytes`, `blobToSource = blobBytes / sourceBytes`, and `estimateToSource = nativeEstimateBytes / sourceBytes`. Error is estimate minus actual complete blob bytes; positive means over-pricing.

| Observed metric | Minimum to maximum |
| --- | --- |
| sourceToBlob | 1.298766 (stock-show-installation-after-hours) to 3.320743 (stock-show-204-presentation-modes) |
| estimateToBlob | 1.298766 (stock-show-installation-after-hours) to 3.320743 (stock-show-204-presentation-modes) |
| blobToSource | 0.301137 (stock-show-204-presentation-modes) to 0.769962 (stock-show-installation-after-hours) |
| estimateToSource | 0.987067 (stock-show-301-installation-mapping) to 1.006934 (stock-show-showcase-redline-installation) |
| sourceParityErrorBytes | 5625.000000 (stock-show-101-clips-cuts-blank-time) to 29491.000000 (stock-show-reference-property-animation) |
| estimateErrorBytes | 5625.000000 (stock-show-101-clips-cuts-blank-time) to 29491.000000 (stock-show-reference-property-animation) |

| Ratio of corpus totals | Value |
| --- | --- |
| sourceToBlob | 1.841622849 |
| estimateToBlob | 1.840874031 |
| blobToSource | 0.542999345 |
| estimateToSource | 0.999593392 |

`sourceParityErrorBytes`: 45 over-priced, 0 under-priced, 0 exact.

`estimateErrorBytes`: 45 over-priced, 0 under-priced, 0 exact.

These corpus observations do not choose a replacement pricing formula. Ordinary-code parity, literal tables, per-element initialization, and dynamic routing have different empirical relationships; unmeasured forms remain unsupported.

## Gate 3: source forms and whole-program words

The final-source inventory (`showCompiler.ts`, `showSourceInventory.ts:55–177`) assigns delivered source bytes by emission category. Ember & Floe is the selected table-bearing, routing-heavy case (23,339 routing/render-plan source bytes); Quadrille is the overall leader, property-animation exercises animation routing, and luma-sources exercises substantial member Pattern code. Numeric table effects are independently isolated by the probes below. Source allocation and whole-program instruction/literal histograms are different accounting views, not additive bytecode costs per source form.

| Source category (UTF-8 B) | Quadrille | Ember & Floe | Property Animation | Luma Sources |
| --- | --- | --- | --- | --- |
| effects-transitions | 2335 | 1068 | 1139 | 312 |
| exports | 78 | 78 | 78 | 78 |
| pattern | 38471 | 19222 | 34260 | 41231 |
| provenance | 3132 | 1741 | 3254 | 1980 |
| remainder | 2095 | 818 | 1839 | 3541 |
| routing-render-plans | 17666 | 23339 | 19260 | 5384 |
| runtime-scheduler | 2446 | 2397 | 4343 | 1224 |

| Whole-program view | Quadrille | Ember & Floe | Property Animation | Luma Sources |
| --- | --- | --- | --- | --- |
| totalWords | 9521 | 7091 | 8661 | 7785 |
| instructionWords | 7339 | 5207 | 7191 | 6229 |
| literalWords | 2182 | 1884 | 1470 | 1556 |

The oracle classifies odd words as instruction words and even words as literal words; the low opcode byte supplies its histogram (`bytecodeOracle.ts:77–131`). Full per-opcode totals for every Show are in JSON. No function slicing or attribution is inferred.

| Synthetic form | Source B | Baseline blob B | Blob B | Word delta | Blob delta B |
| --- | --- | --- | --- | --- | --- |
| ordinary assignment | 180 | 196 | 208 | 3 | 12 |
| literal table 16 | 293 | 212 | 280 | 17 | 68 |
| element assignment table 16 | 419 | 212 | 532 | 80 | 320 |
| dynamic table routing 16 | 296 | 280 | 288 | 2 | 8 |
| literal table 256 | 1974 | 212 | 1300 | 272 | 1088 |
| element assignment table 256 | 4177 | 212 | 5332 | 1280 | 5120 |
| dynamic table routing 256 | 1977 | 1300 | 1308 | 2 | 8 |
| dynamic branch routing | 202 | 196 | 228 | 8 | 32 |

Every probe includes the complete baseline measurement, source string and export framing in JSON. All eight probes have 36 framing bytes in both compared programs. Ordinary assignment adds 3 words / 12 bytes. Literal tables add 68/16 = 4.25 and 1088/256 = 4.25 bytes per value over allocated-array baselines. Per-element assignment adds 320/16 = 20 and 5120/256 = 20 bytes per value. Dynamic indexing adds 2 words / 8 bytes to either table size; the branch adds 8 words / 32 bytes over direct assignment. These are local deltas for these exact shapes. The full-source/blob ratio across the probes spans 0.783383–1.518462 because source spelling, declarations and framing remain present; it must not be mistaken for a universal per-value price.

## Gate 4: host storage and activation confirmation

The sanitized primary record is the JSON's `hostConfirmation` object, copied from the developer's completed host run: **HOST_CONFIRMATION_PASS**, **2026-10-24T17:32:16.723Z–17:32:29.793Z**. A read-only host preflight passed first. Both host commands exited 0:

```sh
wrsp-log env PIXELBLAZE_IP=192.168.8.249 node node_modules/tsx/dist/cli.mjs .wrsp/1215/confirm-largest.ts --preflight
wrsp-log env PIXELBLAZE_IP=192.168.8.249 node node_modules/tsx/dist/cli.mjs .wrsp/1215/confirm-largest.ts --confirm
```

The selected case is `stock-show-remix-quadrille`, source rank 1 and blob rank 1. Its source SHA256 is `74f6cd0fe35f4ce9879a56e2051a01ca62849dc28b454be557bd91761a7b3477`; complete blob SHA256 is `d41760b5e0955556cf134fcc00a9c94b6c9a772e417f533b221cd537bf2f260a`. The host saved new temporary id `pxbs6YNngDLJuYMT3`, independently fetched HTTP `/p/{id}`, decoded the returned PBP, and compared every byte of its complete 38,122-byte bytecode section: equality, tolerance 0. The enclosing returned PBP was 55,669 bytes with bytecode offset 59. Explicit `setActiveProgram(id, false)` then produced the observed temporary active id. `encodePbp`/`decodePbp` own the format (`src/engine/pbpEncode.ts:54–85,114–140`); PBP header offsets 20/24 identify section offset/length. This counts device-returned storage, not a remembered push-buffer length.

Fresh original state was WavyBands (`pxb9zpbqKGMAbtw7J`), pb32 / 3.70 / 256, controls `{}`, brightness 0.265, sequencerMode 0, runSequencer false. The original was present in saved inventory and its complete PBP was privately backed up before mutation. The host restored the original selection and complete projected live state before cleanup, verified the original saved PBP SHA256 `29b2baea2194d88044b791ce25a3e59ef8fecb4a251f515027d86900bdb6f7a9` by independent read-back, then deleted only the newly created temporary id and verified its absence. `restorationVerified` and `cleanupVerified` are true; `sequencerViolation` is false. Sequencer state remained off at every fresh observation; no sequencer setter was invented or sent. Original source and PBP bytes remain private.

This confirms storage and observed activation of bytes compiled by the Controller's cached web compiler. It does not measure firmware-side recompilation, allocated VM memory, activation capacity, rendered appearance, frame rate, or long-running stability. The sandbox performed no LAN I/O in this finalization; earlier sandbox EHOSTUNREACH results were access limitations, not host-unreachable verdicts.

## Reproduction appendix

Use the exact measured revision `129f868bb51c8f158b1d163ec9dbc6cc16ead466` in a separate, provisioned checkout with its locked dependencies. Obtain the Controller compiler privately through the existing cache-refresh command above, then require the recorded SHA256. Do not publish the compiler implementation. Recreate `.wrsp/1215/measure.ts`, `.wrsp/1215/measurement.test.ts`, and `.wrsp/1215/vitest.config.ts` exactly as below and run:

```sh
mkdir -p .wrsp/1215
wrsp-log npx vitest run --config .wrsp/1215/vitest.config.ts
```

The original focused measurement run passed one test in one file, EXIT:0 (4.59 s). Direct `tsx` failed with `ReferenceError: __dirname is not defined in ES module scope` in `bytecodeOracle.ts`. Running the same scratch script through Vitest's module transform with the configuration below succeeded without editing the oracle or moving its cache. This is the successful ESM workaround, not an alternative compiler.

The script is intentionally pinned to the original 46-entry catalogue and excludes Phase before measuring 45 Shows. On the later Phase-removal revision its one-exclusion assertion will fail; reproduce on the measured revision rather than relabeling old counts. The recorded integration diff establishes continuing applicability to the 45 remaining Shows. A future Cloudburst refresh must use the actual new HEAD, account for already-removed Phase, keep the same compiler identity, and retain this earlier provenance and host-confirmed hashes until equality is checked.

### `measure.ts`

```typescript
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cachedCompilerEnvironmentPath, loadCachedWordCompiler, summarizeWords } from '../../test/perf-harness/bytecodeOracle'
import { runInNewContext } from 'node:vm'
import { transpileModule } from 'typescript'
import { STOCK_SHOWS_V2 } from '../../src/pixelblaze/stock/showsV2'
import { compileStockShowV2 } from '../../test/perf-harness/showV2Fixture'
import { exportShowV2ForDelivery } from '../../src/engine/showV2ControllerDelivery'
import { parseEpe } from '../../src/engine/epeImport'
import { estimateShowBytecodeBytes } from '../../src/engine/showVmResourceLedger'
import { buildDeliveredShowSourceInventory } from '../../src/engine/showSourceInventory'

const path = cachedCompilerEnvironmentPath()
if (!path) throw Error('No compiler cache')
const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
if (hash !== '73a3718052127814302cd14ad3af73217b0dea0bc150da7ae85eaad550261d9b') throw Error('Unexpected cache identity')
const compile = loadCachedWordCompiler()
if (!compile) throw Error('Null compiler')
const pattern = (body: string) => ['var a = 0','var b = 0.25','var c = 0.5','var d = 0.75','var k = 1','var n = 4','var i = 0',`export function beforeRender(delta) {\n${body}\n}`,'export function render(index) { hsv(0, 0, 0) }'].join('\n')
const inputs: [string,string,number][] = [
 ['empty','  ',37],['assignment','  a = b',40],['&&','  a = b && c',43],['bitwise &','  a = b & c',42],['||','  a = b || c',43],['ternary','  a = k ? b : c',44],['if/else','  if (k) { a = b } else { a = c }',46],['arithmetic select','  a = k * b + (1 - k) * c',48],['loop','  for (i = 0; i < n; i = i + 1) { a = a + 1 }',55],['unrolled x4','  a = a + 1\n  a = a + 1\n  a = a + 1\n  a = a + 1',57],['local read','  var l = b\n  a = l',43],['global read twice','  a = b\n  c = b',43],
]
const anchors = inputs.map(([name,body,expected]) => {const source = pattern(body); const actual = compile(source).words.length; return {name,source,expected,actual,pass:actual===expected}})
const words = (body: string) => compile(pattern(body)).words.length
const deltas = [
 {name:'assignment',expected:3,actual:words('  a = b\n  c = d')-words('  a = b')},
 {name:'literal versus variable',expected:0,actual:words('  a = 0.5')-words('  a = b')},
 {name:'3.14159 / 2 versus literal',expected:2,actual:words('  a = 3.14159 / 2')-words('  a = 0.5')},
 {name:'identity arithmetic',expected:8,actual:words('  a = b * (1) + a * (1 - (1))')-words('  a = b')},
].map(row=>({...row,pass:row.expected===row.actual}))
const values = Array.from({length:256},(_,i)=>(i%32)/32)
const literalSource = `var t = [${values.join(',')}]\n${pattern('  a = b')}`
const allocatedSource = `var t = array(256)\n${pattern('  a = b')}`
const literalWords = compile(literalSource).words.length
const allocatedWords = compile(allocatedSource).words.length
const density = (literalWords-allocatedWords)*4/256
const result = {utc:new Date().toISOString(),measuredBase:'129f868bb51c8f158b1d163ec9dbc6cc16ead466',firmware:'3.70',compiler:{path,sha256:hash,nonNull:true},anchors,deltas,array:{literalSource,allocatedSource,literalWords,allocatedWords,density,expected:'strictly >3.9 and <4.7 B/value',pass:density>3.9&&density<4.7},pass:anchors.every(r=>r.pass)&&deltas.every(r=>r.pass)&&density>3.9&&density<4.7}
writeFileSync('.wrsp/1215/gate1.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
if (!result.pass) throw Error('STOP: changed #906 fact')

// Evaluate the existing serializer unchanged; it is private to controllerHardware.ts.
const hardwareText = readFileSync('test/perf-harness/controllerHardware.ts','utf8')
const serializerText = hardwareText.slice(hardwareText.indexOf('function buildBytecode('), hardwareText.indexOf('\nexport async function fetchControllerCompilerEnvironment'))
const serializer = runInNewContext(transpileModule(serializerText+'\nbuildBytecode',{}).outputText) as (p: {compiled:number[],exports:{name:string,address:number}[]})=>Uint8Array
const sha = (data: string|Uint8Array) => createHash('sha256').update(data).digest('hex')
function measure(source: string) {
 const p = compile!(source)
 const blob = serializer({compiled:p.words,exports:p.exports})
 const header = new DataView(blob.buffer,blob.byteOffset,blob.byteLength)
 const wordBytes = p.words.length*4
 const exportFramingBytes = 8+p.exports.reduce((sum,e)=>sum+4+Buffer.byteLength(e.name,'utf8')+1,0)
 if(header.getUint32(0,true)!==wordBytes || header.getUint32(4,true)+8!==exportFramingBytes || wordBytes+exportFramingBytes!==blob.length) throw Error('Blob reconciliation failed')
 return {sourceBytes:Buffer.byteLength(source),sourceSha256:sha(source),nativeEstimateBytes:estimateShowBytecodeBytes(source),oracleWords:p.words.length,wordBytes,exportFramingBytes,headerWordBytes:header.getUint32(0,true),headerExportBytes:header.getUint32(4,true),blobBytes:blob.length,blobSha256:sha(blob),exports:p.exports,histogram:summarizeWords(p.words),blob}
}
const excluded = STOCK_SHOWS_V2.filter(r=>/phase/i.test(r.id))
if(excluded.length!==1) throw Error('Phase exclusion count')
const rows = STOCK_SHOWS_V2.filter(r=>!excluded.includes(r)).map(record=>{
 const artifact = compileStockShowV2(record.id,{})
 const epe = exportShowV2ForDelivery(record,{artifact},[])
 if(!epe) throw Error('Export refused '+record.id)
 const source = parseEpe(epe.text).src
 if(source!==epe.source || !source.endsWith(artifact.code)) throw Error('Reopen mismatch')
 const {blob,...m} = measure(source)
 const inventory = buildDeliveredShowSourceInventory(artifact.summary.sourceInventory,artifact.code,source)
 const categories:Record<string,number> = {}
 for(const chunk of inventory.chunks) categories[chunk.category]=(categories[chunk.category]??0)+chunk.bytes
 const row = {id:record.id,name:record.name,measuredBase:result.measuredBase,inputPath:'exportShowV2ForDelivery(record, {artifact: compileStockShowV2(id,{})}, []).text -> parseEpe(text).src',estimator:'src/engine/showVmResourceLedger.ts:estimateShowBytecodeBytes; same delivered source',...m,sourceToBlob:m.sourceBytes/m.blobBytes,estimateToBlob:m.nativeEstimateBytes/m.blobBytes,blobToSource:m.blobBytes/m.sourceBytes,estimateToSource:m.nativeEstimateBytes/m.sourceBytes,headroomBytes:68384-m.blobBytes,estimateErrorBytes:m.nativeEstimateBytes-m.blobBytes,sourceParityErrorBytes:m.sourceBytes-m.blobBytes,categories,resourceLedger:artifact.summary.resources}
 writeFileSync(`.wrsp/1215/${record.id}.epe`,epe.text)
 writeFileSync(`.wrsp/1215/${record.id}.blob`,blob)
 console.log(record.id,row.sourceBytes,row.blobBytes)
 return row
}).sort((a,b)=>b.sourceBytes-a.sourceBytes||a.id.localeCompare(b.id))
const probes:any[]=[]
const recordProbe=(name:string,source:string,baseline:string)=>{
 const {blob,...m}=measure(source); const {blob:baseBlob,...base}=measure(baseline)
 probes.push({name,source,baseline,...m,baselineMeasurement:base,wordDelta:m.oracleWords-base.oracleWords,blobDelta:m.blobBytes-base.blobBytes})
}
recordProbe('ordinary assignment',pattern('  a = b\n  c = d'),pattern('  a = b'))
for(const n of [16,256]) {
 const values=Array.from({length:n},(_,i)=>(i%32)/32)
 const baseline=`var t = array(${n})\n${pattern('  a = b')}`
 recordProbe(`literal table ${n}`,`var t = [${values.join(',')}]\n${pattern('  a = b')}`,baseline)
 recordProbe(`element assignment table ${n}`,`var t = array(${n})\n${values.map((v,i)=>`t[${i}] = ${v}`).join('\n')}\n${pattern('  a = b')}`,baseline)
 recordProbe(`dynamic table routing ${n}`,`var t = [${values.join(',')}]\n${pattern('  a = t[i]')}`,`var t = [${values.join(',')}]\n${pattern('  a = b')}`)
}
recordProbe('dynamic branch routing',pattern('  if (i < n) { a = b } else { a = c }'),pattern('  a = b'))
const totals = Object.fromEntries(['sourceBytes','nativeEstimateBytes','oracleWords','wordBytes','exportFramingBytes','blobBytes','headroomBytes'].map(k=>[k,rows.reduce((sum,r)=>sum+(r as any)[k],0)]))
const output={utc:new Date().toISOString(),measuredBase:result.measuredBase,gate1:result,excluded:{count:excluded.length,ids:excluded.map(r=>r.id),reason:'Phase cancelled; #1216 owns removal'},count:rows.length,rows,totals,probes,hostConfirmation:{status:'pending',selectedId:rows[0].id,sourceRank:1,blobRank:[...rows].sort((a,b)=>b.blobBytes-a.blobBytes||a.id.localeCompare(b.id)).findIndex(r=>r.id===rows[0].id)+1}}
writeFileSync('.wrsp/1215/measurements.json',JSON.stringify(output,null,2)+'\n')
console.log('CORPUS COMPLETE',rows.length,JSON.stringify(totals),JSON.stringify(output.hostConfirmation))
```

### `measurement.test.ts`

```typescript
import { test } from 'vitest'
test('offline measurement gate', async () => { await import('./measure') })
```

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({ resolve: { alias: { '@': new URL('../../src', import.meta.url).pathname } }, test: { include: ['.wrsp/1215/measurement.test.ts'], maxWorkers: 1, testTimeout: 120000 } })
```
